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

export function inferItemCombatPowerRowId(item, availableRows = null) {
  const group = combatPowerGroup(item);
  if (!group) return null;
  const rowSet = availableRows ? new Set(availableRows) : null;
  const accept = (candidate) => !rowSet || rowSet.has(candidate) ? candidate : null;
  if (group === "talistone" || group === "gemstone") {
    const grade = GRADE_TOKEN[Number(item.grade)];
    return grade ? accept(`${group}_${grade}_t1`) : null;
  }
  const id = String(item.id ?? "");
  const seasonal = id.match(/_(a|aa)_S1(?:_|$)/i);
  if (seasonal) {
    const category = group === "weapon" ? "weapon" : (ARMOR_TYPES.has(item.equipmentType) ? "armor" : "accessory");
    return accept(`${category}_${seasonal[1].toLowerCase()}_S1`);
  }
  const tier = id.match(/_(aaa|aa3|aa2|aa|a|b|c)_(t[12])(?:_|$)/i);
  return tier ? accept(`${group}_${tier[1].toLowerCase()}_${tier[2].toLowerCase()}`) : null;
}

export function listPower(row, field, index) {
  const values = row?.[field];
  if (!Array.isArray(values) || !Number.isInteger(index) || index < 0 || index >= values.length) return null;
  return Number(values[index]?.CombatPower ?? 0);
}

export function decodedItemPower(row, selection = {}) {
  if (!row) return null;
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
    potential: selection.potentialId ? Number(row.ItemPotentialCombatPower ?? 0) : 0,
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
