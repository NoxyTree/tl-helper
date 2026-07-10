const MASK_64 = (1n << 64n) - 1n;
const NON_ZERO_FALLBACK = 0x9e3779b97f4a7c15n;

export class SeededRandom {
  constructor(seed) {
    this.state = normalizeSeed(seed) || NON_ZERO_FALLBACK;
  }

  nextUint64() {
    let value = this.state;
    value ^= value >> 12n;
    value ^= (value << 25n) & MASK_64;
    value ^= value >> 27n;
    this.state = value & MASK_64;
    return (this.state * 0x2545f4914f6cdd1dn) & MASK_64;
  }

  nextUint32() {
    return Number(this.nextUint64() >> 32n);
  }

  nextBigInt(maxExclusive) {
    if (typeof maxExclusive !== "bigint" || maxExclusive <= 0n || maxExclusive > (1n << 64n)) {
      throw new RangeError("maxExclusive must be a bigint from 1 through 2^64.");
    }
    const limit = (1n << 64n) - ((1n << 64n) % maxExclusive);
    let draw;
    do draw = this.nextUint64(); while (draw >= limit);
    return draw % maxExclusive;
  }

  pickScaledInclusive(minimum, maximum) {
    if (typeof minimum !== "bigint" || typeof maximum !== "bigint" || maximum < minimum) {
      throw new RangeError("Scaled random bounds must be ordered bigint values.");
    }
    return minimum + this.nextBigInt(maximum - minimum + 1n);
  }

  snapshot() {
    return this.state.toString();
  }
}

function normalizeSeed(seed) {
  if (typeof seed === "bigint") return seed & MASK_64;
  if (typeof seed === "number") {
    if (!Number.isSafeInteger(seed)) throw new TypeError("Numeric RNG seeds must be safe integers.");
    return BigInt(seed) & MASK_64;
  }
  if (typeof seed !== "string") throw new TypeError("RNG seed must be a bigint, safe integer, or string.");
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < seed.length; index++) {
    const code = seed.charCodeAt(index);
    hash ^= BigInt(code & 0xff);
    hash = (hash * 0x100000001b3n) & MASK_64;
    hash ^= BigInt(code >> 8);
    hash = (hash * 0x100000001b3n) & MASK_64;
  }
  return hash;
}
