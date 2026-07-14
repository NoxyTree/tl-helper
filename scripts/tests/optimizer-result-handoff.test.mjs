import assert from "node:assert/strict";
import test from "node:test";
import { IMPROVED_RESULT_HANDOFF_KEY, keptSlotsFromResult, loadImprovedResult, storeImprovedResult } from "../../web/tl-optimizer-result-handoff.js";

function storage() {
  const values = new Map();
  return { getItem:key=>values.get(key)??null, setItem:(key,value)=>values.set(key,String(value)), values };
}

const result = {
  build:{equipment:{}}, goalResults:[], allStats:[],
  slots:[
    {slotId:"head",current:{name:"Kept Hat"},recommended:{name:"Kept Hat"},reason:"Kept"},
    {slotId:"chest",current:{name:"Old Chest"},recommended:{name:"New Chest"},reason:"Improves Health"},
    {slotId:"ring_1",current:{name:"Same Ring"},recommended:{name:"Same Ring"},reason:"Best candidate"},
  ],
};

test("improved result handoff retains the complete result and marks unchanged slots", () => {
  const target=storage();
  const saved=storeImprovedResult(target,{result,priorities:["pvp_endurance","pvp_endurance","skill_cooldown_modifier"]});
  assert.deepEqual(saved.keptSlotIds,["head","ring_1"]);
  assert.deepEqual(saved.priorities,["pvp_endurance","skill_cooldown_modifier"]);
  assert.ok(target.values.has(IMPROVED_RESULT_HANDOFF_KEY));
  assert.deepEqual(loadImprovedResult(target),saved);
});

test("invalid or corrupt handoffs are ignored", () => {
  const target=storage();
  target.setItem(IMPROVED_RESULT_HANDOFF_KEY,"not json");
  assert.equal(loadImprovedResult(target),null);
  assert.deepEqual(keptSlotsFromResult(null),[]);
  assert.throws(()=>storeImprovedResult(target,{result:{}}),/incomplete/);
  assert.throws(()=>storeImprovedResult(target,{result:{...result,scenario:{schema:"wrong"}}}),/incomplete/);
  target.setItem(IMPROVED_RESULT_HANDOFF_KEY,JSON.stringify({schema:"tl-helper.improved-result-handoff",schemaVersion:2,result:{...result,scenario:{schema:"wrong"}}}));
  assert.equal(loadImprovedResult(target),null);
});
