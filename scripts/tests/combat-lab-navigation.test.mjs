import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const page of ["index.html", "tracker.html", "achievements.html", "privacy.html", "gear-viewer.html", "stat-ranker.html", "full-build-optimizer.html"]) {
  test(`${page} does not expose Combat Lab in primary navigation`, async () => {
    const html = await readFile(new URL(`../../web/${page}`, import.meta.url), "utf8");
    const nav = html.match(/<nav class="tl-app-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.doesNotMatch(nav, /href="\.\/combat-lab\.html"[^>]*>Combat Lab<\/a>/);
  });
}
