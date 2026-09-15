import type { OmdbSearchItem } from "./catalog";

export type OmdbSearchPayload = {
  Search: OmdbSearchItem[];
  totalResults: string;
};

function isSearchItem(value: unknown): value is OmdbSearchItem {
  if (!value || typeof value !== "object") return false;

  const item = value as Record<string, unknown>;
  return ["Title", "Year", "imdbID", "Type", "Poster"].every(
    (field) => typeof item[field] === "string"
  );
}

export function isOmdbSearchPayload(value: unknown): value is OmdbSearchPayload {
  if (!value || typeof value !== "object") return false;

  const payload = value as Record<string, unknown>;
  return (
    Array.isArray(payload.Search) &&
    payload.Search.every(isSearchItem) &&
    typeof payload.totalResults === "string" &&
    /^\d+$/.test(payload.totalResults)
  );
}
