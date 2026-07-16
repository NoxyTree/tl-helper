// BuildSnapshot v2 contract, migration, and calculator-parity regression checks.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as core from "../web/tl-core.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";
import {
  BUILD_SNAPSHOT_SCHEMA,
  BUILD_SNAPSHOT_VERSION,
  STATIC_CALCULATION_CONTEXT,
  STATIC_CALCULATOR_VERSION,
  STATIC_RULESET_ID,
  deserializeBuildSnapshot,
  isBuildSnapshot,
  resolveBuildSnapshot,
  serializeBuildSnapshot,
  snapshotStat,
  staticCalculationFingerprint,
} from "../web/tl-build-snapshot.js";
import { CHARACTER_LEVEL } from "../web/tl-questlog-rules.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
const preset = JSON.parse(await readFile(join(repoRoot, "web", "data", "reference-build.json"), "utf8"));
await core.initCore(appData);

const directBuild = core.deepClone(preset.build);
const direct = core.calculateBuild(directBuild, preset.attributes);
const directStats = Object.fromEntries(direct.stats.map((row) => [row.id, row.total]));

const snapshot = resolveBuildSnapshot({
  build: preset.build,
  attributes: preset.attributes,
  metadata: { gameDataBuild: "spoofed-build", calculatorVersion: "spoofed-calculator", characterLevel: 1 },
});

assert.equal(snapshot.schema, BUILD_SNAPSHOT_SCHEMA);
assert.equal(snapshot.schemaVersion, BUILD_SNAPSHOT_VERSION);
assert.equal(snapshot.ruleset.id, STATIC_RULESET_ID);
assert.equal(snapshot.ruleset.gameDataBuild, appData.gameBuild);
assert.equal(snapshot.ruleset.calculatorVersion, STATIC_CALCULATOR_VERSION);
assert.equal(snapshot.character.level, CHARACTER_LEVEL);
assert.deepEqual(snapshot.calculationContext, STATIC_CALCULATION_CONTEXT);
assert.notEqual(snapshot.ruleset.gameDataBuild, "unversioned", "committed web data must identify its game build");
assert.equal(snapshot.resolved.combatPower, core.calculateCombatPower(directBuild));
assert.deepEqual(
  Object.fromEntries(snapshot.resolved.stats.map((row) => [row.id, row.total])),
  directStats,
  "snapshot totals must match calculateBuild exactly",
);
assert.equal("status" in snapshot.resolved, "status" in direct, "snapshot status presence must match calculateBuild");
if ("status" in direct) assert.equal(snapshot.resolved.status.state, direct.status.state);
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

const forgedV2 = JSON.parse(serialized);
forgedV2.ruleset = { id: "obsolete", gameDataBuild: "old", calculatorVersion: "0" };
forgedV2.character.level = 1;
forgedV2.resolved.stats[0].total = 987654321;
const refreshedV2 = deserializeBuildSnapshot(forgedV2);
assert.deepEqual(refreshedV2, snapshot, "v2 deserialization must ignore serialized provenance and resolved totals");

const forgedObject = JSON.parse(serialized);
forgedObject.resolved.stats[0].total = 987654321;
assert.equal(isBuildSnapshot(forgedObject), false, "a current-looking plain object with forged totals must not pass the object boundary");
assert.throws(() => snapshotStat(forgedObject, forgedObject.resolved.stats[0].id), /does not match its authoritative raw loadout/);

const forgedV1 = JSON.parse(serialized);
forgedV1.schemaVersion = 1;
forgedV1.ruleset = { id: "questlog-static-v1", gameDataBuild: "old", calculatorVersion: "1" };
forgedV1.character.level = 1;
delete forgedV1.calculationContext;
forgedV1.resolved.stats[0].total = -987654321;
delete forgedV1.resolved.status;
const migratedV1 = deserializeBuildSnapshot(forgedV1);
assert.deepEqual(migratedV1, snapshot, "v1 migration must rebuild a current v2 snapshot from raw inputs");
assert.equal(serializeBuildSnapshot(migratedV1), serialized, "migrated v1 output must use stable canonical v2 serialization");

const fingerprint = staticCalculationFingerprint({ build: preset.build, attributes: preset.attributes });
assert.equal(fingerprint, staticCalculationFingerprint({ build: JSON.parse(JSON.stringify(preset.build)), attributes: { ...preset.attributes } }));
assert.notEqual(fingerprint, staticCalculationFingerprint({ build: preset.build, attributes: { ...preset.attributes, str: Number(preset.attributes.str ?? 0) + 1 } }));
assert.notEqual(fingerprint, staticCalculationFingerprint({ build: preset.build, attributes: preset.attributes, includeSetEffects: false }));

const rawInvalidBuild = core.createInitialBuild();
const rawMastery = appData.masteries.find((row) => row.specializationType === "normal");
const rawWeapon = appData.items.find((item) => item.equipmentType === rawMastery.mainCategory);
rawInvalidBuild.equipment.main_hand = { ...core.emptyEquipmentSelection(), itemId: rawWeapon.id, level: core.itemMaxLevel(rawWeapon) };
rawInvalidBuild.masteries = { [rawMastery.id]: { level: 999 } };
const rawInvalidSnapshot = resolveBuildSnapshot({ build: rawInvalidBuild, attributes: {} });
assert.equal(rawInvalidSnapshot.loadout.masteries[rawMastery.id].level, 999, "raw invalid mastery input must remain visible in the snapshot");
assert.equal(rawInvalidSnapshot.resolved.status.state, "provisional", "raw invalid mastery input must not be normalized before authority classification");
assert.ok(rawInvalidSnapshot.resolved.status.provisionalIssues.some((issue) => issue.code === "invalid_mastery_level"));

const nonfiniteBuild = core.createInitialBuild();
const nonfiniteSkill = appData.skills.find((row) => row.skillType === "passive");
const nonfiniteWeapon = appData.items.find((item) => item.equipmentType === nonfiniteSkill.mainCategory);
nonfiniteBuild.equipment.main_hand = { ...core.emptyEquipmentSelection(), itemId: nonfiniteWeapon.id, level: core.itemMaxLevel(nonfiniteWeapon) };
nonfiniteBuild.skills = [{ skillId: nonfiniteSkill.id, level: Number.NEGATIVE_INFINITY }];
const nonfiniteSnapshot = resolveBuildSnapshot({ build: nonfiniteBuild, attributes: {} });
assert.equal(nonfiniteSnapshot.loadout.skills[0].level, "-Infinity", "nonfinite raw input must retain a stable invalid sentinel");
assert.equal(nonfiniteSnapshot.resolved.status.state, "provisional", "BuildSnapshot must not launder nonfinite progression into a legal default");
assert.ok(nonfiniteSnapshot.resolved.status.provisionalIssues.some((issue) => issue.code === "invalid_skill_level"));
assert.notEqual(
  staticCalculationFingerprint({ build: nonfiniteBuild, attributes: {} }),
  staticCalculationFingerprint({ build: { ...nonfiniteBuild, skills: [{ skillId: nonfiniteSkill.id, level: null }] }, attributes: {} }),
  "nonfinite and null progression must not collide in calculation caches",
);

const invalidAttributeSnapshot = resolveBuildSnapshot({
  build: preset.build,
  attributes: { ...preset.attributes, str: 60, injected_stat: 999999 },
});
assert.equal(invalidAttributeSnapshot.character.attributes.str, 60);
assert.equal(invalidAttributeSnapshot.character.attributes.injected_stat, 999999);
assert.equal(invalidAttributeSnapshot.resolved.status.state, "invalid");
assert.ok(invalidAttributeSnapshot.resolved.status.invalidIssues.some((issue) => issue.code === "attribute_budget_exceeded"));
assert.ok(invalidAttributeSnapshot.resolved.status.invalidIssues.some((issue) => issue.code === "unknown_attribute_id"));
assert.equal(snapshotStat(invalidAttributeSnapshot, "injected_stat"), 0);

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

console.log(`BuildSnapshot v${BUILD_SNAPSHOT_VERSION}: current provenance, calculator parity, v1 migration, forged-total rejection, immutability, and canonical round-trip passed.`);
