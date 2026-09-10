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
  const SAVE_DELAY_MS = 1200;
  const MAX_DOCUMENT_BYTES = 900_000;
  const STORAGE_KEY = "flipwords:gsat-7000:progress:v1";
  const PREFS_KEY = "flipwords:gsat-7000:preferences:v1";
  const LOCAL_UPDATED_KEY = "flipwords.gsat-7000.cloudLocalUpdatedAt.v1";

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

  const firebaseApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
  const auth = firebaseApp.auth();
  const db = firebaseApp.firestore();
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const levelIds = new Set(
    (window.GSAT_7000_DATA?.levels || []).flatMap((level) => level.words.map((word) => word.id)),
  );
  const levelNumbers = new Set((window.GSAT_7000_DATA?.levels || []).map((level) => String(level.level)));

  let currentUser = null;
  let saveTimer = 0;
  let suppressCloudSave = false;
  let syncInProgress = false;

  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch((error) => {
    console.warn("Could not enable persistent Firebase login for 7000.", error);
  });

  function setSyncStatus(message, state = "idle") {
    syncStatus.textContent = message;
    syncStatus.dataset.state = state;
  }

  function readJson(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" && !Array.isArray(value) ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function getLocalUpdatedAt() {
    return Number(localStorage.getItem(LOCAL_UPDATED_KEY) || 0);
  }

  function markLocalChanged(timestamp = Date.now()) {
    localStorage.setItem(LOCAL_UPDATED_KEY, String(timestamp));
    return timestamp;
  }

  function sanitizeProgress(value) {
    const progress = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return progress;
    Object.entries(value).forEach(([id, status]) => {
      if (levelIds.has(id) && (status === "review" || status === "learned")) {
        progress[id] = status;
      }
    });
    return progress;
  }

  function sanitizePreferences(value) {
    const preferences = {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return preferences;

    const level = String(Number(value.level));
    if (levelNumbers.has(level)) preferences.level = Number(level);
    if (["new", "review", "learned"].includes(value.pile)) preferences.pile = value.pile;

    const currentByLevel = {};
    if (value.currentByLevel && typeof value.currentByLevel === "object" && !Array.isArray(value.currentByLevel)) {
      Object.entries(value.currentByLevel).forEach(([levelKey, id]) => {
        const normalizedLevel = String(Number(levelKey));
        if (levelNumbers.has(normalizedLevel) && levelIds.has(String(id))) {
          currentByLevel[normalizedLevel] = String(id);
        }
      });
    }
    preferences.currentByLevel = currentByLevel;
    return preferences;
  }

  function getLocalSnapshot() {
    return {
      progress: sanitizeProgress(readJson(STORAGE_KEY, {})),
      preferences: sanitizePreferences(readJson(PREFS_KEY, {})),
    };
  }

  function createCloudSnapshot() {
    const local = getLocalSnapshot();
    const updatedAtMs = Date.now();
    return {
      schemaVersion: SYNC_SCHEMA_VERSION,
      libraryVersion: LIBRARY_VERSION,
      progress: local.progress,
      preferences: local.preferences,
      updatedAtMs,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
  }

  function applyCloudSnapshot(snapshot) {
    const cloudProgress = sanitizeProgress(snapshot.progress);
    const cloudPreferences = sanitizePreferences(snapshot.preferences);
    suppressCloudSave = true;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudProgress));
      localStorage.setItem(PREFS_KEY, JSON.stringify(cloudPreferences));
      markLocalChanged(Number(snapshot.updatedAtMs || Date.now()));
    } finally {
      suppressCloudSave = false;
    }
    setSyncStatus("已載入雲端進度", "synced");
    window.setTimeout(() => window.location.reload(), 250);
  }

  function getUserDocument(user = currentUser) {
    return db.collection("users").doc(user.uid).collection("apps").doc(APP_DOCUMENT_ID);
  }

  function humanizeFirebaseError(error) {
    const code = String(error?.code || "");
    if (code.includes("unauthorized-domain")) {
      return "請先把目前網站網域加入 Firebase 授權網域";
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
    if (!currentUser || suppressCloudSave || syncInProgress) return;

    syncInProgress = true;
    setSyncStatus("儲存中…", "syncing");
    try {
      const snapshot = createCloudSnapshot();
      const estimatedBytes = new Blob([JSON.stringify(snapshot)]).size;
      if (estimatedBytes > MAX_DOCUMENT_BYTES) throw new Error("cloud-document-too-large");
      await getUserDocument().set(snapshot);
      markLocalChanged(snapshot.updatedAtMs);
      setSyncStatus("已同步", "synced");
    } catch (error) {
      console.error("Could not save 7000 progress to Firebase.", error);
      setSyncStatus(
        String(error?.message || "").includes("cloud-document-too-large")
          ? "進度資料過大，請先匯出備份"
          : humanizeFirebaseError(error),
        "error",
      );
    } finally {
      syncInProgress = false;
    }
  }

  function scheduleCloudSave() {
    if (!currentUser || suppressCloudSave) return;
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
        return;
      }
      if (localUpdatedAt > cloudUpdatedAt) {
        await uploadToCloud();
        return;
      }
      setSyncStatus("已同步", "synced");
    } catch (error) {
      console.error("Could not load 7000 progress from Firebase.", error);
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
      console.error("7000 sign-out failed.", error);
      setSyncStatus("登出失敗，請再試一次", "error");
    } finally {
      signOutButton.disabled = false;
    }
  }

  window.addEventListener("flipwords:local-change", (event) => {
    if (event.detail?.scope === "gsat-7000") {
      markLocalChanged();
      scheduleCloudSave();
    }
  });
  window.addEventListener("online", scheduleCloudSave);
  signInButton.addEventListener("click", signInWithGoogle);
  signOutButton.addEventListener("click", signOutFromGoogle);

  auth.getRedirectResult().catch((error) => {
    console.error("Google redirect sign-in failed for 7000.", error);
    setSyncStatus(humanizeFirebaseError(error), "error");
  });

  auth.onAuthStateChanged(async (user) => {
    currentUser = user;
    renderAccount(user);
    if (user) await loadOrCreateCloudData(user);
  });
})();

