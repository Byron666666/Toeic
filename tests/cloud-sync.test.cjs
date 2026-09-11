const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'cloud-sync-core.js');

function clone(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map(clone);
  if (typeof value !== 'object') return value;
  const result = {};
  for (const [key, item] of Object.entries(value)) result[key] = clone(item);
  return result;
}

function normalizedState(value = {}) {
  const state = value || {};
  const preferences = state.preferences || {};
  const normalized = {
    progress: clone(state.progress || {}),
    preferences: {
      level: preferences.level ?? 1,
      currentByLevel: clone(preferences.currentByLevel || {}),
    },
  };
  if (Object.prototype.hasOwnProperty.call(state, 'customCardsById')) {
    normalized.customCardsById = clone(state.customCardsById || {});
  }
  return normalized;
}

function freshState(value = {}) {
  return normalizedState(value);
}

class StorageMock {
  constructor(seed = {}) {
    this.values = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  }

  get length() {
    return this.values.size;
  }

  key(index) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  getItem(key) {
    return this.values.has(String(key)) ? this.values.get(String(key)) : null;
  }

  setItem(key, value) {
    this.values.set(String(key), String(value));
  }

  removeItem(key) {
    this.values.delete(String(key));
  }

  entries() {
    return Array.from(this.values.entries());
  }

  snapshot() {
    return new Map(this.values);
  }

  restore(values) {
    this.values = new Map(values);
  }
}

class EventTargetMock {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(name, callback) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name).add(callback);
  }

  removeEventListener(name, callback) {
    this.listeners.get(name)?.delete(callback);
  }

  dispatchEvent(event) {
    this.dispatch(event.type, event);
    return true;
  }

  dispatch(name, event = {}) {
    const payload = { type: name, target: this, ...event };
    for (const callback of Array.from(this.listeners.get(name) || [])) callback(payload);
  }
}

class TimerQueue {
  constructor() {
    this.now = 0;
    this.nextId = 1;
    this.timers = [];
  }

  setTimeout(callback, delay = 0) {
    const id = this.nextId++;
    const wait = Number.isFinite(Number(delay)) ? Math.max(0, Number(delay)) : 0;
    this.timers.push({ id, due: this.now + wait, callback, interval: 0 });
    return id;
  }

  clearTimeout(id) {
    this.timers = this.timers.filter(timer => timer.id !== id);
  }

  setInterval(callback, delay = 0) {
    const id = this.nextId++;
    const wait = Math.max(0, Number(delay) || 0);
    this.timers.push({ id, due: this.now + wait, callback, interval: wait || 1 });
    return id;
  }

  clearInterval(id) {
    this.clearTimeout(id);
  }

  hasPending() {
    return this.timers.length > 0;
  }

  nextDue() {
    return this.timers.length ? Math.min(...this.timers.map(timer => timer.due)) : null;
  }

  fireNext() {
    if (!this.timers.length) return false;
    let index = 0;
    for (let i = 1; i < this.timers.length; i += 1) {
      if (this.timers[i].due < this.timers[index].due) index = i;
    }
    const timer = this.timers.splice(index, 1)[0];
    this.now = timer.due;
    const result = timer.callback();
    if (timer.interval) this.timers.push({ ...timer, due: this.now + timer.interval });
    return result;
  }
}

class DeferredNetwork {
  constructor() {
    this.docs = new Map();
    this.versions = new Map();
    this.listeners = new Map();
    this.transactions = [];
    this.initialSnapshots = new Map();
    this.serverTime = 0;
    this.online = true;
  }

  doc(pathName, owner = null) {
    return {
      path: pathName,
      onSnapshot: (...args) => {
        let options = {};
        let callback;
        let errorCallback;
        if (typeof args[0] === 'function') {
          callback = args[0];
          errorCallback = args[1];
        } else {
          options = args[0] || {};
          callback = args[1];
          errorCallback = args[2];
        }
        const listener = {
          path: pathName,
          owner,
          options,
          callback,
          errorCallback,
          active: true,
        };
        if (!this.listeners.has(pathName)) this.listeners.set(pathName, new Set());
        this.listeners.get(pathName).add(listener);
        const initial = this.initialSnapshots.get(pathName) || {
          data: this.docs.get(pathName),
          metadata: { fromCache: false, hasPendingWrites: false },
        };
        Promise.resolve().then(() => {
          if (listener.active) callback(this.snapshot(pathName, initial.data, initial.metadata));
        });
        return () => {
          listener.active = false;
          this.listeners.get(pathName)?.delete(listener);
        };
      },
    };
  }

  snapshot(pathName, value = this.docs.get(pathName), metadata = {}) {
    const data = value === undefined || value === null ? undefined : clone(value);
    const exists = data !== undefined;
    return {
      exists,
      data: () => clone(data),
      metadata: {
        fromCache: Boolean(metadata.fromCache),
        hasPendingWrites: Boolean(metadata.hasPendingWrites),
      },
    };
  }

  seed(pathName, data) {
    if (data === undefined || data === null) this.docs.delete(pathName);
    else this.docs.set(pathName, clone(data));
    this.versions.set(pathName, 0);
  }

  setInitialSnapshot(pathName, data, metadata = { fromCache: true, hasPendingWrites: false }) {
    this.initialSnapshots.set(pathName, { data: data === undefined ? undefined : clone(data), metadata: { ...metadata } });
  }

  data(pathName) {
    return clone(this.docs.get(pathName));
  }

  version(pathName) {
    return this.versions.get(pathName) || 0;
  }

  listenersFor(pathName) {
    return Array.from(this.listeners.get(pathName) || []);
  }

  emitSnapshot(pathName, data = this.docs.get(pathName), metadata = { fromCache: false, hasPendingWrites: false }) {
    const snapshot = this.snapshot(pathName, data, metadata);
    for (const listener of this.listenersFor(pathName)) {
      if (!listener.active) continue;
      Promise.resolve().then(() => {
        if (listener.active) listener.callback(snapshot);
      });
    }
  }

  invoke(listener, data = this.docs.get(listener.path), metadata = { fromCache: false, hasPendingWrites: false }) {
    listener.callback(this.snapshot(listener.path, data, metadata));
  }

  setRemote(pathName, data, metadata = { fromCache: false, hasPendingWrites: false }) {
    this.seed(pathName, data);
    this.versions.set(pathName, this.version(pathName) + 1);
    this.emitSnapshot(pathName, data, metadata);
  }

  commit(pathName, payload) {
    const materialized = this.materialize(payload);
    this.docs.set(pathName, materialized);
    this.versions.set(pathName, this.version(pathName) + 1);
    this.emitSnapshot(pathName, materialized, { fromCache: false, hasPendingWrites: false });
    return clone(materialized);
  }

  materialize(value) {
    if (Array.isArray(value)) return value.map(item => this.materialize(item));
    if (!value || typeof value !== 'object') return value;
    if (value.__serverTimestamp === true) {
      this.serverTime += 1;
      return { seconds: this.serverTime, nanoseconds: 0 };
    }
    const result = {};
    for (const [key, item] of Object.entries(value)) result[key] = this.materialize(item);
    return result;
  }

  runTransaction(update, owner) {
    const call = {
      owner,
      status: 'pending',
      update,
      ready: false,
      readVersions: new Map(),
      writes: [],
      attempts: 0,
      result: undefined,
    };
    call.promise = new Promise((resolve, reject) => {
      call.resolve = resolve;
      call.reject = reject;
    });
    this.transactions.push(call);
    call.readyPromise = this.runAttempt(call);
    return call.promise;
  }

  async runAttempt(call) {
    call.attempts += 1;
    call.ready = false;
    call.readVersions = new Map();
    call.writes = [];
    const transaction = {
      get: async document => {
        const pathName = document.path;
        call.readVersions.set(pathName, this.version(pathName));
        return this.snapshot(pathName);
      },
      set: (document, payload) => {
        call.writes.push({ path: document.path, payload: clone(payload) });
      },
    };
    try {
      call.result = await call.update(transaction);
      call.ready = true;
      return call.result;
    } catch (error) {
      call.error = error;
      call.ready = true;
      throw error;
    }
  }

  hasConflict(call) {
    for (const [pathName, version] of call.readVersions) {
      if (this.version(pathName) !== version) return true;
    }
    return false;
  }

  async finish(call) {
    assert.equal(call.status, 'pending', 'transaction must still be pending');
    if (!this.online) {
      await this.fail(call, new Error('offline'));
      return;
    }
    await call.readyPromise;
    while (this.hasConflict(call)) {
      call.readyPromise = this.runAttempt(call);
      await call.readyPromise;
    }
    const write = call.writes[call.writes.length - 1];
    assert.ok(write, 'transaction callback must write a document');
    const data = this.commit(write.path, write.payload);
    call.status = 'committed';
    call.resolve(data);
    await Promise.resolve();
  }

  async fail(call, error = new Error('network failure')) {
    assert.equal(call.status, 'pending', 'transaction must still be pending');
    await call.readyPromise.catch(() => {});
    call.status = 'failed';
    call.reject(error);
    await Promise.resolve();
  }

  callsFor(owner, status = 'pending') {
    return this.transactions.filter(call => call.owner === owner && call.status === status);
  }
}

let nextClientId = 1;

function makeDate(now) {
  return class TestDate extends Date {
    static now() {
      return now;
    }
  };
}

function createClient(server, uid, options = {}) {
  const clock = new TimerQueue();
  const window = new EventTargetMock();
  const document = new EventTargetMock();
  const navigator = { onLine: true };
  document.visibilityState = 'visible';
  document.hidden = false;
  const storage = options.storage || new StorageMock();
  const sessionStorage = options.sessionStorage || new StorageMock();
  const local = normalizedState(options.local || {});
  const applied = [];
  const statuses = [];
  const owner = `${uid}:${nextClientId++}`;
  const firebase = {
    firestore: {
      FieldValue: {
        serverTimestamp: () => ({ __serverTimestamp: true }),
      },
    },
  };
  const context = {
    window,
    document,
    navigator,
    localStorage: storage,
    sessionStorage,
    firebase,
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    setInterval: clock.setInterval.bind(clock),
    clearInterval: clock.clearInterval.bind(clock),
    Date: makeDate(options.now ?? 1000),
    Blob,
    console,
  };
  window.window = window;
  window.document = document;
  window.navigator = navigator;
  window.localStorage = storage;
  window.sessionStorage = sessionStorage;
  window.firebase = firebase;
  window.setTimeout = context.setTimeout;
  window.clearTimeout = context.clearTimeout;
  window.setInterval = context.setInterval;
  window.clearInterval = context.clearInterval;
  vm.runInNewContext(fs.readFileSync(sourcePath, 'utf8'), context, { filename: sourcePath });
  assert.ok(window.FlipWordsCloudSync, 'cloud sync core must expose its global API');

  const api = window.FlipWordsCloudSync.create({
    db: { runTransaction: update => server.runTransaction(update, owner) },
    getDocument: user => server.doc(`users/${user.uid}`, owner),
    storagePrefix: options.storagePrefix || 'test:flipwords:cloud-sync:v1',
    readLocal: () => clone(local),
    applyLocal: state => {
      const next = normalizedState(state);
      local.progress = next.progress;
      local.preferences = next.preferences;
      if (Object.prototype.hasOwnProperty.call(next, 'customCardsById')) {
        local.customCardsById = next.customCardsById;
      } else {
        delete local.customCardsById;
      }
      applied.push(clone(next));
    },
    fromCloud: data => normalizedState(data || {}),
    toCloud: state => normalizedState(state || {}),
    setStatus: (message, state) => statuses.push({ message: String(message), state }),
    describeError: error => error?.message || String(error),
    maxBytes: options.maxBytes || 100000,
  });

  return {
    api,
    uid,
    owner,
    clock,
    window,
    document,
    navigator,
    storage,
    sessionStorage,
    local,
    applied,
    statuses,
    start: user => api.start(user),
    changed: () => api.changed(),
    flush: () => api.flush(),
    dispatchOnline: () => window.dispatch('online'),
    dispatchFocus: () => window.dispatch('focus'),
    dispatchPagehide: () => window.dispatch('pagehide'),
    dispatchVisibility: () => document.dispatch('visibilitychange'),
  };
}

async function settle(turns = 12) {
  for (let i = 0; i < turns; i += 1) await Promise.resolve();
}

async function fireNext(client) {
  if (!client.clock.hasPending()) return false;
  client.clock.fireNext();
  await settle();
  return true;
}

async function waitForTransaction(server, client, limit = 120) {
  for (let step = 0; step < limit; step += 1) {
    await settle();
    const calls = server.callsFor(client.owner);
    if (calls.length) {
      await settle();
      return calls[0];
    }
    if (await fireNext(client)) continue;
    client.dispatchOnline();
    client.dispatchFocus();
    client.dispatchVisibility();
    await settle(3);
  }
  throw new Error(`no transaction started for ${client.uid} after ${limit} scheduler turns`);
}

async function finishAndSettle(server, call, clients) {
  await server.finish(call);
  for (const client of clients) await settle();
}

function mutate(client, callback) {
  callback(client.local);
  client.changed();
}

function progressOf(server, uid) {
  return server.data(`users/${uid}`)?.progress || {};
}

test('changes made during an in-flight save drain without losing the latest state', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({ progress: { seed: 'learned' }, preferences: { level: 1, currentByLevel: { 1: 'seed' } } });
  server.seed('users/alice', initial);
  const client = createClient(server, 'alice', { local: initial });

  client.start({ uid: 'alice' });
  await settle();
  mutate(client, state => { state.progress.a = 'learned'; });
  const first = await waitForTransaction(server, client);

  mutate(client, state => { state.progress.b = 'review'; });
  await finishAndSettle(server, first, [client]);
  const second = await waitForTransaction(server, client);
  await finishAndSettle(server, second, [client]);

  assert.deepEqual(progressOf(server, 'alice'), { seed: 'learned', a: 'learned', b: 'review' });
  assert.deepEqual(client.local.progress, { seed: 'learned', a: 'learned', b: 'review' });
  assert.equal(await client.flush(), true);
});

test('a same-field change back to its initial value survives its own in-flight write', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({ progress: { word: 'review' } });
  server.seed('users/alice', initial);
  const client = createClient(server, 'alice', { local: initial });
  client.start({ uid: 'alice' });
  await settle();

  mutate(client, state => { state.progress.word = 'learned'; });
  const first = await waitForTransaction(server, client);
  mutate(client, state => { state.progress.word = 'review'; });
  await finishAndSettle(server, first, [client]);
  const second = await waitForTransaction(server, client);
  await finishAndSettle(server, second, [client]);

  assert.equal(progressOf(server, 'alice').word, 'review');
  assert.equal(client.local.progress.word, 'review');
});

test('pending custom-card parent deletion followed by re-add applies in sequence order', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({
    customCardsById: {
      custom: { id: 'custom', front: 'old front', back: 'old back' },
    },
  });
  server.seed('users/alice', initial);
  const client = createClient(server, 'alice', { local: initial });
  client.start({ uid: 'alice' });
  await settle();

  mutate(client, state => { delete state.customCardsById.custom; });
  const deletion = await waitForTransaction(server, client);
  mutate(client, state => {
    state.customCardsById.custom = { id: 'custom', front: 're-added front' };
  });
  await finishAndSettle(server, deletion, [client]);
  const readd = await waitForTransaction(server, client);
  await finishAndSettle(server, readd, [client]);

  assert.deepEqual(server.data('users/alice').customCardsById, {
    custom: { id: 'custom', front: 're-added front' },
  });
  assert.deepEqual(client.local.customCardsById, {
    custom: { id: 'custom', front: 're-added front' },
  });
});

test('remote edits arrive in an active client without a reload', async () => {
  const server = new DeferredNetwork();
  server.seed('users/alice', freshState({ progress: { a: 'learned' } }));
  const client = createClient(server, 'alice', { local: freshState({ progress: { a: 'learned' } }) });
  client.start({ uid: 'alice' });
  await settle();

  server.setRemote('users/alice', freshState({
    progress: { a: 'learned', b: 'review' },
    preferences: { level: 2, currentByLevel: { 2: 'b' } },
  }));
  await settle();

  assert.deepEqual(client.local, freshState({
    progress: { a: 'learned', b: 'review' },
    preferences: { level: 2, currentByLevel: { 2: 'b' } },
  }));
  assert.equal(server.transactions.length, 0);
});

test('a stale other-device preference edit preserves another word progress edit', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({ progress: { a: 'learned' }, preferences: { level: 1, currentByLevel: { 1: 'a' } } });
  server.seed('users/alice', initial);
  const firstClient = createClient(server, 'alice', { local: initial });
  const secondClient = createClient(server, 'alice', { local: initial });
  firstClient.start({ uid: 'alice' });
  secondClient.start({ uid: 'alice' });
  await settle();

  mutate(firstClient, state => { state.progress.b = 'learned'; });
  const first = await waitForTransaction(server, firstClient);
  mutate(secondClient, state => { state.preferences.currentByLevel[1] = 'c'; });
  const second = await waitForTransaction(server, secondClient);

  await finishAndSettle(server, first, [firstClient, secondClient]);
  await finishAndSettle(server, second, [firstClient, secondClient]);

  assert.deepEqual(progressOf(server, 'alice'), { a: 'learned', b: 'learned' });
  assert.deepEqual(server.data('users/alice').preferences.currentByLevel, { 1: 'c' });
  assert.deepEqual(firstClient.local.progress, { a: 'learned', b: 'learned' });
  assert.equal(secondClient.local.preferences.currentByLevel[1], 'c');
});

test('an explicit same-field revert to new deletes learned and survives a concurrent write', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({
    progress: { a: 'learned', b: 'review' },
    preferences: { level: 1, currentByLevel: { 1: 'a' } },
  });
  server.seed('users/alice', initial);
  const revertClient = createClient(server, 'alice', { local: initial });
  const otherClient = createClient(server, 'alice', { local: initial });
  revertClient.start({ uid: 'alice' });
  otherClient.start({ uid: 'alice' });
  await settle();

  mutate(revertClient, state => { delete state.progress.a; });
  const revert = await waitForTransaction(server, revertClient);
  mutate(otherClient, state => { state.progress.b = 'learned'; });
  const other = await waitForTransaction(server, otherClient);

  await finishAndSettle(server, other, [revertClient, otherClient]);
  await finishAndSettle(server, revert, [revertClient, otherClient]);

  assert.deepEqual(progressOf(server, 'alice'), { b: 'learned' });
  assert.equal(Object.prototype.hasOwnProperty.call(progressOf(server, 'alice'), 'a'), false);
  assert.deepEqual(revertClient.local.progress, { b: 'learned' });
});

test('a pending change survives offline, reload, and reconnect', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({ progress: { seed: 'learned' } });
  server.seed('users/alice', initial);
  const storage = new StorageMock();
  const firstClient = createClient(server, 'alice', { local: initial, storage });
  firstClient.start({ uid: 'alice' });
  await settle();

  mutate(firstClient, state => { state.progress.offline = 'learned'; });
  const first = await waitForTransaction(server, firstClient);
  server.online = false;
  await server.finish(first);
  await settle();
  firstClient.start(null);

  assert.ok(storage.entries().some(([, value]) => value.includes('offline')));

  server.online = true;
  const reloaded = createClient(server, 'alice', { local: initial, storage });
  reloaded.start({ uid: 'alice' });
  await settle();
  const retry = await waitForTransaction(server, reloaded);
  await finishAndSettle(server, retry, [reloaded]);

  assert.equal(progressOf(server, 'alice').offline, 'learned');
  assert.equal(reloaded.local.progress.offline, 'learned');
});

test('cache snapshots never authorize a write before the first confirmed server snapshot', async () => {
  const server = new DeferredNetwork();
  const confirmed = freshState({ progress: { remote: 'learned' } });
  const staleCache = freshState({ progress: { stale: 'learned' } });
  server.seed('users/alice', confirmed);
  server.setInitialSnapshot('users/alice', staleCache, { fromCache: true, hasPendingWrites: false });
  const client = createClient(server, 'alice', { local: freshState() });
  client.start({ uid: 'alice' });
  await settle();

  mutate(client, state => { state.progress.local = 'review'; });
  await settle();
  assert.equal(server.transactions.length, 0);

  server.emitSnapshot('users/alice', confirmed, { fromCache: false, hasPendingWrites: false });
  await settle();
  const call = await waitForTransaction(server, client);
  await finishAndSettle(server, call, [client]);

  assert.equal(progressOf(server, 'alice').remote, 'learned');
  assert.equal(progressOf(server, 'alice').local, 'review');
});

test('a failed save remains dirty and retries successfully on reconnect', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({ progress: { seed: 'learned' } });
  server.seed('users/alice', initial);
  const client = createClient(server, 'alice', { local: initial });
  client.start({ uid: 'alice' });
  await settle();

  mutate(client, state => { state.progress.retry = 'learned'; });
  const failed = await waitForTransaction(server, client);
  await server.fail(failed, new Error('temporary network failure'));
  await settle();
  assert.equal(client.local.progress.retry, 'learned');
  assert.equal(progressOf(server, 'alice').retry, undefined);

  client.dispatchOnline();
  const retry = await waitForTransaction(server, client);
  await finishAndSettle(server, retry, [client]);

  assert.equal(progressOf(server, 'alice').retry, 'learned');
  assert.ok(client.statuses.length > 0);
});

test('old account callbacks cannot update the new account or seed it with old data', async () => {
  const server = new DeferredNetwork();
  const aliceState = freshState({ progress: { aliceOnly: 'learned' } });
  server.seed('users/alice', aliceState);
  const client = createClient(server, 'alice', { local: freshState() });
  client.start({ uid: 'alice' });
  await settle();
  const oldListener = server.listenersFor('users/alice')[0];
  assert.ok(oldListener);

  client.start(null);
  client.start({ uid: 'bob' });
  await settle();
  assert.deepEqual(client.local, freshState());

  server.invoke(oldListener, aliceState, { fromCache: false, hasPendingWrites: false });
  await settle();
  assert.deepEqual(client.local, freshState());
  assert.equal(server.data('users/bob')?.progress?.aliceOnly, undefined);
  for (const call of server.callsFor(client.owner)) {
    await settle();
    for (const write of call.writes) assert.equal(write.payload.progress?.aliceOnly, undefined);
  }
});

test('recovery receipts prevent a closed-page outbox from replaying over a newer edit', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({ progress: { word: 'review' } });
  server.seed('users/alice', initial);
  const storage = new StorageMock();
  const oldPage = createClient(server, 'alice', { local: initial, storage });
  oldPage.start({ uid: 'alice' });
  await settle();

  mutate(oldPage, state => { state.progress.word = 'learned'; });
  const oldWrite = await waitForTransaction(server, oldPage);
  const beforeAcknowledgement = storage.snapshot();
  const oldRevisionListener = server.listenersFor('users/alice').find(listener => listener.owner === oldPage.owner);
  assert.ok(oldRevisionListener);

  // Closing the page invalidates its generation before the server commits. The
  // server write succeeds, but the page never gets a chance to prune its outbox.
  oldPage.start(null);
  await server.finish(oldWrite);
  await settle();
  const committed = server.data('users/alice');
  const acknowledgedWriter = Object.entries(committed.syncWriters || {}).find(([, sequence]) => Number(sequence) > 0);
  assert.ok(acknowledgedWriter);
  storage.restore(beforeAcknowledgement);

  // A second device changes the same word after the first write committed.
  const other = createClient(server, 'alice', { local: freshState(committed) });
  other.start({ uid: 'alice' });
  await settle();
  mutate(other, state => { delete state.progress.word; });
  const otherWrite = await waitForTransaction(server, other);
  await finishAndSettle(server, otherWrite, [other]);
  const newer = server.data('users/alice');
  assert.equal(Object.prototype.hasOwnProperty.call(newer.progress, 'word'), false);
  assert.ok(Number(newer.syncWriters[acknowledgedWriter[0]]) >= Number(acknowledgedWriter[1]));
  assert.ok(Number(newer.syncRevision) > Number(committed.syncRevision));

  // Reopening the old storage discovers the outbox, but the receipt makes its
  // old operation already acknowledged. It must not replay the learned value.
  const reopened = createClient(server, 'alice', { local: initial, storage });
  reopened.start({ uid: 'alice' });
  await settle();
  for (let i = 0; i < 8 && reopened.clock.hasPending(); i += 1) await fireNext(reopened);
  assert.equal(server.transactions.filter(call => call.owner === reopened.owner).length, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(reopened.local.progress, 'word'), false);

  // A delayed older positive revision must not roll the active client back.
  const reopenedListener = server.listenersFor('users/alice').find(listener => listener.owner === reopened.owner);
  assert.ok(reopenedListener);
  server.invoke(reopenedListener, committed, { fromCache: false, hasPendingWrites: false });
  await settle();
  assert.equal(Object.prototype.hasOwnProperty.call(reopened.local.progress, 'word'), false);
  assert.equal(server.transactions.filter(call => call.owner === reopened.owner).length, 0);
  assert.equal(oldRevisionListener.active, false);
});

test('an offline pending change returns with the original account after switching away and back', async () => {
  const server = new DeferredNetwork();
  const aliceInitial = freshState({ progress: { aliceSeed: 'learned' } });
  const bobInitial = freshState({ progress: { bobSeed: 'learned' } });
  server.seed('users/alice', aliceInitial);
  server.seed('users/bob', bobInitial);
  const client = createClient(server, 'alice', { local: aliceInitial });
  client.start({ uid: 'alice' });
  await settle();

  client.navigator.onLine = false;
  mutate(client, state => { state.progress.aliceOffline = 'review'; });
  await settle();
  assert.equal(server.transactions.length, 0);

  client.start(null);
  client.start({ uid: 'bob' });
  await settle();
  assert.equal(server.transactions.length, 0);
  assert.deepEqual(client.local, bobInitial);
  assert.equal(client.local.progress.aliceOffline, undefined);

  client.start(null);
  client.navigator.onLine = true;
  client.start({ uid: 'alice' });
  await settle();
  const resumedWrite = await waitForTransaction(server, client);
  await finishAndSettle(server, resumedWrite, [client]);

  assert.deepEqual(progressOf(server, 'alice'), {
    aliceSeed: 'learned',
    aliceOffline: 'review',
  });
  assert.equal(client.local.progress.aliceOffline, 'review');
});

test('device clock skew does not choose a winner over transaction order', async () => {
  const server = new DeferredNetwork();
  const initial = freshState({ progress: { a: 'review' } });
  server.seed('users/alice', initial);
  const future = createClient(server, 'alice', { local: initial, now: 9000000000000 });
  const past = createClient(server, 'alice', { local: initial, now: 10 });
  future.start({ uid: 'alice' });
  past.start({ uid: 'alice' });
  await settle();

  mutate(future, state => { state.progress.a = 'learned'; });
  const futureCall = await waitForTransaction(server, future);
  mutate(past, state => { delete state.progress.a; });
  const pastCall = await waitForTransaction(server, past);

  await finishAndSettle(server, futureCall, [future, past]);
  await finishAndSettle(server, pastCall, [future, past]);

  assert.equal(Object.prototype.hasOwnProperty.call(progressOf(server, 'alice'), 'a'), false);
});
