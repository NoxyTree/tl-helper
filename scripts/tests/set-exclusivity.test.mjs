import assert from "node:assert/strict";
import test from "node:test";

import { calculateBuild, createInitialBuild, initCore } from "../../web/tl-core.js";
import { optimizeFullBuild } from "../../web/tl-full-build-optimizer.js";
import { SET_EXCLUSIVITY_GROUPS, SET_PASSIVE_RULES } from "../../web/tl-questlog-rules.js";

const FA = "set_aa_T2_leather_004";
const LS = "set_aa_t3_lether_003";
const DM = "set_aa_T2_leather_003";
const DEATH = "set_aa_leather_002";
const IMPERIAL = "set_aa_T2_leather_006";
const SECRET = "set_aa_t3_leather_004";

const armorItem = (id, equipmentType, setId, extraStats) => ({
  id,
  name: id,
  equipmentType,
  ...(setId ? { setId } : {}),
  ...(extraStats ? { itemStats: { extra: { 0: extraStats } } } : {}),
});
const passiveBonus = (setCount) => ({ set_count: setCount, bonus_stat: [], bonus_passive: [{ name: "Synthetic passive" }] });

const items = [
  armorItem("fa_head", "head", FA),
  armorItem("fa_chest", "chest", FA),
  armorItem("ls_hands", "hands", LS),
  armorItem("ls_legs", "legs", LS),
  armorItem("dm_hands", "hands", DM),
  armorItem("dm_legs", "legs", DM),
  armorItem("plain_hands", "hands", null, { magic_evasion: 500 }),
  armorItem("plain_legs", "legs", null, { magic_evasion: 500 }),
  armorItem("death_head", "head", DEATH),
  armorItem("death_chest", "chest", DEATH),
  armorItem("imperial_hands", "hands", IMPERIAL),
  armorItem("imperial_legs", "legs", IMPERIAL),
  armorItem("secret_feet", "feet", SECRET),
  armorItem("secret_cloak", "cloak", SECRET),
];

await initCore({
  items,
  itemSets: [
    { id: FA, name: "Forgotten Assassin Set", itemSetBonus: [passiveBonus(2)] },
    { id: LS, name: "Lightning Strike Set", itemSetBonus: [passiveBonus(2)] },
    { id: DM, name: "Dawn Mist Set", itemSetBonus: [passiveBonus(2), passiveBonus(4)] },
    { id: DEATH, name: "Death Set", itemSetBonus: [passiveBonus(2)] },
    { id: IMPERIAL, name: "Imperial Seeker Set", itemSetBonus: [passiveBonus(2)] },
    { id: SECRET, name: "Secret Order Set", itemSetBonus: [passiveBonus(2)] },
  ],
  artifactSets: [],
  runes: [],
  masteries: [],
  skills: [],
  skillTraits: [],
});

const equipBuild = (slotToItem) => {
  const build = createInitialBuild();
  for (const [slot, itemId] of Object.entries(slotToItem)) build.equipment[slot].itemId = itemId;
  return build;
};

const statRow = (calc, id) => calc.stats.find((row) => row.id === id);
const total = (calc, id) => statRow(calc, id)?.uncappedTotal ?? statRow(calc, id)?.total ?? 0;
const baseline = calculateBuild(equipBuild({}), {});
const delta = (calc, id) => total(calc, id) - total(baseline, id);

test("exclusive set groups preserve decoded priorities and temporary modeled precedence", () => {
  assert.equal(SET_EXCLUSIVITY_GROUPS.evasion[FA].pieces, 2);
  assert.equal(SET_EXCLUSIVITY_GROUPS.evasion[LS].pieces, 2);
  assert.ok(SET_EXCLUSIVITY_GROUPS.evasion[FA].precedence > SET_EXCLUSIVITY_GROUPS.evasion[LS].precedence);
  assert.equal(SET_EXCLUSIVITY_GROUPS.evasion[FA].decodedPriority, 2);
  assert.equal(SET_EXCLUSIVITY_GROUPS.evasion[LS].decodedPriority, 1);
  assert.ok(SET_PASSIVE_RULES[FA]?.[2]);
  assert.ok(SET_PASSIVE_RULES[LS]?.[2]);
  for (const [setId, row] of Object.entries(SET_EXCLUSIVITY_GROUPS.damage_over_time)) {
    assert.equal(SET_PASSIVE_RULES[setId]?.[row.pieces], undefined, `${setId} remains combat-only`);
  }
});

test("only the stronger active exclusive evasion set contributes", () => {
  const calc = calculateBuild(equipBuild({ head: "fa_head", chest: "fa_chest", hands: "ls_hands", legs: "ls_legs" }), {});
  for (const school of ["magic_evasion", "melee_evasion", "range_evasion"]) assert.equal(delta(calc, school), 2200, school);
  const labels = statRow(calc, "magic_evasion").sources.filter((row) => row.type === "set_bonus").map((row) => row.sourceLabel);
  assert.ok(labels.includes("Forgotten Assassin Set"));
  assert.ok(!labels.includes("Lightning Strike Set"));
});

test("an evasion set without the exclusivity clause still stacks", () => {
  const calc = calculateBuild(equipBuild({ head: "fa_head", chest: "fa_chest", hands: "dm_hands", legs: "dm_legs" }), {});
  assert.equal(delta(calc, "magic_evasion"), 4700);
  assert.equal(delta(calc, "melee_evasion"), 2200);
});

test("Critical Damage set clauses keep only the strongest persistent value", () => {
  const calc = calculateBuild(equipBuild({
    head: "death_head",
    chest: "death_chest",
    hands: "imperial_hands",
    legs: "imperial_legs",
  }), {});
  assert.equal(delta(calc, "critical_damage_dealt_modifier"), 1500);
  const labels = statRow(calc, "critical_damage_dealt_modifier").sources
    .filter((row) => row.type === "set_bonus")
    .map((row) => row.sourceLabel);
  assert.deepEqual(labels, ["Imperial Seeker Set"]);
});

test("partial exclusivity suppresses Secret Order Critical Damage but retains Heavy Attack Damage", () => {
  const calc = calculateBuild(equipBuild({
    hands: "imperial_hands",
    legs: "imperial_legs",
    feet: "secret_feet",
    cloak: "secret_cloak",
  }), {});
  assert.equal(delta(calc, "critical_damage_dealt_modifier"), 1500);
  assert.equal(delta(calc, "double_damage_dealt_modifier"), 1400);
  assert.equal(statRow(calc, "double_damage_dealt_modifier").sources.find((row) => row.type === "set_bonus").sourceLabel, "Secret Order Set");
});

test("exact optimizer evaluation cannot prefer a suppressed set bonus", async () => {
  const candidatesBySlot = {
    hands: [
      { id: "ls_hands", selection: { id: "ls_hands" }, stats: {} },
      { id: "plain_hands", selection: { id: "plain_hands" }, stats: {} },
    ],
    legs: [
      { id: "ls_legs", selection: { id: "ls_legs" }, stats: {} },
      { id: "plain_legs", selection: { id: "plain_legs" }, stats: {} },
    ],
  };
  const evaluate = (selections) => {
    const equipped = { head: "fa_head", chest: "fa_chest" };
    for (const [slot, candidate] of Object.entries(selections)) equipped[slot] = candidate.id;
    const magic = delta(calculateBuild(equipBuild(equipped), {}), "magic_evasion");
    return { score: magic, stats: { magic_evasion: magic } };
  };
  const result = await optimizeFullBuild({ candidatesBySlot, evaluate, weights: { magic_evasion: 1 } });
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.best.selections).map(([slot, value]) => [slot, value.id])),
    { hands: "plain_hands", legs: "plain_legs" },
  );
  assert.equal(result.best.evaluation.score, 3200);
});
