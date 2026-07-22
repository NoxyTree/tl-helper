const SOURCE_URL = "https://data.tldb.info/ah-prices.json";
const CATALOG_URL = "https://questlog.gg/throne-and-liberty/api/trpc/auctionHouse.getAuctionHouse?input=%7B%22language%22%3A%22en%22%2C%22regionId%22%3A%22eu-f%22%7D";
const MAX_RESPONSE_BYTES = 2_000_000;
const FRESH_TTL_MS = 30_000;
const STALE_TTL_MS = 15 * 60_000;
const CATALOG_TTL_MS = 5 * 60_000;
const CATALOG_STALE_TTL_MS = 24 * 60 * 60_000;

export const MARKET_REGIONS = Object.freeze({
  eu: Object.freeze({ id: "20005", name: "Europe" }),
  jp: Object.freeze({ id: "50005", name: "Japan and Oceania" }),
  na: Object.freeze({ id: "60005", name: "Americas" }),
});

const REGION_ALIASES = new Map([
  ["eu", "eu"], ["europe", "eu"], ["20005", "eu"],
  ["jp", "jp"], ["asia", "jp"], ["japan", "jp"], ["oceania", "jp"], ["50005", "jp"],
  ["na", "na"], ["us", "na"], ["americas", "na"], ["america", "na"], ["60005", "na"],
]);

export function parseMarketQuery(url) {
  const regionInput = String(url.searchParams.get("region") ?? "eu").trim().toLowerCase();
  const region = REGION_ALIASES.get(regionInput);
  if (!region) throw new MarketRequestError("Unsupported market region. Use eu, jp, or na.", 400);
  const itemInput = String(url.searchParams.get("itemId") ?? "").trim();
  if (itemInput && !/^\d+$/.test(itemInput)) throw new MarketRequestError("itemId must be numeric.", 400);
  const itemKeyInput = String(url.searchParams.get("itemKey") ?? "").trim();
  if (itemKeyInput && !/^[A-Za-z0-9_]+$/.test(itemKeyInput)) throw new MarketRequestError("itemKey contains unsupported characters.", 400);
  if (itemInput && itemKeyInput) throw new MarketRequestError("Use itemId or itemKey, not both.", 400);
  return Object.freeze({ region, itemId: itemInput || null, itemKey: itemKeyInput || null });
}

export function createTldbMarketService({
  fetchImpl = fetch,
  now = () => Date.now(),
  timeoutMs = 12_000,
} = {}) {
  let cached = null;
  let cachedCatalog = null;

  async function get(query) {
    const time = now();
    let snapshot = cached;
    let stale = false;
    if (!snapshot || time - snapshot.cachedAtMs > FRESH_TTL_MS) {
      try {
        snapshot = await fetchSnapshot({ fetchImpl, now, timeoutMs });
        cached = snapshot;
      } catch (error) {
        if (!cached || time - cached.cachedAtMs > STALE_TTL_MS) throw error;
        snapshot = cached;
        stale = true;
      }
    }
    let catalog = cachedCatalog;
    if (!catalog || time - catalog.cachedAtMs > CATALOG_TTL_MS) {
      try {
        catalog = await fetchCatalog({ fetchImpl, now, timeoutMs });
        cachedCatalog = catalog;
      } catch (error) {
        if (!cachedCatalog || time - cachedCatalog.cachedAtMs > CATALOG_STALE_TTL_MS) throw error;
        catalog = cachedCatalog;
      }
    }
    return selectMarketData(snapshot, query, { stale, servedAtMs: time, catalog });
  }

  return Object.freeze({ get });
}

async function fetchCatalog({ fetchImpl, now, timeoutMs }) {
  const response = await fetchImpl(CATALOG_URL, {
    headers: { accept: "application/json", "user-agent": "TL Helper market adapter" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new MarketUpstreamError(`Questlog market catalogue failed (${response.status}).`);
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new MarketUpstreamError("Questlog market catalogue returned oversized data.");
  let rows;
  try { rows = JSON.parse(text)?.result?.data; }
  catch { throw new MarketUpstreamError("Questlog market catalogue returned invalid JSON."); }
  if (!Array.isArray(rows)) throw new MarketUpstreamError("Questlog market catalogue did not match the expected schema.");
  const byAuctionId = new Map();
  const byItemKey = new Map();
  for (const row of rows) {
    const auctionId = String(row?.auctionHouseId ?? "");
    const itemKey = String(row?.id ?? "");
    if (!/^\d+$/.test(auctionId) || !itemKey) continue;
    const item = Object.freeze({ auctionId, itemKey, name: String(row.name ?? itemKey) });
    byAuctionId.set(auctionId, item);
    byItemKey.set(itemKey, item);
  }
  return Object.freeze({ byAuctionId, byItemKey, cachedAtMs: now() });
}

async function fetchSnapshot({ fetchImpl, now, timeoutMs }) {
  const response = await fetchImpl(SOURCE_URL, {
    headers: { accept: "application/json", "user-agent": "TL Helper market adapter" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new MarketUpstreamError(`TLDB market feed failed (${response.status}).`);
  const contentLength = Number(response.headers?.get?.("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) throw new MarketUpstreamError("TLDB market feed exceeded the 2 MB safety limit.");
  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new MarketUpstreamError("TLDB market feed returned oversized data.");
  let raw;
  try { raw = JSON.parse(text); }
  catch { throw new MarketUpstreamError("TLDB market feed returned invalid JSON."); }
  validateSnapshot(raw);
  return Object.freeze({
    raw,
    cachedAtMs: now(),
    upstreamLastModified: response.headers?.get?.("last-modified") ?? null,
    upstreamEtag: response.headers?.get?.("etag") ?? null,
  });
}

function validateSnapshot(raw) {
  if (!raw || typeof raw !== "object" || !Number.isFinite(raw.baseTime) || !raw.list || typeof raw.list !== "object") {
    throw new MarketUpstreamError("TLDB market feed did not match the expected schema.");
  }
  for (const { id } of Object.values(MARKET_REGIONS)) {
    const rows = raw.list[id];
    if (!rows || typeof rows !== "object" || Array.isArray(rows)) {
      throw new MarketUpstreamError(`TLDB market feed omitted region ${id}.`);
    }
  }
}

function selectMarketData(snapshot, { region, itemId, itemKey }, { stale, servedAtMs, catalog }) {
  const regionInfo = MARKET_REGIONS[region];
  const sourceRows = snapshot.raw.list[regionInfo.id];
  const metadata = Object.freeze({
    schema: "tl-helper.market-prices",
    schemaVersion: 1,
    source: "tldb",
    sourceUrl: SOURCE_URL,
    region,
    regionId: regionInfo.id,
    regionName: regionInfo.name,
    snapshotGeneratedAtUtc: new Date(snapshot.raw.baseTime * 1000).toISOString(),
    servedAtUtc: new Date(servedAtMs).toISOString(),
    upstreamLastModified: snapshot.upstreamLastModified,
    upstreamEtag: snapshot.upstreamEtag,
    catalogueSource: "questlog",
    stale,
  });

  const resolvedItemId = itemKey ? catalog.byItemKey.get(itemKey)?.auctionId : itemId;
  if (itemKey && !resolvedItemId) throw new MarketRequestError(`Market item ${itemKey} was not found in the catalogue.`, 404);
  if (resolvedItemId) {
    const row = sourceRows[resolvedItemId];
    if (!row) throw new MarketRequestError(`Market item ${itemKey ?? resolvedItemId} was not found in ${regionInfo.name}.`, 404);
    return Object.freeze({ ...metadata, item: normalizeItem(resolvedItemId, row, true, catalog.byAuctionId.get(resolvedItemId)) });
  }

  const items = Object.entries(sourceRows)
    .map(([id, row]) => normalizeItem(id, row, false, catalog.byAuctionId.get(id)))
    .sort((left, right) => Number(left.itemId) - Number(right.itemId));
  return Object.freeze({ ...metadata, itemCount: items.length, items });
}

function normalizeItem(itemId, row, includeSales, catalogueItem) {
  if (!row || typeof row !== "object" || !Number.isFinite(row.price) || !Number.isFinite(row.quantity)) {
    throw new MarketUpstreamError(`TLDB market item ${itemId} had an invalid price record.`);
  }
  const item = {
    itemId,
    itemKey: catalogueItem?.itemKey ?? null,
    name: catalogueItem?.name ?? null,
    minimumPrice: row.price,
    quantity: row.quantity,
  };
  if (includeSales) {
    item.listings = Array.isArray(row.sales) ? row.sales.flatMap((listing) => {
      const quantity = Number(listing?.c);
      const expiresAt = Number(listing?.e);
      const price = Number(listing?.p);
      if (!Number.isFinite(quantity) || !Number.isFinite(expiresAt) || !Number.isFinite(price)) return [];
      return [{ quantity, expiresAtUtc: new Date(expiresAt * 1000).toISOString(), price }];
    }) : [];
  }
  return Object.freeze(item);
}

export class MarketRequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "MarketRequestError";
    this.status = status;
  }
}

export class MarketUpstreamError extends Error {
  constructor(message) {
    super(message);
    this.name = "MarketUpstreamError";
    this.status = 502;
  }
}

export const TLDB_MARKET_SOURCE_URL = SOURCE_URL;
