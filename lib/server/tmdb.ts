import { fetchProviderJson } from "./fetch-json";
import { configurationError, ProviderError } from "./provider-error";
import type { TmdbMediaType } from "./params";
import type { NormalizedTitle } from "./omdb";

type Data = Record<string, unknown>;
type TmdbOperation = "search" | "discover" | "related" | "highlights" | "credits" | "videos" | "providers" | "resolve";

function object(value: unknown): Data | null {
  return value !== null && typeof value === "object" ? value as Data : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function number(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function apiKey() {
  const value = process.env.TMDB_API_KEY?.trim();
  if (!value) throw configurationError("tmdb");
  return value;
}

function baseUrl(path: string) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set("api_key", apiKey());
  url.searchParams.set("language", "pt-BR");
  return url;
}

function normalize(item: Data, media: TmdbMediaType): NormalizedTitle {
  const tmdb = number(item.id);
  const title = text(media === "tv" ? item.name : item.title);
  if (tmdb === null || !Number.isInteger(tmdb) || !title) {
    throw new ProviderError("invalid_response", "Item inválido retornado pela TMDB.", "tmdb", 502);
  }
  const date = text(media === "tv" ? item.first_air_date : item.release_date);
  const posterPath = text(item.poster_path);
  return {
    id: `tmdb:${media}:${tmdb}`,
    ids: { imdb: null, tmdb },
    mediaType: media === "tv" ? "series" : "movie",
    title,
    year: date?.slice(0, 4) ?? null,
    poster: posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : null,
    plot: text(item.overview),
    source: "tmdb",
    partial: !posterPath || !text(item.overview)
  };
}

async function list(url: URL, media: TmdbMediaType, page: number) {
  const data = object(await fetchProviderJson(url, { provider: "tmdb", revalidate: 600 }));
  if (!data || !Array.isArray(data.results) || number(data.total_results) === null || number(data.total_pages) === null) {
    throw new ProviderError("invalid_response", "Resposta de catálogo inválida da TMDB.", "tmdb", 502);
  }
  return {
    items: data.results.map((item) => {
      const entry = object(item);
      if (!entry) throw new ProviderError("invalid_response", "Item inválido retornado pela TMDB.", "tmdb", 502);
      return normalize(entry, media);
    }),
    page,
    totalResults: number(data.total_results)!,
    totalPages: number(data.total_pages)!,
    source: "tmdb" as const
  };
}

export async function queryTmdb(input: {
  operation: TmdbOperation;
  media: TmdbMediaType;
  page?: number;
  query?: string;
  id?: string;
  imdbId?: string;
  genres?: string;
  yearFrom?: number;
  yearTo?: number;
  sort?: "popularity" | "rating";
  window?: "day" | "week";
}) {
  const page = input.page ?? 1;
  let url: URL;

  if (input.operation === "search") {
    url = baseUrl(`/search/${input.media}`);
    url.searchParams.set("query", input.query!);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("page", String(page));
    return list(url, input.media, page);
  }
  if (input.operation === "discover") {
    url = baseUrl(`/discover/${input.media}`);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("vote_count.gte", "40");
    url.searchParams.set("sort_by", input.sort === "rating" ? "vote_average.desc" : "popularity.desc");
    url.searchParams.set("page", String(page));
    if (input.genres) url.searchParams.set("with_genres", input.genres);
    const field = input.media === "tv" ? "first_air_date" : "primary_release_date";
    if (input.yearFrom) url.searchParams.set(`${field}.gte`, `${input.yearFrom}-01-01`);
    if (input.yearTo) url.searchParams.set(`${field}.lte`, `${input.yearTo}-12-31`);
    return list(url, input.media, page);
  }
  if (input.operation === "highlights") {
    url = baseUrl(`/trending/${input.media}/${input.window ?? "week"}`);
    url.searchParams.set("page", String(page));
    return list(url, input.media, page);
  }
  if (input.operation === "related") {
    url = baseUrl(`/${input.media}/${input.id}/recommendations`);
    url.searchParams.set("page", String(page));
    return list(url, input.media, page);
  }
  if (input.operation === "resolve") {
    url = input.imdbId
      ? baseUrl(`/find/${input.imdbId}`)
      : baseUrl(`/${input.media}/${input.id}`);
    if (input.imdbId) url.searchParams.set("external_source", "imdb_id");
    else if (input.media === "tv") url.searchParams.set("append_to_response", "external_ids");
    const data = object(await fetchProviderJson(url, { provider: "tmdb", revalidate: 86_400 }));
    if (!data) throw new ProviderError("invalid_response", "Resposta de identificadores inválida da TMDB.", "tmdb", 502);
    if (input.imdbId) {
      const results = input.media === "tv" ? data.tv_results : data.movie_results;
      const first = Array.isArray(results) ? object(results[0]) : null;
      return { imdbId: input.imdbId, tmdbId: first ? number(first.id) : null, mediaType: input.media, source: "tmdb" as const };
    }
    const external = object(data.external_ids);
    return { imdbId: text(input.media === "tv" ? external?.imdb_id : data.imdb_id), tmdbId: Number(input.id), mediaType: input.media, source: "tmdb" as const };
  }

  url = baseUrl(`/${input.media}/${input.id}/${input.operation === "providers" ? "watch/providers" : input.operation}`);
  const data = object(await fetchProviderJson(url, { provider: "tmdb", revalidate: 3_600 }));
  if (!data) throw new ProviderError("invalid_response", `Resposta de ${input.operation} inválida da TMDB.`, "tmdb", 502);
  const field = input.operation === "credits" ? "cast" : "results";
  const valid = input.operation === "providers" ? object(data.results) !== null : Array.isArray(data[field]);
  if (!valid) throw new ProviderError("invalid_response", `Resposta de ${input.operation} inválida da TMDB.`, "tmdb", 502);
  return { [field]: data[field], source: "tmdb" as const };
}
