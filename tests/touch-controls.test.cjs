const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../touch-zoom-fix.js'), 'utf8');

function boot() {
  const listeners = {};
  let now = 1000;
  vm.runInNewContext(source, {
    Date: { now: () => now },
    document: { addEventListener: (name, handler) => { listeners[name] = handler; } },
  });
  return (target, elapsed = 100, name = 'touchend') => {
    now += elapsed;
    let prevented = false;
    listeners[name]({ target, touches: [], changedTouches: [{}], preventDefault() { prevented = true; } });
    return prevented;
  };
}
const control = () => ({ closest: () => ({}) });
const background = () => ({ closest: () => null });

test('rapid taps on Level buttons, controls and their nested labels are never canceled', () => {
  const dispatch = boot();
  const level1 = control(), level6 = control(), select = control(), label = control();
  for (const target of [level1, level6, level1, level1, select, label]) assert.equal(dispatch(target), false);
  assert.equal(dispatch(level1, 100, 'dblclick'), false);
});

test('background touch timing cannot suppress a subsequent control tap', () => {
  const dispatch = boot();
  dispatch(background());
  assert.equal(dispatch(control(), 30), false);
});

test('legacy double-tap prevention is confined to the same noninteractive target', () => {
  const dispatch = boot();
  const first = background(), second = background();
  assert.equal(dispatch(first), false);
  assert.equal(dispatch(second), false);
  assert.equal(dispatch(second), true);
  assert.equal(dispatch(second, 400), false);
});
