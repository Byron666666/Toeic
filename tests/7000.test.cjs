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
const dataCode = fs.readFileSync(path.join(root, '7000/vocab-data.js'), 'utf8');
const P = 'flipwords:gsat-7000:progress:v1';
const F = 'flipwords:gsat-7000:preferences:v1';

class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.attributes = {}; this.style = {};
    this.dataset = {}; this.listeners = {}; this.value = ''; this.textContent = '';
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
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(key, callback) { this.listeners[key] = callback; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children.flatMap(c => c.tag === 'fragment' ? c.children : [c]); }
  scrollIntoView() {}
  closest(selectors) { return selectors.split(',').map(s => s.trim()).includes(this.tag) ? this : null; }
}

function boot(initial = {}, { blockedStorage = false, missingData = false, speech = true } = {}) {
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
  const window = { setTimeout: () => 1, clearTimeout: () => {} };
  if (speech) window.speechSynthesis = { cancel() {}, speak(utterance) { spoken.push(utterance); } };
  const context = {
    window, document, Intl, console,
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('blocked'); return storage[key] ?? null; },
      setItem(key, value) { if (blockedStorage) throw Error('blocked'); storage[key] = value; writes.push(key); },
    },
  };
  if (speech) window.SpeechSynthesisUtterance = context.SpeechSynthesisUtterance;
  vm.createContext(context);
  if (!missingData) vm.runInContext(dataCode, context);
  const instrumented = app.replace(/\}\)\(\);\s*$/, `window.testAPI = {
    state, setLevel, refresh, currentWord, selectWord, moveCard, flipCard,
    randomCard, setCurrentStatus, speakCurrentWord, clearFilters
  }; })();`);
  vm.runInContext(instrumented, context);
  return { api: window.testAPI, data: window.GSAT_7000_DATA, nodes, storage, writes, docEvents, spoken, document };
}

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
  assert.equal(nodes.get('.card-front').attributes['aria-hidden'], 'true');
  api.moveCard(-1); assert.equal(api.currentWord().id, 'l1-1025');
  assert.equal(api.state.flipped, false);
  api.moveCard(1); assert.equal(api.currentWord().id, 'l1-0001');
  api.randomCard(); assert.notEqual(api.currentWord().id, 'l1-0001');
});

test('search and empty state disable all study actions', () => {
  const { api, nodes } = boot();
  for (const query of ['ABLE', '能，可以', 'ˋeb!']) {
    api.state.query = query; api.refresh(); assert.ok(api.state.queue.some(w => w.word === 'able'));
  }
  api.state.query = 'no-such-word-987654321'; api.refresh();
  assert.equal(api.currentWord(), null);
  for (const id of ['flashcard','reviewButton','learnedButton','speakButton','flipButton','nextButton']) {
    assert.equal(nodes.get('#' + id).disabled, true);
  }
  api.moveCard(1); api.randomCard(); api.flipCard(); api.setCurrentStatus('learned');
  api.clearFilters(); assert.equal(api.state.queue.length, 1025);
  assert.equal(nodes.get('#learnedButton').disabled, false);
});

test('statuses are exclusive and never write TOEIC data', () => {
  const sentinel = '{"existing":"TOEIC progress"}';
  const { api, storage, writes } = boot({ 'flipwords.cards.v1': sentinel });
  api.setCurrentStatus('learned');
  assert.equal(JSON.parse(storage[P])['l1-0001'], 'learned');
  api.setCurrentStatus('review');
  assert.equal(JSON.parse(storage[P])['l1-0001'], 'review');
  api.setCurrentStatus('review');
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
  api.setCurrentStatus('learned'); assert.equal(api.state.queue.length, 0);
});

test('pagination and empty search hide load-more', () => {
  const { nodes, api } = boot();
  assert.equal(nodes.get('#wordList').children.length, 90);
  nodes.get('#loadMoreButton').listeners.click();
  assert.equal(nodes.get('#wordList').children.length, 180);
  api.state.query = 'abbreviate'; api.setLevel(6);
  api.state.query = 'abbreviate'; api.refresh();
  assert.equal(nodes.get('#loadMoreButton').hidden, true);
  const css = fs.readFileSync(path.join(root, '7000/styles.css'), 'utf8');
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
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
  assert.match(blocked.nodes.get('#toast').textContent, /無法儲存/);
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

test('static paths resolve and 7000 loads no TOEIC/Firebase scripts', () => {
  for (const relative of ['index.html', '7000/index.html']) {
    const text = fs.readFileSync(path.join(root, relative), 'utf8');
    const ids = Array.from(text.matchAll(/id="([^"]+)"/g), m => m[1]);
    assert.equal(ids.length, new Set(ids).size);
    for (const [, ref] of text.matchAll(/(?:src|href)="([^"]+)"/g)) {
      if (/^(?:https?:|#)/.test(ref)) continue;
      assert.ok(fs.existsSync(path.resolve(root, path.dirname(relative), ref)), ref);
    }
  }
  assert.ok(!/firebase|\.\.\/app\.js|\.\.\/vocab-data\.js/.test(html));
  assert.match(html, /maximum-scale=1/);
  assert.match(html, /user-scalable=no/);
  assert.match(html, /src="\.\.\/touch-zoom-fix\.js"/);
  const css = fs.readFileSync(path.join(root, '7000/styles.css'), 'utf8');
  assert.match(css, /touch-action:\s*manipulation/);
});
