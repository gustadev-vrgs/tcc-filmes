import assert from "node:assert/strict";
import test from "node:test";
import type { AiResult } from "../lib/server/ai";
import { recommend, validateCriteria } from "../lib/server/recommendations";
import { queryTmdb } from "../lib/server/tmdb";

const criteria = (overrides: Record<string, unknown> = {}) => ({ version: 1, mediaType: "movie", required: { genres: ["Drama"], yearFrom: 1990, yearTo: 1999 }, preferences: { sort: "rating" }, similarTo: null, requestedCount: 3, clarification: null, limitations: [], ...overrides });
const ai = async (value: object): Promise<AiResult> => ({ operation: "interpret_request", criteria: value });
const item = (id: number, title: string, year: string | null, genreIds = [18]) => ({ id: `tmdb:movie:${id}`, ids: { imdb: null, tmdb: id }, mediaType: "movie" as const, title, year, poster: null, plot: "Dados", source: "tmdb" as const, partial: true, genreIds, popularity: id, rating: 8, votes: 100 });

test("rejeita saída inválida da IA sem executar busca genérica", async () => {
  let calls = 0;
  await assert.rejects(() => recommend("algo", "pt-BR", { ai: () => ai({ genres: [] }), tmdb: (async () => { calls += 1; throw new Error("não deveria consultar"); }) as typeof queryTmdb }), /critérios inválidos/);
  assert.equal(calls, 0);
});

test("mantém período e gênero obrigatórios, elimina duplicações e aceita poucos resultados", async () => {
  const result = await recommend("drama dos anos 90", "pt-BR", { ai: () => ai(criteria()), tmdb: (async (input) => {
    assert.equal(input.yearFrom, 1990); assert.equal(input.yearTo, 1999); assert.equal(input.genres, "18");
    return { items: [item(1, "Válido", "1997"), item(1, "Válido", "1997"), item(2, "Fora", "2005"), item(3, "Sem gênero", "1996", [])], page: 1, totalResults: 4, totalPages: 1, source: "tmdb" as const };
  }) as typeof queryTmdb });
  assert.deepEqual(result.items.map((entry) => entry.title), ["Válido"]);
  assert.equal(result.canBroaden, true);
  assert.match(result.items[0].reason, /1997/);
});

test("preserva título numérico e pede só ano ou tipo quando a referência é ambígua", async () => {
  const seen: string[] = [];
  const result = await recommend("algo como 1917", "en", { ai: () => ai(criteria({ mediaType: "any", required: { genres: [], yearFrom: null, yearTo: null }, similarTo: { title: "1917", year: null, mediaType: null, imdbId: null, tmdbId: null } })), tmdb: (async (input) => {
    seen.push(input.query ?? "");
    return { items: [item(input.media === "movie" ? 1 : 2, "1917", input.media === "movie" ? "2019" : "1950")], page: 1, totalResults: 1, totalPages: 1, source: "tmdb" as const };
  }) as typeof queryTmdb });
  assert.deepEqual(seen, ["1917", "1917"]);
  assert.match(result.message, /year or say whether/);
});

test("aplica restrições adicionais aos relacionados", async () => {
  const value = criteria({ mediaType: "any", similarTo: { title: "2001: A Space Odyssey", year: 1968, mediaType: "movie", imdbId: null, tmdbId: null } });
  let related = false;
  const result = await recommend("like 2001, drama in the 90s", "en", { ai: () => ai(value), tmdb: (async (input) => {
    if (input.operation === "search") return { items: [item(10, "2001: A Space Odyssey", "1968")], page: 1, totalResults: 1, totalPages: 1, source: "tmdb" as const };
    related = true;
    return { items: [item(11, "Inside", "1995"), item(12, "Outside", "2005")], page: 1, totalResults: 2, totalPages: 1, source: "tmdb" as const };
  }) as typeof queryTmdb });
  assert.equal(related, true); assert.deepEqual(result.items.map((entry) => entry.title), ["Inside"]);
});

test("conclui o conjunto de consultas e informa falha parcial de catálogo", async () => {
  const result = await recommend("dramas", "pt-BR", { ai: () => ai(criteria({ mediaType: "any" })), tmdb: (async (input) => {
    if (input.media === "tv") throw new Error("falha isolada");
    return { items: [item(20, "Disponível", "1994")], page: 1, totalResults: 1, totalPages: 1, source: "tmdb" as const };
  }) as typeof queryTmdb });
  assert.equal(result.items.length, 1); assert.equal(result.partialFailures, 1);
});

test("valida limites e não considera atributo obrigatório desconhecido", () => {
  assert.throws(() => validateCriteria(criteria({ required: { genres: ["Drama"], yearFrom: 1990, yearTo: 1980 } })));
});
