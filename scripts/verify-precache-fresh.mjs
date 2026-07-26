// Deploy guard: refuse to ship a precache that disagrees with the engine.
//
// The optimizer is deterministic, so a precached result is only correct while
// the engine that produced it matches the engine being shipped. That match
// cannot be checked in the browser -- the fingerprint is a hash over engine
// module SOURCES read from disk, which a client has no access to. The runtime
// lookup therefore validates only gameBuild, and freshness is enforced here and
// in scripts/tests/optimizer-precache.test.mjs.
//
// The test alone is not sufficient: it only protects a deploy that ran it. This
// guard sits on the deploy path itself, so a stale cache cannot reach players
// via a force-deploy, a skipped suite, or a partial upload that ships new JS
// against an old cache directory. A cached player and a live player getting
// different answers to the same request is the one failure this project cannot
// ship.
//
//   node scripts/verify-precache-fresh.mjs
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { optimizerEngineFingerprint } from "./lib/optimizer-engine-fingerprint.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(repoRoot, "web");
const indexPath = path.join(webRoot, "data", "optimizer-precache", "index.json");

// No committed cache is a valid state: every request simply runs live.
if (!existsSync(indexPath)) {
  console.log("precache: no committed index — every request runs live. OK.");
  process.exit(0);
}

const index = JSON.parse(readFileSync(indexPath, "utf8"));
const appData = JSON.parse(readFileSync(path.join(webRoot, "data", "app-data.json"), "utf8"));
const expected = optimizerEngineFingerprint(webRoot);

const problems = [];
if (index.schema !== "tl-helper.optimizer-precache-index") {
  problems.push(`index schema is "${index.schema}", expected "tl-helper.optimizer-precache-index"`);
}
if (String(index.gameBuild) !== String(appData.gameBuild)) {
  problems.push(`game data build mismatch: cache ${index.gameBuild}, app-data ${appData.gameBuild}`);
}
if (index.engineFingerprint !== expected) {
  problems.push(`engine fingerprint mismatch:\n    cache    ${index.engineFingerprint}\n    engine   ${expected}`);
}

if (problems.length) {
  console.error("REFUSING TO DEPLOY — the committed precache does not match the engine being shipped.\n");
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nCached players would receive different numbers than live players for the");
  console.error("same request. Fix by regenerating:\n");
  console.error("    node scripts/precompute-optimizer-results.mjs\n");
  process.exit(1);
}

const entryCount = Object.keys(index.entries ?? {}).length;
console.log(`precache: fresh — ${entryCount} entries, game build ${index.gameBuild}, engine ${expected.slice(0, 16)}…`);
