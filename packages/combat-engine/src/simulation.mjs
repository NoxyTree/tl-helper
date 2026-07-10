import { EventQueue, EVENT_TYPE } from "./event-queue.mjs";
import { FixedPointContext } from "./fixed-point.mjs";
import { SeededRandom } from "./random.mjs";
import { createUnitState, snapshotUnit } from "./state.mjs";
import { serializeValue } from "./trace.mjs";

const SUPPORTED_EFFECT_TYPES = new Set([
  "direct_damage", "direct_healing", "shield", "timed_buff",
  "resource_change", "damage_over_time", "healing_over_time",
]);

export function runSimulation({
  units,
  actions,
  seed,
  formulas,
  fixed = new FixedPointContext(),
  eventPhases,
  allowModeledFormulas = false,
  maximumEvents = 10_000,
}) {
  if (!Array.isArray(units) || units.length === 0) throw new Error("Simulation requires at least one unit.");
  if (!Array.isArray(actions)) throw new TypeError("Simulation actions must be an array.");
  if (!formulas) throw new Error("Simulation requires a FormulaRegistry.");
  if (!Number.isSafeInteger(maximumEvents) || maximumEvents <= 0) throw new RangeError("maximumEvents must be a positive safe integer.");

  const unitMap = new Map(units.map((definition) => {
    const state = createUnitState(definition, fixed);
    return [state.id, state];
  }));
  if (unitMap.size !== units.length) throw new Error("Unit IDs must be unique.");

  const rng = new SeededRandom(seed);
  const queue = new EventQueue({ ...(eventPhases ? { phases: eventPhases } : {}), maximumEvents });
  const traces = [];
  let traceSequence = 0;
  const formulaContext = {
    fixed,
    rng,
    traces,
    nextTraceId: () => `trace-${traceSequence++}`,
  };
  const evaluate = (id, inputs) => formulas.evaluate(id, inputs, formulaContext, { allowModeled: allowModeledFormulas });
  const initialState = snapshotUnits(unitMap);

  actions.forEach((action, actionIndex) => {
    validateAction(action, unitMap, fixed);
    queue.schedule({ time: action.time, type: EVENT_TYPE.ACTION_REQUESTED, action, actionIndex });
  });

  const timeline = [];
  let currentTime = 0;
  while (queue.size) {
    if (timeline.length >= maximumEvents) throw new Error(`Simulation exceeded maximumEvents (${maximumEvents}).`);
    const event = queue.pop();
    currentTime = event.time;
    const traceIds = [];
    const details = processEvent({ event, queue, unitMap, fixed, rng, evaluate, traceIds, currentTime });
    timeline.push({
      time: event.time,
      phase: event.phase,
      sequence: event.sequence,
      type: event.type,
      details: serializeValue(details),
      traceIds,
      state: snapshotUnits(unitMap),
    });
  }

  return Object.freeze({
    seed: String(seed),
    fixedPointScale: fixed.scale.toString(),
    initialState,
    finalState: snapshotUnits(unitMap),
    timeline: Object.freeze(timeline),
    traces: Object.freeze(traces),
    rngFinalState: rng.snapshot(),
  });
}

export function serializeSimulation(result, { space = 0 } = {}) {
  return JSON.stringify(sortJson(serializeValue(result)), null, space);
}

function processEvent(context) {
  const { event } = context;
  switch (event.type) {
    case EVENT_TYPE.ACTION_REQUESTED: return requestAction(context);
    case EVENT_TYPE.CAST_START: return startCast(context);
    case EVENT_TYPE.CAST_COMPLETION: return completeCast(context);
    case EVENT_TYPE.PROJECTILE_IMPACT: return impactProjectile(context);
    case EVENT_TYPE.DAMAGE: return applyDamage(context);
    case EVENT_TYPE.HEALING: return applyHealing(context);
    case EVENT_TYPE.SHIELDING: return applyShield(context);
    case EVENT_TYPE.SHIELD_EXPIRATION: return expireShield(context);
    case EVENT_TYPE.BUFF_APPLICATION: return applyBuff(context);
    case EVENT_TYPE.BUFF_EXPIRATION: return expireBuff(context);
    case EVENT_TYPE.RESOURCE_CHANGE: return changeResource(context);
    case EVENT_TYPE.COOLDOWN_COMPLETION: return completeCooldown(context);
    case EVENT_TYPE.DOT_TICK: return processTick(context, EVENT_TYPE.DAMAGE);
    case EVENT_TYPE.HOT_TICK: return processTick(context, EVENT_TYPE.HEALING);
    default: throw new Error(`Unhandled event type: ${event.type}`);
  }
}

function requestAction({ event, queue, unitMap, fixed, evaluate, traceIds, currentTime }) {
  const { action } = event;
  const actor = unitMap.get(action.actorId);
  if (!actor.alive) return { actionId: action.id, accepted: false, reason: "actor_dead" };
  if (actor.cooldowns.has(action.cooldownId ?? action.id)) return { actionId: action.id, accepted: false, reason: "cooldown_active" };
  const cost = fixed.from(action.resourceCost ?? 0);
  if (actor.resource < cost) return { actionId: action.id, accepted: false, reason: "insufficient_resource" };
  if (cost > 0n) {
    const result = evaluate("synthetic.decrease.v1", { current: actor.resource, amount: cost });
    traceIds.push(result.traceId);
    actor.resource = result.output.current;
    queue.schedule({ time: currentTime, type: EVENT_TYPE.RESOURCE_CHANGE, unitId: actor.id, amount: cost, direction: "decrease", reason: "ability_cost", actionId: action.id, alreadyApplied: true, applied: result.output.applied, resource: actor.resource }, currentTime);
  }
  const cooldownId = action.cooldownId ?? action.id;
  const cooldownMs = integerDuration(action.cooldownMs ?? 0, "cooldownMs");
  if (cooldownMs > 0) {
    const readyAt = currentTime + cooldownMs;
    actor.cooldowns.set(cooldownId, readyAt);
    queue.schedule({ time: readyAt, type: EVENT_TYPE.COOLDOWN_COMPLETION, unitId: actor.id, cooldownId, readyAt }, currentTime);
  }
  queue.schedule({ time: currentTime, type: EVENT_TYPE.CAST_START, action }, currentTime);
  return { actionId: action.id, accepted: true, cooldownId, cooldownReadyAt: actor.cooldowns.get(cooldownId) ?? null };
}

function startCast({ event, queue, unitMap, currentTime }) {
  const { action } = event;
  const actor = unitMap.get(action.actorId);
  const cooldownId = action.cooldownId ?? action.id;
  const completionTime = currentTime + integerDuration(action.castTimeMs ?? 0, "castTimeMs");
  queue.schedule({ time: completionTime, type: EVENT_TYPE.CAST_COMPLETION, action }, currentTime);
  return { actionId: action.id, actorId: actor.id, completesAt: completionTime, cooldownId, cooldownReadyAt: actor.cooldowns.get(cooldownId) ?? null };
}

function completeCast({ event, queue, currentTime }) {
  const impactTime = currentTime + integerDuration(event.action.projectileTravelMs ?? 0, "projectileTravelMs");
  queue.schedule({ time: impactTime, type: EVENT_TYPE.PROJECTILE_IMPACT, action: event.action }, currentTime);
  return { actionId: event.action.id, impactAt: impactTime };
}

function impactProjectile({ event, queue, currentTime }) {
  event.action.effects.forEach((effect, effectIndex) => scheduleEffect(queue, currentTime, event.action, effect, effectIndex));
  return { actionId: event.action.id, effectCount: event.action.effects.length };
}

function scheduleEffect(queue, time, action, effect, effectIndex) {
  const common = { time, actionId: action.id, sourceId: action.actorId, targetId: effect.targetId ?? action.targetId, effect, effectIndex };
  switch (effect.type) {
    case "direct_damage": queue.schedule({ ...common, type: EVENT_TYPE.DAMAGE }, time); break;
    case "direct_healing": queue.schedule({ ...common, type: EVENT_TYPE.HEALING }, time); break;
    case "shield": queue.schedule({ ...common, type: EVENT_TYPE.SHIELDING }, time); break;
    case "timed_buff": queue.schedule({ ...common, type: EVENT_TYPE.BUFF_APPLICATION }, time); break;
    case "resource_change": queue.schedule({ ...common, type: EVENT_TYPE.RESOURCE_CHANGE, unitId: common.targetId, direction: effect.direction ?? "increase" }, time); break;
    case "damage_over_time": scheduleTicks(queue, time, common, EVENT_TYPE.DOT_TICK); break;
    case "healing_over_time": scheduleTicks(queue, time, common, EVENT_TYPE.HOT_TICK); break;
    default: throw new Error(`Unsupported synthetic effect type: ${effect.type}`);
  }
}

function scheduleTicks(queue, time, common, type) {
  const interval = positiveDuration(common.effect.intervalMs, "intervalMs");
  const tickCount = positiveDuration(common.effect.tickCount, "tickCount");
  for (let tick = 1; tick <= tickCount; tick++) {
    queue.schedule({ ...common, type, time: time + interval * tick, tick, tickCount }, time);
  }
}

function processTick({ event, queue, currentTime }) {
  const resultType = event.type === EVENT_TYPE.DOT_TICK ? EVENT_TYPE.DAMAGE : EVENT_TYPE.HEALING;
  queue.schedule({ ...event, type: resultType, time: currentTime, tickSource: event.type }, currentTime);
  return { actionId: event.actionId, tick: event.tick, tickCount: event.tickCount, scheduled: resultType };
}

function applyDamage(context) {
  const { event, unitMap, evaluate, traceIds } = context;
  const target = requiredUnit(unitMap, event.targetId);
  const amountResult = evaluateAmount(context, event.effect);
  traceIds.push(amountResult.traceId);
  let remaining = amountResult.output;
  const absorbed = [];
  for (const shield of target.shields) {
    if (remaining === 0n || shield.remaining === 0n) continue;
    const result = evaluate("synthetic.shield-absorb.v1", { capacity: shield.remaining, damage: remaining });
    traceIds.push(result.traceId);
    shield.remaining = result.output.capacity;
    remaining = result.output.damage;
    absorbed.push({ shieldId: shield.id, amount: result.output.absorbed.toString() });
  }
  target.shields = target.shields.filter((shield) => shield.remaining > 0n);
  const healthResult = evaluate("synthetic.decrease.v1", { current: target.health, amount: remaining });
  traceIds.push(healthResult.traceId);
  target.health = healthResult.output.current;
  target.alive = target.health > 0n;
  return { targetId: target.id, requested: amountResult.output.toString(), absorbed, healthDamage: healthResult.output.applied.toString(), alive: target.alive, ...(amountResult.random ? { random: amountResult.random } : {}) };
}

function applyHealing(context) {
  const { event, unitMap, evaluate, traceIds } = context;
  const target = requiredUnit(unitMap, event.targetId);
  const amountResult = evaluateAmount(context, event.effect);
  traceIds.push(amountResult.traceId);
  const result = evaluate("synthetic.increase.v1", { current: target.health, maximum: target.maximumHealth, amount: amountResult.output });
  traceIds.push(result.traceId);
  target.health = result.output.current;
  target.alive = target.health > 0n;
  return { targetId: target.id, requested: amountResult.output.toString(), effective: result.output.applied.toString(), overheal: result.output.overflow.toString(), ...(amountResult.random ? { random: amountResult.random } : {}) };
}

function applyShield(context) {
  const { event, queue, unitMap, evaluate, traceIds, currentTime } = context;
  const target = requiredUnit(unitMap, event.targetId);
  const amountResult = evaluateAmount(context, event.effect);
  traceIds.push(amountResult.traceId);
  const shield = {
    id: event.effect.id,
    sourceId: event.sourceId,
    appliedAt: event.time,
    expiresAt: event.effect.durationMs === undefined ? null : event.time + integerDuration(event.effect.durationMs, "durationMs"),
    remaining: amountResult.output,
    instanceId: `shield-${event.sequence}`,
  };
  target.shields.push(shield);
  if (shield.expiresAt !== null) queue.schedule({ time: shield.expiresAt, type: EVENT_TYPE.SHIELD_EXPIRATION, targetId: target.id, shieldId: shield.id, instanceId: shield.instanceId }, currentTime);
  return { targetId: target.id, shieldId: shield.id, amount: shield.remaining.toString(), expiresAt: shield.expiresAt, ...(amountResult.random ? { random: amountResult.random } : {}) };
}

function expireShield({ event, unitMap }) {
  const target = requiredUnit(unitMap, event.targetId);
  const index = target.shields.findIndex((shield) => shield.id === event.shieldId && shield.instanceId === event.instanceId);
  const expired = index !== -1;
  if (expired) target.shields.splice(index, 1);
  return { targetId: target.id, shieldId: event.shieldId, instanceId: event.instanceId, expired };
}

function applyBuff({ event, queue, unitMap, currentTime }) {
  const target = requiredUnit(unitMap, event.targetId);
  const duration = positiveDuration(event.effect.durationMs, "durationMs");
  const instance = {
    id: event.effect.id,
    sourceId: event.sourceId,
    appliedAt: currentTime,
    expiresAt: currentTime + duration,
    instanceId: `buff-${event.sequence}`,
    polarity: event.effect.polarity ?? "buff",
    modifiers: event.effect.modifiers ?? {},
  };
  const collection = instance.polarity === "debuff" ? target.activeDebuffs : target.activeBuffs;
  collection.set(instance.id, instance);
  queue.schedule({ time: instance.expiresAt, type: EVENT_TYPE.BUFF_EXPIRATION, targetId: target.id, effectId: instance.id, instanceId: instance.instanceId, polarity: instance.polarity }, currentTime);
  return { targetId: target.id, effectId: instance.id, expiresAt: instance.expiresAt, polarity: instance.polarity };
}

function expireBuff({ event, unitMap }) {
  const target = requiredUnit(unitMap, event.targetId);
  const collection = event.polarity === "debuff" ? target.activeDebuffs : target.activeBuffs;
  const current = collection.get(event.effectId);
  const expired = current?.instanceId === event.instanceId;
  if (expired) collection.delete(event.effectId);
  return { targetId: target.id, effectId: event.effectId, expired };
}

function changeResource(context) {
  const { event, unitMap, fixed, evaluate, traceIds } = context;
  const target = requiredUnit(unitMap, event.unitId ?? event.targetId);
  const amount = event.amount ?? fixed.from(event.effect.amount);
  const direction = event.direction ?? event.effect.direction ?? "increase";
  if (event.alreadyApplied) {
    return { targetId: target.id, direction, amount: event.applied.toString(), resource: event.resource.toString(), reason: event.reason ?? "effect" };
  }
  const result = direction === "decrease"
    ? evaluate("synthetic.decrease.v1", { current: target.resource, amount })
    : evaluate("synthetic.increase.v1", { current: target.resource, maximum: target.maximumResource, amount });
  traceIds.push(result.traceId);
  target.resource = result.output.current;
  return { targetId: target.id, direction, amount: result.output.applied.toString(), resource: target.resource.toString(), reason: event.reason ?? "effect" };
}

function completeCooldown({ event, unitMap }) {
  const unit = requiredUnit(unitMap, event.unitId);
  const completed = unit.cooldowns.get(event.cooldownId) === event.readyAt;
  if (completed) unit.cooldowns.delete(event.cooldownId);
  return { unitId: unit.id, cooldownId: event.cooldownId, completed };
}

function evaluateAmount({ event, fixed, rng, evaluate }, effect) {
  let amount;
  let random = null;
  if (effect.amountRange) {
    const minimum = fixed.from(effect.amountRange.minimum);
    const maximum = fixed.from(effect.amountRange.maximum);
    const stateBefore = rng.snapshot();
    amount = rng.pickScaledInclusive(minimum, maximum);
    random = { stateBefore, stateAfter: rng.snapshot(), minimum: minimum.toString(), maximum: maximum.toString(), selected: amount.toString() };
  } else {
    amount = fixed.from(effect.amount);
  }
  const result = evaluate(effect.formulaId ?? "synthetic.amount.v1", { amount, ...(effect.formulaInputs ?? {}) });
  if (result.output < 0n) throw new RangeError("Effect magnitude cannot be negative.");
  return random ? { ...result, random } : result;
}

function validateAction(action, unitMap, fixed) {
  if (!action || !Array.isArray(action.effects)) throw new Error("Each action requires id, actorId, targetId, and effects.");
  assertSafeIdentifier(action.id, "Action id");
  assertSafeIdentifier(action.actorId, "Action actorId");
  assertSafeIdentifier(action.targetId, "Action targetId");
  if (action.cooldownId !== undefined) assertSafeIdentifier(action.cooldownId, "Action cooldownId");
  if (!Number.isSafeInteger(action.time) || action.time < 0) throw new RangeError("Action time must be a non-negative safe integer.");
  requiredUnit(unitMap, action.actorId);
  requiredUnit(unitMap, action.targetId);
  const cost = fixed.from(action.resourceCost ?? 0);
  if (cost < 0n) throw new RangeError("resourceCost cannot be negative.");
  action.effects.forEach((effect, index) => validateEffect(effect, index, unitMap, fixed, action.targetId));
}

function validateEffect(effect, index, unitMap, fixed, defaultTargetId) {
  if (!effect || typeof effect !== "object") throw new TypeError(`Effect ${index} must be an object.`);
  if (!SUPPORTED_EFFECT_TYPES.has(effect.type)) throw new Error(`Unsupported synthetic effect type: ${effect.type}`);
  const targetId = effect.targetId ?? defaultTargetId;
  assertSafeIdentifier(targetId, `Effect ${index} targetId`);
  requiredUnit(unitMap, targetId);
  if (effect.type === "shield" || effect.type === "timed_buff") assertSafeIdentifier(effect.id, `Effect ${index} id`);
  if (effect.formulaId !== undefined) assertSafeIdentifier(effect.formulaId, `Effect ${index} formulaId`);
  if (effect.amount !== undefined && fixed.from(effect.amount) < 0n) throw new RangeError(`Effect ${index} amount cannot be negative.`);
  if (effect.amountRange !== undefined) {
    const minimum = fixed.from(effect.amountRange.minimum);
    const maximum = fixed.from(effect.amountRange.maximum);
    if (minimum < 0n || maximum < 0n) throw new RangeError(`Effect ${index} amountRange cannot be negative.`);
    if (minimum > maximum) throw new RangeError(`Effect ${index} amountRange minimum cannot exceed maximum.`);
  }
  if (effect.type === "resource_change") {
    if (effect.amount === undefined) throw new Error(`Effect ${index} resource_change requires amount.`);
    if (effect.direction !== undefined && !["increase", "decrease"].includes(effect.direction)) {
      throw new Error(`Effect ${index} resource_change direction must be increase or decrease.`);
    }
  }
}

function requiredUnit(unitMap, id) {
  const unit = unitMap.get(id);
  if (!unit) throw new Error(`Unknown unit: ${id}`);
  return unit;
}

function snapshotUnits(unitMap) {
  return Object.freeze(Object.fromEntries([...unitMap.entries()].sort(([left], [right]) => compareCanonicalStrings(left, right)).map(([id, unit]) => [id, snapshotUnit(unit)])));
}

function compareCanonicalStrings(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertSafeIdentifier(value, name) {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value)
    || value === "__proto__" || value === "prototype" || value === "constructor") {
    throw new TypeError(`${name} must be a safe non-empty string identifier.`);
  }
}

function integerDuration(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative safe integer.`);
  return value;
}

function positiveDuration(value, name) {
  const result = integerDuration(value, name);
  if (result === 0) throw new RangeError(`${name} must be greater than zero.`);
  return result;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortJson(value[key])]));
}
