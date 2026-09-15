import type { Language } from "./catalog";

export const MY_LIST_KEY = "askfilmx:my-list:v1";
export const LEGACY_FAVORITES_KEY = "favoritos";
export const MAX_LIST_ITEMS = 250;
export const MAX_IMPORT_BYTES = 256 * 1024;
const LANGUAGE_KEY = "askfilm-language";

export type MyListItem = {
  id: string;
  ids: { imdb: string | null; tmdb: number | null };
  source: "omdb" | "tmdb";
  title: string;
  year: string;
  type: "Filme" | "Série";
  poster: string | null;
  addedAt: string;
};

export type StorageResult<T> = { value: T; error: string | null };

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    // Access itself can throw when storage is disabled.
    void storage.length;
    return storage;
  } catch { return null; }
}

export function safePosterUrl(value: unknown): string | null {
  if (typeof value !== "string" || value === "N/A" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch { return null; }
}

export function validateMyListItem(value: unknown): MyListItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const ids = item.ids && typeof item.ids === "object" ? item.ids as Record<string, unknown> : {};
  const imdb = typeof ids.imdb === "string" && /^tt\d{5,12}$/.test(ids.imdb) ? ids.imdb : null;
  const tmdb = typeof ids.tmdb === "number" && Number.isSafeInteger(ids.tmdb) && ids.tmdb > 0 ? ids.tmdb : null;
  if (typeof item.id !== "string" || item.id.length > 80 || (!imdb && !tmdb) ||
      (item.source !== "omdb" && item.source !== "tmdb") || typeof item.title !== "string" || !item.title.trim() || item.title.length > 300 ||
      typeof item.year !== "string" || item.year.length > 20 || (item.type !== "Filme" && item.type !== "Série") ||
      typeof item.addedAt !== "string" || Number.isNaN(Date.parse(item.addedAt))) return null;
  return { id: item.id, ids: { imdb, tmdb }, source: item.source, title: item.title.trim(), year: item.year, type: item.type, poster: safePosterUrl(item.poster), addedAt: item.addedAt };
}

function fingerprint(item: MyListItem) {
  if (item.ids.imdb) return `imdb:${item.ids.imdb}`;
  if (item.ids.tmdb) return `tmdb:${item.type}:${item.ids.tmdb}`;
  return `${item.type}:${item.title.toLocaleLowerCase().replace(/[^a-z0-9]/g, "")}:${item.year}`;
}

function titleFingerprint(item: MyListItem) {
  return `${item.type}:${item.title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")}:${item.year.replace(/[^0-9]/g, "").slice(0, 4)}`;
}

export function mergeMyLists(current: MyListItem[], incoming: MyListItem[]) {
  const result: MyListItem[] = [];
  const identities = new Set<string>();
  const titles = new Set<string>();
  for (const item of [...current, ...incoming]) {
    const identity = fingerprint(item);
    const title = titleFingerprint(item);
    if (identities.has(identity) || titles.has(title) || result.length >= MAX_LIST_ITEMS) continue;
    identities.add(identity); titles.add(title); result.push(item);
  }
  return result;
}

export function parseMyListJson(text: string): StorageResult<MyListItem[]> {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return { value: [], error: "too-large" };
  try {
    const parsed: unknown = JSON.parse(text);
    const entries = Array.isArray(parsed) ? parsed : parsed && typeof parsed === "object" ? (parsed as { items?: unknown }).items : null;
    if (!Array.isArray(entries) || entries.length > MAX_LIST_ITEMS) return { value: [], error: "invalid" };
    const items = entries.map(validateMyListItem);
    if (items.some((item) => item === null)) return { value: [], error: "invalid" };
    return { value: mergeMyLists([], items as MyListItem[]), error: null };
  } catch { return { value: [], error: "invalid-json" }; }
}

export function loadMyList(): StorageResult<MyListItem[]> {
  const storage = browserStorage();
  if (!storage) return { value: [], error: "unavailable" };
  try {
    const raw = storage.getItem(MY_LIST_KEY);
    if (raw === null) return { value: [], error: null };
    const result = parseMyListJson(raw);
    return result.error ? { value: [], error: "corrupt" } : result;
  } catch { return { value: [], error: "unavailable" }; }
}

export function persistMyList(items: MyListItem[]): string | null {
  const storage = browserStorage();
  if (!storage) return "unavailable";
  try { storage.setItem(MY_LIST_KEY, JSON.stringify(items.slice(0, MAX_LIST_ITEMS))); return null; }
  catch { return "quota"; }
}

export function getLegacyFavoriteIds(): string[] {
  const storage = browserStorage();
  if (!storage) return [];
  try { const value: unknown = JSON.parse(storage.getItem(LEGACY_FAVORITES_KEY) ?? "[]"); return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === "string" && /^tt\d{5,12}$/.test(id)))].slice(0, MAX_LIST_ITEMS) : []; }
  catch { return []; }
}

export function getLanguagePreference(): Language | null {
  const storage = browserStorage(); if (!storage) return null;
  try { const value = storage.getItem(LANGUAGE_KEY); return value === "pt-BR" || value === "en" ? value : null; } catch { return null; }
}
export function saveLanguagePreference(language: Language) { const storage = browserStorage(); if (storage) try { storage.setItem(LANGUAGE_KEY, language); } catch {} }
