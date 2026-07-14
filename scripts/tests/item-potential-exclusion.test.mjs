import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import * as core from "../../web/tl-core.js";
import {
  STATIC_CALCULATION_CONTEXT,
  STATIC_CALCULATOR_VERSION,
  STATIC_RULESET_ID,
  deserializeBuildSnapshot,
  resolveBuildSnapshot,
  serializeBuildSnapshot,
} from "../../web/tl-build-snapshot.js";
import { loadWebDataFromFile } from "../lib/load-web-projections.mjs";

const root = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"));
const data = await loadWebDataFromFile(join(root, "web", "data", "app-data.json"));
await core.initCore(data);

const attributes = { str: 0, dex: 0, int: 0, per: 0, con: 0 };
const totals = (calculation) => Object.fromEntries(calculation.stats.map((row) => [row.id, row.total]));

function buildWithPotentialItem(potentialId = "") {
  const item = core.data.items.find((row) => row.itemPotential?.stats?.length && row.itemPotential?.skills?.length);
  const slot = core.EQUIPMENT_SLOTS.find((row) => row.types.includes(item?.equipmentType));
  assert.ok(item && slot, "expected a projected Item Potential carrier");
  const build = core.createInitialBuild();
  build.equipment[slot.id] = {
    ...core.emptyEquipmentSelection(),
    itemId: item.id,
    level: core.itemMaxLevel(item),
    potentialId,
  };
  return { build, item, slotId: slot.id };
}

function buildWithAscendedSkill(level) {
  const skill = core.data.skills.find((row) => core.skillMaxLevel(row) > core.skillBandedMax(row));
  const item = core.data.items.find((row) => row.equipmentType === skill?.mainCategory);
  const slot = core.EQUIPMENT_SLOTS.find((row) => row.types.includes(item?.equipmentType));
  assert.ok(skill && item && slot, "expected an Ascended-capable skill and matching weapon");
  const build = core.createInitialBuild();
  build.equipment[slot.id] = {
    ...core.emptyEquipmentSelection(),
    itemId: item.id,
    level: core.itemMaxLevel(item),
  };
  build.skills = [{
    skillId: skill.id,
    level,
    loadoutType: core.skillLoadoutType(skill),
    specializationIds: [],
  }];
  return { build, skill, slotId: slot.id };
}

test("all Item Potential kinds are explicitly excluded from totals and Combat Power", () => {
  const { build: baseline, item, slotId } = buildWithPotentialItem();
  const baselineCalculation = core.calculateBuild(baseline, attributes);
  const baselinePower = core.calculateCombatPower(baseline);

  for (const potentialId of [item.itemPotential.stats[0].statId, item.itemPotential.skills[0].id]) {
    const selected = structuredClone(baseline);
    selected.equipment[slotId].potentialId = potentialId;
    const calculation = core.calculateBuild(selected, attributes);

    assert.deepEqual(totals(calculation), totals(baselineCalculation));
    assert.equal(core.calculateCombatPower(selected), baselinePower);
    assert.equal(calculation.calculationContext.itemPotentials, "excluded");
    assert.equal(calculation.status.state, "legal");
    assert.ok(calculation.status.ignoredIssues.some((issue) => issue.code === "item_potential_excluded"));
    assert.ok(calculation.stats.every((row) => row.sources.every((source) => source.type !== `${slotId}_potential`)));
  }
});

test("known stat and skill outcomes remain valid stored selections while unknown outcomes fail", () => {
  const { build, item, slotId } = buildWithPotentialItem();
  build.equipment[slotId].potentialId = item.itemPotential.skills[0].id;
  assert.equal(core.calculateBuild(build, attributes).status.state, "legal");

  build.equipment[slotId].potentialId = "missing_item_potential";
  const invalid = core.calculateBuild(build, attributes);
  assert.equal(invalid.status.state, "invalid");
  assert.ok(invalid.status.invalidIssues.some((issue) => issue.code === "invalid_item_potential"));
});

test("stored Ascended skill level 21 is preserved but every calculation resolves it at the normal cap", () => {
  const { build: level21, skill } = buildWithAscendedSkill(21);
  const level20 = structuredClone(level21);
  level20.skills[0].level = core.skillBandedMax(skill);

  const progression = core.effectiveProgression(level21);
  assert.equal(level21.skills[0].level, 21, "raw stored selection must remain untouched");
  assert.equal(progression.skills[0].selection.level, core.skillBandedMax(skill));
  assert.equal(core.calculateCombatPower(level21), core.calculateCombatPower(level20));

  const calculated21 = core.calculateBuild(level21, attributes);
  const calculated20 = core.calculateBuild(level20, attributes);
  assert.deepEqual(totals(calculated21), totals(calculated20));
  assert.equal(calculated21.status.state, "legal");
  assert.ok(calculated21.status.ignoredIssues.some((issue) => issue.code === "item_potential_skill_level_excluded"));
  assert.deepEqual(core.activeScenarioSources(level21), core.activeScenarioSources(level20));
});

test("BuildSnapshot preserves raw level 21 while resolved stats and Combat Power remain level 20", () => {
  const { build: level21, skill } = buildWithAscendedSkill(21);
  const level20 = structuredClone(level21);
  level20.skills[0].level = core.skillBandedMax(skill);

  const snapshot21 = resolveBuildSnapshot({ build: level21, attributes });
  const snapshot20 = resolveBuildSnapshot({ build: level20, attributes });
  const restored = deserializeBuildSnapshot(serializeBuildSnapshot(snapshot21));

  assert.equal(snapshot21.loadout.skills[0].level, 21);
  assert.equal(restored.loadout.skills[0].level, 21);
  assert.deepEqual(snapshot21.resolved.stats, snapshot20.resolved.stats);
  assert.equal(snapshot21.resolved.combatPower, snapshot20.resolved.combatPower);
  assert.ok(snapshot21.resolved.status.ignoredIssues.some((issue) => issue.code === "item_potential_skill_level_excluded"));
});

test("BuildSnapshot owns the excluded scope and round-trips stored stat and skill outcomes", () => {
  const { build, item, slotId } = buildWithPotentialItem();
  assert.equal(STATIC_RULESET_ID, "persistent-static-v3");
  assert.equal(STATIC_CALCULATOR_VERSION, "3");
  assert.equal(STATIC_CALCULATION_CONTEXT.itemPotentials, "excluded");

  for (const potentialId of [item.itemPotential.stats[0].statId, item.itemPotential.skills[0].id]) {
    build.equipment[slotId].potentialId = potentialId;
    const snapshot = resolveBuildSnapshot({ build, attributes });
    const restored = deserializeBuildSnapshot(serializeBuildSnapshot(snapshot));
    assert.equal(snapshot.calculationContext.itemPotentials, "excluded");
    assert.equal(restored.loadout.equipment[slotId].potentialId, potentialId);
    assert.deepEqual(restored.resolved.stats, snapshot.resolved.stats);
  }
});

test("an authentic v2-shaped snapshot migrates into the v3 exclusion context", () => {
  const { build, item, slotId } = buildWithPotentialItem();
  build.equipment[slotId].potentialId = item.itemPotential.stats[0].statId;
  const current = JSON.parse(serializeBuildSnapshot(resolveBuildSnapshot({ build, attributes })));
  current.ruleset.id = "persistent-static-v2";
  current.ruleset.calculatorVersion = "2";
  delete current.calculationContext.itemPotentials;
  current.resolved.stats = [];

  const migrated = deserializeBuildSnapshot(JSON.stringify(current));
  assert.equal(migrated.ruleset.id, "persistent-static-v3");
  assert.equal(migrated.ruleset.calculatorVersion, "3");
  assert.equal(migrated.calculationContext.itemPotentials, "excluded");
  assert.equal(migrated.loadout.equipment[slotId].potentialId, item.itemPotential.stats[0].statId);
  assert.ok(migrated.resolved.stats.length > 0);
});

test("every calculation surface discloses the exclusion and Armory provides a repair path", async () => {
  const files = Object.fromEntries(await Promise.all([
    "index.html",
    "tracker.html",
    "gear-viewer.html",
    "full-build-optimizer.html",
    "build-from-scratch.html",
    "combat-lab.html",
  ].map(async (file) => [file, await readFile(join(root, "web", file), "utf8")])));
  for (const [file, html] of Object.entries(files)) {
    assert.match(html, /Item Potentials are excluded from calculations and recommendations in this release/, file);
  }
  assert.match(files["index.html"], /Item Potential \(excluded\)/);
  assert.match(files["index.html"], /all stat and skill outcomes are excluded from totals and recommendations/);
  assert.match(files["index.html"], /potentialStatDisabled: true/);
  assert.match(files["index.html"], /hasPotentialStats: potentialStatOptions\.length > 0 \|\| potentialSkills\.length > 0 \|\| \(isEquippedPreview && Boolean\(selection\.potentialId\)\)/);
  assert.match(files["index.html"], /storedPotentialLabel/);
  assert.match(files["index.html"], /Clear stored Item Potential/);
  assert.match(files["index.html"], /onClearPotential: \(\) => isEquippedPreview && this\.setPotentialStat\(slot\.id, ""\)/);
});

test("same-item generated candidates preserve excluded stored potentials", async () => {
  const adapter = await readFile(join(root, "web", "tl-full-build-adapter.js"), "utf8");
  const gear = await readFile(join(root, "web", "gear-viewer.html"), "utf8");
  assert.match(adapter, /item\.id === current\?\.itemId && current\?\.potentialId/);
  assert.match(adapter, /selection\.potentialId = current\.potentialId/);
  assert.match(gear, /isActualItem && actualSelection\?\.potentialId/);
  assert.match(gear, /baseSelection = \{ \.\.\.baseSelection, potentialId: actualSelection\.potentialId \}/);
});
