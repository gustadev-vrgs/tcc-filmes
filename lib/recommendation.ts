import type { CatalogItem, Language } from "./catalog";

export const MOVIE_GENRES = { Action: 28, Adventure: 12, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Fantasy: 14, History: 36, Horror: 27, Music: 10402, Mystery: 9648, Romance: 10749, "Science Fiction": 878, Thriller: 53, War: 10752, Western: 37 } as const;
export const TV_GENRES = { "Action & Adventure": 10759, Animation: 16, Comedy: 35, Crime: 80, Documentary: 99, Drama: 18, Family: 10751, Kids: 10762, Mystery: 9648, "Sci-Fi & Fantasy": 10765, "War & Politics": 10768, Western: 37 } as const;

export type RecommendationCriteria = {
  version: 1;
  mediaType: "movie" | "tv" | "any";
  required: { genres: string[]; yearFrom: number | null; yearTo: number | null };
  preferences: { sort: "popularity" | "rating" };
  similarTo: { title: string; year: number | null; mediaType: "movie" | "tv" | null; imdbId: string | null; tmdbId: number | null } | null;
  requestedCount: number;
  clarification: string | null;
  limitations: string[];
};

export type RecommendedItem = CatalogItem & { reason: string; ids: { imdb: string | null; tmdb: number | null }; source: "tmdb" };
export type RecommendationResponse = { criteria: RecommendationCriteria; items: RecommendedItem[]; message: string; canBroaden: boolean; partialFailures: number; limitations: string[] };

export interface AiRecommendationEngine {
  interpret(text: string, language: Language, signal?: AbortSignal): Promise<RecommendationCriteria>;
}

const allowedGenres = new Set([...Object.keys(MOVIE_GENRES), ...Object.keys(TV_GENRES)]);

/** The shared cloud/local interpretation contract. */
export function isRecommendationCriteria(value: unknown): value is RecommendationCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const required = v.required as Record<string, unknown> | null;
  const preferences = v.preferences as Record<string, unknown> | null;
  const similar = v.similarTo as Record<string, unknown> | null;
  const genres = required?.genres;
  const validYear = (year: unknown) => year === null || (Number.isInteger(year) && Number(year) >= 1900 && Number(year) <= 2100);
  return v.version === 1 && ["movie", "tv", "any"].includes(String(v.mediaType)) && Boolean(required) &&
    Array.isArray(genres) && genres.length <= 5 && genres.every((genre) => typeof genre === "string" && allowedGenres.has(genre)) &&
    validYear(required?.yearFrom) && validYear(required?.yearTo) && !(required?.yearFrom && required?.yearTo && Number(required.yearFrom) > Number(required.yearTo)) &&
    Boolean(preferences) && ["popularity", "rating"].includes(String(preferences?.sort)) && Number.isInteger(v.requestedCount) && Number(v.requestedCount) >= 1 && Number(v.requestedCount) <= 10 &&
    (v.clarification === null || typeof v.clarification === "string") && Array.isArray(v.limitations) && v.limitations.length <= 5 && v.limitations.every((item) => typeof item === "string" && item.length <= 120) &&
    (similar === null || (Boolean(similar) && typeof similar.title === "string" && Boolean(similar.title.trim()) && validYear(similar.year) && [null, "movie", "tv"].includes(similar.mediaType as null | string) &&
      (similar.imdbId === null || (typeof similar.imdbId === "string" && /^tt\d{5,12}$/.test(similar.imdbId))) && (similar.tmdbId === null || (Number.isInteger(similar.tmdbId) && Number(similar.tmdbId) > 0))));
}

export function isRecommendationResponse(value: unknown): value is RecommendationResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.items) && typeof data.message === "string" && typeof data.canBroaden === "boolean" &&
    data.items.every((item) => Boolean(item) && typeof item === "object" && typeof (item as RecommendedItem).id === "string" && typeof (item as RecommendedItem).reason === "string");
}
