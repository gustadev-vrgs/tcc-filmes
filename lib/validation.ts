export type CatalogSearchPayload = {
  items: Array<{
    id: string;
    ids: { imdb: string | null; tmdb: number | null };
    mediaType: "movie" | "series";
    title: string;
    year: string | null;
    poster: string | null;
    plot: string | null;
    source: "omdb" | "tmdb";
    partial: boolean;
  }>;
  totalResults: number;
  totalPages: number;
  page: number;
  source: "omdb";
};

export function isCatalogSearchPayload(value: unknown): value is CatalogSearchPayload {
  if (!value || typeof value !== "object") return false;

  const payload = value as Record<string, unknown>;
  return (
    Array.isArray(payload.items) &&
    payload.items.every((item) => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Record<string, unknown>;
      const ids = entry.ids && typeof entry.ids === "object" ? entry.ids as Record<string, unknown> : null;
      return typeof entry.id === "string" && typeof entry.title === "string" &&
        (entry.year === null || typeof entry.year === "string") &&
        (entry.poster === null || typeof entry.poster === "string") &&
        (entry.mediaType === "movie" || entry.mediaType === "series") && ids !== null &&
        (ids.imdb === null || typeof ids.imdb === "string");
    }) &&
    Number.isInteger(payload.totalResults) && Number.isInteger(payload.totalPages) && Number.isInteger(payload.page) &&
    payload.source === "omdb"
  );
}
