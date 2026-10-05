const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(mobile, reduce = false) {
  const classes = new Set(), events = {}, attrs = {}, media = { dataset: { preview: 'game.mp4' }, classList: { add: v => classes.add(v), remove: v => classes.delete(v) }, append() {} };
  let plays = 0, pauses = 0, callback;
  const video = { readyState: 1, currentTime: 0, setAttribute(k,v) { attrs[k]=v; }, getAttribute(k) { return attrs[k]; }, addEventListener() {}, play() { plays++; return Promise.resolve(); }, pause() { pauses++; }, set src(v) { attrs.src=v; } };
  const card = { querySelector: () => media, addEventListener(k,v) { events[k]=v; } };
  const prefs = [ { matches: reduce, addEventListener() {} }, { matches: !mobile, addEventListener() {} }, { matches: mobile, addEventListener() {} } ];
  const docEvents = {}, document = { hidden: false, querySelectorAll: () => [card], createElement: () => video, addEventListener(k,v) { docEvents[k]=v; } };
  const Observer = class { constructor(cb) { callback=cb; } observe() {} };
  vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../preview.js'),'utf8'), { window: { matchMedia: () => prefs.shift(), IntersectionObserver: Observer }, IntersectionObserver: Observer, document, setTimeout: () => 1, clearTimeout() {} });
  return { enter: () => callback([{ target:card, isIntersecting:true }]), exit: () => callback([{ target:card, isIntersecting:false }]), events, classes, count: () => plays, paused: () => pauses, hide() { document.hidden=true; docEvents.visibilitychange(); } };
}
test('mobile previews start on entry, stop offscreen and restart on reentry', async () => {
  const p=setup(true);p.enter();await new Promise(setImmediate);assert.equal(p.count(),1);assert.ok(p.classes.has('is-previewing'));p.exit();assert.ok(!p.classes.has('is-previewing'));p.enter();await new Promise(setImmediate);assert.equal(p.count(),2);p.hide();assert.ok(!p.classes.has('is-previewing'));
});
test('desktop keeps hover playback and reduced motion prevents autoplay', async () => {
  const desktop=setup(false);desktop.enter();assert.equal(desktop.count(),0);desktop.events.pointerenter();await new Promise(setImmediate);assert.equal(desktop.count(),1);desktop.events.pointerleave();assert.ok(!desktop.classes.has('is-previewing'));
  const reduced=setup(true,true);reduced.enter();assert.equal(reduced.count(),0);
});
