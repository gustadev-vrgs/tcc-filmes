import type { CatalogItem, Language } from "./catalog";

const LANGUAGE_KEY = "askfilm-language";
const MY_LIST_KEY = "askfilmx:my-list";

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getLanguagePreference(): Language | null {
  if (!storageAvailable()) return null;

  const value = window.localStorage.getItem(LANGUAGE_KEY);
  return value === "pt-BR" || value === "en" ? value : null;
}

export function saveLanguagePreference(language: Language) {
  if (storageAvailable()) window.localStorage.setItem(LANGUAGE_KEY, language);
}

export function getMyList(): CatalogItem[] {
  if (!storageAvailable()) return [];

  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(MY_LIST_KEY) ?? "[]");
    if (!Array.isArray(value)) return [];

    return value.filter((item): item is CatalogItem => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Record<string, unknown>;
      return (
        typeof entry.id === "string" &&
        typeof entry.title === "string" &&
        typeof entry.year === "string" &&
        (entry.type === "Filme" || entry.type === "Série") &&
        typeof entry.poster === "string"
      );
    });
  } catch {
    return [];
  }
}

export function saveMyList(items: CatalogItem[]) {
  if (!storageAvailable()) return;

  const uniqueItems = Array.from(new Map(items.map((item) => [item.id, item])).values());
  window.localStorage.setItem(MY_LIST_KEY, JSON.stringify(uniqueItems));
}
