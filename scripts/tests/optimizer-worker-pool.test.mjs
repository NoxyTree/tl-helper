import assert from "node:assert/strict";
import test from "node:test";

import {
  OptimizerWorkerPool,
  recommendedOptimizerWorkerCount,
} from "../../web/optimizer/tl-optimizer-worker-pool.js";

class FakeWorker {
  constructor() {
    this.batch = null;
    this.terminated = false;
  }

  postMessage(message) {
    if (message.type === "begin") {
      this.batch = message;
      return;
    }
    if (message.type !== "task") return;
    const delay = Number(message.payload.delay ?? 0);
    setTimeout(() => {
      if (this.terminated) return;
      this.onmessage?.({ data: {
        type: "result",
        batchId: message.batchId,
        index: message.index,
        ok: true,
        result: Number(this.batch.context.offset) + Number(message.payload.value),
      } });
    }, delay);
  }

  terminate() {
    this.terminated = true;
  }
}

test("adaptive optimizer worker count estimates physical cores and caps at four", () => {
  assert.equal(recommendedOptimizerWorkerCount(null), 1);
  assert.equal(recommendedOptimizerWorkerCount(1), 1);
  assert.equal(recommendedOptimizerWorkerCount(2), 1);
  assert.equal(recommendedOptimizerWorkerCount(4), 2);
  assert.equal(recommendedOptimizerWorkerCount(12), 4);
  assert.equal(recommendedOptimizerWorkerCount(32), 4);
});

test("parallel pool preserves input order despite out-of-order completion", async () => {
  const progress = [];
  const pool = new OptimizerWorkerPool({ size: 3, WorkerCtor: FakeWorker, workerUrl: "fake" });
  const result = await pool.map("sum", [
    { value: 1, delay: 20 },
    { value: 2, delay: 1 },
    { value: 3, delay: 10 },
    { value: 4, delay: 0 },
  ], {
    context: { offset: 10 },
    fallback: ({ value }, { offset }) => value + offset,
    onProgress: (row) => progress.push(row),
  });
  assert.deepEqual(result, [11, 12, 13, 14]);
  assert.equal(progress.at(-1).completed, 4);
  assert.equal(progress.at(-1).workerCount, 3);
  assert.equal(progress.at(-1).mode, "parallel");
  pool.terminate();
});

test("worker construction failure safely runs the same tasks through one local worker", async () => {
  class BrokenWorker { constructor() { throw new Error("workers unavailable"); } }
  const progress = [];
  const pool = new OptimizerWorkerPool({ size: 8, WorkerCtor: BrokenWorker, workerUrl: "broken" });
  const result = await pool.map("sum", [{ value: 2 }, { value: 5 }], {
    context: { offset: 7 },
    fallback: ({ value }, { offset }) => value + offset,
    onProgress: (row) => progress.push(row),
  });
  assert.deepEqual(result, [9, 12]);
  assert.equal(pool.parallelism, 1);
  assert.ok(progress.every((row) => row.workerCount === 1 && row.mode === "sequential"));
});

test("runtime worker failure reruns only unfinished pure tasks through the local fallback", async () => {
  class FailingWorker extends FakeWorker {
    postMessage(message) {
      if (message.type === "begin") return super.postMessage(message);
      setTimeout(() => this.onerror?.(new Error("worker crashed")), 0);
    }
  }
  const fallbackIndexes = [];
  const pool = new OptimizerWorkerPool({ size: 3, WorkerCtor: FailingWorker, workerUrl: "failing" });
  const result = await pool.map("sum", [{ value: 1 }, { value: 2 }, { value: 3 }], {
    context: { offset: 5 },
    fallback: ({ value }, { offset }, index) => {
      fallbackIndexes.push(index);
      return value + offset;
    },
  });
  assert.deepEqual(result, [6, 7, 8]);
  assert.deepEqual(fallbackIndexes, [0, 1, 2]);
  assert.equal(pool.parallelism, 1);
});

test("abort terminates parallel workers and rejects with AbortError", async () => {
  const controller = new AbortController();
  const pool = new OptimizerWorkerPool({ size: 2, WorkerCtor: FakeWorker, workerUrl: "fake" });
  const running = pool.map("sum", [{ value: 1, delay: 50 }, { value: 2, delay: 50 }], {
    context: { offset: 0 },
    fallback: ({ value }) => value,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(running, { name: "AbortError" });
  assert.equal(pool.parallelism, 1);
});

test("synchronous postMessage clone failure terminates workers and deterministically falls back", async () => {
  const instances = [];
  class CloneFailingWorker extends FakeWorker {
    constructor() {
      super();
      instances.push(this);
    }

    postMessage(message) {
      if (message.type === "task" && message.index === 0) {
        this.onmessage?.({ data: {
          type: "result",
          batchId: message.batchId,
          index: message.index,
          ok: true,
          result: Number(this.batch.context.offset) + Number(message.payload.value),
        } });
        return;
      }
      if (message.type === "task") throw new DOMException("could not be cloned", "DataCloneError");
      super.postMessage(message);
    }
  }
  const fallbackIndexes = [];
  const pool = new OptimizerWorkerPool({ size: 3, WorkerCtor: CloneFailingWorker, workerUrl: "clone-failing" });
  const result = await pool.map("sum", [{ value: 3 }, { value: 1 }, { value: 2 }], {
    context: { offset: 20 },
    fallback: ({ value }, { offset }, index) => {
      fallbackIndexes.push(index);
      return value + offset;
    },
  });
  assert.deepEqual(result, [23, 21, 22]);
  assert.deepEqual(fallbackIndexes, [1, 2], "completed worker results must not be rerun");
  assert.ok(instances.every((worker) => worker.terminated));
  assert.equal(pool.workers.length, 0);
  assert.equal(pool.parallelism, 1);
  assert.equal(pool.active, false);
});

test("sequential fallback yields to the host so timer-driven cancellation is responsive", async () => {
  const controller = new AbortController();
  const visited = [];
  const pool = new OptimizerWorkerPool({ size: 8, WorkerCtor: null });
  globalThis.setTimeout(() => controller.abort(), 0);
  const running = pool.map("sum", Array.from({ length: 20 }, (_, value) => ({ value })), {
    fallback: ({ value }) => {
      visited.push(value);
      return value;
    },
    signal: controller.signal,
  });
  await assert.rejects(running, { name: "AbortError" });
  assert.ok(visited.length > 0 && visited.length < 20, `visited ${visited.length} fallback tasks`);
  assert.equal(pool.active, false);
});

test("terminate settles an active batch and terminates every worker", async () => {
  const instances = [];
  class TrackedWorker extends FakeWorker {
    constructor() {
      super();
      instances.push(this);
    }
  }
  const pool = new OptimizerWorkerPool({ size: 3, WorkerCtor: TrackedWorker, workerUrl: "tracked" });
  const running = pool.map("sum", [{ value: 1, delay: 100 }, { value: 2, delay: 100 }], {
    context: { offset: 0 },
    fallback: ({ value }) => value,
  });
  pool.terminate();
  await assert.rejects(running, { name: "AbortError" });
  assert.ok(instances.every((worker) => worker.terminated));
  assert.equal(pool.workers.length, 0);
  assert.equal(pool.active, false);
});

test("terminate settles a sequential batch even while its fallback is pending", async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const pool = new OptimizerWorkerPool({ size: 1, WorkerCtor: null });
  const running = pool.map("sum", [{ value: 1 }], {
    fallback: async ({ value }) => {
      await pending;
      return value;
    },
  });
  pool.terminate();
  await assert.rejects(running, { name: "AbortError" });
  assert.equal(pool.active, false);
  release();
});

test("onProgress exceptions reject the batch, terminate workers, and leave the pool reusable", async () => {
  const instances = [];
  class TrackedWorker extends FakeWorker {
    constructor() {
      super();
      instances.push(this);
    }
  }
  const pool = new OptimizerWorkerPool({ size: 2, WorkerCtor: TrackedWorker, workerUrl: "tracked" });
  await assert.rejects(pool.map("sum", [{ value: 1 }, { value: 2 }], {
    context: { offset: 0 },
    fallback: ({ value }) => value,
    onProgress: () => { throw new Error("progress callback failed"); },
  }), /progress callback failed/);
  assert.ok(instances.slice(0, 2).every((worker) => worker.terminated));
  assert.equal(pool.active, false);

  const result = await pool.map("sum", [{ value: 4 }, { value: 5 }], {
    context: { offset: 1 },
    fallback: ({ value }, { offset }) => value + offset,
  });
  assert.deepEqual(result, [5, 6]);
  assert.equal(instances.length, 4, "the next batch should get fresh workers");
  pool.terminate();
});
