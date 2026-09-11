const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');

// Minimal DOM for exercising the real app boot, event handlers and rendered text.
class Element {
  constructor() {
    this.children = []; this.nodes = new Map(); this.listeners = {};
    this.value = ''; this.style = {}; this.attributes = {}; this._text = '';
    this.classList = { toggle() {}, remove() {} };
  }
  set textContent(value) { this.children = []; this._text = value; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
  set innerHTML(value) { this.textContent = ''; this.nodes.clear(); }
  append(...nodes) { this.children.push(...nodes); }
  querySelector(selector) {
    if (!this.nodes.has(selector)) this.nodes.set(selector, new Element());
    return this.nodes.get(selector);
  }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(event, handler) { this.listeners[event] = handler; }
}

function boot(count = 3, duplicateIds = false) {
  const document = new Element();
  document.createElement = () => new Element();
  document.createTextNode = value => ({ textContent: value });
  const storage = new Map();
  const math = Object.create(Math);
  math.random = () => 0; // An unchanging RNG must never cause a retry loop.
  const context = vm.createContext({
    document, console, Math: math,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    window: {
      location: { hostname: 'localhost', pathname: '/', href: 'http://localhost/' },
      PDF_VOCAB_CARDS: Array.from({ length: count }, (_, i) => ({
        id: duplicateIds ? 'shared-id' : 'card-' + i, word: ['able', 'agree(ment)', 'look up / consult'][i],
        meaning: '測試', example: ['Able people are able, not tables.', 'We agree on the agreement.', 'LOOK UP the word or consult a dictionary.'][i],
      })),
    },
  });
  for (const file of ['example-matcher.js', 'example-corrections.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  vm.runInContext(source + '\nglobalThis.api = { getCurrentCard, renderExample, setActivePile };', context);
  return { document, api: context.api, storage };
}

test('random clicks do not repeat even after manual navigation; progress is preserved', () => {
  const { document, api, storage } = boot();
  const before = JSON.stringify([...storage]);
  const random = document.querySelector('#shuffleButton').listeners.click;
  random();
  let previous = api.getCurrentCard().id;
  document.querySelector('#nextButton').listeners.click();
  for (let i = 0; i < 30; i++) {
    random();
    assert.notEqual(api.getCurrentCard().id, previous);
    previous = api.getCurrentCard().id;
  }
  assert.equal(JSON.stringify([...storage]), before);
});

test('two-card random draws alternate and one-card/empty piles remain safe', () => {
  const { document, api } = boot(2);
  const random = document.querySelector('#shuffleButton').listeners.click;
  let previous = api.getCurrentCard().id;
  for (let i = 0; i < 10; i++) {
    random(); assert.notEqual(api.getCurrentCard().id, previous); previous = api.getCurrentCard().id;
  }
  const single = boot(1);
  assert.equal(single.document.querySelector('#shuffleButton').disabled, true);
  single.document.querySelector('#shuffleButton').listeners.click();
  assert.equal(single.api.getCurrentCard().id, 'card-0');
  single.api.setActivePile('learned');
  single.document.querySelector('#shuffleButton').listeners.click();
  assert.equal(single.api.getCurrentCard(), null);
});

test('random draws distinguish words even when imported card IDs are duplicated', () => {
  const { document, api } = boot(3, true);
  let previous = api.getCurrentCard().word;
  for (let i = 0; i < 12; i++) {
    document.querySelector('#shuffleButton').listeners.click();
    assert.notEqual(api.getCurrentCard().word, previous);
    previous = api.getCurrentCard().word;
  }
});

test('underlines whole words, aliases and optional endings without altering sentence text', () => {
  const { document } = boot();
  const example = document.querySelector('#cardExample');
  const marked = () => example.children.filter(child => child.className === 'example-word').map(child => child.textContent);
  assert.equal(example.textContent, 'Able people are able, not tables.');
  assert.deepEqual(marked(), ['Able', 'able']);
  document.querySelector('#nextButton').listeners.click();
  assert.equal(example.textContent, 'We agree on the agreement.');
  assert.deepEqual(marked(), ['agree', 'agreement']);
  document.querySelector('#nextButton').listeners.click();
  assert.deepEqual(marked(), ['LOOK UP', 'consult']);
});

test('custom example markup stays literal and empty examples clear old underlines', () => {
  const { document, api } = boot();
  const sentence = '<img src=x onerror=alert(1)> able';
  api.renderExample({ word: 'able', example: sentence });
  const example = document.querySelector('#cardExample');
  assert.equal(example.textContent, sentence);
  assert.ok(example.children.every(child => !child.attributes?.onerror));
  api.renderExample({ word: 'able', example: '' });
  assert.equal(example.textContent, '尚未填寫例句');
  assert.equal(example.children.length, 0);
});
