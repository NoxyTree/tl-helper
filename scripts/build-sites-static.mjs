import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/client", { recursive: true });
await cp("web", "dist/client", { recursive: true });
await build({
  entryPoints: ["scripts/sites-worker-entry.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  conditions: ["worker", "browser"],
  logLevel: "info",
});
