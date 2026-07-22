// Cross-set exclusivity: Forgotten Assassin 2pc and Lightning Strike 2pc both
// state "Cannot be used in combination with other Evasion-increasing set
// effects" (Game.locres en+ko; docs/set-effect-localization-resolution-2026-07-13.md §6).
// SET_EXCLUSIVITY_GROUPS keeps only the highest-precedence member of a group;
// sets without the clause (Dawn Mist) stack freely. Values asserted RAW
// (evasion display modifier 0.1: display 220 -> raw 2200).

import assert from "node:assert/strict";
import test from "node:test";

import { calculateBuild, createInitialBuild, initCore } from "../../web/tl-core.js";
import { optimizeFullBuild } from "../../web/tl-full-build-optimizer.js";
import { SET_EXCLUSIVITY_GROUPS, SET_PASSIVE_RULES } from "../../web/tl-questlog-rules.js";

const FA = "set_aa_T2_leather_004"; // Forgotten Assassin — All Evasion +220 (raw 2200 per school)
const LS = "set_aa_t3_lether_003"; // Lightning Strike — per-school Evasion +150 (raw 1500)
const DM = "set_aa_T2_leather_003"; // Dawn Mist — evasion set WITHOUT the exclusivity clause

const armorItem = (id, equipmentType, setId, extraStats) => ({
  id,
  name: id,
  equipmentType,
  ...(setId ? { setId } : {}),
  ...(extraStats ? { itemStats: { extra: { 0: extraStats } } } : {}),
});

const items = [
  armorItem("fa_head", "head", FA),
  armorItem("fa_chest", "chest", FA),
  armorItem("ls_hands", "hands", LS),
  armorItem("ls_legs", "legs", LS),
  armorItem("dm_hands", "hands", DM),
  armorItem("dm_legs", "legs", DM),
  armorItem("plain_hands", "hands", null, { magic_evasion: 500 }),
  armorItem("plain_legs", "legs", null, { magic_evasion: 500 }),
];

await initCore({
  items,
  itemSets: [
    { id: FA, name: "Forgotten Assassin Set", itemSetBonus: [] },
    { id: LS, name: "Lightning Strike Set", itemSetBonus: [] },
    { id: DM, name: "Dawn Mist Set", itemSetBonus: [] },
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
const setBonusLabels = (calc, id) => (statRow(calc, id)?.sources ?? []).filter((s) => s.type === "set_bonus").map((s) => s.sourceLabel);

const baseline = calculateBuild(equipBuild({}), {});
const delta = (calc, id) => total(calc, id) - total(baseline, id);

test("group table names breakpoints that exist where expected and orders precedence", () => {
  assert.equal(SET_EXCLUSIVITY_GROUPS.evasion[FA].pieces, 2);
  assert.equal(SET_EXCLUSIVITY_GROUPS.evasion[LS].pieces, 2);
  assert.ok(SET_EXCLUSIVITY_GROUPS.evasion[FA].precedence > SET_EXCLUSIVITY_GROUPS.evasion[LS].precedence);
  assert.ok(SET_PASSIVE_RULES[FA]?.[2], "Forgotten Assassin 2pc rule must exist");
  assert.ok(SET_PASSIVE_RULES[LS]?.[2], "Lightning Strike 2pc rule must exist");
  // The DoT pair is documented as a numeric no-op: neither exclusive
  // breakpoint has a static rule today.
  for (const [setId, row] of Object.entries(SET_EXCLUSIVITY_GROUPS.damage_over_time)) {
    assert.equal(row.pieces, 2);
    assert.equal(SET_PASSIVE_RULES[setId]?.[row.pieces], undefined, `${setId} ${row.pieces}pc should stay combat-only`);
  }
});

test("each evasion set applies alone", () => {
  const fa = calculateBuild(equipBuild({ head: "fa_head", chest: "fa_chest" }), {});
  assert.equal(delta(fa, "magic_evasion"), 2200);
  const ls = calculateBuild(equipBuild({ hands: "ls_hands", legs: "ls_legs" }), {});
  assert.equal(delta(ls, "magic_evasion"), 1500);
  assert.equal(delta(ls, "melee_evasion"), 1500);
});

test("double-equipping both exclusive sets applies only Forgotten Assassin", () => {
  const calc = calculateBuild(equipBuild({ head: "fa_head", chest: "fa_chest", hands: "ls_hands", legs: "ls_legs" }), {});
  // 2200 (FA), NOT 3700 (FA + suppressed LS 1500)
  for (const school of ["magic_evasion", "melee_evasion", "range_evasion"]) {
    assert.equal(delta(calc, school), 2200, school);
  }
  const labels = setBonusLabels(calc, "magic_evasion");
  assert.ok(labels.includes("Forgotten Assassin Set"), `expected FA source, got ${JSON.stringify(labels)}`);
  assert.ok(!labels.includes("Lightning Strike Set"), "suppressed Lightning Strike must not contribute a source");
});

test("a clause-free evasion set still stacks with an exclusive one", () => {
  const calc = calculateBuild(equipBuild({ head: "fa_head", chest: "fa_chest", hands: "dm_hands", legs: "dm_legs" }), {});
  // FA all_evasion 2200 + Dawn Mist magic_evasion 2500 — no clause on Dawn Mist.
  assert.equal(delta(calc, "magic_evasion"), 4700);
  assert.equal(delta(calc, "melee_evasion"), 2200);
});

test("optimizer stops chasing the suppressed second evasion set", async () => {
  // Head+chest fixed on Forgotten Assassin. For hands+legs the optimizer picks
  // between completing Lightning Strike (suppressed: worth 0 evasion) and two
  // plain pieces worth raw 500 magic evasion each. A double-counting engine
  // would score LS+LS at 3700 and pick it; the correct engine scores it 2200
  // and must prefer the plain pieces at 3200.
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
  const evaluate = (build) => {
    const equipped = { head: "fa_head", chest: "fa_chest" };
    for (const [slot, candidate] of Object.entries(build)) equipped[slot] = candidate.id;
    const calc = calculateBuild(equipBuild(equipped), {});
    const magic = delta(calc, "magic_evasion");
    return { score: magic, stats: { magic_evasion: magic } };
  };
  const result = await optimizeFullBuild({ candidatesBySlot, evaluate, weights: { magic_evasion: 1 } });
  assert.deepEqual(
    Object.fromEntries(Object.entries(result.best.selections).map(([slot, value]) => [slot, value.id])),
    { hands: "plain_hands", legs: "plain_legs" },
  );
  assert.equal(result.best.evaluation.score, 3200);
});
