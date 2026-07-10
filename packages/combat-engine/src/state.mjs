export function createUnitState(definition, fixed) {
  assertSafeIdentifier(definition?.id, "Unit definition id");
  if (!definition.buildSnapshot || typeof definition.buildSnapshot !== "object") throw new Error("Unit definition requires a BuildSnapshot reference.");
  if (!isDeeplyFrozen(definition.buildSnapshot)) throw new Error("Unit BuildSnapshot references must be deeply immutable.");
  const maximumHealth = fixed.from(definition.maximumHealth);
  const maximumResource = fixed.from(definition.maximumResource ?? 0);
  const health = definition.health === undefined ? maximumHealth : fixed.from(definition.health);
  const resource = definition.resource === undefined ? maximumResource : fixed.from(definition.resource);
  assertBounds(health, maximumHealth, "health");
  assertBounds(resource, maximumResource, "resource");
  return {
    id: definition.id,
    buildSnapshot: definition.buildSnapshot,
    health,
    maximumHealth,
    resource,
    maximumResource,
    activeBuffs: new Map(),
    activeDebuffs: new Map(),
    shields: [],
    cooldowns: new Map(),
    crowdControl: { active: false, effects: [] },
    position: definition.position ?? { bucket: "unspecified" },
    alive: health > 0n,
  };
}

export function snapshotUnit(unit) {
  return {
    id: unit.id,
    buildSnapshot: {
      schema: unit.buildSnapshot.schema ?? null,
      schemaVersion: unit.buildSnapshot.schemaVersion ?? null,
      id: unit.buildSnapshot.identity?.id ?? unit.buildSnapshot.id ?? null,
    },
    health: unit.health.toString(),
    maximumHealth: unit.maximumHealth.toString(),
    resource: unit.resource.toString(),
    maximumResource: unit.maximumResource.toString(),
    activeBuffs: [...unit.activeBuffs.values()].map(snapshotEffect),
    activeDebuffs: [...unit.activeDebuffs.values()].map(snapshotEffect),
    shields: unit.shields.map((shield) => ({ ...snapshotEffect(shield), remaining: shield.remaining.toString() })),
    cooldowns: Object.fromEntries([...unit.cooldowns.entries()].sort(([left], [right]) => compareCanonicalStrings(left, right))),
    crowdControl: { active: unit.crowdControl.active, effects: [...unit.crowdControl.effects] },
    position: cloneJson(unit.position),
    alive: unit.alive,
  };
}

function snapshotEffect(effect) {
  return Object.fromEntries(Object.entries(effect).filter(([, value]) => typeof value !== "bigint").map(([key, value]) => [key, cloneJson(value)]));
}

function assertBounds(value, maximum, name) {
  if (maximum < 0n || value < 0n || value > maximum) throw new RangeError(`Unit ${name} must be between zero and its maximum.`);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isDeeplyFrozen(value) {
  if (!value || typeof value !== "object") return true;
  return Object.isFrozen(value) && Object.values(value).every(isDeeplyFrozen);
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
