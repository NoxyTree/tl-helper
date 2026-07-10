// Case-preserving asset index with case-insensitive lookup.
//
// The extracted game paths and the CDN-derived reference paths disagree on
// casing for ~400 assets (e.g. "TItle_BossStone"). Windows hides this; a
// Linux deployment would not. This module is the single place that owns the
// rule: preserve the original path, look up via a normalized key, detect
// collisions (two originals normalizing to the same key), and classify every
// lookup as exact / case_insensitive / ambiguous / missing.

export function normalizeAssetKey(p) {
  return String(p).replace(/\\/g, "/").toLowerCase();
}

export class AssetCaseIndex {
  constructor(paths = []) {
    this.byKey = new Map(); // key -> array of original paths
    for (const p of paths) this.add(p);
  }

  add(originalPath) {
    const key = normalizeAssetKey(originalPath);
    const list = this.byKey.get(key);
    if (list) { if (!list.includes(originalPath)) list.push(originalPath); }
    else this.byKey.set(key, [originalPath]);
  }

  get size() { return this.byKey.size; }

  // All keys with more than one distinct original casing.
  collisions() {
    const out = [];
    for (const [key, list] of this.byKey) if (list.length > 1) out.push({ key, paths: [...list] });
    return out;
  }

  // -> { status: "exact"|"case_insensitive"|"ambiguous"|"missing",
  //      match: originalPath|null, candidates: [...] }
  lookup(queryPath) {
    const key = normalizeAssetKey(queryPath);
    const list = this.byKey.get(key);
    if (!list) return { status: "missing", match: null, candidates: [] };
    if (list.length > 1) return { status: "ambiguous", match: null, candidates: [...list] };
    const match = list[0];
    const exact = match.replace(/\\/g, "/") === String(queryPath).replace(/\\/g, "/");
    return { status: exact ? "exact" : "case_insensitive", match, candidates: [match] };
  }
}
