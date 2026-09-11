const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({ window: {} });
for (const file of ['example-matcher.js', 'example-corrections.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
const marked = (word, example) => Array.from(context.window.FlipWordsExampleMatcher.findRanges(example, word), ([start, end]) => example.slice(start, end));

test('matches regular, irregular, plural and possessive forms', () => {
  for (const [word, sentence, expected] of [
    ['abate', 'The storm is abating.', 'abating'], ['become', 'It became cold.', 'became'],
    ['child', 'The children laughed.', 'children'], ['audience', "The audience's attention wandered.", "audience's"],
    ['arm (1)', 'His arms hurt.', 'arms'], ['argue(ment)', 'The argument ended.', 'argument'],
    ['counter2 a.', 'It runs counter to our plans.', 'counter'], ['s w am p', 'A coastal swamp.', 'swamp'],
    ['someone', 'Someone called.', 'Someone'], ['lead (up/down) to', 'It led to trouble.', 'led to'],
    ['p.m. / pm', 'We meet at 4 p.m. today.', 'p.m.'],
  ]) assert.deepEqual(marked(word, sentence), [expected], word);
});

test('matches flexible phrase slots and only marks the fixed words around insertions', () => {
  assert.deepEqual(marked('achieve one\'s goal', 'You achieved your goal.'), ['achieved your goal']);
  assert.deepEqual(marked('be used to -ing', 'He is now used to taking the subway.'), ['is', 'used to']);
  assert.deepEqual(marked('advise A of B', 'We advised our clients of the changes.'), ['advised', 'of']);
  assert.deepEqual(marked('attend a conference', 'We attended a medical conference.'), ['attended a', 'conference']);
  assert.deepEqual(marked('vary from A to B', 'Costs vary from 10 to 50 dollars.'), ['vary from', 'to']);
  assert.deepEqual(marked('not A but B', 'It is not the price, but the quality that matters.'), ['not', 'but']);
});

test('does not underline substrings, unrelated phrases or matches across sentence boundaries', () => {
  for (const [word, sentence] of [
    ['art', 'The department arrived.'], ['able', 'The tables are stable.'],
    ['account payable', 'The account is open.'], ['look up', 'Look here. Up the road is a house.'],
    ['look up', 'Look. Up the road is a house.'],
    ['take off', 'We take turns talking about the office.'],
  ]) assert.deepEqual(marked(word, sentence), [], word);
});

test('curated example fixes require both the original sentence and headword', () => {
  const correct = context.window.FlipWordsExampleCorrections;
  assert.equal(correct('lace', 'Your shoelace is untied.', 'old').example, 'One of your shoe laces is untied.');
  assert.equal(correct('lace', 'My custom example.', 'custom').translation, 'custom');
  assert.equal(correct('shoelace', 'Your shoelace is untied.', 'original').translation, 'original');
});
