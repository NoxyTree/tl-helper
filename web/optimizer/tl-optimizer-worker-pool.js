const abortError = () => new DOMException("Optimizer calculation cancelled", "AbortError");

function throwIfCancelled(control, signal) {
  if (control?.cancelled) throw control.error ?? abortError();
  if (signal?.aborted) throw abortError();
}

async function yieldToHost() {
  if (typeof globalThis.scheduler?.yield === "function") {
    await globalThis.scheduler.yield();
    return;
  }
  if (typeof globalThis.setTimeout === "function") {
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    return;
  }
  await Promise.resolve();
}

function normalizedHardwareConcurrency(value) {
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : 1;
}

/**
 * Heavy optimizer tasks saturate a physical core and carry a full projection.
 * Use roughly half the reported logical CPUs, capped at four workers, so the
 * coordinator, rendering, and the OS retain headroom without SMT contention.
 */
export function recommendedOptimizerWorkerCount(hardwareConcurrency = globalThis.navigator?.hardwareConcurrency) {
  const logical = normalizedHardwareConcurrency(hardwareConcurrency);
  return Math.max(1, Math.min(4, Math.floor(logical / 2)));
}

async function runSequential(tasks, {
  context,
  fallback,
  signal,
  onProgress,
  control,
  results = new Array(tasks.length),
  missing = tasks.map((_, index) => index),
  completed = 0,
} = {}) {
  if (typeof fallback !== "function") throw new TypeError("A deterministic local fallback is required.");
  for (const index of missing) {
    throwIfCancelled(control, signal);
    const value = await fallback(tasks[index], context, index);
    throwIfCancelled(control, signal);
    results[index] = value;
    completed += 1;
    onProgress?.({ completed, total: tasks.length, workerCount: 1, mode: "sequential" });
    if (completed < tasks.length) {
      await yieldToHost();
      throwIfCancelled(control, signal);
    }
  }
  return results;
}

/**
 * One-batch-at-a-time deterministic worker pool. Results always retain input
 * order. Worker construction or runtime failure degrades only unfinished pure
 * tasks to the supplied local implementation.
 */
export class OptimizerWorkerPool {
  constructor({
    size = recommendedOptimizerWorkerCount(),
    WorkerCtor = globalThis.Worker,
    workerUrl = new URL("./tl-optimizer-task-worker.js", import.meta.url),
  } = {}) {
    this.size = Math.max(1, Math.floor(Number(size) || 1));
    this.WorkerCtor = WorkerCtor;
    this.workerUrl = workerUrl;
    this.workers = [];
    this.disabled = this.size <= 1 || typeof WorkerCtor !== "function";
    this.active = false;
    this.activeControl = null;
    this.batchSequence = 0;
  }

  get parallelism() {
    return this.disabled ? 1 : this.size;
  }

  ensureWorkers() {
    if (this.disabled || this.workers.length) return this.workers;
    try {
      for (let index = 0; index < this.size; index += 1) {
        this.workers.push(new this.WorkerCtor(this.workerUrl, { type: "module" }));
      }
    } catch {
      for (const worker of this.workers) worker.terminate?.();
      this.workers = [];
      this.disabled = true;
    }
    return this.workers;
  }

  terminate() {
    for (const worker of this.workers) worker.terminate?.();
    this.workers = [];
    this.disabled = true;
    this.activeControl?.cancel(abortError());
  }

  async map(taskType, tasks, { context = null, fallback, signal, onProgress } = {}) {
    if (!Array.isArray(tasks)) throw new TypeError("Optimizer worker tasks must be an array.");
    if (!tasks.length) return [];
    if (this.active) throw new Error("Optimizer worker pool already has an active batch.");
    if (signal?.aborted) throw abortError();
    this.active = true;
    let rejectCancellation;
    const control = {
      cancelled: false,
      error: null,
      onCancel: null,
      cancellation: new Promise((_, reject) => { rejectCancellation = reject; }),
      cancel(error = abortError()) {
        if (this.cancelled) return;
        this.cancelled = true;
        this.error = error;
        this.onCancel?.(error);
        rejectCancellation(error);
      },
    };
    this.activeControl = control;
    const onAbort = () => this.terminate();
    signal?.addEventListener?.("abort", onAbort, { once: true });

    const batchId = `optimizer-batch-${++this.batchSequence}`;

    try {
      let operation;
      if (tasks.length === 1) {
        operation = runSequential(tasks, { context, fallback, signal, onProgress, control });
      } else {
        const workers = this.ensureWorkers();
        operation = workers.length
          ? new Promise((resolve, reject) => {
            const results = new Array(tasks.length);
            const completedIndexes = new Set();
            let nextIndex = 0;
            let completed = 0;
            let settled = false;
            let degrading = false;

            const cleanup = () => {
              for (const worker of workers) {
                worker.onmessage = null;
                worker.onerror = null;
                worker.onmessageerror = null;
              }
            };
            const finish = (value, error = null) => {
              if (settled) return;
              settled = true;
              cleanup();
              control.onCancel = null;
              if (error) reject(error);
              else resolve(value);
            };
            const stopWorkers = ({ disable = false } = {}) => {
              for (const worker of workers) worker.terminate?.();
              if (this.workers === workers) this.workers = [];
              if (disable) this.disabled = true;
            };
            const fail = (error) => {
              stopWorkers();
              finish(null, error);
            };
            const degrade = async () => {
              if (settled || degrading) return;
              degrading = true;
              stopWorkers({ disable: true });
              cleanup();
              try {
                const missing = tasks.map((_, index) => index).filter((index) => !completedIndexes.has(index));
                const value = await runSequential(tasks, { context, fallback, signal, onProgress, control, results, missing, completed });
                finish(value);
              } catch (error) {
                finish(null, error);
              }
            };
            const dispatch = (worker) => {
              if (settled || degrading || nextIndex >= tasks.length) return;
              const index = nextIndex++;
              try {
                worker.postMessage({ type: "task", batchId, index, payload: tasks[index] });
              } catch {
                void degrade();
              }
            };

            control.onCancel = (error) => finish(null, error);
            for (const worker of workers) {
              worker.onmessage = (event) => {
                const message = event.data ?? {};
                if (message.type !== "result" || message.batchId !== batchId || settled) return;
                if (message.ok !== true) {
                  void degrade();
                  return;
                }
                const index = Number(message.index);
                if (!Number.isInteger(index) || index < 0 || index >= tasks.length || completedIndexes.has(index)) {
                  void degrade();
                  return;
                }
                results[index] = message.result;
                completedIndexes.add(index);
                completed += 1;
                try {
                  onProgress?.({ completed, total: tasks.length, workerCount: workers.length, mode: "parallel" });
                } catch (error) {
                  fail(error);
                  return;
                }
                if (settled || control.cancelled) return;
                if (completed === tasks.length) finish(results);
                else dispatch(worker);
              };
              worker.onerror = () => { void degrade(); };
              worker.onmessageerror = () => { void degrade(); };
              try {
                worker.postMessage({ type: "begin", batchId, taskType, context });
              } catch {
                void degrade();
                break;
              }
            }
            if (!degrading) for (const worker of workers) dispatch(worker);
          })
          : runSequential(tasks, { context, fallback, signal, onProgress, control });
      }
      return await Promise.race([operation, control.cancellation]);
    } finally {
      signal?.removeEventListener?.("abort", onAbort);
      if (this.activeControl === control) {
        this.activeControl = null;
        this.active = false;
      }
    }
  }
}

export function createOptimizerWorkerPool(options = {}) {
  return new OptimizerWorkerPool(options);
}
