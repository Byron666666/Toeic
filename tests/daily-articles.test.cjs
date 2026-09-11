const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// Run the actual daily entry point and inspect the page it writes for the browser.
async function loadDailyPage() {
  let html = '';
  let closed = false;
  const requests = [];
  const context = vm.createContext({
    fetch: async file => {
      requests.push(file);
      return { text: async () => read(file) };
    },
    document: {
      open() {},
      write(value) { html += value; },
      close() { closed = true; },
    },
  });
  const inline = read('daily.html').match(/<script>([\s\S]*?)<\/script>/)[1];
  await vm.runInContext(inline, context);
  assert.deepEqual(requests, ['articles.html']);
  assert.ok(closed, 'the daily entry point finishes writing the page');
  const scripts = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map(match => match[1]);
  return scripts;
}

test('daily entry loads every published day exactly once before rendering', async () => {
  const scripts = await loadDailyPage();
  const expected = fs.readdirSync(root).filter(file => /^articles-day\d{3}\.js$/.test(file)).sort();
  const loaded = scripts.filter(file => /^articles-day\d{3}\.js$/.test(file));
  assert.deepEqual(loaded, expected, 'published day files must not be omitted from the daily page');
  const renderer = scripts.indexOf('articles.js');
  assert.ok(renderer >= 0);
  for (const file of ['articles-data.js', 'articles-extra-data.js', ...expected, 'articles-day017-018-fix.js']) {
    assert.ok(scripts.indexOf(file) >= 0 && scripts.indexOf(file) < renderer, `${file} loads before rendering`);
  }
  assert.ok(scripts.indexOf('articles-flip-fix.js') > renderer, 'keep the translation flip fix after rendering');
});

test('daily data includes a continuous archive through Day 33 with complete new articles', async () => {
  const scripts = await loadDailyPage();
  const context = vm.createContext({ window: {} });
  for (const file of scripts.slice(0, scripts.indexOf('articles.js'))) {
    if (file.startsWith('articles-')) vm.runInContext(read(file), context, { filename: file });
  }
  const articles = context.window.TOEIC_ARTICLES;
  const latest = Math.max(...fs.readdirSync(root).map(file => Number(file.match(/^articles-day(\d{3})\.js$/)?.[1] || 0)));
  assert.ok(latest >= 33);
  assert.deepEqual(Array.from(articles, article => article.day), Array.from({ length: latest }, (_, i) => i + 1));
  assert.equal(new Set(articles.map(article => article.id)).size, articles.length);
  for (const day of [31, 32, 33]) {
    const article = articles.find(item => item.day === day);
    assert.equal(article.id, `day-${String(day).padStart(3, '0')}`);
    assert.ok(article.title);
    assert.equal(article.targetWords.length, 60);
    assert.ok(article.paragraphs.length > 0);
    assert.equal(article.translation.length, article.paragraphs.length);
    assert.ok(article.translation.every(text => text.trim()));
    assert.ok(article.questions.length > 0);
  }
});
