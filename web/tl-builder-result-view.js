// Dense, game-inspired presentation helpers for full-build optimizer results.
// Pure HTML renderers keep the Builder shell and optimizer engine independent.

const ATTRIBUTE_IDS = ["str", "dex", "int", "per", "con"];
const ATTRIBUTE_LABELS = { str: "STR", dex: "DEX", int: "INT", per: "PER", con: "CON" };
const THRESHOLDS = [30, 40, 50, 60, 70, 80, 100, 120];
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function attributeTotal(result, id) {
  const row = (result.allStats ?? []).find((stat) => stat.id === id);
  return Number(row?.value ?? result.attributeTotals?.[id] ?? result.optimizedAttributes?.[id] ?? 0);
}

function breakpointMap(result) {
  const map = new Map();
  for (const row of result.activeAttributeBreakpoints ?? []) map.set(`${row.attributeId}:${row.threshold}`, row);
  return map;
}

export function renderCompactAttributeTracks(result = {}) {
  const active = breakpointMap(result);
  const allocation = result.optimizedAttributes ?? {};
  return `<div class="tlb-attribute-tracks">${ATTRIBUTE_IDS.map((id) => {
    const total = attributeTotal(result, id);
    const activated = THRESHOLDS.filter((threshold) => active.has(`${id}:${threshold}`));
    const next = THRESHOLDS.find((threshold) => threshold > total);
    const max = THRESHOLDS.at(-1);
    const bonusText = activated.flatMap((threshold) => (active.get(`${id}:${threshold}`)?.bonuses ?? []).map((bonus) => `${bonus.name} ${bonus.formattedValue}`));
    return `<section class="tlb-attribute-track"><div class="tlb-attribute-head"><b>${ATTRIBUTE_LABELS[id]}</b><strong>${esc(total)}</strong><small>${esc(allocation[id] ?? 0)} allocated${next ? ` · ${Math.max(0, next - total)} to ${next}` : " · all milestones reached"}</small></div><div class="tlb-track"><i style="width:${Math.max(0, Math.min(100, total / max * 100))}%"></i>${THRESHOLDS.map((threshold) => `<span class="${threshold <= total ? "is-active" : ""}" style="left:${threshold / max * 100}%" title="${ATTRIBUTE_LABELS[id]} ${threshold}"></span>`).join("")}</div>${bonusText.length ? `<div class="tlb-breakpoint-bonuses">${bonusText.map((text) => `<span>${esc(text)}</span>`).join("")}</div>` : ""}</section>`;
  }).join("")}</div>`;
}

export function normalizeStatGroups(allStats = []) {
  const groups = new Map();
  for (const row of allStats) {
    if (!row?.id || !Number.isFinite(Number(row.value))) continue;
    const group = String(row.group ?? row.category ?? "Other").trim() || "Other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(row);
  }
  return [...groups].map(([name, rows]) => ({ name, rows: rows.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.id).localeCompare(String(b.id))) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function renderDenseStatLedger(allStats = []) {
  const groups = normalizeStatGroups(allStats);
  if (!groups.length) return `<div class="tlb-result-empty">No calculated stats were returned.</div>`;
  return `<div class="tlb-stat-ledger">${groups.map((group) => `<details open><summary><span>${esc(group.name)}</span><small>${group.rows.length}</small></summary><div>${group.rows.map((row) => `<p data-stat-id="${esc(row.id)}"><span>${esc(row.name ?? row.id)}</span><b>${esc(row.formattedValue ?? row.value)}</b></p>`).join("")}</div></details>`).join("")}</div>`;
}

function loadoutRows(loadout) {
  return Array.isArray(loadout) ? loadout : Object.entries(loadout ?? {}).map(([id, row]) => ({ id, ...(row ?? {}) }));
}

export function renderGearResultAccess(result = {}) {
  const rows = [...loadoutRows(result.loadout?.equipment), ...loadoutRows(result.loadout?.artifacts)];
  return `<div class="tlb-result-gear">${rows.map((row) => {
    const selection = row.selection ?? row;
    const slotId = row.id ?? row.slotId;
    return `<button type="button" data-result-slot="${esc(slotId)}" data-builder-item-hover data-slot-id="${esc(slotId)}"><i>${row.imageUrl ? `<img src="${esc(row.imageUrl)}" alt="">` : ""}</i><span><small>${esc(row.label ?? slotId)}</small><b>${esc(row.name ?? selection.itemName ?? "Empty")}</b></span></button>`;
  }).join("")}</div>`;
}

export function renderSystemsResultAccess(result = {}, { runeName = (id) => id } = {}) {
  const equipment = loadoutRows(result.loadout?.equipment);
  const runes = equipment.flatMap((row) => (row.selection ?? row).runes ?? []).filter((row) => row.runeId);
  const sets = result.sets ?? result.setEffects ?? [];
  const artifacts = loadoutRows(result.loadout?.artifacts);
  return `<div class="tlb-result-systems"><section><h3>Equipment Sets</h3>${sets.length ? `<ul>${sets.map((row) => `<li>${esc(typeof row === "string" ? row : row.name ?? row.text ?? row.setId)}</li>`).join("")}</ul>` : `<p>Known set thresholds were included in the complete-loadout calculation.</p>`}</section><section><h3>Runes</h3><strong>${runes.length} sockets configured</strong>${runes.length ? `<ul>${runes.map((row) => `<li>${esc(runeName(row.runeId))}</li>`).join("")}</ul>` : ""}</section><section><h3>Artifacts</h3><strong>${artifacts.length}/6 equipped</strong><p>Open Gear to inspect each artifact and its active set thresholds.</p></section><section><h3>Heroics</h3><p>Open Gear and hover a Heroic item to inspect its selected trait, effects, levels, and runes.</p></section></div>`;
}

export const BUILDER_RESULT_TABS = Object.freeze([
  { id: "overview", label: "Overview" },
  { id: "attributes", label: "Attributes" },
  { id: "stats", label: "All Stats" },
  { id: "gear", label: "Gear" },
  { id: "systems", label: "Sets & Runes" },
]);

export const BUILDER_RESULT_VIEW_CSS = `
.tlb-attribute-tracks{display:grid;gap:7px}.tlb-attribute-track{padding:8px 10px;border:1px solid rgba(212,166,94,.14);border-radius:8px;background:rgba(8,6,4,.34)}.tlb-attribute-head{display:grid;grid-template-columns:38px 42px minmax(0,1fr);gap:8px;align-items:baseline}.tlb-attribute-head>b{color:#d4a65e;font-size:10px;letter-spacing:.1em}.tlb-attribute-head>strong{color:#f6d391;font:18px Marcellus,serif}.tlb-attribute-head>small{overflow:hidden;color:#8f8068;font-size:9px;text-overflow:ellipsis;white-space:nowrap}.tlb-track{position:relative;height:5px;margin:6px 3px 4px;border-radius:99px;background:#241b10}.tlb-track>i{position:absolute;inset:0 auto 0 0;border-radius:inherit;background:linear-gradient(90deg,#936b34,#f0c871)}.tlb-track>span{position:absolute;top:50%;width:7px;height:7px;border:1px solid #6e5b3e;border-radius:50%;background:#171007;transform:translate(-50%,-50%)}.tlb-track>span.is-active{border-color:#f6d391;background:#d4a65e;box-shadow:0 0 6px rgba(246,211,145,.45)}.tlb-breakpoint-bonuses{display:flex;flex-wrap:wrap;gap:4px}.tlb-breakpoint-bonuses>span{padding:2px 5px;border:1px solid rgba(126,224,166,.17);border-radius:4px;color:#9fc8ae;font-size:8.5px}.tlb-stat-ledger{columns:3 220px;column-gap:8px}.tlb-stat-ledger details{break-inside:avoid;margin:0 0 8px;border:1px solid rgba(212,166,94,.13);border-radius:7px;background:rgba(8,6,4,.3)}.tlb-stat-ledger summary{display:flex;justify-content:space-between;padding:7px 9px;color:#d4a65e;font-size:10px;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.tlb-stat-ledger summary small{color:#75664f}.tlb-stat-ledger details>div{padding:0 9px 5px}.tlb-stat-ledger p{display:flex;justify-content:space-between;gap:10px;margin:0;padding:3px 0;border-top:1px solid rgba(212,166,94,.055);font-size:10px}.tlb-stat-ledger p>span{min-width:0;overflow:hidden;color:#aa9877;text-overflow:ellipsis;white-space:nowrap}.tlb-stat-ledger p>b{flex:none;color:#eadcbc;font-weight:600;font-variant-numeric:tabular-nums}.tlb-result-gear{display:grid;grid-template-columns:repeat(auto-fill,minmax(185px,1fr));gap:6px}.tlb-result-gear button{display:flex;align-items:center;gap:8px;min-width:0;padding:7px;border:1px solid rgba(212,166,94,.14);border-radius:7px;background:rgba(8,6,4,.32);color:inherit;text-align:left}.tlb-result-gear i{width:34px;height:34px;flex:none;border-radius:7px;background:#171209}.tlb-result-gear img{width:100%;height:100%;object-fit:cover;border-radius:inherit}.tlb-result-gear span{min-width:0}.tlb-result-gear small,.tlb-result-gear b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tlb-result-gear small{color:#8a795f;font-size:8px;text-transform:uppercase}.tlb-result-gear b{color:#e6d6b4;font-size:10.5px}.tlb-result-systems{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:7px}.tlb-result-systems section{padding:9px;border:1px solid rgba(212,166,94,.14);border-radius:8px;background:rgba(8,6,4,.32)}.tlb-result-systems h3{margin:0 0 5px;color:#d4a65e;font-size:12px}.tlb-result-systems p,.tlb-result-systems li,.tlb-result-systems strong{color:#aa9877;font-size:9.5px;line-height:1.4}.tlb-result-systems ul{margin:5px 0 0;padding-left:15px}.tlb-result-empty{padding:20px;color:#8a795f;text-align:center}@media(max-width:700px){.tlb-stat-ledger{columns:1}.tlb-attribute-head{grid-template-columns:34px 38px minmax(0,1fr)}}`;

export function installBuilderResultStyles(doc = document) {
  const id = "tl-builder-result-view-styles";
  const existing = doc.getElementById(id);
  if (existing) return existing;
  const style = doc.createElement("style");
  style.id = id;
  style.textContent = BUILDER_RESULT_VIEW_CSS;
  doc.head.append(style);
  return style;
}
