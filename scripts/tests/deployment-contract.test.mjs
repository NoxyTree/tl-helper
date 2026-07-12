import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("Cloudflare Pages serves the web app and production domain", async () => {
  const config = await read("wrangler.toml");
  assert.match(config, /pages_build_output_dir\s*=\s*"\.\/web"/);
  assert.match(config, /https:\/\/tlhelper\.org/);
});

test("hosted Questlog adapter preserves the local adapter safety boundary", async () => {
  const worker = await read("functions/api/questlog/character.js");
  assert.match(worker, /ALLOWED_HOSTS/);
  assert.match(worker, /url\.protocol !== "https:"/);
  assert.match(worker, /MAX_RESPONSE_BYTES = 8_000_000/);
  assert.match(worker, /cache-control": "no-store"/);
  assert.doesNotMatch(worker, /service[_-]?role/i);
});

test("production headers protect documents and cache hashed projections", async () => {
  const headers = await read("web/_headers");
  assert.match(headers, /X-Content-Type-Options: nosniff/);
  assert.match(headers, /\/data\/projections\/\*/);
  assert.match(headers, /max-age=31536000, immutable/);
});
