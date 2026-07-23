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
  const SAVE_DELAY_MS = 1200;
  const MAX_DOCUMENT_BYTES = 900_000;
  const LOCAL_UPDATED_KEY = `flipwords.${STORAGE_SCOPE}.cloudLocalUpdatedAt.v1`;

  const signInButton = document.querySelector("#googleSignInButton");
  const signOutButton = document.querySelector("#googleSignOutButton");
  const accountView = document.querySelector("#signedInAccount");
  const accountAvatar = document.querySelector("#accountAvatar");
  const accountName = document.querySelector("#accountName");
  const syncStatus = document.querySelector("#cloudSyncStatus");
  const themeSelect = document.querySelector("#themeSelect");
  const soundToggle = document.querySelector("#soundToggle");
  const flashcard = document.querySelector("#flashcard");

  if (!window.firebase || !signInButton || typeof cards === "undefined") {
    console.warn("Firebase sync could not start because required scripts or page elements are missing.");
    return;
  }

  const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebaseApp.auth();
  const db = firebaseApp.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  let currentUser = null;
  let saveTimer = 0;
  let suppressCloudSave = false;
  let syncInProgress = false;

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
    console.warn("Could not enable persistent Firebase login.", error);
  });

  function setSyncStatus(message, state = "idle") {
    syncStatus.textContent = message;
    syncStatus.dataset.state = state;
  }

  function getLocalUpdatedAt() {
    return Number(localStorage.getItem(LOCAL_UPDATED_KEY) || 0);
  }

  function markLocalChanged(timestamp = Date.now()) {
    localStorage.setItem(LOCAL_UPDATED_KEY, String(timestamp));
    return timestamp;
  }

  function getDailyState() {
    const key = `flipwords.ui.${new Date().toISOString().slice(0, 10)}`;
    try {
      return {
        key,
        value: JSON.parse(localStorage.getItem(key) || '{"xp":0,"combo":0}'),
      };
    } catch (error) {
      return { key, value: { xp: 0, combo: 0 } };
    }
  }

  function createCloudSnapshot() {
    const cardsById = new Map(cards.map((card) => [card.id, card]));
    const cardsByKey = new Map(cards.map((card) => [cardKey(card), card]));
    const builtInIds = new Set(builtInCards.map((card) => card.id));
    const builtInKeys = new Set(builtInCards.map(cardKey));
    const progress = {};
    const deletedBuiltInIds = [];

    builtInCards.forEach((builtInCard) => {
      const savedCard = cardsById.get(builtInCard.id) || cardsByKey.get(cardKey(builtInCard));
      if (!savedCard) {
        deletedBuiltInIds.push(builtInCard.id);
        return;
      }

      if (savedCard.review) {
        progress[builtInCard.id] = "review";
      } else if (savedCard.learned) {
        progress[builtInCard.id] = "learned";
      }
    });

    const customCards = cards
      .filter(
        (card) =>
          !DEMO_CARD_IDS.has(card.id) &&
          !builtInIds.has(card.id) &&
          !builtInKeys.has(cardKey(card)),
      )
      .map((card) => ({ ...card }));

    const dailyState = getDailyState();
    const updatedAtMs = Date.now();

    return {
      schemaVersion: SYNC_SCHEMA_VERSION,
      libraryVersion: BUILT_IN_LIBRARY_VERSION,
      progress,
      deletedBuiltInIds,
      customCards,
      preferences: {
        theme: localStorage.getItem("flipwords.theme") || "sakura",
        sound: localStorage.getItem("flipwords.sound") || "on",
        dailyStateKey: dailyState.key,
        dailyState: dailyState.value,
      },
      updatedAtMs,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  function applyCloudSnapshot(snapshot) {
    suppressCloudSave = true;

    try {
      const deletedIds = new Set(
        Array.isArray(snapshot.deletedBuiltInIds) ? snapshot.deletedBuiltInIds.map(String) : [],
      );
      const progress = snapshot.progress && typeof snapshot.progress === "object" ? snapshot.progress : {};

      const restoredBuiltInCards = cloneCards(builtInCards)
        .filter((card) => !deletedIds.has(card.id))
        .map((card) => {
          const state = progress[card.id];
          return {
            ...card,
            review: state === "review",
            learned: state === "learned",
          };
        });

      const restoredCustomCards = (Array.isArray(snapshot.customCards) ? snapshot.customCards : [])
        .map((card, index) => sanitizeCard(card, `cloud-${index}`))
        .filter(Boolean);

      cards = [...restoredBuiltInCards, ...restoredCustomCards];
      activePile = "unlearned";
      currentIndex = 0;
      isFlipped = false;

      localStorage.setItem(LIBRARY_VERSION_KEY, BUILT_IN_LIBRARY_VERSION);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));

      const preferences = snapshot.preferences || {};
      if (typeof preferences.theme === "string") {
        localStorage.setItem("flipwords.theme", preferences.theme);
      }
      if (typeof preferences.sound === "string") {
        localStorage.setItem("flipwords.sound", preferences.sound);
      }
      if (typeof preferences.dailyStateKey === "string" && preferences.dailyState) {
        localStorage.setItem(preferences.dailyStateKey, JSON.stringify(preferences.dailyState));
      }

      markLocalChanged(Number(snapshot.updatedAtMs || Date.now()));
      render();
    } finally {
      suppressCloudSave = false;
    }
  }

  function getUserDocument(user = currentUser) {
    return db.collection("users").doc(user.uid).collection("apps").doc(APP_DOCUMENT_ID);
  }

  function humanizeFirebaseError(error) {
    const code = String(error?.code || "");
    if (code.includes("unauthorized-domain")) {
      return "請先把 byron666666.github.io 加入 Firebase 授權網域";
    }
    if (code.includes("popup-blocked")) {
      return "瀏覽器封鎖了登入視窗";
    }
    if (code.includes("permission-denied")) {
      return "Firestore 規則尚未允許此帳號存取";
    }
    if (code.includes("failed-precondition") || code.includes("not-found")) {
      return "請先在 Firebase 建立 Firestore 資料庫";
    }
    if (code.includes("network-request-failed") || !navigator.onLine) {
      return "目前離線，進度仍保存在這台裝置";
    }
    return "雲端同步暫時無法使用";
  }

  async function uploadToCloud() {
    if (!currentUser || suppressCloudSave || syncInProgress) {
      return;
    }

    syncInProgress = true;
    setSyncStatus("儲存中…", "syncing");

    try {
      const snapshot = createCloudSnapshot();
      const estimatedBytes = new Blob([JSON.stringify(snapshot)]).size;
      if (estimatedBytes > MAX_DOCUMENT_BYTES) {
        throw new Error("cloud-document-too-large");
      }

      await getUserDocument().set(snapshot);
      markLocalChanged(snapshot.updatedAtMs);
      setSyncStatus("已同步", "synced");
    } catch (error) {
      console.error("Could not save FlipWords progress to Firebase.", error);
      setSyncStatus(
        String(error?.message || "").includes("cloud-document-too-large")
          ? "自訂單字過多，請先匯出備份"
          : humanizeFirebaseError(error),
        "error",
      );
    } finally {
      syncInProgress = false;
    }
  }

  function scheduleCloudSave() {
    if (!currentUser || suppressCloudSave) {
      return;
    }

    window.clearTimeout(saveTimer);
    setSyncStatus("等待同步…", "pending");
    saveTimer = window.setTimeout(uploadToCloud, SAVE_DELAY_MS);
  }

  async function loadOrCreateCloudData(user) {
    setSyncStatus("正在讀取雲端進度…", "syncing");

    try {
      const documentSnapshot = await getUserDocument(user).get();
      if (!documentSnapshot.exists) {
        await uploadToCloud();
        return;
      }

      const cloudData = documentSnapshot.data() || {};
      const cloudUpdatedAt = Number(cloudData.updatedAtMs || 0);
      const localUpdatedAt = getLocalUpdatedAt();

      if (cloudUpdatedAt > localUpdatedAt) {
        applyCloudSnapshot(cloudData);
        setSyncStatus("已載入雲端進度", "synced");
        window.setTimeout(() => window.location.reload(), 250);
        return;
      }

      if (localUpdatedAt > cloudUpdatedAt) {
        await uploadToCloud();
        return;
      }

      setSyncStatus("已同步", "synced");
    } catch (error) {
      console.error("Could not load FlipWords progress from Firebase.", error);
      setSyncStatus(humanizeFirebaseError(error), "error");
    }
  }

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
    if (user.photoURL) {
      accountAvatar.src = user.photoURL;
    } else {
      accountAvatar.removeAttribute("src");
    }
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
      setSyncStatus(humanizeFirebaseError(error), "error");
    } finally {
      signInButton.disabled = false;
    }
  }

  async function signOutFromGoogle() {
    signOutButton.disabled = true;
    try {
      window.clearTimeout(saveTimer);
      await uploadToCloud();
      await auth.signOut();
    } catch (error) {
      console.error("Sign-out failed.", error);
      setSyncStatus("登出失敗，請再試一次", "error");
    } finally {
      signOutButton.disabled = false;
    }
  }

  const originalSaveCards = saveCards;
  saveCards = function saveCardsWithCloudSync(...args) {
    const result = originalSaveCards(...args);
    if (!suppressCloudSave) {
      markLocalChanged();
      scheduleCloudSave();
    }
    return result;
  };

  [soundToggle, flashcard].forEach((element) => {
    element?.addEventListener("click", () => {
      if (!suppressCloudSave) {
        markLocalChanged();
        scheduleCloudSave();
      }
    });
  });

  themeSelect?.addEventListener("change", () => {
    if (!suppressCloudSave) {
      markLocalChanged();
      scheduleCloudSave();
    }
  });

  signInButton.addEventListener("click", signInWithGoogle);
  signOutButton.addEventListener("click", signOutFromGoogle);
  window.addEventListener("online", scheduleCloudSave);

  auth.getRedirectResult().catch((error) => {
    console.error("Google redirect sign-in failed.", error);
    setSyncStatus(humanizeFirebaseError(error), "error");
  });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    renderAccount(user);
    if (user) {
      await loadOrCreateCloudData(user);
    }
  });
})();
