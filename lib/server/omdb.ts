import { fetchProviderJson } from "./fetch-json";
import { configurationError, ProviderError } from "./provider-error";
import type { MediaType } from "./params";

type ObjectValue = Record<string, unknown>;

export type NormalizedTitle = {
  id: string;
  ids: { imdb: string | null; tmdb: number | null };
  mediaType: MediaType;
  title: string;
  year: string | null;
  poster: string | null;
  plot: string | null;
  source: "omdb" | "tmdb";
  partial: boolean;
  genreIds?: number[];
  popularity?: number;
  rating?: number;
  votes?: number;
};

function record(value: unknown): ObjectValue | null {
  return value !== null && typeof value === "object" ? value as ObjectValue : null;
}

function string(value: unknown) {
  return typeof value === "string" && value !== "N/A" && value.trim() ? value : null;
}

function omdbMessageError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("not found")) return new ProviderError("not_found", "Nenhum título encontrado.", "omdb", 404);
  if (lower.includes("api key") || lower.includes("request limit")) {
    const limit = lower.includes("limit");
    return new ProviderError(limit ? "rate_limit" : "authentication", limit ? "O limite de consultas da OMDb foi atingido." : "A credencial da OMDb foi recusada.", "omdb", limit ? 429 : 502);
  }
  return new ProviderError("unavailable", `A OMDb não concluiu a consulta: ${message}`, "omdb", 502);
}

function normalize(item: ObjectValue, details = false): NormalizedTitle {
  const imdb = string(item.imdbID);
  const title = string(item.Title);
  if (!imdb || !/^tt\d+$/.test(imdb) || !title) {
    throw new ProviderError("invalid_response", "Resposta inválida da OMDb.", "omdb", 502);
  }
  return {
    id: `imdb:${imdb}`,
    ids: { imdb, tmdb: null },
    mediaType: item.Type === "series" ? "series" : "movie",
    title,
    year: string(item.Year),
    poster: string(item.Poster),
    plot: details ? string(item.Plot) : null,
    source: "omdb",
    partial: !string(item.Poster) || (details && !string(item.Plot))
  };
}

function key() {
  const value = process.env.OMDB_API_KEY?.trim();
  if (!value) throw configurationError("omdb");
  return value;
}

export async function searchOmdb(input: { query: string; page: number; mediaType?: MediaType }) {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", key());
  url.searchParams.set("s", input.query);
  url.searchParams.set("page", String(input.page));
  if (input.mediaType) url.searchParams.set("type", input.mediaType);

  const value = record(await fetchProviderJson(url, { provider: "omdb", revalidate: 300 }));
  if (!value) throw new ProviderError("invalid_response", "Resposta inválida da OMDb.", "omdb", 502);
  if (value.Response === "False") throw omdbMessageError(string(value.Error) ?? "erro desconhecido");
  if (!Array.isArray(value.Search) || !/^\d+$/.test(String(value.totalResults))) {
    throw new ProviderError("invalid_response", "Resposta de busca inválida da OMDb.", "omdb", 502);
  }

  const items = value.Search.map((item) => {
    const entry = record(item);
    if (!entry) throw new ProviderError("invalid_response", "Item inválido retornado pela OMDb.", "omdb", 502);
    return normalize(entry);
  });
  const totalResults = Number(value.totalResults);
  return { items, page: input.page, totalResults, totalPages: Math.ceil(totalResults / 10), source: "omdb" as const };
}

export async function getOmdbDetails(imdbId: string) {
  const url = new URL("https://www.omdbapi.com/");
  url.searchParams.set("apikey", key());
  url.searchParams.set("i", imdbId);
  url.searchParams.set("plot", "full");
  const value = record(await fetchProviderJson(url, { provider: "omdb", revalidate: 3_600 }));
  if (!value) throw new ProviderError("invalid_response", "Resposta inválida da OMDb.", "omdb", 502);
  if (value.Response === "False") throw omdbMessageError(string(value.Error) ?? "erro desconhecido");
  const title = normalize(value, true);
  return {
    ...title,
    runtime: string(value.Runtime),
    genre: string(value.Genre),
    director: string(value.Director),
    writer: string(value.Writer),
    actors: string(value.Actors),
    imdbRating: string(value.imdbRating)
  };
}
