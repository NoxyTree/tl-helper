import * as coreDefault from "./tl-core.js";
import { loadArmoryState as loadStateDefault } from "./tl-persistence.js";
import { optimizeHeroicPotential } from "./tl-heroic-potential.js";
import { generateArtifactCandidates, generateRuneCandidates } from "./tl-optimizer-components.js";
import { optimizeFullBuild } from "./tl-full-build-optimizer.js";
import { optimizeScratchProgression } from "./tl-progression-optimizer.js";
import { ATTRIBUTE_BREAKPOINTS, SET_PASSIVE_RULES, STAT_EXPANSIONS, STAT_HARD_CAPS, allocatedAttributeValue } from "./tl-questlog-rules.js";
import { evaluateScenarioEffects } from "./tl-scenario-effects.js";

const clone = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));
const totalMap = (calc) => Object.fromEntries((calc?.scenarioStats ?? calc?.stats ?? []).map((row) => [row.id, Number(row.total) || 0]));
// Ranked goals are intentionally near-lexicographic. A lower-ranked objective
// should refine a build, not erase the stat named as the player's first
// priority during candidate pruning or final scoring.
const RANK_DECAY = 0.05;

export function normalizeRankedGoals(goals = {}) {
  const source = Array.isArray(goals.priorities) && goals.priorities.length ? goals.priorities : (goals.increase ?? []);
  const unique = new Map();
  for (const [index, raw] of source.entries()) {
    const row = typeof raw === "string" ? { id: raw, rank: goals.priorities?.length ? index + 1 : 1 } : raw ?? {};
    const id = String(row.id ?? row.statId ?? "").trim();
    if (!id || unique.has(id)) continue;
    const rank = Math.max(1, Math.floor(Number(row.rank) || 1));
    const minimum = row.minimum == null || row.minimum === "" ? null : Number(row.minimum);
    const target = row.target == null || row.target === "" ? null : Number(row.target);
    const mode = row.mode === "target" && Number.isFinite(target) ? "target"
      : row.mode === "at_least" || Number.isFinite(minimum) ? "at_least"
        : "maximize";
    const normalizedTarget = mode === "target" ? target : null;
    const normalizedMinimum = mode === "target" ? target : Number.isFinite(minimum) ? minimum : null;
    unique.set(id, { id, rank, weight: RANK_DECAY ** (rank - 1), mode, minimum: normalizedMinimum, target: normalizedTarget });
  }
  return [...unique.values()].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id));
}

export function expandCompositeGoals(rankedGoals) {
  // The calculator applies STAT_EXPANSIONS one level at a time. For example,
  // Endurance contributes to Melee, Ranged, and Magic Endurance; those typed
  // totals must not be reinterpreted as boss-only and PvP-only totals here.
  return rankedGoals.map((goal) => ({ ...goal, components: [...new Set(STAT_EXPANSIONS[goal.id] ?? [goal.id])] }));
}

function goalValue(stats, goal) {
  const components = goal.components?.length ? goal.components : [goal.id];
  const values = components.map((id) => Math.min(Number(stats[id] ?? 0), Number(STAT_HARD_CAPS[id] ?? Infinity)));
  return components.length > 1 ? Math.min(...values) : values[0];
}

function goalScoringValue(stats, goal) {
  const components = goal.components?.length ? goal.components : [goal.id];
  const values = components.map((id) => Math.min(Number(stats[id] ?? 0), Number(STAT_HARD_CAPS[id] ?? Infinity)));
  if (components.length === 1) return goal.target == null ? values[0] : Math.min(values[0], Number(goal.target));
  const minimum = Math.min(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const value = minimum * 0.95 + average * 0.05;
  return goal.target == null ? value : Math.min(value, Number(goal.target));
}

export function scoreRankedGoals(stats, baseline, scales, rankedGoals) {
  return rankedGoals.reduce((sum, goal) => sum + goal.weight
    * (goalScoringValue(stats, goal) - (goal.target == null ? Number(baseline[goal.id] ?? 0) : Math.min(Number(baseline[goal.id] ?? 0), Number(goal.target))))
    / Math.max(1, Math.abs(Number(scales[goal.id] ?? 0))), 0);
}

function objectiveStatCaps(rankedGoals) {
  const caps = { ...STAT_HARD_CAPS };
  for (const goal of rankedGoals) {
    if (goal.target == null) continue;
    for (const id of goal.components?.length ? goal.components : [goal.id]) {
      caps[id] = Math.min(Number(caps[id] ?? Infinity), Number(goal.target));
    }
    caps[goal.id] = Math.min(Number(caps[goal.id] ?? Infinity), Number(goal.target));
  }
  return caps;
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
  const sources = [core.data?.items, core.data?.runes, core.data?.runeSynergies, core.data?.itemSets, core.data?.artifactSets, core.data?.attributeStats, core.data?.masteries, core.data?.skills];
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
  visit([core.data.items, core.data.runes, core.data.runeSynergies, core.data.itemSets, core.data.artifactSets, core.data.masteries, core.data.skills]);
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

export function applySelections(source, selections) {
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

export function optimizerItemSelection(core, item, current = null) {
  const selection = itemSelection(core, item);
  // Item Potentials are excluded from scoring, but reconfiguring the same
  // item must preserve the stored roll. A different item never inherits it.
  if (item.id === current?.itemId && current?.potentialId) selection.potentialId = current.potentialId;
  return selection;
}

const INACTIVE_SELECTION_ERROR_CODES = new Set([
  "skill_type_mismatch",
  "foreign_weapon_skill",
  "foreign_weapon_mastery",
  "unknown_mastery",
  "wrong_category_mastery",
  "duplicate_unified_mastery",
  "unknown_unified_mastery",
  "wrong_category_unified_mastery",
  "perk_required_weapon_missing",
]);

export function blockingCalculationIssues(core, calculation) {
  if (calculation?.scenarioEffects?.status === "unsupported") {
    return calculation.scenarioEffects.errors.map((error) => ({
      severity: "error",
      code: error.code,
      calculationImpact: "provisional",
      message: error.message,
    }));
  }
  if (calculation?.status?.state) return calculation.status.blockingIssues ?? [];
  if (typeof core?.calculationStatus === "function") return core.calculationStatus(calculation?.validation).blockingIssues;
  return (calculation?.validation?.issues ?? [])
    .filter((issue) => issue.severity === "error" && !INACTIVE_SELECTION_ERROR_CODES.has(issue.code));
}

function perkVariants(core, item, scenario = null) {
  return core.calculableItemPerkVariants?.(item, { scenario }) ?? [{ perkId: "", perk: null, passiveId: "", requiredWeapon: "" }];
}

function itemCandidateId(itemId, selection, kind = "generated") {
  return `${itemId}::${selection?.perkId || "bare"}::${kind}`;
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

export function optimizeAttributeAllocation({ core, build, budget, rankedGoals, baseline, scales, includeSetEffects = true, minimums = {}, scenario = null }) {
  if (!Number.isInteger(budget) || budget < 0) throw new RangeError("attributePointBudget must be a nonnegative integer.");
  const zero = Object.fromEntries(ATTRIBUTE_IDS.map((id) => [id, 0]));
  const zeroCalc = core.calculateBuild(build, zero, { includeSetEffects, ...(scenario == null ? {} : { scenario }) });
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
    const calc = core.calculateBuild(build, attributes, { includeSetEffects, ...(scenario == null ? {} : { scenario }) });
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

function minimumViolation(stats, minimums, scales) {
  return Object.entries(minimums ?? {}).reduce((sum, [id, minimum]) => (
    sum + Math.max(0, Number(minimum) - Number(stats[id] ?? 0)) / Math.max(1, Math.abs(Number(scales[id] ?? minimum)))
  ), 0);
}

function diverseFinalists(rows, rankedGoals, limit = 16) {
  const retained = new Map();
  const add = (row) => { if (row) retained.set(row.key, row); };
  for (const row of rows.slice(0, 4)) add(row);
  for (const goal of rankedGoals) {
    const ordered = [...rows].sort((a, b) => goalValue(b.evaluation.stats, goal) - goalValue(a.evaluation.stats, goal) || b.evaluation.score - a.evaluation.score || a.key.localeCompare(b.key));
    for (const row of ordered.slice(0, 2)) add(row);
  }
  for (const row of rows) {
    if (retained.size >= limit) break;
    add(row);
  }
  return [...retained.values()].slice(0, limit);
}

export function refineRuneConfiguration({
  core, build, attributes, budget, rankedGoals, baseline, scales, minimums = {}, includeSetEffects = true,
  runeCandidatesByCategory, lockedSlotIds = new Set(), optimizeAttributes = optimizeAttributeAllocation, rounds = 2, scenario = null,
}) {
  let workingBuild = clone(build);
  let workingAttributes = clone(attributes ?? {});
  const rowsFor = (category) => runeCandidatesByCategory instanceof Map ? runeCandidatesByCategory.get(category) : runeCandidatesByCategory?.[category];
  const evaluateFixed = (candidateBuild, candidateAttributes) => {
    const calc = core.calculateBuild(candidateBuild, candidateAttributes, { includeSetEffects, ...(scenario == null ? {} : { scenario }) });
    const stats = withCompositeTotals(totalMap(calc), rankedGoals);
    return { calc, stats, score: scoreRankedGoals(stats, baseline, scales, rankedGoals), violations: minimumViolation(stats, minimums, scales) };
  };
  let current = evaluateFixed(workingBuild, workingAttributes);
  for (let round = 0; round < Math.max(1, rounds); round += 1) {
    let changed = false;
    for (const slot of core.EQUIPMENT_SLOTS) {
      if (lockedSlotIds.has(slot.id) || !workingBuild.equipment?.[slot.id]?.itemId) continue;
      const runeRows = rowsFor(core.runeCategoryForSlot(slot.id)) ?? [];
      if (!runeRows.length) continue;
      const currentKey = JSON.stringify(workingBuild.equipment[slot.id].runes ?? []);
      let best = { ...current, key: currentKey, runes: workingBuild.equipment[slot.id].runes ?? [] };
      for (const row of runeRows) {
        const trialBuild = clone(workingBuild);
        trialBuild.equipment[slot.id].runes = clone(row.selection);
        const trial = { ...evaluateFixed(trialBuild, workingAttributes), key: row.key, runes: row.selection };
        if (trial.violations < best.violations - 1e-12
          || (Math.abs(trial.violations - best.violations) <= 1e-12 && trial.score > best.score + 1e-12)
          || (Math.abs(trial.violations - best.violations) <= 1e-12 && Math.abs(trial.score - best.score) <= 1e-12 && trial.key.localeCompare(best.key) < 0)) best = trial;
      }
      if (JSON.stringify(best.runes) !== currentKey) {
        workingBuild.equipment[slot.id].runes = clone(best.runes);
        current = best;
        changed = true;
      }
    }
    if (!changed) break;
    const optimized = optimizeAttributes({ core, build: workingBuild, budget, rankedGoals, baseline, scales, includeSetEffects, minimums, scenario });
    workingAttributes = clone(optimized.attributes);
    current = { ...optimized, violations: minimumViolation(optimized.stats, minimums, scales) };
  }
  const finalCalc = current.calc ?? core.calculateBuild(workingBuild, workingAttributes, { includeSetEffects, ...(scenario == null ? {} : { scenario }) });
  const runeInsights = Object.entries(finalCalc.runeSynergies ?? {}).flatMap(([slotId, synergy]) => {
    const attributes = Object.entries(synergy.stats ?? {}).filter(([id, value]) => ATTRIBUTE_IDS.includes(id) && Number(value) > 0);
    if (!attributes.length) return [];
    return [{ slotId, synergyName: synergy.name, text: `${core.slotById?.(slotId)?.label ?? slotId}: ${synergy.name} supplies ${attributes.map(([id, value]) => `+${core.formatStat(id, value)} ${core.statName(id)}`).join(", ")} toward attribute milestones.` }];
  });
  return { ...current, build: workingBuild, attributes: workingAttributes, activeAttributeBreakpoints: activeAttributeBreakpoints(core, finalCalc), runeInsights };
}

function taskScenarioForBuild(core, scenario, build) {
  if (scenario == null) return null;
  return typeof core.bindCombatScenarioToBuild === "function"
    ? core.bindCombatScenarioToBuild(scenario, build)
    : scenario;
}

export function evaluateOptimizerBuildTask(core, payload, context) {
  const build = applySelections(context.sourceBuild, payload.selections);
  const scenario = taskScenarioForBuild(core, context.scenario, build);
  const calc = core.calculateBuild(build, context.attributes ?? {}, {
    includeSetEffects: context.includeSetEffects !== false,
    ...(scenario == null ? {} : { scenario }),
  });
  const stats = withCompositeTotals(totalMap(calc), context.rankedGoals);
  const blockingIssues = blockingCalculationIssues(core, calc);
  return {
    score: scoreRankedGoals(stats, context.objectiveBaseline, context.objectiveScales, context.rankedGoals),
    stats,
    build,
    attributes: context.attributes ?? {},
    activeAttributeBreakpoints: activeAttributeBreakpoints(core, calc),
    legal: blockingIssues.length === 0,
    blockingIssues,
  };
}

export function optimizeAttributeFinalistTask(core, payload, context) {
  const scenario = taskScenarioForBuild(core, context.scenario, payload.build);
  const optimized = optimizeAttributeAllocation({
    core,
    build: payload.build,
    budget: context.budget,
    rankedGoals: context.rankedGoals,
    baseline: context.baseline,
    scales: context.scales,
    includeSetEffects: context.includeSetEffects !== false,
    minimums: context.minimums,
    scenario,
  });
  const calculation = core.calculateBuild(payload.build, optimized.attributes, {
    includeSetEffects: context.includeSetEffects !== false,
    ...(scenario == null ? {} : { scenario }),
  });
  return {
    score: optimized.score,
    stats: optimized.stats,
    attributes: optimized.attributes,
    activeAttributeBreakpoints: optimized.activeAttributeBreakpoints,
    blockingIssues: blockingCalculationIssues(core, calculation),
  };
}

export function refineRuneFinalistTask(core, payload, context) {
  const scenario = taskScenarioForBuild(core, context.scenario, payload.build);
  const refined = refineRuneConfiguration({
    core,
    build: payload.build,
    attributes: payload.attributes,
    budget: context.budget,
    rankedGoals: context.rankedGoals,
    baseline: context.baseline,
    scales: context.scales,
    minimums: context.minimums,
    includeSetEffects: context.includeSetEffects !== false,
    runeCandidatesByCategory: context.runeCandidatesByCategory,
    lockedSlotIds: new Set(context.lockedSlotIds ?? []),
    scenario,
  });
  const finalScenario = taskScenarioForBuild(core, context.scenario, refined.build);
  const calculation = core.calculateBuild(refined.build, refined.attributes, {
    includeSetEffects: context.includeSetEffects !== false,
    ...(finalScenario == null ? {} : { scenario: finalScenario }),
  });
  return {
    score: refined.score,
    stats: refined.stats,
    build: refined.build,
    attributes: refined.attributes,
    activeAttributeBreakpoints: refined.activeAttributeBreakpoints,
    runeInsights: refined.runeInsights,
    blockingIssues: blockingCalculationIssues(core, calculation),
  };
}

export function optimizeProgressionFinalistTask(core, payload, context, progressionOptimizer = optimizeScratchProgression) {
  const attributes = clone(payload.attributes ?? {});
  const weapons = typeof core.equippedWeaponTypes === "function"
    ? [...core.equippedWeaponTypes(payload.build)]
    : [...new Set(context.weapons ?? [])].filter(Boolean);
  const evaluate = (build, evaluationOptions = {}) => {
    const progressionWeaponTypes = evaluationOptions.progressionWeaponTypes ?? weapons;
    const scenario = taskScenarioForBuild(core, context.scenario, build);
    return withCompositeTotals(totalMap(core.calculateBuild(build, attributes, {
      includeSetEffects: context.includeSetEffects !== false,
      ...(scenario == null ? {} : { scenario }),
      ...(progressionWeaponTypes?.length ? { progressionWeaponTypes } : {}),
    })), context.rankedGoals);
  };
  const progression = progressionOptimizer({
    core,
    build: payload.build,
    weapons,
    settings: context.settings,
    evaluate,
    score: (stats) => scoreRankedGoals(withCompositeTotals(stats, context.rankedGoals), context.baseline, context.scales, context.rankedGoals),
  });
  const scenario = taskScenarioForBuild(core, context.scenario, progression.build);
  const calculation = core.calculateBuild(progression.build, attributes, {
    includeSetEffects: context.includeSetEffects !== false,
    ...(scenario == null ? {} : { scenario }),
  });
  const stats = withCompositeTotals(totalMap(calculation), context.rankedGoals);
  const blockingIssues = blockingCalculationIssues(core, calculation);
  return {
    score: scoreRankedGoals(stats, context.baseline, context.scales, context.rankedGoals),
    stats,
    build: progression.build,
    attributes,
    activeAttributeBreakpoints: activeAttributeBreakpoints(core, calculation),
    blockingIssues,
    protectedStatsSatisfied: satisfiesProtectedStats(stats, context.protectedStats ?? {}),
    minimumsSatisfied: minimumViolation(stats, context.minimums ?? {}, context.scales) === 0,
    progression: { summary: progression.summary, settings: progression.settings },
  };
}

export function executeOptimizerTask(core, taskType, payload, context) {
  if (taskType === "evaluate_build") return evaluateOptimizerBuildTask(core, payload, context);
  if (taskType === "optimize_attributes") return optimizeAttributeFinalistTask(core, payload, context);
  if (taskType === "refine_runes") return refineRuneFinalistTask(core, payload, context);
  if (taskType === "optimize_progression") return optimizeProgressionFinalistTask(core, payload, context);
  throw new RangeError(`Unknown optimizer worker task: ${String(taskType)}`);
}

/**
 * Optimistic per-piece objective value of completing each set that appears in
 * the candidate pool. Candidate stats are generated with set effects disabled,
 * so without this a partial-set beam state carries none of the value its
 * completed set would unlock and the final beam-width cut can discard it
 * before exact evaluation (docs/set-effect-database-review-2026-07-13.md §10).
 * This is breakpoint-aware pruning that protects set routes, not a global
 * guarantee: the hint may overestimate never-completed sets, and dynamic
 * bonuses are projected against BASELINE attributes, so a threshold bonus the
 * set's own items would unlock (baseline below the threshold, final above it)
 * contributes zero hint and that route can still be pruned. Exact finalist
 * calculation remains the sole scoring authority.
 */
function scenarioEvaluatorInput(scenario) {
  if (!scenario || typeof scenario !== "object") return null;
  if (!Array.isArray(scenario.participants)) return scenario;
  const source = scenario.participants.find((row) => row?.id === scenario.source?.participantId);
  const target = scenario.participants.find((row) => row?.id === scenario.target?.participantId);
  return {
    targetDistanceMeters: Number(scenario.target?.distanceMeters),
    timeOfDay: scenario.environment?.timeOfDay ?? "unspecified",
    sourceResources: source?.resources ?? {},
    targetResources: target?.resources ?? {},
    sourceMotion: source?.motion ?? { state: "unspecified" },
    targetMotion: target?.motion ?? { state: "unspecified" },
    sourceEventHistory: source?.eventHistory ?? { state: "unspecified" },
    targetEventHistory: target?.eventHistory ?? { state: "unspecified" },
    sourceParty: source?.party ?? { state: "unspecified" },
    targetParty: target?.party ?? { state: "unspecified" },
    sourceProximity: source?.proximity ?? { state: "unspecified" },
    targetProximity: target?.proximity ?? { state: "unspecified" },
  };
}

function scenarioSetCompletionRows(set, scenario) {
  const dimensions = scenarioEvaluatorInput(scenario);
  if (!dimensions) return [];
  const source = scenario?.participants?.find((row) => row?.id === scenario.source?.participantId);
  const setBreakpoints = (set.itemSetBonus ?? [])
    .map((bonus) => `${set.id}:${Number(bonus.set_count ?? 0)}`)
    .filter((id) => !id.endsWith(":0"));
  const evaluated = evaluateScenarioEffects({
    activeSources: {
      equippedWeaponTypes: source?.equippedWeaponTypes ?? [],
      passiveSkills: [],
      masteries: [],
      masteryIds: [],
      unifiedMasteries: [],
      unifiedMasteryIds: [],
      itemEffects: [],
      setBreakpoints,
    },
    scenario: dimensions,
  });
  return evaluated.errors.length ? [] : evaluated.overlayRows;
}

export function deriveSetCompletionHints({ core, candidatesBySlot, rankedGoals, scales, baseline = {}, scenario = null }) {
  const hints = new Map();
  const setIds = new Set(Object.values(candidatesBySlot ?? {}).flatMap((rows) => rows.flatMap((row) => row.setKeys ?? [])));
  if (!setIds.size) return hints;
  // Dynamic set rules read {stat: {total}} maps; project them against the
  // baseline totals so attribute-scaled breakpoints contribute realistically.
  const totalsEnv = new Proxy({}, { get: (_, id) => ({ total: Number(baseline[id]) || 0 }) });
  const addExpanded = (stats, id, value) => {
    stats[id] = (stats[id] ?? 0) + Number(value || 0);
    for (const target of STAT_EXPANSIONS[id] ?? []) addExpanded(stats, target, value);
  };
  for (const setId of setIds) {
    const set = core.indexes?.itemSetById?.[setId] ?? (core.data?.itemSets ?? []).find((row) => row.id === setId);
    if (!set) continue;
    const stats = {};
    let pieces = 0;
    for (const bonus of set.itemSetBonus ?? []) {
      const count = Number(bonus.set_count ?? 0);
      pieces = Math.max(pieces, count);
      for (const row of bonus.bonus_stat ?? []) addExpanded(stats, row.type, row.value);
      const rule = SET_PASSIVE_RULES[set.id]?.[count];
      if (rule) try { for (const row of rule.effect(totalsEnv) ?? []) addExpanded(stats, row.statId, row.value); } catch { /* a dynamic rule that cannot evaluate against the baseline stays out of the hint */ }
    }
    // Scenario-only set value must protect the route during the same search
    // that will score it exactly. Evaluate a hypothetical full completion
    // against the canonical scenario, without activating unrelated passives,
    // masteries, or item effects. Any unsupported scenario state contributes
    // no hint and remains fail-closed at exact candidate evaluation.
    for (const row of scenarioSetCompletionRows(set, scenario)) addExpanded(stats, row.statId, row.rawValue);
    if (!pieces) continue;
    const score = scoreRankedGoals(stats, {}, scales, rankedGoals);
    if (score > 0) hints.set(setId, score / pieces);
  }
  return hints;
}

export function applySetCompletionHints({
  core, candidatesBySlot, rankedGoals, scales, baseline = {}, includeSetEffects = true, scenario = null,
}) {
  // Preserve heuristic-only value already supplied by compound candidates
  // such as artifact bundles. Ordinary candidates have no extra hint because
  // their direct value is already represented in `stats`.
  for (const rows of Object.values(candidatesBySlot ?? {})) for (const row of rows) {
    row.scoreHint = Number(row.scoreHint ?? 0);
  }
  if (!includeSetEffects) return new Map();
  const completionHints = deriveSetCompletionHints({ core, candidatesBySlot, rankedGoals, scales, baseline, scenario });
  for (const rows of Object.values(candidatesBySlot ?? {})) for (const row of rows) for (const key of row.setKeys ?? []) {
    row.scoreHint += Number(completionHints.get(key) ?? 0);
  }
  return completionHints;
}

/** Browser adapter. Dependencies are injectable to keep the boundary testable. */
export async function createOptimizerAdapter(deps = {}) {
  const core = deps.core ?? coreDefault;
  const storage = deps.storage ?? globalThis.localStorage;
  const fetcher = deps.fetch ?? globalThis.fetch?.bind(globalThis);
  const runAttributeOptimizer = deps.optimizeAttributeAllocation ?? optimizeAttributeAllocation;
  const runProgressionOptimizer = deps.optimizeScratchProgression ?? optimizeScratchProgression;
  const optimizerTaskPool = deps.optimizerTaskPool ?? null;
  const canonicalAttributeOptimizer = deps.optimizeAttributeAllocation == null;
  const canonicalProgressionOptimizer = deps.optimizeScratchProgression == null;
  if (!core.data) await core.initCore(deps.dataSource ?? "./data/app-data.json");

  const wrap = (payload, attributes = {}) => ({ build: payload.build ?? payload, attributes: payload.attributes ?? attributes, name: payload.build?.name ?? payload.name, sourceKind: payload.sourceKind ?? "armory" });
  const calculate = (wrapped, includeSetEffects = true, scenario = null) => core.calculateBuild(
    wrapped.build,
    wrapped.attributes ?? {},
    { includeSetEffects, ...(scenario == null ? {} : { scenario }) },
  );

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

    async currentStats(payload, { includeSetEffects = true, scenario = null } = {}) {
      if (!payload) return {};
      const source = wrap(payload);
      const statIds = optimizerStatIds(core);
      const goals = expandCompositeGoals(statIds.map((id) => ({ id, rank: 1, weight: 1, mode: "maximize", minimum: null, target: null })));
      const calculation = calculate(source, includeSetEffects, scenario);
      if (scenario != null) {
        const blockingIssues = blockingCalculationIssues(core, calculation);
        if (blockingIssues.length) throw new Error(`Scenario calculation is unsupported: ${blockingIssues.map((issue) => issue.message).join(" ")}`);
      }
      const totals = withCompositeTotals(totalMap(calculation), goals);
      return Object.fromEntries(statIds.map((id) => [id, {
        value: Number(totals[id] ?? 0),
        formattedValue: core.formatStat(id, Number(totals[id] ?? 0)),
      }]));
    },

    async optimize(request, runtime = {}) {
      const source = wrap(request.build);
      const scratch = request.sourceKind === "scratch" || request.build?.sourceKind === "scratch";
      const rules = request.rules ?? {};
      const scenario = request.scenario ?? null;
      const scenarioForBuild = (build, weaponTypes = null) => {
        if (scenario == null) return null;
        return typeof core.bindCombatScenarioToBuild === "function"
          ? core.bindCombatScenarioToBuild(scenario, build, weaponTypes)
          : scenario;
      };
      const scenarioOptionsForBuild = (build, weaponTypes = null) => {
        const boundScenario = scenarioForBuild(build, weaponTypes);
        return boundScenario == null ? {} : { scenario: boundScenario };
      };
      const runTaskBatch = async (taskType, payloads, context, fallback, onProgress, allowPool = true) => {
        if (allowPool && typeof optimizerTaskPool?.map === "function") {
          return optimizerTaskPool.map(taskType, payloads, {
            context,
            fallback,
            signal: runtime.signal,
            onProgress,
          });
        }
        const results = [];
        for (let index = 0; index < payloads.length; index += 1) {
          if (runtime.signal?.aborted) throw new DOMException("Full-build optimization cancelled", "AbortError");
          results.push(await fallback(payloads[index], context, index));
          onProgress?.({ completed: index + 1, total: payloads.length, workerCount: 1, mode: "sequential" });
          if (index % 4 === 3) await new Promise((resolve) => setTimeout(resolve, 0));
        }
        return results;
      };
      const goals = request.goals ?? { increase: [], protect: [] };
      const rankedGoals = expandCompositeGoals(normalizeRankedGoals(goals));
      const requestedWeaponTypeConstraints = resolveWeaponTypeConstraints(core, request);
      const weaponTypeConstraints = { ...requestedWeaponTypeConstraints };
      if (!scratch) {
        for (const slot of core.WEAPON_SLOTS ?? []) {
          const currentSelection = selectionFor(source.build, slot);
          const currentType = core.indexes.itemById[currentSelection?.itemId]?.equipmentType ?? "";
          const requestedType = requestedWeaponTypeConstraints[slot] ?? "";
          if (requestedType && requestedType !== currentType) {
            throw new Error("Changing weapon families while preserving source progression is unsupported. Use Build from Scratch for a different weapon pair.");
          }
          if (currentType) weaponTypeConstraints[slot] = currentType;
        }
      }
      const attributePointBudget = request.attributePointBudget;
      if (attributePointBudget != null && (!scratch || !Number.isInteger(attributePointBudget) || attributePointBudget < 0)) {
        throw new RangeError(!scratch ? "attributePointBudget is only supported for scratch builds." : "attributePointBudget must be a nonnegative integer.");
      }
      const sourceCalculation = calculate(source, rules.includeSetEffects !== false, scenario);
      if (!scratch) {
        const blockingIssues = blockingCalculationIssues(core, sourceCalculation);
        if (blockingIssues.length) {
          throw new Error(`Source build is not calculation-legal for optimization: ${blockingIssues.map((issue) => issue.message).join(" ")}`);
        }
      }
      let baseline = withCompositeTotals(totalMap(sourceCalculation), rankedGoals);
      let progression = null;
      if (scratch && request.progression?.enabled === true) {
        const initialScales = deriveObjectiveScales(core, rankedGoals, baseline);
        const evaluate = (build, evaluationOptions = {}) => {
          const progressionWeaponTypes = evaluationOptions.progressionWeaponTypes ?? null;
          return withCompositeTotals(totalMap(core.calculateBuild(build, source.attributes ?? {}, {
            includeSetEffects: rules.includeSetEffects !== false,
            ...scenarioOptionsForBuild(build, progressionWeaponTypes),
            ...(progressionWeaponTypes ? { progressionWeaponTypes } : {}),
          })), rankedGoals);
        };
        const score = (stats) => scoreRankedGoals(withCompositeTotals(stats, rankedGoals), {}, initialScales, rankedGoals);
        progression = runProgressionOptimizer({
          core,
          build: source.build,
          weapons: Object.values(weaponTypeConstraints),
          settings: request.progression,
          evaluate,
          score,
        });
        source.build = progression.build;
        baseline = withCompositeTotals(totalMap(calculate(source, rules.includeSetEffects !== false, scenario)), rankedGoals);
      }
      const slots = core.EQUIPMENT_SLOTS.map((row) => row.id);
      const lockedIndexes = new Set((request.locks ?? []).filter((value) => Number.isInteger(Number(value))).map(Number));
      const lockedSlotIds = new Set(request.lockedSlotIds ?? []);
      const minimumItemLevel = Math.max(0, Number(rules.minimumItemLevel ?? 0) || 0);
      const candidatesBySlot = {};
      const cap = request.depth === "thorough" ? 18 : 8;
      const contribution = (slot, selection) => {
        const options = { includeSetEffects: false, ...(scenario == null ? {} : { scenario }) };
        return !scratch && core.WEAPON_SLOTS?.includes(slot) && typeof core.slotReplacementDelta === "function"
          ? core.slotReplacementDelta(slot, selection, source.build, source.attributes, options)
          : core.slotSelectionContribution(slot, selection, source.build, source.attributes, options);
      };
      const generationScales = request.objectiveScales && typeof request.objectiveScales === "object"
        ? Object.fromEntries(rankedGoals.map(({ id }) => [id, Math.max(1, Math.abs(Number(request.objectiveScales[id] ?? 0))) ]))
        : deriveObjectiveScales(core, rankedGoals, baseline);
      const weight = (stats) => scoreStats(stats, rankedGoals, generationScales);
      const chaosOwned = equippedChaosIds(source.build, core.indexes.runeById);
      const candidateMeta = (slot, item, selection = null) => ({
        heroicGroup: item?.grade === core.HEROIC_GRADE ? core.heroicSlotGroupForSlot(slot) : "",
        weaponType: core.WEAPON_SLOTS.includes(slot) ? item?.equipmentType ?? "" : "",
        setKeys: item?.setId ? [item.setId] : [],
        neutralHeroicCost: item?.grade === core.HEROIC_GRADE ? 1 : 0,
        neutralItemLevel: item ? core.itemMaxLevel(item) : 0,
        neutralGrade: Number(item?.grade ?? 0),
      });
      const runeCandidatesByCategory = new Map();
      const optimizerRuneStatIds = new Set(optimizerStatIds(core));

      for (let slotIndex = 0; slotIndex < slots.length; slotIndex += 1) {
        const slot = slots[slotIndex];
        const current = selectionFor(source.build, slot);
        const currentItem = core.indexes.itemById[current?.itemId];
        const requiredWeaponType = weaponTypeConstraints[slot];
        const lockEmptyExistingWeaponSlot = !scratch && core.WEAPON_SLOTS.includes(slot) && !requiredWeaponType;
        const keepCurrentHeroic = !scratch && rules.keepCurrentHeroics && !rules.reconsiderHeroics && currentItem?.grade === core.HEROIC_GRADE;
        if (lockedIndexes.has(slotIndex) || lockedSlotIds.has(slot) || keepCurrentHeroic || lockEmptyExistingWeaponSlot) {
          if (requiredWeaponType && currentItem?.equipmentType !== requiredWeaponType) throw new Error(`Locked ${core.slotById(slot).label ?? slot} does not match the chosen ${requiredWeaponType} weapon type.`);
          candidatesBySlot[slot] = [{ id: current.itemId ? itemCandidateId(current.itemId, current, "current") : `empty:${slot}`, selection: clone(current), stats: contribution(slot, current), locked: true, ...candidateMeta(slot, currentItem, current) }];
          continue;
        }
        const rows = [];
        for (const item of core.slotItems(core.slotById(slot))) {
          if (requiredWeaponType && item.equipmentType !== requiredWeaponType) continue;
          if (minimumItemLevel && core.itemMaxLevel(item) < minimumItemLevel) continue;
          let selection = optimizerItemSelection(core, item, current);
          if (rules.optimizeThreeTraits && item.grade !== core.HEROIC_GRADE) selection.traits = optimizedNormalTraits(item, rankedGoals, generationScales);
          if (!scratch && rules.keepCurrentHeroics && !rules.reconsiderHeroics && item.grade === core.HEROIC_GRADE && item.id !== current?.itemId) continue;
          if (rules.bestHeroicConfiguration && item.grade === core.HEROIC_GRADE) {
            selection = { ...selection, ...optimizeHeroicPotential(item, { allowDuplicateEffects: false, frontierLimit: 4, evaluate: (candidate) => weight(contribution(slot, { ...selection, ...candidate })) }).selection };
          }
          if (rules.runes?.mode === "keep") selection.runes = clone(current?.runes ?? []);
          else if (rules.runes?.mode && rules.runes.mode !== "keep") {
            const category = core.runeCategoryForSlot(slot);
            const chaosMode = rules.runes.mode === "normal" ? "none" : rules.runes.allowUnownedChaos ? "all" : "owned";
            let runeRows = runeCandidatesByCategory.get(category);
            if (!runeRows) {
              const goalWeights = componentWeightMap(rankedGoals, generationScales);
              runeRows = generateRuneCandidates({ category, runes: core.data.runes, runeSynergies: core.data.runeSynergies, chaos: { mode: chaosMode, ownedIds: chaosOwned }, allowStat: (id) => optimizerRuneStatIds.has(id), scoreStat: (id, value) => Number(goalWeights.get(id) ?? 0) * value, limit: request.depth === "thorough" ? 8 : 6 });
              runeCandidatesByCategory.set(category, runeRows);
            }
            if (runeRows[0]) selection.runes = runeRows[0].selection;
          }
          const variants = perkVariants(core, item, scenario);
          const currentUnsupportedCore = !scratch
            && item.id === current?.itemId
            && current?.perkId
            && !variants.some((variant) => variant.perkId === current.perkId);
          // An unsupported core may have conditional combat value that static
          // scoring cannot compare. Preserve its exact current selection rather
          // than recommending that the same item silently drops or replaces it.
          if (currentUnsupportedCore) continue;
          const prospectiveWeaponTypes = new Set(Object.values(weaponTypeConstraints).filter(Boolean));
          if (core.WEAPON_SLOTS.includes(slot) && item.equipmentType) prospectiveWeaponTypes.add(item.equipmentType);
          for (const variant of variants) {
            if (variant.requiredWeapon && !prospectiveWeaponTypes.has(variant.requiredWeapon)) continue;
            const variantSelection = { ...selection, perkId: variant.perkId };
            const selectionStatus = core.itemSelectionCalculationStatus
              ? core.itemSelectionCalculationStatus(item, variantSelection, { slotId: slot, equippedWeaponTypes: [...prospectiveWeaponTypes] })
              : { state: "legal" };
            if (selectionStatus.state !== "legal") continue;
            const stats = contribution(slot, variantSelection);
            // Direct value already lives in `stats` and is scored by the beam.
            // scoreHint is reserved for value not representable in partial stats,
            // such as future set completion and whole artifact-bundle estimates.
            rows.push({ id: itemCandidateId(item.id, variantSelection), selection: variantSelection, stats, directScore: weight(stats), ...candidateMeta(slot, item, variantSelection) });
          }
        }
        const currentRow = { id: current?.itemId ? itemCandidateId(current.itemId, current, "current") : `empty:${slot}`, selection: clone(current), stats: contribution(slot, current), ...candidateMeta(slot, currentItem, current) };
        const ranked = rows.sort((a, b) => b.directScore - a.directScore
          || a.neutralHeroicCost - b.neutralHeroicCost
          || b.neutralItemLevel - a.neutralItemLevel
          || b.neutralGrade - a.neutralGrade
          || a.id.localeCompare(b.id));
        const weaponTypeSeeds = core.WEAPON_SLOTS.includes(slot)
          ? ranked.filter((row, index, all) => all.findIndex((other) => other.weaponType === row.weaponType && !other.heroicGroup) === index && !row.heroicGroup)
          : [];
        const attributeSeeds = attributePointBudget == null ? [] : ATTRIBUTE_IDS.flatMap((attributeId) => [...ranked]
          .sort((a, b) => Number(b.stats?.[attributeId] ?? 0) - Number(a.stats?.[attributeId] ?? 0) || a.id.localeCompare(b.id)).slice(0, 2));
        const goalSeeds = [...new Set(rankedGoals.flatMap((goal) => goal.components?.length ? goal.components : [goal.id]))].flatMap((statId) => [...ranked]
          .sort((a, b) => Number(b.stats?.[statId] ?? 0) - Number(a.stats?.[statId] ?? 0) || a.id.localeCompare(b.id)).slice(0, 2));
        const retained = [...ranked.slice(0, cap), ...ranked.filter((row) => row.setKeys.length || row.heroicGroup), ...weaponTypeSeeds, ...attributeSeeds, ...goalSeeds];
        candidatesBySlot[slot] = [...(scratch ? [] : [currentRow]), ...retained].filter((row, index, all) => all.findIndex((x) => x.id === row.id) === index);
      }

      if (rules.artifacts?.mode && rules.artifacts.mode !== "keep") {
        const goalWeights = componentWeightMap(rankedGoals, generationScales);
        const bundles = generateArtifactCandidates({ items: core.data.items, artifactSets: core.data.artifactSets, scoreItem: (item) => weight(core.itemStatContribution(item, item.equipmentType, core.itemMaxLevel(item), source.build, source.attributes, scenario == null ? {} : { scenario })), scoreStat: (id, value) => Number(goalWeights.get(id) ?? 0) * value, limit: request.depth === "thorough" ? 32 : 12 });
        candidatesBySlot.artifact_bundle = bundles.map((row) => ({ id: row.key, selection: row, scoreHint: row.score, stateKeys: row.setState.map((set) => `${set.setId}:${set.count}`) }));
        slots.push("artifact_bundle");
      }

      const objectiveBaseline = request.objectiveBaseline && typeof request.objectiveBaseline === "object"
        ? Object.fromEntries(Object.entries(request.objectiveBaseline).map(([id, value]) => [id, Number(value) || 0]))
        : baseline;
      const objectiveScales = generationScales;
      // Breakpoint-aware pruning: each set-bearing candidate carries an
      // optimistic per-piece share of its set's full-completion value so the
      // beam protects set routes through to exact finalist evaluation. Not a
      // pruning guarantee — see deriveSetCompletionHints for the baseline-
      // threshold limitation.
      applySetCompletionHints({ core, candidatesBySlot, rankedGoals, scales: objectiveScales, baseline, includeSetEffects: rules.includeSetEffects !== false, scenario });
      const protectedStats = Object.fromEntries((goals.protect ?? []).map((id) => [id, { baseline: baseline[id] ?? 0, allowedLossPercent: Number(request.protectTolerancePct ?? 0) }]));
      for (const goal of rankedGoals) if (goal.minimum != null) protectedStats[goal.id] = { ...(protectedStats[goal.id] ?? {}), min: goal.minimum };
      const attributeMinimums = Object.fromEntries(Object.entries(protectedStats).map(([id, rule]) => [id, rule.min ?? Number(rule.baseline ?? 0) * (1 - Number(rule.allowedLossPercent ?? 0) / 100)]));
      const attributePoolSize = request.depth === "thorough" ? 64 : 48;
      const progressionPoolSize = request.depth === "thorough" ? 8 : 4;
      const provisionalAttributes = attributePointBudget == null ? source.attributes : balancedAllocation(attributePointBudget);
      const beamWeights = Object.fromEntries(componentWeightMap(rankedGoals, objectiveScales));
      const beamGoalStats = [...new Set(rankedGoals.flatMap((goal) => goal.components?.length ? goal.components : [goal.id]))];
      const beamStatCaps = objectiveStatCaps(rankedGoals);
      const buildEvaluationContext = {
        sourceBuild: source.build,
        attributes: provisionalAttributes,
        includeSetEffects: rules.includeSetEffects !== false,
        scenario,
        rankedGoals,
        objectiveBaseline,
        objectiveScales,
      };
      const evaluateBuild = (selections) => evaluateOptimizerBuildTask(core, { selections }, buildEvaluationContext);
      const neutralTotal = (result, key) => Object.values(result.candidates).reduce((sum, candidate) => sum + Number(candidate[key] ?? 0), 0);
      const exactOrder = (a, b) => b.evaluation.score - a.evaluation.score
        || neutralTotal(a, "neutralHeroicCost") - neutralTotal(b, "neutralHeroicCost")
        || neutralTotal(b, "neutralItemLevel") - neutralTotal(a, "neutralItemLevel")
        || neutralTotal(b, "neutralGrade") - neutralTotal(a, "neutralGrade")
        || a.key.localeCompare(b.key);
      let search = await optimizeFullBuild({ candidatesBySlot, slotOrder: slots, evaluate: evaluateBuild,
        ...(typeof optimizerTaskPool?.map === "function" ? {
          evaluateBatch: (entries, batchRuntime = {}) => runTaskBatch(
            "evaluate_build",
            entries.map((entry) => ({ selections: entry.selections })),
            buildEvaluationContext,
            (payload, context) => evaluateOptimizerBuildTask(core, payload, context),
            batchRuntime.onProgress,
          ),
        } : {}),
        lockedSlots: {}, heroicCaps: { weapon: 1, armor: 1, accessory: 1 }, distinctWeaponTypes: true, isPartialLegal: (selections, candidate) => {
        const itemId = candidate.selection?.itemId;
        if (!itemId) return true;
        if (Object.values(selections).some((selection) => selection?.itemId === itemId)) return false;
        return true;
      }, weights: beamWeights, statCaps: beamStatCaps, paretoStats: attributePointBudget == null ? beamGoalStats : [...beamGoalStats, ...ATTRIBUTE_IDS], protectedStats: attributePointBudget == null ? protectedStats : {}, beamWidth: request.depth === "thorough" ? 1000 : 300, alternativeCount: attributePointBudget == null ? (progression ? progressionPoolSize : 4) : attributePoolSize, frontierCount: attributePointBudget == null ? 24 : attributePoolSize, signal: runtime.signal, onProgress: (row) => runtime.onProgress?.({ percent: row.phase === "search" ? 5 + (attributePointBudget == null ? 45 : 30) * row.completedSlots / row.totalSlots : (attributePointBudget == null ? 50 : 35) + (attributePointBudget == null ? 50 : 25) * row.completed / row.total, label: row.phase === "search" ? "Searching legal loadouts" : "Calculating preliminary finalists", detail: `${row.searched ?? row.completed ?? 0} combinations processed` }) });
      if (attributePointBudget != null) {
        const exact = [];
        const preliminaryFrontier = search.frontier?.length ? search.frontier : search.alternatives;
        const attributeTaskContext = {
          budget: attributePointBudget,
          rankedGoals,
          baseline: objectiveBaseline,
          scales: objectiveScales,
          includeSetEffects: rules.includeSetEffects !== false,
          minimums: attributeMinimums,
          scenario,
        };
        const localAttributeTask = (payload, context) => {
          if (canonicalAttributeOptimizer) return optimizeAttributeFinalistTask(core, payload, context);
          const candidateScenario = scenarioForBuild(payload.build);
          const optimized = runAttributeOptimizer({ core, build: payload.build, budget: context.budget, rankedGoals: context.rankedGoals, baseline: context.baseline, scales: context.scales, includeSetEffects: context.includeSetEffects, minimums: context.minimums, scenario: candidateScenario });
          const calculation = core.calculateBuild(payload.build, optimized.attributes, { includeSetEffects: context.includeSetEffects, ...(candidateScenario == null ? {} : { scenario: candidateScenario }) });
          return { score: optimized.score, stats: optimized.stats, attributes: optimized.attributes, activeAttributeBreakpoints: optimized.activeAttributeBreakpoints, blockingIssues: blockingCalculationIssues(core, calculation) };
        };
        const optimizedFinalists = await runTaskBatch(
          "optimize_attributes",
          preliminaryFrontier.map((candidate) => ({ build: candidate.evaluation.build })),
          attributeTaskContext,
          localAttributeTask,
          ({ completed, total, workerCount }) => runtime.onProgress?.({ percent: 60 + (progression ? 15 : 25) * completed / total, label: "Optimizing attribute points", detail: `${completed} of ${total} frontier loadouts across ${workerCount} calculation worker${workerCount === 1 ? "" : "s"}` }),
          canonicalAttributeOptimizer,
        );
        for (let index = 0; index < preliminaryFrontier.length; index += 1) {
          if (runtime.signal?.aborted) throw new DOMException("Full-build optimization cancelled", "AbortError");
          const candidate = preliminaryFrontier[index];
          const optimized = optimizedFinalists[index];
          if (!optimized.blockingIssues.length && satisfiesProtectedStats(optimized.stats, protectedStats)) exact.push({ ...candidate, evaluation: { ...candidate.evaluation, score: optimized.score, stats: optimized.stats, attributes: optimized.attributes, activeAttributeBreakpoints: optimized.activeAttributeBreakpoints, legal: true, blockingIssues: [] } });
        }
        exact.sort(exactOrder);
        if (rules.runes?.mode && rules.runes.mode !== "keep" && runeCandidatesByCategory.size) {
          const refinementTargets = diverseFinalists(exact, rankedGoals, request.depth === "thorough" ? 16 : 10);
          const runeTaskContext = {
            budget: attributePointBudget,
            rankedGoals,
            baseline: objectiveBaseline,
            scales: objectiveScales,
            minimums: attributeMinimums,
            includeSetEffects: rules.includeSetEffects !== false,
            runeCandidatesByCategory: Object.fromEntries(runeCandidatesByCategory),
            lockedSlotIds: [...lockedSlotIds],
            scenario,
          };
          const localRuneTask = (payload, context) => {
            if (canonicalAttributeOptimizer) return refineRuneFinalistTask(core, payload, context);
            const candidateScenario = scenarioForBuild(payload.build);
            const refined = refineRuneConfiguration({ core, build: payload.build, attributes: payload.attributes, budget: context.budget, rankedGoals: context.rankedGoals, baseline: context.baseline, scales: context.scales, minimums: context.minimums, includeSetEffects: context.includeSetEffects, runeCandidatesByCategory: context.runeCandidatesByCategory, lockedSlotIds: new Set(context.lockedSlotIds), optimizeAttributes: runAttributeOptimizer, scenario: candidateScenario });
            const refinedScenario = scenarioForBuild(refined.build);
            const calculation = core.calculateBuild(refined.build, refined.attributes, { includeSetEffects: context.includeSetEffects, ...(refinedScenario == null ? {} : { scenario: refinedScenario }) });
            return { score: refined.score, stats: refined.stats, build: refined.build, attributes: refined.attributes, activeAttributeBreakpoints: refined.activeAttributeBreakpoints, runeInsights: refined.runeInsights, blockingIssues: blockingCalculationIssues(core, calculation) };
          };
          const refinedFinalists = await runTaskBatch(
            "refine_runes",
            refinementTargets.map((candidate) => ({ build: candidate.evaluation.build, attributes: candidate.evaluation.attributes })),
            runeTaskContext,
            localRuneTask,
            ({ completed, total, workerCount }) => runtime.onProgress?.({ percent: (progression ? 75 : 85) + 15 * completed / total, label: "Refining rune synergies", detail: `${completed} of ${total} diverse finalists across ${workerCount} calculation worker${workerCount === 1 ? "" : "s"}` }),
            canonicalAttributeOptimizer,
          );
          for (let index = 0; index < refinementTargets.length; index += 1) {
            if (runtime.signal?.aborted) throw new DOMException("Full-build optimization cancelled", "AbortError");
            const candidate = refinementTargets[index];
            const refined = refinedFinalists[index];
            if (refined.blockingIssues.length) continue;
            const exactIndex = exact.findIndex((row) => row.key === candidate.key);
            exact[exactIndex] = { ...candidate, selections: { ...candidate.selections, ...clone(refined.build.equipment) }, evaluation: { ...candidate.evaluation, score: refined.score, stats: refined.stats, build: refined.build, attributes: refined.attributes, activeAttributeBreakpoints: refined.activeAttributeBreakpoints, runeInsights: refined.runeInsights } };
          }
          exact.sort(exactOrder);
        }
        search = { ...search, best: exact[0] ?? null, alternatives: exact.slice(0, 4), frontier: exact.slice(0, attributePoolSize), attributeFinalistsEvaluated: preliminaryFrontier.length };
      }
      if (progression) {
        const progressionSource = [...(search.alternatives ?? []), ...(search.frontier ?? [])]
          .filter((row, index, rows) => rows.findIndex((candidate) => candidate.key === row.key) === index);
        const progressionTargets = diverseFinalists(
          progressionSource,
          rankedGoals,
          progressionPoolSize,
        );
        const progressionTaskContext = {
          weapons: Object.values(weaponTypeConstraints),
          settings: request.progression,
          rankedGoals,
          baseline: objectiveBaseline,
          scales: objectiveScales,
          includeSetEffects: rules.includeSetEffects !== false,
          protectedStats,
          minimums: attributeMinimums,
          scenario,
        };
        const refinedProgression = await runTaskBatch(
          "optimize_progression",
          progressionTargets.map((candidate) => ({
            build: candidate.evaluation.build,
            attributes: candidate.evaluation.attributes ?? source.attributes ?? {},
          })),
          progressionTaskContext,
          (payload, context) => optimizeProgressionFinalistTask(core, payload, context, runProgressionOptimizer),
          ({ completed, total, workerCount }) => runtime.onProgress?.({ percent: 90 + 10 * completed / total, label: "Refining passive skills and mastery", detail: `${completed} of ${total} gear-aware finalists across ${workerCount} calculation worker${workerCount === 1 ? "" : "s"}` }),
          canonicalProgressionOptimizer,
        );
        const exactProgression = [];
        for (let index = 0; index < progressionTargets.length; index += 1) {
          if (runtime.signal?.aborted) throw new DOMException("Full-build optimization cancelled", "AbortError");
          const candidate = progressionTargets[index];
          const refined = refinedProgression[index];
          if (refined.blockingIssues.length || !refined.protectedStatsSatisfied || !refined.minimumsSatisfied) continue;
          exactProgression.push({
            ...candidate,
            evaluation: {
              ...candidate.evaluation,
              score: refined.score,
              stats: refined.stats,
              build: refined.build,
              attributes: refined.attributes,
              activeAttributeBreakpoints: refined.activeAttributeBreakpoints,
              legal: true,
              blockingIssues: [],
              progression: refined.progression,
            },
          });
        }
        exactProgression.sort(exactOrder);
        progression = exactProgression[0]?.evaluation.progression ?? null;
        search = {
          ...search,
          best: exactProgression[0] ?? null,
          alternatives: exactProgression.slice(0, 4),
          frontier: exactProgression,
          progressionFinalistsEvaluated: progressionTargets.length,
        };
      }
      if (!search.best) throw new Error("No build satisfies the protected-stat constraints.");
      const best = search.best;
      const finalStats = best.evaluation.stats;
      const finalScenario = scenarioForBuild(best.evaluation.build);
      const finalCalculation = core.calculateBuild(best.evaluation.build, best.evaluation.attributes ?? source.attributes ?? {}, { includeSetEffects: rules.includeSetEffects !== false, ...(finalScenario == null ? {} : { scenario: finalScenario }) });
      const finalBlockingIssues = blockingCalculationIssues(core, finalCalculation);
      if (finalBlockingIssues.length) {
        throw new Error(`Optimizer produced an invalid finalist: ${finalBlockingIssues.map((issue) => issue.message).join(" ")}`);
      }
      const goalResults = rankedGoals.map((goal) => {
        const value = goalValue(finalStats, goal);
        const delta = value - Number(objectiveBaseline[goal.id] ?? 0);
        const normalizedContribution = goal.weight * delta / objectiveScales[goal.id];
        const components = goal.components.map((id) => ({ id, name: core.statName(id), value: Number(finalStats[id] ?? 0), formattedValue: core.formatStat(id, Number(finalStats[id] ?? 0)) }));
        const hardCap = core.statHardCap?.(goal.id) ?? null;
        return { ...goal, name: core.statName(goal.id), value, formattedValue: core.formatStat(goal.id, value), hardCap, formattedHardCap: hardCap == null ? null : core.formatStat(goal.id, hardCap), delta, scale: objectiveScales[goal.id], normalizedContribution, formattedMinimum: goal.minimum == null ? null : core.formatStat(goal.id, goal.minimum), formattedTarget: goal.target == null ? null : core.formatStat(goal.id, goal.target), minimumMet: goal.minimum == null ? null : value >= goal.minimum, components };
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
      const tuningFrontier = (search.frontier?.length ? search.frontier : [best]).map((row) => ({
        id: row.key,
        score: Number(row.evaluation.score) || 0,
        build: clone(row.evaluation.build),
        ...(row.evaluation.progression ? { progression: clone(row.evaluation.progression) } : {}),
        optimizedAttributes: clone(row.evaluation.attributes ?? source.attributes ?? {}),
        activeAttributeBreakpoints: clone(row.evaluation.activeAttributeBreakpoints ?? []),
        goalValues: Object.fromEntries(rankedGoals.map((goal) => [goal.id, goalValue(row.evaluation.stats, goal)])),
      }));
      return {
        name: scratch ? "Optimized build from scratch" : "Optimized full build", sourceKind: scratch ? "scratch" : "existing", score: best.evaluation.score, scoreLabel: best.evaluation.score.toFixed(3), slots: outputSlots, loadout: { equipment: equipmentLoadout, artifacts: artifactLoadout },
        statDeltas: [...new Set([...rankedGoals.map(({ id }) => id), ...(goals.protect ?? [])])].map((id) => { const delta=(finalStats[id] ?? 0)-(objectiveBaseline[id] ?? 0); return { id, name:core.statName(id), delta, formattedDelta:core.formatStat(id,Math.abs(delta)) }; }),
        explanations: ["Finalists were recalculated through the complete build calculator.", rules.includeSetEffects === false ? "Set effects were excluded." : "Known set effects were included.", ...(best.evaluation.runeInsights ?? []).map((row) => row.text), ...goalResults.map((goal) => `${goal.name}: ${goal.value} at priority ${goal.rank}; normalized contribution ${goal.normalizedContribution >= 0 ? "+" : ""}${goal.normalizedContribution.toFixed(3)}${goal.components.length > 1 ? `; components ${goal.components.map((row) => `${row.name} ${row.formattedValue}`).join(", ")}` : ""}${goal.minimum == null ? "" : `; ${goal.target == null ? "minimum" : "target"} ${goal.minimum} ${goal.minimumMet ? "met" : "not met"}`}.`), ...(tradeoffs.length ? tradeoffs.map((row) => `Tradeoff: ${row.text}`) : ["No selected goal finished below the fixed objective baseline."])],
        assumptions: ["Item Potentials are excluded from calculations and recommendations in this release; same-item selections are preserved.", ...(scratch ? [attributePointBudget == null ? "Built from a naked level baseline with no allocated attribute points." : `${attributePointBudget} available attribute point${attributePointBudget === 1 ? " was" : "s were"} redistributed across STR, DEX, INT, PER, and CON.`, "This is a theoretical catalogue build. Ownership and acquisition cost are not scored.", ...(progression ? [`Eight passive skills were selected at up to level ${progression.settings.skillLevelCap}.`, ...Object.entries(progression.summary.masteryPointsByWeapon).map(([weapon, points]) => `${core.label(weapon)} mastery uses ${points} of ${progression.settings.masteryPointsByWeapon[weapon]} available points.`)] : [])] : ["Weapon families were locked to the source build so its saved skills and mastery remain compatible."]), ...(minimumItemLevel ? [`Equipment below level ${minimumItemLevel} was excluded.`] : []), ...(scenario == null ? ["Only decoded-proven persistent Skill Cores are optimized; conditional or unsupported cores receive no invented static value."] : [`Decoded scenario effects were scored at ${Number(finalCalculation.scenarioEffects?.targetDistanceMeters)}m${finalCalculation.scenarioEffects?.timeOfDay === "unspecified" ? " with time unspecified" : ` during ${finalCalculation.scenarioEffects?.timeOfDay}`}. Other conditional or unsupported effects received no invented value.`]), "Repeated Equipment Skills are legal, but exact scoring activates only one copy in the current fixed-level catalogue.", "Exactly three normal rune sockets are considered; normal rune rows may repeat.", "No more than one Chaos rune is used per item."],
        warnings: ["This is a bounded search, so the result is the best loadout found rather than proof of the mathematical global optimum.", ...(rules.runes?.mode === "chaos" && !rules.runes.allowUnownedChaos ? [`Chaos suggestions are restricted to ${chaosOwned.length} equipped-owned rune ID(s).`] : [])],
        alternatives: search.alternatives.slice(1).map((row, index) => ({ name: `Alternative ${index + 1}`, summary: `Fit ${row.evaluation.score.toFixed(3)}`, score: row.evaluation.score, ...(row.evaluation.progression ? { progression: clone(row.evaluation.progression) } : {}) })),
        build: best.evaluation.build,
        attributes: clone(best.evaluation.attributes ?? source.attributes ?? {}),
        optimizedAttributes: attributePointBudget == null ? null : clone(best.evaluation.attributes),
        attributePointBudget: attributePointBudget ?? null,
        activeAttributeBreakpoints: clone(best.evaluation.activeAttributeBreakpoints ?? []),
        attributeFinalistsEvaluated: search.attributeFinalistsEvaluated ?? 0,
        progressionFinalistsEvaluated: search.progressionFinalistsEvaluated ?? 0,
        objectiveBaseline: clone(objectiveBaseline),
        objectiveScales: clone(objectiveScales),
        goalResults,
        tuningFrontier,
        tradeoffs,
        allStats,
        progression: progression ? clone({ ...progression.summary, settings: progression.settings }) : null,
        setEffects: clone(finalCalculation.setEffects),
        scenario: scenario == null ? null : clone(finalCalculation.scenarioEffects?.scenario ?? scenario),
        scenarioEffects: scenario == null ? null : clone(finalCalculation.scenarioEffects),
      };
    },
  };
}

export default createOptimizerAdapter;
