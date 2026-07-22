// Mirrors the boss/NPC/vendor icons referenced by the gearing guide's drop
// sources from Questlog's CDN into web/assets/icons/, matching the same
// local-webp convention used for item icons (keeps the app same-origin / CSP-safe).
// Idempotent: skips files already present. Run after build-acquisition-data.mjs.
//
// Usage: node scripts/mirror-drop-icons.mjs [--concurrency N]

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repoRoot, "web");
const CDN_BASE = "https://cdn.questlog.gg/throne-and-liberty";
const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
const CONCURRENCY = Number(arg("--concurrency", "8"));

const acq = JSON.parse(readFileSync(path.join(webRoot, "data", "projections", "acquisition.json"), "utf8"));
const images = new Set();
for (const rec of Object.values(acq.items)) for (const d of rec.dropsFrom ?? []) if (d.image) images.add(d.image);

// local "assets/icons/<rest>.webp" -> CDN "<base>/assets/<rest>.webp"
const cdnUrlFor = (localPath) => `${CDN_BASE}/assets/${localPath.replace(/^assets\/icons\//, "")}`;

const targets = [...images].filter((p) => !existsSync(path.join(webRoot, p)));
console.log(`${images.size} unique drop icons, ${targets.length} to fetch`);

let cursor = 0, ok = 0, missing = 0;
async function worker() {
  while (cursor < targets.length) {
    const localPath = targets[cursor++];
    const dest = path.join(webRoot, localPath);
    try {
      const res = await fetch(cdnUrlFor(localPath), { headers: { "user-agent": "TL Helper hosted importer" } });
      if (!res.ok) { missing++; continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 100) { missing++; continue; } // guard against empty/placeholder responses
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, buf);
      ok++;
    } catch { missing++; }
    if ((ok + missing) % 50 === 0) console.log(`  ${ok + missing}/${targets.length} (${ok} saved, ${missing} missing)`);
  }
}
await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));
console.log(`done: ${ok} saved, ${missing} missing/unavailable`);
