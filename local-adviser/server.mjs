import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TlWarehouse, findWarehousePath } from "./lib/warehouse.mjs";
import { TlBuildTools } from "./lib/build-tools.mjs";
import { OllamaAdviser, createToolExecutor } from "./lib/adviser.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const host = "127.0.0.1";
const port = Number(process.env.TL_ADVISER_PORT ?? 43120);
const warehouse = new TlWarehouse(findWarehousePath());
const builds = await new TlBuildTools().init();
const adviser = new OllamaAdviser({ executeTool: createToolExecutor({ warehouse, builds }) });

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "content-length": Buffer.byteLength(body), "cache-control": "no-store" });
  response.end(body);
}

async function bodyJson(request, maximum = 3_000_000) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximum) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${host}:${port}`);
    if (request.method === "GET" && url.pathname === "/") {
      const body = await readFile(path.join(root, "public", "index.html"));
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": body.length, "cache-control": "no-store" });
      response.end(body);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/status") {
      let ollama;
      try { ollama = await adviser.status(); } catch (error) { ollama = { online: false, model: adviser.model, error: error.message }; }
      const meta = warehouse.metadata();
      json(response, 200, { ollama, warehouse: { path: warehouse.path, gameBuild: meta.game_build, gameVersion: meta.game_version, builtAtUtc: meta.builtAtUtc },
        calculator: { gameBuild: builds.gameBuild, buildLoaded: Boolean(builds.context), potentialsIncluded: false } });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/build") {
      const input = await bodyJson(request);
      const summary = builds.setBuild(input.build ?? input);
      json(response, 200, { ok: true, summary });
      return;
    }
    if (request.method === "DELETE" && url.pathname === "/api/build") {
      builds.clearBuild();
      json(response, 200, { ok: true });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/chat") {
      const input = await bodyJson(request);
      if (!String(input.message ?? "").trim()) return json(response, 400, { error: "message is required" });
      const result = await adviser.chat({ message: input.message, history: input.history, hasBuild: Boolean(builds.context) });
      json(response, 200, result);
      return;
    }
    json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    json(response, 500, { error: error.message });
  }
});

server.listen(port, host, () => {
  console.log(`TL Helper Local Adviser: http://${host}:${port}`);
  console.log(`Model: ${adviser.model}`);
  console.log(`Warehouse: ${warehouse.path}`);
  console.log("Press Ctrl+C to stop.");
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
  server.close(() => { warehouse.close(); process.exit(0); });
});
