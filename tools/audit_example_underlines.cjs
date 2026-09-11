const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({ window: {} });
for (const file of ['vocab-data.js', 'card-details-data.js', '7000/vocab-data.js', '7000/enrichment-data.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const records = [
  ...context.window.PDF_VOCAB_CARDS.map(card => ({ scope: 'toeic', id: card.id, word: card.word,
    example: card.example || context.window.VOCAB_AUTO_DETAILS[card.word.toLowerCase()]?.example || '' })),
  ...context.window.GSAT_7000_DATA.levels.flatMap(level => level.words.flatMap(word =>
    (context.window.GSAT_7000_ENRICHMENT.entries[word.id] || []).map(sense =>
      ({ scope: '7000', id: word.id, word: word.word, example: sense[2] })))),
];
const matcherPath = path.join(root, 'example-matcher.js');
vm.runInContext(fs.readFileSync(path.join(root, 'example-corrections.js'), 'utf8'), context);
for (const record of records) record.example = context.window.FlipWordsExampleCorrections(record.word, record.example, '').example;
if (fs.existsSync(matcherPath)) vm.runInContext(fs.readFileSync(matcherPath, 'utf8'), context);
const match = record => context.window.FlipWordsExampleMatcher.findRanges(record.example, record.word).length > 0;
for (const scope of ['toeic', '7000']) {
  const scoped = records.filter(record => record.scope === scope && record.example);
  const missing = scoped.filter(record => !match(record));
  console.log(JSON.stringify({ scope, examples: scoped.length, missing: missing.length, sample: missing.slice(0, Number(process.argv[2] || 30)) }, null, 2));
  if (missing.length) process.exitCode = 1;
}
