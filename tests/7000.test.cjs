// Dependency-free regression tests. This DOM facade tests application logic,
// not browser layout, native keyboard activation or actual speech audio.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, '7000/index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, '7000/app.js'), 'utf8');
const firebaseSync = fs.readFileSync(path.join(root, '7000/firebase-sync-7000.js'), 'utf8');
const dataCode = fs.readFileSync(path.join(root, '7000/vocab-data.js'), 'utf8');
const P = 'flipwords:gsat-7000:progress:v1';
const F = 'flipwords:gsat-7000:preferences:v1';

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.attributes = {}; this.style = {};
    this.dataset = {}; this.listeners = {}; this.value = ''; this._textContent = '';
    const classes = new Set();
    this.classList = {
      contains: value => classes.has(value),
      add: (...values) => values.forEach(value => classes.add(value)),
      remove: (...values) => values.forEach(value => classes.delete(value)),
      toggle: (value, force) => {
        const on = force ?? !classes.has(value);
        if (on) classes.add(value); else classes.delete(value);
        return on;
      },
    };
  }
  get textContent() {
    return this.children.length ? this.children.map(child => child.textContent ?? '').join('') : this._textContent;
  }
  set textContent(value) { this._textContent = String(value ?? ''); this.children = []; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, callback) { this.listeners[key] = callback; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children.flatMap(c => c.tag === 'fragment' ? c.children : [c]); }
  scrollIntoView() {}
  closest(selectors) { return selectors.split(',').map(s => s.trim()).includes(this.tag) ? this : null; }
}

function boot(initial = {}, {
  blockedStorage = false, missingData = false, speech = true, enrichment = null, randomValues = null,
} = {}) {
  const storage = { ...initial }, writes = [];
  const nodes = new Map([...html.matchAll(/id="([^"]+)"/g)].map(m => ['#' + m[1], new Element()]));
  nodes.set('.card-front', new Element()); nodes.set('.card-back', new Element());
  const radios = ['all','new','review','learned'].map(value => {
    const node = new Element('input'); node.value = value;
    nodes.set(`input[name="statusFilter"][value="${value}"]`, node);
    return node;
  });
  const docEvents = {}, spoken = [];
  const document = {
    body: new Element(),
    querySelector(selector) {
      assert.ok(nodes.has(selector), `unknown DOM selector ${selector}`);
      return nodes.get(selector);
    },
    querySelectorAll: () => radios,
    createElement: tag => new Element(tag),
    createDocumentFragment: () => new Element('fragment'),
    addEventListener: (name, fn) => { docEvents[name] = fn; },
  };
  const localChanges = [];
  const window = {
    setTimeout: () => 1, clearTimeout: () => {},
    CustomEvent: function (type, options) { this.type = type; this.detail = options.detail; },
    dispatchEvent: event => { localChanges.push(event); },
  };
  if (speech) window.speechSynthesis = { cancel() {}, speak(utterance) { spoken.push(utterance); } };
  const random = Array.isArray(randomValues) && randomValues.length
    ? (() => randomValues.shift()) : Math.random;
  const testMath = Object.create(Math);
  testMath.random = random;
  const context = {
    window, document, Intl, console, Math: testMath,
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('blocked'); return storage[key] ?? null; },
      setItem(key, value) { if (blockedStorage) throw Error('blocked'); storage[key] = value; writes.push(key); },
    },
  };
  if (speech) window.SpeechSynthesisUtterance = context.SpeechSynthesisUtterance;
  vm.createContext(context);
  for (const file of ['example-matcher.js', 'example-corrections.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  if (!missingData) vm.runInContext(dataCode, context);
  if (enrichment) window.GSAT_7000_ENRICHMENT = { entries: enrichment };
  else if (fs.existsSync(path.join(root, '7000/enrichment-data.js'))) {
    vm.runInContext(fs.readFileSync(path.join(root, '7000/enrichment-data.js'), 'utf8'), context);
  }
  const instrumented = app.replace(/\}\)\(\);\s*$/, `window.testAPI = {
    state, setLevel, refresh, currentWord, selectWord, moveCard, flipCard,
    randomCard, setCurrentStatus, speakCurrentWord, clearFilters
  }; })();`);
  vm.runInContext(instrumented, context);
  return { api: window.testAPI, cloudApi: window.FlipWords7000, localChanges, data: window.GSAT_7000_DATA, nodes, storage, writes, docEvents, spoken, document };
}

test('cloud progress refreshes the visible card without emitting local edits', () => {
  const { api, cloudApi, storage, localChanges } = boot();
  const before = localChanges.length;
  cloudApi.applyCloudState({
    progress: { 'l2-0003': 'learned', 'l1-0002': 'review' },
    preferences: { level: 2, pile: 'learned', currentByLevel: { 2: 'l2-0003' } },
  });
  assert.equal(api.state.level, 2);
  assert.equal(api.state.statusFilter, 'learned');
  assert.equal(api.currentWord().id, 'l2-0003');
  assert.equal(JSON.parse(storage[P])['l1-0002'], 'review');
  assert.equal(localChanges.length, before);
});

test('an empty cloud account clears the previous account progress and positions', () => {
  const { api, cloudApi, storage, localChanges } = boot({
    [P]: JSON.stringify({ 'l3-0004': 'learned' }),
    [F]: JSON.stringify({ level: 3, pile: 'learned', currentByLevel: { 3: 'l3-0004' } }),
  });
  const before = localChanges.length;
  cloudApi.applyCloudState({ progress: {}, preferences: { currentByLevel: {} } });
  assert.deepEqual(JSON.parse(storage[P]), {});
  assert.equal(api.state.level, 1);
  assert.equal(api.state.statusFilter, 'new');
  assert.equal(api.state.currentByLevel[3], undefined);
  assert.equal(api.currentWord().id, 'l1-0001');
  assert.equal(localChanges.length, before);
});

test('six levels, valid unique IDs and traceable source records', () => {
  const { data } = boot();
  assert.deepEqual(Array.from(data.levels, l => l.words.length), [1025,1049,1094,1094,1087,1078]);
  const ids = new Set();
  const ranges = [[1,11],[12,22],[23,34],[35,51],[52,63],[64,75]];
  for (const level of data.levels) for (const word of level.words) {
    assert.ok(word.word.trim() && word.meaning.trim() && word.sourceText.trim());
    assert.ok(!ids.has(word.id)); ids.add(word.id);
    assert.ok(word.id.startsWith(`l${level.level}-`));
    const [from,to] = ranges[level.level-1];
    assert.ok(word.sourcePage >= from && word.sourcePage <= to);
    assert.ok(!/[\ue000-\uf8ff\ufffd]/.test(word.meaning));
    assert.ok(!/[\u3400-\u9fff]/.test(word.word));
  }
  assert.equal(ids.size, 6427);
});

test('PDF regressions: split words, aliases, and untruncated definitions', () => {
  const words = boot().data.levels.flatMap(l => l.words);
  const find = name => words.find(w => w.word === name);
  for (const name of ['angel','pollution','autograph / signature']) assert.ok(find(name), name);
  assert.match(find('DVD').meaning, /^DVD 碟片/);
  assert.match(find('I').meaning, /^\(主格\)我/);
  assert.ok(words.some(w => w.word.includes('bun') && w.word.includes('roll')));
  assert.ok(words.some(w => w.word.includes('congressman') && w.word.includes('congresswoman')));
  assert.match(find('bacteria').meaning, /^\[複\]/);
  assert.ok(find('afford').meaning.includes('(常與'));
});

test('load, level switching and positions are independent', () => {
  const { api, nodes, storage } = boot();
  assert.equal(api.currentWord().word, 'a / an');
  assert.equal(nodes.get('#levelGrid').children.length, 6);
  for (let level = 1; level <= 6; level++) {
    api.setLevel(level); api.moveCard(3);
    assert.equal(api.state.level, level);
    assert.ok(api.currentWord().id.startsWith(`l${level}-`));
  }
  api.setLevel(1);
  assert.equal(api.currentWord().id, 'l1-0004');
  const reloaded = boot(storage);
  assert.equal(reloaded.api.currentWord().id, 'l1-0004');
});

test('flip, previous/next wrap and random selection', () => {
  const { api, nodes } = boot();
  api.flipCard(); assert.ok(nodes.get('#flashcard').classList.contains('is-flipped'));
  api.moveCard(-1); assert.equal(api.currentWord().id, 'l1-1025');
  assert.equal(api.state.flipped, false);
  api.moveCard(1); assert.equal(api.currentWord().id, 'l1-0001');
  api.randomCard(); assert.notEqual(api.currentWord().id, 'l1-0001');
});

test('Level controls remain attached during repeated clicks and dropdown changes', () => {
  const { api, nodes } = boot();
  const grid = nodes.get('#levelGrid');
  const buttons = [...grid.children];
  for (const level of [6, 2, 5, 1, 4, 3, 6, 1]) {
    const button = buttons[level - 1];
    grid.listeners.click({ target: { closest: () => button } });
    assert.equal(api.state.level, level);
    assert.ok(api.currentWord().id.startsWith(`l${level}-`));
    assert.equal(nodes.get('#levelSelect').value, String(level));
    for (let index = 0; index < 6; index++) assert.equal(grid.children[index], buttons[index]);
    assert.equal(button.attributes['aria-pressed'], 'true');
  }
  nodes.get('#levelSelect').value = '3';
  nodes.get('#levelSelect').listeners.change();
  assert.equal(api.state.level, 3);
  assert.equal(buttons[2].attributes['aria-pressed'], 'true');
});

test('random selection avoids the previous random card after manual navigation', () => {
  const { api } = boot({}, { randomValues: [0.999, 0.999] });
  api.randomCard();
  const firstRandomId = api.currentWord().id;
  api.moveCard(1);
  api.randomCard();
  assert.notEqual(api.currentWord().id, firstRandomId);
});

test('random draws exhaust every card before starting another non-repeating round', () => {
  const ids = ['l1-0001', 'l1-0002', 'l1-0003', 'l1-0004'];
  const { api } = boot({
    [P]: JSON.stringify(Object.fromEntries(ids.map(id => [id, 'review']))),
    [F]: JSON.stringify({ pile: 'review' }),
  }, { randomValues: Array(8).fill(0.999) });
  let previousRoundLast;
  for (let round = 0; round < 2; round++) {
    const drawn = [];
    for (let i = 0; i < ids.length; i++) {
      api.randomCard();
      drawn.push(api.currentWord().id);
    }
    assert.equal(new Set(drawn).size, ids.length);
    assert.deepEqual([...drawn].sort(), [...ids].sort());
    if (previousRoundLast) assert.notEqual(drawn[0], previousRoundLast);
    previousRoundLast = drawn.at(-1);
  }
});

test('random round survives navigation and Level changes, including the last visible unseen card', () => {
  const ids = ['l1-0001', 'l1-0002', 'l1-0003', 'l1-0004'];
  const { api } = boot({
    [P]: JSON.stringify(Object.fromEntries(ids.map(id => [id, 'review']))),
    [F]: JSON.stringify({ pile: 'review' }),
  }, { randomValues: Array(4).fill(0.999) });
  const drawn = [];
  api.randomCard(); drawn.push(api.currentWord().id);
  api.moveCard(1);
  api.refresh();
  api.randomCard(); drawn.push(api.currentWord().id);
  api.setLevel(2);
  api.setLevel(1);
  api.randomCard(); drawn.push(api.currentWord().id);
  const lastUnseen = ids.find(id => !drawn.includes(id));
  api.selectWord(lastUnseen);
  api.randomCard(); drawn.push(api.currentWord().id);
  assert.equal(drawn.at(-1), lastUnseen);
  assert.deepEqual([...drawn].sort(), [...ids].sort());
});

test('progress changes do not restart a partly completed random round', () => {
  const ids = ['l1-0001', 'l1-0002', 'l1-0003', 'l1-0004'];
  const { api } = boot({
    [P]: JSON.stringify(Object.fromEntries(ids.map(id => [id, 'review']))),
    [F]: JSON.stringify({ pile: 'review' }),
  }, { randomValues: Array(3).fill(0.999) });
  const drawn = [];
  api.randomCard(); drawn.push(api.currentWord().id);
  api.randomCard(); drawn.push(api.currentWord().id);
  const unseen = ids.filter(id => !drawn.includes(id));
  api.selectWord(unseen[0]);
  api.setCurrentStatus('learned');
  api.randomCard();
  assert.equal(api.currentWord().id, unseen[1]);
});

test('single-card random rounds and an emptied pile remain safe', () => {
  const { api } = boot({
    [P]: JSON.stringify({ 'l1-0001': 'review' }),
    [F]: JSON.stringify({ pile: 'review' }),
  }, { randomValues: [0, 0] });
  api.randomCard(); assert.equal(api.currentWord().id, 'l1-0001');
  api.randomCard(); assert.equal(api.currentWord().id, 'l1-0001');
  api.setCurrentStatus('learned');
  api.randomCard(); assert.equal(api.currentWord(), null);
});

test('search and empty state disable all study actions', () => {
  const { api, nodes } = boot();
  for (const query of ['ABLE', '能，可以', 'ˋeb!']) {
    api.state.query = query; api.refresh(); assert.ok(api.state.queue.some(w => w.word === 'able'));
  }
  api.state.query = 'no-such-word-987654321'; api.refresh();
  assert.equal(api.currentWord(), null);
  for (const id of ['reviewToggle','learnedToggle','pronounceButton','flipButton','nextButton']) {
    assert.equal(nodes.get('#' + id).disabled, true);
  }
  api.moveCard(1); api.randomCard(); api.flipCard(); api.setCurrentStatus('learned');
  api.clearFilters(); assert.equal(api.state.queue.length, 1025);
  assert.equal(nodes.get('#learnedToggle').disabled, false);
});

test('statuses are exclusive and never write TOEIC data', () => {
  const sentinel = '{"existing":"TOEIC progress"}';
  const { api, storage, writes } = boot({ 'flipwords.cards.v1': sentinel });
  api.setCurrentStatus('learned');
  assert.equal(JSON.parse(storage[P])['l1-0001'], 'learned');
  api.state.statusFilter = 'learned'; api.refresh();
  api.setCurrentStatus('review');
  assert.equal(JSON.parse(storage[P])['l1-0001'], 'review');
  api.state.statusFilter = 'review'; api.refresh();
  api.setCurrentStatus('new');
  assert.equal(JSON.parse(storage[P])['l1-0001'], undefined);
  assert.equal(storage['flipwords.cards.v1'], sentinel);
  assert.ok(writes.every(key => key === P || key === F));
});

test('marking a filtered card advances to the adjacent remaining card', () => {
  const { api } = boot();
  api.state.statusFilter = 'new'; api.refresh();
  api.selectWord('l1-0050'); api.setCurrentStatus('learned');
  assert.equal(api.currentWord().id, 'l1-0051');
  api.state.statusFilter = 'learned'; api.refresh();
  assert.equal(api.state.queue.length, 1);
  api.setCurrentStatus('new'); assert.equal(api.state.queue.length, 0);
});

test('library list follows the active pile and search', () => {
  const { nodes, api } = boot();
  assert.equal(nodes.get('#cardList').children.length, 1025);
  api.state.query = 'abbreviate'; api.setLevel(6);
  api.state.query = 'abbreviate'; api.refresh();
  assert.equal(nodes.get('#cardList').children.length, 1);
  assert.equal(api.currentWord().word, 'abbreviate');
});

test('malformed JSON, storage objects and disabled storage do not crash', () => {
  for (const value of ['bad JSON', '[]', 'null', '12', '"abc"']) {
    assert.ok(boot({ [P]: value, [F]: value }).api.currentWord());
  }
  for (const value of ['abc', 7, [], null]) {
    assert.ok(boot({ [F]: JSON.stringify({ level: 999, currentByLevel: value }) }).api.currentWord());
  }
  const blocked = boot({}, { blockedStorage: true });
  blocked.api.setCurrentStatus('learned');
  assert.match(blocked.nodes.get('#voiceStatus').textContent, /無法儲存/);
});

test('keyboard leaves editable inputs/native Space activation alone', () => {
  const { api, docEvents } = boot();
  let prevented = 0;
  const key = (target, overrides) => docEvents.keydown({ target, preventDefault() { prevented++; }, ...overrides });
  key(new Element('input'), { key:'ArrowRight' }); assert.equal(api.currentWord().id,'l1-0001');
  key(new Element('button'), { code:'Space' }); assert.equal(api.state.flipped,false);
  key(new Element('button'), { key:'ArrowRight' }); assert.equal(api.currentWord().id,'l1-0002');
  key(new Element('div'), { code:'Space' }); assert.equal(api.state.flipped,true);
  assert.equal(prevented,2);
});

test('speech text retains optional endings but removes sense numbers', () => {
  const { api, spoken } = boot();
  api.selectWord('l1-0021');
  const agreement = api.state.queue.find(w => w.word === 'agree(ment)');
  assert.ok(agreement); api.selectWord(agreement.id); api.speakCurrentWord();
  assert.equal(spoken.at(-1).text, 'agreement');
  assert.equal(spoken.at(-1).lang, 'en-US');
  const unavailable = boot({}, { speech:false }); unavailable.api.speakCurrentWord();
  assert.match(unavailable.nodes.get('#voiceStatus').textContent, /不支援/);
});

test('missing data shows a readable error', () => {
  const { document } = boot({}, { missingData:true });
  assert.match(document.body.innerHTML, /載入失敗/);
});

test('static paths resolve and 7000 loads its isolated Firebase sync', () => {
  for (const relative of ['index.html', '7000/index.html']) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    const ids = Array.from(text.matchAll(/id="([^"]+)"/g), m => m[1]);
    assert.equal(ids.length, new Set(ids).size);
    for (const [, ref] of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(?:https?:|#)/.test(ref)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(relative), ref.split(/[?#]/)[0])), ref);
    }
  }
  assert.doesNotMatch(html, /\.\.\/app\.js|\.\.\/vocab-data\.js/);
  assert.match(html, /firebase-app-compat\.js/);
  assert.match(html, /firebase-auth-compat\.js/);
  assert.match(html, /firebase-firestore-compat\.js/);
  assert.match(html, /firebase-sync-7000\.js\?v=20260911-sync1/);
  assert.ok(html.indexOf('cloud-sync-core.js') < html.indexOf('firebase-sync-7000.js'));
  assert.match(html, /id="googleSignInButton"/);
  assert.match(html, /href="\.\.\/firebase-sync\.css"/);
  assert.match(html, /href="\.\.\/styles\.css"/);
  assert.match(html, /href="\.\.\/ui-enhancements\.css"/);
  assert.match(html, /class="study-panel"/);
  assert.match(html, /class="library-panel"/);
  assert.match(html, /data-storage-scope="gsat-7000"/);
  assert.match(html, /maximum-scale=1/);
  assert.match(html, /user-scalable=no/);
  assert.match(html, /src="\.\.\/touch-zoom-fix\.js(?:\?[^"\s]+)?"/);
  const css = fs.readFileSync(path.join(root, '7000/styles.css'), 'utf8');
  assert.match(css, /touch-action:\s*manipulation/);
});

test('7000 Firebase sync uses an isolated progress document and storage scope', () => {
  assert.match(firebaseSync, /flipwords-gsat-7000/);
  assert.match(firebaseSync, /flipwords:gsat-7000:progress:v1/);
  assert.match(firebaseSync, /flipwords:gsat-7000:preferences:v1/);
  assert.match(firebaseSync, /collection\("users"\)\.doc\(user\.uid\)/);
  assert.doesNotMatch(firebaseSync, /flipwords\.cards\.v2|BUILT_IN_LIBRARY_VERSION|customCards/);
});

const sampleEnrichment = {
  'l1-0002': [['有能力的', 'capable', 'She is able to repair this clock.', '她有能力修理這座時鐘。', 'be able to 後接原形動詞。']],
  'l1-0003': [
    ['介系詞：關於', 'concerning', 'The book is about local birds.', '這本書談的是當地鳥類。', ''],
    ['副詞：約', 'approximately', 'We waited about twenty minutes.', '我們等了大約二十分鐘。', ''],
  ],
};

test('sense examples, translations and notes change with the current card and clear in an empty pile', () => {
  const { api, nodes } = boot({}, { enrichment: sampleEnrichment });
  api.selectWord('l1-0002'); api.flipCard();
  let displayed = nodes.get('#cardEnrichment').children;
  assert.equal(displayed.length, 1);
  assert.equal(displayed[0].children[2].textContent, sampleEnrichment['l1-0002'][0][2]);
  assert.equal(displayed[0].children[2].attributes.lang, 'en');
  assert.ok(displayed[0].children[2].children.some(child =>
    child.className === 'example-word' && child.textContent === 'able'));
  assert.equal(displayed[0].children[3].textContent, '她有能力修理這座時鐘。');
  api.selectWord('l1-0003');
  assert.equal(nodes.get('#cardEnrichment').children.length, 2);
  api.state.query = 'no-such-word-987654321'; api.refresh();
  assert.equal(nodes.get('#cardEnrichment').children.length, 0);
});

test('search finds synonyms, the English example, Chinese translation and usage notes', () => {
  const { api } = boot({}, { enrichment: sampleEnrichment });
  for (const query of ['CAPABLE', 'repair this clock', '這座時鐘', '原形動詞']) {
    api.state.query = query; api.refresh();
    assert.ok(api.state.queue.some(word => word.id === 'l1-0002'), query);
  }
});

test('enrichment updates retain learned/review states, saved position and TOEIC storage', () => {
  const initial = { [P]: JSON.stringify({ 'l1-0001':'learned', 'l1-0002':'review' }),
    [F]: JSON.stringify({ level:1, pile:'review', currentByLevel:{ 1:'l1-0002', 3:'l3-0004' } }),
    'flipwords.cards.v1': 'existing TOEIC data' };
  const { api, storage } = boot(initial, { enrichment: sampleEnrichment });
  assert.equal(api.currentWord().id, 'l1-0002');
  assert.equal(storage[P], initial[P]);
  assert.equal(JSON.parse(storage[F]).currentByLevel[3], 'l3-0004');
  assert.equal(storage['flipwords.cards.v1'], initial['flipwords.cards.v1']);
});

test('supplementary text is inserted as literal text and missing data has an explicit message', () => {
  const unsafeText = '<img src=x onerror=alert(1)>';
  const { api, nodes } = boot({}, { enrichment: { 'l1-0002': [['義項','near word',unsafeText,'翻譯','']] } });
  api.selectWord('l1-0002');
  const example = nodes.get('#cardEnrichment').children[0].children[2];
  assert.equal(example.textContent, unsafeText);
  assert.equal(example.children.length, 0);
  api.selectWord('l1-0001');
  assert.match(nodes.get('#cardEnrichment').children[0].textContent, /無法載入/);
});

test('production enrichment covers all source cards and matches the approved source records', () => {
  const code = fs.readFileSync(path.join(root, '7000/enrichment-data.js'), 'utf8');
  const context = { window:{} };
  vm.runInNewContext(code, context);
  const entries = context.window.GSAT_7000_ENRICHMENT.entries;
  const words = boot().data.levels.flatMap(level => level.words);
  assert.equal(Object.keys(entries).length, words.length);
  for (const word of words) assert.ok(entries[word.id]?.length, word.id);
  for (let level=1; level<=6; level++) {
    const rows = fs.readFileSync(path.join(root, `7000/content/level-${level}.jsonl`), 'utf8')
      .replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const expected = {};
    for (const [id,...sense] of rows) (expected[id] ||= []).push(sense);
    for (const [id,senses] of Object.entries(expected)) {
      assert.equal(JSON.stringify(entries[id]), JSON.stringify(senses), id);
    }
  }
});
