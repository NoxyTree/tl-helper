import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { buildKitPacketsArtifact } from "../build-kit-packets.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const BUILD = "24118850";
const AP = "EFormulaType::kAmountFromAttackPower";

const apLevel = (skillLevel, mul, add, tooltip1, tooltip2 = add) => ({
  skill_level: skillLevel,
  formula_type: AP,
  min: 0,
  max: 0,
  add,
  mul,
  mul2: 0,
  mul3: 0,
  tooltip1,
  tooltip2,
});

const projectionLevel = (level, cooldown, damageParameter, optionName = "Damage ▲") => ({
  level,
  cooldown,
  manaCost: 100,
  description: "",
  effect: "",
  tooltipOptions: damageParameter === null ? [] : [{ name: optionName, parameter: damageParameter }],
});

function artifactFor({ mappings, skills, skillTraits = [] }) {
  return buildKitPacketsArtifact({
    skillsProjection: { gameBuild: BUILD, data: { skills } },
    formulaMap: { gameBuild: BUILD, provenance: { source: "fixture" }, skills: mappings },
    skillTraits,
  });
}

const activeSkill = (id, levels, overrides = {}) => ({
  id,
  name: overrides.name ?? "Fixture Skill",
  mainCategory: "sword2h",
  skillType: "active",
  maxLevel: levels.length,
  levels,
  ...overrides,
});

const mappingFor = (skillSetId, formulaRows, classification = "exact") => ({
  skillSetId,
  name: "Fixture Skill",
  classification,
  formulaRows,
});

test("legacy tier keeps the largest self-consistent attack-power row unchanged", () => {
  const artifact = artifactFor({
    mappings: [mappingFor("SkillSet_Fixture", [
      { formulaRowId: "Fixture_DD", mappingClass: "derived", levels: [apLevel(1, 20000, 10, 200)] },
      { formulaRowId: "Fixture_DD_Big", mappingClass: "derived", levels: [apLevel(1, 30000, 15, 300)] },
    ])],
    skills: [activeSkill("SkillSet_Fixture", [projectionLevel(1, 9, "200% + 10")])],
  });
  const packet = artifact.skills.SkillSet_Fixture;
  assert.equal(packet.formulaRowId, "Fixture_DD_Big");
  assert.equal(packet.componentSelection, "primary_largest_coefficient");
  assert.equal(packet.levels["1"].coefficient, "3.0000");
  assert.equal(packet.levels["1"].flatAdd, "15");
  assert.equal(packet.levels["1"].cooldown, 9);
  assert.equal(packet.anchor, undefined);
  assert.equal(artifact.summary.skills, 1);
});

test("a PvE-flavored largest row falls through to the tooltip-anchored base row", () => {
  // The PvE row is bigger but its tooltip fields encode a monster-bonus
  // percent, not mul/100 — the shipped failure mode for 21 skills.
  const artifact = artifactFor({
    mappings: [mappingFor("SkillSet_Fixture", [
      { formulaRowId: "Fixture_DD", mappingClass: "derived", levels: [apLevel(1, 25500, 37, 255), apLevel(2, 25500, 40, 255)] },
      { formulaRowId: "Fixture_DD_PVE", mappingClass: "derived", levels: [apLevel(1, 27285, 40, 7, 2), apLevel(2, 28815, 45, 13, 2)] },
    ])],
    skills: [activeSkill("SkillSet_Fixture", [
      projectionLevel(1, 24, "255% + 37"),
      projectionLevel(2, 24, "255% + 40"),
    ])],
  });
  const packet = artifact.skills.SkillSet_Fixture;
  assert.equal(packet.formulaRowId, "Fixture_DD");
  assert.equal(packet.componentSelection, "tooltip_anchored");
  assert.equal(packet.levels["1"].coefficient, "2.5500");
  assert.equal(packet.levels["2"].flatAdd, "40");
  assert.equal(packet.attackPowerComponentCount, 2);
  assert.deepEqual(packet.anchor.unconfirmedLevels, []);
});

test("anchored recovery never elects a larger row the tooltip does not state", () => {
  // Both rows are self-consistent, but only the smaller one matches the
  // client-visible damage line; the trait/conditional variant must lose even
  // though its coefficient is larger.
  const artifact = artifactFor({
    mappings: [mappingFor("SkillSet_Fixture", [
      { formulaRowId: "Fixture_DD", mappingClass: "derived", levels: [apLevel(1, 25500, 37, 255)] },
      { formulaRowId: "Fixture_Trait_DD", mappingClass: "derived", levels: [apLevel(1, 49800, 73, 498)] },
      { formulaRowId: "Fixture_DD_PVE", mappingClass: "derived", levels: [apLevel(1, 66200, 194, 100, 2)] },
    ])],
    skills: [activeSkill("SkillSet_Fixture", [projectionLevel(1, 24, "255% + 37")])],
  });
  const packet = artifact.skills.SkillSet_Fixture;
  assert.equal(packet.formulaRowId, "Fixture_DD");
  assert.equal(packet.levels["1"].coefficient, "2.5500");
});

test("levels the tooltip does not confirm are omitted, within display rounding", () => {
  // The Strafing shape: ±1 point is client display rounding and is kept; a
  // real divergence (148 vs 174) drops that level rather than overcounting.
  const artifact = artifactFor({
    mappings: [mappingFor("SkillSet_Fixture", [
      { formulaRowId: "Fixture_DD", mappingClass: "derived", levels: [
        apLevel(1, 9000, 15, 90),
        apLevel(2, 13900, 49, 139),
        apLevel(3, 14800, 55, 174),
      ] },
      { formulaRowId: "Fixture_DD_PVE", mappingClass: "derived", levels: [apLevel(1, 20000, 20, 10, 2)] },
    ])],
    skills: [activeSkill("SkillSet_Fixture", [
      projectionLevel(1, 15, "90% + 15"),
      projectionLevel(2, 15, "138% + 49"),
      projectionLevel(3, 15, "174% + 55"),
    ])],
  });
  const packet = artifact.skills.SkillSet_Fixture;
  assert.equal(packet.formulaRowId, "Fixture_DD");
  assert.deepEqual(Object.keys(packet.levels), ["1", "2"]);
  assert.equal(packet.levels["2"].coefficient, "1.3900");
  assert.deepEqual(packet.anchor.unconfirmedLevels, [3]);
  assert.equal(packet.anchor.confirmedLevels, 2);
});

test("skills whose tooltip states no damage line are excluded, never modeled", () => {
  // Heals and buff skills can carry attack-power-typed rows (heal amounts,
  // conditional riders); counting them as damage would overstate a PvP race.
  const artifact = artifactFor({
    mappings: [mappingFor("SkillSet_Heal", [
      { formulaRowId: "Fixture_Heal", mappingClass: "derived", levels: [apLevel(1, 16500, 200, 5, 2)] },
    ])],
    skills: [activeSkill("SkillSet_Heal", [projectionLevel(1, 12, "165% + 200", "Health Recovery ▲")])],
  });
  assert.equal(Object.keys(artifact.skills).length, 0);
  assert.deepEqual(artifact.excluded, [{ skillSetId: "SkillSet_Heal", name: "Fixture Skill", reason: "no_tooltip_damage_line" }]);
});

test("an all-zero placeholder row is never elected as a modeled hit", () => {
  // Touch of Despair's direct-hit row carries mul=0/add=0 — its real payload
  // is a curse DoT. A 0-coefficient packet would falsely report the skill as
  // modeled, so the placeholder must not qualify as an attack-power component.
  const artifact = artifactFor({
    mappings: [mappingFor("SkillSet_Fixture", [
      { formulaRowId: "Fixture_DD", mappingClass: "derived", levels: [apLevel(1, 0, 0, 0)] },
    ])],
    skills: [activeSkill("SkillSet_Fixture", [projectionLevel(1, 6, "18% + 6", "Curse Damage over time ▲")])],
  });
  assert.equal(Object.keys(artifact.skills).length, 0);
  assert.equal(artifact.excluded[0].reason, "no_attack_power_component");
});

test("a stated damage line without any client-visible cooldown stays excluded", () => {
  const artifact = artifactFor({
    mappings: [mappingFor("SkillSet_Fixture", [
      { formulaRowId: "Fixture_DD", mappingClass: "derived", levels: [apLevel(1, 20000, 4, 2, 2)] },
    ])],
    skills: [activeSkill("SkillSet_Fixture", [projectionLevel(1, null, "200% + 4")])],
  });
  assert.equal(Object.keys(artifact.skills).length, 0);
  assert.equal(artifact.excluded[0].reason, "no_level_with_cooldown");
});

test("unresolved mappings, missing projections, and passives are handled as before", () => {
  const artifact = artifactFor({
    mappings: [
      { skillSetId: "SkillSet_Unresolved", name: "Unresolved", classification: "unresolved", formulaRows: [] },
      { skillSetId: "SkillSet_Missing", name: "Missing", classification: "exact", formulaRows: [] },
      { skillSetId: "SkillSet_Passive", name: "Passive", classification: "exact", formulaRows: [] },
    ],
    skills: [
      activeSkill("SkillSet_Unresolved", [projectionLevel(1, 9, "100% + 1")]),
      activeSkill("SkillSet_Passive", [projectionLevel(1, 9, "100% + 1")], { skillType: "passive" }),
    ],
  });
  assert.equal(Object.keys(artifact.skills).length, 0);
  assert.deepEqual(artifact.excluded.map((row) => row.reason), ["unresolved_mapping", "not_in_skills_projection"]);
});

// --- Specialization trait overrides -----------------------------------------

const traitLevel = (level, description, effect = "Changes to Fixture Form") => ({ level, description, effect, tooltipOptions: [] });
const traitFor = (id, skillSetId, levels) => ({ id, skillSetId, name: "Fixture Trait", points: 7, levels });
// A minimal packet-bearing skill for the trait vectors.
const traitHostMapping = () => mappingFor("SkillSet_Fixture", [
  { formulaRowId: "Fixture_DD", mappingClass: "derived", levels: [apLevel(1, 20000, 10, 200)] },
]);
const traitHostSkill = (overrides = {}) => activeSkill("SkillSet_Fixture", [projectionLevel(1, 9, "200% + 10")], overrides);

test("trait overrides publish the Focused Fire Bombs numbers at the trait-stated levels", () => {
  const artifact = artifactFor({
    mappings: [traitHostMapping()],
    skills: [traitHostSkill()],
    skillTraits: [traitFor("SkillSet_Fixture_trait_1", "SkillSet_Fixture", [
      traitLevel(1, "A Fire skill that deals 420% of Base Damage + 77 damage. Burning lasts for 12s, and deals 1% of Base Damage + 1 damage per stack."),
      traitLevel(15, "A Fire skill that deals 595% of Base Damage + 602 damage. Burning lasts for 12s, and deals 3.4% of Base Damage + 15 damage per stack."),
    ])],
  });
  const override = artifact.skills.SkillSet_Fixture.traitOverrides.SkillSet_Fixture_trait_1;
  assert.equal(override.mappingClass, "derived");
  assert.equal(override.variantConfirmed, null);
  // Sparse trait levels are kept as stated; the first damage statement is the
  // primary hit, never the Burning rider later in the same sentence.
  assert.deepEqual(Object.keys(override.levels), ["1", "15"]);
  assert.equal(override.levels["1"].coefficient, "4.2000");
  assert.equal(override.levels["1"].flatAdd, "77");
  assert.equal(override.levels["15"].coefficient, "5.9500");
  assert.equal(override.levels["15"].flatAdd, "602");
  assert.equal(override.levels["1"].cooldown, undefined);
  assert.equal(artifact.summary.traits.overrides, 1);
  assert.deepEqual(artifact.excludedTraits, []);
  assert.equal(artifact.skills.SkillSet_Fixture.unverifiedDamageTraits, undefined);
});

test("charge ranges resolve to the uncharged minimum and reversed statements parse", () => {
  const artifact = artifactFor({
    mappings: [traitHostMapping()],
    skills: [traitHostSkill()],
    skillTraits: [
      traitFor("SkillSet_Fixture_trait_1", "SkillSet_Fixture", [
        traitLevel(1, "Fires an arrow, dealing 500% of Base Damage + 53 damage to 800% of Base Damage + 84 damage to all targets in the path.", "Activates the skill, Fixture Bombardment."),
      ]),
      traitFor("SkillSet_Fixture_trait_2", "SkillSet_Fixture", [
        traitLevel(1, "Uses Fixture Blade in the designated direction, dealing 730% + 51 of Base Damage to all enemies.", "Change to Fixture Blade"),
      ]),
    ],
  });
  const overrides = artifact.skills.SkillSet_Fixture.traitOverrides;
  assert.equal(overrides.SkillSet_Fixture_trait_1.levels["1"].coefficient, "5.0000");
  assert.equal(overrides.SkillSet_Fixture_trait_1.levels["1"].flatAdd, "53");
  assert.equal(overrides.SkillSet_Fixture_trait_2.levels["1"].coefficient, "7.3000");
  assert.equal(overrides.SkillSet_Fixture_trait_2.levels["1"].flatAdd, "51");
});

test("rider and conditional damage text never overrides the primary hit", () => {
  const artifact = artifactFor({
    mappings: [traitHostMapping()],
    skills: [traitHostSkill()],
    skillTraits: [
      // A parseable magnitude on a non-replacement effect is a rider.
      traitFor("SkillSet_Fixture_trait_1", "SkillSet_Fixture", [
        traitLevel(1, "Deals damage equal to 260% of Base Damage to the target.", "Additional damage"),
      ]),
      // A replacement form whose only stated damage is an "additional" rider.
      traitFor("SkillSet_Fixture_trait_2", "SkillSet_Fixture", [
        traitLevel(1, "While active, on hit with a Longbow skill, deals additional 36% of Base Damage + 8.", "Change to Fixture Stance"),
      ]),
      // A replacement form that converts the skill into a heal.
      traitFor("SkillSet_Fixture_trait_3", "SkillSet_Fixture", [
        traitLevel(1, "Creates a ripple, restoring party members' Health by 250% of Base Damage + 360 Health.", "Changes to Fixture Wave"),
      ]),
    ],
  });
  assert.equal(artifact.skills.SkillSet_Fixture.traitOverrides, undefined);
  assert.deepEqual(artifact.excludedTraits.map((row) => row.reason),
    ["not_main_hit_replacement", "unparsed_damage_text", "unparsed_damage_text"]);
  // All three are damage-relevant on a modeled skill, so the consumer must be
  // told to keep the skill at base form and disclose it.
  assert.deepEqual(artifact.skills.SkillSet_Fixture.unverifiedDamageTraits,
    ["SkillSet_Fixture_trait_1", "SkillSet_Fixture_trait_2", "SkillSet_Fixture_trait_3"]);
});

test("non-monotonic trait levels are inconsistent and never published", () => {
  const artifact = artifactFor({
    mappings: [traitHostMapping()],
    skills: [traitHostSkill()],
    skillTraits: [traitFor("SkillSet_Fixture_trait_1", "SkillSet_Fixture", [
      traitLevel(1, "Deals 400% of Base Damage + 50 damage."),
      traitLevel(15, "Deals 300% of Base Damage + 40 damage."),
    ])],
  });
  assert.equal(artifact.skills.SkillSet_Fixture.traitOverrides, undefined);
  assert.deepEqual(artifact.excludedTraits.map((row) => row.reason), ["inconsistent_levels"]);
  assert.deepEqual(artifact.skills.SkillSet_Fixture.unverifiedDamageTraits, ["SkillSet_Fixture_trait_1"]);
});

test("traits without damage text and traits on unmodeled skills are classified, never dropped", () => {
  const artifact = artifactFor({
    mappings: [traitHostMapping()],
    skills: [traitHostSkill()],
    skillTraits: [
      traitFor("SkillSet_Fixture_trait_1", "SkillSet_Fixture", [
        traitLevel(1, "Cooldown decreases by 3s.", "Cooldown ▼"),
      ]),
      traitFor("SkillSet_Elsewhere_trait_1", "SkillSet_Elsewhere", [
        traitLevel(1, "Deals 420% of Base Damage + 77 damage."),
      ]),
    ],
  });
  assert.deepEqual(artifact.excludedTraits.map((row) => [row.traitId, row.reason]), [
    ["SkillSet_Fixture_trait_1", "no_damage_effect"],
    ["SkillSet_Elsewhere_trait_1", "skill_not_modeled"],
  ]);
  // Neither is an unverified damage spec on the modeled skill.
  assert.equal(artifact.skills.SkillSet_Fixture.unverifiedDamageTraits, undefined);
});

test("a damage-line-matched variant may lengthen the override cooldown, never shorten it", () => {
  const variant = (cooldown) => ({
    id: "Fixture_SP",
    levels: [{ level: 1, cooldown, tooltipOptions: [{ name: "Damage ▲", parameter: "420% + 77" }] }],
  });
  const build = (cooldown) => artifactFor({
    mappings: [traitHostMapping()],
    skills: [traitHostSkill({ specializations: [variant(cooldown)] })],
    skillTraits: [traitFor("SkillSet_Fixture_trait_1", "SkillSet_Fixture", [
      traitLevel(1, "Deals 420% of Base Damage + 77 damage."),
    ])],
  });
  const longer = build(24).skills.SkillSet_Fixture.traitOverrides.SkillSet_Fixture_trait_1;
  assert.equal(longer.variantConfirmed, "Fixture_SP");
  assert.equal(longer.levels["1"].cooldown, 24);
  const shorter = build(3).skills.SkillSet_Fixture.traitOverrides.SkillSet_Fixture_trait_1;
  assert.equal(shorter.variantConfirmed, "Fixture_SP");
  assert.equal(shorter.levels["1"].cooldown, undefined);
});

test("mismatched game builds are rejected outright", () => {
  assert.throws(() => buildKitPacketsArtifact({
    skillsProjection: { gameBuild: "1", data: { skills: [] } },
    formulaMap: { gameBuild: "2", skills: [] },
  }), /does not match/);
});

// Guards on the generated artifact itself, so a bad regeneration cannot land
// silently. These read the committed JSON, not TL_DATA_ROOT.
const artifact = JSON.parse(readFileSync(path.join(REPO_ROOT, "web", "data", "kit-packets.json"), "utf8"));

test("shipped artifact: every packet level is well-formed and rotation-modelable", () => {
  assert.equal(artifact.schema, "tl-helper.kit-damage-packets");
  assert.equal(artifact.schemaVersion, 3);
  for (const [skillSetId, packet] of Object.entries(artifact.skills)) {
    assert.ok(["exact", "derived"].includes(packet.mappingClass), skillSetId);
    assert.ok(["single", "primary_largest_coefficient", "tooltip_anchored"].includes(packet.componentSelection), skillSetId);
    if (packet.componentSelection === "tooltip_anchored") assert.ok(packet.anchor?.confirmedLevels > 0, skillSetId);
    const levels = Object.values(packet.levels);
    assert.ok(levels.length > 0, skillSetId);
    for (const level of levels) {
      assert.ok(Number(level.coefficient) > 0, `${skillSetId} coefficient`);
      assert.ok(Number(level.cooldown) > 0, `${skillSetId} cooldown`);
      assert.ok(Number.isFinite(Number(level.flatAdd)), `${skillSetId} flatAdd`);
    }
  }
});

test("shipped artifact: recovered skills carry tooltip-anchored base rows", () => {
  const expectations = {
    SkillSet_WP_SW2_S_GaiaCrash: { row: "SW2_GaiaCrash_DD", level1: "2.5500" },
    SkillSet_WP_DA_DA_S_DeadlyStrike: { row: "DA_DeadlyStrike_DD", level1: "4.5000" },
    SkillSet_WP_ST_S_PowerAttack: { row: "ST_PowerAttack_DD", level1: "7.1000" },
    SkillSet_WP_ORB_Active_OrbitSlash: { row: "ORB_Active_OrbitSlash_DD", level1: "4.9000" },
  };
  for (const [skillSetId, expected] of Object.entries(expectations)) {
    const packet = artifact.skills[skillSetId];
    assert.ok(packet, `${skillSetId} recovered`);
    assert.equal(packet.componentSelection, "tooltip_anchored", skillSetId);
    assert.equal(packet.formulaRowId, expected.row, skillSetId);
    assert.equal(packet.levels["1"].coefficient, expected.level1, skillSetId);
  }
});

test("shipped artifact: Strafing omits the level where formula and tooltip disagree", () => {
  const strafing = artifact.skills.SkillSet_WP_BO_S_MultiShot;
  assert.ok(strafing, "Strafing recovered");
  assert.equal(strafing.levels["21"], undefined);
  assert.equal(strafing.levels["20"].coefficient, "1.4500");
  assert.deepEqual(strafing.anchor.unconfirmedLevels, [21]);
});

test("shipped artifact: healing skills are never counted as kit damage", () => {
  for (const skillSetId of ["SkillSet_WP_WA_GR_S_Heal", "SkillSet_WP_ORB_Active_Restoration", "SkillSet_WP_ORB_Active_Satellite"]) {
    assert.equal(artifact.skills[skillSetId], undefined, skillSetId);
    const exclusion = artifact.excluded.find((row) => row.skillSetId === skillSetId);
    assert.equal(exclusion?.reason, "no_tooltip_damage_line", skillSetId);
  }
});

test("shipped artifact: every exclusion carries a known reason and no mismatch remains", () => {
  const known = new Set(["not_in_skills_projection", "unresolved_mapping", "no_attack_power_component", "no_tooltip_damage_line", "no_level_with_cooldown", "tooltip_coefficient_mismatch"]);
  for (const row of artifact.excluded) assert.ok(known.has(row.reason), `${row.skillSetId}: ${row.reason}`);
  assert.equal(artifact.excluded.filter((row) => row.reason === "tooltip_coefficient_mismatch").length, 0);
  assert.equal(artifact.summary.excluded, artifact.excluded.length);
  assert.equal(artifact.summary.skills, Object.keys(artifact.skills).length);
});

test("shipped artifact: every trait is classified exactly once with a known reason", () => {
  const overrideIds = Object.values(artifact.skills).flatMap((packet) => Object.keys(packet.traitOverrides ?? {}));
  const excludedIds = artifact.excludedTraits.map((row) => row.traitId);
  assert.equal(overrideIds.length, artifact.summary.traits.overrides);
  assert.equal(excludedIds.length, artifact.summary.traits.excluded);
  assert.equal(overrideIds.length + excludedIds.length, artifact.summary.traits.total);
  assert.equal(new Set([...overrideIds, ...excludedIds]).size, artifact.summary.traits.total);
  const known = new Set(["no_damage_effect", "not_main_hit_replacement", "unparsed_damage_text", "inconsistent_levels", "skill_not_modeled"]);
  for (const row of artifact.excludedTraits) assert.ok(known.has(row.reason), `${row.traitId}: ${row.reason}`);
});

test("shipped artifact: every trait override level is well-formed and every unverified spec is a classified exclusion", () => {
  const excludedById = new Map(artifact.excludedTraits.map((row) => [row.traitId, row]));
  const damageRelevant = new Set(["not_main_hit_replacement", "unparsed_damage_text", "inconsistent_levels"]);
  for (const [skillSetId, packet] of Object.entries(artifact.skills)) {
    for (const [traitId, override] of Object.entries(packet.traitOverrides ?? {})) {
      assert.equal(override.mappingClass, "derived", traitId);
      assert.ok(Object.keys(override.levels).length > 0, traitId);
      for (const level of Object.values(override.levels)) {
        assert.ok(Number(level.coefficient) > 0, `${traitId} coefficient`);
        assert.ok(Number.isFinite(Number(level.flatAdd)), `${traitId} flatAdd`);
        if (level.cooldown !== undefined) assert.ok(Number(level.cooldown) > 0, `${traitId} cooldown`);
      }
    }
    for (const traitId of packet.unverifiedDamageTraits ?? []) {
      const exclusion = excludedById.get(traitId);
      assert.ok(exclusion, `${skillSetId} unverified ${traitId} classified`);
      assert.ok(damageRelevant.has(exclusion.reason), `${traitId}: ${exclusion.reason}`);
      assert.equal(exclusion.skillSetId, skillSetId, traitId);
    }
  }
});

test("shipped artifact: Focused Fire Bombs override carries the variant-confirmed trait numbers", () => {
  const override = artifact.skills.SkillSet_WP_ST_S_WideAreaAttack.traitOverrides.SkillSet_WP_ST_S_WideAreaAttack_trait_1;
  assert.equal(override.variantConfirmed, "WP_ST_S_WideAreaAttack_Charge");
  assert.equal(override.levels["1"].coefficient, "4.2000");
  assert.equal(override.levels["1"].flatAdd, "77");
  assert.equal(override.levels["15"].coefficient, "5.9500");
  assert.equal(override.levels["15"].flatAdd, "602");
  // The base cooldown holds for this spec (the Charge variant states the same
  // 12s), so no override cooldown is emitted.
  assert.equal(override.levels["1"].cooldown, undefined);
});

test("shipped artifact: Tornado carries the variant's longer 45s cooldown, never the base 30s", () => {
  const override = artifact.skills.SkillSet_WP_BO_S_TornadoShot.traitOverrides.SkillSet_WP_BO_S_TornadoShot_Trait_1;
  assert.equal(override.variantConfirmed, "WP_BO_S_CycloneShot");
  for (const level of Object.values(override.levels)) assert.equal(level.cooldown, 45);
});
