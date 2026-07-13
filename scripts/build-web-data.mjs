import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STAT_UNIT_MODIFIERS } from "../web/tl-questlog-rules.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "out");
const webDataDir = path.join(root, "web", "data");
const publicDir = process.env.TL_QUESTLOG_PUBLIC_DIR
  ? path.resolve(process.env.TL_QUESTLOG_PUBLIC_DIR)
  : path.join(outDir, "questlog-public");

// Icons resolve to locally mirrored files under web/assets/icons/ (see
// scripts/mirror-icons.mjs, which fetches any missing files from the
// Questlog CDN). The local path mirrors the CDN path after
// /throne-and-liberty/assets/, so mirror-icons can reconstruct the source URL.
function imageUrl(icon) {
  if (!icon) return "";
  let assetPath = icon;
  const cdnMatch = assetPath.match(/^https:\/\/cdn\.questlog\.gg\/throne-and-liberty\/(.+?)(?:\.webp)?$/i);
  if (cdnMatch) {
    assetPath = cdnMatch[1];
  } else if (/^https?:\/\//i.test(assetPath)) {
    return assetPath;
  }
  if (assetPath.includes(".")) {
    assetPath = assetPath.slice(0, assetPath.lastIndexOf("."));
  }
  assetPath = assetPath.replace(/^\/+/, "").replace(/^assets\//i, "");
  return `assets/icons/${assetPath}.webp`;
}

// The snapshots contain double-decoded UTF-8 (UTF-8 bytes re-read as
// Windows-1252): \u25B2 (E2 96 B2) surfaces as "\u00E2\u2013\u00B2" etc. Reverse the cp1252
// mapping per string, decode as UTF-8, and keep the repair only when it
// round-trips cleanly (no replacement chars), so healthy strings pass through.
const CP1252_REVERSE = {
  "\u20AC": 0x80, "\u201A": 0x82, "\u0192": 0x83, "\u201E": 0x84, "\u2026": 0x85,
  "\u2020": 0x86, "\u2021": 0x87, "\u02C6": 0x88, "\u2030": 0x89, "\u0160": 0x8A,
  "\u2039": 0x8B, "\u0152": 0x8C, "\u017D": 0x8E, "\u2018": 0x91, "\u2019": 0x92,
  "\u201C": 0x93, "\u201D": 0x94, "\u2022": 0x95, "\u2013": 0x96, "\u2014": 0x97,
  "\u02DC": 0x98, "\u2122": 0x99, "\u0161": 0x9A, "\u203A": 0x9B, "\u0153": 0x9C,
  "\u017E": 0x9E, "\u0178": 0x9F,
};

function repairMojibake(text) {
  if (typeof text !== "string" || !/[\u00C0-\u00FF]/.test(text)) return text;
  const bytes = [];
  for (const char of text) {
    const code = CP1252_REVERSE[char] ?? char.codePointAt(0);
    if (code > 0xFF) return text;
    bytes.push(code);
  }
  const decoded = Buffer.from(bytes).toString("utf8");
  return decoded.includes("\uFFFD") ? text : decoded;
}

function repairStringsDeep(value) {
  if (typeof value === "string") return repairMojibake(value);
  if (Array.isArray(value)) return value.map(repairStringsDeep);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, repairStringsDeep(nested)]));
  }
  return value;
}

async function readTrpc(name) {
  const raw = (await readFile(path.join(publicDir, name), "utf8")).replace(/^\uFEFF/, "");
  const parsed = repairStringsDeep(JSON.parse(raw));
  return parsed[0]?.result?.data?.json ?? parsed[0]?.result?.data ?? parsed[0];
}

async function readTrpcRecords(name) {
  const raw = (await readFile(path.join(publicDir, name), "utf8")).replace(/^\uFEFF/, "");
  return flattenTrpcBatch(repairStringsDeep(JSON.parse(raw)));
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

function normalizeItemPotential(itemPotential) {
  if (!itemPotential) return null;
  return {
    groupId: itemPotential.group_id ?? itemPotential.groupId ?? "",
    stats: values(itemPotential.stats).map((row) => ({
      statId: row.stat_id ?? row.statId,
      value: row.value,
      probability: row.probability,
    })),
    skills: values(itemPotential.skills).map((row) => ({
      id: row.id,
      name: row.name,
      description: plainText(row.description),
      probability: row.probability ?? 0,
      imageUrl: imageUrl(row.icon),
    })),
  };
}

// Potential tables repeat verbatim across many items. Keep one copy of each
// normalized table in the projection and restore item.itemPotential in
// tl-core.initCore. Integer references keep the wire representation compact.
const itemPotentialPool = [];
const itemPotentialRefs = new Map();
function internItemPotential(itemPotential) {
  const normalized = normalizeItemPotential(itemPotential);
  if (!normalized) return null;
  const fingerprint = JSON.stringify(normalized);
  let ref = itemPotentialRefs.get(fingerprint);
  if (ref === undefined) {
    ref = itemPotentialPool.length;
    itemPotentialPool.push(normalized);
    itemPotentialRefs.set(fingerprint, ref);
  }
  return ref;
}

const items = values(equipmentItemsRaw).map((item) => ({
  id: item.id,
  name: item.name,
  // 50 boonstones ship without a grade; default to 0 ("Misc" in the shared
  // grade tables) so grade-keyed UI never sees undefined.
  grade: item.grade ?? 0,
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
  ...(item.itemPotential
    ? { itemPotentialRef: internItemPotential(item.itemPotential) }
    : { itemPotential: null }),
  itemStats: item.itemStats ?? {},
}));

const itemSets = values(itemSetsRaw).map((set) => ({
  id: set.id,
  name: set.name,
  grade: set.grade,
  itemSetMadeOfItems: set.itemSetMadeOfItems ?? [],
  itemSetBonus: set.itemSetBonus ?? [],
}));

function titleCaseIfShouty(name) {
  const text = String(name ?? "").trim();
  if (text && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    return text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
  return text;
}

const runes = values(runesRaw).map((rune) => ({
  id: rune.id,
  name: String(rune.name ?? "").trim(),
  grade: rune.grade,
  equipmentCategory: rune.equipmentCategory,
  runeType: rune.runeType,
  imageUrl: imageUrl(rune.icon),
  itemStats: rune.itemStats ?? {},
}));

const runeSynergies = values(runeSynergiesRaw).map((synergy) => ({
  id: synergy.id,
  name: titleCaseIfShouty(synergy.name),
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
    specializations: values(skill.specializations).map((specialization) => ({
      id: specialization.id,
      name: specialization.name,
      grade: specialization.grade,
      skillType: specialization.skillType,
      imageUrl: imageUrl(specialization.icon),
      levels: normalizeSkillLevels(specialization.skillSetLevels),
    })).filter((specialization) => specialization.id),
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
  // Raw flags kept so the wheel can gate rendering; all-false in the current
  // snapshot but present in the source records.
  weaponActivatedOnly: Boolean(mastery.weaponActivatedOnly),
  isDisabled: Boolean(mastery.isDisabled),
  requiredLevel: Number(mastery.requiredLevel ?? 0),
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
  ...Object.keys(STAT_UNIT_MODIFIERS),
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

const gameBuild = String(process.env.TL_STEAM_BUILD ?? "").trim();
assert(/^\d+$/.test(gameBuild), "TL_STEAM_BUILD must be a numeric Steam build. Run through update-tl-helper.mjs or set it explicitly.");

const generatedAtUtc = process.env.TL_GENERATED_AT_UTC?.trim() || new Date().toISOString();
const appData = {
  schema: "tl-helper.web-data",
  // Version 2 interns repeated itemPotential tables in the equipment wire
  // projection. tl-core restores the version 1 runtime item API at startup.
  schemaVersion: 2,
  gameBuild,
  generatedAtUtc,
  sources: {
    questlogImageFormula:
      "If icon path contains a dot, strip from the last dot, drop the leading /assets/, prefix assets/icons/, append .webp; files are mirrored locally by scripts/mirror-icons.mjs",
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
  const localPattern = /^assets\/icons\/.+\.webp$/;
  const invalid = rows
    .map((row) => row.imageUrl)
    .filter((url) => url && !localPattern.test(url));
  assert(!invalid.length, `${label} contains invalid imageUrl values: ${invalid.slice(0, 3).join(", ")}`);
}

assert(skills.length >= 200, `Expected at least 200 skills, got ${skills.length}`);
assert(skillTraits.length >= 390, `Expected at least 390 skill traits, got ${skillTraits.length}`);
assert(masteries.length >= 540, `Expected at least 540 masteries, got ${masteries.length}`);
assert(artifactSets.length >= 1, `Expected at least 1 artifact set, got ${artifactSets.length}`);
assertImageUrls(skills, "skills");
assertImageUrls(skillTraits, "skillTraits");
assert(items.every((item) => item.grade !== undefined && item.grade !== null), "Every item must have an explicit grade");
assert(items.every((item) => item.itemPotentialRef === undefined
  || (Number.isInteger(item.itemPotentialRef) && itemPotentialPool[item.itemPotentialRef])), "Every itemPotentialRef must resolve within itemPotentialPool");
{
  const danglingSpecIds = skills.flatMap((skill) => skill.specializationIds.filter((id) => !skill.specializations.some((spec) => spec.id === id)));
  assert(!danglingSpecIds.length, `Dangling specializationIds: ${danglingSpecIds.slice(0, 3).join(", ")}`);
}

await mkdir(webDataDir, { recursive: true });
const projectionGroups = [
  ["equipment", { items, itemSets, artifactSets, slotDefinitions, itemPotentialPool }],
  ["runes", { runes, runeSynergies }],
  ["progression", { attributeStats: attributeStatsRaw, masteries }],
  ["skills", { skills, skillTraits, traitsBySkillId, skillsByWeapon }],
  ["labels", { sources: appData.sources, statLabels: appData.statLabels }],
];
const projectionDir = path.join(webDataDir, "projections");
await mkdir(projectionDir, { recursive: true });
const projections = [];
let projectedBytes = 0;
for (const [id, projectionData] of projectionGroups) {
  const payload = {
    schema: appData.schema,
    schemaVersion: appData.schemaVersion,
    gameBuild,
    generatedAtUtc,
    projection: id,
    data: projectionData,
  };
  const serialized = JSON.stringify(payload);
  assert(!serialized.includes("â"), `${id} projection still contains double-decoded UTF-8 (mojibake)`);
  const file = `projections/${id}.json`;
  await writeFile(path.join(webDataDir, file), serialized, "utf8");
  const bytes = Buffer.byteLength(serialized);
  projectedBytes += bytes;
  projections.push({
    id,
    file,
    keys: Object.keys(projectionData),
    bytes,
    sha256: createHash("sha256").update(serialized).digest("hex"),
  });
}
const manifest = {
  schema: "tl-helper.web-data-manifest",
  schemaVersion: 1,
  dataSchema: appData.schema,
  dataSchemaVersion: appData.schemaVersion,
  gameBuild,
  generatedAtUtc,
  projections,
};
const serializedManifest = JSON.stringify(manifest);
await writeFile(path.join(webDataDir, "app-data.json"), serializedManifest, "utf8");
const roundTrip = JSON.parse(await readFile(path.join(webDataDir, "app-data.json"), "utf8"));
assert(roundTrip.projections.length === projectionGroups.length, "Post-write manifest integrity check failed");

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
  manifestBytes: Buffer.byteLength(serializedManifest),
  projectedBytes,
  projections: Object.fromEntries(projections.map(({ id, bytes }) => [id, bytes])),
});
