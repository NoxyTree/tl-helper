export const KIT_ROTATION_MODEL_VERSION = "kit-rotation-2026-07-17.v2";

/**
 * Weight a build's sustained damage cadence into a per-second base-damage
 * packet. Two streams compose it:
 *
 * - Equipped active damage skills: each contributes
 *   (coefficient x weapon damage + flat add) / effective cooldown, where
 *   effective cooldown = base cooldown / (1 + cooldownSpeed). The divisor
 *   form of Cooldown Speed is the live game's: published speed-to-reduction
 *   pairs (93% -> 48.187%, 33% -> 24.812%) match CS/(1+CS) exactly.
 * - Weapon auto-attacks: one swing of weapon damage every intervalSeconds.
 *
 * A kit with no modelable skills is still a valid cadence when an auto-attack
 * stream is supplied, so a skill-less build models as autos-only instead of
 * being unmodelable. This models sustained rotation pressure, not burst
 * windows, and deliberately ignores cast time, global cooldown contention,
 * and resource limits.
 */
export function modelKitRotationPacket({ skills = [], weaponDamage, autoAttack = null, cooldownSpeed = 0 } = {}) {
  if (!Array.isArray(skills)) throw new TypeError("skills must be an array.");
  if (!skills.length && autoAttack == null) throw new TypeError("A cadence needs at least one skill or an autoAttack stream.");
  const weaponMinimum = Number(weaponDamage?.minimum);
  const weaponMaximum = Number(weaponDamage?.maximum);
  if (!(weaponMinimum >= 0) || !(weaponMaximum >= weaponMinimum)) {
    throw new TypeError("weaponDamage.minimum and weaponDamage.maximum must be non-negative with maximum >= minimum.");
  }
  const speed = Number(cooldownSpeed);
  if (!Number.isFinite(speed) || speed < 0) throw new TypeError("cooldownSpeed must be a non-negative finite fraction (0.64 for 64%).");
  const contributions = [];
  let minimumPerSecond = 0;
  let maximumPerSecond = 0;
  let exactCount = 0;
  let derivedCount = 0;
  for (const skill of skills) {
    const coefficient = Number(skill.coefficient);
    const flatAdd = Number(skill.flatAdd) || 0;
    const cooldown = Number(skill.cooldown);
    if (!Number.isFinite(coefficient) || coefficient < 0) throw new TypeError(`${skill.skillSetId ?? "skill"} has an invalid coefficient.`);
    if (!(cooldown > 0)) throw new TypeError(`${skill.skillSetId ?? "skill"} has an invalid cooldown.`);
    const effectiveCooldown = cooldown / (1 + speed);
    const minimum = (coefficient * weaponMinimum + flatAdd) / effectiveCooldown;
    const maximum = (coefficient * weaponMaximum + flatAdd) / effectiveCooldown;
    minimumPerSecond += minimum;
    maximumPerSecond += maximum;
    if (skill.mappingClass === "derived") derivedCount += 1; else exactCount += 1;
    contributions.push(Object.freeze({
      skillSetId: skill.skillSetId ?? null,
      name: skill.name ?? null,
      mappingClass: skill.mappingClass ?? "exact",
      cooldown,
      effectiveCooldown: effectiveCooldown.toFixed(2),
      perSecondShare: { minimum: minimum.toFixed(2), maximum: maximum.toFixed(2) },
    }));
  }
  let autoAttackResult = null;
  if (autoAttack != null) {
    const interval = Number(autoAttack.intervalSeconds);
    if (!(interval > 0) || !Number.isFinite(interval)) throw new TypeError("autoAttack.intervalSeconds must be a positive finite number of seconds per swing.");
    const minimum = weaponMinimum / interval;
    const maximum = weaponMaximum / interval;
    minimumPerSecond += minimum;
    maximumPerSecond += maximum;
    autoAttackResult = Object.freeze({
      intervalSeconds: interval,
      perSecondShare: Object.freeze({ minimum: minimum.toFixed(2), maximum: maximum.toFixed(2) }),
    });
  }
  const assumptions = [
    "Every included skill is cast the moment its cooldown ends; cast time, global cooldown contention, and resource limits are not modeled.",
    autoAttackResult
      ? "Weapon auto-attacks land continuously at the build's effective attack speed, unaffected by skill casts."
      : "Weapon auto-attacks between skill casts are not included.",
    speed > 0
      ? "Skill cooldowns are divided by (1 + Cooldown Speed), the live game's verified divisor form."
      : "Base cooldowns are used; Cooldown Speed is not applied.",
    "Each skill contributes its primary attack-power component only; extra hits and conditional casts are undercounted, never overcounted.",
    "Skill specializations are not applied: every skill is modeled at its base form, which can understate or overstate a specialized skill's real numbers.",
    "Derived-classified coefficients follow the verified naming transform but have not been individually reviewed.",
  ];
  return Object.freeze({
    schema: "tl-helper.kit-rotation-packet",
    schemaVersion: 2,
    modelVersion: KIT_ROTATION_MODEL_VERSION,
    status: "modeled",
    basis: "per_second",
    perSecond: Object.freeze({ minimum: minimumPerSecond.toFixed(2), maximum: maximumPerSecond.toFixed(2) }),
    skillCount: skills.length,
    exactCount,
    derivedCount,
    cooldownSpeed: speed.toFixed(4),
    autoAttack: autoAttackResult,
    contributions: Object.freeze(contributions),
    assumptions: Object.freeze(assumptions),
  });
}
