const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8');
const swing = source.slice(source.indexOf('// Restart a short'), source.indexOf('// Prepare fades'));

function setup({ reduced = false } = {}) {
  const listeners = new Map();
  const events = owner => ({ addEventListener(name, callback) { listeners.set(`${owner}:${name}`, callback); } });
  const animations = [];
  const target = () => ({
    transform: 'none',
    animate(keyframes, options) {
      const animation = { keyframes, options, cancelled: false, finished: new Promise(() => {}), cancel() { this.cancelled = true; } };
      animations.push(animation);
      return animation;
    }
  });
  const link = { ...target(), ...events('link'), focusVisible: false, matches() { return this.focusVisible; } };
  const wires = [target(), target()];
  const card = {
    ...events('card'), hidden: false,
    getBoundingClientRect: () => ({ left: 100, width: 200 }),
    querySelector: () => link, querySelectorAll: () => wires
  };
  const preference = { ...events('media'), matches: reduced };
  const document = { ...events('document'), hidden: false, querySelectorAll: () => [card] };
  vm.runInNewContext(swing, {
    document, window: { ...events('window'), matchMedia: () => preference },
    getComputedStyle: node => ({ transform: node.transform })
  });
  return {
    animations, link, wires, card, preference, document,
    event(owner, name, value = {}) { listeners.get(`${owner}:${name}`)?.(value); }
  };
}

test('left and right contacts push the board away and keep both wires in sync', () => {
  for (const [clientX, firstAngle] of [[100, -5], [300, 5]]) {
    const page = setup();
    page.event('card', 'pointerenter', { pointerType: 'mouse', clientX });
    assert.equal(page.animations.length, 3);
    for (const animation of page.animations) {
      assert.equal(animation.keyframes[1].transform, `rotate(${firstAngle}deg)`);
      assert.equal(animation.keyframes[2].transform, `rotate(${-firstAngle / 2}deg)`);
      assert.equal(animation.keyframes.at(-1).transform, 'rotate(0deg)');
      assert.equal(animation.options.duration, 1400);
    }
  }
});

test('touch starts once with its contact direction and pointer focus does not override it', () => {
  const page = setup();
  const contact = { pointerType: 'touch', clientX: 280 };
  page.event('card', 'pointerenter', contact);
  assert.equal(page.animations.length, 0);
  page.event('link', 'pointerdown', contact);
  page.event('link', 'focus');
  assert.equal(page.animations.length, 3);
  assert.equal(page.animations[0].keyframes[1].transform, 'rotate(5deg)');
  page.event('link', 'pointerdown', { pointerType: 'mouse', clientX: 100 });
  assert.equal(page.animations.length, 3);
  page.link.focusVisible = true;
  page.event('link', 'focus');
  assert.equal(page.animations.length, 6);
  assert.equal(page.animations[3].keyframes[1].transform, 'rotate(-5deg)');
});

test('opposite-side re-entry restarts smoothly from the current board and wire positions', () => {
  const page = setup();
  page.event('card', 'pointerenter', { pointerType: 'mouse', clientX: 100 });
  const transform = 'matrix(0.999, -0.035, 0.035, 0.999, 0, 0)';
  [page.link, ...page.wires].forEach(target => { target.transform = transform; });
  page.event('card', 'pointerenter', { pointerType: 'mouse', clientX: 300 });
  assert.ok(page.animations.slice(0, 3).every(animation => animation.cancelled));
  assert.ok(page.animations.slice(3).every(animation => animation.keyframes[0].transform === transform));
  assert.equal(page.animations[3].keyframes[1].transform, 'rotate(5deg)');
});

test('reduced motion, hidden cards and lifecycle cleanup prevent unwanted swings', () => {
  const reduced = setup({ reduced: true });
  reduced.event('card', 'pointerenter', { pointerType: 'mouse', clientX: 100 });
  assert.equal(reduced.animations.length, 0);
  for (const [owner, name, value] of [
    ['media', 'change', { matches: true }], ['window', 'pagehide', {}],
    ['document', 'visibilitychange', {}], ['document', 'works-filter-change', {}]
  ]) {
    const page = setup();
    page.event('card', 'pointerenter', { pointerType: 'mouse', clientX: 300 });
    if (name === 'visibilitychange') page.document.hidden = true;
    page.event(owner, name, value);
    assert.ok(page.animations.every(animation => animation.cancelled), name);
  }
  const hidden = setup();
  hidden.card.hidden = true;
  hidden.event('card', 'pointerenter', { pointerType: 'mouse', clientX: 100 });
  assert.equal(hidden.animations.length, 0);
});
