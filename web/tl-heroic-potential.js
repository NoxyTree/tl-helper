// Pure Heroic configuration search. This module deliberately has no dependency
// on tl-core so it can be reused by Gear Viewer and the full-build optimizer.

const DEFAULT_FRONTIER_LIMIT = 512;

function rows(value) {
  return Array.isArray(value) ? value : Object.values(value ?? {});
}

function maxTier(value) {
  return Math.max(1, rows(value).length);
}

function effectGroupCount(item) {
  let count = 0;
  while (Array.isArray(item?.itemStats?.[`random_stat_group_${count + 1}`])) count += 1;
  return count;
}

function effectOption(row, groupIndex) {
  const levels = rows(row?.levels).map(Number).filter(Number.isFinite);
  const maxLevel = Number(row?.max_level ?? row?.maxLevel ?? Math.max(0, levels.length - 1));
  return {
    statId: String(row?.stat_id ?? row?.statId ?? ""),
    groupIndex,
    level: maxLevel,
    levelKnown: true,
    value: levels[maxLevel] ?? levels.at(-1) ?? Number(row?.base_value ?? row?.baseValue ?? 0),
  };
}

function signature(selection) {
  const traits = selection.traits.map((row) => `${row.statId}:${row.tier}`).join(",");
  const unique = selection.uniqueTrait ? `${selection.uniqueTrait.statId}:${selection.uniqueTrait.tier}` : "";
  const effects = selection.heroicEffects.map((row) => `${row.statId}:${row.level}`).join(",");
  return `${traits}|${unique}|${effects}`;
}

function normalizedEvaluation(value) {
  if (typeof value === "number") return { score: value, allowed: true, protectionHeadroom: 0 };
  return {
    ...(value ?? {}),
    score: Number(value?.score ?? Number.NEGATIVE_INFINITY),
    allowed: value?.allowed !== false && value?.protected !== false,
    protectionHeadroom: Number(value?.protectionHeadroom ?? value?.protectedHeadroom ?? value?.headroom ?? 0),
  };
}

function compareCandidates(a, b) {
  if (a.evaluation.allowed !== b.evaluation.allowed) return a.evaluation.allowed ? -1 : 1;
  if (a.evaluation.score !== b.evaluation.score) return b.evaluation.score - a.evaluation.score;
  if (a.evaluation.protectionHeadroom !== b.evaluation.protectionHeadroom) {
    return b.evaluation.protectionHeadroom - a.evaluation.protectionHeadroom;
  }
  return a.signature.localeCompare(b.signature);
}

function evaluateCandidate(selection, evaluate) {
  return {
    selection,
    evaluation: normalizedEvaluation(evaluate(selection)),
    signature: signature(selection),
  };
}

function trim(candidates, limit) {
  const unique = new Map();
  for (const candidate of candidates) {
    const current = unique.get(candidate.signature);
    if (!current || compareCandidates(candidate, current) < 0) unique.set(candidate.signature, candidate);
  }
  return [...unique.values()].sort(compareCandidates).slice(0, limit);
}

function combinations(values, count, start = 0, chosen = [], output = []) {
  if (chosen.length === count) {
    output.push(chosen.slice());
    return output;
  }
  for (let index = start; index <= values.length - (count - chosen.length); index += 1) {
    chosen.push(values[index]);
    combinations(values, count, index + 1, chosen, output);
    chosen.pop();
  }
  return output;
}

/**
 * Find a strong, deterministic maxed configuration for one Heroic item.
 *
 * evaluate(selection) may return a number or
 * { score, allowed, protectionHeadroom, ... }. It is called for partial
 * selections too, allowing a bounded component frontier rather than millions
 * of complete permutations.
 */
export function optimizeHeroicPotential(item, {
  evaluate,
  allowDuplicateEffects = true,
  frontierLimit = DEFAULT_FRONTIER_LIMIT,
} = {}) {
  if (!item?.itemStats) throw new TypeError("A Heroic item with itemStats is required.");
  if (typeof evaluate !== "function") throw new TypeError("evaluate(selection) is required.");
  const limit = Math.max(1, Number(frontierLimit) || DEFAULT_FRONTIER_LIMIT);

  const traitOptions = Object.entries(item.itemStats.traits ?? {})
    .map(([statId, tiers]) => ({ statId, tier: maxTier(tiers) }))
    .sort((a, b) => a.statId.localeCompare(b.statId));
  if (traitOptions.length < 3) throw new RangeError("Heroic potential requires at least three normal trait options.");

  let frontier = combinations(traitOptions, 3).map((traits) => evaluateCandidate({
    itemId: item.id ?? "",
    traits,
    uniqueTrait: null,
    heroicEffects: [],
    resonance: [],
    runes: [],
    perkId: "",
    potentialId: "",
  }, evaluate));
  frontier = trim(frontier, limit);

  const uniqueOptions = Object.entries(item.itemStats.uniqueTraits ?? {})
    .map(([statId, tiers]) => ({ statId, tier: maxTier(tiers) }))
    .sort((a, b) => a.statId.localeCompare(b.statId));
  if (uniqueOptions.length) {
    frontier = trim(frontier.flatMap((candidate) => uniqueOptions.map((uniqueTrait) => evaluateCandidate({
      ...candidate.selection,
      uniqueTrait,
    }, evaluate))), limit);
  }

  const groupCount = effectGroupCount(item);
  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const options = item.itemStats[`random_stat_group_${groupIndex + 1}`]
      .map((row) => effectOption(row, groupIndex))
      .filter((row) => row.statId)
      .sort((a, b) => a.statId.localeCompare(b.statId));
    if (!options.length) throw new RangeError(`Heroic effect group ${groupIndex + 1} has no options.`);
    frontier = trim(frontier.flatMap((candidate) => options
      .filter((option) => allowDuplicateEffects
        || !candidate.selection.heroicEffects.some((row) => row.statId === option.statId))
      .map((option) => evaluateCandidate({
        ...candidate.selection,
        heroicEffects: [...candidate.selection.heroicEffects, option],
      }, evaluate))), limit);
    if (!frontier.length) throw new RangeError("The duplicate-effect policy leaves no legal Heroic configuration.");
  }

  const best = frontier[0];
  return {
    selection: best.selection,
    evaluation: best.evaluation,
    finalists: frontier,
    assumptions: {
      normalTraits: "Exactly three distinct normal traits at maximum tier.",
      heroicTrait: uniqueOptions.length ? "Exactly one Heroic trait at maximum tier." : "This item has no Heroic trait pool.",
      heroicEffects: `One effect from each of ${groupCount} group${groupCount === 1 ? "" : "s"}, each at maximum level.`,
      duplicateEffects: allowDuplicateEffects ? "Duplicate Heroic effects are allowed." : "Duplicate Heroic effects are not allowed.",
      excluded: "Trait resonance, runes, skill cores, perks, and potentials are excluded.",
      search: `Deterministic bounded component search with a frontier of ${limit}.`,
    },
    explanation: [
      `Selected ${best.selection.traits.length} max-tier normal traits.`,
      best.selection.uniqueTrait
        ? `Selected max-tier Heroic trait ${best.selection.uniqueTrait.statId}.`
        : "No Heroic trait improved the evaluated result.",
      `Selected maximum-level effects for ${groupCount} Heroic effect group${groupCount === 1 ? "" : "s"}.`,
    ],
  };
}

export const HEROIC_POTENTIAL_DEFAULT_FRONTIER = DEFAULT_FRONTIER_LIMIT;
