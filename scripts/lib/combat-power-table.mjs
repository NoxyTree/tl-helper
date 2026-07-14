const WEAPON_TYPES = new Set(["bow", "crossbow", "dagger", "gauntlet", "orb", "spear", "staff", "sword", "sword2h", "wand"]);
const ARMOR_TYPES = new Set(["head", "chest", "hands", "legs", "feet", "cloak"]);
const ACCESSORY_PREFIX = { necklace: "necklace", bracelet: "bracelet", belt: "belt", ring: "ring", brooch: "brooch", earring: "ear" };
const GRADE_TOKEN = { 11: "c", 21: "b", 31: "a", 41: "aa", 42: "aa2", 43: "aa3", 51: "aaa" };

export function combatPowerGroup(item) {
  if (WEAPON_TYPES.has(item?.equipmentType)) return "weapon";
  if (ARMOR_TYPES.has(item?.equipmentType)) return item.equipmentType;
  if (ACCESSORY_PREFIX[item?.equipmentType]) return ACCESSORY_PREFIX[item.equipmentType];
  if (String(item?.equipmentType).startsWith("talistone")) return "talistone";
  if (String(item?.equipmentType).startsWith("gemstone")) return "gemstone";
  return null;
}

function seasonalCombatPowerGroup(item) {
  const group = combatPowerGroup(item);
  if (group === "weapon") return "weapon";
  if (ARMOR_TYPES.has(item?.equipmentType)) return "armor";
  if (ACCESSORY_PREFIX[item?.equipmentType]) return "accessory";
  return null;
}

export function inferItemCombatPowerMapping(item, availableRows = null, sourceRecord = null) {
  const group = combatPowerGroup(item);
  if (!group) return { rowId: null, evidence: "unsupported-equipment-type" };
  const rowSet = availableRows ? new Set(availableRows) : null;
  const accept = (candidate) => !rowSet || rowSet.has(candidate) ? candidate : null;
  if (group === "talistone" || group === "gemstone") {
    const grade = GRADE_TOKEN[Number(item.grade)];
    const rowId = grade ? accept(`${group}_${grade}_t1`) : null;
    return { rowId, evidence: rowId ? "artifact-grade" : "unresolved" };
  }

  // Category-level equipment is tied to the long seasonal arrays by its source
  // level selector and exact level bounds. Item IDs retain older tier tokens and
  // are not authoritative for these records.
  const seasonalGroup = seasonalCombatPowerGroup(item);
  const levelSelector = String(sourceRecord?.level_select_id ?? "");
  const minLevel = Number(sourceRecord?.limit_level_min);
  const maxLevel = Number(sourceRecord?.limit_level_max);
  if (seasonalGroup && sourceRecord?.affects_category_Level === "EBool::T") {
    const seasonalGrade = levelSelector === "ItemGroup_T3" && minLevel === 21 && maxLevel === 50
      ? "a"
      : levelSelector === "ItemGroup_Nix" && minLevel === 51 && maxLevel === 80
        ? "aa"
        : null;
    if (seasonalGrade) {
      const rowId = accept(`${seasonalGroup}_${seasonalGrade}_S1`);
      if (rowId) return { rowId, evidence: `source-level-selector:${levelSelector}` };
    }
  }
  const id = String(item.id ?? "");
  const seasonal = id.match(/_(a|aa)_S1(?:_|$)/i);
  if (seasonal) {
    const rowId = accept(`${seasonalGroup}_${seasonal[1].toLowerCase()}_S1`);
    return { rowId, evidence: rowId ? "item-id-seasonal" : "unresolved" };
  }
  const tier = id.match(/_(aaa|aa3|aa2|aa|a|b|c)_(t[12])(?:_|$)/i);
  if (tier) {
    const rowId = accept(`${group}_${tier[1].toLowerCase()}_${tier[2].toLowerCase()}`);
    if (rowId) return { rowId, evidence: "item-id-tier" };
  }

  // These grades each have exactly one non-seasonal row per equipment group in
  // TLItemCombatPower. Grades A and AA remain unresolved because multiple rows
  // are possible and no foreign key selects between them.
  const unambiguousGrade = {
    "EItemGrade::kC": "c",
    "EItemGrade::kB": "b",
    "EItemGrade::kAAA": "aaa",
  }[sourceRecord?.item_grade];
  if (unambiguousGrade) {
    const prefix = `${group}_${unambiguousGrade}_`;
    const candidates = rowSet
      ? [...rowSet].filter((rowId) => rowId.startsWith(prefix) && /_t\d+$/i.test(rowId))
      : [`${prefix}t1`];
    if (candidates.length === 1) return { rowId: candidates[0], evidence: "source-unambiguous-grade" };
  }
  return { rowId: null, evidence: "unresolved" };
}

export function inferItemCombatPowerRowId(item, availableRows = null, sourceRecord = null) {
  return inferItemCombatPowerMapping(item, availableRows, sourceRecord).rowId;
}

export function listPower(row, field, index) {
  const values = row?.[field];
  if (!Array.isArray(values) || !Number.isInteger(index) || index < 0 || index >= values.length) return null;
  return Number(values[index]?.CombatPower ?? 0);
}

export function decodedItemPower(row, selection = {}, options = {}) {
  if (!row) return null;
  const itemPotentialMode = options.itemPotentials ?? "excluded";
  if (!new Set(["excluded", "decoded-analysis"]).has(itemPotentialMode)) {
    throw new RangeError(`Unknown Item Potential Combat Power mode: ${String(itemPotentialMode)}`);
  }
  const level = Number(selection.level ?? 0);
  const enchantIndex = row.ItemEnchantCombatPowerList?.length > 20 ? level : Number(selection.enchantLevel ?? 0);
  const traitIndex = (selection.traits ?? []).reduce((sum, trait) => sum + Number(trait.tier ?? 0), 0);
  const uniqueIndex = Number(selection.uniqueTrait?.tier ?? 0);
  const resonanceIndex = Number(selection.resonance?.[0]?.tier ?? 0);
  const components = {
    base: Number(row.BaseCombatPower ?? 0),
    enchant: listPower(row, "ItemEnchantCombatPowerList", enchantIndex) ?? 0,
    traits: listPower(row, "ItemTraitCombatPowerList", traitIndex) ?? 0,
    uniqueTrait: listPower(row, "ItemUniqueTraitCombatPowerList", uniqueIndex) ?? 0,
    resonance: listPower(row, "ItemTraitResonanceCombatPowerList", resonanceIndex) ?? 0,
    potential: itemPotentialMode === "decoded-analysis" && selection.potentialId ? Number(row.ItemPotentialCombatPower ?? 0) : 0,
  };
  return { ...components, total: Object.values(components).reduce((sum, value) => sum + value, 0) };
}

export function inferRuneCombatPowerRowId(rune) {
  const grade = GRADE_TOKEN[Number(rune?.grade)];
  if (!grade) return null;
  return rune?.runeType === "chaos" ? `rune_all_${grade}_t1` : `rune_${grade === "aa2" ? "aa" : grade}_t1`;
}

export function decodedRunePower(row, level) {
  if (!row) return null;
  return Number(row.BaseCombatPower ?? 0) + (listPower(row, "ItemEnchantCombatPowerList", Number(level ?? 0)) ?? 0);
}
