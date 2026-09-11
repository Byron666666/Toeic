(() => {
  "use strict";

  const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  const owns = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const safeKey = (key) => !["__proto__", "constructor", "prototype"].includes(key);
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const canonical = (value) => JSON.stringify(value, function (_key, item) {
    return isObject(item)
      ? Object.fromEntries(Object.keys(item).filter(safeKey).sort().map((key) => [key, item[key]]))
      : item;
  });
  const equal = (left, right) => canonical(left) === canonical(right);

  // Record only the fields the learner changed. Absence is an explicit deletion,
  // so moving a learned word back to "new" is also synchronized.
  function differences(before, after, path = [], result = []) {
    for (const key of new Set([...Object.keys(before || {}), ...Object.keys(after || {})])) {
      if (!safeKey(key)) continue;
      const nextPath = [...path, key];
      if (!owns(after || {}, key)) result.push({ path: nextPath, remove: true });
      else if (isObject(after[key]) && (isObject(before?.[key]) || before?.[key] === undefined)) {
        differences(before?.[key] || {}, after[key], nextPath, result);
      } else if (!equal(before?.[key], after[key])) {
        result.push({ path: nextPath, value: copy(after[key]) });
      }
    }
    return result;
  }

  function applyOperations(state, operations) {
    const next = copy(state);
    for (const operation of [...operations].sort((a, b) => a.sequence - b.sequence)) {
      const path = operation.path;
      if (!Array.isArray(path) || !path.length || !path.every((key) => typeof key === "string" && safeKey(key))) continue;
      let target = next;
      for (const key of path.slice(0, -1)) {
        if (!isObject(target[key])) target[key] = {};
        target = target[key];
      }
      const key = path[path.length - 1];
      if (operation.remove) delete target[key];
      else target[key] = copy(operation.value);
    }
    return next;
  }

  function addMissing(server, local) {
    const merged = copy(server);
    for (const [key, value] of Object.entries(local || {})) {
      if (!safeKey(key)) continue;
      if (!owns(merged, key)) merged[key] = copy(value);
      else if (isObject(merged[key]) && isObject(value)) merged[key] = addMissing(merged[key], value);
    }
    return merged;
  }

  function create(options) {
    const { db, getDocument, storagePrefix, readLocal, applyLocal, fromCloud, toCloud, setStatus } = options;
    const writer = window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    const prefix = `${storagePrefix}.sync.v2`;
    const ownerKey = `${prefix}.owner`;
    let storageFailed = false;
    let user = null;
    let generation = 0;
    let unsubscribe = null;
    let timer = 0;
    let retryDelay = 2000;
    let flight = null;
    let ready = false;
    let exists = false;
    let base = null;
    let receipts = {};
    let serverRevision = 0;
    let applying = false;
    let observed = copy(readLocal());

    function read(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    }
    function write(key, value) {
      try {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(value));
        storageFailed = false;
      } catch {
        storageFailed = true;
        setStatus("瀏覽器無法保留待同步紀錄，請保持此頁開啟", "error");
      }
    }

    let owner = read(ownerKey, null);
    let queueOwner = owner || "guest";
    const makeQueue = (seed = null) => ({ writer, sequence: seed ? 1 : 0, seed, operations: {} });
    let queue = makeQueue(owner ? null : copy(observed));
    const queuePrefix = (uid = queueOwner) => `${prefix}.queue.${encodeURIComponent(uid)}.`;
    const queueKey = () => `${queuePrefix()}${writer}`;
    const cacheKey = (uid = queueOwner) => `${prefix}.base.${encodeURIComponent(uid)}`;

    function persistQueue() {
      write(queueKey(), queue.seed || Object.keys(queue.operations).length ? queue : null);
    }

    // Each tab owns a separate outbox. A reopened page can recover other
    // outboxes without overwriting a still-open tab's newer changes.
    function readQueues() {
      const queues = new Map();
      try {
        const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
        for (const key of keys) {
          if (!key?.startsWith(queuePrefix())) continue;
          const item = read(key, null);
          if (item && typeof item.writer === "string" && isObject(item.operations)) queues.set(item.writer, item);
        }
      } catch { /* The in-memory outbox can still be uploaded. */ }
      queues.set(writer, queue);
      return [...queues.values()].sort((a, b) => (a.writer === writer ? 1 : b.writer === writer ? -1 : a.writer.localeCompare(b.writer)));
    }

    function outstanding(all = readQueues(), acknowledgements = receipts) {
      return all.map((item) => {
        const acknowledged = Number(acknowledgements[item.writer] || 0);
        return {
          writer: item.writer,
          sequence: Number(item.sequence || 0),
          seed: acknowledged < 1 ? item.seed : null,
          operations: Object.values(item.operations).filter((operation) => Number(operation.sequence) > acknowledged),
        };
      }).filter((item) => item.seed || item.operations.length);
    }

    function compose(state, batches) {
      let next = copy(state);
      for (const batch of batches) {
        if (batch.seed) next = addMissing(next, batch.seed);
        next = applyOperations(next, batch.operations);
      }
      return next;
    }

    function display() {
      if (base === null) return;
      const next = compose(base, outstanding());
      if (!equal(readLocal(), next)) {
        applying = true;
        try { applyLocal(copy(next)); }
        finally { applying = false; }
      }
      // Adapters may fill in defaults while rendering. Those are not edits.
      observed = copy(readLocal());
    }

    function report() {
      if (!user) return;
      if (storageFailed && outstanding().length) {
        setStatus("瀏覽器無法保留待同步紀錄，請保持此頁開啟", "error");
      } else if (navigator.onLine === false) {
        setStatus(outstanding().length ? "已存本機，連線後自動同步" : "離線，顯示本機進度", "pending");
      } else if (!ready) {
        setStatus("正在確認雲端進度…", "syncing");
      } else if (flight) {
        setStatus("正在儲存至雲端…", "syncing");
      } else if (outstanding().length || !exists) {
        setStatus("已存本機，等待雲端同步…", "pending");
      } else {
        setStatus("已同步至雲端", "synced");
      }
    }

    function schedule(delay = 250) {
      if (!user || timer) return;
      const token = generation;
      timer = window.setTimeout(() => {
        timer = 0;
        if (token !== generation) return;
        if (!unsubscribe) listen();
        void flush();
      }, delay);
    }

    function changed() {
      if (applying) return;
      const next = copy(readLocal());
      const changes = differences(observed, next);
      observed = next;
      if (!changes.length) return;
      for (const operation of changes) {
        operation.sequence = ++queue.sequence;
        queue.operations[JSON.stringify(operation.path)] = operation;
      }
      persistQueue();
      report();
      schedule();
    }

    function saveBase() {
      write(cacheKey(), { state: base, receipts, revision: serverRevision, exists });
    }

    function pruneAcknowledged() {
      const acknowledged = Number(receipts[writer] || 0);
      if (acknowledged >= 1) queue.seed = null;
      for (const [key, operation] of Object.entries(queue.operations)) {
        if (operation.sequence <= acknowledged) delete queue.operations[key];
      }
      persistQueue();
    }

    function receive(snapshot, token) {
      if (token !== generation || !user) return;
      if (snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites) {
        if (snapshot.metadata?.fromCache) ready = false;
        report();
        return;
      }
      try {
        const data = snapshot.exists ? snapshot.data() || {} : {};
        const incomingRevision = Number(data.syncRevision || 0);
        // A transaction acknowledgement can arrive before its listener event.
        if (incomingRevision > 0 && incomingRevision < serverRevision) return;
        base = fromCloud(data);
        receipts = isObject(data.syncWriters) ? data.syncWriters : {};
        serverRevision = incomingRevision;
        exists = snapshot.exists;
        ready = true;
        retryDelay = 2000;
        pruneAcknowledged();
        saveBase();
        display();
        report();
        if (outstanding().length || !exists) schedule();
      } catch (error) { failed(error, token, true); }
    }

    function failed(error, token, listenerFailure = false) {
      if (token !== generation) return;
      console.warn("FlipWords cloud synchronization will retry.", error);
      if (listenerFailure) {
        ready = false;
        unsubscribe?.();
        unsubscribe = null;
      }
      const message = options.describeError?.(error) || "雲端同步暫時失敗";
      setStatus(`${message}；進度保留本機，將自動重試`, "error");
      schedule(retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    }

    function listen() {
      if (!user || unsubscribe) return;
      const token = generation;
      try {
        unsubscribe = getDocument(user).onSnapshot(
          { includeMetadataChanges: true },
          (snapshot) => receive(snapshot, token),
          (error) => failed(error, token, true),
        );
      } catch (error) { failed(error, token, true); }
    }

    async function drain(token, documentReference) {
      while (token === generation && ready && navigator.onLine !== false) {
        const batches = copy(outstanding());
        if (!batches.length && exists) return true;
        const result = await db.runTransaction(async (transaction) => {
          // Firestore retries this callback if another device writes meanwhile.
          // Never read mutable UI state inside the retryable callback.
          const snapshot = await transaction.get(documentReference);
          const previous = snapshot.exists ? snapshot.data() || {} : {};
          const remoteReceipts = isObject(previous.syncWriters) ? previous.syncWriters : {};
          const remaining = batches.map((batch) => ({
            ...batch,
            seed: Number(remoteReceipts[batch.writer] || 0) < 1 ? batch.seed : null,
            operations: batch.operations.filter((operation) => operation.sequence > Number(remoteReceipts[batch.writer] || 0)),
          })).filter((batch) => batch.seed || batch.operations.length);
          const state = compose(fromCloud(previous), remaining);
          const acknowledgements = { ...remoteReceipts };
          for (const batch of remaining) {
            acknowledgements[batch.writer] = Math.max(Number(acknowledgements[batch.writer] || 0), batch.sequence);
          }
          if (snapshot.exists && !remaining.length) {
            return { state, receipts: acknowledgements, revision: Number(previous.syncRevision || 0) };
          }
          const revision = Number(previous.syncRevision || 0) + 1;
          const payload = {
            ...previous,
            ...toCloud(state),
            syncRevision: revision,
            syncWriters: acknowledgements,
            updatedAtMs: Date.now(), // Legacy clients only; never used for conflict resolution.
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp(),
          };
          if (new Blob([JSON.stringify(payload)]).size > (options.maxBytes || 900000)) {
            throw new Error("cloud-document-too-large");
          }
          // An account switch must not let an old callback start another write.
          if (token !== generation) throw new Error("sync-account-changed");
          transaction.set(documentReference, payload);
          return { state, receipts: acknowledgements, revision };
        });
        if (token !== generation) return false;
        if (result.revision >= serverRevision) {
          base = result.state;
          receipts = result.receipts;
          serverRevision = result.revision;
        }
        exists = true;
        pruneAcknowledged();
        saveBase();
        display();
        // Edits made while the request was in flight remain in the outbox.
        // Continue until those newer edits have also been acknowledged.
      }
      return false;
    }

    function flush() {
      window.clearTimeout(timer);
      timer = 0;
      if (flight) return flight;
      if (!user || !ready || navigator.onLine === false) {
        report();
        return Promise.resolve(false);
      }
      const token = generation;
      const documentReference = getDocument(user);
      flight = drain(token, documentReference).then((complete) => {
        if (token === generation) retryDelay = 2000;
        return complete;
      }).catch((error) => {
        failed(error, token);
        return false;
      }).finally(() => {
        if (token !== generation) return;
        flight = null;
        // Keep a failure visible until the next retry, instead of claiming success.
        if (!timer) report();
      });
      report();
      return flight;
    }

    function start(nextUser) {
      if (user?.uid && user.uid === nextUser?.uid) return;
      generation += 1;
      unsubscribe?.();
      unsubscribe = null;
      window.clearTimeout(timer);
      timer = 0;
      flight = null;
      ready = false;
      exists = false;
      user = nextUser;
      if (!user) return;

      if (queueOwner !== user.uid) {
        persistQueue();
        const guest = !owner && queueOwner === "guest";
        const guestQueues = guest ? readQueues() : [];
        const previousGuestKey = queueKey();
        queueOwner = user.uid;
        if (!guest) {
          const savedQueue = read(queueKey(), null);
          queue = savedQueue?.writer === writer && isObject(savedQueue.operations) ? savedQueue : makeQueue();
        } else {
          const backupKey = `${prefix}.legacy-backup.${encodeURIComponent(user.uid)}`;
          if (read(backupKey, null) === null) write(backupKey, copy(readLocal()));
          for (const recovered of guestQueues) {
            if (recovered.writer !== writer) write(`${queuePrefix()}${recovered.writer}`, recovered);
          }
        }
        persistQueue();
        if (guest) write(previousGuestKey, null);
      }
      const switchedAccount = owner && owner !== user.uid;
      owner = user.uid;
      write(ownerKey, owner);
      const cached = read(cacheKey(), null);
      base = cached?.state || null;
      receipts = cached?.receipts || {};
      serverRevision = Number(cached?.revision || 0);
      if (base !== null) display();
      else if (switchedAccount) {
        applying = true;
        try { applyLocal(compose(fromCloud({}), outstanding())); }
        finally { applying = false; }
        observed = copy(readLocal());
      }
      report();
      listen();
    }

    function resume() {
      if (!user) return;
      if (!unsubscribe) listen();
      void flush();
    }
    window.addEventListener("online", resume);
    window.addEventListener("offline", report);
    window.addEventListener("focus", resume);
    window.addEventListener("pagehide", () => { void flush(); });
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("storage", (event) => {
      if (!user || !event.key?.startsWith(queuePrefix())) return;
      display();
      report();
      schedule();
    });

    return { start, changed, flush };
  }

  window.FlipWordsCloudSync = { create };
})();
