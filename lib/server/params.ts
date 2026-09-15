import { ProviderError } from "./provider-error";

export type MediaType = "movie" | "series";
export type TmdbMediaType = "movie" | "tv";

export function textParam(value: string | null, name: string, maxLength = 120) {
  const text = value?.trim() ?? "";
  if (!text || text.length > maxLength) {
    throw new ProviderError("invalid_response", `Parâmetro ${name} inválido.`, "omdb", 400);
  }
  return text;
}

export function pageParam(value: string | null, provider: "omdb" | "tmdb" = "omdb") {
  const page = value === null ? 1 : Number(value);
  if (!Number.isInteger(page) || page < 1 || page > 500) {
    throw new ProviderError("invalid_response", "Parâmetro page deve estar entre 1 e 500.", provider, 400);
  }
  return page;
}

export function tmdbMediaParam(value: string | null): TmdbMediaType {
  if (value !== "movie" && value !== "tv") {
    throw new ProviderError("invalid_response", "Parâmetro media deve ser movie ou tv.", "tmdb", 400);
  }
  return value;
}

export function numericIdParam(value: string | null) {
  if (!value || !/^\d{1,12}$/.test(value)) {
    throw new ProviderError("invalid_response", "Identificador TMDB inválido.", "tmdb", 400);
  }
  return value;
}

export function imdbIdParam(value: string | null) {
  if (!value || !/^tt\d{5,12}$/.test(value)) {
    throw new ProviderError("invalid_response", "Identificador IMDb inválido.", "omdb", 400);
  }
  return value;
}
