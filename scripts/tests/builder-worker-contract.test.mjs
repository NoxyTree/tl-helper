import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../../web/tl-builder-worker.js", import.meta.url), "utf8");

test("Builder worker owns optimization and forwards progress", () => {
  assert.match(worker, /createOptimizerAdapter/);
  assert.match(worker, /engine\.optimize/);
  assert.match(worker, /onProgress/);
  assert.match(worker, /type: "progress"/);
  assert.match(worker, /type: "preliminary-result"/);
  assert.match(worker, /type: "improved-result"/);
  assert.match(worker, /type: "complete"/);
  assert.match(worker, /depth: "preview"/);
  assert.match(worker, /depth: "refine"/);
});

test("Builder worker reuses one initialized adapter and bounds refinement time", () => {
  assert.match(worker, /adapterPromise \?\?=/);
  assert.match(worker, /refinementBudgetMs/);
  assert.match(worker, /shouldCancel/);
  assert.match(worker, /type: "ready"/);
});

test("Builder worker supports cancellation and reports real errors", () => {
  assert.match(worker, /new AbortController/);
  assert.match(worker, /controller\?\.abort/);
  assert.match(worker, /AbortError/);
  assert.match(worker, /\? "cancelled" : "error"/);
});
