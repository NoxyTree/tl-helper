// BuildSnapshot v1 contract and calculator-parity regression checks.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../web/tl-core.js";
import {
  BUILD_SNAPSHOT_SCHEMA,
  BUILD_SNAPSHOT_VERSION,
  deserializeBuildSnapshot,
  isBuildSnapshot,
  resolveBuildSnapshot,
  serializeBuildSnapshot,
  snapshotStat,
} from "../web/tl-build-snapshot.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appData = JSON.parse(await readFile(join(repoRoot, "web", "data", "app-data.json"), "utf8"));
const preset = JSON.parse(await readFile(join(repoRoot, "web", "data", "reference-build.json"), "utf8"));
await core.initCore(appData);

const directBuild = core.deepClone(preset.build);
directBuild.masteries = core.normalizeMasterySelections(directBuild.masteries);
const direct = core.calculateBuild(directBuild, preset.attributes);
const directStats = Object.fromEntries(direct.stats.map((row) => [row.id, row.total]));

const snapshot = resolveBuildSnapshot({
  build: preset.build,
  attributes: preset.attributes,
  metadata: { gameDataBuild: appData.gameBuild },
});

assert.equal(snapshot.schema, BUILD_SNAPSHOT_SCHEMA);
assert.equal(snapshot.schemaVersion, BUILD_SNAPSHOT_VERSION);
assert.equal(snapshot.ruleset.gameDataBuild, appData.gameBuild);
assert.notEqual(snapshot.ruleset.gameDataBuild, "unversioned", "committed web data must identify its game build");
assert.equal(snapshot.resolved.combatPower, core.calculateCombatPower(directBuild));
assert.deepEqual(
  Object.fromEntries(snapshot.resolved.stats.map((row) => [row.id, row.total])),
  directStats,
  "snapshot totals must match calculateBuild exactly",
);
for (const [id, total] of Object.entries(directStats)) assert.equal(snapshotStat(snapshot, id), total);

assert.ok(Object.isFrozen(snapshot));
assert.ok(Object.isFrozen(snapshot.loadout));
assert.ok(Object.isFrozen(snapshot.loadout.equipment));
assert.ok(Object.isFrozen(snapshot.resolved.stats));
assert.ok(Object.isFrozen(snapshot.resolved.stats[0].sources));
assert.throws(() => { snapshot.identity.name = "mutated"; }, TypeError);

const serialized = serializeBuildSnapshot(snapshot);
const restored = deserializeBuildSnapshot(serialized);
assert.ok(isBuildSnapshot(restored));
assert.deepEqual(restored, snapshot);
assert.equal(serializeBuildSnapshot(restored), serialized, "canonical serialization must be stable");

const reordered = JSON.parse(serialized);
reordered.ruleset = {
  calculatorVersion: reordered.ruleset.calculatorVersion,
  gameDataBuild: reordered.ruleset.gameDataBuild,
  id: reordered.ruleset.id,
};
assert.equal(serializeBuildSnapshot(reordered), serialized, "object insertion order must not affect serialization");

const sourceName = preset.build.name;
const independent = resolveBuildSnapshot({ build: preset.build, attributes: preset.attributes });
preset.build.name = "changed after snapshot";
assert.equal(independent.identity.name, sourceName, "snapshot must not retain mutable planner references");

assert.throws(
  () => deserializeBuildSnapshot('{"schema":"unknown","schemaVersion":1}'),
  /Unsupported BuildSnapshot schema/,
);

console.log(`BuildSnapshot v${BUILD_SNAPSHOT_VERSION}: calculator parity, immutability, validation, and canonical round-trip passed.`);
