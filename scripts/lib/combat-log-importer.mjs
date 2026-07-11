import { createHash } from "node:crypto";

export const COMBAT_LOG_IMPORT_SCHEMA = "tl-helper.combat-log-import";
export const COMBAT_LOG_IMPORT_SCHEMA_VERSION = 1;

const VERSION_READERS = new Map([[4, readVersion4]]);
const KNOWN_EFFECT_MAPPINGS = Object.freeze({
  "24118850": Object.freeze({
    "950004896": Object.freeze({ abilityId: "judgment-lightning", skillSetId: "WP_ST_S_PowerAttack", castVariant: "first_cast", confidence: "confirmed" }),
    "968485880": Object.freeze({ abilityId: "judgment-lightning", skillSetId: "WP_ST_S_PowerAttack_2", castVariant: "conditional_second_cast", confidence: "confirmed" }),
  }),
});

function fail(message) { throw new Error(`Combat log import: ${message}`); }

function parseCsv(line) {
  const fields = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { fields.push(field); field = ""; }
    else field += character;
  }
  if (quoted) fail("contains an unterminated quoted CSV field");
  fields.push(field);
  return fields;
}

function parsePositiveInteger(value, label) {
  if (!/^\d+$/.test(String(value))) fail(`${label} must be decimal digits`);
  const result = Number(value);
  if (!Number.isSafeInteger(result)) fail(`${label} is outside the safe integer range`);
  return result;
}

function parseFlag(value, label) {
  if (value !== "0" && value !== "1") fail(`${label} must be 0 or 1`);
  return value === "1";
}

function parseTimestamp(value) {
  if (!/^\d{8}-\d{2}:\d{2}:\d{2}:\d{3}$/.test(value)) fail(`invalid timestamp ${value}`);
  return value;
}

function requireText(value, label) {
  const result = String(value ?? "").trim();
  if (!result) fail(`${label} is required`);
  return result;
}

function parseHeader(source) {
  const [first, ...records] = source.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const header = parseCsv(first ?? "");
  if (header[0] !== "CombatLogVersion" || header.length !== 2) fail("must begin with CombatLogVersion,<version>");
  return { formatVersion: parsePositiveInteger(header[1], "CombatLogVersion"), records };
}

function mapEffect(gameBuild, effectId) {
  const mapped = KNOWN_EFFECT_MAPPINGS[gameBuild]?.[effectId];
  return mapped ? { ...mapped } : null;
}

function readVersion4(lines, gameBuild) {
  return lines.map((line, index) => {
    const fields = parseCsv(line);
    if (fields.length !== 10) fail(`version 4 record ${index + 1} has ${fields.length} fields, expected 10`);
    const [timestamp, logType, skillName, effectId, damage, hitCritical, hitDouble, hitType, casterName, targetName] = fields;
    const normal = !parseFlag(hitCritical, `record ${index + 1} HitCritical`);
    const heavy = parseFlag(hitDouble, `record ${index + 1} HitDouble`);
    const normalizedEffectId = String(parsePositiveInteger(effectId, `record ${index + 1} SkillId`));
    return Object.freeze({
      sequence: index + 1,
      timestamp: parseTimestamp(timestamp),
      logType: requireText(logType, `record ${index + 1} LogType`),
      localizedSkillName: requireText(skillName, `record ${index + 1} SkillName`),
      effectId: normalizedEffectId,
      damage: String(parsePositiveInteger(damage, `record ${index + 1} Damage`)),
      outcomes: Object.freeze({ normal, critical: !normal, heavy }),
      hitType: requireText(hitType, `record ${index + 1} HitType`),
      casterName: requireText(casterName, `record ${index + 1} CasterName`),
      targetName: requireText(targetName, `record ${index + 1} TargetName`),
      ...(mapEffect(gameBuild, normalizedEffectId) ? { abilityMapping: Object.freeze(mapEffect(gameBuild, normalizedEffectId)) } : {}),
    });
  });
}

function summarize(records) {
  const eventTypes = {};
  const outcomeCounts = { normalNonHeavy: 0, normalHeavy: 0, criticalNonHeavy: 0, criticalHeavy: 0 };
  const effectIds = {};
  let totalDamage = 0n;
  for (const record of records) {
    eventTypes[record.logType] = (eventTypes[record.logType] ?? 0) + 1;
    effectIds[record.effectId] = (effectIds[record.effectId] ?? 0) + 1;
    totalDamage += BigInt(record.damage);
    const key = `${record.outcomes.critical ? "critical" : "normal"}${record.outcomes.heavy ? "Heavy" : "NonHeavy"}`;
    outcomeCounts[key] += 1;
  }
  return Object.freeze({
    recordCount: records.length,
    totalDamage: totalDamage.toString(),
    eventTypes: Object.freeze(eventTypes),
    outcomeCounts: Object.freeze(outcomeCounts),
    effectIds: Object.freeze(effectIds),
  });
}

/** Parses a build-scoped client combat log without claiming unobserved mechanics. */
export function importCombatLog({ source, gameBuild, sourcePath = null }) {
  const build = requireText(gameBuild, "gameBuild");
  const text = String(source ?? "");
  if (!text.trim()) fail("source is empty");
  const { formatVersion, records: rawRecords } = parseHeader(text);
  const reader = VERSION_READERS.get(formatVersion);
  if (!reader) fail(`unsupported CombatLogVersion ${formatVersion}`);
  const records = Object.freeze(reader(rawRecords, build));
  const sha256 = createHash("sha256").update(text, "utf8").digest("hex").toUpperCase();
  return Object.freeze({
    schema: COMBAT_LOG_IMPORT_SCHEMA,
    schemaVersion: COMBAT_LOG_IMPORT_SCHEMA_VERSION,
    gameBuild: build,
    source: Object.freeze({ formatVersion, sha256, ...(sourcePath ? { path: String(sourcePath) } : {}) }),
    records,
    summary: summarize(records),
    limitations: Object.freeze([
      "Numeric effect IDs and localized skill names are preserved separately.",
      "Per-hit records do not prove a whole-ability total or server-side modifier order.",
      "Outcome counts may be correlated within multi-hit abilities and are not independent chance trials.",
    ]),
  });
}
