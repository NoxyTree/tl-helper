import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

for (const page of ["index.html", "tracker.html", "achievements.html"]) {
  test(`${page} links to Combat Lab from primary navigation`, async () => {
    const html = await readFile(new URL(`../../web/${page}`, import.meta.url), "utf8");
    const nav = html.match(/<nav class="tl-app-nav"[\s\S]*?<\/nav>/)?.[0] ?? "";
    assert.match(nav, /href="\.\/combat-lab\.html"[^>]*>Combat Lab<\/a>/);
  });
}
