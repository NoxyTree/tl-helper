import assert from "node:assert/strict";
import test from "node:test";
import { createTldbMarketService, MarketRequestError, MarketUpstreamError, parseMarketQuery } from "../../packages/market-data/tldb-market.mjs";

const NOW = Date.parse("2026-07-12T22:30:00Z");
const fixture = () => ({ baseTime: Math.floor(NOW / 1000) - 5, list: {
  "20005": { "100": { price: 42, quantity: 7, sales: [{ c: 2, e: Math.floor(NOW / 1000) - 60, p: 40 }] }, "200": { price: 99, quantity: 1, sales: [] } },
  "50005": { "100": { price: 35, quantity: 4, sales: [] } },
  "60005": { "100": { price: 50, quantity: 9, sales: [] } },
} });
const response = (body=fixture(),status=200) => new Response(JSON.stringify(body),{status,headers:{"last-modified":"Sun, 12 Jul 2026 22:29:55 GMT",etag:'"market-v1"'}});
const catalogueResponse = () => new Response(JSON.stringify({result:{data:[{id:"test_sword",name:"Test Sword",auctionHouseId:100},{id:"test_armor",name:"Test Armor",auctionHouseId:200}]}}));
const fetchFixture = async url => String(url).includes("questlog.gg") ? catalogueResponse() : response();

test("market query validates regions and item identity", () => {
  assert.deepEqual(parseMarketQuery(new URL("https://tlhelper.org/api/market/prices?region=europe&itemId=100")),{region:"eu",itemId:"100",itemKey:null});
  assert.deepEqual(parseMarketQuery(new URL("https://tlhelper.org/api/market/prices?region=60005")),{region:"na",itemId:null,itemKey:null});
  assert.throws(()=>parseMarketQuery(new URL("https://tlhelper.org/api/market/prices?region=moon")),MarketRequestError);
});

test("TLDB market service normalizes regional minimum prices", async () => {
  const result=await createTldbMarketService({fetchImpl:fetchFixture,now:()=>NOW}).get({region:"eu",itemId:null,itemKey:null});
  assert.equal(result.regionId,"20005"); assert.equal(result.itemCount,2);
  assert.deepEqual(result.items[0],{itemId:"100",itemKey:"test_sword",name:"Test Sword",minimumPrice:42,quantity:7});
  assert.equal(result.stale,false); assert.equal(result.upstreamEtag,'"market-v1"');
});

test("single market lookup retains active listings", async () => {
  const service=createTldbMarketService({fetchImpl:fetchFixture,now:()=>NOW});
  const result=await service.get({region:"eu",itemId:null,itemKey:"test_sword"});
  assert.deepEqual(result.item.listings,[{quantity:2,expiresAtUtc:"2026-07-12T22:29:00.000Z",price:40}]);
  await assert.rejects(()=>service.get({region:"eu",itemId:"999",itemKey:null}),error=>error.status===404);
});

test("market service serves bounded stale data and rejects malformed snapshots", async () => {
  let clock=NOW,calls=0;
  const service=createTldbMarketService({now:()=>clock,fetchImpl:async url=>{if(String(url).includes("questlog.gg"))return catalogueResponse();calls+=1;if(calls>1)throw new Error("offline");return response();}});
  await service.get({region:"eu",itemId:null,itemKey:null}); clock+=40_000;
  assert.equal((await service.get({region:"eu",itemId:null,itemKey:null})).stale,true);
  const invalid=createTldbMarketService({fetchImpl:async url=>String(url).includes("questlog.gg")?catalogueResponse():response({baseTime:1,list:{}}),now:()=>NOW});
  await assert.rejects(()=>invalid.get({region:"eu",itemId:null,itemKey:null}),MarketUpstreamError);
});
