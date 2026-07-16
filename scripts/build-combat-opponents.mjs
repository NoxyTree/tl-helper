// Generates the Combat Lab practice-opponent roster (web/data/opponents.json)
// from the bundled reference build. Each archetype is a real, resolvable build so
// its PvP stats come out of the same calculator pipeline as any imported build —
// we only retarget defensive traits and swap weapons, never fabricate stat totals.
//
// Chassis (defensive lean):
//   endurance -> keep the reference build's *_critical_defense / *_double_defense
//                traits (high Endurance, the classic bruiser wall).
//   evasion   -> retarget those defensive traits to *_evasion (high Evasion dodge
//                profile). Runes are left untouched so the build stays legal, so an
//                evasion chassis still carries some Endurance from runes — a draft
//                to be refined, not a min-maxed export.
// Role sets the weapon pair (one Heroic main + one non-Heroic off so the single
// Heroic-weapon cap holds) and is cosmetic for a defending opponent.
//
// Run: node scripts/build-combat-opponents.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reference = JSON.parse(await readFile(join(root, "web", "data", "reference-build.json"), "utf8"));
const skillKits = JSON.parse(await readFile(join(root, "scripts", "combat-opponents", "questlog-skill-kits.json"), "utf8"));
const skillsProjection = JSON.parse(await readFile(join(root, "web", "data", "projections", "skills.json"), "utf8"));
const skillWeaponById = new Map(skillsProjection.data.skills.map((skill) => [skill.id, skill.mainCategory]));

const EVASION_TRAIT_SWAP = {
  all_critical_defense: "all_evasion",
  melee_critical_defense: "melee_evasion",
  magic_critical_defense: "magic_evasion",
  range_critical_defense: "range_evasion",
  all_double_defense: "all_evasion",
  melee_double_defense: "melee_evasion",
  magic_double_defense: "magic_evasion",
};

// Weapon pairs now follow the real kits: each role equips the weapons of a
// highly rated public Questlog build whose skill loadout it borrows (one
// Heroic main + one non-Heroic off so the single-Heroic-weapon cap holds).
const WEAPONS = {
  tank: ["sword2h_aa_t2_raid_001", "spear_aa_t1_normal_001"],
  dps: ["crossbow_aa_t2_raid_001", "dagger_a_t2_nomal_001"],
  healer: ["orb_aaa_t1_raid_001", "wand_a_t2_nomal_001"],
};

// Skill loadouts sourced from top-rated public Questlog builds (see
// scripts/combat-opponents/questlog-skill-kits.json for provenance).
const ROLE_KITS = {
  tank: "sword2h-spear-pvp",
  dps: "dagger-crossbow-dps",
  healer: "orb-wand-healer",
};

function kitSkills(role, weaponItemIds) {
  const kit = skillKits.kits.find((entry) => entry.id === ROLE_KITS[role]);
  if (!kit) throw new Error(`Missing Questlog skill kit for role ${role}.`);
  const equippedFamilies = new Set(weaponItemIds.map((itemId) => itemId.split("_")[0]));
  const rows = [];
  const dropped = [];
  for (const [loadoutType, entries] of [["active", kit.active], ["passive", kit.passive], ["defensive", kit.defensive]]) {
    for (const entry of entries ?? []) {
      const weapon = skillWeaponById.get(entry.skillId);
      if (!weapon) { dropped.push(`${entry.skillId} (unknown skill)`); continue; }
      if (loadoutType !== "passive" && !equippedFamilies.has(weapon)) { dropped.push(`${entry.skillId} (${weapon} not equipped)`); continue; }
      rows.push({ skillId: entry.skillId, level: entry.level, specializationIds: [], loadoutType });
    }
  }
  if (dropped.length) console.warn(`${role}: dropped ${dropped.length} kit skills: ${dropped.join(", ")}`);
  return rows;
}

// Attribute allocation is mostly flavor here — gear dominates the resolved PvP
// stats — but it nudges the intended lean and keeps each archetype distinct.
const ARCHETYPES = [
  { id: "endurance-tank", label: "Endurance Tank", chassis: "endurance", role: "tank", attributes: { str: 0, dex: 0, int: 0, per: 0, con: 55 }, blurb: "Crit-shrugging bruiser wall" },
  { id: "evasion-tank", label: "Evasion Tank", chassis: "evasion", role: "tank", attributes: { str: 0, dex: 55, int: 0, per: 0, con: 0 }, blurb: "Dodge-stacked front-liner" },
  { id: "endurance-dps", label: "Endurance DPS", chassis: "endurance", role: "dps", attributes: { str: 0, dex: 20, int: 0, per: 0, con: 35 }, blurb: "Bruiser damage dealer" },
  { id: "evasion-dps", label: "Evasion DPS", chassis: "evasion", role: "dps", attributes: { str: 0, dex: 55, int: 0, per: 0, con: 0 }, blurb: "Slippery glass-cannon" },
  { id: "endurance-healer", label: "Endurance Healer", chassis: "endurance", role: "healer", attributes: { str: 0, dex: 0, int: 15, per: 0, con: 40 }, blurb: "Immovable support" },
  { id: "evasion-healer", label: "Evasion Healer", chassis: "evasion", role: "healer", attributes: { str: 0, dex: 40, int: 15, per: 0, con: 0 }, blurb: "Kiting support" },
];

const weaponEntry = (itemId) => ({
  itemId, level: 80, traits: [], uniqueTrait: null, resonance: [],
  heroicEffects: [], artifactStatId: "", potentialId: "", perkId: "", runes: [],
});

function retargetTrait(statId) {
  return EVASION_TRAIT_SWAP[statId] ?? statId;
}

function buildArchetype(archetype) {
  const build = structuredClone(reference.build);
  build.id = `opponent-${archetype.id}`;
  build.name = archetype.label;
  if (archetype.chassis === "evasion") {
    for (const item of Object.values(build.equipment)) {
      (item.traits ?? []).forEach((trait) => { trait.statId = retargetTrait(trait.statId); });
      if (item.uniqueTrait) item.uniqueTrait.statId = retargetTrait(item.uniqueTrait.statId);
      (item.heroicEffects ?? []).forEach((effect) => { effect.statId = retargetTrait(effect.statId); });
    }
  }
  const [main, off] = WEAPONS[archetype.role];
  build.equipment.main_hand = weaponEntry(main);
  build.equipment.off_hand = weaponEntry(off);
  // Skills come from a real top-rated Questlog loadout for this weapon pair, so
  // the rotation verdict can model the opponent's actual damage kit. Masteries
  // stay cleared (the reference masteries are sword-specific).
  build.skills = kitSkills(archetype.role, [main, off]);
  build.masteries = {};
  build.unifiedMasteries = [];
  return {
    id: `opponent:${archetype.id}`,
    name: archetype.label,
    source: "Generated from the bundled reference build by scripts/build-combat-opponents.mjs",
    kind: "practice-opponent",
    blurb: archetype.blurb,
    profile: { name: archetype.label, role: "Practice opponent", server: "Local" },
    attributes: archetype.attributes,
    build,
  };
}

const roster = ARCHETYPES.map(buildArchetype);
const output = join(root, "web", "data", "opponents.json");
await writeFile(output, `${JSON.stringify(roster, null, 2)}\n`, "utf8");
console.log(`Wrote ${roster.length} practice opponents to ${output}`);
