// Read source bytes explicitly as UTF-8; never upload PowerShell Get-Content output.
// ASCII-only JSON protects the payload from terminal encoding conversions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const scope = process.argv.includes('--toeic') ? '' : '7000/';
const paths = process.argv.includes('--all')
  ? ['example-matcher.js', 'example-corrections.js', 'app.js', 'styles.css', '7000/app.js', 'index.html', '7000/index.html', '7000/styles.css']
  : ['example-matcher.js', 'example-corrections.js', ...['app.js', 'styles.css', 'index.html'].map(name => scope + name)];
const files = paths.map(file => {
  const bytes = fs.readFileSync(path.join(root, file));
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.ok(!/[\uFFFD\uE000-\uF8FF]/u.test(content), `${file}: damaged text`);
  if (file.endsWith('.js')) new vm.Script(content, { filename: file });
  if (file.endsWith('.html')) {
    assert.ok(content.includes('<meta charset="UTF-8" />'));
    assert.ok(content.includes(file.startsWith('7000/') ? '<title>FlipWords 7000 單字卡</title>' : '<title>FlipWords 多益單字卡</title>'));
  }
  return { path: file, content, sha256: hash(bytes) };
});

async function main() {
  if (process.argv.includes('--verify-live')) {
    for (const file of files) {
      const url = `https://byron666666.github.io/Toeic/${file.path}?verify=${Date.now()}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      assert.equal(response.status, 200, `${file.path}: HTTP status`);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(hash(bytes), file.sha256, `${file.path}: live bytes differ from tested source`);
      console.log(`${file.path}: live UTF-8 bytes match (${file.sha256})`);
    }
    return;
  }
  process.stdout.write(JSON.stringify(files).replace(/[^\x00-\x7F]/g,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
