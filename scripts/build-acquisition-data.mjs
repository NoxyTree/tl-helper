// Builds web/data/projections/acquisition.json — per-item "where to get it"
// sourcing for the build-optimizer gearing guide. Joins decoded game tables to
// the equipment projection by shared item id (verified: same id space, no
// translation needed for build 24118850).
//
// Source types (guide surfaces "Craftable From" / "Drops From" / "Price on Market"):
//   - craftable : TLCraftingRecipe  (ingredients + Sollant cost + category)   [POPULATED]
//   - codex     : TLItemCollection  (Codex collection membership)             [POPULATED]
//   - dropsFrom : content TLReward* tables via lottery-pool resolution        [RESERVED — TODO]
//   - market    : live auction-house price is dynamic; the guide fetches it
//                 client-side at view time, so it is intentionally NOT baked here.
//
// Usage:
//   node scripts/build-acquisition-data.mjs [--out <file>]
//   env: TL_EXTRACT_ROOT (default D:\TL_Extracted), TL_STEAM_BUILD, TL_GENERATED_AT_UTC

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { decodeTable, DECODER_VERSION } from "./decode-tljson-table.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXTRACT_ROOT = process.env.TL_EXTRACT_ROOT ?? "D:\\TL_Extracted";
const TABLE_DIR = path.join(EXTRACT_ROOT, "data", "TL", "Content", "Game", "Client", "Table");
const LOCALE_CSV = path.join(EXTRACT_ROOT, "localization", "csv", "en.csv");

const outArg = process.argv.indexOf("--out");
const OUT = outArg >= 0 ? process.argv[outArg + 1] : path.join(repoRoot, "web", "data", "projections", "acquisition.json");

// ---- localization ----------------------------------------------------------
// `names`: `<id>_UIName` -> display name (item names). `byKey`: raw Key ->
// Translation (for string-table refs like a shop merchant's TEXT_RES_* key).
function loadNames() {
  const names = {};
  const byKey = {};
  const text = readFileSync(LOCALE_CSV, "utf8");
  for (const line of text.split(/\r?\n/)) {
    // Namespace,Key,Hash,Translation — Translation may contain commas, so match greedily on the tail.
    const m = line.match(/^[^,]*,([^,]+),[^,]*,(.*)$/);
    if (!m) continue;
    byKey[m[1]] = m[2];
    const key = m[1].match(/^(.+)_UIName$/);
    if (key) names[key[1]] = m[2];
  }
  return { names, byKey };
}

// Ingredient RowName is `<itemId>_<quantity>` (verified across recipes).
function parseIngredient(rowName, names, itemName, isGear) {
  const m = rowName.match(/^(.*?)_(\d+)$/);
  const baseId = m ? m[1] : rowName;
  const qty = m ? Number(m[2]) : 1;
  return { itemId: baseId, name: names[baseId] ?? itemName(baseId) ?? baseId, qty, isGear: isGear(baseId) };
}

function main() {
  const eq = JSON.parse(readFileSync(path.join(repoRoot, "web", "data", "projections", "equipment.json"), "utf8"));
  const appName = Object.fromEntries(eq.data.items.map((i) => [i.id, i.name]));
  const gearIds = new Set(eq.data.items.map((i) => i.id));
  const isGear = (id) => gearIds.has(id);
  const { names, byKey } = loadNames();
  const displayName = (id) => appName[id] ?? names[id];

  const craft = decodeTable(path.join(TABLE_DIR, "TLCraftingRecipe.uasset")).rows;
  const collection = decodeTable(path.join(TABLE_DIR, "TLItemCollection.uasset")).rows;

  // Optional Questlog drop sourcing (produced by scripts/fetch-questlog-drops.mjs).
  const dropsPath = path.join(repoRoot, "web", "data", "projections", "questlog-drops.json");
  const drops = existsSync(dropsPath) ? JSON.parse(readFileSync(dropsPath, "utf8")).items ?? {} : {};

  const items = {};
  const ensure = (id) => (items[id] ??= { craftable: null, codex: null, dropsFrom: [], raid: null, market: null });

  // Craftable From
  for (const row of Object.values(craft)) {
    const id = row.ResultItem;
    if (!gearIds.has(id)) continue; // gear only; skip consumables/materials
    const ingredients = (row.Ingredients ?? [])
      .filter((ing) => ing.RowName && ing.RowName !== "None")
      .map((ing) => parseIngredient(ing.RowName, names, displayName, isGear));
    ensure(id).craftable = {
      costSollant: Number(row.Cost) || 0,
      category: row.Category?.RowName ?? null,
      ingredients,
      // If a craft ingredient is itself a gear piece, this recipe is an upgrade.
      upgradeFrom: ingredients.filter((ing) => ing.isGear).map((ing) => ing.itemId),
    };
  }

  // Codex collections (membership + what completing the set grants)
  for (const [uid, row] of Object.entries(collection)) {
    if (row.Category !== "ETLItemCollectionCategory::Equip") continue;
    for (const group of row.ItemSetGroups ?? []) {
      const id = group.RowName;
      if (!gearIds.has(id)) continue;
      const codex = (ensure(id).codex ??= { collections: [] });
      codex.collections.push({
        uid: row.UID ?? uid,
        rewards: (row.RewardItems ?? [])
          .filter((r) => r.ItemId && r.ItemId !== "None")
          .map((r) => ({ itemId: r.ItemId, name: displayName(r.ItemId) ?? r.ItemId, qty: r.Quantity ?? 1 })),
      });
    }
  }

  // Drops From (static Questlog sourcing; drops don't change between builds).
  // Resolve each source's Questlog icon ref to the same local mirrored-webp path
  // convention the app uses for item icons (assets/icons/<path>.webp).
  const iconToLocal = (icon) => {
    if (!icon) return null;
    let p = icon;
    if (p.includes(".")) p = p.slice(0, p.lastIndexOf("."));
    p = p.replace(/^\/+/, "").replace(/^assets\//i, "");
    return `assets/icons/${p}.webp`;
  };
  for (const [id, rec] of Object.entries(drops)) {
    if (!gearIds.has(id)) continue;
    ensure(id).dropsFrom = (rec.dropsFrom ?? []).map((d) => ({ ...d, image: iconToLocal(d.icon), icon: undefined }));
  }

  // Raid sourcing: the Calanthia raid heroic gear drops from the raid's equipment
  // boxes AND is bought with "stones" at the raid store. Two facets:
  //   - drop  : TLItemLotteryUnit rows RaidBox_Equip_Unic_* — {item, prob/1e7}
  //   - store : TLShop (catalog_fixed catalog_fix_Raid*) -> TLShopCatalogFixed
  //             product.item_id, priced in the currency from TLShopLooks
  //             ExchangeItemList (Raid_stone_01 = "Entropy Shard: Calanthia").
  // The per-item shard cost is server-side (absent from the client tables), so
  // only the currency + merchant are surfaced, never a fabricated price.
  const tbl = (n) => decodeTable(path.join(TABLE_DIR, n)).rows;
  const raidDrop = {}; // itemId -> best in-box probability (fraction)
  for (const row of Object.values(tbl("TLItemLotteryUnit.uasset"))) {
    if (!/RaidBox_Equip_Unic/i.test(row.Name ?? "")) continue;
    for (const e of row.ItemLotteryUnitEntry ?? []) {
      if (gearIds.has(e.item)) raidDrop[e.item] = Math.max(raidDrop[e.item] ?? 0, (Number(e.prob) || 0) / 1e7);
    }
  }
  const shopLooks = tbl("TLShopLooks.uasset");
  const catalog = Object.values(tbl("TLShopCatalogFixed.uasset"));
  const raidStore = {}; // itemId -> { currencyId, currencyName, merchant, shop }
  for (const shop of Object.values(tbl("TLShop.uasset"))) {
    const catalogId = shop.catalog_fixed ?? "";
    if (!/^catalog_fix_Raid/i.test(catalogId)) continue;
    const looks = shopLooks[String(shop.num)];
    const currencyId = looks?.ExchangeItemList?.[0] ?? null;
    const currencyName = currencyId ? (names[currencyId] ?? currencyId) : null;
    const merchant = byKey[looks?.UIName?.key] ?? null;
    for (const row of catalog) {
      if (String(row.id) !== String(catalogId)) continue;
      const iid = row.product?.item_id;
      if (gearIds.has(iid)) raidStore[iid] = { currencyId, currencyName, merchant, shop: shop.id ?? shop.Name ?? null };
    }
  }
  // Raid name: the currency is "Entropy Shard: Calanthia"; take the suffix after ": ".
  const raidNameFrom = (store) => {
    const c = store?.currencyName ?? "";
    const m = c.match(/:\s*(.+)$/);
    return m ? m[1].trim() : "the raid";
  };
  for (const id of new Set([...Object.keys(raidDrop), ...Object.keys(raidStore)])) {
    if (!gearIds.has(id)) continue;
    const store = raidStore[id] ?? null;
    ensure(id).raid = {
      raid: raidNameFrom(store),
      drop: raidDrop[id] != null ? { prob: raidDrop[id] } : null,
      store: store ? { currencyId: store.currencyId, currencyName: store.currencyName, merchant: store.merchant } : null,
    };
  }

  const gameBuild = String(process.env.TL_STEAM_BUILD ?? eq.gameBuild ?? "").trim();
  const generatedAtUtc = process.env.TL_GENERATED_AT_UTC?.trim() || new Date().toISOString();

  const totalGear = eq.data.items.length;
  const craftableCount = Object.values(items).filter((i) => i.craftable).length;
  const codexCount = Object.values(items).filter((i) => i.codex).length;
  const dropsCount = Object.values(items).filter((i) => i.dropsFrom.length).length;
  const raidCount = Object.values(items).filter((i) => i.raid).length;

  const out = {
    schema: "tl-helper.acquisition",
    schemaVersion: 1,
    gameBuild,
    generatedAtUtc,
    decoderVersion: DECODER_VERSION,
    // Sourcing status so the guide can be honest about gaps:
    coverage: {
      totalItems: totalGear,
      withCraftable: craftableCount,
      withCodex: codexCount,
      withDrops: dropsCount,
      withRaid: raidCount,
      withAnySource: Object.keys(items).length,
      dropsFromResolved: Object.keys(drops).length > 0,
      marketIsClientFetched: true,
    },
    items,
  };

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(out));
  console.log(`acquisition.json written -> ${OUT}`);
  console.log(`  gameBuild ${gameBuild}, ${Object.keys(items).length} items sourced (craftable ${craftableCount}, codex ${codexCount}, raid ${raidCount}) of ${totalGear}`);
}

main();
