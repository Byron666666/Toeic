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

  const APP_DOCUMENT_ID = "flipwords-gsat-7000";
  const SYNC_SCHEMA_VERSION = 1;
  const LIBRARY_VERSION = "gsat-7000-v1";
  const STORAGE_KEY = "flipwords:gsat-7000:progress:v1";
  const PREFS_KEY = "flipwords:gsat-7000:preferences:v1";
  const signInButton = document.querySelector("#googleSignInButton");
  const signOutButton = document.querySelector("#googleSignOutButton");
  const accountView = document.querySelector("#signedInAccount");
  const accountAvatar = document.querySelector("#accountAvatar");
  const accountName = document.querySelector("#accountName");
  const syncStatus = document.querySelector("#cloudSyncStatus");

  if (!window.firebase || !signInButton || !signOutButton || !accountView || !syncStatus) {
    console.warn("7000 Firebase sync could not start because required scripts or page elements are missing.");
    return;
  }

  if (!window.FlipWordsCloudSync || typeof window.FlipWordsCloudSync.create !== "function") {
    console.warn("7000 Firebase sync could not start because cloud-sync-core.js is missing.");
    syncStatus.textContent = "同步程式載入失敗，請重新整理";
    syncStatus.dataset.state = "error";
    return;
  }

  const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebaseApp.auth();
  const db = firebaseApp.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const levels = window.GSAT_7000_DATA?.levels || [];
  const levelIds = new Set(levels.flatMap((level) => level.words.map((word) => String(word.id))));
  const levelNumbers = new Set(levels.map((level) => String(level.level)));
  const levelForId = new Map(
    levels.flatMap((level) => level.words.map((word) => [String(word.id), String(level.level)])),
  );

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
    console.warn("Could not enable persistent Firebase login for 7000.", error);
  });

  function setSyncStatus(message, state = "idle") {
    syncStatus.textContent = message;
    syncStatus.dataset.state = state;
  }

  function describeError(error) {
    const code = String(error?.code || error?.message || "");
    if (code.includes("cloud-document-too-large")) return "進度資料過大，將保留在本機。";
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

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function sanitizeProgress(value) {
    const progress = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return progress;
    Object.entries(value).forEach(([id, status]) => {
      const normalizedId = String(id);
      if (levelIds.has(normalizedId) && (status === "review" || status === "learned")) {
        progress[normalizedId] = status;
      }
    });
    return progress;
  }

  function sanitizePreferences(value) {
    const preferences = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return preferences;

    const level = Number(value.level);
    if (levelNumbers.has(String(level))) preferences.level = level;
    if (["new", "review", "learned"].includes(value.pile)) preferences.pile = value.pile;

    const currentByLevel = {};
    if (value.currentByLevel && typeof value.currentByLevel === "object" && !Array.isArray(value.currentByLevel)) {
      Object.entries(value.currentByLevel).forEach(([levelKey, id]) => {
        const normalizedLevel = String(Number(levelKey));
        const normalizedId = String(id);
        if (levelNumbers.has(normalizedLevel) && levelForId.get(normalizedId) === normalizedLevel) {
          currentByLevel[normalizedLevel] = normalizedId;
        }
      });
    }
    preferences.currentByLevel = currentByLevel;
    return preferences;
  }

  function normalizeState(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    return {
      progress: sanitizeProgress(source.progress),
      preferences: sanitizePreferences(source.preferences),
    };
  }

  function readLocal() {
    return normalizeState({
      progress: readJson(STORAGE_KEY, {}),
      preferences: readJson(PREFS_KEY, {}),
    });
  }

  function fromCloud(snapshotData) {
    return normalizeState(snapshotData);
  }

  function toCloud(state) {
    const normalized = normalizeState(state);
    return {
      schemaVersion: SYNC_SCHEMA_VERSION,
      libraryVersion: LIBRARY_VERSION,
      progress: normalized.progress,
      preferences: normalized.preferences,
    };
  }

  function applyLocal(state) {
    const normalized = normalizeState(state);
    if (typeof window.FlipWords7000?.applyCloudState === "function") {
      window.FlipWords7000.applyCloudState(normalized);
    } else {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized.progress));
        localStorage.setItem(PREFS_KEY, JSON.stringify(normalized.preferences));
      } catch (error) {
        console.warn("Could not apply 7000 cloud state locally.", error);
      }
    }

    if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent("flipwords:cloud-applied", {
        detail: { scope: "gsat-7000" },
      }));
    }
  }

  const cloudSync = window.FlipWordsCloudSync.create({
    db,
    getDocument: (user) => getUserDocument(user),
    storagePrefix: "flipwords-gsat-7000",
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
      console.error("Google sign-in failed for 7000.", error);
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
      console.error("Sign-out failed for 7000.", error);
      setSyncStatus(describeError(error), "error");
    } finally {
      signOutButton.disabled = false;
    }
  }

  window.addEventListener("flipwords:local-change", (event) => {
    if (event.detail?.scope === "gsat-7000") cloudSync.changed();
  });
  signInButton.addEventListener("click", signInWithGoogle);
  signOutButton.addEventListener("click", signOutFromGoogle);

  auth.getRedirectResult().catch((error) => {
    console.error("Google redirect sign-in failed for 7000.", error);
    setSyncStatus(describeError(error), "error");
  });

  auth.onAuthStateChanged(async (user) => {
    renderAccount(user);
    try {
      await cloudSync.start(user);
    } catch (error) {
      console.error("Could not start 7000 cloud sync.", error);
      setSyncStatus(describeError(error), "error");
    }
  });
})();
