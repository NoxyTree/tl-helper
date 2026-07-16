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

export function selectAbilityWeaponHand(build, requiredWeaponType, resolveItemType) {
  if (typeof resolveItemType !== "function") throw new TypeError("resolveItemType is required.");
  const required = String(requiredWeaponType ?? "").trim().toLowerCase();
  if (!required) return null;
  for (const [hand, slotId] of [["main", "main_hand"], ["off", "off_hand"]]) {
    const itemId = build?.equipment?.[slotId]?.itemId;
    if (String(resolveItemType(itemId) ?? "").trim().toLowerCase() === required) {
      return Object.freeze({ hand, slotId, weaponType: required });
    }
  }
  return null;
}

export function isLegalBuildSnapshot(snapshot) {
  return snapshot?.resolved?.status?.state === "legal";
}

export function resolveVisibleMatchupInputs({ sourceSnapshot, targetSnapshot, attackType, readStat }) {
  if (!["melee", "range", "magic"].includes(attackType)) throw new RangeError(`Unsupported attack type: ${attackType}`);
  if (typeof readStat !== "function") throw new TypeError("readStat is required.");
  // The contest models treat every rating as a non-negative magnitude and reject
  // negatives outright, so a snapshot stat that resolves below zero (e.g. a
  // debuffed Heavy Attack rating) is floored to a zero contribution here rather
  // than crashing the matchup.
  const point = (snapshot, statId) => snapshot ? Math.max(0, Number((Number(readStat(snapshot, statId)) * 0.1).toFixed(1))) : 0;
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
