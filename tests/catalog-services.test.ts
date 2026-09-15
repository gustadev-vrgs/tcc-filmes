import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { fetchProviderJson } from "../lib/server/fetch-json";
import { getOmdbDetails, searchOmdb } from "../lib/server/omdb";
import { ProviderError } from "../lib/server/provider-error";
import { queryTmdb } from "../lib/server/tmdb";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.OMDB_API_KEY = "test-omdb-key";
  process.env.TMDB_API_KEY = "12345678901234567890123456789012";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("normaliza pesquisa OMDb, paginação e pôster ausente", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.protocol, "https:");
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("type"), "movie");
    return Response.json({ Response: "True", totalResults: "21", Search: [
      { Title: "Sem pôster", Year: "2020", imdbID: "tt1234567", Type: "movie", Poster: "N/A" }
    ] });
  };
  const result = await searchOmdb({ query: "filme", page: 2, mediaType: "movie" });
  assert.equal(result.totalPages, 3);
  assert.equal(result.items[0].poster, null);
  assert.equal(result.items[0].ids.imdb, "tt1234567");
  assert.equal(result.items[0].partial, true);
});

test("distingue ausência de resultado e credencial OMDb", async () => {
  globalThis.fetch = async () => Response.json({ Response: "False", Error: "Movie not found!" });
  await assert.rejects(() => searchOmdb({ query: "inexistente", page: 1 }), (error: ProviderError) => error.code === "not_found");
  globalThis.fetch = async () => Response.json({ Response: "False", Error: "Invalid API key!" });
  await assert.rejects(() => searchOmdb({ query: "filme", page: 1 }), (error: ProviderError) => error.code === "authentication");
});

test("normaliza detalhes OMDb e mantém campos complementares ausentes", async () => {
  globalThis.fetch = async () => Response.json({
    Response: "True", Title: "Detalhe", Year: "2022", imdbID: "tt7654321", Type: "series", Poster: "N/A",
    Plot: "Sinopse disponível", Runtime: "N/A", Genre: "Drama", Director: "N/A", Writer: "Autora", Actors: "Pessoa", imdbRating: "7.1"
  });
  const detail = await getOmdbDetails("tt7654321");
  assert.equal(detail.mediaType, "series");
  assert.equal(detail.poster, null);
  assert.equal(detail.runtime, null);
  assert.equal(detail.plot, "Sinopse disponível");
  assert.equal(detail.ids.imdb, "tt7654321");
});

test("distingue erro HTTP, limite, resposta inválida e timeout", async () => {
  globalThis.fetch = async () => new Response("", { status: 429 });
  await assert.rejects(() => searchOmdb({ query: "filme", page: 1 }), (error: ProviderError) => error.code === "rate_limit");

  globalThis.fetch = async () => new Response("não-json", { status: 200 });
  await assert.rejects(() => searchOmdb({ query: "filme", page: 1 }), (error: ProviderError) => error.code === "invalid_response");

  globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  });
  await assert.rejects(
    () => fetchProviderJson(new URL("https://example.com"), { provider: "omdb", timeoutMs: 5 }),
    (error: ProviderError) => error.code === "timeout"
  );
});

test("normaliza busca TMDB sem exigir correspondência na OMDb", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, "/3/search/tv");
    return Response.json({ page: 1, total_pages: 1, total_results: 1, results: [
      { id: 42, name: "Série parcial", first_air_date: "2024-02-01", poster_path: null, overview: "" }
    ] });
  };
  const result = await queryTmdb({ operation: "search", media: "tv", query: "série", page: 1 });
  if (!("items" in result) || !Array.isArray(result.items)) assert.fail("resultado deveria ser uma lista");
  const item = result.items[0] as { ids: { imdb: string | null; tmdb: number | null }; mediaType: string };
  assert.equal(item.ids.imdb, null);
  assert.equal(item.ids.tmdb, 42);
  assert.equal(item.mediaType, "series");
});

test("duas pesquisas rápidas mantêm respostas independentes do provedor", async () => {
  globalThis.fetch = async (input) => {
    const query = new URL(String(input)).searchParams.get("s")!;
    await new Promise((resolve) => setTimeout(resolve, query === "antiga" ? 15 : 1));
    return Response.json({ Response: "True", totalResults: "1", Search: [
      { Title: query, Year: "2025", imdbID: query === "antiga" ? "tt1111111" : "tt2222222", Type: "movie", Poster: "N/A" }
    ] });
  };
  const antiga = searchOmdb({ query: "antiga", page: 1 });
  const nova = searchOmdb({ query: "nova", page: 1 });
  assert.equal((await nova).items[0].title, "nova");
  assert.equal((await antiga).items[0].title, "antiga");
});
