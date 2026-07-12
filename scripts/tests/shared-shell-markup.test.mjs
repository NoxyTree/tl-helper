import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pages = ['index.html', 'tracker.html', 'achievements.html'];
const html = Object.fromEntries(await Promise.all(pages.map(async (page) => [
  page,
  await readFile(new URL(`../../web/${page}`, import.meta.url), 'utf8'),
])));

for (const [page, markup] of Object.entries(html)) {
  assert.match(markup, /<link\b[^>]*href=["'][^"']*tl-shell\.css["'][^>]*>/i, `${page} links the shared shell stylesheet`);
  assert.match(markup, /<header\b[^>]*class=["'][^"']*\btl-app-header\b[^"']*["']/i, `${page} uses the shared app header`);
  assert.match(markup, /class=["'][^"']*\btl-app-brand\b/i, `${page} uses the shared brand`);
  assert.match(markup, /class=["'][^"']*\btl-app-nav\b/i, `${page} uses the shared navigation`);
  assert.match(markup, /class=["'][^"']*\btl-app-header-end\b/i, `${page} reserves stable header end content`);
}

assert.doesNotMatch(html['index.html'], /class=["'][^"']*\btl-page-toolbar\b/i, 'Armory does not add a page-specific subheader');
assert.match(html['index.html'], /class=["'][^"']*\btl-app-header-end\b[^"']*\btl-toolbar-actions\b/i, 'Armory actions live in the shared header end slot');
assert.match(html['index.html'], /<input\b[^>]*aria-label=["']Character name["'][^>]*>/i, 'Armory exposes editable native build identity');
assert.match(html['index.html'], /<input\b[^>]*aria-label=["']Server["'][^>]*>/i, 'Armory exposes editable server identity');
assert.doesNotMatch(html['tracker.html'], /min-width\s*:\s*1320px/i, 'Tracker no longer forces a 1320px viewport');

console.log('Shared shell markup contract passed for Armory, Tracker, and Achievements.');
