import { PASSIVE_EFFECT_CONTRACT } from "./tl-passive-effect-contract.js";

const clone = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));

const MASTERY_PASSIVE_INTERACTION = new Map(
  PASSIVE_EFFECT_CONTRACT.bindings.masteryPassiveInteraction.map((row) => [row.masteryId, row.passiveSkillId]),
);

const clampInteger = (value, minimum, maximum, fallback = minimum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(numeric)));
};

function stableSkillRows(rows) {
  return [...rows].sort((left, right) => String(left.skillSlotAffinity ?? "").localeCompare(String(right.skillSlotAffinity ?? ""))
    || String(left.mainCategory ?? "").localeCompare(String(right.mainCategory ?? ""))
    || String(left.name ?? left.id).localeCompare(String(right.name ?? right.id)));
}

function selectionForSkill(core, skill, levelCap) {
  return {
    skillId: skill.id,
    level: Math.min(core.skillBandedMax(skill), levelCap),
    loadoutType: core.skillLoadoutType(skill),
    specializationIds: [],
  };
}

function synergyCandidateScore({ core, build, weapon, row, evaluate, score, baseScore, levelCap }) {
  const candidate = clone(build);
  candidate.masteries[row.id] = { level: core.masteryMaxLevel(row) };
  const candidateScore = score(evaluate(candidate));
  const direct = candidateScore - baseScore;
  const interactionLookahead = interactionMarginal({ core, build, mastery: row, evaluate, score, levelCap });
  const epicLookahead = core.masteryRowsForWeapon(weapon)
    .filter((epic) => epic.specializationType === "normal" && epic.grade === 41 && core.masterySynergyMatches(row, epic))
    .map((epic) => {
      const withEpic = clone(candidate);
      withEpic.masteries[epic.id] = { level: core.masteryMaxLevel(epic) };
      return (score(evaluate(withEpic)) - candidateScore) / Math.max(1, core.masteryMaxLevel(epic));
    })
    .sort((a, b) => b - a)[0] ?? 0;
  return direct + interactionLookahead + epicLookahead;
}

function synchronizeSynergies({ core, build, weapon, evaluate, score, levelCap }) {
  const rows = core.masteryRowsForWeapon(weapon);
  for (const row of rows) if (row.specializationType === "synergy") delete build.masteries[row.id];
  const baseScore = score(evaluate(build));
  const state = core.masteryWeaponPointState(weapon, build);
  for (const grade of [...new Set(rows.map((row) => row.grade))].sort((a, b) => a - b)) {
    const synergyRows = rows.filter((row) => row.specializationType === "synergy" && row.grade === grade);
    const eligible = synergyRows
      .map((row) => ({ row, category: row.subCategory, points: state.categoryTierTotals[`${row.subCategory}-${grade}`] ?? 0 }))
      .filter((entry) => entry.points >= 20)
      .sort((left, right) => right.points - left.points || left.category.localeCompare(right.category));
    const slotCount = Math.min(2, eligible.length);
    if (!slotCount) continue;
    const cutoff = eligible[slotCount - 1].points;
    const required = eligible.filter((entry) => entry.points > cutoff);
    const tied = eligible.filter((entry) => entry.points === cutoff);
    const chosen = [...required];
    chosen.push(...tied
      .map((entry) => ({ ...entry, score: synergyCandidateScore({ core, build, weapon, row: entry.row, evaluate, score, baseScore, levelCap }) }))
      .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id))
      .slice(0, slotCount - required.length));
    for (const entry of chosen) build.masteries[entry.row.id] = { level: core.masteryMaxLevel(entry.row) };
  }
  const selectedSynergies = core.masteryWeaponPointState(weapon, build).selectedSynergy;
  for (const epic of core.masteryWeaponPointState(weapon, build).epicSelected) {
    if (!selectedSynergies.some((synergy) => core.masterySynergyMatches(synergy, epic))) delete build.masteries[epic.id];
  }
}

function withInteractionPassive(core, build, masteryId, levelCap) {
  const passiveId = MASTERY_PASSIVE_INTERACTION.get(masteryId);
  const passive = core.indexes.skillById[passiveId];
  if (!passive || build.skills?.some((row) => row.skillId === passiveId)) return clone(build);
  const candidate = clone(build);
  candidate.skills = [...(candidate.skills ?? []), selectionForSkill(core, passive, levelCap)];
  return candidate;
}

function interactionMarginal({ core, build, mastery, evaluate, score, levelCap }) {
  const passiveId = MASTERY_PASSIVE_INTERACTION.get(mastery.id);
  if (!passiveId || build.skills?.some((row) => row.skillId === passiveId)) return 0;
  const withoutMastery = withInteractionPassive(core, build, mastery.id, levelCap);
  const withMastery = clone(withoutMastery);
  withMastery.masteries[mastery.id] = { level: core.masteryMaxLevel(mastery) };
  return score(evaluate(withMastery)) - score(evaluate(withoutMastery));
}

function masteryRouteHints({ core, build, weapon, evaluate, score, baseScore, levelCap }) {
  const hints = new Map();
  const state = core.masteryWeaponPointState(weapon, build);
  const selectedIds = new Set([...state.epicSelected, ...state.selectedSynergy].map((row) => row.id));
  for (const epic of core.masteryRowsForWeapon(weapon)
    .filter((row) => row.specializationType === "normal" && row.grade === 41 && !selectedIds.has(row.id))
    .filter((row) => core.passiveEffectClassification("masteryNonStructured", row.id) !== "persistentUnrepresentable")) {
    const projected = clone(build);
    projected.masteries[epic.id] = { level: core.masteryMaxLevel(epic) };
    const fullGain = Math.max(0, score(evaluate(projected)) - baseScore);
    const perPoint = fullGain / Math.max(1, 80 + core.masteryMaxLevel(epic));
    for (const category of core.masteryCategoryKeys(epic)) {
      hints.set(category, Math.max(Number(hints.get(category) ?? 0), perPoint));
    }
  }
  for (const synergy of core.masteryRowsForWeapon(weapon)
    .filter((row) => row.specializationType === "synergy" && !selectedIds.has(row.id))) {
    const projected = clone(build);
    projected.masteries[synergy.id] = { level: core.masteryMaxLevel(synergy) };
    const directGain = score(evaluate(projected)) - baseScore;
    const fullGain = Math.max(0, directGain, interactionMarginal({ core, build, mastery: synergy, evaluate, score, levelCap }));
    const priorTierPoints = synergy.grade === 11 ? 0 : synergy.grade === 21 ? 30 : 60;
    const perPoint = fullGain / Math.max(1, priorTierPoints + 20);
    for (const category of core.masteryCategoryKeys(synergy)) {
      const key = `${synergy.grade}:${category}`;
      hints.set(key, Math.max(Number(hints.get(key) ?? 0), perPoint));
    }
  }
  return hints;
}

function allocateWeaponMastery({ core, build, weapon, pointBudget, evaluate, score, levelCap }) {
  const target = clampInteger(pointBudget, 0, core.MASTERY_POINT_BUDGET, core.MASTERY_POINT_BUDGET);
  const epicReserve = Math.min(10, Math.max(0, target - 80)) + Math.min(10, Math.max(0, target - 130));
  const nonEpicTarget = target - epicReserve;
  const calculationEligibleEpicCategories = new Set(core.masteryRowsForWeapon(weapon)
    .filter((mastery) => mastery.specializationType === "normal" && mastery.grade === 41)
    .filter((mastery) => core.passiveEffectClassification("masteryNonStructured", mastery.id) !== "persistentUnrepresentable")
    .flatMap((mastery) => core.masteryCategoryKeys(mastery)));
  while (core.masteryWeaponPointState(weapon, build).nonEpicPoints < nonEpicTarget) {
    const baseScore = score(evaluate(build));
    const routeHints = masteryRouteHints({ core, build, weapon, evaluate, score, baseScore, levelCap });
    const candidates = core.masteryRowsForWeapon(weapon)
      .filter((mastery) => mastery.specializationType === "normal" && mastery.grade !== 41)
      .flatMap((mastery) => {
        const current = core.masterySelectedLevel(mastery, build);
        const next = current + 1;
        if (next > core.masteryMaxLevel(mastery)) return [];
        if (!current && core.masteryLockInfo(mastery, weapon, build).locked) return [];
        if (!core.masteryCanSetLevel(mastery, next, weapon, build).ok) return [];
        const candidate = clone(build);
        candidate.masteries[mastery.id] = { level: next };
        const routeHint = Math.max(0, ...core.masteryCategoryKeys(mastery).flatMap((category) => [
          Number(routeHints.get(category) ?? 0),
          Number(routeHints.get(`${mastery.grade}:${category}`) ?? 0),
        ]));
        const epicEligible = epicReserve > 0 && core.masteryCategoryKeys(mastery)
          .some((category) => calculationEligibleEpicCategories.has(category));
        return [{ mastery, current, next, score: score(evaluate(candidate)) - baseScore + routeHint, epicEligible }];
      })
      .sort((left, right) => right.score - left.score || Number(right.epicEligible) - Number(left.epicEligible)
        || left.mastery.grade - right.mastery.grade
        || left.mastery.id.localeCompare(right.mastery.id));
    if (!candidates.length) break;
    const selected = candidates[0];
    build.masteries[selected.mastery.id] = { level: selected.next };
  }
  synchronizeSynergies({ core, build, weapon, evaluate, score, levelCap });
  while (core.masteryWeaponPointState(weapon, build).totalPoints < target) {
    const baseScore = score(evaluate(build));
    const candidates = core.masteryRowsForWeapon(weapon)
      .filter((mastery) => mastery.specializationType === "normal" && mastery.grade === 41)
      .filter((mastery) => core.passiveEffectClassification("masteryNonStructured", mastery.id) !== "persistentUnrepresentable")
      .flatMap((mastery) => {
        const current = core.masterySelectedLevel(mastery, build);
        const next = current + 1;
        if (next > core.masteryMaxLevel(mastery)) return [];
        if (!current && core.masteryLockInfo(mastery, weapon, build).locked) return [];
        if (!core.masteryCanSetLevel(mastery, next, weapon, build).ok) return [];
        const candidate = clone(build);
        candidate.masteries[mastery.id] = { level: next };
        return [{ mastery, current, next, score: score(evaluate(candidate)) - baseScore }];
      })
      .sort((left, right) => right.score - left.score || left.mastery.id.localeCompare(right.mastery.id));
    if (!candidates.length) break;
    const selected = candidates[0];
    build.masteries[selected.mastery.id] = { level: selected.next };
  }
  return core.masteryWeaponPointState(weapon, build).totalPoints;
}

function optimizePassiveSkills({ core, build, rows, levelCap, evaluate, score }) {
  const remaining = stableSkillRows(rows);
  const selected = [];
  while (selected.length < core.PASSIVE_SKILL_CAP && remaining.length) {
    const baseScore = score(evaluate(build));
    const candidates = remaining.map((skill) => {
      const selection = selectionForSkill(core, skill, levelCap);
      const candidate = clone(build);
      candidate.skills = [...selected, selection];
      return { skill, selection, score: score(evaluate(candidate)) - baseScore };
    }).sort((left, right) => right.score - left.score || left.skill.id.localeCompare(right.skill.id));
    const best = candidates[0];
    selected.push(best.selection);
    remaining.splice(remaining.findIndex((row) => row.id === best.skill.id), 1);
    build.skills = [...selected];
  }
  return selected;
}

export function normalizeProgressionSettings(core, weapons, settings = {}) {
  const masteryPointsByWeapon = Object.fromEntries(weapons.map((weapon) => [weapon,
    clampInteger(settings.masteryPointsByWeapon?.[weapon], 0, core.MASTERY_POINT_BUDGET, core.MASTERY_POINT_BUDGET)]));
  return {
    enabled: settings.enabled !== false,
    skillLevelCap: clampInteger(settings.skillLevelCap, 1, 20, 20),
    masteryPointsByWeapon,
    includePotential: settings.includePotential === true,
  };
}

export function optimizeScratchProgression({ core, build, weapons, settings = {}, evaluate, score }) {
  const normalized = normalizeProgressionSettings(core, weapons, settings);
  // Scratch progression is chosen before concrete weapon items exist. The
  // evaluator receives the requested weapon families so the shared calculator
  // can activate only their passive and mastery rows without inventing gear.
  const evaluateProgression = (candidate) => evaluate(candidate, { progressionWeaponTypes: weapons });
  const result = clone(build);
  result.skills = [];
  result.masteries = {};
  result.unifiedMasteries = normalized.includePotential ? ["WM_Common_SKILL_007"] : [];
  result.overallMasteryLevel = normalized.includePotential
    ? Number(core.indexes.masteryById.WM_Common_SKILL_007?.requiredLevel ?? 0)
    : null;
  if (!normalized.enabled) return { build: result, settings: normalized, summary: { masteryPointsByWeapon: {} } };

  const masteryPointsByWeapon = {};
  for (const weapon of weapons) {
    masteryPointsByWeapon[weapon] = allocateWeaponMastery({
      core,
      build: result,
      weapon,
      pointBudget: normalized.masteryPointsByWeapon[weapon],
      evaluate: evaluateProgression,
      score,
      levelCap: normalized.skillLevelCap,
    });
  }

  const available = core.availableSkillsForWeapons(weapons);
  const passiveRows = available.filter((skill) => core.skillLoadoutType(skill) === "passive");
  const passives = optimizePassiveSkills({ core, build: result, rows: passiveRows, levelCap: normalized.skillLevelCap, evaluate: evaluateProgression, score });
  result.skills = passives;

  return {
    build: result,
    settings: normalized,
    summary: {
      masteryPointsByWeapon,
      passiveSkills: passives.length,
    },
  };
}
