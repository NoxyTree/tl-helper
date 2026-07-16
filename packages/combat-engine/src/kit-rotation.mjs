export const KIT_ROTATION_MODEL_VERSION = "kit-rotation-2026-07-16.v1";

/**
 * Weight a build's equipped active damage skills into a per-second base-damage
 * packet: each skill contributes (coefficient x weapon damage + flat add)
 * divided by its client-visible cooldown. This models sustained rotation
 * pressure, not burst windows, and deliberately ignores cast time, global
 * cooldown contention, resource limits, and weapon auto-attacks.
 */
export function modelKitRotationPacket({ skills, weaponDamage } = {}) {
  if (!Array.isArray(skills) || !skills.length) throw new TypeError("skills must be a non-empty array.");
  const weaponMinimum = Number(weaponDamage?.minimum);
  const weaponMaximum = Number(weaponDamage?.maximum);
  if (!(weaponMinimum >= 0) || !(weaponMaximum >= weaponMinimum)) {
    throw new TypeError("weaponDamage.minimum and weaponDamage.maximum must be non-negative with maximum >= minimum.");
  }
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
    const minimum = (coefficient * weaponMinimum + flatAdd) / cooldown;
    const maximum = (coefficient * weaponMaximum + flatAdd) / cooldown;
    minimumPerSecond += minimum;
    maximumPerSecond += maximum;
    if (skill.mappingClass === "derived") derivedCount += 1; else exactCount += 1;
    contributions.push(Object.freeze({
      skillSetId: skill.skillSetId ?? null,
      name: skill.name ?? null,
      mappingClass: skill.mappingClass ?? "exact",
      cooldown,
      perSecondShare: { minimum: minimum.toFixed(2), maximum: maximum.toFixed(2) },
    }));
  }
  return Object.freeze({
    schema: "tl-helper.kit-rotation-packet",
    schemaVersion: 1,
    modelVersion: KIT_ROTATION_MODEL_VERSION,
    status: "modeled",
    basis: "per_second",
    perSecond: Object.freeze({ minimum: minimumPerSecond.toFixed(2), maximum: maximumPerSecond.toFixed(2) }),
    skillCount: skills.length,
    exactCount,
    derivedCount,
    contributions: Object.freeze(contributions),
    assumptions: Object.freeze([
      "Every included skill is cast the moment its cooldown ends; cast time, global cooldown contention, and resource limits are not modeled.",
      "Weapon auto-attacks between skill casts are not included.",
      "Each skill contributes its primary attack-power component only; extra hits and conditional casts are undercounted, never overcounted.",
      "Derived-classified coefficients follow the verified naming transform but have not been individually reviewed.",
    ]),
  });
}
