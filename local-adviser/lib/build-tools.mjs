import { loadWebDataFromFile } from "../../scripts/lib/load-web-projections.mjs";
import * as core from "../../web/tl-core.js";

const IMPORTANT_STATS = [
  "attack_power_main_hand_min", "attack_power_main_hand_max", "critical_damage_modifier",
  "double_damage_dealt_modifier", "skill_power_amplification", "all_critical_attack",
  "all_double_attack", "melee_critical_attack", "range_critical_attack", "magic_critical_attack",
  "melee_heavy_attack", "range_heavy_attack", "magic_heavy_attack", "all_accuracy",
  "melee_endurance", "range_endurance", "magic_endurance", "melee_evasion", "range_evasion",
  "magic_evasion", "melee_heavy_attack_evasion", "range_heavy_attack_evasion",
  "magic_heavy_attack_evasion", "hp_max", "damage_reduction", "attack_speed_modifier",
  "skill_cooldown_modifier", "buff_given_duration_modifier",
];

function jsonClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function unwrapBuildDocument(input) {
  let value = typeof input === "string" ? JSON.parse(input) : jsonClone(input);
  if (value?.schema === "tl-helper.armory-state") value = value.data;
  if (value?.data?.build?.equipment) value = value.data;
  if (value?.build?.equipment) {
    return { build: value.build, attributes: value.attributes ?? value.allocatedAttributes ?? {} };
  }
  if (value?.equipment) return { build: value, attributes: {} };
  throw new TypeError("Build JSON must contain build.equipment or be a raw TL Helper build.");
}

function compactSources(sources = [], limit = 8) {
  return sources.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, limit)
    .map(({ name, sourceLabel, value, type, precision, provenance }) => ({
      name: name ?? sourceLabel, value, type, precision, provenance,
    }));
}

export class TlBuildTools {
  constructor() {
    this.loaded = false;
    this.context = null;
  }

  async init(manifestPath = new URL("../../web/data/app-data.json", import.meta.url)) {
    const data = await loadWebDataFromFile(manifestPath.pathname.replace(/^\/(.:\/)/, "$1"));
    await core.initCore(data);
    this.loaded = true;
    this.gameBuild = data.gameBuild;
    return this;
  }

  setBuild(input) {
    const context = unwrapBuildDocument(input);
    this.context = context;
    return this.buildSummary(context.build, context.attributes);
  }

  clearBuild() {
    this.context = null;
  }

  requireBuild() {
    if (!this.context) throw new Error("No build is loaded. Ask the user to paste or load a TL Helper build first.");
    return this.context;
  }

  findItems(query, equipmentType = "", limit = 10) {
    const needle = String(query ?? "").trim().toLowerCase();
    if (!needle) throw new Error("query is required.");
    return core.data.items
      .filter((item) => (!equipmentType || item.equipmentType === equipmentType)
        && (item.id.toLowerCase().includes(needle) || item.name.toLowerCase().includes(needle)))
      .sort((a, b) => (b.grade ?? 0) - (a.grade ?? 0) || a.name.localeCompare(b.name))
      .slice(0, Math.max(1, Math.min(25, Number(limit) || 10)))
      .map((item) => ({ id: item.id, name: item.name, grade: item.grade, equipmentType: item.equipmentType,
        armorCategory: item.armorCategory, requiredLevel: item.requiredLevel, setId: item.setId,
        maxLevel: core.itemMaxLevel(item), hasPassive: Boolean(item.passives), availablePerkCount: item.availablePerks?.length ?? 0 }));
  }

  item(identifier) {
    const needle = String(identifier ?? "").trim().toLowerCase();
    const item = core.indexes.itemById[identifier]
      ?? core.data.items.find((row) => row.name.toLowerCase() === needle)
      ?? core.data.items.find((row) => row.name.toLowerCase().includes(needle));
    if (!item) return null;
    const level = core.itemMaxLevel(item);
    const set = item.setId ? core.indexes.itemSetById[item.setId] : null;
    return {
      id: item.id, name: item.name, grade: item.grade, equipmentType: item.equipmentType,
      armorCategory: item.armorCategory, subCategory: item.subCategory, requiredLevel: item.requiredLevel,
      maxLevel: level, maxLevelStats: {
        main: item.itemStats?.main?.[String(level)] ?? null,
        extra: item.itemStats?.extra?.[String(level)] ?? null,
      },
      set: set ? { id: set.id, name: set.name } : null,
      passives: item.passives, availablePerks: item.availablePerks,
      calculationNote: "Item Potentials are intentionally excluded from adviser calculations.",
    };
  }

  set(identifier) {
    const needle = String(identifier ?? "").trim().toLowerCase();
    const set = core.indexes.itemSetById[identifier]
      ?? [...core.data.itemSets, ...(core.data.artifactSets ?? [])].find((row) => row.name.toLowerCase() === needle)
      ?? [...core.data.itemSets, ...(core.data.artifactSets ?? [])].find((row) => row.name.toLowerCase().includes(needle));
    if (!set) return null;
    return {
      id: set.id, name: set.name, grade: set.grade,
      pieces: (set.itemSetMadeOfItems ?? set.memberItemIds?.map((id) => ({ id })) ?? []).map((row) => ({
        id: row.id, name: row.name ?? core.indexes.itemById[row.id]?.name ?? row.id,
        slot: row.sub_category ?? core.indexes.itemById[row.id]?.equipmentType,
      })),
      breakpoints: (set.itemSetBonus ?? set.bonuses ?? []).map((bonus) => ({
        requiredPieces: bonus.set_count ?? bonus.count,
        stats: bonus.bonus_stat ?? bonus.stats ?? [],
        passives: bonus.bonus_passive ?? bonus.passives ?? [],
        classification: core.classifySetBreakpoint(set.id, bonus),
      })),
    };
  }

  buildSummary(build, attributes, requestedStats = IMPORTANT_STATS, includeSources = false) {
    const calculation = core.calculateBuild(build, attributes, { includeSetEffects: true });
    const wanted = new Set(requestedStats?.length ? requestedStats : IMPORTANT_STATS);
    const stats = calculation.stats.filter((row) => wanted.has(row.id)).map((row) => ({
      id: row.id, name: core.statName(row.id), total: row.total, uncappedTotal: row.uncappedTotal,
      overflow: row.overflow, hardCap: row.hardCap,
      ...(includeSources ? { sources: compactSources(row.sources) } : {}),
    }));
    const equipped = core.BUILD_SLOTS.map((slot) => {
      const selection = core.slotSelection(slot.id, build);
      const item = selection?.itemId ? core.indexes.itemById[selection.itemId] : null;
      return item ? { slotId: slot.id, slot: slot.label, itemId: item.id, item: item.name, level: selection.level,
        set: item.setId ? core.indexes.itemSetById[item.setId]?.name ?? item.setId : null } : null;
    }).filter(Boolean);
    const issues = calculation.validation?.issues ?? [];
    return {
      name: build.name, gameBuild: this.gameBuild, weapons: core.equippedWeaponTypes(build),
      equipped, allocatedAttributes: attributes, stats, setEffects: calculation.setEffects,
      calculationStatus: calculation.status,
      issues: issues.slice(0, 30),
      limitation: "Item Potentials are excluded. Conditional combat effects are only included when their required scenario is explicitly modeled.",
    };
  }

  analyzeLoadedBuild({ stat_ids = [], include_sources = true } = {}) {
    const { build, attributes } = this.requireBuild();
    return this.buildSummary(build, attributes, stat_ids.length ? stat_ids : IMPORTANT_STATS, include_sources);
  }

  compareItemForSlot({ slot_id, candidate } = {}) {
    const { build, attributes } = this.requireBuild();
    const item = this.item(candidate);
    if (!item) throw new Error(`Candidate item not found: ${candidate}`);
    const sourceSelection = core.slotSelection(slot_id, build);
    if (!sourceSelection) throw new Error(`Unknown slot: ${slot_id}`);
    const candidateItem = core.indexes.itemById[item.id];
    const compatibility = core.itemCompatibility(slot_id, candidateItem, build);
    if (!compatibility.ok) throw new Error(compatibility.reason || `${item.name} is not compatible with ${slot_id}.`);
    const before = core.calculateBuild(build, attributes, { includeSetEffects: true });
    const changed = jsonClone(build);
    const collection = core.isArtifactSlot(slot_id) ? changed.artifacts : core.isSupportSlot(slot_id) ? changed.supportSlots : changed.equipment;
    collection[slot_id] = { ...core.emptyEquipmentSelection(), itemId: candidateItem.id, level: core.itemMaxLevel(candidateItem) };
    const after = core.calculateBuild(changed, attributes, { includeSetEffects: true });
    const beforeMap = new Map(before.stats.map((row) => [row.id, row.total]));
    const deltas = after.stats.map((row) => ({ id: row.id, name: core.statName(row.id), before: beforeMap.get(row.id) ?? 0,
      after: row.total, delta: row.total - (beforeMap.get(row.id) ?? 0) }))
      .filter((row) => Math.abs(row.delta) > 1e-9)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 40);
    return {
      slotId: slot_id,
      replaced: core.indexes.itemById[sourceSelection.itemId]?.name ?? "Empty slot",
      candidate: candidateItem.name,
      candidateLevel: core.itemMaxLevel(candidateItem), deltas,
      setEffectsBefore: before.setEffects, setEffectsAfter: after.setEffects,
      calculationStatus: after.status,
      comparisonScope: "Candidate uses max item level with no traits, runes, Heroic effects, perk, or potential. Existing build configuration remains on all other slots.",
    };
  }
}
