import { parentPort } from "node:worker_threads";
import path from "node:path";

import * as core from "../web/tl-core.js";
import { executeOptimizerTask } from "../web/optimizer/tl-full-build-adapter.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

let batch = null;
const ready = loadWebDataFromFile(path.resolve("web/data/app-data.json")).then((data) => core.initCore(data));

parentPort.on("message", async (message = {}) => {
  if (message.type === "begin") {
    batch = { id: message.batchId, taskType: message.taskType, context: message.context };
    return;
  }
  if (message.type !== "task" || !batch || message.batchId !== batch.id) return;
  try {
    await ready;
    const result = await executeOptimizerTask(core, batch.taskType, message.payload, batch.context);
    parentPort.postMessage({ type: "result", batchId: batch.id, index: message.index, ok: true, result });
  } catch (error) {
    parentPort.postMessage({
      type: "result",
      batchId: batch.id,
      index: message.index,
      ok: false,
      error: { name: String(error?.name ?? "Error"), message: String(error?.message ?? error) },
    });
  }
});
