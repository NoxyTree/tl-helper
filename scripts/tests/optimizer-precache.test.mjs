// Guards the precomputed optimizer result cache:
// 1. Canonicalization eligibility rules (anything the cache cannot represent
//    must canonicalize to null so the client falls back to a live run).
// 2. Lookup behavior against a mocked fetch (hit, miss, stale game build).
// 3. When a cache is committed under web/data/optimizer-precache/, it must be
//    fresh: game build matches app-data, engine fingerprint matches current
//    sources (re-run scripts/precompute-optimizer-results.mjs when this
//    fails), every entry file exists, its key re-derives, and its stored
//    build passes the full legality calculation.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import * as core from "../../web/tl-core.js";
import { canonicalPrecacheRequest, loadPrecachedResult, precacheKey } from "../../web/optimizer/tl-optimizer-precache.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";
import { optimizerEngineFingerprint } from "../lib/optimizer-engine-fingerprint.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);

const scratchSource = () => ({ build: core.createInitialBuild(), attributes: { str: 0, dex: 0, int: 0, per: 0, con: 0 }, sourceKind: "scratch", name: "fixture" });

function eligibleRequest(overrides = {}) {
  return {
    build: scratchSource(),
    sourceKind: "scratch",
    weaponTypes: ["sword", "sword2h"],
    attributePointBudget: 59,
    goals: { priorities: [{ id: "hp_max", rank: 1, mode: "maximize", minimum: null, target: null }], protect: [] },
    lockedSlotIds: [],
    progression: { enabled: true, skillLevelCap: 20, masteryPointsByWeapon: {}, overallMasteryLevel: 0 },
    rules: {
      minimumItemLevel: 50, keepCurrentHeroics: false, reconsiderHeroics: true, includeSetEffects: true,
      optimizeThreeTraits: true, bestHeroicConfiguration: true, allowUnownedHeroics: true,
      runes: { mode: "normal", chaosOwnershipRequired: true, normalDuplicateCap: 3, chaosDuplicateCap: 1 },
      artifacts: { mode: "sets" },
    },
    depth: "thorough",
    ...overrides,
  };
}

test("cache-representable scratch requests canonicalize deterministically", async () => {
  const canonical = canonicalPrecacheRequest(eligibleRequest());
  assert.ok(canonical, "the default scratch request must be cache-eligible");
  assert.deepEqual(canonical, canonicalPrecacheRequest(eligibleRequest()));
  const key = await precacheKey(canonical, appData.gameBuild);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(key, await precacheKey(canonicalPrecacheRequest(eligibleRequest()), appData.gameBuild));
});

test("requests the cache cannot represent canonicalize to null", () => {
  assert.equal(canonicalPrecacheRequest(eligibleRequest({ depth: "fast" })), null, "non-thorough depth");
  assert.equal(canonicalPrecacheRequest(eligibleRequest({ sourceKind: "existing" })), null, "existing builds");
  assert.equal(canonicalPrecacheRequest(eligibleRequest({ lockedSlotIds: ["head"] })), null, "locked slots");
  assert.equal(canonicalPrecacheRequest(eligibleRequest({ scenario: { kind: "combat" } })), null, "combat scenarios");
  assert.equal(canonicalPrecacheRequest(eligibleRequest({ goals: { priorities: [{ id: "hp_max", rank: 1 }], protect: ["endurance"] } })), null, "protect lists");
  assert.equal(canonicalPrecacheRequest(eligibleRequest({ goals: { priorities: [] } })), null, "no priorities");
  const equipped = eligibleRequest();
  equipped.build.build.equipment.main_hand = { ...core.emptyEquipmentSelection(), itemId: appData.items[0].id };
  assert.equal(canonicalPrecacheRequest(equipped), null, "pre-equipped source builds");
  const allocated = eligibleRequest();
  allocated.build.attributes.str = 5;
  assert.equal(canonicalPrecacheRequest(allocated), null, "pre-allocated attributes");
});

test("loadPrecachedResult returns the stored result only on an exact, fresh hit", async () => {
  const request = eligibleRequest();
  const canonical = canonicalPrecacheRequest(request);
  const key = await precacheKey(canonical, appData.gameBuild);
  const storedResult = { build: { equipment: {} }, score: 1 };
  const respond = (body) => ({ ok: true, json: async () => body });
  const fetchFor = (index, entry) => async (url) => String(url).endsWith("index.json") ? respond(index) : respond(entry);
  const index = { schema: "tl-helper.optimizer-precache-index", gameBuild: String(appData.gameBuild), entries: { [key]: "entry.json" } };
  const entry = { schema: "tl-helper.optimizer-precache-entry", key, result: storedResult };

  assert.deepEqual(await loadPrecachedResult(request, { gameBuild: appData.gameBuild, fetchImpl: fetchFor(index, entry) }), storedResult);
  assert.equal(await loadPrecachedResult(request, { gameBuild: "other-build", fetchImpl: fetchFor(index, entry) }), null, "game build mismatch");
  assert.equal(await loadPrecachedResult(request, { gameBuild: appData.gameBuild, fetchImpl: fetchFor({ ...index, gameBuild: "stale" }, entry) }), null, "stale index");
  assert.equal(await loadPrecachedResult(request, { gameBuild: appData.gameBuild, fetchImpl: fetchFor({ ...index, entries: {} }, entry) }), null, "missing entry");
  assert.equal(await loadPrecachedResult(request, { gameBuild: appData.gameBuild, fetchImpl: fetchFor(index, { ...entry, key: "wrong" }) }), null, "entry key mismatch");
  assert.equal(await loadPrecachedResult(eligibleRequest({ depth: "fast" }), { gameBuild: appData.gameBuild, fetchImpl: fetchFor(index, entry) }), null, "ineligible request");
  assert.equal(await loadPrecachedResult(request, { gameBuild: appData.gameBuild, fetchImpl: async () => { throw new Error("network down"); } }), null, "fetch failure degrades to live run");
});

const cacheDir = join(repoRoot, "web", "data", "optimizer-precache");
const indexPath = join(cacheDir, "index.json");

test("a committed precache is fresh and internally consistent", { skip: !existsSync(indexPath) && "no committed precache" }, async () => {
  const index = JSON.parse(readFileSync(indexPath, "utf8"));
  assert.equal(index.schema, "tl-helper.optimizer-precache-index");
  assert.equal(String(index.gameBuild), String(appData.gameBuild), "precache was generated for a different game data build — re-run scripts/precompute-optimizer-results.mjs");
  assert.equal(index.engineFingerprint, optimizerEngineFingerprint(join(repoRoot, "web")), "optimizer engine sources changed since the precache was generated — re-run scripts/precompute-optimizer-results.mjs");
  const entryNames = Object.entries(index.entries ?? {});
  assert.ok(entryNames.length > 0, "a committed index must contain entries");
  for (const [key, fileName] of entryNames) {
    const entry = JSON.parse(readFileSync(join(cacheDir, fileName), "utf8"));
    assert.equal(entry.key, key, `${fileName}: key mismatch`);
    assert.equal(await precacheKey(entry.canonicalRequest, index.gameBuild), key, `${fileName}: canonical request does not re-derive its key`);
    const attributes = entry.result.optimizedAttributes ?? entry.result.attributes ?? {};
    const calc = core.calculateBuild(entry.result.build, attributes, { includeSetEffects: true });
    assert.equal(calc.status.state, "legal", `${fileName}: stored build must pass the legality calculation`);
  }
});
