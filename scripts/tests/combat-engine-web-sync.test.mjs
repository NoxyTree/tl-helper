import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { COMBAT_ENGINE_WEB_MODULES } from "../sync-combat-engine-web.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("browser combat-engine modules are byte-exact mirrors of the authored engine", () => {
  for (const file of COMBAT_ENGINE_WEB_MODULES) {
    const authored = readFileSync(path.join(REPO_ROOT, "packages", "combat-engine", "src", file));
    const browser = readFileSync(path.join(REPO_ROOT, "web", "vendor", "combat-engine", file));
    assert.deepEqual(browser, authored, `${file} browser mirror is stale`);
  }
});
