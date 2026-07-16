import assert from "node:assert/strict";
import test from "node:test";

import { modelKitRotationPacket } from "../../packages/combat-engine/src/index.mjs";

const SKILLS = [
  { skillSetId: "SkillSet_A", name: "Alpha", coefficient: "3.0", flatAdd: "60", cooldown: 9, mappingClass: "exact" },
  { skillSetId: "SkillSet_B", name: "Beta", coefficient: "1.5", flatAdd: "0", cooldown: 24, mappingClass: "derived" },
];

test("rotation packet sums per-second contributions across the kit", () => {
  const packet = modelKitRotationPacket({ skills: SKILLS, weaponDamage: { minimum: 900, maximum: 1200 } });
  // Alpha: (3*900+60)/9 = 306.67, (3*1200+60)/9 = 406.67
  // Beta:  (1.5*900)/24 = 56.25,  (1.5*1200)/24 = 75
  assert.equal(packet.perSecond.minimum, "362.92");
  assert.equal(packet.perSecond.maximum, "481.67");
  assert.equal(packet.skillCount, 2);
  assert.equal(packet.exactCount, 1);
  assert.equal(packet.derivedCount, 1);
  assert.equal(packet.basis, "per_second");
  assert.equal(packet.status, "modeled");
  assert.equal(packet.contributions[0].perSecondShare.maximum, "406.67");
  assert.ok(Object.isFrozen(packet) && Object.isFrozen(packet.contributions));
});

test("a shorter cooldown increases pressure with identical coefficients", () => {
  const slow = modelKitRotationPacket({ skills: [{ ...SKILLS[0], cooldown: 18 }], weaponDamage: { minimum: 1000, maximum: 1000 } });
  const fast = modelKitRotationPacket({ skills: [{ ...SKILLS[0], cooldown: 9 }], weaponDamage: { minimum: 1000, maximum: 1000 } });
  assert.equal(Number(fast.perSecond.maximum), Number(slow.perSecond.maximum) * 2);
});

test("invalid kits are rejected outright", () => {
  assert.throws(() => modelKitRotationPacket({ skills: [], weaponDamage: { minimum: 1, maximum: 2 } }), TypeError);
  assert.throws(() => modelKitRotationPacket({ skills: [{ coefficient: "1", cooldown: 0 }], weaponDamage: { minimum: 1, maximum: 2 } }), TypeError);
  assert.throws(() => modelKitRotationPacket({ skills: [{ coefficient: "-1", cooldown: 5 }], weaponDamage: { minimum: 1, maximum: 2 } }), TypeError);
  assert.throws(() => modelKitRotationPacket({ skills: SKILLS, weaponDamage: { minimum: 5, maximum: 2 } }), TypeError);
});

test("assumptions disclose the cadence and undercounting limits", () => {
  const packet = modelKitRotationPacket({ skills: SKILLS, weaponDamage: { minimum: 100, maximum: 100 } });
  assert.ok(packet.assumptions.some((text) => text.includes("cooldown ends")));
  assert.ok(packet.assumptions.some((text) => text.includes("undercounted, never overcounted")));
});
