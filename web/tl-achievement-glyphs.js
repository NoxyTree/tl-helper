// Category glyphs for the achievements page. Every glyph is an icon the game
// itself ships (mirrored locally by scripts/mirror-icons.mjs) chosen for a
// confident thematic match — Adena for Currency, guardian-stone dungeon art
// for dungeon categories, cooked dishes for Cooking. Categories without an
// honest match return null and the page renders a letter-monogram disc
// instead; never substitute loosely related art here, a wrong glyph is worse
// than a monogram. scripts/tests/achievement-glyphs.test.mjs pins every
// referenced file to disk and every category name to the current data.
const ICONS = "assets/icons/Game/Image";

export const ACHIEVEMENT_CATEGORY_GLYPHS = {
  "Cooking": `${ICONS}/Icon/Item_128/Usable/I_food_result_001.webp`,
  "Fishing": `${ICONS}/Icon/Item_128/Usable/I_food_fish_001.webp`,
  "Gathering": `${ICONS}/Icon/Item_128/Misc/I_material_food_sub_002.webp`,
  "Currency": `${ICONS}/Icon/Item_128/ETC/ICO_Adena.webp`,
  "Growth": `${ICONS}/Icon/Item_128/Usable/I_Fruits_of_Growth_001.webp`,
  "Items": `${ICONS}/Icon/Item_128/Equip/Armor/P_Set_PL_M_TS_00014B.webp`,
  "Dynamic Event": `${ICONS}/Icon/Item_128/Usable/I_Buff_Event_001.webp`,
  "Events": `${ICONS}/Icon/Item_128/Usable/I_Buff_Event_002.webp`,
  "Co-Op Dungeon": `${ICONS}/Icon/Item_128/Misc/Perk_GT_aa_Dungeon_01.webp`,
  "Co-Op Dungeon: Challenge": `${ICONS}/Icon/Item_128/Misc/Perk_GT_aa_Dungeon_02.webp`,
  "Secret Dungeon": `${ICONS}/Icon/Item_128/Misc/Perk_GT_aa_Dungeon_03.webp`,
  "Tower of Greed": `${ICONS}/Icon/Item_128/Misc/Perk_GT_aa_Dungeon_04.webp`,
  "Raid": `${ICONS}/Icon/Item_128/Misc/Perk_GT_aa_StoneGuard_ArchBoss_01.webp`,
  "Raid: Challenge": `${ICONS}/Icon/Item_128/Misc/Perk_GT_aa_StoneGuard_ArchBoss_02.webp`,
  "Stonegard": `${ICONS}/Icon/Item_128/Misc/Perk_GT_aa_StoneGuard_FieldBoss_01.webp`,
  "Talandre": `${ICONS}/Icon/Item_128/Misc/Perk_GT_aa_Tolandre_FieldBoss_01.webp`,
  "PvP Combat": `${ICONS}/Skill/Active/S_WP_DA_DeadlyStrike_AA.webp`,
  "Battlegrounds": `${ICONS}/Skill/Active/S_WP_SW_SH_S_ShieldThrow.webp`,
};

// Returns the glyph icon path for a category, or null when the page should
// fall back to its letter-monogram disc.
export function achievementCategoryGlyph(category) {
  return ACHIEVEMENT_CATEGORY_GLYPHS[String(category ?? "")] ?? null;
}
