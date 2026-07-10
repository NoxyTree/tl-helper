const PLACEHOLDER_PATTERN = /\$\[([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)/g;

export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += char;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export function extractPlaceholders(text) {
  const found = [];
  for (const match of String(text ?? "").matchAll(PLACEHOLDER_PATTERN)) {
    found.push({ base: match[1], field: match[2], expression: match[0] });
  }
  return found;
}

// Verified convention: WP_BO_S_PowerShot -> BO_PowerShot and
// WP_WA_GR_S_PartyCurseBurst -> WA_PartyCurseBurst. The first token is the
// weapon kit; the portion after the final _S_ is the formula stem. Older rows
// without _S_ use their final semantic token.
export function deriveFormulaPrefix(skillId) {
  const raw = String(skillId).replace(/^SkillSet_/, "").replace(/^WP_/, "");
  const kit = raw.split("_")[0];
  if (!kit) return null;
  const marker = raw.lastIndexOf("_S_");
  const stem = marker >= 0 ? raw.slice(marker + 3) : raw.slice(raw.lastIndexOf("_") + 1);
  return stem && stem !== kit ? `${kit}_${stem}` : null;
}

export function formulaRowsForPrefix(formulaIds, prefix) {
  if (!prefix) return [];
  return formulaIds.filter((id) => id === prefix || id.startsWith(`${prefix}_`));
}

export function buildSkillMapping({ skills, localizationRows, formulaRows }) {
  const formulaIds = Object.keys(formulaRows).sort();
  return skills.map((skill) => {
    const skillId = String(skill.id).replace(/^SkillSet_/, "");
    const relatedLocalization = localizationRows.filter((row) => row.key.includes(skillId));
    const placeholderEvidence = new Map();
    for (const row of relatedLocalization) {
      for (const placeholder of extractPlaceholders(row.text)) {
        const evidence = placeholderEvidence.get(placeholder.base) ?? [];
        evidence.push({ namespace: row.namespace, key: row.key, field: placeholder.field });
        placeholderEvidence.set(placeholder.base, evidence);
      }
    }

    const exactIds = [...placeholderEvidence.keys()].filter((id) => formulaRows[id]).sort();
    const unresolvedPlaceholders = [...placeholderEvidence.keys()].filter((id) => !formulaRows[id]).sort();
    const derivedPrefix = deriveFormulaPrefix(skillId);
    const derivedIds = formulaRowsForPrefix(formulaIds, derivedPrefix)
      .filter((id) => !exactIds.includes(id));
    const allIds = [...exactIds, ...derivedIds];
    const classification = exactIds.length ? "exact" : derivedIds.length ? "derived" : "unresolved";

    return {
      skillSetId: skill.id,
      skillId,
      name: skill.name ?? null,
      category: skill.mainCategory ?? null,
      skillType: skill.skillType ?? null,
      classification,
      derivedPrefix,
      localizationKeysInspected: relatedLocalization.map((row) => `${row.namespace}|${row.key}`).sort(),
      unresolvedPlaceholders,
      formulaRows: allIds.map((formulaRowId) => ({
        formulaRowId,
        mappingClass: exactIds.includes(formulaRowId) ? "exact" : "derived",
        evidence: placeholderEvidence.get(formulaRowId) ?? [{ convention: `${skillId} -> ${derivedPrefix}` }],
        levels: formulaRows[formulaRowId].FormulaParameter ?? [],
      })),
    };
  });
}
