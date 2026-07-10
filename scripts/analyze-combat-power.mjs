import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import * as core from "../web/tl-core.js";
import { assembleWebDataManifest, WEB_DATA_MANIFEST_SCHEMA } from "../web/tl-data-loader.js";
import { COMBAT_POWER, COMBAT_POWER_BONUS_20_ITEMS, COMBAT_POWER_BONUS_60_ITEMS } from "../web/tl-questlog-rules.js";
import {
  decodedItemPower, decodedRunePower, inferItemCombatPowerMapping, inferRuneCombatPowerRowId,
} from "./lib/combat-power-table.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.resolve(process.env.TL_DATA_ROOT ?? "D:\\TL_Data");
const buildId = process.env.TL_GAME_BUILD ?? "24118850";
const tablePath = path.join(dataRoot, "decoded", buildId, "tables", "TLItemCombatPower.json");
const itemEquipPath = path.join(dataRoot, "decoded", buildId, "tables", "TLItemEquip.json");
const outputPath = process.argv.includes("--write")
  ? path.join(dataRoot, "reports", buildId, "combat-power-parity.json") : null;

const appDataPath = path.join(repoRoot, "web", "data", "app-data.json");
const appDataSource = JSON.parse(await readFile(appDataPath, "utf8"));
const appData = appDataSource.schema === WEB_DATA_MANIFEST_SCHEMA
  ? await assembleWebDataManifest(appDataSource, async (descriptor) => JSON.parse(await readFile(path.join(path.dirname(appDataPath), descriptor.file), "utf8")))
  : appDataSource;
const table = JSON.parse(await readFile(tablePath, "utf8"));
const itemEquip = JSON.parse(await readFile(itemEquipPath, "utf8"));
const preset = JSON.parse(await readFile(path.join(repoRoot, "web", "data", "reference-build.json"), "utf8"));
await core.initCore(appData);
preset.build.masteries = core.normalizeMasterySelections(preset.build.masteries);

const rowIds = Object.keys(table.rows);
const relevantItems = appData.items.filter((item) => core.BUILD_SLOTS.some((slot) => slot.types.includes(item.equipmentType)) && !core.SUPPORT_SLOTS.some((slot) => slot.types.includes(item.equipmentType)));
const itemMappings = relevantItems.map((item) => ({ item, ...inferItemCombatPowerMapping(item, rowIds, itemEquip.rows[item.id]) }));
const mappedItems = itemMappings.filter((entry) => entry.rowId);
const unmappedItems = itemMappings.filter((entry) => !entry.rowId).map((entry) => entry.item);

function oldBareItemPower(item) {
  if (String(item.equipmentType).startsWith("talistone")) return 60;
  if (String(item.equipmentType).startsWith("gemstone")) return 70;
  const category = core.WEAPON_TYPES.includes(item.equipmentType) ? "weapon" : "armor";
  const levels = core.getItemLevels(item);
  const level = levels.at(-1) ?? 0;
  let power = Number(COMBAT_POWER.itemLevelBase[category]?.[item.grade] ?? 0);
  power += Math.max(0, level - (levels[0] ?? level)) * COMBAT_POWER.enchantPerLevel[category];
  if (COMBAT_POWER_BONUS_60_ITEMS.includes(item.id)) power += 60;
  if (COMBAT_POWER_BONUS_20_ITEMS.includes(item.id)) power += 20;
  return power;
}

const itemComparisons = mappedItems.map(({ item, rowId, evidence }) => {
  const level = core.getItemLevels(item).at(-1) ?? 0;
  const decoded = decodedItemPower(table.rows[rowId], { level }).total;
  const heuristic = oldBareItemPower(item);
  return { itemId: item.id, rowId, mappingEvidence: evidence, level, heuristic, decoded, difference: decoded - heuristic };
});

function summarizeDifferences(rows) {
  const exact = rows.filter((row) => row.difference === 0).length;
  const absolute = rows.map((row) => Math.abs(row.difference));
  return {
    count: rows.length,
    exact,
    exactPercent: rows.length ? Number((100 * exact / rows.length).toFixed(1)) : 0,
    meanAbsoluteDifference: rows.length ? Number((absolute.reduce((a, b) => a + b, 0) / rows.length).toFixed(2)) : 0,
    maxAbsoluteDifference: absolute.length ? Math.max(...absolute) : 0,
  };
}

const tableComponentChecks = { normalTraitRows: 0, normalTraitExact: 0, artifactRows: 0, artifactBaseExact: 0 };
for (const [rowId, row] of Object.entries(table.rows)) {
  if (["ETLCombatPowerCategory::kWeapon", "ETLCombatPowerCategory::kArmor", "ETLCombatPowerCategory::kAccessory"].includes(row.Category) && !rowId.startsWith("perk_") && rowId !== "Test_CombatPower_2000") {
    tableComponentChecks.normalTraitRows++;
    const perTier = row.Category === "ETLCombatPowerCategory::kWeapon" ? 10 : 5;
    const expected = row.ItemTraitCombatPowerList.map((_, index) => Math.max(0, index - 1) * perTier);
    if (row.ItemTraitCombatPowerList.every((value, index) => value.CombatPower === expected[index])) tableComponentChecks.normalTraitExact++;
  }
  if (row.Category === "ETLCombatPowerCategory::kArtifact") {
    tableComponentChecks.artifactRows++;
    const old = rowId.startsWith("talistone") ? 60 : 70;
    if (row.BaseCombatPower === old) tableComponentChecks.artifactBaseExact++;
  }
}

function oldRunePower(rune, level) {
  const base = { 71: 35, 61: 30, 51: 25, 43: 22, 42: 20, 41: 15, 32: 12, 31: 10, 21: 5 }[rune.grade] ?? 1;
  const cap = { 71: 200, 61: 180, 51: 150, 43: 120, 42: 120, 41: 90, 32: 60, 31: 60, 21: 40 }[rune.grade] ?? 20;
  return rune.runeType === "chaos" ? base + Math.floor(cap * 0.2) : base + Math.floor(level * 0.2);
}

const runeComparisons = [];
for (const rune of appData.runes) {
  const rowId = inferRuneCombatPowerRowId(rune);
  const row = table.rows[rowId];
  if (!row) continue;
  const maxLevel = Math.max(...(rune.itemStats?.random_stat_group_1 ?? []).map((entry) => Number(entry.max_level ?? 0)), 1);
  for (let level = 1; level <= maxLevel; level++) {
    const decoded = decodedRunePower(row, level);
    const heuristic = oldRunePower(rune, level);
    runeComparisons.push({ runeId: rune.id, rowId, level, heuristic, decoded, difference: decoded - heuristic });
  }
}

const oldReference = core.combatPowerBreakdown(preset.build);
const byId = new Map(appData.items.map((item) => [item.id, item]));
const runeById = new Map(appData.runes.map((rune) => [rune.id, rune]));
const referenceRows = [];
for (const [slotId, selection] of [...Object.entries(preset.build.equipment ?? {}), ...Object.entries(preset.build.artifacts ?? {})]) {
  const item = byId.get(selection.itemId);
  const mapping = inferItemCombatPowerMapping(item, rowIds, itemEquip.rows[item?.id]);
  const rowId = mapping.rowId;
  const row = table.rows[rowId];
  if (!item || !row) continue;
  const itemResult = decodedItemPower(row, selection);
  const runes = (selection.runes ?? []).map((selected) => {
    const rune = runeById.get(selected.runeId);
    const runeRowId = inferRuneCombatPowerRowId(rune);
    return { runeId: selected.runeId, rowId: runeRowId, level: selected.level, power: decodedRunePower(table.rows[runeRowId], selected.level) };
  });
  referenceRows.push({ slotId, itemId: item.id, rowId, mappingEvidence: mapping.evidence, itemPower: itemResult.total, itemComponents: itemResult, runePower: runes.reduce((sum, rune) => sum + Number(rune.power ?? 0), 0), runes });
}
const decodedReferenceItemSubtotal = referenceRows.reduce((sum, row) => sum + row.itemPower + row.runePower, 0);
const decodedReferenceItems = referenceRows.reduce((sum, row) => sum + row.itemPower, 0);
const decodedReferenceRunes = referenceRows.reduce((sum, row) => sum + row.runePower, 0);
const oldReferenceItemSubtotal = oldReference.items.reduce((sum, row) => sum + row.power, 0);

const result = {
  schema: "tl-helper.combat-power-parity",
  schemaVersion: 2,
  gameBuild: buildId,
  provenance: { tablePath, tableSha256: table.sha256, itemEquipPath, itemEquipSha256: itemEquip.sha256, decoderVersion: table.decoderVersion, appDataGameBuild: appData.gameBuild },
  table: {
    rows: rowIds.length,
    categories: Object.fromEntries(Object.entries(Object.groupBy(Object.values(table.rows), (row) => row.Category)).map(([key, values]) => [key, values.length])),
    meaning: "Component lookup weights only; no skill, mastery, global base, or final aggregation fields are present.",
  },
  itemMapping: {
    relevantItems: relevantItems.length,
    mapped: mappedItems.length,
    unmapped: unmappedItems.length,
    evidence: Object.fromEntries(Object.entries(Object.groupBy(mappedItems, (entry) => entry.evidence)).map(([key, values]) => [key, values.length])),
    unresolvedSourceGrades: Object.fromEntries(Object.entries(Object.groupBy(unmappedItems, (item) => itemEquip.rows[item.id]?.item_grade ?? "missing-source-record")).map(([key, values]) => [key, values.length])),
    unmappedExamples: unmappedItems.slice(0, 20).map((item) => item.id),
  },
  components: tableComponentChecks,
  bareItemComparison: { ...summarizeDifferences(itemComparisons), largestDifferences: itemComparisons.toSorted((a, b) => Math.abs(b.difference) - Math.abs(a.difference)).slice(0, 20) },
  runeComparison: summarizeDifferences(runeComparisons),
  referenceBuild: {
    name: preset.name,
    observedTotal: oldReference.total,
    heuristic: { equipmentBase: COMBAT_POWER.equipmentBase, itemSubtotal: oldReferenceItemSubtotal, equipmentPower: oldReference.equipmentPower, skillPower: oldReference.skillPower, masteryPower: oldReference.masteryPower },
    decodedItemSubtotal: decodedReferenceItems,
    decodedRuneSubtotal: decodedReferenceRunes,
    decodedItemAndRuneSubtotal: decodedReferenceItemSubtotal,
    decodedMappedSlots: referenceRows.length,
    rows: referenceRows,
    warning: "Decoded subtotal is not a replacement total. Perk weights, global base, skill power, mastery power, and final aggregation order are unresolved.",
  },
};

if (outputPath) {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.error(`Wrote ${outputPath}`);
  console.log(JSON.stringify({
    schema: result.schema,
    gameBuild: result.gameBuild,
    tableRows: result.table.rows,
    mappedItems: result.itemMapping.mapped,
    unmappedItems: result.itemMapping.unmapped,
    exactBareItems: result.bareItemComparison.exact,
    exactRuneComparisons: result.runeComparison.exact,
    decodedReferenceSubtotal: result.referenceBuild.decodedItemAndRuneSubtotal,
    observedReferenceTotal: result.referenceBuild.observedTotal,
    output: outputPath,
  }, null, 2));
} else {
  console.log(JSON.stringify(result, null, 2));
}
