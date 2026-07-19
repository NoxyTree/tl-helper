// Shared, framework-free item hover card for optimizer canvases. The data
// contract is tl-core.buildItemHoverModel; skill-core potential rows are
// intentionally excluded from this presentation.

const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function statRows(rows, kind) {
  return (rows ?? []).map((row) => {
    const rowKind = kind ?? row.kind ?? "core";
    const mark = rowKind === "core" ? "" : rowKind === "resonance" ? "✦" : "◆";
    return `<div class="tlb-hc-stat ${esc(rowKind)}"><span>${mark}</span><span>${esc(row.name)}</span><strong>${esc(row.formattedValue)}</strong></div>`;
  }).join("");
}

function runeRows(rows) {
  return (rows ?? []).map((rune) => rune.empty
    ? `<div class="tlb-hc-rune is-empty"><i></i><span>Empty socket</span></div>`
    : `<div class="tlb-hc-rune"><i style="border-color:${esc(rune.typeColor)}">${rune.hasIcon ? `<img src="${esc(rune.icon)}" alt="">` : ""}<b>${esc(rune.level)}</b></i><span><em style="color:${esc(rune.typeColor)}">${esc(rune.typeLabel)}</em><small>${esc(rune.gradeName)}${rune.maxLevelLabel ? ` · ${esc(rune.maxLevelLabel)}` : ""}</small><strong>${esc(rune.contribution)}</strong></span></div>`).join("");
}

export function renderBuilderItemHover(model) {
  if (!model) return "";
  const sections = [`<header class="tlb-hc-head" style="border-top:${esc(model.headBorder)};background:${esc(model.headBg)}">${model.hasIcon ? `<img src="${esc(model.icon)}" alt="">` : ""}<span><strong style="color:${esc(model.nameColor)}">${esc(model.name)}</strong><small>${esc(model.meta)}</small></span></header>`];
  if (model.hasStats) sections.push(`<section><h3>Stats</h3>${statRows(model.stats)}</section>`);
  if (model.hasTraits) sections.push(`<section><h3>Traits</h3>${statRows(model.traits, "trait")}</section>`);
  if (model.hasUnique) sections.push(`<section class="is-heroic"><h3>Heroic Trait</h3>${statRows(model.unique, "trait")}</section>`);
  if (model.hasHeroicEffects) sections.push(`<section class="is-heroic"><h3>Heroic Effects</h3>${model.heroicEffects.map((row) => `<div class="tlb-hc-heroic"><span>${esc(row.groupNumber)}</span><b>${esc(row.name)}${row.levelKnown ? ` · Lv ${esc(row.level)}` : " · level unknown"}</b><i></i><strong>${row.levelKnown || row.baseValue == null ? esc(row.value) : `${esc(row.baseValue)} base <small>· max ${esc(row.maxValue)}</small>`}</strong></div>`).join("")}</section>`);
  if (model.hasResonance) sections.push(`<section class="is-resonance"><h3>Trait Resonance</h3>${statRows(model.resonance, "resonance")}</section>`);
  const inherentEffects = (model.effects ?? []).filter((effect) => !/skill\s*core/i.test(`${effect.label ?? ""} ${effect.type ?? ""}`));
  if (inherentEffects.length) sections.push(`<section>${inherentEffects.map((effect) => `<div class="tlb-hc-effect">${effect.hasIcon ? `<img src="${esc(effect.icon)}" alt="">` : ""}<span><b>${esc(effect.label)} ${esc(effect.name)}</b><small>${esc(effect.text)}</small></span></div>`).join("")}</section>`);
  if (model.hasRunes) sections.push(`<section><h3>Runes</h3><div class="tlb-hc-runes">${runeRows(model.runes)}</div></section>`);
  if (model.hasSynergy) sections.push(`<section class="is-synergy"><h3>Rune Synergy · ${esc(model.synergyName)}</h3>${(model.synergyStats ?? []).map((text) => `<div class="tlb-hc-line">${esc(text)}</div>`).join("")}</section>`);
  if (model.hasSet) sections.push(`<section><div class="tlb-hc-set-head"><h3>Set Effects</h3><small>${esc(model.setInfo.countLabel)}</small></div><b class="tlb-hc-set-name">${esc(model.setInfo.name)}</b>${(model.setInfo.bonuses ?? []).map((bonus) => `<div class="tlb-hc-bonus ${bonus.active ? "" : "is-inactive"}"><strong style="color:${esc(bonus.color)}">${esc(bonus.mark)} ${esc(bonus.required)}</strong><span>${esc(bonus.text)}${bonus.hasComputed ? `<small style="color:${esc(bonus.color)}">${esc(bonus.computedText)}</small>` : ""}</span></div>`).join("")}</section>`);
  return sections.join("");
}

export function builderHoverPosition(point, cardSize, viewport, gap = 16) {
  const width = Math.min(cardSize.width, viewport.width - 24);
  const left = Math.max(12, Math.min(point.x + gap, viewport.width - width - 12));
  const below = point.y <= viewport.height / 2;
  return below
    ? { left, top: Math.max(12, point.y), bottom: null }
    : { left, top: null, bottom: Math.max(12, viewport.height - point.y) };
}

export const BUILDER_ITEM_HOVER_CSS = `
.tlb-item-hover{position:fixed;z-index:120;width:min(340px,calc(100vw - 24px));max-height:86vh;overflow:auto;pointer-events:none;border:1px solid rgba(212,166,94,.48);border-radius:10px;background:linear-gradient(180deg,rgba(27,20,13,.995),rgba(11,8,5,.995));box-shadow:0 22px 55px rgba(0,0,0,.75);font-family:"Instrument Sans",system-ui,sans-serif;color:#d9c8a5}.tlb-item-hover[hidden]{display:none}.tlb-hc-head{display:flex;align-items:center;gap:11px;padding:12px 14px}.tlb-hc-head>img{width:46px;height:46px;object-fit:cover;border-radius:9px;background:#171209}.tlb-hc-head>span{min-width:0}.tlb-hc-head strong{display:block;font-size:15px;line-height:1.2}.tlb-hc-head small{display:block;margin-top:3px;color:#9d8a68;font-size:10.5px}.tlb-item-hover section{padding:9px 14px;border-top:1px solid rgba(212,166,94,.12)}.tlb-item-hover h3{margin:0 0 6px;color:#cbb185;font:9px/1.3 "Instrument Sans",system-ui,sans-serif;letter-spacing:.16em;text-transform:uppercase}.tlb-hc-stat{display:grid;grid-template-columns:12px minmax(0,1fr) auto;gap:5px;min-height:19px;align-items:baseline;font-size:12px;line-height:1.45}.tlb-hc-stat>span:first-child{color:#d4a65e}.tlb-hc-stat>strong{padding-left:10px;color:#f0e1c1;font-variant-numeric:tabular-nums}.tlb-item-hover .is-heroic{background:rgba(255,152,45,.035)}.tlb-item-hover .is-heroic h3,.tlb-hc-heroic>strong{color:#ffb765}.tlb-item-hover .is-resonance{background:rgba(159,86,214,.055)}.tlb-item-hover .is-resonance h3,.tlb-item-hover .resonance>*{color:#cf9dff}.tlb-hc-heroic{display:flex;align-items:baseline;gap:8px;font-size:11.5px;line-height:1.5}.tlb-hc-heroic>span{color:#8a795f}.tlb-hc-heroic>i{flex:1;border-bottom:1px dotted rgba(255,152,45,.18)}.tlb-hc-effect{display:flex;gap:9px}.tlb-hc-effect>img{width:30px;height:30px;border-radius:50%}.tlb-hc-effect b,.tlb-hc-effect small{display:block}.tlb-hc-effect b{font-size:11.5px}.tlb-hc-effect small{margin-top:2px;color:#a4906d;font-size:10.5px;line-height:1.5}.tlb-hc-runes{display:grid;gap:8px}.tlb-hc-rune{display:flex;align-items:center;gap:9px}.tlb-hc-rune>i{position:relative;width:34px;height:34px;flex:none;border:1.5px solid;border-radius:50%}.tlb-hc-rune img{width:100%;height:100%;object-fit:cover;border-radius:50%}.tlb-hc-rune i>b{position:absolute;right:-4px;bottom:-4px;padding:0 4px;border-radius:999px;background:#0a0805;color:#f3e9d4;font:700 9px/1.4 system-ui}.tlb-hc-rune span>*{display:block}.tlb-hc-rune em{font:700 9px/1.3 system-ui;letter-spacing:.08em}.tlb-hc-rune small{color:#8a795f;font-size:9.5px}.tlb-hc-rune span>strong{font-size:11px}.tlb-hc-rune.is-empty{opacity:.5}.tlb-hc-rune.is-empty i{border-style:dashed;border-color:rgba(212,166,94,.3)}.tlb-item-hover .is-synergy{background:rgba(85,213,138,.06)}.tlb-item-hover .is-synergy h3{color:#7ee0a6}.tlb-hc-line{color:#b9e7cb;font-size:11.5px}.tlb-hc-set-head{display:flex;justify-content:space-between}.tlb-hc-set-head small{color:#8a795f;font-size:10px}.tlb-hc-set-name{display:block;margin-bottom:7px;color:#e5c88f;font-size:12px}.tlb-hc-bonus{display:flex;gap:8px;margin-bottom:3px;font-size:11px;line-height:1.45}.tlb-hc-bonus>strong{flex:none}.tlb-hc-bonus>span{color:#a4906d}.tlb-hc-bonus small{display:block}.tlb-hc-bonus.is-inactive{opacity:.58}`;

export function installBuilderItemHover({ root = document, selector = "[data-builder-item-hover]", getModel, cardId = "builder-item-hover" } = {}) {
  if (typeof getModel !== "function") throw new TypeError("getModel is required");
  const doc = root.ownerDocument ?? root;
  if (!doc.getElementById(`${cardId}-styles`)) {
    const style = doc.createElement("style"); style.id = `${cardId}-styles`; style.textContent = BUILDER_ITEM_HOVER_CSS; doc.head.append(style);
  }
  let card = doc.getElementById(cardId);
  if (!card) { card = doc.createElement("aside"); card.id = cardId; card.className = "tlb-item-hover"; card.hidden = true; card.setAttribute("role", "tooltip"); doc.body.append(card); }
  let active = null;
  const position = (x, y) => { const pos = builderHoverPosition({ x, y }, card.getBoundingClientRect(), { width: innerWidth, height: innerHeight }); card.style.left = `${pos.left}px`; card.style.top = pos.top == null ? "" : `${pos.top}px`; card.style.bottom = pos.bottom == null ? "" : `${pos.bottom}px`; };
  const show = (target, point) => { const model = getModel(target); if (!model) return; active = target; card.innerHTML = renderBuilderItemHover(model); card.hidden = false; target.setAttribute("aria-describedby", cardId); const rect = target.getBoundingClientRect(); position(point?.x ?? rect.right, point?.y ?? rect.top); };
  const hide = () => { active?.removeAttribute("aria-describedby"); active = null; card.hidden = true; };
  root.addEventListener("mouseover", (event) => { const target = event.target.closest?.(selector); if (target && target !== active) show(target, { x: event.clientX, y: event.clientY }); });
  root.addEventListener("mousemove", (event) => { if (active) position(event.clientX, event.clientY); });
  root.addEventListener("mouseout", (event) => { if (active && !active.contains(event.relatedTarget)) hide(); });
  root.addEventListener("focusin", (event) => { const target = event.target.closest?.(selector); if (target) show(target); });
  root.addEventListener("focusout", (event) => { if (active && !active.contains(event.relatedTarget)) hide(); });
  doc.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
  return { card, hide, refresh: () => active && show(active) };
}
