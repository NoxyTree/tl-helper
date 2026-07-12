import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStatTaxonomy, resolveStatTaxonomy } from "../lib/stat-taxonomy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("double attack uses the player-facing Heavy Attack taxonomy", () => {
  assert.deepEqual(resolveStatTaxonomy("all_double_attack"), {
    rawStatId: "all_double_attack",
    normalizedRawId: "all_double_attack",
    canonicalStatId: "heavy_attack_chance",
    displayName: "Heavy Attack Chance",
    unit: "points",
    scale: 0.1,
    attackScope: "all",
    context: "base",
    direction: null,
    condition: null,
    relationship: "chance",
    source: "questlog-derived-pattern",
    labelSource: "questlog-derived-pattern",
    labelStatus: "verified",
  });
});

test("double defense is Heavy Attack Evasion and preserves context", () => {
  const value = resolveStatTaxonomy("pvp_melee_double_defense");
  assert.equal(value.canonicalStatId, "heavy_attack_evasion");
  assert.equal(value.displayName, "PvP Melee Heavy Attack Evasion");
  assert.equal(value.context, "pvp");
  assert.equal(value.attackScope, "melee");
  assert.equal(value.relationship, "defense");
});

test("Heavy Attack Damage remains separate from Heavy Attack Chance", () => {
  const damage = resolveStatTaxonomy("double_damage_dealt_modifier");
  const chance = resolveStatTaxonomy("all_double_attack");
  assert.equal(damage.canonicalStatId, "double_damage_dealt_modifier");
  assert.equal(damage.displayName, "Heavy Attack Damage");
  assert.equal(damage.unit, "percent");
  assert.equal(damage.scale, 0.01);
  assert.equal(damage.relationship, "damage_modifier");
  assert.notEqual(damage.canonicalStatId, chance.canonicalStatId);
});

test("legacy raw aliases retain their original IDs", () => {
  const value = resolveStatTaxonomy("melee_heavy_attack");
  assert.equal(value.rawStatId, "melee_heavy_attack");
  assert.equal(value.normalizedRawId, "melee_double_attack");
  assert.equal(value.canonicalStatId, "heavy_attack_chance");
});

test("condition-prefixed Heavy Attack fields remain queryable but provisional", () => {
  const value = resolveStatTaxonomy("weaken_double_attack");
  assert.equal(value.canonicalStatId, "heavy_attack_chance");
  assert.equal(value.context, "conditional");
  assert.equal(value.condition, "weaken");
  assert.equal(value.labelStatus, "provisional");
});

test("all projected stat IDs receive taxonomy and uncertain labels are flagged", async () => {
  const labelsPath = path.join(root, "web", "data", "projections", "labels.json");
  const projection = JSON.parse(await readFile(labelsPath, "utf8"));
  const labels = projection.data.statLabels;
  const taxonomy = buildStatTaxonomy(Object.keys(labels), labels);
  assert.equal(Object.keys(taxonomy).length, Object.keys(labels).length);
  assert.deepEqual(Object.values(taxonomy).filter((entry) => !entry.canonicalStatId || !entry.displayName), []);
  assert.deepEqual(Object.values(taxonomy).filter((entry) => entry.labelStatus === "unresolved"), []);
});

test("unknown IDs are humanized but explicitly unresolved", () => {
  const value = resolveStatTaxonomy("future_mystery_stat");
  assert.equal(value.displayName, "Future Mystery Stat");
  assert.equal(value.labelSource, "generated-fallback");
  assert.equal(value.labelStatus, "unresolved");
});

test("legacy enemy-family IDs use player-facing species names", () => {
  assert.equal(resolveStatTaxonomy("animal_damage_reduction").displayName, "Wildkin Damage Reduction");
  assert.equal(resolveStatTaxonomy("bonus_animal_attack_power").displayName, "Bonus Wildkin Attack Power");
  assert.equal(resolveStatTaxonomy("creation_damage_reduction").displayName, "Construct Damage Reduction");
  assert.equal(resolveStatTaxonomy("bonus_creation_attack_power").displayName, "Bonus Construct Attack Power");
  assert.equal(resolveStatTaxonomy("grankus_damage_reduction").displayName, "Humanoid Damage Reduction");
  assert.equal(resolveStatTaxonomy("bonus_grankus_attack_power").displayName, "Bonus Humanoid Attack Power");
});
