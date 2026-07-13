import { createOptimizerAdapter } from "./tl-full-build-adapter.js";

let controller = null;

self.onmessage = async (event) => {
  if (event.data?.type === "cancel") {
    controller?.abort();
    return;
  }
  if (event.data?.type !== "optimize") return;
  controller?.abort();
  controller = new AbortController();
  try {
    const adapter = await createOptimizerAdapter();
    const result = await adapter.optimize(event.data.request, {
      signal: controller.signal,
      onProgress: (progress) => self.postMessage({ type: "progress", progress }),
    });
    self.postMessage({ type: "result", result });
  } catch (error) {
    self.postMessage({
      type: error?.name === "AbortError" ? "cancelled" : "error",
      message: String(error?.message ?? error),
    });
  } finally {
    controller = null;
  }
};
