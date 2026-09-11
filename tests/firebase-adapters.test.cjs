const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const toeicSource = fs.readFileSync(path.join(__dirname, '..', 'firebase-sync.js'), 'utf8');
const gsatSource = fs.readFileSync(path.join(__dirname, '..', '7000', 'firebase-sync-7000.js'), 'utf8');

function clone(value) {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return Array.from(value, clone);
  if (typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
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
    const callbacks = Array.from(this.listeners.get(event.type) || []);
    return Promise.all(callbacks.map(callback => callback(event))).then(() => true);
  }

  dispatch(name, event = {}) {
    return this.dispatchEvent({ type: name, target: this, ...event });
  }
}

class ElementMock extends EventTargetMock {
  constructor() {
    super();
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.textContent = '';
    this.src = '';
  }

  removeAttribute(name) {
    delete this[name];
  }
}

class DocumentMock extends EventTargetMock {
  constructor() {
    super();
    this.elements = new Map();
    this.body = { innerHTML: '' };
  }

  querySelector(selector) {
    if (!this.elements.has(selector)) this.elements.set(selector, new ElementMock());
    return this.elements.get(selector);
  }
}

class AuthMock {
  constructor() {
    this.callbacks = new Set();
    this.signOutCalls = 0;
    this.persistenceCalls = [];
  }

  setPersistence(value) {
    this.persistenceCalls.push(value);
    return Promise.resolve();
  }

  onAuthStateChanged(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  async trigger(user) {
    await Promise.all(Array.from(this.callbacks, callback => callback(user)));
  }

  getRedirectResult() {
    return Promise.resolve(null);
  }

  signInWithPopup() {
    return Promise.resolve();
  }

  signInWithRedirect() {
    return Promise.resolve();
  }

  signOut() {
    this.signOutCalls += 1;
    return Promise.resolve();
  }
}

function makeFirebase(auth) {
  const documents = [];
  const db = {
    collection(collectionName) {
      return {
        doc(userId) {
          return {
            collection(subcollectionName) {
              return {
                doc(documentId) {
                  const reference = {
                    path: `${collectionName}/${userId}/${subcollectionName}/${documentId}`,
                  };
                  documents.push(reference);
                  return reference;
                },
              };
            },
          };
        },
      };
    },
  };
  const app = { auth: () => auth, firestore: () => db };
  function AuthNamespace() {}
  AuthNamespace.Auth = { Persistence: { LOCAL: 'local' } };
  AuthNamespace.GoogleAuthProvider = class GoogleAuthProvider {
    setCustomParameters(parameters) {
      this.parameters = { ...parameters };
    }
  };
  const firebase = {
    apps: [],
    app: () => app,
    initializeApp: () => {
      firebase.apps.push(app);
      return app;
    },
    auth: AuthNamespace,
  };
  return { firebase, db, documents };
}

function makeCloudCapture() {
  const capture = {
    options: null,
    startCalls: [],
    changedCalls: 0,
    flushCalls: 0,
    flushBehavior: () => true,
  };
  capture.api = {
    start(user) {
      capture.startCalls.push(user);
      return Promise.resolve(true);
    },
    changed() {
      capture.changedCalls += 1;
    },
    flush() {
      capture.flushCalls += 1;
      return capture.flushBehavior();
    },
  };
  return capture;
}

function fixedDate() {
  return class FixedDate extends Date {
    constructor(...args) {
      super(args.length ? args : ['2026-09-11T12:00:00.000Z']);
    }

    static now() {
      return Date.parse('2026-09-11T12:00:00.000Z');
    }
  };
}

function makePage({ source, kind, cards = [], builtInCards = [], storage = new StorageMock(), levels = [] }) {
  const document = new DocumentMock();
  const window = new EventTargetMock();
  const auth = new AuthMock();
  const { firebase, db } = makeFirebase(auth);
  const cloud = makeCloudCapture();
  const reloads = [];
  const appliedCloud = [];
  const renderCalls = [];
  const context = {
    window,
    document,
    navigator: { onLine: true },
    localStorage: storage,
    firebase,
    console,
    Date: fixedDate(),
    setTimeout,
    clearTimeout,
    STORAGE_KEY: 'flipwords.toeic.cards.v2',
    cards,
    builtInCards,
    levels,
    cardKey: card => `${String(card.word || '').toLowerCase()}|${String(card.meaning || '').toLowerCase()}`,
    sanitizeCard: (card, fallbackId) => {
      if (!card || typeof card !== 'object' || Array.isArray(card) || !card.word) return null;
      return {
        ...clone(card),
        id: String(card.id || fallbackId),
        word: String(card.word),
        meaning: String(card.meaning || ''),
      };
    },
    cloneCards: values => clone(values),
    render: () => {
      context.filteredCards = context.cards;
      renderCalls.push(context.cards.map(clone));
    },
    filteredCards: cards,
    getCurrentCard: () => context.filteredCards?.[context.currentIndex] || null,
    activePile: 'unlearned',
    isFlipped: false,
    currentIndex: 0,
    DEMO_CARD_IDS: new Set(['demo-card']),
    isGeneratedLibraryCard: () => false,
    BUILT_IN_LIBRARY_VERSION: 'toeic-library-v1',
    LIBRARY_VERSION_KEY: 'flipwords.library.version.v1',
    saveCards: () => {
      storage.setItem('flipwords.toeic.cards.v2', JSON.stringify(context.cards));
    },
  };
  window.window = window;
  window.document = document;
  window.navigator = context.navigator;
  window.localStorage = storage;
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  window.location = { reload: () => reloads.push(true) };
  window.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  window.firebase = firebase;
  window.FlipWordsCloudSync = {
    create(options) {
      cloud.options = options;
      return cloud.api;
    },
  };
  if (kind === 'gsat') {
    window.GSAT_7000_DATA = { levels };
    window.FlipWords7000 = {
      applyCloudState(state) {
        appliedCloud.push(clone(state));
      },
    };
  }
  vm.runInNewContext(source, context, { filename: kind === 'toeic' ? 'firebase-sync.js' : '7000/firebase-sync-7000.js' });
  return {
    context,
    window,
    document,
    auth,
    firebase,
    db,
    cloud,
    storage,
    reloads,
    appliedCloud,
    renderCalls,
    signInButton: document.querySelector('#googleSignInButton'),
    signOutButton: document.querySelector('#googleSignOutButton'),
    accountView: document.querySelector('#signedInAccount'),
    syncStatus: document.querySelector('#cloudSyncStatus'),
  };
}

function makeToeicPage(options = {}) {
  const builtInCards = options.builtInCards || [
    { id: 'b1', word: 'Alpha', meaning: 'first', review: false, learned: false },
    { id: 'b2', word: 'Beta', meaning: 'second', review: false, learned: false },
  ];
  return makePage({
    source: toeicSource,
    kind: 'toeic',
    builtInCards,
    cards: options.cards || clone(builtInCards),
    storage: options.storage,
  });
}

function makeGsatPage(options = {}) {
  const levels = options.levels || [
    { level: 1, words: [{ id: 'l1-a' }, { id: 'l1-b' }] },
    { level: 2, words: [{ id: 'l2-a' }] },
  ];
  return makePage({
    source: gsatSource,
    kind: 'gsat',
    levels,
    storage: options.storage,
  });
}

async function settle(turns = 8) {
  for (let index = 0; index < turns; index += 1) await Promise.resolve();
}

const customA = {
  id: 'custom-a',
  word: 'custom alpha',
  meaning: 'a custom card',
  example: 'Custom alpha example.',
};
const customB = {
  id: 'custom-b',
  word: 'custom beta',
  meaning: 'another custom card',
  example: 'Custom beta example.',
};

test('TOEIC adapter round-trips progress, deletions, and custom cards through its cloud DTO', () => {
  const page = makeToeicPage({
    cards: [
      { id: 'b1', word: 'Alpha', meaning: 'first', review: false, learned: true },
      customA,
    ],
  });
  const options = page.cloud.options;
  assert.ok(options);

  const local = clone(options.readLocal());
  assert.equal(local.progress.b1, 'learned');
  assert.equal(local.deletedBuiltInById.b2, true);
  assert.deepEqual(Object.keys(local.customCardsById), ['custom-a']);

  const cloud = clone(options.toCloud({
    progress: { b1: 'learned', b2: 'review', invalid: 'learned' },
    deletedBuiltInById: { b2: true, invalid: true },
    customCardsById: { [customA.id]: customA, [customB.id]: customB },
    preferences: { theme: 'ocean', sound: 'off' },
  }));
  assert.equal(cloud.schemaVersion, 1);
  assert.equal(cloud.libraryVersion, 'toeic-library-v1');
  assert.deepEqual(cloud.progress, { b1: 'learned', b2: 'review' });
  assert.deepEqual(cloud.deletedBuiltInIds, ['b2']);
  assert.deepEqual(cloud.customCards.map(card => card.id), ['custom-a', 'custom-b']);

  const roundTrip = clone(options.fromCloud(cloud));
  assert.deepEqual(roundTrip.progress, { b1: 'learned', b2: 'review' });
  assert.deepEqual(roundTrip.deletedBuiltInById, { b2: true });
  assert.deepEqual(Object.keys(roundTrip.customCardsById), ['custom-a', 'custom-b']);

  const removed = clone(options.toCloud({
    progress: {}, deletedBuiltInById: {}, customCardsById: { [customB.id]: customB }, preferences: {},
  }));
  assert.deepEqual(removed.customCards.map(card => card.id), ['custom-b']);
  const readded = clone(options.toCloud({
    progress: {}, deletedBuiltInById: {}, customCardsById: { [customA.id]: customA, [customB.id]: customB }, preferences: {},
  }));
  assert.deepEqual(readded.customCards.map(card => card.id), ['custom-a', 'custom-b']);
});

test('TOEIC adapter captures real local changes and cloud application stays out of the dirty loop', async () => {
  const storage = new StorageMock({
    'flipwords.theme': 'ocean',
    'flipwords.sound': 'off',
    'flipwords.ui.2026-09-11': JSON.stringify({ xp: 9, combo: 4 }),
  });
  const page = makeToeicPage({
    storage,
    cards: [
      { id: 'b1', word: 'Alpha', meaning: 'first', review: false, learned: false },
      customA,
    ],
  });
  let localChangeEvents = 0;
  let appliedEvents = 0;
  page.window.addEventListener('flipwords:local-change', event => {
    if (event.detail?.scope === 'toeic') localChangeEvents += 1;
  });
  page.window.addEventListener('flipwords:cloud-applied', event => {
    if (event.detail?.scope === 'toeic') appliedEvents += 1;
  });

  page.context.cards = [...page.context.cards, customB];
  await page.context.saveCards();
  assert.equal(page.cloud.changedCalls, 1);
  await page.window.dispatchEvent(new page.window.CustomEvent('flipwords:local-change', {
    detail: { scope: 'toeic' },
  }));
  await page.window.dispatchEvent(new page.window.CustomEvent('flipwords:local-change', {
    detail: { scope: 'other-page' },
  }));
  assert.equal(page.cloud.changedCalls, 2);
  assert.equal(localChangeEvents, 1);

  page.cloud.changedCalls = 0;
  page.context.cards = [
    { id: 'b1', word: 'Alpha', meaning: 'first', review: false, learned: true },
  ];
  page.cloud.options.applyLocal({
    progress: {}, deletedBuiltInById: {}, customCardsById: {}, preferences: {},
  });
  await settle();
  assert.equal(page.cloud.changedCalls, 0);
  assert.equal(appliedEvents, 1);
  assert.equal(page.reloads.length, 0);
  assert.equal(page.storage.getItem('flipwords.theme'), 'sakura');
  assert.equal(page.storage.getItem('flipwords.sound'), 'on');
  assert.deepEqual(JSON.parse(page.storage.getItem('flipwords.ui.2026-09-11')), { xp: 0, combo: 0 });
  assert.deepEqual(Object.keys(page.cloud.options.readLocal().customCardsById), []);
  assert.equal(localChangeEvents, 1);
});

test('7000 adapter sanitizes its DTO and applies cloud state through the page hook', async () => {
  const storage = new StorageMock({
    'flipwords:gsat-7000:progress:v1': JSON.stringify({ 'l1-a': 'learned', invalid: 'learned' }),
    'flipwords:gsat-7000:preferences:v1': JSON.stringify({
      level: 2, pile: 'review', currentByLevel: { 1: 'l1-a', 2: 'invalid' },
    }),
  });
  const page = makeGsatPage({ storage });
  const options = page.cloud.options;
  assert.ok(options);

  assert.deepEqual(clone(options.readLocal()), {
    progress: { 'l1-a': 'learned' },
    preferences: { level: 2, pile: 'review', currentByLevel: { 1: 'l1-a' } },
  });
  const cloud = clone(options.toCloud({
    progress: { 'l1-a': 'learned', 'l2-a': 'review', invalid: 'learned' },
    preferences: {
      level: 1,
      pile: 'new',
      currentByLevel: { 1: 'l1-b', 2: 'l1-a', 3: 'l2-a' },
    },
  }));
  assert.equal(cloud.schemaVersion, 1);
  assert.equal(cloud.libraryVersion, 'gsat-7000-v1');
  assert.deepEqual(cloud.progress, { 'l1-a': 'learned', 'l2-a': 'review' });
  assert.deepEqual(cloud.preferences, {
    level: 1,
    pile: 'new',
    currentByLevel: { 1: 'l1-b' },
  });
  assert.deepEqual(clone(options.fromCloud(cloud)), {
    progress: { 'l1-a': 'learned', 'l2-a': 'review' },
    preferences: { level: 1, pile: 'new', currentByLevel: { 1: 'l1-b' } },
  });

  let appliedEvents = 0;
  page.window.addEventListener('flipwords:cloud-applied', event => {
    if (event.detail?.scope === 'gsat-7000') appliedEvents += 1;
  });
  page.cloud.changedCalls = 0;
  options.applyLocal({
    progress: { 'l1-b': 'review', invalid: 'learned' },
    preferences: { level: 1, pile: 'learned', currentByLevel: { 1: 'l1-b', 2: 'invalid' } },
  });
  await settle();
  assert.deepEqual(page.appliedCloud.at(-1), {
    progress: { 'l1-b': 'review' },
    preferences: { level: 1, pile: 'learned', currentByLevel: { 1: 'l1-b' } },
  });
  assert.equal(page.cloud.changedCalls, 0);
  assert.equal(appliedEvents, 1);

  await page.window.dispatchEvent(new page.window.CustomEvent('flipwords:local-change', {
    detail: { scope: 'gsat-7000' },
  }));
  await page.window.dispatchEvent(new page.window.CustomEvent('flipwords:local-change', {
    detail: { scope: 'toeic' },
  }));
  assert.equal(page.cloud.changedCalls, 1);
});

async function assertSignOutGate(makePageForAdapter) {
  const blocked = makePageForAdapter();
  await blocked.auth.trigger({ uid: 'user-1', email: 'user@example.com' });
  blocked.cloud.flushBehavior = () => false;
  await blocked.signOutButton.dispatch('click');
  assert.equal(blocked.cloud.flushCalls, 1);
  assert.equal(blocked.auth.signOutCalls, 0);

  const rejected = makePageForAdapter();
  await rejected.auth.trigger({ uid: 'user-1' });
  rejected.cloud.flushBehavior = () => Promise.reject(new Error('flush failed'));
  await rejected.signOutButton.dispatch('click');
  assert.equal(rejected.auth.signOutCalls, 0);

  const allowed = makePageForAdapter();
  await allowed.auth.trigger({ uid: 'user-1' });
  allowed.cloud.flushBehavior = () => true;
  await allowed.signOutButton.dispatch('click');
  assert.equal(allowed.auth.signOutCalls, 1);
}

test('TOEIC sign-out requires a successful cloud flush', async () => {
  await assertSignOutGate(() => makeToeicPage());
});

test('7000 sign-out requires a successful cloud flush', async () => {
  await assertSignOutGate(() => makeGsatPage());
});
