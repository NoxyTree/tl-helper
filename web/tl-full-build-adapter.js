import * as coreDefault from "./tl-core.js";
import { loadArmoryState as loadStateDefault } from "./tl-persistence.js";
import { optimizeHeroicPotential } from "./tl-heroic-potential.js";
import { generateArtifactCandidates, generateRuneCandidates } from "./tl-optimizer-components.js";
import { optimizeFullBuild } from "./tl-full-build-optimizer.js";
import { ATTRIBUTE_BREAKPOINTS, STAT_EXPANSIONS, allocatedAttributeValue } from "./tl-questlog-rules.js";

const clone = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const totalMap = (calc) => Object.fromEntries((calc?.stats ?? []).map((row) => [row.id, Number(row.total) || 0]));
const RANK_DECAY = 0.6;

export function normalizeRankedGoals(goals = {}) {
  const source = Array.isArray(goals.priorities) && goals.priorities.length ? goals.priorities : (goals.increase ?? []);
  const unique = new Map();
  for (const [index, raw] of source.entries()) {
    const row = typeof raw === "string" ? { id: raw, rank: goals.priorities?.length ? index + 1 : 1 } : raw ?? {};
    const id = String(row.id ?? row.statId ?? "").trim();
    if (!id || unique.has(id)) continue;
    const rank = Math.max(1, Math.floor(Number(row.rank) || 1));
    const minimum = row.minimum == null || row.minimum === "" ? null : Number(row.minimum);
    unique.set(id, { id, rank, weight: RANK_DECAY ** (rank - 1), minimum: Number.isFinite(minimum) ? minimum : null });
  }
  return [...unique.values()].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
}

function terminalStatComponents(statId, seen = new Set()) {
  if (seen.has(statId)) return [];
  const children = STAT_EXPANSIONS[statId] ?? [];
  if (!children.length) return [statId];
  const next = new Set(seen).add(statId);
  return [...new Set(children.flatMap((id) => terminalStatComponents(id, next)))];
}

export function expandCompositeGoals(rankedGoals) {
  return rankedGoals.map((goal) => ({ ...goal, components: terminalStatComponents(goal.id) }));
}

function goalValue(stats, goal) {
  const components = goal.components?.length ? goal.components : [goal.id];
  const values = components.map((id) => Number(stats[id] ?? 0));
  return components.length > 1 ? Math.min(...values) : values[0];
}

function goalScoringValue(stats, goal) {
  const components = goal.components?.length ? goal.components : [goal.id];
  const values = components.map((id) => Number(stats[id] ?? 0));
  if (components.length === 1) return values[0];
  const minimum = Math.min(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return minimum * 0.95 + average * 0.05;
}

export function scoreRankedGoals(stats, baseline, scales, rankedGoals) {
  return rankedGoals.reduce((sum, goal) => sum + goal.weight
    * (goalScoringValue(stats, goal) - Number(baseline[goal.id] ?? 0))
    / Math.max(1, Math.abs(Number(scales[goal.id] ?? 0))), 0);
}

function largestNumeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? Math.abs(value) : 0;
  if (!value || typeof value !== "object") return 0;
  return Math.max(0, ...Object.values(value).map(largestNumeric));
}

function largestSourceValue(value, statId) {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return Math.max(0, ...value.map((row) => largestSourceValue(row, statId)));
  let found = 0;
  for (const [key, nested] of Object.entries(value)) {
    if (key === statId) found = Math.max(found, largestNumeric(nested));
    if ((key === "stat_id" || key === "statId") && nested === statId) {
      found = Math.max(found, largestNumeric(value.levels), largestNumeric(value.tiers), largestNumeric(value.value), largestNumeric(value.base_value), largestNumeric(value.baseValue));
    }
    if (nested && typeof nested === "object") found = Math.max(found, largestSourceValue(nested, statId));
  }
  return found;
}

export function deriveObjectiveScales(core, rankedGoals, baseline = {}) {
  const sources = [core.data?.items, core.data?.runes, core.data?.runeSynergies, core.data?.itemSets, core.data?.artifactSets, core.data?.attributeStats];
  const slotCount = Math.max(1, Number(core.EQUIPMENT_SLOTS?.length ?? 0) + Number(core.ARTIFACT_SLOTS?.length ?? 0));
  return Object.fromEntries(rankedGoals.map((goal) => {
    const components = goal.components?.length ? goal.components : [goal.id];
    const direct = Math.max(...sources.map((source) => largestSourceValue(source, goal.id)));
    const componentAverage = components.reduce((sum, id) => sum + Math.max(...sources.map((source) => largestSourceValue(source, id))), 0) / components.length;
    return [goal.id, Math.max(1, Math.abs(Number(baseline[goal.id] ?? 0)), direct * slotCount, componentAverage * slotCount)];
  }));
}

function componentWeightMap(rankedGoals, scales) {
  const weights = new Map();
  for (const goal of rankedGoals) {
    const components = goal.components?.length ? goal.components : [goal.id];
    for (const id of components) weights.set(id, Number(weights.get(id) ?? 0) + goal.weight / Math.max(1, scales[goal.id]) / components.length);
    weights.set(goal.id, Math.max(Number(weights.get(goal.id) ?? 0), goal.weight / Math.max(1, scales[goal.id])));
  }
  return weights;
}

function withCompositeTotals(stats, rankedGoals) {
  const result = { ...stats };
  for (const goal of rankedGoals) if (goal.components?.length > 1) result[goal.id] = goalValue(stats, goal);
  return result;
}

const scoreStats = (stats, rankedGoals, scales = {}) => scoreRankedGoals(stats, {}, scales, rankedGoals);
const selectionFor = (build, slot) => build.equipment?.[slot] ?? build.artifacts?.[slot] ?? build.supportSlots?.[slot];
const collectionFor = (build, slot) => slot.startsWith("talistone") || slot.startsWith("gemstone") ? build.artifacts : build.equipment;

const OPTIMIZER_STAT_DENY = new Set([
  "none", "probability", "set_count", "value",
  "attack_power_main_hand", "attack_power_main_hand_min", "attack_power_main_hand_max",
  "attack_power_off_hand", "attack_power_off_hand_min", "attack_power_off_hand_max",
  "attack_speed_main_hand",
]);

function optimizerStatIds(core) {
  const labels = core.data.statLabels ?? {};
  const found = new Set(["str", "dex", "int", "per", "con"]);
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      if (Object.hasOwn(labels, key)) found.add(key);
      if (["stat_id", "statId", "type"].includes(key) && typeof value === "string" && Object.hasOwn(labels, value)) found.add(value);
      visit(value);
    }
  };
  visit([core.data.items, core.data.runes, core.data.runeSynergies, core.data.itemSets, core.data.artifactSets]);
  const weaponTypes = new Set(core.WEAPON_TYPES ?? []);
  return [...found].filter((id) => Object.hasOwn(labels, id)
    && !OPTIMIZER_STAT_DENY.has(id)
    && !weaponTypes.has(id)
    && !/^adjust_/.test(id)
    && !["earn_weapon_mastery_exp_modifier", "gathering_critical_chance", "spend_dungeon_point_modifier"].includes(id));
}

function equippedChaosIds(build, runeById) {
  const ids = new Set();
  for (const group of [build.equipment, build.artifacts, build.supportSlots]) for (const row of Object.values(group ?? {})) {
    for (const rune of row?.runes ?? []) if (runeById[rune.runeId]?.runeType === "chaos") ids.add(rune.runeId);
  }
  return [...ids];
}

function applySelections(source, selections) {
  const build = clone(source);
  for (const [slot, selection] of Object.entries(selections)) {
    if (slot === "artifact_bundle") {
      for (const [artifactSlot, row] of Object.entries(selection.selections ?? {})) build.artifacts[artifactSlot] = clone(row);
    } else collectionFor(build, slot)[slot] = clone(selection);
  }
  return build;
}

function itemSelection(core, item) {
  return { ...core.emptyEquipmentSelection(), itemId: item.id, level: core.itemMaxLevel(item) };
}

function optimizedNormalTraits(item, rankedGoals, scales) {
  const byId = componentWeightMap(rankedGoals, scales);
  return Object.entries(item.itemStats?.traits ?? {}).map(([statId, tiers]) => {
    const values = Array.isArray(tiers) ? tiers : Object.values(tiers ?? {});
    return { statId, tier: Math.max(1, values.length), value: Number(values.at(-1) ?? 0) };
  }).sort((a, b) => Number(byId.get(b.statId) ?? 0) * b.value - Number(byId.get(a.statId) ?? 0) * a.value || a.statId.localeCompare(b.statId)).slice(0, 3).map(({ statId, tier }) => ({ statId, tier }));
}

function itemName(core, selection) {
  return core.indexes.itemById[selection?.itemId]?.name ?? "Empty";
}

export function resolveWeaponTypeConstraints(core, request = {}) {
  const raw = request.weaponTypes ?? request.rules?.weaponTypes
    ?? ((request.mainWeaponType || request.offWeaponType) ? { main_hand: request.mainWeaponType, off_hand: request.offWeaponType } : null);
  if (raw == null) return {};
  const slots = core.WEAPON_SLOTS ?? ["main_hand", "off_hand"];
  const constraints = Array.isArray(raw) ? { [slots[0]]: raw[0], [slots[1]]: raw[1] } : { [slots[0]]: raw[slots[0]] ?? raw.main, [slots[1]]: raw[slots[1]] ?? raw.off };
  const main = String(constraints[slots[0]] ?? "").trim();
  const off = String(constraints[slots[1]] ?? "").trim();
  if (!main || !off) throw new Error("Choose both a main-hand and an off-hand weapon type.");
  const legal = new Set(core.WEAPON_TYPES ?? []);
  if (!legal.has(main) || !legal.has(off)) throw new Error(`Unknown weapon type pairing: ${main || "missing"} / ${off || "missing"}.`);
  if (main === off) throw new Error("Main-hand and off-hand weapon types must be different.");
  return { [slots[0]]: main, [slots[1]]: off };
}

const ATTRIBUTE_IDS = ["str", "dex", "int", "per", "con"];

export function rawPointsForAttributeGain(requiredGain, budget = Number.MAX_SAFE_INTEGER) {
  if (requiredGain <= 0) return 0;
  const limit = Math.max(0, Math.floor(Number(budget) || 0));
  for (let raw = 0; raw <= limit; raw += 1) if (allocatedAttributeValue(raw) >= requiredGain) return raw;
  return limit + 1;
}

function balancedAllocation(budget, preferred = "") {
  const result = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, Math.floor(budget / ATTRIBUTE_IDS.length)]));
  let remainder = budget - Object.values(result).reduce((sum, value) => sum + value, 0);
  const order = preferred ? [preferred, ...ATTRIBUTE_IDS.filter((id) => id !== preferred)] : ATTRIBUTE_IDS;
  for (let index = 0; remainder > 0; index = (index + 1) % order.length, remainder -= 1) result[order[index]] += 1;
  return result;
}

function allocationKey(allocation) {
  return ATTRIBUTE_IDS.map((id) => allocation[id]).join("|");
}

function activeAttributeBreakpoints(core, calc) {
  const grouped = new Map();
  for (const stat of calc.stats ?? []) for (const source of stat.sources ?? []) {
    if (source.type !== "attribute_bracket") continue;
    const match = String(source.sourceLabel ?? source.name ?? "").match(/^([A-Z]+) \((\d+)\):/);
    if (!match) continue;
    const attributeId = match[1].toLowerCase();
    const threshold = Number(match[2]);
    const key = `${attributeId}:${threshold}`;
    if (!grouped.has(key)) grouped.set(key, { attributeId, attributeName: core.statName(attributeId), threshold, bonuses: [] });
    grouped.get(key).bonuses.push({ statId: stat.id, name: core.statName(stat.id), value: Number(source.value), formattedValue: core.formatStat(stat.id, Number(source.value)) });
  }
  return [...grouped.values()].sort((a, b) => ATTRIBUTE_IDS.indexOf(a.attributeId) - ATTRIBUTE_IDS.indexOf(b.attributeId) || a.threshold - b.threshold);
}

function satisfiesProtectedStats(stats, protectedStats) {
  return Object.entries(protectedStats).every(([id, rule]) => {
    const value = Number(stats[id] ?? 0);
    if (rule.min != null && value < Number(rule.min)) return false;
    return rule.baseline == null || value >= Number(rule.baseline) * (1 - Number(rule.allowedLossPercent ?? 0) / 100);
  });
}

export function optimizeAttributeAllocation({ core, build, budget, rankedGoals, baseline, scales, includeSetEffects = true, minimums = {} }) {
  if (!Number.isInteger(budget) || budget < 0) throw new RangeError("attributePointBudget must be a nonnegative integer.");
  const zero = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0]));
  const zeroCalc = core.calculateBuild(build, zero, { includeSetEffects });
  const zeroTotals = totalMap(zeroCalc);
  const seeds = new Map();
  const add = (allocation) => seeds.set(allocationKey(allocation), allocation);
  add(balancedAllocation(budget));
  const breakpointRequirements = [];
  for (const id of ATTRIBUTE_IDS) {
    add({ ...zero, [id]: budget });
    add(balancedAllocation(budget, id));
    for (const threshold of Object.keys(ATTRIBUTE_BREAKPOINTS[id] ?? {}).map(Number)) {
      const needed = rawPointsForAttributeGain(threshold - Number(zeroTotals[id] ?? 0), budget);
      if (needed > budget) continue;
      const allocation = balancedAllocation(budget - needed);
      allocation[id] += needed;
      add(allocation);
      const bonuses = ATTRIBUTE_BREAKPOINTS[id][threshold] ?? {};
      const relevance = rankedGoals.reduce((sum, goal) => sum + (bonuses[goal.id] == null ? 0 : goal.weight * Math.abs(Number(bonuses[goal.id])) / Math.max(1, Number(scales[goal.id] ?? 1))), 0)
        + Object.keys(minimums).reduce((sum, statId) => sum + (bonuses[statId] == null ? 0 : 1), 0);
      if (relevance > 0) breakpointRequirements.push({ id, threshold, needed, relevance });
    }
  }
  // Preserve complementary milestone builds, bounded to the twelve most
  // relevant individual breakpoints before creating cross-attribute pairs.
  const pairPool = breakpointRequirements.sort((a, b) => b.relevance - a.relevance || a.needed - b.needed || a.id.localeCompare(b.id) || a.threshold - b.threshold).slice(0, 12);
  for (let first = 0; first < pairPool.length; first += 1) for (let second = first + 1; second < pairPool.length; second += 1) {
    const left = pairPool[first];
    const right = pairPool[second];
    if (left.id === right.id || left.needed + right.needed > budget) continue;
    const allocation = balancedAllocation(budget - left.needed - right.needed);
    allocation[left.id] += left.needed;
    allocation[right.id] += right.needed;
    add(allocation);
  }
  const evaluate = (attributes) => {
    const calc = core.calculateBuild(build, attributes, { includeSetEffects });
    const stats = withCompositeTotals(totalMap(calc), rankedGoals);
    const violations = Object.entries(minimums).reduce((sum, [id, minimum]) => sum + Math.max(0, Number(minimum) - Number(stats[id] ?? 0)) / Math.max(1, Math.abs(Number(scales[id] ?? minimum))), 0);
    return { attributes, calc, stats, violations, score: scoreRankedGoals(stats, baseline, scales, rankedGoals), key: allocationKey(attributes) };
  };
  const compare = (a, b) => a.violations - b.violations || b.score - a.score || a.key.localeCompare(b.key);
  let best = [...seeds.values()].map(evaluate).sort(compare)[0];
  // A small deterministic coordinate ascent catches useful splits between the
  // breakpoint seeds without turning attributes into an exhaustive search.
  for (let round = 0; round < 4; round += 1) {
    const neighbors = [];
    for (const from of ATTRIBUTE_IDS) if (best.attributes[from] > 0) for (const to of ATTRIBUTE_IDS) if (to !== from) {
      neighbors.push(evaluate({ ...best.attributes, [from]: best.attributes[from] - 1, [to]: best.attributes[to] + 1 }));
    }
    const next = [best, ...neighbors].sort(compare)[0];
    if (next.key === best.key) break;
    best = next;
  }
  return { ...best, activeAttributeBreakpoints: activeAttributeBreakpoints(core, best.calc) };
}

/** Browser adapter. Dependencies are injectable to keep the boundary testable. */
export async function createOptimizerAdapter(deps = {}) {
  const core = deps.core ?? coreDefault;
  const storage = deps.storage ?? globalThis.localStorage;
  const fetcher = deps.fetch ?? globalThis.fetch?.bind(globalThis);
  const runAttributeOptimizer = deps.optimizeAttributeAllocation ?? optimizeAttributeAllocation;
  if (!core.data) await core.initCore(deps.dataSource ?? "./data/app-data.json");

  const wrap = (payload, attributes = {}) => ({ build: payload.build ?? payload, attributes: payload.attributes ?? attributes, name: payload.build?.name ?? payload.name, sourceKind: payload.sourceKind ?? "armory" });
  const calculate = (wrapped, includeSetEffects = true) => core.calculateBuild(wrapped.build, wrapped.attributes ?? {}, { includeSetEffects });

  return {
    async listWeaponTypes() {
      return (core.WEAPON_TYPES ?? []).map((id) => ({ id, name: core.label?.(id) ?? id })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },

    async createScratchBuild({ name = "New optimized build", attributes = {} } = {}) {
      const build = core.createInitialBuild();
      build.name = name;
      return wrap({ build, attributes: { str: 0, dex: 0, int: 0, per: 0, con: 0, ...attributes }, name, sourceKind: "scratch" });
    },

    async loadArmoryBuild() {
      const loaded = (deps.loadArmoryState ?? loadStateDefault)(storage, { currentGameBuild: core.data.gameBuild });
      if (!loaded?.ok) return null;
      return wrap(loaded.data);
    },

    async importQuestlogBuild(url) {
      if (!fetcher) throw new Error("Questlog import requires fetch support.");
      const response = await fetcher(`/api/questlog/character?url=${encodeURIComponent(url)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error ?? `Questlog import failed (${response.status}).`);
      const requested = payload.buildId == null ? null : String(payload.buildId);
      const raw = (payload.characterData?.builds ?? []).find((row) => requested == null || String(row.id) === requested);
      if (!raw) throw new Error("Questlog returned no matching build.");
      const build = { ...raw, equipment: Object.fromEntries(Object.entries(raw.equipment ?? {}).map(([id, row]) => [id, row ? { ...row, itemLevel: row.itemLevel ?? row.enhLvl } : row])) };
      const skillBuild = payload.skillData?.builds?.find((row) => String(row.id) === String(build.skillBuildId));
      const masteryBuild = payload.masteryData?.builds?.find((row) => String(row.id) === String(build.weaponSpecializationBuildId));
      return wrap(core.importQuestlogBuild({ characterData: payload.characterData, build, skillBuild, masteryBuild }));
    },

    async listStats() {
      return optimizerStatIds(core).map((id) => ({ id, name: core.statName(id) })).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    },

    async optimize(request, runtime = {}) {
      const source = wrap(request.build);
      const scratch = request.sourceKind === "scratch" || request.build?.sourceKind === "scratch";
      const rules = request.rules ?? {};
      const goals = request.goals ?? { increase: [], protect: [] };
      const rankedGoals = expandCompositeGoals(normalizeRankedGoals(goals));
      const weaponTypeConstraints = resolveWeaponTypeConstraints(core, request);
      const attributePointBudget = request.attributePointBudget;
      if (attributePointBudget != null && (!scratch || !Number.isInteger(attributePointBudget) || attributePointBudget < 0)) {
        throw new RangeError(!scratch ? "attributePointBudget is only supported for scratch builds." : "attributePointBudget must be a nonnegative integer.");
      }
      const baseline = withCompositeTotals(totalMap(calculate(source, rules.includeSetEffects !== false)), rankedGoals);
      const slots = core.EQUIPMENT_SLOTS.map((row) => row.id);
      const lockedIndexes = new Set((request.locks ?? []).filter((value) => Number.isInteger(Number(value))).map(Number));
      const lockedSlotIds = new Set(request.lockedSlotIds ?? []);
      const candidatesBySlot = {};
      const cap = request.depth === "thorough" ? 18 : 8;
      const contribution = (slot, selection) => core.slotSelectionContribution(slot, selection, source.build, source.attributes, { includeSetEffects: false });
      const generationScales = request.objectiveScales && typeof request.objectiveScales === "object"
        ? Object.fromEntries(rankedGoals.map(({ id }) => [id, Math.max(1, Math.abs(Number(request.objectiveScales[id] ?? 0))) ]))
        : deriveObjectiveScales(core, rankedGoals, baseline);
      const weight = (stats) => scoreStats(stats, rankedGoals, generationScales);
      const chaosOwned = equippedChaosIds(source.build, core.indexes.runeById);
      const candidateMeta = (slot, item) => ({
        heroicGroup: item?.grade === core.HEROIC_GRADE ? core.heroicSlotGroupForSlot(slot) : "",
        weaponType: core.WEAPON_SLOTS.includes(slot) ? item?.equipmentType ?? "" : "",
        setKeys: item?.setId ? [item.setId] : [],
        neutralHeroicCost: item?.grade === core.HEROIC_GRADE ? 1 : 0,
        neutralItemLevel: item ? core.itemMaxLevel(item) : 0,
        neutralGrade: Number(item?.grade ?? 0),
      });
      const runeCandidatesByCategory = new Map();

      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const slot = slots[slotIndex];
        const current = selectionFor(source.build, slot);
        const currentItem = core.indexes.itemById[current?.itemId];
        const requiredWeaponType = weaponTypeConstraints[slot];
        const keepCurrentHeroic = !scratch && rules.keepCurrentHeroics && !rules.reconsiderHeroics && currentItem?.grade === core.HEROIC_GRADE;
        if (lockedIndexes.has(slotIndex) || lockedSlotIds.has(slot) || keepCurrentHeroic) {
          if (requiredWeaponType && currentItem?.equipmentType !== requiredWeaponType) throw new Error(`Locked ${core.slotById(slot).label ?? slot} does not match the chosen ${requiredWeaponType} weapon type.`);
          candidatesBySlot[slot] = [{ id: current.itemId || `empty:${slot}`, selection: clone(current), stats: contribution(slot, current), locked: true, ...candidateMeta(slot, currentItem) }];
          continue;
        }
        const rows = [];
        for (const item of core.slotItems(core.slotById(slot))) {
          if (requiredWeaponType && item.equipmentType !== requiredWeaponType) continue;
          let selection = itemSelection(core, item);
          if (rules.optimizeThreeTraits && item.grade !== core.HEROIC_GRADE) selection.traits = optimizedNormalTraits(item, rankedGoals, generationScales);
          if (!scratch && rules.keepCurrentHeroics && !rules.reconsiderHeroics && item.grade === core.HEROIC_GRADE && item.id !== current?.itemId) continue;
          if (rules.bestHeroicConfiguration && item.grade === core.HEROIC_GRADE) {
            selection = { ...selection, ...optimizeHeroicPotential(item, { frontierLimit: 4, evaluate: (candidate) => weight(contribution(slot, { ...selection, ...candidate })) }).selection };
          }
          if (rules.runes?.mode === "keep") selection.runes = clone(current?.runes ?? []);
          else if (rules.runes?.mode && rules.runes.mode !== "keep") {
            const category = core.runeCategoryForSlot(slot);
            const chaosMode = rules.runes.mode === "normal" ? "none" : rules.runes.allowUnownedChaos ? "all" : "owned";
            let runeRows = runeCandidatesByCategory.get(category);
            if (!runeRows) {
              const goalWeights = componentWeightMap(rankedGoals, generationScales);
              runeRows = generateRuneCandidates({ category, runes: core.data.runes, runeSynergies: core.data.runeSynergies, chaos: { mode: chaosMode, ownedIds: chaosOwned }, scoreStat: (id, value) => Number(goalWeights.get(id) ?? 0) * value, limit: 4 });
              runeCandidatesByCategory.set(category, runeRows);
            }
            if (runeRows[0]) selection.runes = runeRows[0].selection;
          }
          const stats = contribution(slot, selection);
          rows.push({ id: item.id, selection, stats, scoreHint: weight(stats), ...candidateMeta(slot, item) });
        }
        const currentRow = { id: current?.itemId || `empty:${slot}`, selection: clone(current), stats: contribution(slot, current), scoreHint: weight(contribution(slot, current)), ...candidateMeta(slot, currentItem) };
        const ranked = rows.sort((a, b) => b.scoreHint - a.scoreHint
          || a.neutralHeroicCost - b.neutralHeroicCost
          || b.neutralItemLevel - a.neutralItemLevel
          || b.neutralGrade - a.neutralGrade
          || a.id.localeCompare(b.id));
        const weaponTypeSeeds = core.WEAPON_SLOTS.includes(slot)
          ? ranked.filter((row, index, all) => all.findIndex((other) => other.weaponType === row.weaponType && !other.heroicGroup) === index && !row.heroicGroup)
          : [];
        const attributeSeeds = attributePointBudget == null ? [] : ATTRIBUTE_IDS.flatMap((attributeId) => [...ranked]
          .sort((a, b) => Number(b.stats?.[attributeId] ?? 0) - Number(a.stats?.[attributeId] ?? 0) || a.id.localeCompare(b.id)).slice(0, 2));
        const retained = [...ranked.slice(0, cap), ...ranked.filter((row) => row.setKeys.length || row.heroicGroup), ...weaponTypeSeeds, ...attributeSeeds];
        candidatesBySlot[slot] = [...(scratch ? [] : [currentRow]), ...retained].filter((row, index, all) => all.findIndex((x) => x.id === row.id) === index);
      }

      if (rules.artifacts?.mode && rules.artifacts.mode !== "keep") {
        const goalWeights = componentWeightMap(rankedGoals, generationScales);
        const bundles = generateArtifactCandidates({ items: core.data.items, artifactSets: core.data.artifactSets, scoreItem: (item) => weight(core.itemStatContribution(item, item.equipmentType, core.itemMaxLevel(item), source.build, source.attributes)), scoreStat: (id, value) => Number(goalWeights.get(id) ?? 0) * value, limit: request.depth === "thorough" ? 32 : 12 });
        candidatesBySlot.artifact_bundle = bundles.map((row) => ({ id: row.key, selection: row, scoreHint: row.score, stateKeys: row.setState.map((set) => `${set.setId}:${set.count}`) }));
        slots.push("artifact_bundle");
      }

      const objectiveBaseline = request.objectiveBaseline && typeof request.objectiveBaseline === "object"
        ? Object.fromEntries(Object.entries(request.objectiveBaseline).map(([id, value]) => [id, Number(value) || 0]))
        : baseline;
      const objectiveScales = generationScales;
      for (const rows of Object.values(candidatesBySlot)) for (const row of rows) row.scoreHint = scoreRankedGoals(row.stats ?? {}, {}, objectiveScales, rankedGoals);
      const protectedStats = Object.fromEntries((goals.protect ?? []).map((id) => [id, { baseline: baseline[id] ?? 0, allowedLossPercent: Number(request.protectTolerancePct ?? 0) }]));
      for (const goal of rankedGoals) if (goal.minimum != null) protectedStats[goal.id] = { ...(protectedStats[goal.id] ?? {}), min: goal.minimum };
      const attributeMinimums = Object.fromEntries(Object.entries(protectedStats).map(([id, rule]) => [id, rule.min ?? Number(rule.baseline ?? 0) * (1 - Number(rule.allowedLossPercent ?? 0) / 100)]));
      const attributePoolSize = request.depth === "thorough" ? 64 : 48;
      const provisionalAttributes = attributePointBudget == null ? source.attributes : balancedAllocation(attributePointBudget);
      const beamWeights = Object.fromEntries(componentWeightMap(rankedGoals, objectiveScales));
      const beamGoalStats = [...new Set(rankedGoals.flatMap((goal) => goal.components?.length ? goal.components : [goal.id]))];
      let search = await optimizeFullBuild({ candidatesBySlot, slotOrder: slots, evaluate: (selections) => {
        const build = applySelections(source.build, selections);
        const calc = core.calculateBuild(build, provisionalAttributes, { includeSetEffects: rules.includeSetEffects !== false });
        const stats = withCompositeTotals(totalMap(calc), rankedGoals);
        return { score: scoreRankedGoals(stats, objectiveBaseline, objectiveScales, rankedGoals), stats, build, attributes: provisionalAttributes, activeAttributeBreakpoints: activeAttributeBreakpoints(core, calc) };
      }, lockedSlots: {}, heroicCaps: { weapon: 1, armor: 1, accessory: 1 }, distinctWeaponTypes: true, isPartialLegal: (selections, candidate) => {
        const itemId = candidate.selection?.itemId;
        if (!itemId) return true;
        return !Object.values(selections).some((selection) => selection?.itemId === itemId);
      }, weights: beamWeights, paretoStats: attributePointBudget == null ? beamGoalStats : [...beamGoalStats, ...ATTRIBUTE_IDS], protectedStats: attributePointBudget == null ? protectedStats : {}, beamWidth: request.depth === "thorough" ? 1000 : 300, alternativeCount: attributePointBudget == null ? 4 : attributePoolSize, signal: runtime.signal, onProgress: (row) => runtime.onProgress?.({ percent: row.phase === "search" ? 5 + (attributePointBudget == null ? 45 : 30) * row.completedSlots / row.totalSlots : (attributePointBudget == null ? 50 : 35) + (attributePointBudget == null ? 50 : 25) * row.completed / row.total, label: row.phase === "search" ? "Searching legal loadouts" : "Calculating preliminary finalists", detail: `${row.searched ?? row.completed ?? 0} combinations processed` }) });
      if (attributePointBudget != null) {
        const exact = [];
        for (let index = 0; index < search.alternatives.length; index += 1) {
          if (runtime.signal?.aborted) throw new DOMException("Full-build optimization cancelled", "AbortError");
          const candidate = search.alternatives[index];
          const optimized = runAttributeOptimizer({ core, build: candidate.evaluation.build, budget: attributePointBudget, rankedGoals, baseline: objectiveBaseline, scales: objectiveScales, includeSetEffects: rules.includeSetEffects !== false, minimums: attributeMinimums });
          if (satisfiesProtectedStats(optimized.stats, protectedStats)) exact.push({ ...candidate, evaluation: { ...candidate.evaluation, score: optimized.score, stats: optimized.stats, attributes: optimized.attributes, activeAttributeBreakpoints: optimized.activeAttributeBreakpoints } });
          runtime.onProgress?.({ percent: 60 + 40 * (index + 1) / search.alternatives.length, label: "Optimizing attribute points", detail: `${index + 1} of ${search.alternatives.length} shortlisted loadouts` });
          if (index % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const neutralTotal = (result, key) => Object.values(result.candidates).reduce((sum, candidate) => sum + Number(candidate[key] ?? 0), 0);
        exact.sort((a, b) => b.evaluation.score - a.evaluation.score
          || neutralTotal(a, "neutralHeroicCost") - neutralTotal(b, "neutralHeroicCost")
          || neutralTotal(b, "neutralItemLevel") - neutralTotal(a, "neutralItemLevel")
          || neutralTotal(b, "neutralGrade") - neutralTotal(a, "neutralGrade")
          || a.key.localeCompare(b.key));
        search = { ...search, best: exact[0] ?? null, alternatives: exact.slice(0, 4), attributeFinalistsEvaluated: search.alternatives.length };
      }
      if (!search.best) throw new Error("No build satisfies the protected-stat constraints.");
      const best = search.best;
      const finalStats = best.evaluation.stats;
      const goalResults = rankedGoals.map((goal) => {
        const value = goalValue(finalStats, goal);
        const delta = value - Number(objectiveBaseline[goal.id] ?? 0);
        const normalizedContribution = goal.weight * delta / objectiveScales[goal.id];
        const components = goal.components.map((id) => ({ id, name: core.statName(id), value: Number(finalStats[id] ?? 0), formattedValue: core.formatStat(id, Number(finalStats[id] ?? 0)) }));
        return { ...goal, name: core.statName(goal.id), value, formattedValue: core.formatStat(goal.id, value), delta, scale: objectiveScales[goal.id], normalizedContribution, formattedMinimum: goal.minimum == null ? null : core.formatStat(goal.id, goal.minimum), minimumMet: goal.minimum == null ? null : value >= goal.minimum, components };
      });
      const tradeoffs = goalResults.filter((goal) => goal.delta < 0).map((goal) => ({ id: goal.id, name: goal.name, delta: goal.delta, rank: goal.rank, text: `${goal.name} is ${Math.abs(goal.delta)} below the fixed objective baseline.` }));
      const allStats = Object.entries(finalStats).map(([id, value]) => ({ id, name: core.statName(id), value, formattedValue: core.formatStat(id, value), group: core.statPageFor(id) }))
        .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      const describe = (slot, selection) => {
        const item = core.indexes.itemById[selection?.itemId];
        return { id: slot.id, label: slot.label, name: item?.name ?? "Empty", imageUrl: item?.imageUrl ?? "", grade: item?.grade ?? 0, color: item ? core.gradeColor(item.grade) : "#8a795f", level: selection?.level ?? 0, selection: clone(selection ?? {}) };
      };
      const equipmentLoadout = core.EQUIPMENT_SLOTS.map((slot) => describe(slot, best.selections[slot.id]));
      const artifactLoadout = core.ARTIFACT_SLOTS.map((slot) => describe(slot, best.evaluation.build.artifacts?.[slot.id]));
      const outputSlots = [...core.EQUIPMENT_SLOTS, ...core.ARTIFACT_SLOTS].map((slot) => {
        const recommendedSelection = best.selections[slot.id] ?? best.evaluation.build.artifacts?.[slot.id];
        const currentSelection = selectionFor(source.build, slot.id);
        const candidate = best.candidates[slot.id];
        const directGoals = rankedGoals.filter(({ id }) => Math.abs(Number(candidate?.stats?.[id] ?? 0)) > 1e-9);
        const reason = recommendedSelection?.itemId === currentSelection?.itemId && !scratch ? "Kept"
          : directGoals.length ? `Directly contributes to ${directGoals.map((goal) => core.statName(goal.id)).join(", ")}`
            : candidate?.setKeys?.length ? "Selected for its set-aware contribution"
              : "Neutral fallback: conserves Heroic allowances, then prefers item level and grade";
        return { slotId: slot.id, slot: slot.label, current: scratch ? null : { name: itemName(core, currentSelection) }, recommended: { name: itemName(core, recommendedSelection) }, reason, neutralFallback: !directGoals.length && !candidate?.setKeys?.length };
      });
      return {
        name: scratch ? "Optimized build from scratch" : "Optimized full build", sourceKind: scratch ? "scratch" : "existing", score: best.evaluation.score, scoreLabel: best.evaluation.score.toFixed(3), slots: outputSlots, loadout: { equipment: equipmentLoadout, artifacts: artifactLoadout },
        statDeltas: [...new Set([...rankedGoals.map(({ id }) => id), ...(goals.protect ?? [])])].map((id) => ({ id, name: core.statName(id), delta: (finalStats[id] ?? 0) - (objectiveBaseline[id] ?? 0) })),
        explanations: ["Finalists were recalculated through the complete build calculator.", rules.includeSetEffects === false ? "Set effects were excluded." : "Known set effects were included.", ...goalResults.map((goal) => `${goal.name}: ${goal.value} at priority ${goal.rank}; normalized contribution ${goal.normalizedContribution >= 0 ? "+" : ""}${goal.normalizedContribution.toFixed(3)}${goal.components.length > 1 ? `; components ${goal.components.map((row) => `${row.name} ${row.formattedValue}`).join(", ")}` : ""}${goal.minimum == null ? "" : `; minimum ${goal.minimum} ${goal.minimumMet ? "met" : "not met"}`}.`), ...(tradeoffs.length ? tradeoffs.map((row) => `Tradeoff: ${row.text}`) : ["No selected goal finished below the fixed objective baseline."])],
        assumptions: [...(scratch ? [attributePointBudget == null ? "Built from a naked level baseline with no allocated attribute points." : `${attributePointBudget} available attribute point${attributePointBudget === 1 ? " was" : "s were"} redistributed across STR, DEX, INT, PER, and CON.`, "This is a theoretical catalogue build. Ownership and acquisition cost are not scored."] : []), "Exactly three normal rune sockets are considered; normal rune rows may repeat.", "No more than one Chaos rune is used per item."],
        warnings: ["This is a bounded search, so the result is the best loadout found rather than proof of the mathematical global optimum.", ...(rules.runes?.mode === "chaos" && !rules.runes.allowUnownedChaos ? [`Chaos suggestions are restricted to ${chaosOwned.length} equipped-owned rune ID(s).`] : [])],
        alternatives: search.alternatives.slice(1).map((row, index) => ({ name: `Alternative ${index + 1}`, summary: `Fit ${row.evaluation.score.toFixed(3)}`, score: row.evaluation.score })),
        build: best.evaluation.build,
        attributes: clone(best.evaluation.attributes ?? source.attributes ?? {}),
        optimizedAttributes: attributePointBudget == null ? null : clone(best.evaluation.attributes),
        attributePointBudget: attributePointBudget ?? null,
        activeAttributeBreakpoints: clone(best.evaluation.activeAttributeBreakpoints ?? []),
        attributeFinalistsEvaluated: search.attributeFinalistsEvaluated ?? 0,
        objectiveBaseline: clone(objectiveBaseline),
        objectiveScales: clone(objectiveScales),
        goalResults,
        tradeoffs,
        allStats,
      };
    },
  };
}

export default createOptimizerAdapter;
