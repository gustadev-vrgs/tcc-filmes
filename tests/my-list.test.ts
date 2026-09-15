import assert from "node:assert/strict";
import test from "node:test";
import { MAX_IMPORT_BYTES, mergeMyLists, parseMyListJson, safePosterUrl, type MyListItem } from "../lib/local-storage";

const item = (overrides: Partial<MyListItem> = {}): MyListItem => ({
  id: "tt1234567", ids: { imdb: "tt1234567", tmdb: null }, source: "omdb", title: "Cidade de Deus", year: "2002", type: "Filme", poster: "https://example.com/poster.jpg", addedAt: "2026-09-15T00:00:00.000Z", ...overrides
});

test("combina listas sem duplicar o mesmo IMDb", () => {
  assert.equal(mergeMyLists([item()], [item({ title: "City of God" })]).length, 1);
});

test("elimina duplicação OMDb/TMDB por título, ano e tipo", () => {
  const tmdb = item({ id: "tmdb:598", ids: { imdb: null, tmdb: 598 }, source: "tmdb", title: "Cidade de Deus" });
  assert.equal(mergeMyLists([item()], [tmdb]).length, 1);
});

test("valida importação, corrupção e limite de tamanho", () => {
  assert.deepEqual(parseMyListJson("{broken").error, "invalid-json");
  assert.deepEqual(parseMyListJson(JSON.stringify([{ nope: true }])).error, "invalid");
  assert.deepEqual(parseMyListJson("x".repeat(MAX_IMPORT_BYTES + 1)).error, "too-large");
  assert.equal(parseMyListJson(JSON.stringify({ version: 1, items: [item()] })).value.length, 1);
});

test("aceita somente URLs http(s) de pôster", () => {
  assert.equal(safePosterUrl("javascript:alert(1)"), null);
  assert.equal(safePosterUrl("not a url"), null);
  assert.equal(safePosterUrl("https://example.com/a.jpg"), "https://example.com/a.jpg");
});
