export function resolveVisibleMatchupInputs({ sourceSnapshot, targetSnapshot, attackType, readStat }) {
  if (!["melee", "range", "magic"].includes(attackType)) throw new RangeError(`Unsupported attack type: ${attackType}`);
  if (typeof readStat !== "function") throw new TypeError("readStat is required.");
  const point = (snapshot, statId) => snapshot ? Math.round(Number(readStat(snapshot, statId)) * 0.1) : 0;
  return Object.freeze({
    hit: point(sourceSnapshot, `${attackType}_accuracy`),
    evasion: point(targetSnapshot, `${attackType}_evasion`),
    criticalHit: point(sourceSnapshot, `${attackType}_critical_attack`),
    endurance: point(targetSnapshot, `${attackType}_critical_defense`),
    heavyAttackChance: point(sourceSnapshot, `${attackType}_double_attack`),
    heavyAttackEvasion: point(targetSnapshot, `${attackType}_double_defense`),
    skillDamageBoost: point(sourceSnapshot, "skill_power_amplification"),
    skillDamageResistance: point(targetSnapshot, "skill_power_resistance"),
  });
}
