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

function artifactFor({ mappings, skills }) {
  return buildKitPacketsArtifact({
    skillsProjection: { gameBuild: BUILD, data: { skills } },
    formulaMap: { gameBuild: BUILD, provenance: { source: "fixture" }, skills: mappings },
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
  assert.equal(artifact.schemaVersion, 2);
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
