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

export function isRecommendationResponse(value: unknown): value is RecommendationResponse {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return Array.isArray(data.items) && typeof data.message === "string" && typeof data.canBroaden === "boolean" &&
    data.items.every((item) => Boolean(item) && typeof item === "object" && typeof (item as RecommendedItem).id === "string" && typeof (item as RecommendedItem).reason === "string");
}
