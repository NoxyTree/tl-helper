import assert from "node:assert/strict";
import test from "node:test";
import { estimateBuildCost, indexMarketItems } from "../../web/tl-build-market.js";

test("build cost excludes owned pieces and sums changed minimum listings", () => {
  const market = indexMarketItems({ items: [
    { itemKey: "new-head", minimumPrice: 250 },
    { itemKey: "new-ring", minimumPrice: 90 },
  ] });
  const source = { equipment: { head: { itemId: "old-head" }, chest: { itemId: "same-chest" } } };
  const result = { equipment: { head: { itemId: "new-head" }, chest: { itemId: "same-chest" }, ring_1: { itemId: "new-ring" } } };
  assert.deepEqual(estimateBuildCost(result, source, market), {
    rows: [
      { collection: "equipment", slotId: "head", itemId: "new-head", owned: false, market: { itemKey: "new-head", minimumPrice: 250 }, priced: true, price: 250 },
      { collection: "equipment", slotId: "chest", itemId: "same-chest", owned: true, market: null, priced: true, price: 0 },
      { collection: "equipment", slotId: "ring_1", itemId: "new-ring", owned: false, market: { itemKey: "new-ring", minimumPrice: 90 }, priced: true, price: 90 },
    ],
    changedCount: 2,
    pricedCount: 2,
    missingCount: 0,
    knownCost: 340,
    complete: true,
  });
});

test("build cost reports partial coverage instead of presenting a false total", () => {
  const estimate = estimateBuildCost(
    { equipment: { head: { itemId: "priced" }, chest: { itemId: "missing" } } },
    { equipment: {} },
    indexMarketItems({ items: [{ itemKey: "priced", minimumPrice: 75 }] }),
  );
  assert.equal(estimate.complete, false);
  assert.equal(estimate.knownCost, 75);
  assert.equal(estimate.pricedCount, 1);
  assert.equal(estimate.missingCount, 1);
});
