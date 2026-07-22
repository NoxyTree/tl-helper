import { createOptimizerAdapter } from "./tl-full-build-adapter.js";

let controller = null;
let adapterPromise = null;
let runId = 0;

const adapter = () => {
  adapterPromise ??= createOptimizerAdapter();
  return adapterPromise;
};

function progressSender(stage) {
  return (progress) => self.postMessage({ type: "progress", stage, progress });
}

function betterResult(candidate, current) {
  return Number(candidate?.score ?? -Infinity) > Number(current?.score ?? -Infinity) + 1e-12;
}

async function optimize(request) {
  controller?.abort();
  const activeRun = ++runId;
  controller = new AbortController();
  const signal = controller.signal;
  const engine = await adapter();
  const startedAt = performance.now();

  let preview;
  let previewUsedRefineProfile = false;
  try {
    preview = await engine.optimize({ ...request, depth: "preview" }, {
      signal,
      onProgress: progressSender("preview"),
    });
  } catch (error) {
    if (error?.name === "AbortError") throw error;
    if (!String(error?.message ?? error).includes("No build satisfies")) throw error;
    self.postMessage({ type: "progress", stage: "preview", progress: { percent: 20, label: "Widening the legal search", detail: "The initial frontier could not satisfy every hard constraint" } });
    previewUsedRefineProfile = true;
    preview = await engine.optimize({ ...request, depth: "refine" }, {
      signal,
      onProgress: progressSender("preview"),
    });
  }
  if (activeRun !== runId || signal.aborted) throw new DOMException("Full-build optimization cancelled", "AbortError");
  self.postMessage({ type: "preliminary-result", result: preview, elapsedMs: Math.round(performance.now() - startedAt) });

  if (request.progressive === false || previewUsedRefineProfile) {
    self.postMessage({ type: "complete", result: preview, improved: false, elapsedMs: Math.round(performance.now() - startedAt) });
    return;
  }

  const refinementStartedAt = performance.now();
  const refinementBudgetMs = Math.max(1_000, Number(request.refinementBudgetMs) || 20_000);
  try {
    const refined = await engine.optimize({
      ...request,
      depth: "refine",
      objectiveBaseline: preview.objectiveBaseline,
      objectiveScales: preview.objectiveScales,
    }, {
      signal,
      shouldCancel: () => performance.now() - refinementStartedAt >= refinementBudgetMs,
      onProgress: progressSender("refine"),
    });
    if (activeRun !== runId || signal.aborted) throw new DOMException("Full-build optimization cancelled", "AbortError");
    const improved = betterResult(refined, preview);
    if (improved) self.postMessage({ type: "improved-result", result: refined, elapsedMs: Math.round(performance.now() - startedAt) });
    self.postMessage({ type: "complete", result: improved ? refined : preview, improved, elapsedMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    if (error?.name !== "AbortError" || signal.aborted) throw error;
    self.postMessage({ type: "complete", result: preview, improved: false, timedOut: true, elapsedMs: Math.round(performance.now() - startedAt) });
  }
}

self.onmessage = async (event) => {
  if (event.data?.type === "cancel") {
    runId += 1;
    controller?.abort();
    return;
  }
  if (event.data?.type === "init") {
    try {
      await adapter();
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({ type: "error", message: String(error?.message ?? error) });
    }
    return;
  }
  if (event.data?.type !== "optimize") return;
  try {
    await optimize(event.data.request);
  } catch (error) {
    self.postMessage({
      type: error?.name === "AbortError" ? "cancelled" : "error",
      message: String(error?.message ?? error),
    });
  }
};
