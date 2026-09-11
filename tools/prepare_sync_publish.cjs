// Preserve the exact tested UTF-8 bytes when updating the public website.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const runtimePaths = [
  'cloud-sync-core.js', 'firebase-sync.js', '7000/firebase-sync-7000.js',
  '7000/app.js', 'ui-enhancements.js', 'index.html', '7000/index.html',
];
const sourcePaths = [...runtimePaths, 'tests/cloud-sync.test.cjs', 'tests/firebase-adapters.test.cjs', 'tests/7000.test.cjs', 'tools/prepare_sync_publish.cjs'];
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const files = sourcePaths.map(file => {
  const bytes = fs.readFileSync(path.join(root, file));
  const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  assert.ok(!/[\uFFFD\uE000-\uF8FF]/u.test(content), `${file}: damaged text`);
  if (/\.(?:cjs|js)$/.test(file)) new vm.Script(content, { filename: file });
  if (file.endsWith('.html')) {
    assert.ok(content.includes('<meta charset="UTF-8" />'));
    assert.ok(content.includes('cloud-sync-core.js?v=20260911-sync1'));
    assert.ok(content.indexOf('cloud-sync-core.js') < content.indexOf(file.startsWith('7000/') ? 'firebase-sync-7000.js' : 'firebase-sync.js'));
  }
  return { path: file, content, sha256: hash(bytes) };
});

async function main() {
  if (process.argv.includes('--verify-live')) {
    for (const file of files.filter(file => runtimePaths.includes(file.path))) {
      const response = await fetch(`https://byron666666.github.io/Toeic/${file.path}?verify=${Date.now()}`, {
        signal: AbortSignal.timeout(20000),
      });
      assert.equal(response.status, 200, `${file.path}: HTTP status`);
      assert.equal(hash(Buffer.from(await response.arrayBuffer())), file.sha256, `${file.path}: live bytes differ`);
      console.log(`${file.path}: live UTF-8 bytes match`);
    }
    return;
  }
  if (process.argv.includes('--manifest')) {
    console.log(JSON.stringify(files.map(({ path, content, sha256 }) => ({ path, bytes: Buffer.byteLength(content), sha256 })), null, 2));
    return;
  }
  process.stdout.write(JSON.stringify(files).replace(/[^\x00-\x7F]/g,
    char => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0')));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
