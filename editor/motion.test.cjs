const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8');
const reveal = source.slice(source.indexOf('// Prepare fades only outside the viewport'));

function element(top, height = 30, parentElement = null) {
  const classes = new Set();
  return {
    top, height, parentElement, offsetTop: top, laidOut: true, shift: 0,
    classList: {
      contains: name => classes.has(name),
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name))
    },
    style: { values: {}, setProperty(name, value) { this.values[name] = value; } },
    getClientRects() { return this.laidOut ? [{}] : []; },
    getBoundingClientRect() {
      if (this.fail) throw new Error('Layout unavailable');
      let shift = 0;
      for (let parent = this; parent; parent = parent.parentElement) {
        if (parent.classList.contains('motion-enter')) shift += parent.shift;
      }
      return { top: this.top + shift, bottom: this.top + this.height + shift };
    },
    contains(target) {
      for (let parent = target; parent; parent = parent.parentElement) if (parent === this) return true;
      return false;
    }
  };
}

function setup(targets, { reduced = false, observers = true, observerFails = false, cards = [] } = {}) {
  const listeners = new Map();
  const eventTarget = owner => ({
    addEventListener(name, callback) { listeners.set(owner + name, callback); },
    removeEventListener(name) { listeners.delete(owner + name); }
  });
  let nextFrame = 0;
  const frames = new Map();
  const preference = { matches: reduced, ...eventTarget('media:') };
  const document = {
    ...eventTarget('document:'), body: {}, activeElement: null,
    querySelectorAll(selector) {
      if (selector === '.featured-grid') return cards.length ? [{ querySelectorAll: () => cards }] : [];
      return selector.startsWith('[data-motion]') ? targets : [];
    }
  };
  let intersection, layout;
  class IntersectionObserver {
    constructor(callback) { if (observerFails) throw new Error('Observer unavailable'); intersection = callback; }
    observe() {}
    disconnect() { intersection = null; }
  }
  class ResizeObserver {
    constructor(callback) { layout = callback; }
    observe() {}
    disconnect() { layout = null; }
  }
  const window = {
    ...eventTarget('window:'), innerHeight: 100,
    matchMedia: () => preference,
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    ...(observers ? { IntersectionObserver, ResizeObserver } : {})
  };
  vm.runInNewContext(reveal, {
    window, document, IntersectionObserver, ResizeObserver,
    getComputedStyle: node => ({ transform: `matrix(1, 0, 0, 1, 0, ${node.shift})` }),
    DOMMatrixReadOnly: class { constructor(value) { this.m42 = Number(value.slice(7, -1).split(',')[5]); } }
  });
  const flush = () => {
    const callbacks = [...frames.values()];
    frames.clear();
    callbacks.forEach(callback => callback());
  };
  return {
    window, document, frames, flush,
    event(owner, name, value = {}) { listeners.get(owner + ':' + name)?.(value); },
    intersection() { intersection?.(targets.map(target => ({ target, isIntersecting: true }))); },
    layout() { layout?.([]); }
  };
}

const pending = node => node.classList.contains('motion-pending');
const entering = node => node.classList.contains('motion-enter');

test('initially visible and partially visible content is never hidden', () => {
  const visible = element(10), partial = element(99), outside = element(100);
  setup([visible, partial, outside]);
  assert.equal(pending(visible), false);
  assert.equal(entering(visible), false);
  assert.equal(pending(partial), false);
  assert.equal(pending(outside), true);
});

test('scroll reveals a card when the observer only reported a zero-pixel edge touch', () => {
  const card = element(100);
  const page = setup([card]);
  page.intersection(); page.flush();
  assert.equal(pending(card), true);
  // threshold: 0 need not send another entry as overlap grows from zero.
  card.top = 99;
  page.event('window', 'scroll');
  page.event('window', 'scroll');
  assert.equal(page.frames.size, 1);
  page.flush();
  assert.equal(pending(card), false);
  assert.equal(entering(card), true);
  card.top = -30;
  page.event('window', 'scroll'); page.flush();
  assert.equal(pending(card), true);
  card.top = -29;
  page.event('window', 'scroll'); page.flush();
  assert.equal(pending(card), false);
});

test('viewport tests exclude entrance translation on both targets and ancestors', () => {
  const parent = element(110, 60), child = element(110, 20, parent);
  const page = setup([parent, child]);
  parent.top = child.top = 90;
  page.event('window', 'scroll'); page.flush();
  parent.shift = child.shift = 16;
  page.event('window', 'scroll'); page.flush();
  assert.equal(pending(parent), false);
  assert.equal(pending(child), false);
  parent.top = -60; child.top = -20;
  page.event('window', 'scroll'); page.flush();
  assert.equal(pending(parent), true);
  assert.equal(pending(child), true);
});

test('resize, image load, layout change and page restoration recover missed entries', () => {
  for (const event of ['resize', 'load', 'layout', 'pageshow', 'visibilitychange']) {
    const node = element(110);
    const page = setup([node]);
    node.top = 90;
    if (event === 'layout') page.layout();
    else page.event(['load', 'visibilitychange'].includes(event) ? 'document' : 'window', event);
    page.flush();
    assert.equal(pending(node), false, event);
  }
  const node = element(110), page = setup([node]);
  page.event('window', 'scroll');
  node.top = 90;
  page.event('window', 'pageshow');
  assert.equal(page.frames.size, 0);
  assert.equal(pending(node), false);
});

test('filtering clears stale hidden state and keeps the row stagger after layout changes', () => {
  const cards = [element(120), element(120), element(160)];
  const page = setup(cards, { cards });
  assert.deepEqual(cards.map(card => card.style.values['--motion-delay']), ['0ms', '100ms', '0ms']);
  cards[0].laidOut = false;
  cards[1].top = cards[2].top = 50;
  cards[1].offsetTop = cards[2].offsetTop = 50;
  page.event('document', 'works-filter-change');
  assert.ok(cards.every(card => !pending(card)));
  assert.deepEqual(cards.slice(1).map(card => card.style.values['--motion-delay']), ['0ms', '100ms']);
  cards[0].laidOut = true; cards[0].top = 50;
  page.event('document', 'works-filter-change');
  assert.equal(pending(cards[0]), false);
});

test('keyboard focus and reduced motion keep content visible', () => {
  const node = element(120), link = element(120, 10, node);
  const page = setup([node]);
  page.document.activeElement = link;
  page.event('document', 'focusin', { target: link });
  page.event('window', 'scroll'); page.flush();
  assert.equal(pending(node), false);
  page.document.activeElement = null;
  page.event('window', 'scroll'); page.flush();
  assert.equal(pending(node), true);
  page.event('media', 'change', { matches: true });
  assert.equal(pending(node), false);
  page.event('window', 'scroll'); page.flush();
  assert.equal(pending(node), false);
  const reduced = element(120);
  setup([reduced], { reduced: true });
  assert.equal(pending(reduced), false);
});

test('missing observers still allow reveals, and failed enhancements show all content', () => {
  const node = element(120);
  const page = setup([node], { observers: false });
  assert.equal(pending(node), true);
  node.top = 90;
  page.event('window', 'scroll'); page.flush();
  assert.equal(pending(node), false);
  const nodes = [element(120), element(160)];
  const broken = setup(nodes);
  nodes[1].fail = true;
  broken.event('window', 'scroll'); broken.flush();
  assert.ok(nodes.every(node => !pending(node) && !entering(node)));
  const unavailable = element(120);
  setup([unavailable], { observerFails: true });
  assert.equal(pending(unavailable), false);
  const unscheduled = element(120);
  const failedFrame = setup([unscheduled]);
  failedFrame.window.requestAnimationFrame = () => { throw new Error('Frame unavailable'); };
  failedFrame.event('window', 'scroll');
  assert.equal(pending(unscheduled), false);
});
