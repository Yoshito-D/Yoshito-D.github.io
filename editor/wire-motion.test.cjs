const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8');
const swing = source.slice(source.indexOf('// Transfer contact momentum'), source.indexOf('// Prepare fades'));

function setup({ reduced = false } = {}) {
  const listeners = new Map();
  const events = owner => ({ addEventListener(name, callback) { listeners.set(`${owner}:${name}`, callback); } });
  const frames = new Map();
  let nextFrame = 0;
  let time = 0;
  let transform;
  const link = {
    ...events('link'), focusVisible: false,
    matches() { return this.focusVisible; },
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 200, height: 200 })
  };
  const card = {
    hidden: false,
    querySelector: () => link,
    style: {
      setProperty(_name, value) { transform = value; },
      removeProperty() { transform = undefined; }
    }
  };
  const preference = { ...events('media'), matches: reduced };
  const document = { ...events('document'), hidden: false, querySelectorAll: () => [card] };
  vm.runInNewContext(swing, {
    document, performance: { now: () => time },
    window: {
      ...events('window'), matchMedia: () => preference,
      requestAnimationFrame(callback) {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame(id) { frames.delete(id); }
    }
  });
  return {
    frames, link, card, document,
    angles() { return transform && [...transform.matchAll(/rotate([XYZ])\(([-.\d]+)deg\)/g)].map(match => Number(match[2])); },
    advance(milliseconds) {
      time += milliseconds;
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach(callback => callback(time));
    },
    event(owner, name, value = {}) { listeners.get(`${owner}:${name}`)?.({ isPrimary: true, timeStamp: time, ...value }); },
    hover(x, y) { this.event('link', 'pointerenter', { pointerType: 'mouse', clientX: x, clientY: y }); },
    move(x, y) { this.event('document', 'pointermove', { pointerType: 'mouse', clientX: x, clientY: y }); },
    tap(x, y) { this.event('link', 'pointerdown', { pointerType: 'touch', clientX: x, clientY: y }); }
  };
}

test('left and right contacts swing away, then overshoot and settle', () => {
  for (const [x, sign] of [[100, -1], [300, 1]]) {
    const page = setup();
    page.hover(x, 150);
    page.advance(95);
    const [roll, yaw, pitch] = page.angles();
    assert.equal(Math.sign(roll), sign);
    assert.equal(Math.sign(yaw), sign);
    assert.equal(pitch, 0);
    page.advance(250);
    assert.equal(Math.sign(page.angles()[0]), -sign);
    assert.ok(Math.abs(page.angles()[0]) < Math.abs(roll));
    page.advance(1500);
    assert.equal(page.angles(), undefined);
    assert.equal(page.frames.size, 0);
  }
});

test('hover uses the approach vector and a quicker pass adds momentum', () => {
  const approach = (x, y, time) => {
    const page = setup();
    page.move(x, y);
    page.advance(time);
    page.hover(105, 55);
    page.advance(95);
    return page.angles();
  };
  const horizontal = approach(65, 55, 45);
  const vertical = approach(105, 15, 45);
  const diagonal = approach(65, 15, 45);
  assert.ok(horizontal[0] < 0);
  assert.equal(horizontal[2], 0);
  assert.equal(vertical[0], 0);
  assert.ok(vertical[2] < 0);
  assert.ok(diagonal[0] < 0 && diagonal[2] < 0);
  assert.ok(Math.abs(approach(65, 55, 10)[0]) > Math.abs(horizontal[0]));
});

test('touch uses the contact position and leaves native link activation alone', () => {
  const page = setup();
  page.event('link', 'pointerenter', { pointerType: 'touch', clientX: 200, clientY: 245 });
  page.event('link', 'pointerdown', { pointerType: 'touch', isPrimary: false, clientX: 200, clientY: 245 });
  page.event('link', 'pointerdown', { pointerType: 'mouse', clientX: 200, clientY: 245 });
  assert.equal(page.frames.size, 0);
  page.tap(200, 245);
  page.event('link', 'focus');
  page.advance(95);
  const [roll, yaw, pitch] = page.angles();
  assert.equal(roll, 0);
  assert.equal(yaw, 0);
  assert.ok(pitch > 0);

  const top = setup();
  top.tap(200, 55);
  top.advance(95);
  assert.ok(top.angles()[2] < 0);
  assert.ok(pitch > Math.abs(top.angles()[2]));
  const keyboard = setup();
  keyboard.link.focusVisible = true;
  keyboard.event('link', 'focus');
  keyboard.advance(95);
  assert.ok(keyboard.angles()[0] < 0);
});

test('re-entry keeps the current position and adds momentum to the existing swing', () => {
  const page = setup();
  page.hover(100, 150);
  page.advance(95);
  const before = page.angles();
  page.hover(300, 150);
  assert.deepEqual(page.angles(), before);
  assert.equal(page.frames.size, 1);
  page.advance(16);
  assert.ok(page.angles()[0] > before[0]);

  const elapsedInOneFrame = setup();
  const elapsedInTwoFrames = setup();
  elapsedInOneFrame.hover(100, 150);
  elapsedInTwoFrames.hover(100, 150);
  elapsedInOneFrame.advance(95);
  elapsedInTwoFrames.advance(40);
  elapsedInTwoFrames.advance(55);
  assert.deepEqual(elapsedInOneFrame.angles(), elapsedInTwoFrames.angles());
});

test('reduced motion, hidden cards and lifecycle cleanup prevent unwanted swings', () => {
  const reduced = setup({ reduced: true });
  reduced.hover(100, 150);
  assert.equal(reduced.frames.size, 0);
  for (const [owner, name, value] of [
    ['media', 'change', { matches: true }], ['window', 'pagehide', {}],
    ['document', 'visibilitychange', {}], ['document', 'works-filter-change', {}]
  ]) {
    const page = setup();
    page.hover(300, 150);
    page.advance(95);
    assert.ok(page.angles());
    if (name === 'visibilitychange') page.document.hidden = true;
    page.event(owner, name, value);
    assert.equal(page.angles(), undefined, name);
    assert.equal(page.frames.size, 0, name);
  }
  const hidden = setup();
  hidden.card.hidden = true;
  hidden.hover(100, 150);
  assert.equal(hidden.frames.size, 0);
});
