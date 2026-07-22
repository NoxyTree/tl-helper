import { createOptimizerAdapter } from "./tl-full-build-adapter.js";
import { createOptimizerWorkerPool, recommendedOptimizerWorkerCount } from "./tl-optimizer-worker-pool.js";

let controller = null;
let taskPool = null;

self.onmessage = async (event) => {
  if (event.data?.type === "cancel") {
    controller?.abort();
    taskPool?.terminate();
    taskPool = null;
    return;
  }
  if (event.data?.type !== "optimize") return;
  controller?.abort();
  taskPool?.terminate();
  const activeController = new AbortController();
  controller = activeController;
  const workerCount = recommendedOptimizerWorkerCount(globalThis.navigator?.hardwareConcurrency);
  const activeTaskPool = createOptimizerWorkerPool({ size: workerCount });
  taskPool = activeTaskPool;
  try {
    self.postMessage({ type: "progress", progress: { percent: 0, label: "Preparing calculation workers", detail: `${workerCount} calculation worker${workerCount === 1 ? "" : "s"} configured` } });
    const adapter = await createOptimizerAdapter({ optimizerTaskPool: activeTaskPool });
    const result = await adapter.optimize(event.data.request, {
      signal: activeController.signal,
      onProgress: (progress) => self.postMessage({ type: "progress", progress }),
      onPreliminary: (preliminary) => self.postMessage({ type: "preliminary", result: preliminary }),
    });
    self.postMessage({ type: "result", result: { ...result, calculationWorkerCount: activeTaskPool.parallelism } });
  } catch (error) {
    self.postMessage({
      type: error?.name === "AbortError" ? "cancelled" : "error",
      message: String(error?.message ?? error),
      ...(error?.constraintDiagnostics ? { constraintDiagnostics: error.constraintDiagnostics } : {}),
    });
  } finally {
    activeTaskPool.terminate();
    if (taskPool === activeTaskPool) taskPool = null;
    if (controller === activeController) controller = null;
  }
};
