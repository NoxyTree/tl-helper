import { createHash } from "node:crypto";

const SKIP_KEYS = new Set(["probability", "statId"]);

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stableId(parts) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24);
}

function leaves(value, path = [], out = []) {
  if (!value || typeof value !== "object") return out;
  for (const [key, nested] of Object.entries(value)) {
    if (SKIP_KEYS.has(key) || nested === null) continue;
    if (typeof nested === "number") out.push({ rawStatId: key, valueRaw: nested, path: [...path, key] });
    else if (typeof nested === "object" && !Array.isArray(nested)) leaves(nested, [...path, key], out);
  }
  return out;
}

function taxonomyFor(resolveTaxonomy, rawStatId) {
  const result = resolveTaxonomy?.(rawStatId) ?? {};
  const scale = Number(result.scale ?? 1);
  return {
    canonicalStatId: result.canonicalStatId ?? rawStatId,
    displayName: result.displayName ?? rawStatId,
    unit: result.unit ?? "raw",
    scale: Number.isFinite(scale) && scale !== 0 ? scale : 1,
    attackScope: result.attackScope ?? "all",
    context: result.context ?? "general",
    labelSource: result.labelSource ?? "raw_game_id",
    labelStatus: result.labelStatus ?? "unmapped",
  };
}

function statFamily(canonicalStatId) {
  for (const family of ["heavy_attack_chance", "heavy_attack_evasion", "critical_hit_chance", "endurance", "hit_chance", "evasion", "defense"]) {
    if (canonicalStatId === family || canonicalStatId.endsWith(`_${family}`)) return family;
  }
  return canonicalStatId;
}

function makeRow(item, component, rawStatId, valueRaw, location, options) {
  if (valueRaw === 0) return null;
  const taxonomy = taxonomyFor(options.resolveTaxonomy, rawStatId);
  const level = location.level ?? null;
  const rank = location.rank ?? null;
  const context = {
    category: item.equipmentType ?? null,
    armorCategory: item.armorCategory || null,
    component,
    ...(location.context ?? {}),
  };
  const evidence = {
    projection: "equipment",
    projectionPath: location.projectionPath,
    rawStatId,
    valueRaw,
    taxonomy: {
      labelSource: taxonomy.labelSource,
      labelStatus: taxonomy.labelStatus,
      scale: taxonomy.scale,
    },
  };
  return {
    statSourceId: stableId([options.gameBuild, "equipment", item.id, component, rawStatId, level ?? "", rank ?? "", location.projectionPath]),
    canonicalStatId: taxonomy.canonicalStatId,
    statFamilyId: statFamily(taxonomy.canonicalStatId),
    rawStatId,
    displayName: taxonomy.displayName,
    sourceType: "equipment",
    sourceId: item.id,
    sourceName: item.name,
    sourceComponent: component,
    valueRaw,
    value: valueRaw * taxonomy.scale,
    unit: taxonomy.unit,
    level,
    rank,
    attackScope: taxonomy.attackScope,
    contextJson: JSON.stringify(context),
    conditionsJson: JSON.stringify(location.conditions ?? {}),
    sourceTable: "web.projection.equipment",
    sourcePath: options.sourcePath,
    gameBuild: options.gameBuild,
    confidence: "verified_projection",
    evidenceJson: JSON.stringify(evidence),
  };
}

function curveRows(item, component, curve, basePath, options) {
  const rows = [];
  for (const [levelText, stats] of Object.entries(curve ?? {})) {
    const level = Number(levelText);
    if (!Number.isFinite(level)) continue;
    for (const leaf of leaves(stats)) {
      const row = makeRow(item, component, leaf.rawStatId, leaf.valueRaw, {
        level,
        projectionPath: `${basePath}.${levelText}.${leaf.path.join(".")}`,
      }, options);
      if (row) rows.push(row);
    }
  }
  return rows;
}

function rankedRows(item, component, groups, basePath, options, conditions = {}) {
  const rows = [];
  for (const [rawStatId, values] of Object.entries(groups ?? {})) {
    const tiers = Array.isArray(values) ? values : values?.tiers;
    if (!Array.isArray(tiers)) continue;
    for (let index = 0; index < tiers.length; index++) {
      const valueRaw = finite(tiers[index]);
      if (valueRaw === null) continue;
      const row = makeRow(item, component, rawStatId, valueRaw, {
        rank: index + 1,
        projectionPath: `${basePath}.${rawStatId}.${Array.isArray(values) ? index : `tiers.${index}`}`,
        conditions: {
          ...conditions,
          ...(values?.probability !== undefined ? { rollProbability: values.probability } : {}),
        },
      }, options);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export function equipmentStatSources(item, options) {
  const stats = item?.itemStats ?? {};
  return [
    ...curveRows(item, "main_curve", stats.main, "itemStats.main", options),
    ...curveRows(item, "extra_curve", stats.extra, "itemStats.extra", options),
    ...rankedRows(item, "trait", stats.traits, "itemStats.traits", options, { optional: true }),
    ...rankedRows(item, "resonance", stats.resonance, "itemStats.resonance", options, { optional: true, randomized: true }),
    ...rankedRows(item, "unique_trait", stats.uniqueTraits, "itemStats.uniqueTraits", options, { optional: true }),
  ];
}

export function buildEquipmentStatSources(items, options) {
  return items.flatMap((item) => equipmentStatSources(item, options));
}

export function masteryStatSources(mastery, options) {
  const rows = [];
  for (let rankIndex = 0; rankIndex < (mastery?.stats ?? []).length; rankIndex++) {
    for (let statIndex = 0; statIndex < (mastery.stats[rankIndex] ?? []).length; statIndex++) {
      const stat = mastery.stats[rankIndex][statIndex];
      const valueRaw = finite(stat?.value);
      if (!stat?.statId || valueRaw === null || valueRaw === 0) continue;
      const taxonomy = taxonomyFor(options.resolveTaxonomy, stat.statId);
      const rank = rankIndex + 1;
      const projectionPath = `masteries.${mastery.id}.stats.${rankIndex}.${statIndex}`;
      rows.push({
        statSourceId: stableId([options.gameBuild, "mastery", mastery.id, stat.statId, rank]),
        canonicalStatId: taxonomy.canonicalStatId,
        statFamilyId: statFamily(taxonomy.canonicalStatId),
        rawStatId: stat.statId,
        displayName: taxonomy.displayName,
        sourceType: "mastery",
        sourceId: mastery.id,
        sourceName: mastery.name,
        sourceComponent: "rank",
        valueRaw,
        value: valueRaw * taxonomy.scale,
        unit: taxonomy.unit,
        level: null,
        rank,
        attackScope: taxonomy.attackScope,
        contextJson: JSON.stringify({ weapon: mastery.mainCategory, tree: mastery.subCategory, weaponActivatedOnly: Boolean(mastery.weaponActivatedOnly) }),
        conditionsJson: JSON.stringify({ requiresMasteryRank: rank, disabled: Boolean(mastery.isDisabled) }),
        sourceTable: "web.projection.progression",
        sourcePath: options.sourcePath,
        gameBuild: options.gameBuild,
        confidence: "verified_projection",
        evidenceJson: JSON.stringify({
          projection: "progression",
          projectionPath,
          rawStatId: stat.statId,
          valueRaw,
          taxonomy: { labelSource: taxonomy.labelSource, labelStatus: taxonomy.labelStatus, scale: taxonomy.scale },
        }),
      });
    }
  }
  return rows;
}

export function buildMasteryStatSources(masteries, options) {
  return masteries.flatMap((mastery) => masteryStatSources(mastery, options));
}
