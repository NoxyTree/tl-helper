const WEAPON_ATTACK_TYPES = Object.freeze({
  bow: "range",
  crossbow: "range",
  staff: "magic",
  wand: "magic",
  orb: "magic",
});

export function inferBuildAttackType(build, resolveItemType) {
  if (typeof resolveItemType !== "function") throw new TypeError("resolveItemType is required.");
  for (const slotId of ["main_hand", "off_hand"]) {
    const selection = build?.equipment?.[slotId];
    const weaponType = selection ? resolveItemType(selection.itemId) : "";
    if (weaponType) return Object.freeze({ attackType: WEAPON_ATTACK_TYPES[weaponType] ?? "melee", weaponType, slotId });
  }
  return null;
}

export function resolveVisibleMatchupInputs({ sourceSnapshot, targetSnapshot, attackType, readStat }) {
  if (!["melee", "range", "magic"].includes(attackType)) throw new RangeError(`Unsupported attack type: ${attackType}`);
  if (typeof readStat !== "function") throw new TypeError("readStat is required.");
  const point = (snapshot, statId) => snapshot ? Number((Number(readStat(snapshot, statId)) * 0.1).toFixed(1)) : 0;
  return Object.freeze({
    hit: point(sourceSnapshot, `pvp_${attackType}_accuracy`),
    evasion: point(targetSnapshot, `pvp_${attackType}_evasion`),
    criticalHit: point(sourceSnapshot, `pvp_${attackType}_critical_attack`),
    endurance: point(targetSnapshot, `pvp_${attackType}_critical_defense`),
    heavyAttackChance: point(sourceSnapshot, `pvp_${attackType}_double_attack`),
    heavyAttackEvasion: point(targetSnapshot, `pvp_${attackType}_double_defense`),
    skillDamageBoost: point(sourceSnapshot, "skill_power_amplification"),
    skillDamageResistance: point(targetSnapshot, "skill_power_resistance"),
  });
}
