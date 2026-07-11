import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fetchQuestlogCharacterPackage } from "./lib/questlog-character-import.mjs";

const root = path.resolve(process.argv[2] ?? "web");
const port = Number(process.argv[3] ?? 8790);

const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
  if (url.pathname === "/api/questlog/character") {
    try {
      const result = await fetchQuestlogCharacterPackage({ sourceUrl: url.searchParams.get("url") });
      response.writeHead(200, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(result));
    } catch (error) {
      response.writeHead(400, { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: String(error?.message ?? error) }));
    }
    return;
  }
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.resolve(root, `.${pathname}`);

  if (!file.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": types[path.extname(file)] ?? "application/octet-stream",
    });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}/`);
});
