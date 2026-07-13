const clone = (value) => globalThis.structuredClone ? structuredClone(value) : JSON.parse(JSON.stringify(value));

const clampInteger = (value, minimum, maximum, fallback = minimum) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(numeric)));
};

const rowsToMap = (rows = []) => Object.fromEntries(rows.map((row) => [row.statId, Number(row.value) || 0]));

function marginalMasteryStats(core, mastery, currentLevel, nextLevel) {
  const current = rowsToMap(currentLevel ? core.masteryStructuredStats(mastery, currentLevel) : []);
  const next = rowsToMap(core.masteryStructuredStats(mastery, nextLevel));
  const ids = new Set([...Object.keys(current), ...Object.keys(next)]);
  return Object.fromEntries([...ids].map((id) => [id, Number(next[id] ?? 0) - Number(current[id] ?? 0)]));
}

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

function selectBestSynergies({ core, build, weapon, evaluate, score }) {
  let changed = true;
  while (changed) {
    changed = false;
    const state = core.masteryWeaponPointState(weapon, build);
    for (const grade of [...new Set(core.masteryRowsForWeapon(weapon).map((row) => row.grade))].sort((a, b) => a - b)) {
      if ((state.synergyCountByTier[grade] ?? 0) >= 2) continue;
      const candidates = core.masteryRowsForWeapon(weapon)
        .filter((row) => row.specializationType === "synergy" && row.grade === grade && !build.masteries[row.id])
        .filter((row) => !core.masteryLockInfo(row, weapon, build).locked)
        .map((row) => {
          const candidate = clone(build);
          candidate.masteries[row.id] = { level: core.masteryMaxLevel(row) };
          const direct = score(evaluate(candidate)) - score(evaluate(build));
          const epicLookahead = core.masteryRowsForWeapon(weapon)
            .filter((epic) => epic.specializationType === "normal" && epic.grade === 41 && core.masterySynergyMatches(row, epic))
            .map((epic) => score(rowsToMap(core.masteryStructuredStats(epic, core.masteryMaxLevel(epic)))) / Math.max(1, core.masteryMaxLevel(epic)))
            .sort((a, b) => b - a)[0] ?? 0;
          return { row, score: direct + epicLookahead };
        })
        .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id));
      if (!candidates.length) continue;
      const selected = candidates[0].row;
      build.masteries[selected.id] = { level: core.masteryMaxLevel(selected) };
      changed = true;
    }
  }
}

function allocateWeaponMastery({ core, build, weapon, pointBudget, evaluate, score }) {
  const target = clampInteger(pointBudget, 0, core.MASTERY_POINT_BUDGET, core.MASTERY_POINT_BUDGET);
  while (core.masteryWeaponPointState(weapon, build).totalPoints < target) {
    selectBestSynergies({ core, build, weapon, evaluate, score });
    const candidates = core.masteryRowsForWeapon(weapon)
      .filter((mastery) => mastery.specializationType === "normal")
      .flatMap((mastery) => {
        const current = core.masterySelectedLevel(mastery, build);
        const next = current + 1;
        if (next > core.masteryMaxLevel(mastery)) return [];
        if (!current && core.masteryLockInfo(mastery, weapon, build).locked) return [];
        if (!core.masteryCanSetLevel(mastery, next, weapon, build).ok) return [];
        return [{ mastery, current, next, score: score(marginalMasteryStats(core, mastery, current, next)) }];
      })
      .sort((left, right) => right.score - left.score || left.mastery.grade - right.mastery.grade
        || left.mastery.id.localeCompare(right.mastery.id));
    if (!candidates.length) break;
    const selected = candidates[0];
    build.masteries[selected.mastery.id] = { level: selected.next };
  }
  selectBestSynergies({ core, build, weapon, evaluate, score });
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
  const result = clone(build);
  result.skills = [];
  result.masteries = {};
  result.unifiedMasteries = normalized.includePotential ? ["WM_Common_SKILL_007"] : [];
  if (!normalized.enabled) return { build: result, settings: normalized, summary: { masteryPointsByWeapon: {} } };

  const masteryPointsByWeapon = {};
  for (const weapon of weapons) {
    masteryPointsByWeapon[weapon] = allocateWeaponMastery({
      core,
      build: result,
      weapon,
      pointBudget: normalized.masteryPointsByWeapon[weapon],
      evaluate,
      score,
    });
  }

  const available = core.availableSkillsForWeapons(weapons);
  const passiveRows = available.filter((skill) => core.skillLoadoutType(skill) === "passive");
  const passives = optimizePassiveSkills({ core, build: result, rows: passiveRows, levelCap: normalized.skillLevelCap, evaluate, score });
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
