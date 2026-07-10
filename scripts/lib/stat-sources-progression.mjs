import { createHash } from "node:crypto";

const ATTRIBUTE_NAMES = {
  str: "Strength",
  dex: "Dexterity",
  int: "Wisdom",
  per: "Perception",
  con: "Fortitude",
};

function titleCase(value) {
  return String(value).replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stableId(parts) {
  return createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0, 24);
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

function makeRow({
  rawStatId, valueRaw, sourceType, sourceId, sourceName, sourceComponent,
  level = null, rank = null, context = {}, conditions = {}, sourceTable,
  sourcePath, confidence, evidence = {},
}, options) {
  const numeric = finite(valueRaw);
  if (!rawStatId || numeric === null || numeric === 0) return null;
  const taxonomy = taxonomyFor(options.resolveTaxonomy, rawStatId);
  return {
    statSourceId: stableId([options.gameBuild, sourceType, sourceId, sourceComponent, rawStatId, level ?? "", rank ?? "", JSON.stringify(context), JSON.stringify(conditions)]),
    canonicalStatId: taxonomy.canonicalStatId,
    statFamilyId: statFamily(taxonomy.canonicalStatId),
    rawStatId,
    displayName: taxonomy.displayName,
    sourceType,
    sourceId,
    sourceName,
    sourceComponent,
    valueRaw: numeric,
    value: numeric * taxonomy.scale,
    unit: taxonomy.unit,
    level,
    rank,
    attackScope: taxonomy.attackScope,
    contextJson: JSON.stringify(context),
    conditionsJson: JSON.stringify(conditions),
    sourceTable,
    sourcePath,
    gameBuild: options.gameBuild,
    confidence,
    evidenceJson: JSON.stringify({
      ...evidence,
      rawStatId,
      valueRaw: numeric,
      taxonomy: { labelSource: taxonomy.labelSource, labelStatus: taxonomy.labelStatus, scale: taxonomy.scale },
    }),
  };
}

function setRows(set, bonuses, sourceType, component, options) {
  const rows = [];
  for (let bonusIndex = 0; bonusIndex < (bonuses ?? []).length; bonusIndex++) {
    const bonus = bonuses[bonusIndex];
    const requiredPieces = finite(bonus?.set_count ?? bonus?.setCount);
    for (let statIndex = 0; statIndex < (bonus?.bonus_stat ?? bonus?.bonusStat ?? []).length; statIndex++) {
      const stat = (bonus.bonus_stat ?? bonus.bonusStat)[statIndex];
      const row = makeRow({
        rawStatId: stat?.type,
        valueRaw: stat?.value,
        sourceType,
        sourceId: set.id,
        sourceName: set.name,
        sourceComponent: component,
        rank: requiredPieces,
        context: { grade: set.grade ?? null },
        conditions: { requiredSetPieces: requiredPieces },
        sourceTable: "web.projection.equipment",
        sourcePath: options.sourcePath,
        confidence: "verified_projection",
        evidence: {
          projection: "equipment",
          projectionPath: `${options.projectionCollection}.${bonusIndex}.bonus_stat.${statIndex}`,
          semanticScope: "direct_numeric_bonus_only",
        },
      }, options);
      if (row) rows.push(row);
    }
  }
  return rows;
}

export function itemSetStatSources(set, options) {
  return setRows(set, set?.itemSetBonus, "item_set", "set_bonus", {
    ...options,
    projectionCollection: `itemSets.${set?.id}.itemSetBonus`,
  });
}

export function isArtifactItemSet(set) {
  const members = set?.itemSetMadeOfItems ?? [];
  return members.length > 0 && members.every((member) => /^(?:talistone|gemstone)\d+$/i.test(member?.sub_category ?? member?.subCategory ?? ""));
}

export function buildItemSetStatSources(sets, options) {
  // The equipment projection also retains artifact sets in itemSets. They are
  // indexed through artifactSets below, so exclude their clearly typed member
  // layouts here to avoid duplicate source rows.
  return (sets ?? []).filter((set) => !isArtifactItemSet(set)).flatMap((set) => itemSetStatSources(set, options));
}

export function artifactSetStatSources(set, options) {
  return setRows(set, set?.bonuses, "artifact_set", "set_bonus", {
    ...options,
    projectionCollection: `artifactSets.${set?.id}.bonuses`,
  });
}

export function buildArtifactSetStatSources(sets, options) {
  return (sets ?? []).flatMap((set) => artifactSetStatSources(set, options));
}

export function attributeCurveStatSources(attributeStats, options) {
  const rows = [];
  for (const [attributeId, levels] of Object.entries(attributeStats ?? {})) {
    for (const [levelText, stats] of Object.entries(levels ?? {})) {
      const level = finite(levelText);
      if (level === null) continue;
      for (const [rawStatId, rawValue] of Object.entries(stats ?? {})) {
        const variants = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
          ? Object.entries(rawValue).map(([weaponType, valueRaw]) => ({ weaponType, valueRaw }))
          : [{ weaponType: null, valueRaw: rawValue }];
        for (const { weaponType, valueRaw } of variants) {
          const row = makeRow({
            rawStatId,
            valueRaw,
            sourceType: "attribute_progression",
            sourceId: attributeId,
            sourceName: ATTRIBUTE_NAMES[attributeId] ?? attributeId.toUpperCase(),
            sourceComponent: "cumulative_curve",
            level,
            context: { attributeId, ...(weaponType ? { weaponType } : {}) },
            conditions: { requiresAttributeTotal: level, cumulativeValue: true, ...(weaponType ? { equippedMainWeaponType: weaponType } : {}) },
            sourceTable: "web.projection.progression",
            sourcePath: options.sourcePath,
            confidence: "verified_projection",
            evidence: {
              projection: "progression",
              projectionPath: `attributeStats.${attributeId}.${levelText}.${rawStatId}${weaponType ? `.${weaponType}` : ""}`,
              semanticScope: "cumulative_attribute_curve",
            },
          }, options);
          if (row) rows.push(row);
        }
      }
    }
  }
  return rows;
}

export function attributeBreakpointStatSources(breakpoints, options) {
  const rows = [];
  for (const [attributeId, thresholds] of Object.entries(breakpoints ?? {})) {
    for (const [thresholdText, stats] of Object.entries(thresholds ?? {})) {
      const threshold = finite(thresholdText);
      if (threshold === null) continue;
      for (const [rawStatId, valueRaw] of Object.entries(stats ?? {})) {
        const row = makeRow({
          rawStatId,
          valueRaw,
          sourceType: "attribute_breakpoint",
          sourceId: `${attributeId}:${threshold}`,
          sourceName: `${ATTRIBUTE_NAMES[attributeId] ?? attributeId.toUpperCase()} ${threshold}`,
          sourceComponent: "threshold_bonus",
          level: threshold,
          context: { attributeId },
          conditions: { requiresAttributeTotal: threshold, stacksWithEarlierBreakpoints: true },
          sourceTable: "questlog.rule.ATTRIBUTE_BREAKPOINTS",
          sourcePath: options.rulesSourcePath,
          confidence: "verified_questlog_rule",
          evidence: {
            ruleExport: "ATTRIBUTE_BREAKPOINTS",
            rulePath: `${attributeId}.${thresholdText}.${rawStatId}`,
            semanticScope: "static_questlog_rule",
          },
        }, options);
        if (row) rows.push(row);
      }
    }
  }
  return rows;
}

export function materialBonusStatSources(materialBonuses, options) {
  const rows = [];
  for (const [weaponType, materials] of Object.entries(materialBonuses ?? {})) {
    for (const [armorMaterial, rule] of Object.entries(materials ?? {})) {
      for (const [rawStatId, valueRaw] of Object.entries(rule?.stats ?? {})) {
        const row = makeRow({
          rawStatId,
          valueRaw,
          sourceType: "weapon_material_bonus",
          sourceId: `${weaponType}:${armorMaterial}`,
          sourceName: `${titleCase(weaponType)} with ${titleCase(armorMaterial)} Armor`,
          sourceComponent: "per_armor_piece",
          context: { weaponType, armorMaterial, effectName: rule.effectName ?? null },
          conditions: {
            equippedWeaponType: weaponType,
            equippedArmorMaterial: armorMaterial,
            appliesPerQualifyingArmorPiece: true,
            appliesForEachEquippedWeapon: true,
            excludesCloaks: true,
          },
          sourceTable: "questlog.rule.ARMOR_MATERIAL_BONUSES",
          sourcePath: options.rulesSourcePath,
          confidence: "verified_questlog_rule",
          evidence: {
            ruleExport: "ARMOR_MATERIAL_BONUSES",
            rulePath: `${weaponType}.${armorMaterial}.stats.${rawStatId}`,
            semanticScope: "static_questlog_rule",
          },
        }, options);
        if (row) rows.push(row);
      }
    }
  }
  return rows;
}
