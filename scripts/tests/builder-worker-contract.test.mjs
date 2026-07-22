import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worker = await readFile(new URL("../../web/optimizer/tl-builder-worker.js", import.meta.url), "utf8");

test("Builder worker owns optimization and forwards progress", () => {
  assert.match(worker, /createOptimizerAdapter/);
  assert.match(worker, /adapter\.optimize/);
  assert.match(worker, /onProgress/);
  assert.match(worker, /type: "progress"/);
  assert.match(worker, /type: "result"/);
  assert.match(worker, /adapter\.optimize\(event\.data\.request,/);
  assert.match(worker, /recommendedOptimizerWorkerCount\(globalThis\.navigator\?\.hardwareConcurrency\)/);
  assert.match(worker, /createOptimizerWorkerPool\(\{ size: workerCount \}\)/);
  assert.match(worker, /createOptimizerAdapter\(\{ optimizerTaskPool: activeTaskPool \}\)/);
  assert.doesNotMatch(worker, /delete\s+event\.data\.request\.scenario|\{\s*\.\.\.event\.data\.request\s*,\s*scenario\s*:/);
});

test("Builder worker supports cancellation and reports real errors", () => {
  assert.match(worker, /new AbortController/);
  assert.match(worker, /controller\?\.abort/);
  assert.match(worker, /taskPool\?\.terminate/);
  assert.match(worker, /if \(taskPool === activeTaskPool\) taskPool = null/);
  assert.match(worker, /if \(controller === activeController\) controller = null/);
  assert.match(worker, /AbortError/);
  assert.match(worker, /\? "cancelled" : "error"/);
});
