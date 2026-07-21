// Fetches drop/dungeon/vendor sourcing for every equipment item from Questlog's
// public tRPC API (database.getItem) and writes a static projection the gearing
// guide consumes. Drops don't change between game builds, so this is a build-time
// fetch — NOT a runtime call. Throttled + disk-cached so it is resumable and kind
// to the API (mirrors scripts/audit-questlog-coverage.mjs's snapshot approach).
//
// Usage:
//   node scripts/fetch-questlog-drops.mjs [--out <file>] [--concurrency N] [--limit N]
//   Cache dir: <scratch>/questlog-item-cache/  (raw getItem json per id; delete to refetch)
//
// Output: questlog-drops.json { schema, fetchedAtUtc, source, items:{ <id>:{ dropsFrom:[...] } } }
// dropsFrom entry: { location, kind:'boss'|'dungeon'|'vendor', level, probability }

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (flag, dflt) => { const i = process.argv.indexOf(flag); return i >= 0 ? process.argv[i + 1] : dflt; };
const OUT = arg("--out", path.join(repoRoot, "web", "data", "projections", "questlog-drops.json"));
const CONCURRENCY = Number(arg("--concurrency", "6"));
const LIMIT = Number(arg("--limit", "0")) || Infinity;
const CACHE_DIR = process.env.TL_QUESTLOG_CACHE
  ?? path.join(process.env.TEMP ?? repoRoot, "questlog-item-cache");
const UA = "TL Helper hosted importer";

mkdirSync(CACHE_DIR, { recursive: true });

async function getItem(id) {
  const cacheFile = path.join(CACHE_DIR, `${id.replace(/[^a-zA-Z0-9_.-]/g, "_")}.json`);
  if (existsSync(cacheFile)) {
    try { return JSON.parse(readFileSync(cacheFile, "utf8")); } catch { /* refetch on parse error */ }
  }
  const input = encodeURIComponent(JSON.stringify({ language: "en", id }));
  const url = `https://questlog.gg/throne-and-liberty/api/trpc/database.getItem?input=${input}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, accept: "application/json" } });
      if (res.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
      if (!res.ok) return null;
      const body = await res.json();
      const item = body?.result?.data?.json ?? body?.result?.data ?? null;
      if (item) writeFileSync(cacheFile, JSON.stringify(item));
      return item;
    } catch { await sleep(600 * (attempt + 1)); }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function extractDrops(item) {
  if (!item) return [];
  const out = [];
  for (const npc of item.itemDroppedFromNpcs ?? []) {
    out.push({ location: npc.name, kind: npc.mainCategory === "boss" ? "boss" : "npc", level: npc.level ?? null, probability: npc.probability ?? null });
  }
  for (const dg of item.itemIsRewardOfGuildDungeons ?? []) {
    out.push({ location: dg.name, kind: "dungeon", level: dg.level ?? null, probability: null });
  }
  for (const v of item.itemIsSoldByNpcs ?? []) {
    out.push({ location: v.name, kind: "vendor", level: v.level ?? null, probability: null });
  }
  // De-dupe by location+kind; sort bosses first, then by descending probability.
  const seen = new Set();
  return out
    .filter((d) => d.location && !seen.has(d.kind + d.location) && seen.add(d.kind + d.location))
    .sort((a, b) => (a.kind === "boss" ? 0 : 1) - (b.kind === "boss" ? 0 : 1) || (b.probability ?? 0) - (a.probability ?? 0));
}

async function main() {
  const eq = JSON.parse(readFileSync(path.join(repoRoot, "web", "data", "projections", "equipment.json"), "utf8"));
  const ids = eq.data.items.map((i) => i.id).slice(0, LIMIT);
  const items = {};
  let done = 0, withDrops = 0;

  // simple concurrency pool
  let cursor = 0;
  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const drops = extractDrops(await getItem(id));
      if (drops.length) { items[id] = { dropsFrom: drops }; withDrops++; }
      if (++done % 100 === 0) console.log(`  ${done}/${ids.length} fetched, ${withDrops} with drops`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, worker));

  const out = {
    schema: "tl-helper.questlog-drops",
    schemaVersion: 1,
    fetchedAtUtc: new Date().toISOString(),
    source: "questlog.gg database.getItem",
    gameBuild: eq.gameBuild,
    coverage: { totalItems: ids.length, withDrops },
    items,
  };
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`questlog-drops.json written -> ${OUT}`);
  console.log(`  ${withDrops}/${ids.length} items have drop/dungeon/vendor sources`);
}

main();
