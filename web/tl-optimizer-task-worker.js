import * as core from "./tl-core.js";
import { executeOptimizerTask } from "./tl-full-build-adapter.js";

let batch = null;
const ready = core.data ? Promise.resolve() : core.initCore("./data/app-data.json");

self.onmessage = async (event) => {
  const message = event.data ?? {};
  if (message.type === "begin") {
    batch = { id: message.batchId, taskType: message.taskType, context: message.context };
    return;
  }
  if (message.type !== "task" || !batch || message.batchId !== batch.id) return;
  try {
    await ready;
    const result = await executeOptimizerTask(core, batch.taskType, message.payload, batch.context);
    self.postMessage({ type: "result", batchId: batch.id, index: message.index, ok: true, result });
  } catch (error) {
    self.postMessage({
      type: "result",
      batchId: batch.id,
      index: message.index,
      ok: false,
      error: { name: String(error?.name ?? "Error"), message: String(error?.message ?? error) },
    });
  }
};
