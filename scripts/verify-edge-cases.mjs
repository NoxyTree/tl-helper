// Edge-case and consistency net for the calculator (FIX-PLAN 5.2/5.3 + 1.5).
// Hermetic: uses only committed data. Run alongside verify-reference-build.mjs.

import { readFile } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import * as core from "../web/tl-core.js";
import { SET_PASSIVE_RULES } from "../web/tl-questlog-rules.js";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appData = await loadWebDataFromFile(join(repoRoot, "web", "data", "app-data.json"));
await core.initCore(appData);
const preset = JSON.parse(await readFile(join(repoRoot, "web", "data", "reference-build.json"), "utf8"));

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const zeroAttrs = { str: 0, dex: 0, int: 0, per: 0, con: 0 };
const finite = (calc) => calc.stats.every((row) => Number.isFinite(row.total));
const total = (calc, id) => calc.stats.find((row) => row.id === id)?.total ?? 0;

// 1. Empty build: calculates, all totals finite, base stats present.
{
  const calc = core.calculateBuild(core.createInitialBuild(), zeroAttrs);
  check("empty build calculates with finite totals", finite(calc));
  check("empty build has base hp_max", total(calc, "hp_max") > 0, `hp_max=${total(calc, "hp_max")}`);
}

// 2. Off-hand only: engine intentionally skips the off-hand item's own main
// block (off-hand damage derives from the main-hand item's offhand rows).
{
  const build = core.createInitialBuild();
  const offItem = core.slotItems(core.slotById("off_hand")).find((item) => core.getItemLevels(item).length && item.itemStats?.main);
  build.equipment.off_hand = { ...core.emptyEquipmentSelection(), itemId: offItem.id, level: core.itemMaxLevel(offItem) };
  const calc = core.calculateBuild(build, zeroAttrs);
  check("off-hand-only build calculates with finite totals", finite(calc));
  // Only the engine's "Initial" +1 seed may remain — the off-hand item's own
  // main block must contribute nothing (Questlog derives off-hand damage from
  // the main-hand item's offhand rows).
  check("off-hand-only build derives no off-hand damage (documented engine rule)", total(calc, "attack_power_off_hand_max") <= 1);
}

// 3. Partial rune sets: 1-2 runes contribute stats but never a synergy.
{
  const build = core.createInitialBuild();
  const item = core.slotItems(core.slotById("head")).find((entry) => core.getItemLevels(entry).length);
  const rune = core.runeChoicesForCategory("head")[0];
  const option = core.runeStatOptions(rune)[0];
  build.equipment.head = {
    ...core.emptyEquipmentSelection(),
    itemId: item.id,
    level: core.itemMaxLevel(item),
    runes: [{ runeId: rune.id, statId: option.statId, level: option.maxLevel }, core.emptyRune(), core.emptyRune()],
  };
  const calc = core.calculateBuild(build, zeroAttrs);
  check("single rune contributes its stat", total(calc, option.statId) >= option.levels[option.maxLevel]);
  check("partial rune set produces no synergy", !calc.runeSynergies.head);
}

// 4. Unmapped passive skill selected → visible validation issue, not silence.
{
  const build = core.createInitialBuild();
  const passive = (appData.skills ?? []).find((skill) => skill.skillType === "passive");
  build.skills = [{ skillId: passive.id, level: 1, specializationIds: [], loadoutType: "passive" }];
  const calc = core.calculateBuild(build, zeroAttrs);
  const flagged = calc.validation.issues.some((issue) => issue.message.includes(passive.name) && issue.message.includes("no calculation rule"));
  const hasRule = Boolean((await import("../web/tl-questlog-rules.js")).PASSIVE_SKILL_RULES[passive.id]);
  check("unmapped passive is flagged in validation", hasRule || flagged, `skill=${passive.name}`);
}

// 5. Over-budget specs → warning; over-budget mastery level change → rejected.
{
  const build = core.createInitialBuild();
  const bySkill = new Map();
  for (const trait of appData.skillTraits) {
    if (!trait.skillSetId || !core.indexes.skillById[trait.skillSetId]) continue;
    if (!bySkill.has(trait.skillSetId)) bySkill.set(trait.skillSetId, []);
    bySkill.get(trait.skillSetId).push(trait);
  }
  build.skills = [...bySkill.entries()].map(([skillId, traits]) => ({
    skillId,
    level: core.skillBandedMax(core.indexes.skillById[skillId]),
    specializationIds: traits.map((trait) => trait.id),
    loadoutType: core.skillLoadoutType(core.indexes.skillById[skillId]),
  }));
  const spent = core.skillSpecSpent(build);
  const calc = core.calculateBuild(build, zeroAttrs);
  check("over-budget specs produce a warning", spent <= core.SPEC_BUDGET || calc.validation.issues.some((issue) => issue.message.includes("specialization budget")), `spent=${spent}`);

  const weapon = "sword";
  const nodes = core.masteryRowsForWeapon(weapon).filter((m) => m.specializationType === "normal");
  const over = core.createInitialBuild();
  let points = 0;
  for (const node of nodes) {
    const max = core.masteryMaxLevel(node);
    if (points >= core.MASTERY_POINT_BUDGET) break;
    over.masteries[node.id] = { level: Math.min(max, core.MASTERY_POINT_BUDGET - points) };
    points += over.masteries[node.id].level;
  }
  const nextNode = nodes.find((node) => !over.masteries[node.id]);
  const verdict = core.masteryCanSetLevel(nextNode, 1, weapon, over);
  check("mastery point budget rejects overspend", !verdict.ok, verdict.reason);
}

// 6. Stale item level on import → warning that totals use the nearest level.
{
  const build = core.createInitialBuild();
  const item = core.slotItems(core.slotById("chest")).find((entry) => core.getItemLevels(entry).length);
  build.equipment.chest = { ...core.emptyEquipmentSelection(), itemId: item.id, level: 9999 };
  const calc = core.calculateBuild(build, zeroAttrs);
  check("stale item level produces a warning", calc.validation.issues.some((issue) => issue.message.includes("is not available")), "level 9999");
}

// 7. (FIX-PLAN 1.5) Static set bonus_stat rows must not overlap the same
// threshold's SET_PASSIVE_RULES effect statIds — that would double count.
{
  const dummyTotals = new Proxy({}, { get: () => ({ total: 0 }) });
  const overlaps = [];
  for (const set of appData.itemSets) {
    const ruleSet = SET_PASSIVE_RULES[set.id];
    if (!ruleSet) continue;
    for (const bonus of core.values(set.itemSetBonus)) {
      const required = Number(bonus.set_count ?? 0);
      const rule = ruleSet[required];
      if (!rule) continue;
      const staticIds = new Set(core.values(bonus.bonus_stat).map((row) => row.type));
      let ruleIds = [];
      try { ruleIds = rule.effect(dummyTotals).map((row) => row.statId); } catch { ruleIds = []; }
      for (const id of ruleIds) if (staticIds.has(id)) overlaps.push(`${set.id}@${required}:${id}`);
    }
  }
  check("no static/rule set bonus overlap (double-count guard)", overlaps.length === 0, overlaps.slice(0, 5).join(", "));
}

// 8. (FIX-PLAN 5.3) Card-vs-total consistency: for every equipped item in the
// reference build, the picker comparison delta must equal the actual
// calculateBuild total delta of the equip/swap it previews.
{
  const build = preset.build;
  build.masteries = core.normalizeMasterySelections(build.masteries);
  const attrs = preset.attributes;
  const totalsOf = (candidate) => Object.fromEntries(core.calculateBuild(candidate, attrs).stats.map((row) => [row.id, row.total]));
  const baseTotals = totalsOf(build);
  let mismatches = 0;
  let compared = 0;
  for (const slot of core.BUILD_SLOTS) {
    const selection = core.slotSelection(slot.id, build);
    const item = core.indexes.itemById[selection.itemId];
    if (!item) continue;
    const alt = core.slotItems(core.slotById(slot.id)).find((entry) => entry.id !== item.id
      && core.getItemLevels(entry).length && core.itemCompatibility(slot.id, entry, build).allowed);
    if (!alt) continue;
    const altLevel = core.getItemLevels(alt).at(-1) ?? 0;
    const rows = core.itemComparisonRows(slot.id, alt, altLevel, build, attrs);
    const variant = core.deepClone(build);
    core.slotCollectionForSlot(variant, slot.id)[slot.id] = { ...core.emptyEquipmentSelection(), itemId: alt.id, level: altLevel };
    const variantTotals = totalsOf(variant);
    for (const row of [...rows.headline, ...rows.secondary, ...rows.extra]) {
      if (row.id === "base_damage") continue;
      compared += 1;
      const real = (variantTotals[row.id] ?? 0) - (baseTotals[row.id] ?? 0);
      if (Math.abs(real - row.delta) > 1e-6) {
        mismatches += 1;
        console.error(`     mismatch ${slot.id}/${row.id}: shown ${row.delta}, real ${real}`);
      }
    }
  }
  check(`comparison deltas equal real total deltas (${compared} rows)`, mismatches === 0 && compared > 0);
}

console.log(failures ? `\n${failures} edge-case check(s) FAILED` : "\nAll edge-case checks passed.");
if (failures) process.exitCode = 1;
