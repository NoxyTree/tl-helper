import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const markup = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");

// Extract a class method's source from the Armory component script by
// scanning to the matching closing brace (the flash helpers keep braces
// balanced outside of strings).
function extractMethod(signature) {
  const start = markup.indexOf(signature);
  assert.notEqual(start, -1, `missing method: ${signature}`);
  let depth = 0;
  for (let i = markup.indexOf("{", start); i < markup.length; i += 1) {
    if (markup[i] === "{") depth += 1;
    else if (markup[i] === "}") {
      depth -= 1;
      if (depth === 0) return markup.slice(start, i + 1);
    }
  }
  assert.fail(`unterminated method: ${signature}`);
}

const methodSources = [
  "syncStatDeltaFlash() {",
  "cancelStatTween(key) {",
  "statFlashSplit(text) {",
  "statFlashFormat(value, template) {",
  "startStatTween(key, el, fromText, toText, prevText) {",
  "flashStatColor(el, direction) {",
].map(extractMethod).join("\n");

// Deterministic stand-ins for the browser scheduling APIs the tween consumes.
const clock = { now: 0, queue: [] };
function makeHarness({ reducedMotion = false } = {}) {
  clock.now = 0;
  clock.queue = [];
  globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
  globalThis.document = { querySelectorAll: () => [], addEventListener: () => {} };
  globalThis.performance = { now: () => clock.now };
  globalThis.requestAnimationFrame = (cb) => clock.queue.push(cb) && clock.queue.length;
  globalThis.cancelAnimationFrame = (id) => { clock.queue[id - 1] = null; };
  const Harness = new Function(`return class StatFlashHarness {\n${methodSources}\n}`)();
  return new Harness();
}

function pumpFrame(at) {
  clock.now = at;
  const pending = clock.queue.splice(0, clock.queue.length);
  for (const cb of pending) if (cb) cb(at);
}

function makeValueNode(text) {
  const textNode = { nodeType: 3, nodeValue: text };
  const classes = new Set();
  return {
    nodeType: 1,
    isConnected: true,
    childNodes: [textNode],
    firstChild: textNode,
    offsetWidth: 0,
    classList: {
      add: (c) => classes.add(c),
      remove: (...cs) => cs.forEach((c) => classes.delete(c)),
      contains: (c) => classes.has(c),
    },
    classes,
    textNode,
  };
}

test("stat values tween through formatted intermediate frames and land on the exact rendered value", () => {
  const harness = makeHarness();
  harness._statFlashTweens = new Map();
  const el = makeValueNode("63 ~ 103");
  harness.startStatTween("hero:Base Damage", el, "63 ~ 103", "208 ~ 497", "63 ~ 103");
  assert.equal(el.textNode.nodeValue, "63 ~ 103", "tween starts from the previous value");
  assert.ok(el.classes.has("tl-stat-flash-up"), "increase flashes the good color");

  pumpFrame(250); // halfway, ease-out cubic => 87.5% progressed
  const [minPart, maxPart] = el.textNode.nodeValue.split(" ~ ").map(Number);
  assert.ok(minPart > 63 && minPart < 208, `min rolls between endpoints (got ${minPart})`);
  assert.ok(maxPart > 103 && maxPart < 497, `max rolls between endpoints (got ${maxPart})`);
  assert.ok(minPart >= 63 + (208 - 63) * 0.5, "ease-out front-loads the roll");

  pumpFrame(600); // past the 500ms duration
  assert.equal(el.textNode.nodeValue, "208 ~ 497", "the true rendered value always wins");
  assert.equal(harness._statFlashTweens.size, 0, "finished tweens are released");
});

test("tween frames preserve thousands separators and decimals of the target format", () => {
  const harness = makeHarness();
  harness._statFlashTweens = new Map();
  const grouped = makeValueNode("6,900");
  harness.startStatTween("hero:Max Health", grouped, "6,900", "8,120", "6,900");
  pumpFrame(200);
  assert.match(grouped.textNode.nodeValue, /^[78],\d{3}$/, `grouped frame keeps commas (got ${grouped.textNode.nodeValue})`);

  const decimal = makeValueNode("12.5%");
  harness.startStatTween("stat-total:crit", decimal, "12.5%", "18.0%", "12.5%");
  pumpFrame(400);
  assert.match(decimal.textNode.nodeValue, /^1\d\.\d%$/, `decimal frame keeps one decimal and the %% suffix (got ${decimal.textNode.nodeValue})`);
});

test("decreases flash the bad color and reduced motion skips the tween entirely", () => {
  const harness = makeHarness({ reducedMotion: true });
  harness._statFlashTweens = new Map();
  const el = makeValueNode("208 ~ 497");
  el.textNode.nodeValue = "63 ~ 103"; // what React just rendered
  harness.startStatTween("hero:Base Damage", el, "208 ~ 497", "63 ~ 103", "208 ~ 497");
  assert.ok(el.classes.has("tl-stat-flash-down"), "decrease flashes the bad color");
  assert.equal(el.textNode.nodeValue, "63 ~ 103", "reduced motion keeps the instant value");
  assert.equal(clock.queue.length, 0, "reduced motion schedules no animation frames");
});

test("the diff pass skips first observations and only animates real changes", () => {
  const harness = makeHarness();
  const el = makeValueNode("100");
  const attrs = { "data-stat-flash": "stat-total:hp", "data-stat-flash-value": "100" };
  el.getAttribute = (name) => attrs[name] ?? null;
  globalThis.document.querySelectorAll = () => [el];

  harness.syncStatDeltaFlash(); // first observation: baseline only
  assert.equal(el.classes.size, 0, "initial hydration must not flash");
  assert.equal(harness._statFlashTweens.size, 0);

  attrs["data-stat-flash-value"] = "250";
  el.textNode.nodeValue = "250"; // React re-rendered the truth
  harness.syncStatDeltaFlash();
  assert.ok(el.classes.has("tl-stat-flash-up"), "changed value flashes");
  assert.equal(harness._statFlashTweens.size, 1, "changed value starts a tween");
  pumpFrame(999);
  assert.equal(el.textNode.nodeValue, "250", "tween reconciles to the rendered value");

  harness.syncStatDeltaFlash(); // unchanged pass keeps everything quiet
  assert.equal(harness._statFlashTweens.size, 0);
});
