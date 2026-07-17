// Pins the achievement category glyphs: every referenced icon file must exist
// in the local mirror, and every mapped category name must still exist in the
// achievement data (a rename would silently demote a category to its letter
// monogram — fail loudly instead so the mapping gets updated).
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { ACHIEVEMENT_CATEGORY_GLYPHS, achievementCategoryGlyph } from "../../web/tl-achievement-glyphs.js";
import { TL_ACHIEVEMENTS } from "../../web/data/achievements.js";

const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..", "web");

test("every glyph icon file exists in the local mirror", () => {
  for (const [category, icon] of Object.entries(ACHIEVEMENT_CATEGORY_GLYPHS)) {
    assert.ok(existsSync(join(webRoot, icon)), `${category}: ${icon} is missing from web/assets`);
  }
});

test("every mapped category exists in the achievement data", () => {
  const categories = new Set(TL_ACHIEVEMENTS.map((row) => row.category));
  for (const category of Object.keys(ACHIEVEMENT_CATEGORY_GLYPHS)) {
    assert.ok(categories.has(category), `${category} is no longer an achievement category — update the glyph mapping`);
  }
});

test("unmapped categories fall back to null for the monogram disc", () => {
  assert.equal(achievementCategoryGlyph("Housing"), null);
  assert.equal(achievementCategoryGlyph(undefined), null);
  assert.match(achievementCategoryGlyph("Currency"), /ICO_Adena/);
});
