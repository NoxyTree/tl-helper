import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadWebDataFromFile } from "./lib/load-web-projections.mjs";
import {
  ARTIFACT_SLOTS,
  BUILD_SLOTS,
  SUPPORT_SLOTS,
  buildItemHoverModel,
  createInitialBuild,
  formatStat,
  gradeColor,
  gradeName,
  initCore,
  itemMaxLevel,
  label,
  statName,
} from "../web/tl-core.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILD = process.env.TL_STEAM_BUILD ?? "24118850";
const DATA_ROOT = process.env.TL_DATA_ROOT ?? "D:\\TL_Data";
const EXTRACT_ROOT = process.env.TL_EXTRACT_ROOT ?? "D:\\TL_Extracted";
const TABLE_ROOT = path.join(DATA_ROOT, "decoded", BUILD, "tables");
const NPC_ROOT = path.join(DATA_ROOT, "decoded", BUILD, "npc-tables");
const TEXTURE_ROOT = path.join(DATA_ROOT, "raw", BUILD, "extracted", "textures", "TL", "Content");
const OUT_DIR = path.join(ROOT, "out", "local-item-catalogue");
const OUT_FILE = path.join(OUT_DIR, "index.html");
const COMBAT_GEAR_TYPES = new Set([
  "bow", "crossbow", "dagger", "gauntlet", "orb", "spear", "staff", "sword", "sword2h", "wand", "shield",
  "head", "chest", "hands", "legs", "feet", "cloak", "necklace", "bracelet", "belt", "ring", "brooch", "earring",
  "talistone1", "talistone2", "talistone3", "talistone4", "gemstone1", "gemstone2",
]);

async function json(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (value || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

function localizationIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (row.length < 4 || row[0] === "Table") continue;
    index.set(`${row[0]}|${row[1]}`, row.slice(3).join(","));
    if (!index.has(row[1])) index.set(row[1], row.slice(3).join(","));
  }
  return index;
}

function localized(handle, loc) {
  if (!handle || typeof handle !== "object" || !handle.key) return "";
  const table = String(handle.stringTable ?? "").split(/[./]/).filter(Boolean).at(-1) ?? "";
  return loc.get(`${table}|${handle.key}`) ?? loc.get(handle.key) ?? "";
}

function addToMapSet(map, key, value) {
  if (!key || key === "None") return;
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function enumTail(value) {
  return String(value ?? "").split("::").at(-1).replace(/^k/, "");
}

function gearTypeFromId(id) {
  return [...COMBAT_GEAR_TYPES]
    .filter((type) => !/^tali|^gem/.test(type))
    .sort((a, b) => b.length - a.length)
    .find((type) => String(id).toLowerCase().startsWith(`${type}_`)) ?? "";
}

function rawGrade(value) {
  return ({ C: 11, B: 21, A: 41, AA: 42, AAA: 43, S: 51 })[enumTail(value)] ?? 0;
}

function localIcon(looks) {
  const assetPath = looks?.IconPath?.assetPath;
  if (!assetPath) return "";
  const clean = assetPath.split(".")[0].replace(/^\/Game\//, "");
  return pathToFileURL(path.join(TEXTURE_ROOT, `${clean}.png`)).href;
}

function localClassification(id, name) {
  const text = `${id} ${name}`.toLowerCase();
  if (/ramux|s1_arch_002/.test(text)) return "Preloaded named appearance";
  if (/s1_arch|s1_tera/.test(text)) return "Preloaded boss-family appearance";
  return "Named appearance without equipment data";
}

const LOCAL_STAT_LABELS = {
  adjust_fishing_drop_large: "Large Fish Bite Chance",
  adjust_fishing_drop_medium: "Medium Fish Bite Chance",
  adjust_fishing_drop_small: "Small Fish Bite Chance",
  additional_fishing_level: "Additional Fishing Level",
};

function localBaseStats(equip, itemStatRows, mainStatRows) {
  const itemStats = itemStatRows[equip.item_stat_id] ?? itemStatRows[equip.group_id];
  if (!itemStats?.main_stat_base_id) return [];
  const seed = Number(itemStats.main_stat_base_seed || 1);
  const base = mainStatRows.find((row) => row.id === itemStats.main_stat_base_id && Number(row.seed) === seed);
  if (!base) return [];
  const ignored = new Set(["Name", "id", "seed", "feature_tag", "publisher_tag"]);
  return Object.entries(base).flatMap(([statId, rawValue]) => {
    const value = Number(rawValue);
    if (ignored.has(statId) || !Number.isFinite(value) || value === 0) return [];
    const fishingChance = statId.startsWith("adjust_fishing_drop_");
    return [{
      statId,
      value,
      kind: "local_base",
      name: LOCAL_STAT_LABELS[statId] ?? statName(statId),
      formattedValue: fishingChance ? `${value / 1000}%` : formatStat(statId, value),
      evidence: `TLItemStats.${equip.item_stat_id} → TLItemMainStatInit.${itemStats.main_stat_base_id}[seed=${seed}]`,
    }];
  });
}

function slotFor(item) {
  return BUILD_SLOTS.find((slot) => slot.types.includes(item.equipmentType))?.id ?? "main_hand";
}

function cardModel(item) {
  const slotId = slotFor(item);
  const build = createInitialBuild();
  const collection = ARTIFACT_SLOTS.some((slot) => slot.id === slotId)
    ? build.artifacts
    : SUPPORT_SLOTS.some((slot) => slot.id === slotId)
      ? build.supportSlots
      : build.equipment;
  collection[slotId] = { ...collection[slotId], itemId: item.id, level: itemMaxLevel(item) };
  const model = buildItemHoverModel(slotId, build, null, { optionalFallback: true });
  return {
    id: item.id,
    name: item.name,
    grade: item.grade ?? 0,
    gradeName: gradeName(item.grade),
    color: gradeColor(item.grade),
    type: label(item.equipmentType),
    typeKey: item.equipmentType,
    level: itemMaxLevel(item),
    icon: pathToFileURL(path.join(ROOT, "web", item.imageUrl)).href,
    status: "Questlog catalogue",
    statusKey: "questlog",
    stats: model?.stats ?? [],
    traits: model?.traits ?? [],
    unique: model?.unique ?? [],
    resonance: model?.resonance ?? [],
    runeSlots: model?.hasRunes ? model.runes.length : 0,
    effects: model?.effects ?? [],
    setInfo: model?.setInfo ?? null,
  };
}

function buildAcquisitionIndex({ publicGroups, privateGroups, units, npcRewards, craftingRows, npcById, loc }) {
  const itemToUnits = new Map();
  for (const [unitId, row] of Object.entries(units)) {
    for (const entry of row.ItemLotteryUnitEntry ?? []) addToMapSet(itemToUnits, entry.item, unitId);
  }
  const unitToPrivate = new Map();
  for (const [privateId, row] of Object.entries(privateGroups)) {
    for (const entry of row.ItemLotteryPrivateGroupEntry ?? []) addToMapSet(unitToPrivate, entry.id, privateId);
  }
  const targetToPublic = new Map();
  for (const [publicId, row] of Object.entries(publicGroups)) {
    for (const entry of row.ItemLotteryPublicGroupEntry ?? []) addToMapSet(targetToPublic, entry.id, publicId);
  }
  const publicToNpc = new Map();
  for (const [npcId, row] of Object.entries(npcRewards)) {
    for (const publicId of Object.values(row.public_lottery_group_id ?? {})) addToMapSet(publicToNpc, publicId, npcId);
  }
  const craftByItem = new Map();
  for (const [recipeId, row] of Object.entries(craftingRows)) addToMapSet(craftByItem, row.ResultItem, recipeId);

  return (itemId) => {
    const unitIds = itemToUnits.get(itemId) ?? new Set();
    const privateIds = new Set();
    for (const unitId of unitIds) for (const privateId of unitToPrivate.get(unitId) ?? []) privateIds.add(privateId);
    const publicIds = new Set();
    for (const targetId of [...unitIds, ...privateIds, itemId]) {
      for (const publicId of targetToPublic.get(targetId) ?? []) publicIds.add(publicId);
    }
    if (publicGroups[itemId]) publicIds.add(itemId);
    const npcIds = new Set();
    for (const publicId of publicIds) for (const npcId of publicToNpc.get(publicId) ?? []) npcIds.add(npcId);

    const sources = [];
    for (const npcId of npcIds) {
      const npc = npcById.get(npcId);
      const name = localized(npc?.row?.UIName, loc) || npcId;
      sources.push({
        kind: "Drop",
        name,
        detail: [enumTail(npc?.row?.CreatureRank), npc?.row?.Level ? `Lv ${npc.row.Level}` : ""].filter(Boolean).join(" · "),
        evidence: npcId,
      });
    }
    for (const recipeId of craftByItem.get(itemId) ?? []) {
      sources.push({ kind: "Crafting", name: "Crafting recipe", detail: recipeId, evidence: recipeId });
    }
    if (!npcIds.size && publicIds.size) {
      sources.push({
        kind: "Reward table",
        name: "Reward chain found; NPC unresolved",
        detail: [...publicIds].slice(0, 3).join(", "),
        evidence: [...publicIds].join(", "),
      });
    }
    const seen = new Set();
    return sources.filter((source) => {
      const key = `${source.kind}|${source.name}|${source.detail}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  };
}

function htmlPage(items, summary) {
  const payload = JSON.stringify(items).replaceAll("<", "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>TL Local Item Catalogue</title>
<style>
:root{color-scheme:dark;--bg:#090805;--panel:#120e09;--panel2:#18110c;--line:#3b2b16;--gold:#d7aa5b;--muted:#a99980;--text:#eee4d2;--green:#67d69b;--purple:#c07cff}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 50% -10%,#2b1d13 0,transparent 34rem),var(--bg);color:var(--text);font:14px/1.45 Inter,Segoe UI,sans-serif}header{position:sticky;top:0;z-index:10;padding:18px clamp(16px,4vw,54px);background:rgba(9,8,5,.94);border-bottom:1px solid var(--line);backdrop-filter:blur(16px)}h1{margin:0 0 4px;font:700 clamp(22px,3vw,34px)/1.1 Georgia,serif;color:#f4d6a0}.sub{color:var(--muted)}.controls{display:grid;grid-template-columns:minmax(220px,2fr) repeat(4,minmax(130px,1fr));gap:10px;margin-top:16px}input,select,button{width:100%;border:1px solid #59401e;background:#17110b;color:var(--text);border-radius:8px;padding:10px 12px;font:inherit}button{cursor:pointer}main{padding:22px clamp(16px,4vw,54px) 60px}.summary{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}.pill{padding:6px 10px;border:1px solid var(--line);background:#120e09;border-radius:999px;color:var(--muted)}.pill b{color:var(--text)}#grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:18px;align-items:start}.card{overflow:hidden;border:1px solid #6e4d1d;border-top:2px solid var(--grade);border-radius:12px;background:linear-gradient(180deg,color-mix(in srgb,var(--grade) 12%,#120e09) 0,#120e09 76px);box-shadow:0 12px 30px #0008}.head{display:grid;grid-template-columns:58px 1fr;gap:12px;padding:14px}.icon{width:58px;height:58px;display:grid;place-items:center;border:1px solid var(--grade);border-radius:10px;background:#090805;overflow:hidden}.icon img{max-width:100%;max-height:100%;object-fit:contain}.name{font-weight:800;font-size:16px;color:var(--grade);margin:3px 0}.meta{color:var(--muted);font-size:12px}.id{margin-top:4px;color:#756854;font:10px ui-monospace,Consolas,monospace;overflow-wrap:anywhere}.section{padding:11px 14px;border-top:1px solid #2d2113}.section h3{margin:0 0 8px;color:#b9a078;font-size:10px;letter-spacing:.17em;text-transform:uppercase}.rows{display:grid;gap:4px}.row{display:grid;grid-template-columns:1fr auto;gap:12px;color:#d8cbb5}.row b{color:#fff3dc}.diamond{color:#e1aa52;margin-right:7px}.resonance{background:#1b1019}.resonance h3,.resonance .row{color:#d998f2}.rune-sockets{display:flex;align-items:center;gap:8px;color:#b9a98d}.rune-socket{width:25px;height:25px;border:1px dashed #71552d;border-radius:50%;background:#0b0906}.rune-note{margin-left:3px;font-size:11px;color:#8f806a}.effect{padding:8px 0}.effect b{display:block;color:#e0b56f}.effect p{margin:2px 0;color:#b8aa92}.set{background:#130e09}.set-title{display:flex;justify-content:space-between;color:#e4bd78}.set-row{display:grid;grid-template-columns:48px 1fr;gap:8px;margin-top:7px;color:#9d8a6c}.set-row.active{color:#d8c19b}.source{background:#0c1510;border-top-color:#234c33}.source h3{color:var(--green)}.source-row{padding:6px 0}.source-kind{display:inline-block;color:#0b100d;background:var(--green);border-radius:4px;padding:1px 5px;margin-right:6px;font-size:9px;font-weight:800;text-transform:uppercase}.source-name{color:#ccebd7;font-weight:700}.source-detail{color:#829b89;font-size:11px;margin:2px 0}.empty{color:#7f7463;font-style:italic}.status-local{color:#ffba6a}.pager{display:flex;align-items:center;justify-content:center;gap:10px;margin:24px auto 0;max-width:420px}.pager span{white-space:nowrap;color:var(--muted)}.note{margin-top:20px;color:#796f61;font-size:12px}@media(max-width:860px){.controls{grid-template-columns:1fr 1fr}.controls input{grid-column:1/-1}}@media(max-width:520px){.controls{grid-template-columns:1fr}#grid{grid-template-columns:1fr}.card{border-radius:9px}}
</style>
</head>
<body>
<header><h1>Local Gear Catalogue</h1><div class="sub">Game build ${BUILD}. Live catalogue gear plus locally named appearance candidates absent from Questlog.</div><div class="controls"><input id="search" type="search" placeholder="Search gear, stat, trait, set, or source"><select id="status"><option value="all">All gear</option><option value="questlog">Questlog catalogue</option><option value="local">Local-only candidates</option></select><select id="type"><option value="all">All types</option></select><select id="sort"><option value="grade">Grade, high to low</option><option value="name">Name, A to Z</option><option value="level">Level, high to low</option><option value="source">Source coverage first</option></select><select id="pageSize"><option>24</option><option selected>48</option><option>96</option></select></div></header>
<main><div class="summary"><span class="pill"><b id="shown">0</b> shown</span><span class="pill"><b>${summary.total}</b> gear records</span><span class="pill"><b>${summary.questlog}</b> Questlog catalogue</span><span class="pill"><b>${summary.local}</b> local-only candidates</span><span class="pill"><b>${summary.withSources}</b> with local acquisition evidence</span></div><div id="grid"></div><div class="pager"><button id="prev">Previous</button><span id="page"></span><button id="next">Next</button></div><p class="note">Fishing and utility records are excluded. Rune-eligible gear shows its socket capacity, but no arbitrary rune loadout or synergy is preselected. Local-only candidates have a localized name and gear icon but no TLItemEquip or TLItemStats row in this build. They are appearance evidence, not proof of release, availability, or final stats. Drop sources are shown only when the local reward chain resolves.</p></main>
<script>
const ITEMS=${payload};
const $=id=>document.getElementById(id);let page=1,filtered=[];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types=[...new Set(ITEMS.map(x=>x.type).filter(Boolean))].sort();$('type').insertAdjacentHTML('beforeend',types.map(x=>'<option value="'+esc(x)+'">'+esc(x)+'</option>').join(''));
function rows(title,values,cls=''){if(!values?.length)return '';return '<section class="section '+cls+'"><h3>'+title+'</h3><div class="rows">'+values.map(x=>'<div class="row"><span><i class="diamond">◆</i>'+esc(x.name)+'</span><b>'+esc(x.formattedValue??x.value)+'</b></div>').join('')+'</div></section>'}
function card(x){const effects=x.effects?.length?'<section class="section"><h3>Item effects</h3>'+x.effects.map(e=>'<div class="effect"><b>'+esc(e.label||e.name)+'</b><p>'+esc(e.text||e.name)+'</p></div>').join('')+'</section>':'';const statEmpty=!x.stats?.length&&x.statNote?'<section class="section"><h3>Stats</h3><div class="empty">'+esc(x.statNote)+'</div></section>':'';const runes=x.runeSlots?'<section class="section"><h3>Rune sockets</h3><div class="rune-sockets">'+Array.from({length:x.runeSlots},()=>'<span class="rune-socket"></span>').join('')+'<span class="rune-note">'+esc(x.runeSlots+' sockets · no runes preselected')+'</span></div></section>':'';const set=x.setInfo?'<section class="section set"><h3>Set effects</h3><div class="set-title"><b>'+esc(x.setInfo.name)+'</b><span>'+esc(x.setInfo.countLabel)+'</span></div>'+x.setInfo.bonuses.map(b=>'<div class="set-row '+(b.active?'active':'')+'"><b>'+esc(b.mark+' '+b.required)+'</b><span>'+esc(b.text)+'</span></div>').join('')+'</section>':'';const source='<section class="section source"><h3>Acquisition source</h3>'+(x.sources.length?x.sources.map(s=>'<div class="source-row" title="Evidence: '+esc(s.evidence)+'"><span class="source-kind">'+esc(s.kind)+'</span><span class="source-name">'+esc(s.name)+'</span><div class="source-detail">'+esc(s.detail)+'</div></div>').join(''):'<div class="empty">No exact acquisition chain resolved in the extracted tables.</div>')+'</section>';return '<article class="card" style="--grade:'+esc(x.color)+'"><div class="head"><div class="icon">'+(x.icon?'<img loading="lazy" src="'+esc(x.icon)+'" alt="">':'?')+'</div><div><div class="name">'+esc(x.name)+'</div><div class="meta">'+esc(x.gradeName+' · '+x.type+(x.levelLabel!==false?' · Lv '+(x.levelLabel??x.level):''))+'</div><div class="meta '+(x.statusKey==='local'?'status-local':'')+'">'+esc(x.status+(x.classification?' · '+x.classification:''))+'</div><div class="id">'+esc(x.id)+'</div></div></div>'+rows('Stats',x.stats)+statEmpty+rows('Traits',x.traits)+rows('Unique trait',x.unique)+rows('Trait resonance',x.resonance,'resonance')+runes+effects+set+source+'</article>'}
function apply(){const q=$('search').value.trim().toLowerCase(),status=$('status').value,type=$('type').value;filtered=ITEMS.filter(x=>(status==='all'||x.statusKey===status)&&(type==='all'||x.type===type)&&(!q||x.search.includes(q)));const sort=$('sort').value;filtered.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name):sort==='level'?b.level-a.level||b.grade-a.grade:sort==='source'?b.sources.length-a.sources.length||b.grade-a.grade:b.grade-a.grade||b.level-a.level||a.name.localeCompare(b.name));const size=+$('pageSize').value,pages=Math.max(1,Math.ceil(filtered.length/size));page=Math.min(page,pages);$('shown').textContent=filtered.length.toLocaleString();$('page').textContent='Page '+page+' of '+pages;$('prev').disabled=page<=1;$('next').disabled=page>=pages;$('grid').innerHTML=filtered.slice((page-1)*size,page*size).map(card).join('')||'<p class="empty">No matching items.</p>';window.scrollTo({top:0,behavior:'instant'})}
for(const id of ['search','status','type','sort','pageSize'])$(id).addEventListener(id==='search'?'input':'change',()=>{page=1;apply()});$('prev').onclick=()=>{page--;apply()};$('next').onclick=()=>{page++;apply()};apply();
</script></body></html>`;
}

const [webData, equipTable, looksTable, itemStatsTable, mainStatsTable, publicTable, privateTable, unitTable, rewardTable, craftingTable, locText] = await Promise.all([
  loadWebDataFromFile(path.join(ROOT, "web", "data", "app-data.json")),
  json(path.join(TABLE_ROOT, "TLItemEquip.json")),
  json(path.join(TABLE_ROOT, "TLItemLooks_Equip.json")),
  json(path.join(TABLE_ROOT, "TLItemStats.json")),
  json(path.join(TABLE_ROOT, "TLItemMainStatInit.json")),
  json(path.join(TABLE_ROOT, "TLItemLotteryPublicGroup.json")),
  json(path.join(TABLE_ROOT, "TLItemLotteryPrivateGroup.json")),
  json(path.join(TABLE_ROOT, "TLItemLotteryUnit.json")),
  json(path.join(TABLE_ROOT, "TLRewardNpcFoItem.json")),
  json(path.join(TABLE_ROOT, "TLCraftingRecipe.json")),
  readFile(path.join(EXTRACT_ROOT, "localization", "csv", "en.csv"), "utf8"),
]);

await initCore(webData);
const loc = localizationIndex(parseCsv(locText));
const npcById = new Map();
for (const file of await readdir(NPC_ROOT)) {
  if (!file.endsWith(".json")) continue;
  const table = await json(path.join(NPC_ROOT, file));
  for (const [id, row] of Object.entries(table.rows)) if (!npcById.has(id)) npcById.set(id, { table: table.table, row });
}

const sourcesFor = buildAcquisitionIndex({
  publicGroups: publicTable.rows,
  privateGroups: privateTable.rows,
  units: unitTable.rows,
  npcRewards: rewardTable.rows,
  craftingRows: craftingTable.rows,
  npcById,
  loc,
});

const questlogIds = new Set(webData.items.map((item) => item.id));
const cards = webData.items.filter((item) => COMBAT_GEAR_TYPES.has(item.equipmentType)).map((item) => cardModel(item));
const questlogNames = new Set(cards.map((card) => card.name.trim().toLowerCase()));
const equipIds = new Set(Object.keys(equipTable.rows));
const excludedCandidate = /\[unused\]|unused|test|combattest|dummy|error|_copy|^copy|_start_|^start_|_extract_only/i;
const appearanceByName = new Map();
for (const [id, looks] of Object.entries(looksTable.rows).sort(([a], [b]) => a.localeCompare(b))) {
  const typeKey = gearTypeFromId(id);
  if (!typeKey || questlogIds.has(id) || equipIds.has(id) || excludedCandidate.test(id)) continue;
  const name = localized(looks.UIName, loc).trim();
  const nameKey = name.toLowerCase();
  if (!name || excludedCandidate.test(name) || questlogNames.has(nameKey) || appearanceByName.has(nameKey)) continue;
  appearanceByName.set(nameKey, {
    id,
    name,
    grade: 0,
    gradeName: "Local appearance",
    color: "#7fd6c9",
    type: label(typeKey),
    typeKey,
    level: 0,
    levelLabel: false,
    icon: localIcon(looks),
    status: "Local-only candidate",
    statusKey: "local",
    classification: localClassification(id, name),
    stats: [],
    statNote: "No TLItemEquip or TLItemStats row exists for this identity in the current build. Final stats are unavailable.",
    traits: [],
    unique: [],
    resonance: [],
    runeSlots: 0,
    effects: [],
    setInfo: null,
  });
}
cards.push(...appearanceByName.values());

for (const card of cards) {
  card.sources = sourcesFor(card.acquisitionId ?? card.id);
  card.search = [card.name, card.id, card.type, card.gradeName, card.status, card.classification,
    ...card.stats.map((row) => row.name), ...card.traits.map((row) => row.name),
    card.setInfo?.name, ...card.sources.flatMap((source) => [source.kind, source.name, source.detail])]
    .filter(Boolean).join(" ").toLowerCase();
}

const summary = {
  total: cards.length,
  questlog: cards.filter((card) => card.statusKey === "questlog").length,
  local: cards.filter((card) => card.statusKey === "local").length,
  withSources: cards.filter((card) => card.sources.length).length,
};
await mkdir(OUT_DIR, { recursive: true });
await writeFile(OUT_FILE, htmlPage(cards, summary), "utf8");
console.log(JSON.stringify({ output: OUT_FILE, ...summary }, null, 2));
