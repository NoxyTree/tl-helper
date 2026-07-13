import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../../web/index.html", import.meta.url), "utf8");

test("Effects tab provides a searchable click-to-inspect stat breakdown", () => {
  assert.match(html, /data-testid="stat-breakdown-panel"/);
  assert.match(html, /placeholder="Search effects"/);
  assert.match(html, /Click a stat to inspect its sources/);
  assert.match(html, /selectedStat\.sources/);
  assert.match(html, /onToggle: \(\) => this\.setState\(\{ expandedStatId: row\.id, statSourcesExpanded: false \}\)/);
});

test("stat breakdown limits large source lists and expands into a bounded scroller", () => {
  assert.match(html, /selectedSources\.slice\(0, 5\)/);
  assert.match(html, /sourceListMaxHeight: this\.state\.statSourcesExpanded \? "360px" : "none"/);
  assert.match(html, /`Show all \$\{selectedSources\.length\} sources`/);
  assert.match(html, /\{\{ selectedStat\.sourcesToggleLabel \}\}/);
});

test("empty favourites do not occupy permanent Effects tab space", () => {
  assert.match(html, /favoritePanelDisplay: favoriteStatRows\.length \? "block" : "none"/);
  assert.match(html, /display: \{\{ favoritePanelDisplay \}\}/);
});

test("Effects sidebar orders attributes, breakdown, then compact favourites", () => {
  assert.match(html, /data-testid="attributes-panel" style="order: 1;/);
  assert.match(html, /data-testid="stat-breakdown-panel" style="order: 2;/);
  assert.match(html, /data-testid="favorite-stats-panel" style="order: 3;/);
  assert.doesNotMatch(html, />Build Overview</);

  const favoritesStart = html.indexOf('data-testid="favorite-stats-panel"');
  const favoritesEnd = html.indexOf('data-testid="attributes-panel"', favoritesStart);
  const favorites = html.slice(favoritesStart, favoritesEnd);
  assert.match(favorites, /Pinned for quick comparison/);
  assert.doesNotMatch(favorites, /\{\{ row\.page \}\}/);
});
