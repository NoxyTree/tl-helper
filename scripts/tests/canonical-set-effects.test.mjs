import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  UNSUPPORTED_SET_BREAKPOINTS,
  buildItemHoverModel,
  calculateBuild,
  classifySetBreakpoint,
  createInitialBuild,
  initCore,
  setEffectBreakpointSummary,
} from "../../web/tl-core.js";

const passiveBonus = (setCount, text = "Synthetic passive") => ({
  set_count: setCount,
  bonus_stat: [],
  bonus_passive: [{ name: text, text }],
});

const item = (id, equipmentType, setId) => ({ id, name: id, equipmentType, setId, itemStats: {} });

const dataFor = (items, itemSets) => ({
  items,
  itemSets,
  artifactSets: [],
  runes: [],
  runeSynergies: [],
  attributeStats: {},
  masteries: [],
  skills: [],
  skillTraits: [],
});

const equip = (build, rows) => {
  for (const row of rows) build.equipment[row.equipmentType] = { ...build.equipment[row.equipmentType], itemId: row.id };
};

test("all projected breakpoints have exactly one machine-checkable classification", async () => {
  const projection = JSON.parse(await readFile(new URL("../../web/data/projections/equipment.json", import.meta.url), "utf8")).data;
  const classifications = projection.itemSets.flatMap((set) => set.itemSetBonus.map((bonus) => classifySetBreakpoint(set.id, bonus)));
  assert.equal(classifications.length, 151);
  assert.deepEqual(
    Object.fromEntries(["structured", "mapped", "unsupported"].map((kind) => [kind, classifications.filter((row) => row.kind === kind).length])),
    { structured: 40, mapped: 101, unsupported: 10 },
  );
  assert.equal(classifications.filter((row) => ["conflict", "unclassified"].includes(row.kind)).length, 0);
  assert.deepEqual(
    classifications.filter((row) => row.kind === "unsupported").map((row) => row.key).sort(),
    Object.keys(UNSUPPORTED_SET_BREAKPOINTS).sort(),
  );
  assert.equal(classifySetBreakpoint("set_aa_T2_plate_005", passiveBonus(4)).confidence, "derived");
  assert.equal(classifySetBreakpoint("set_aa_T2_fabric_003", passiveBonus(2)).confidence, "modeled");
});

test("calculateBuild returns applied, inactive, and explicit unsupported set breakpoints", async () => {
  const nineLives = [
    item("nine-head", "head", "set_aa_t4_Plate_003"),
    item("nine-chest", "chest", "set_aa_t4_Plate_003"),
    item("nine-hands", "hands", "set_aa_t4_Plate_003"),
    item("nine-legs", "legs", "set_aa_t4_Plate_003"),
  ];
  const motherNature = [
    item("nature-necklace", "necklace", "set_aa_fabric_001"),
    item("nature-bracelet", "bracelet", "set_aa_fabric_001"),
  ];
  await initCore(dataFor([...nineLives, ...motherNature], [
    { id: "set_aa_t4_Plate_003", name: "Nine Lives Set", itemSetMadeOfItems: nineLives, itemSetBonus: [passiveBonus(2, "Nine Lives 2"), passiveBonus(4, "Nine Lives 4")] },
    { id: "set_aa_fabric_001", name: "Mother Nature Set", itemSetMadeOfItems: motherNature, itemSetBonus: [passiveBonus(2, "Weaken Duration +7.5")] },
  ]));
  const build = createInitialBuild();
  equip(build, [...nineLives.slice(0, 2), ...motherNature]);
  const result = calculateBuild(build, {});

  assert.equal(result.setEffects.schema, "tl-helper.set-effects");
  assert.equal(result.setEffects.schemaVersion, 1);
  assert.equal(result.setEffects.included, true);
  const nine = result.setEffects.sets.find((set) => set.setId === "set_aa_t4_Plate_003");
  assert.equal(nine.equippedPieces, 2);
  assert.equal(nine.breakpoints.find((row) => row.required === 2).status, "applied");
  assert.equal(nine.breakpoints.find((row) => row.required === 4).status, "inactive");
  const twoPiece = nine.breakpoints.find((row) => row.required === 2);
  assert.ok(twoPiece.appliedStats.some((row) => row.statId === "critical_damage_taken_modifier" && row.value === 1000));
  assert.ok(twoPiece.appliedStats.some((row) => row.statId === "melee_critical_attack" && row.expandedFrom === "all_critical_attack"));
  assert.ok(result.stats.find((row) => row.id === "critical_damage_taken_modifier").sources.some((source) => source.setEffectKey === twoPiece.key));

  const unsupported = result.setEffects.sets.find((set) => set.setId === "set_aa_fabric_001").breakpoints[0];
  assert.equal(unsupported.active, true);
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.confidence, "unsupported");
  assert.match(unsupported.provenance.reason, /Weaken Duration/);
  assert.match(setEffectBreakpointSummary(unsupported), /^Not calculated: .*Weaken Duration/);
  const hover = buildItemHoverModel("necklace", build, result);
  assert.match(hover.setInfo.bonuses[0].computedText, /^Not calculated: .*Weaken Duration/);
  assert.deepEqual(result.setEffects.unsupportedActive.map((row) => row.key), ["set_aa_fabric_001:2"]);
});

test("set breakdown records stat-scoped modeled suppression without hiding unrelated stats", async () => {
  const imperial = [item("imperial-head", "head", "set_aa_T2_leather_006"), item("imperial-chest", "chest", "set_aa_T2_leather_006")];
  const secret = [item("secret-hands", "hands", "set_aa_t3_leather_004"), item("secret-legs", "legs", "set_aa_t3_leather_004")];
  await initCore(dataFor([...imperial, ...secret], [
    { id: "set_aa_T2_leather_006", name: "Imperial Seeker Set", itemSetMadeOfItems: imperial, itemSetBonus: [passiveBonus(2)] },
    { id: "set_aa_t3_leather_004", name: "Secret Order Set", itemSetMadeOfItems: secret, itemSetBonus: [passiveBonus(2)] },
  ]));
  const build = createInitialBuild();
  equip(build, [...imperial, ...secret]);
  const result = calculateBuild(build, {});
  const imperialEffect = result.setEffects.sets.find((set) => set.setId === "set_aa_T2_leather_006").breakpoints[0];
  const secretEffect = result.setEffects.sets.find((set) => set.setId === "set_aa_t3_leather_004").breakpoints[0];

  assert.equal(imperialEffect.status, "applied");
  assert.equal(imperialEffect.provenance.application, "modeled");
  assert.equal(secretEffect.status, "applied_with_suppression");
  assert.deepEqual(secretEffect.suppression.statIds, ["critical_damage_dealt_modifier"]);
  assert.equal(secretEffect.suppression.winnerSetId, "set_aa_T2_leather_006");
  assert.ok(secretEffect.suppressedStats.some((row) => row.statId === "critical_damage_dealt_modifier" && row.value === 1200));
  assert.ok(secretEffect.appliedStats.some((row) => row.statId === "double_damage_dealt_modifier" && row.value === 1400));
  assert.match(setEffectBreakpointSummary(secretEffect), /Heavy Attack Damage \+14%.*Not applied: Critical Damage \+12% is replaced by Imperial Seeker Set/);
  const criticalSources = result.stats.find((row) => row.id === "critical_damage_dealt_modifier").sources.filter((row) => row.type === "set_bonus");
  assert.deepEqual(criticalSources.map((row) => row.setId), ["set_aa_T2_leather_006"]);
});

test("excluded set effects retain topology without claiming applied values", async () => {
  const nineLives = [item("nine-head", "head", "set_aa_t4_Plate_003"), item("nine-chest", "chest", "set_aa_t4_Plate_003")];
  await initCore(dataFor(nineLives, [
    { id: "set_aa_t4_Plate_003", name: "Nine Lives Set", itemSetMadeOfItems: nineLives, itemSetBonus: [passiveBonus(2)] },
  ]));
  const build = createInitialBuild();
  equip(build, nineLives);
  const result = calculateBuild(build, {}, { includeSetEffects: false });
  const effect = result.setEffects.sets[0].breakpoints[0];
  assert.equal(result.setEffects.included, false);
  assert.equal(effect.active, true);
  assert.equal(effect.status, "excluded");
  assert.deepEqual(effect.appliedStats, []);
  assert.equal(result.stats.find((row) => row.id === "critical_damage_taken_modifier"), undefined);
});
