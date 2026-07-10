export const EVENT_TYPE = Object.freeze({
  ACTION_REQUESTED: "action_requested",
  CAST_START: "cast_start",
  CAST_COMPLETION: "cast_completion",
  PROJECTILE_IMPACT: "projectile_impact",
  DAMAGE: "damage",
  HEALING: "healing",
  SHIELDING: "shielding",
  SHIELD_EXPIRATION: "shield_expiration",
  BUFF_APPLICATION: "buff_application",
  BUFF_EXPIRATION: "buff_expiration",
  RESOURCE_CHANGE: "resource_change",
  COOLDOWN_COMPLETION: "cooldown_completion",
  DOT_TICK: "dot_tick",
  HOT_TICK: "hot_tick",
});

export const DEFAULT_EVENT_PHASES = Object.freeze({
  [EVENT_TYPE.BUFF_EXPIRATION]: 10,
  [EVENT_TYPE.SHIELD_EXPIRATION]: 10,
  [EVENT_TYPE.RESOURCE_CHANGE]: 20,
  [EVENT_TYPE.ACTION_REQUESTED]: 5,
  [EVENT_TYPE.CAST_START]: 40,
  [EVENT_TYPE.CAST_COMPLETION]: 50,
  [EVENT_TYPE.PROJECTILE_IMPACT]: 60,
  [EVENT_TYPE.DOT_TICK]: 70,
  [EVENT_TYPE.HOT_TICK]: 70,
  [EVENT_TYPE.DAMAGE]: 80,
  [EVENT_TYPE.HEALING]: 80,
  [EVENT_TYPE.SHIELDING]: 90,
  [EVENT_TYPE.BUFF_APPLICATION]: 90,
  [EVENT_TYPE.COOLDOWN_COMPLETION]: 100,
});

export class EventQueue {
  constructor({ phases = DEFAULT_EVENT_PHASES, maximumEvents = Number.MAX_SAFE_INTEGER } = {}) {
    if (!Number.isSafeInteger(maximumEvents) || maximumEvents <= 0) {
      throw new RangeError("maximumEvents must be a positive safe integer.");
    }
    this.phases = Object.freeze({ ...phases });
    this.maximumEvents = maximumEvents;
    this.events = [];
    this.nextSequence = 0;
  }

  schedule(event, currentTime = 0) {
    if (!event || typeof event !== "object") throw new TypeError("Scheduled event must be an object.");
    if (!Number.isSafeInteger(event.time) || event.time < 0) throw new RangeError("Event time must be a non-negative safe integer timestamp.");
    if (event.time < currentTime) throw new RangeError("Cannot schedule an event before current simulation time.");
    if (!(event.type in this.phases)) throw new Error(`No phase is configured for event type: ${event.type}`);
    if (this.nextSequence >= this.maximumEvents) throw new Error(`Simulation exceeded maximumEvents (${this.maximumEvents}).`);
    const scheduled = Object.freeze({ ...event, phase: this.phases[event.type], sequence: this.nextSequence++ });
    this.events.push(scheduled);
    return scheduled;
  }

  pop() {
    if (!this.events.length) return null;
    let best = 0;
    for (let index = 1; index < this.events.length; index++) {
      if (compareEvents(this.events[index], this.events[best]) < 0) best = index;
    }
    return this.events.splice(best, 1)[0];
  }

  get size() {
    return this.events.length;
  }
}

export function compareEvents(left, right) {
  return left.time - right.time || left.phase - right.phase || left.sequence - right.sequence;
}
