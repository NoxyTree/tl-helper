export const COMBAT_EFFECT_LINKS_SCHEMA = "tl-helper.combat-effect-links";
export const COMBAT_EFFECT_LINKS_SCHEMA_VERSION = 1;

function fail(message) { throw new Error(`Combat effect links: ${message}`); }

function text(value, label) {
  const result = String(value ?? "").trim();
  if (!result) fail(`${label} is required`);
  return result;
}

function build(value, label) {
  const result = text(value?.gameBuild, `${label}.gameBuild`);
  if (!/^\d+$/.test(result)) fail(`${label}.gameBuild must contain decimal digits`);
  return result;
}

function codepointSort(left, right) { return left < right ? -1 : left > right ? 1 : 0; }

function effectRows(input, requestedBuild) {
  if (input?.table !== "TLEffectProperty") fail("effect table must be TLEffectProperty");
  if (build(input, "effect table") !== requestedBuild) fail("effect table gameBuild does not match requested build");
  if (!input.rows || typeof input.rows !== "object" || Array.isArray(input.rows)) fail("effect table rows are required");
  return Object.entries(input.rows).map(([id, value]) => ({ id, value })).sort((left, right) => codepointSort(left.id, right.id));
}

function abilities(input, requestedBuild) {
  if (input?.schema !== "tl-helper.combat-ability-data") fail("ability artifact schema is unsupported");
  if (build(input, "ability artifact") !== requestedBuild) fail("ability artifact gameBuild does not match requested build");
  if (!Array.isArray(input.abilities)) fail("ability artifact abilities are required");
  return [...input.abilities].sort((left, right) => codepointSort(text(left.id, "ability id"), text(right.id, "ability id")));
}

function conciseEffect(id, value) {
  const uid = value?.UID;
  return Object.freeze({
    effectRowId: id,
    ...(uid === undefined || uid === null ? {} : { uid: String(uid) }),
    group: value?.Group ?? null,
    abnormalStateId: value?.Abnormal ?? null,
    formulaRowId: value?.formula_parameter ?? null,
    damageFloaterType: value?.damage_floater_type ?? null,
    showsHitFloater: value?.show_effect_hit_floater ?? null,
    showsMissFloater: value?.show_effect_miss_floater ?? null,
    projectileType: value?.projectile_type ?? null,
  });
}

function skillPrefix(ability) {
  const value = text(ability.skillSetId, `ability ${ability.id}.skillSetId`);
  return value.startsWith("SkillSet_") ? value.slice("SkillSet_".length) : value;
}

/**
 * Joins client-visible effects to reviewed formula components. The result is
 * extraction evidence only: it never infers action order, proc probability,
 * a whole-ability total, or server-side resolution.
 */
export function buildCombatEffectLinks({ gameBuild, effectTable, abilityArtifact }) {
  const requestedBuild = text(gameBuild, "gameBuild");
  const sourceEffects = effectRows(effectTable, requestedBuild);
  const reviewedAbilities = abilities(abilityArtifact, requestedBuild);

  const result = reviewedAbilities.map((ability) => {
    const prefix = skillPrefix(ability);
    const relatedEffects = sourceEffects
      .filter(({ id }) => id === prefix || id.startsWith(`${prefix}_`))
      .map(({ id, value }) => conciseEffect(id, value));
    const components = (ability.formulaComponents ?? []).map((component) => {
      const formulaRowId = text(component.sourceRow, `ability ${ability.id} component ${component.id}.sourceRow`);
      const linkedEffects = relatedEffects.filter((effect) => effect.formulaRowId === formulaRowId);
      const directDamageEffects = linkedEffects.filter((effect) => effect.group === "EEffectGroup::Direct_Damage");
      return Object.freeze({
        componentId: text(component.id, `ability ${ability.id} component id`),
        role: text(component.role, `ability ${ability.id} component ${component.id}.role`),
        formulaRowId,
        linkedEffects: Object.freeze(linkedEffects),
        directDamageEffects: Object.freeze(directDamageEffects),
        precision: "extracted",
        limitation: "Effect rows establish client-visible links only. They do not establish a whole-ability total, action order, condition evaluation, or server-side modifier order.",
      });
    }).sort((left, right) => codepointSort(left.componentId, right.componentId));
    return Object.freeze({
      abilityId: text(ability.id, "ability id"),
      name: text(ability.name, `ability ${ability.id}.name`),
      skillSetId: text(ability.skillSetId, `ability ${ability.id}.skillSetId`),
      relatedEffects: Object.freeze(relatedEffects),
      components: Object.freeze(components),
      limitations: Object.freeze([
        "Related effect-row names can identify alternatives and conditionals, but do not prove they execute together.",
        "Per-hit direct-damage effects must not be summed into a whole-ability total without an explicit aggregation rule.",
      ]),
    });
  });

  return Object.freeze({
    schema: COMBAT_EFFECT_LINKS_SCHEMA,
    schemaVersion: COMBAT_EFFECT_LINKS_SCHEMA_VERSION,
    gameBuild: requestedBuild,
    source: Object.freeze({
      effectTable: "TLEffectProperty",
      effectTableSha256: effectTable.sha256 ?? null,
      decoderVersion: effectTable.decoderVersion ?? null,
      abilityArtifactSchema: abilityArtifact.schema,
      abilityArtifactSchemaVersion: abilityArtifact.schemaVersion,
    }),
    abilities: Object.freeze(result),
  });
}
