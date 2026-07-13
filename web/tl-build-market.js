export function indexMarketItems(payload) {
  return new Map((payload?.items ?? []).map((row) => [String(row.itemKey ?? row.itemId ?? ""), row]).filter(([key]) => key));
}

export function estimateBuildCost(resultBuild, sourceBuild, marketByItemKey) {
  const rows = [];
  for (const collection of ["equipment", "artifacts"]) {
    const resultSelections = resultBuild?.[collection] ?? {};
    const sourceSelections = sourceBuild?.[collection] ?? {};
    for (const [slotId, selection] of Object.entries(resultSelections)) {
      const itemId = String(selection?.itemId ?? "");
      if (!itemId) continue;
      const owned = itemId === String(sourceSelections?.[slotId]?.itemId ?? "");
      const market = marketByItemKey?.get(itemId) ?? null;
      const price = Number(market?.minimumPrice);
      rows.push({
        collection,
        slotId,
        itemId,
        owned,
        market,
        priced: owned || Number.isFinite(price) && price > 0,
        price: owned ? 0 : Number.isFinite(price) && price > 0 ? price : null,
      });
    }
  }
  const changed = rows.filter((row) => !row.owned);
  const priced = changed.filter((row) => row.priced);
  return {
    rows,
    changedCount: changed.length,
    pricedCount: priced.length,
    missingCount: changed.length - priced.length,
    knownCost: priced.reduce((sum, row) => sum + row.price, 0),
    complete: changed.every((row) => row.priced),
  };
}
