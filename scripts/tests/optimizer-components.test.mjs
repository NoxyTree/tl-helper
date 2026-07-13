import assert from "node:assert/strict";
import test from "node:test";
import { generateArtifactCandidates, generateRuneCandidates } from "../../web/tl-optimizer-components.js";

const rune = (id, type, stat, value = 10) => ({ id, name: id, runeType: type, equipmentCategory: "weapon", itemStats: { random_stat_group_1: [{ stat_id: stat, max_level: 1, levels: [0, value] }] } });
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

test("rune candidates exclude non-combat metadata stats when requested", () => {
  const runes = [rune("combat", "attack", "hit"), rune("craft", "assist", "adjust_cooking_exp")];
  const rows = generateRuneCandidates({ category: "weapon", runes, allowStat: (id) => !id.startsWith("adjust_") });
  assert.ok(rows.length > 0);
  assert.ok(rows.every((candidate) => candidate.selection.every((row) => row.runeId !== "craft")));
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
