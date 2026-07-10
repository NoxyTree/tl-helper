import { createHash } from "node:crypto";
import { resolveStatTaxonomy } from "./stat-taxonomy.mjs";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stableId(parts) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24);
}

function taxonomyFor(options, rawStatId) {
  const taxonomy = (options.resolveTaxonomy ?? resolveStatTaxonomy)(rawStatId);
  const scale = Number(taxonomy.scale ?? 1);
  return {
    canonicalStatId: taxonomy.canonicalStatId ?? rawStatId,
    displayName: taxonomy.displayName ?? rawStatId,
    unit: taxonomy.unit ?? "raw",
    scale: Number.isFinite(scale) && scale !== 0 ? scale : 1,
    attackScope: taxonomy.attackScope ?? "all",
    labelSource: taxonomy.labelSource ?? "raw_game_id",
    labelStatus: taxonomy.labelStatus ?? "unmapped",
  };
}

function statFamily(canonicalStatId) {
  for (const family of ["heavy_attack_chance", "heavy_attack_evasion", "critical_hit_chance", "endurance", "hit_chance", "evasion", "defense"]) {
    if (canonicalStatId === family || canonicalStatId.endsWith(`_${family}`)) return family;
  }
  return canonicalStatId;
}

function rowFor(source, sourceType, component, rawStatId, valueRaw, location, options) {
  if (valueRaw === 0) return null;
  const taxonomy = taxonomyFor(options, rawStatId);
  const level = location.level ?? null;
  const rank = location.rank ?? null;
  return {
    statSourceId: stableId([
      options.gameBuild,
      sourceType,
      source.id,
      component,
      rawStatId,
      level ?? "",
      rank ?? "",
      location.projectionPath,
    ]),
    canonicalStatId: taxonomy.canonicalStatId,
    statFamilyId: statFamily(taxonomy.canonicalStatId),
    rawStatId,
    displayName: taxonomy.displayName,
    sourceType,
    sourceId: source.id,
    sourceName: source.name,
    sourceComponent: component,
    valueRaw,
    value: valueRaw * taxonomy.scale,
    unit: taxonomy.unit,
    level,
    rank,
    attackScope: taxonomy.attackScope,
    contextJson: JSON.stringify(location.context),
    conditionsJson: JSON.stringify(location.conditions),
    sourceTable: "web.projection.runes",
    sourcePath: options.sourcePath,
    gameBuild: options.gameBuild,
    confidence: "verified_projection",
    evidenceJson: JSON.stringify({
      projection: "runes",
      projectionPath: location.projectionPath,
      rawStatId,
      valueRaw,
      taxonomy: {
        labelSource: taxonomy.labelSource,
        labelStatus: taxonomy.labelStatus,
        scale: taxonomy.scale,
      },
    }),
  };
}

export function runeStatSources(rune, options) {
  const rows = [];
  for (const [groupId, choices] of Object.entries(rune?.itemStats ?? {})) {
    if (!groupId.startsWith("random_stat_group") || !Array.isArray(choices)) continue;
    for (let choiceIndex = 0; choiceIndex < choices.length; choiceIndex++) {
      const choice = choices[choiceIndex];
      const rawStatId = choice?.stat_id ?? choice?.statId;
      if (!rawStatId) continue;
      const levels = Array.isArray(choice.levels) ? choice.levels : [];
      const projectedMaxLevel = Math.max(0, levels.length - 1);
      const maxLevel = Math.min(Math.max(0, Number(choice.max_level ?? projectedMaxLevel)), projectedMaxLevel);
      for (let level = 1; level <= maxLevel; level++) {
        const valueRaw = finite(levels[level]);
        if (valueRaw === null) continue;
        const projectionPath = `runes.${rune.id}.itemStats.${groupId}.${choiceIndex}.levels.${level}`;
        const row = rowFor(rune, "rune", groupId, rawStatId, valueRaw, {
          level,
          projectionPath,
          context: {
            equipmentCategory: rune.equipmentCategory ?? null,
            runeType: rune.runeType ?? null,
            grade: rune.grade ?? null,
          },
          conditions: {
            possibleRoll: true,
            randomized: true,
            rollProbability: finite(choice.probability),
            requiresRuneLevel: level,
          },
        }, options);
        if (row) rows.push(row);
      }
    }
  }
  return rows;
}

export function buildRuneStatSources(runes, options) {
  return runes.flatMap((rune) => runeStatSources(rune, options));
}

export function runeSynergyStatSources(synergy, options) {
  const rows = [];
  for (const [rawStatId, rawValue] of Object.entries(synergy?.stats ?? {})) {
    const valueRaw = finite(rawValue);
    if (valueRaw === null) continue;
    const projectionPath = `runeSynergies.${synergy.id}.stats.${rawStatId}`;
    const row = rowFor(synergy, "rune_synergy", "synergy", rawStatId, valueRaw, {
      projectionPath,
      context: {
        equipmentCategory: synergy.equipmentCategory ?? null,
        grade: synergy.grade ?? null,
      },
      conditions: {
        directSynergy: true,
        requiresRuneCount: (synergy.combination ?? []).length,
        requiresCombination: synergy.combination ?? [],
      },
    }, options);
    if (row) rows.push(row);
  }
  return rows;
}

export function buildRuneSynergyStatSources(synergies, options) {
  return synergies.flatMap((synergy) => runeSynergyStatSources(synergy, options));
}
