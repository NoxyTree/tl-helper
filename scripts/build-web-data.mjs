import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const webDataDir = path.join(root, "web", "data");
const publicDir = path.join(outDir, "questlog-public");

function imageUrl(icon) {
  if (!icon) return "";
  if (/^https?:\/\//i.test(icon)) return icon;
  let assetPath = icon.startsWith("/") ? icon : `/${icon}`;
  if (assetPath.includes(".")) {
    assetPath = assetPath.slice(0, assetPath.lastIndexOf("."));
  }
  return `https://cdn.questlog.gg/throne-and-liberty${assetPath}.webp`;
}

async function readTrpc(name) {
  const raw = (await readFile(path.join(publicDir, name), "utf8")).replace(/^\uFEFF/, "");
  const parsed = JSON.parse(raw);
  return parsed[0]?.result?.data?.json ?? parsed[0]?.result?.data ?? parsed[0];
}

async function readTrpcRecords(name) {
  const raw = (await readFile(path.join(publicDir, name), "utf8")).replace(/^\uFEFF/, "");
  return flattenTrpcBatch(JSON.parse(raw));
}

function flattenTrpcBatch(batch) {
  return values(batch).flatMap((entry) => {
    const data = entry?.result?.data?.json ?? entry?.result?.data ?? entry;
    return values(data);
  });
}

function values(objectLike) {
  return Array.isArray(objectLike) ? objectLike : Object.values(objectLike ?? {});
}

function pruneCost(entry) {
  if (!entry) return entry;
  const copy = { ...entry };
  delete copy.openCost;
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.language;
  return copy;
}

function plainText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeTooltipOptions(rows) {
  return values(rows).map((row) => ({
    name: plainText(row.name),
    parameter: plainText(row.parameter),
  })).filter((row) => row.name || row.parameter);
}

function normalizeSkillLevels(levels) {
  return values(levels).map((level) => ({
    level: Number(level.skill_level ?? level.skillLevel ?? level.level ?? 0),
    cooldown: level.cooldown ?? null,
    manaCost: level.mana_cost ?? level.manaCost ?? null,
    description: plainText(level.description),
    effect: plainText(level.effect),
    tooltipOptions: normalizeTooltipOptions(level.tooltip_option_list ?? level.tooltipOptionList),
  }));
}

function normalizeSkillTraitLevels(levels) {
  return values(levels).map((level) => ({
    level: Number(level.skill_level ?? level.skillLevel ?? level.level ?? 0),
    description: plainText(level.description),
    effect: plainText(level.effect),
    tooltipOptions: normalizeTooltipOptions(level.tooltip_option_list ?? level.tooltipOptionList),
  }));
}

function normalizeMasteryStats(stats) {
  return values(stats).map((level) => {
    const rows = [];
    if (level && typeof level === "object" && !Array.isArray(level)) {
      for (const [statId, value] of Object.entries(level)) {
        if (typeof statId === "string" && Number.isFinite(Number(value))) {
          rows.push({ statId, value: Number(value) });
        } else if (value && typeof value === "object" && typeof value.statId === "string" && Number.isFinite(Number(value.value))) {
          rows.push({ statId: value.statId, value: Number(value.value) });
        }
      }
    }
    return rows;
  }).filter((rows) => rows.length);
}

function normalizeOpenCost(costRows) {
  return values(costRows).map((row) => ({
    costAmount: Number(row.costAmount ?? 0),
    material: values(row.material).map((material) => ({
      id: material.id,
      name: plainText(material.name),
      grade: material.grade,
      imageUrl: imageUrl(material.icon),
      mainCategory: material.mainCategory ?? material.main_category ?? "",
      subCategory: material.subCategory ?? material.sub_category ?? "",
    })),
  }));
}

function normalizePassives(passives) {
  if (!passives) return [];
  return values(passives).map(plainText).filter(Boolean);
}

function itemTypeCategory(type) {
  if (["bow", "crossbow", "dagger", "gauntlet", "orb", "spear", "staff", "sword", "sword2h", "wand", "shield"].includes(type)) return "weapon";
  if (["head", "chest", "hands", "legs", "feet", "cloak"].includes(type)) return "armor";
  if (["necklace", "bracelet", "belt", "ring", "earring"].includes(type)) return "accessory";
  if (/^(talistone|gemstone)|^brooch$/.test(type)) return "artifact";
  return "support";
}

function displayName(value) {
  const labels = {
    sword2h: "Greatsword",
    talistone1: "Talistone I",
    talistone2: "Talistone II",
    talistone3: "Talistone III",
    talistone4: "Talistone IV",
    gemstone1: "Gemstone I",
    gemstone2: "Gemstone II",
  };
  if (labels[value]) return labels[value];
  return String(value ?? "")
    .replace(/-/g, " ")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function collectStatIdsFromValue(value, ids = new Set()) {
  if (!value) return ids;
  if (Array.isArray(value)) {
    for (const item of value) collectStatIdsFromValue(item, ids);
    return ids;
  }
  if (typeof value !== "object") return ids;
  if (typeof value.stat_id === "string") {
    ids.add(value.stat_id);
    return ids;
  }
  if (typeof value.statId === "string") {
    ids.add(value.statId);
    return ids;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (typeof nested === "number") ids.add(key);
    collectStatIdsFromValue(nested, ids);
  }
  return ids;
}

function statLabel(id) {
  const aliases = {
    str: "Strength",
    dex: "Dexterity",
    int: "Wisdom",
    per: "Perception",
    con: "Fortitude",
    hp_max: "Max Health",
    mp_max: "Max Mana",
    attack_power_main_hand_min: "Main-hand Min Damage",
    attack_power_main_hand_max: "Main-hand Max Damage",
    attack_power_off_hand_min: "Off-hand Min Damage",
    attack_power_off_hand_max: "Off-hand Max Damage",
  };
  if (aliases[id]) return aliases[id];
  return id
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bHp\b/g, "HP")
    .replace(/\bMp\b/g, "MP")
    .replace(/\bPvp\b/g, "PvP")
    .replace(/\bPve\b/g, "PvE");
}

const [
  equipmentItemsRaw,
  itemSetsRaw,
  runesRaw,
  runeSynergiesRaw,
  attributeStatsRaw,
  masteriesRaw,
  skillSetsRaw,
  skillTraitsRaw,
] = await Promise.all([
  readTrpc("characterBuilder.getEquipmentItems.json"),
  readTrpc("characterBuilder.getEquipmentItemSets.json"),
  readTrpc("characterBuilder.getEquipmentRunes.json"),
  readTrpc("characterBuilder.getRuneSynergies.json"),
  readTrpc("characterBuilder.getAttributeStats.json"),
  readTrpcRecords("weaponSpecialization.getWeaponSpecializations.json"),
  readTrpcRecords("skillBuilder.getSkillSets.json"),
  readTrpcRecords("skillBuilder.getSkillTraits.json"),
]);

const items = values(equipmentItemsRaw).map((item) => ({
  id: item.id,
  name: item.name,
  grade: item.grade,
  equipmentType: item.equipmentType,
  armorCategory: item.armorCategory ?? "",
  subCategory: item.subCategory ?? "",
  requiredLevel: item.requiredLevel ?? 0,
  setId: item.setId ?? "",
  imageUrl: imageUrl(item.icon),
  passives: item.passives ? {
    id: item.passives.id,
    name: item.passives.name,
    text: item.passives.text,
    imageUrl: imageUrl(item.passives.icon),
  } : null,
  availablePerks: values(item.availablePerks).map((perk) => ({
    id: perk.id,
    name: perk.name,
    grade: perk.grade,
    weapon: perk.weapon ?? "",
    imageUrl: imageUrl(perk.icon),
    passive: perk.passive ? {
      id: perk.passive.id,
      name: perk.passive.name,
      text: perk.passive.text,
      imageUrl: imageUrl(perk.passive.icon),
    } : null,
  })),
  itemPotential: item.itemPotential ? {
    groupId: item.itemPotential.group_id ?? item.itemPotential.groupId ?? "",
    stats: values(item.itemPotential.stats).map((row) => ({
      statId: row.stat_id ?? row.statId,
      value: row.value,
      probability: row.probability,
    })),
  } : null,
  itemStats: item.itemStats ?? {},
}));

const itemSets = values(itemSetsRaw).map((set) => ({
  id: set.id,
  name: set.name,
  grade: set.grade,
  itemSetMadeOfItems: set.itemSetMadeOfItems ?? [],
  itemSetBonus: set.itemSetBonus ?? [],
}));

const runes = values(runesRaw).map((rune) => ({
  id: rune.id,
  name: rune.name,
  grade: rune.grade,
  equipmentCategory: rune.equipmentCategory,
  runeType: rune.runeType,
  imageUrl: imageUrl(rune.icon),
  itemStats: rune.itemStats ?? {},
}));

const runeSynergies = values(runeSynergiesRaw).map((synergy) => ({
  id: synergy.id,
  name: synergy.name,
  grade: synergy.grade,
  equipmentCategory: synergy.equipmentCategory,
  combination: synergy.combination ?? [],
  stats: synergy.stats ?? {},
}));

const skills = values(skillSetsRaw).map((skill) => {
  const levels = normalizeSkillLevels(skill.skillSetLevels);
  return {
    id: skill.id,
    name: skill.name,
    grade: skill.grade,
    mainCategory: skill.mainCategory,
    skillType: skill.skillType,
    skillSlotAffinity: skill.skillSlotAffinity ?? "",
    imageUrl: imageUrl(skill.icon),
    maxLevel: Math.max(0, ...levels.map((level) => Number(level.level || 0))),
    levels,
    specializationIds: values(skill.specializations).map((specialization) => specialization.id).filter(Boolean),
  };
});

const skillTraits = values(skillTraitsRaw).map((trait) => ({
  id: trait.id,
  skillSetId: trait.skillSetId,
  name: trait.name,
  rawName: trait.rawName ?? "",
  imageUrl: imageUrl(trait.icon),
  points: Number(trait.points ?? 0),
  unlockLevel: Number(trait.unlockLevel ?? 0),
  levels: normalizeSkillTraitLevels(trait.skillTraitLevels),
}));

const traitsBySkillId = {};
for (const trait of skillTraits) {
  if (!trait.skillSetId) continue;
  if (!traitsBySkillId[trait.skillSetId]) traitsBySkillId[trait.skillSetId] = [];
  traitsBySkillId[trait.skillSetId].push(trait.id);
}
for (const traitIds of Object.values(traitsBySkillId)) traitIds.sort();

const skillsByWeapon = {};
for (const skill of skills) {
  const keys = [skill.mainCategory, skill.skillSlotAffinity].filter(Boolean);
  for (const key of keys) {
    if (!skillsByWeapon[key]) skillsByWeapon[key] = [];
    skillsByWeapon[key].push(skill.id);
  }
}
for (const skillIds of Object.values(skillsByWeapon)) skillIds.sort();

const masteries = values(masteriesRaw).map((mastery) => ({
  id: mastery.id,
  name: mastery.name,
  grade: mastery.grade,
  mainCategory: mastery.mainCategory,
  subCategory: mastery.subCategory,
  specializationType: mastery.specializationType,
  nodeNumber: mastery.nodeNumber ?? null,
  imageUrl: imageUrl(mastery.icon),
  openCost: normalizeOpenCost(mastery.openCost),
  description: plainText(mastery.description),
  passives: normalizePassives(mastery.passives),
  stats: normalizeMasteryStats(mastery.stats),
}));

const artifactTypes = new Set(["talistone1", "talistone2", "talistone3", "talistone4", "gemstone1", "gemstone2", "brooch"]);
const artifactSets = itemSets
  .filter((set) => values(set.itemSetMadeOfItems).some((member) => artifactTypes.has(member.sub_category ?? member.subCategory)))
  .map((set) => ({
    id: set.id,
    name: set.name,
    grade: set.grade,
    memberItemIds: values(set.itemSetMadeOfItems).map((member) => member.id).filter(Boolean),
    bonuses: values(set.itemSetBonus).length ? set.itemSetBonus : undefined,
  }));

const equipmentTypes = [...new Set(items.map((item) => item.equipmentType).filter(Boolean))].sort();
const slotDefinitions = Object.fromEntries(equipmentTypes.map((type) => [
  type,
  {
    displayName: displayName(type),
    category: itemTypeCategory(type),
    acceptsSets: items.some((item) => item.equipmentType === type && item.setId),
  },
]));

const statIds = new Set();
for (const source of [
  items.map((item) => item.itemStats),
  runes.map((rune) => rune.itemStats),
  runeSynergies.map((synergy) => synergy.stats),
  Object.values(attributeStatsRaw),
  itemSets.flatMap((set) => set.itemSetBonus),
  masteries.flatMap((mastery) => mastery.stats),
  artifactSets.flatMap((set) => set.bonuses ?? []),
]) {
  collectStatIdsFromValue(source, statIds);
}
for (const id of [
  "str",
  "dex",
  "int",
  "per",
  "con",
  "attack_power_main_hand_min",
  "attack_power_main_hand_max",
  "attack_power_off_hand_min",
  "attack_power_off_hand_max",
]) {
  statIds.add(id);
}

const appData = {
  generatedAtUtc: new Date().toISOString(),
  sources: {
    questlogImageFormula:
      "If icon path contains a dot, strip from the last dot, prefix https://cdn.questlog.gg/throne-and-liberty, append .webp",
  },
  items,
  itemSets,
  runes,
  runeSynergies,
  attributeStats: attributeStatsRaw,
  masteries,
  skills,
  skillTraits,
  traitsBySkillId,
  skillsByWeapon,
  artifactSets,
  slotDefinitions,
  statLabels: Object.fromEntries([...statIds].sort().map((id) => [id, statLabel(id)])),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertImageUrls(rows, label) {
  const cdnPattern = /^https:\/\/cdn\.questlog\.gg\/throne-and-liberty\/.+\.webp$/;
  const invalid = rows
    .map((row) => row.imageUrl)
    .filter((url) => url && !cdnPattern.test(url));
  assert(!invalid.length, `${label} contains invalid imageUrl values: ${invalid.slice(0, 3).join(", ")}`);
}

assert(skills.length >= 200, `Expected at least 200 skills, got ${skills.length}`);
assert(skillTraits.length >= 390, `Expected at least 390 skill traits, got ${skillTraits.length}`);
assert(masteries.length >= 540, `Expected at least 540 masteries, got ${masteries.length}`);
assert(artifactSets.length >= 1, `Expected at least 1 artifact set, got ${artifactSets.length}`);
assertImageUrls(skills, "skills");
assertImageUrls(skillTraits, "skillTraits");

await mkdir(webDataDir, { recursive: true });
const serialized = JSON.stringify(appData);
await writeFile(path.join(webDataDir, "app-data.json"), serialized, "utf8");
await writeFile(
  path.join(webDataDir, "app-data.js"),
  `window.TL_TRACKER_DATA=${serialized};window.TL_TRACKER_DATA_READY=true;\n`,
  "utf8",
);

console.log({
  items: items.length,
  itemSets: itemSets.length,
  runes: runes.length,
  runeSynergies: runeSynergies.length,
  masteries: masteries.length,
  skills: skills.length,
  skillTraits: skillTraits.length,
  artifactSets: artifactSets.length,
  slotDefinitions: Object.keys(slotDefinitions).length,
  statLabels: Object.keys(appData.statLabels).length,
  bytes: serialized.length,
});
