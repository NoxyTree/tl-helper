import assert from "node:assert/strict";
import test from "node:test";
import { resolveVisibleMatchupInputs } from "../../web/combat-lab-build-inputs.js";

test("matchup inputs use one visible stat and never add PvP projections", () => {
  const source = { stats: { magic_accuracy: 23048, magic_critical_attack: 67104, magic_double_attack: 31256, skill_power_amplification: 8770, pvp_magic_accuracy: 99999 } };
  const target = { stats: { magic_evasion: 4280, magic_critical_defense: 30600, magic_double_defense: 43400, skill_power_resistance: 9770, pvp_magic_critical_defense: 39230 } };
  const calls = [];
  const result = resolveVisibleMatchupInputs({ sourceSnapshot: source, targetSnapshot: target, attackType: "magic", readStat: (snapshot, id) => { calls.push(id); return snapshot.stats[id] ?? 0; } });
  assert.deepEqual(result, { hit:2305, evasion:428, criticalHit:6710, endurance:3060, heavyAttackChance:3126, heavyAttackEvasion:4340, skillDamageBoost:877, skillDamageResistance:977 });
  assert.ok(calls.every((id) => !id.startsWith("pvp_")));
});
