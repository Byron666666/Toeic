(() => {
  "use strict";

  const firebaseConfig = {
    apiKey: "AIzaSyBs0Ki3aNMxcPQvqegEE44HXbajkq2YS5Y",
    authDomain: "flipwords-toeic.firebaseapp.com",
    projectId: "flipwords-toeic",
    storageBucket: "flipwords-toeic.firebasestorage.app",
    messagingSenderId: "637551440168",
    appId: "1:637551440168:web:e3d4248935083e050fe01d",
    measurementId: "G-PJS6Q21SFT",
  };

  const APP_DOCUMENT_ID = "flipwords-toeic";
  const SYNC_SCHEMA_VERSION = 1;
  const signInButton = document.querySelector("#googleSignInButton");
  const signOutButton = document.querySelector("#googleSignOutButton");
  const accountView = document.querySelector("#signedInAccount");
  const accountAvatar = document.querySelector("#accountAvatar");
  const accountName = document.querySelector("#accountName");
  const syncStatus = document.querySelector("#cloudSyncStatus");

  if (!window.firebase || !signInButton || !signOutButton || !accountView || !syncStatus
    || typeof cards === "undefined") {
    console.warn("Firebase sync could not start because required scripts or page elements are missing.");
    return;
  }

  if (!window.FlipWordsCloudSync || typeof window.FlipWordsCloudSync.create !== "function") {
    console.warn("Firebase sync could not start because cloud-sync-core.js is missing.");
    syncStatus.textContent = "同步程式載入失敗，請重新整理";
    syncStatus.dataset.state = "error";
    return;
  }

  const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebaseApp.auth();
  const db = firebaseApp.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  let currentUser = null;
  let suppressCloudSave = false;

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
    console.warn("Could not enable persistent Firebase login.", error);
  });

  function setSyncStatus(message, state = "idle") {
    syncStatus.textContent = message;
    syncStatus.dataset.state = state;
  }

  function describeError(error) {
    const code = String(error?.code || error?.message || "");
    if (code.includes("cloud-document-too-large")) return "資料過大，請先匯出備份";
    if (code.includes("unauthorized-domain")) return "目前網站網域尚未加入 Firebase 授權網域。";
    if (code.includes("popup-blocked")) return "Google 登入視窗被瀏覽器阻擋，請允許彈出視窗。";
    if (code.includes("permission-denied")) return "Firestore 拒絕存取，請檢查 Firebase 權限設定。";
    if (code.includes("failed-precondition") || code.includes("not-found")) {
      return "Firebase Firestore 尚未完成設定。";
    }
    if (code.includes("network") || code.includes("offline") || navigator.onLine === false) {
      return "目前離線，雲端進度會在恢復連線後重試。";
    }
    return "雲端同步暫時失敗，請稍後再試。";
  }

  function getUserDocument(user) {
    return db.collection("users").doc(user.uid).collection("apps").doc(APP_DOCUMENT_ID);
  }

  function safeStorageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function isDailyStateKey(key) {
    return /^flipwords\.ui\.\d{4}-\d{2}-\d{2}$/.test(String(key));
  }

  function normalizePreferences(value) {
    const preferences = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return preferences;

    if (typeof value.theme === "string") preferences.theme = value.theme;
    if (typeof value.sound === "string") preferences.sound = value.sound;
    if (typeof value.dailyStateKey === "string" && isDailyStateKey(value.dailyStateKey)) {
      preferences.dailyStateKey = value.dailyStateKey;
      if (value.dailyState && typeof value.dailyState === "object" && !Array.isArray(value.dailyState)) {
        preferences.dailyState = { ...value.dailyState };
      }
    }
    return preferences;
  }

  function getDailyState() {
    const key = `flipwords.ui.${new Date().toISOString().slice(0, 10)}`;
    try {
      const value = JSON.parse(safeStorageGet(key) || "null");
      return {
        key,
        value: value && typeof value === "object" && !Array.isArray(value)
          ? { ...value }
          : { xp: 0, combo: 0 },
      };
    } catch {
      return { key, value: { xp: 0, combo: 0 } };
    }
  }

  const builtInIds = new Set(builtInCards.map((card) => String(card.id)));
  const builtInKeys = new Set(builtInCards.map((card) => cardKey(card)));

  function normalizeProgress(value) {
    const progress = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return progress;
    Object.entries(value).forEach(([id, status]) => {
      const normalizedId = String(id);
      if (builtInIds.has(normalizedId) && (status === "review" || status === "learned")) {
        progress[normalizedId] = status;
      }
    });
    return progress;
  }

  function normalizeDeletedBuiltIn(value) {
    const deletedBuiltInById = {};
    if (Array.isArray(value)) {
      value.forEach((id) => {
        const normalizedId = String(id);
        if (builtInIds.has(normalizedId)) deletedBuiltInById[normalizedId] = true;
      });
      return deletedBuiltInById;
    }
    if (!value || typeof value !== "object") return deletedBuiltInById;
    Object.entries(value).forEach(([id, deleted]) => {
      const normalizedId = String(id);
      if (builtInIds.has(normalizedId) && deleted === true) deletedBuiltInById[normalizedId] = true;
    });
    return deletedBuiltInById;
  }

  function normalizeCustomCards(value) {
    const customCardsById = {};
    const entries = Array.isArray(value)
      ? value.map((card, index) => [String(card?.id || `cloud-${index}`), card])
      : value && typeof value === "object"
        ? Object.entries(value)
        : [];

    entries.forEach(([entryId, rawCard], index) => {
      if (!rawCard || typeof rawCard !== "object" || Array.isArray(rawCard)) return;
      const candidate = { ...rawCard, id: String(rawCard.id || entryId) };
      const card = sanitizeCard(candidate, `cloud-${index}`);
      if (!card || builtInIds.has(card.id) || builtInKeys.has(cardKey(card))
        || DEMO_CARD_IDS.has(card.id)) return;
      customCardsById[card.id] = { ...card };
    });
    return customCardsById;
  }

  function normalizeState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      progress: normalizeProgress(source.progress),
      deletedBuiltInById: normalizeDeletedBuiltIn(source.deletedBuiltInById ?? source.deletedBuiltInIds),
      customCardsById: normalizeCustomCards(source.customCardsById ?? source.customCards),
      preferences: normalizePreferences(source.preferences),
    };
  }

  function readLocal() {
    const byId = new Map(cards.map((card) => [String(card.id), card]));
    const byKey = new Map(cards.map((card) => [cardKey(card), card]));
    const progress = {};
    const deletedBuiltInById = {};

    builtInCards.forEach((builtInCard) => {
      const id = String(builtInCard.id);
      const savedCard = byId.get(id) || byKey.get(cardKey(builtInCard));
      if (!savedCard) {
        deletedBuiltInById[id] = true;
      } else if (savedCard.review) {
        progress[id] = "review";
      } else if (savedCard.learned) {
        progress[id] = "learned";
      }
    });

    const customCardsById = {};
    cards.forEach((card) => {
      if (DEMO_CARD_IDS.has(card.id) || builtInIds.has(String(card.id))
        || builtInKeys.has(cardKey(card))) return;
      const sanitized = sanitizeCard(card, String(card.id));
      if (sanitized) customCardsById[sanitized.id] = { ...sanitized };
    });

    const dailyState = getDailyState();
    return normalizeState({
      progress,
      deletedBuiltInById,
      customCardsById,
      preferences: {
        theme: safeStorageGet("flipwords.theme") || "sakura",
        sound: safeStorageGet("flipwords.sound") || "on",
        dailyStateKey: dailyState.key,
        dailyState: dailyState.value,
      },
    });
  }

  function fromCloud(snapshotData) {
    return normalizeState(snapshotData);
  }

  function toCloud(state) {
    const normalized = normalizeState(state);
    return {
      schemaVersion: SYNC_SCHEMA_VERSION,
      libraryVersion: BUILT_IN_LIBRARY_VERSION,
      progress: normalized.progress,
      deletedBuiltInIds: Object.keys(normalized.deletedBuiltInById)
        .filter((id) => normalized.deletedBuiltInById[id] === true),
      customCards: Object.values(normalized.customCardsById),
      preferences: normalized.preferences,
    };
  }

  function applyLocal(state) {
    const normalized = normalizeState(state);
    const previousCard = typeof getCurrentCard === "function" ? getCurrentCard() : null;
    const previousCardId = previousCard?.id ? String(previousCard.id) : "";
    const previousCardKey = previousCard ? cardKey(previousCard) : "";
    const previousPile = ["unlearned", "review", "learned"].includes(activePile)
      ? activePile : "unlearned";
    const previousFlipped = Boolean(isFlipped);
    const restoredBuiltInCards = cloneCards(builtInCards)
      .filter((card) => normalized.deletedBuiltInById[String(card.id)] !== true)
      .map((card) => {
        const status = normalized.progress[String(card.id)];
        return {
          ...card,
          review: status === "review",
          learned: status === "learned",
        };
      });
    const restoredCustomCards = Object.values(normalized.customCardsById)
      .map((card, index) => sanitizeCard(card, `cloud-${index}`))
      .filter(Boolean);

    suppressCloudSave = true;
    try {
      cards = [...restoredBuiltInCards, ...restoredCustomCards];
      activePile = previousPile;
      currentIndex = 0;
      isFlipped = previousFlipped;
      localStorage.setItem(LIBRARY_VERSION_KEY, BUILT_IN_LIBRARY_VERSION);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
      const preferences = normalized.preferences;
      localStorage.setItem("flipwords.theme", typeof preferences.theme === "string" ? preferences.theme : "sakura");
      localStorage.setItem("flipwords.sound", typeof preferences.sound === "string" ? preferences.sound : "on");
      const todayKey = `flipwords.ui.${new Date().toISOString().slice(0, 10)}`;
      const dailyState = preferences.dailyStateKey === todayKey
        && preferences.dailyState && typeof preferences.dailyState === "object"
        ? preferences.dailyState : { xp: 0, combo: 0 };
      localStorage.setItem(todayKey, JSON.stringify(dailyState));
      if (typeof preferences.dailyStateKey === "string" && isDailyStateKey(preferences.dailyStateKey)
        && preferences.dailyStateKey !== todayKey && preferences.dailyState
        && typeof preferences.dailyState === "object") {
        localStorage.setItem(preferences.dailyStateKey, JSON.stringify(preferences.dailyState));
      }
      render();

      if (previousCardId || previousCardKey) {
        const nextIndex = filteredCards.findIndex((card) =>
          (previousCardId && String(card.id) === previousCardId)
          || (previousCardKey && cardKey(card) === previousCardKey));
        if (nextIndex >= 0) {
          currentIndex = nextIndex;
          render();
        }
      }
    } finally {
      suppressCloudSave = false;
    }

    if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent("flipwords:cloud-applied", {
        detail: { scope: "toeic" },
      }));
    }
  }

  const cloudSync = window.FlipWordsCloudSync.create({
    db,
    getDocument: (user) => getUserDocument(user),
    storagePrefix: "flipwords-toeic",
    readLocal,
    applyLocal,
    fromCloud,
    toCloud,
    setStatus: setSyncStatus,
    describeError,
    maxBytes: 900000,
  });

  function renderAccount(user) {
    const signedIn = Boolean(user);
    signInButton.hidden = signedIn;
    accountView.hidden = !signedIn;

    if (!signedIn) {
      accountAvatar.removeAttribute("src");
      accountName.textContent = "";
      setSyncStatus("本機儲存", "local");
      return;
    }

    accountName.textContent = user.displayName || user.email || "Google 使用者";
    if (user.photoURL) accountAvatar.src = user.photoURL;
    else accountAvatar.removeAttribute("src");
  }

  async function signInWithGoogle() {
    signInButton.disabled = true;
    setSyncStatus("正在開啟 Google 登入…", "syncing");
    try {
      await auth.signInWithPopup(provider);
    } catch (error) {
      if (error?.code === "auth/popup-blocked") {
        await auth.signInWithRedirect(provider);
        return;
      }
      console.error("Google sign-in failed.", error);
      setSyncStatus(describeError(error), "error");
    } finally {
      signInButton.disabled = false;
    }
  }

  async function flushWithTimeout() {
    let timeoutId = 0;
    const timeout = new Promise((resolve) => {
      timeoutId = window.setTimeout(() => resolve(false), 10000);
    });
    try {
      return await Promise.race([Promise.resolve().then(() => cloudSync.flush()), timeout]);
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function signOutFromGoogle() {
    signOutButton.disabled = true;
    try {
      const flushed = await flushWithTimeout();
      if (!flushed) {
        setSyncStatus("尚有進度尚未同步，請保持登入後再試。", "error");
        return;
      }
      await auth.signOut();
    } catch (error) {
      console.error("Sign-out failed.", error);
      setSyncStatus(describeError(error), "error");
    } finally {
      signOutButton.disabled = false;
    }
  }

  const originalSaveCards = saveCards;
  saveCards = function saveCardsWithCloudSync(...args) {
    const before = safeStorageGet(STORAGE_KEY);
    const result = originalSaveCards(...args);
    const after = safeStorageGet(STORAGE_KEY);
    if (!suppressCloudSave && before !== after) cloudSync.changed();
    return result;
  };

  window.addEventListener("flipwords:local-change", (event) => {
    if (event.detail?.scope === "toeic") cloudSync.changed();
  });
  signInButton.addEventListener("click", signInWithGoogle);
  signOutButton.addEventListener("click", signOutFromGoogle);

  auth.getRedirectResult().catch((error) => {
    console.error("Google redirect sign-in failed.", error);
    setSyncStatus(describeError(error), "error");
  });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    renderAccount(user);
    try {
      await cloudSync.start(user);
    } catch (error) {
      console.error("Could not start FlipWords cloud sync.", error);
      setSyncStatus(describeError(error), "error");
    }
  });
})();
