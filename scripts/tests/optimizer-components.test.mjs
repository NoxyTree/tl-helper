import assert from "node:assert/strict";
import test from "node:test";
import { generateArtifactCandidates, generateRuneCandidates } from "../../web/tl-optimizer-components.js";

const rune = (id, type, stat, value = 10, maxLevel = 1, grade = 31) => ({
  id, name: id, runeType: type, equipmentCategory: "weapon", grade,
  itemStats: { random_stat_group_1: [{ stat_id: stat, max_level: maxLevel, levels: Array.from({ length: maxLevel + 1 }, (_, level) => value * level / maxLevel) }] },
});
const synergy = { id: "aaa", name: "Triple Attack", equipmentCategory: "weapon", combination: ["attack", "attack", "attack"], stats: { power: 50 } };

test("rune candidates permit three duplicate normal runes and retain exact synergy", () => {
  const [best] = generateRuneCandidates({ category: "weapon", runes: [rune("a", "attack", "power")], runeSynergies: [synergy], scoreStat: (_, value) => value });
  assert.deepEqual(best.selection.map((row) => row.runeId), ["a", "a", "a"]);
  assert.equal(best.synergy.id, "aaa");
});

test("rune candidates cap Chaos at one and respect availability", () => {
  const runes = [rune("a", "attack", "power"), rune("c", "chaos", "power", 100)];
  const none = generateRuneCandidates({ category: "weapon", runes, chaos: { mode: "none" }, scoreStat: (_, value) => value });
  assert.ok(none.every((candidate) => candidate.selection.every((row) => row.runeId !== "c")));
  const unowned = generateRuneCandidates({ category: "weapon", runes, chaos: { mode: "owned", ownedIds: [] }, scoreStat: (_, value) => value });
  assert.ok(unowned.every((candidate) => candidate.selection.every((row) => row.runeId !== "c")));
  const owned = generateRuneCandidates({ category: "weapon", runes, chaos: { mode: "owned", ownedIds: ["c"] }, scoreStat: (_, value) => value });
  assert.ok(owned.some((candidate) => candidate.selection.some((row) => row.runeId === "c")));
  assert.ok(owned.every((candidate) => candidate.selection.filter((row) => row.runeId === "c").length <= 1));
});

test("bounded rune candidates retain attribute synergies beside the direct-score winner", () => {
  const runes = [rune("a", "attack", "power", 10), rune("d", "defense", "guard", 1), rune("s", "assist", "support", 1)];
  const synergies = [
    { id: "damage", name: "Damage", equipmentCategory: "weapon", combination: ["attack", "attack", "attack"], stats: { power: 50 } },
    { id: "strength", name: "Strength", equipmentCategory: "weapon", combination: ["defense", "assist", "attack"], stats: { str: 3 } },
  ];
  const rows = generateRuneCandidates({ category: "weapon", runes, runeSynergies: synergies, scoreStat: (id, value) => id === "power" ? value : 0, limit: 2 });
  assert.deepEqual(rows.map((row) => row.synergy?.id), ["damage", "strength"]);
});

test("rune candidates exclude non-combat metadata stats when requested", () => {
  const runes = [rune("combat", "attack", "hit"), rune("craft", "assist", "adjust_cooking_exp")];
  const rows = generateRuneCandidates({ category: "weapon", runes, allowStat: (id) => !id.startsWith("adjust_") });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((candidate) => candidate.selection.every((row) => row.runeId !== "craft")));
});

test("equal-score rune filler prefers the highest available rune tier", () => {
  const rare = rune("rare", "attack", "front_all_critical_attack", 36, 60, 31);
  const epic = rune("epic", "attack", "melee_accuracy", 30, 120, 42);
  const [best] = generateRuneCandidates({ category: "weapon", runes: [rare, epic] });
  assert.deepEqual(best.selection.map((row) => row.level), [120, 120, 120]);
  assert.deepEqual(best.selection.map((row) => row.runeId), ["epic", "epic", "epic"]);
});

test("a lower-tier rune still wins when its stat scores better", () => {
  const rare = rune("rare", "attack", "wanted", 36, 60, 31);
  const epic = rune("epic", "attack", "filler", 300, 120, 42);
  const [best] = generateRuneCandidates({ category: "weapon", runes: [rare, epic], scoreStat: (id, value) => id === "wanted" ? value : 0 });
  assert.deepEqual(best.selection.map((row) => row.level), [60, 60, 60]);
  assert.deepEqual(best.selection.map((row) => row.runeId), ["rare", "rare", "rare"]);
});

const artifact = (set, type, index) => ({ id: `${set}-${type}`, name: `${set} ${type}`, equipmentType: type, setId: set, itemStats: { artifact: { 0: { power: index } } } });
const types = ["talistone1", "talistone2", "talistone3", "talistone4", "gemstone1", "gemstone2"];

test("artifact generator retains complete sets and every active threshold", () => {
  const items = types.flatMap((type, index) => [artifact("alpha", type, index + 1), artifact("beta", type, 20)]);
  const sets = [{ id: "alpha", name: "Alpha", memberItemIds: types.map((type) => `alpha-${type}`), bonuses: [{ set_count: 2 }, { set_count: 4 }, { set_count: 6, bonus_passive: [{ name: "Passive" }] }] }];
  const candidates = generateArtifactCandidates({ items, artifactSets: sets, scoreItem: (item) => item.setId === "beta" ? 100 : 0, perSlot: 1, beamWidth: 1, limit: 10 });
  const complete = candidates.find((candidate) => candidate.key === "set:alpha");
  assert.ok(complete);
  assert.deepEqual(complete.setState[0].activeThresholds.map((row) => row.set_count), [2, 4, 6]);
  assert.equal(Object.keys(complete.selections).length, 6);
});

test("bounded generators are deterministic", () => {
  const args = { category: "weapon", runes: [rune("b", "defense", "b"), rune("a", "attack", "a")], limit: 5 };
  assert.deepEqual(generateRuneCandidates(args), generateRuneCandidates(args));
  const items = types.map((type, index) => artifact("alpha", type, index));
  assert.deepEqual(generateArtifactCandidates({ items }), generateArtifactCandidates({ items }));
});

test("complete artifact sets survive a tight result limit", () => {
  const items = types.flatMap((type, index) => [artifact("alpha", type, index), artifact("mixed", type, 99)]);
  const sets = [{ id: "alpha", name: "Alpha", memberItemIds: types.map((type) => `alpha-${type}`), bonuses: [{ set_count: 6 }] }];
  const candidates = generateArtifactCandidates({ items, artifactSets: sets, scoreItem: (item) => item.setId === "mixed" ? 100 : 0, limit: 1 });
  assert.deepEqual(candidates.map((row) => row.key), ["set:alpha"]);
});
