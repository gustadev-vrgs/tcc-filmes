import type { Language } from "../catalog";
import { MOVIE_GENRES, TV_GENRES, type RecommendationCriteria, type RecommendationResponse } from "../recommendation";
import { AiError, runAi } from "./ai";
import { ProviderError } from "./provider-error";
import { queryTmdb } from "./tmdb";

type Candidate = { id: string; ids: { imdb: string | null; tmdb: number | null }; mediaType: "movie" | "series"; title: string; year: string | null; poster: string | null; plot: string | null; source: "tmdb"; partial: boolean; genreIds?: number[]; popularity?: number; rating?: number; votes?: number };
type Dependencies = { ai?: typeof runAi; tmdb?: typeof queryTmdb };

const allGenres = new Set([...Object.keys(MOVIE_GENRES), ...Object.keys(TV_GENRES)]);

export function validateCriteria(value: unknown): RecommendationCriteria {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiError("invalid_response", "A IA retornou critérios inválidos; a busca não foi executada.", 502);
  const v = value as Record<string, unknown>; const required = v.required as Record<string, unknown> | null; const preferences = v.preferences as Record<string, unknown> | null;
  const similar = v.similarTo as Record<string, unknown> | null;
  const genres = required?.genres;
  const validYear = (year: unknown) => year === null || (Number.isInteger(year) && Number(year) >= 1900 && Number(year) <= 2100);
  if (v.version !== 1 || !["movie", "tv", "any"].includes(String(v.mediaType)) || !required || !Array.isArray(genres) || genres.length > 5 || !genres.every((g) => typeof g === "string" && allGenres.has(g)) ||
      !validYear(required.yearFrom) || !validYear(required.yearTo) || (required.yearFrom && required.yearTo && Number(required.yearFrom) > Number(required.yearTo)) || !preferences || !["popularity", "rating"].includes(String(preferences.sort)) ||
      !Number.isInteger(v.requestedCount) || Number(v.requestedCount) < 1 || Number(v.requestedCount) > 10 || (v.clarification !== null && typeof v.clarification !== "string") || !Array.isArray(v.limitations) || !v.limitations.every((x) => typeof x === "string") ||
      (similar !== null && (!similar || typeof similar.title !== "string" || !similar.title.trim() || !validYear(similar.year) || ![null, "movie", "tv"].includes(similar.mediaType as null | string) || (similar.imdbId !== null && (typeof similar.imdbId !== "string" || !/^tt\d{5,12}$/.test(similar.imdbId))) || (similar.tmdbId !== null && (!Number.isInteger(similar.tmdbId) || Number(similar.tmdbId) <= 0))))) {
    throw new AiError("invalid_response", "A IA retornou critérios inválidos; a busca não foi executada.", 502);
  }
  return value as RecommendationCriteria;
}

function genreIds(criteria: RecommendationCriteria, media: "movie" | "tv") {
  const table: Record<string, number> = media === "movie" ? MOVIE_GENRES : TV_GENRES;
  return criteria.required.genres.map((genre) => table[genre]).filter((id): id is number => Number.isInteger(id));
}
function normalizeTitle(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
function applies(candidate: Candidate, criteria: RecommendationCriteria, media: "movie" | "tv") {
  const year = candidate.year ? Number(candidate.year.slice(0, 4)) : null;
  if (criteria.required.yearFrom !== null && (year === null || year < criteria.required.yearFrom)) return false;
  if (criteria.required.yearTo !== null && (year === null || year > criteria.required.yearTo)) return false;
  const requiredGenres = genreIds(criteria, media);
  return requiredGenres.every((id) => Array.isArray(candidate.genreIds) && candidate.genreIds.includes(id));
}
function reason(candidate: Candidate, criteria: RecommendationCriteria, related: boolean, language: Language) {
  const facts: string[] = [];
  if (related && criteria.similarTo) facts.push(language === "en" ? `catalog-related to ${criteria.similarTo.title}` : `relacionado no catálogo a ${criteria.similarTo.title}`);
  if (candidate.year) facts.push(language === "en" ? `released in ${candidate.year}` : `lançado em ${candidate.year}`);
  const names = criteria.required.genres.filter((name) => candidate.genreIds?.includes((candidate.mediaType === "series" ? TV_GENRES : MOVIE_GENRES)[name as keyof (typeof TV_GENRES | typeof MOVIE_GENRES)] as number));
  if (names.length) facts.push(`${language === "en" ? "genres" : "gêneros"}: ${names.join(", ")}`);
  if (criteria.preferences.sort === "rating" && candidate.rating) facts.push(`${language === "en" ? "catalog rating" : "nota no catálogo"} ${candidate.rating.toFixed(1)}`);
  return (language === "en" ? "Recommended because it is " : "Recomendado porque é ") + facts.join(language === "en" ? ", and " : ", e ") + ".";
}

export async function recommend(text: string, language: Language, deps: Dependencies = {}, broaden = false): Promise<RecommendationResponse> {
  const ai = deps.ai ?? runAi; const tmdb = deps.tmdb ?? queryTmdb;
  const interpreted = await ai({ operation: "interpret_request", text, language });
  if (interpreted.operation !== "interpret_request") throw new AiError("invalid_response", "A IA retornou uma operação inesperada.", 502);
  const interpretedCriteria = validateCriteria(interpreted.criteria);
  const criteria = broaden ? { ...interpretedCriteria, required: { genres: [], yearFrom: null, yearTo: null }, limitations: [...interpretedCriteria.limitations, language === "en" ? "Required genre and period filters were removed after your explicit action." : "Filtros obrigatórios de gênero e período foram removidos após sua ação explícita."] } : interpretedCriteria;
  if (criteria.clarification) return { criteria, items: [], message: criteria.clarification, canBroaden: false, partialFailures: 0, limitations: criteria.limitations };

  const mediaTypes: ("movie" | "tv")[] = criteria.mediaType === "any" ? ["movie", "tv"] : [criteria.mediaType];
  let bases: Array<{ id: number; media: "movie" | "tv" }> = []; let partialFailures = 0; let related = false;
  if (criteria.similarTo) {
    if (criteria.similarTo.tmdbId) bases = [{ id: criteria.similarTo.tmdbId, media: criteria.similarTo.mediaType ?? (criteria.mediaType === "tv" ? "tv" : "movie") }];
    else if (criteria.similarTo.imdbId) {
      const resolutions = await Promise.allSettled((criteria.similarTo.mediaType ? [criteria.similarTo.mediaType] : mediaTypes).map((media) => tmdb({ operation: "resolve", media, imdbId: criteria.similarTo!.imdbId! })));
      partialFailures += resolutions.filter((result) => result.status === "rejected").length;
      bases = resolutions.flatMap((result) => result.status === "fulfilled" && "tmdbId" in result.value && result.value.tmdbId ? [{ id: result.value.tmdbId, media: result.value.mediaType }] : []);
    }
    else {
      const searches = await Promise.allSettled((criteria.similarTo.mediaType ? [criteria.similarTo.mediaType] : mediaTypes).map((media) => tmdb({ operation: "search", media, query: criteria.similarTo!.title, page: 1 }).then((r) => ({ media, items: "items" in r ? r.items as Candidate[] : [] }))));
      partialFailures += searches.filter((r) => r.status === "rejected").length;
      const matching = searches.flatMap((r) => r.status === "fulfilled" ? r.value.items.map((item) => ({ item, media: r.value.media })) : []).filter(({ item, media }) => normalizeTitle(item.title) === normalizeTitle(criteria.similarTo!.title) && (!criteria.similarTo!.year || Number(item.year?.slice(0, 4)) === criteria.similarTo!.year) && (!criteria.similarTo!.mediaType || media === criteria.similarTo!.mediaType));
      const matches = [...new Map(matching.map((match) => [`${match.media}:${match.item.ids.tmdb}`, match])).values()];
      if (matches.length !== 1) {
        const message = language === "en" ? `Which “${criteria.similarTo.title}” do you mean? Please add the year or say whether it is a movie or series.` : `Qual “${criteria.similarTo.title}” você quer dizer? Informe o ano ou se é filme ou série.`;
        return { criteria, items: [], message, canBroaden: false, partialFailures, limitations: criteria.limitations };
      }
      bases = [{ id: matches[0].item.ids.tmdb!, media: matches[0].media }];
    }
    if (!bases.length) {
      const message = language === "en" ? `I could not resolve “${criteria.similarTo.title}” in the catalog. Check its title, year, or type.` : `Não consegui resolver “${criteria.similarTo.title}” no catálogo. Confira título, ano ou tipo.`;
      return { criteria, items: [], message, canBroaden: false, partialFailures, limitations: criteria.limitations };
    }
  }
  const calls = bases.length ? bases.map((base) => tmdb({ operation: "related", media: base.media, id: String(base.id), page: 1 })) : mediaTypes.map((media) => tmdb({ operation: "discover", media, genres: genreIds(criteria, media).join(",") || undefined, yearFrom: criteria.required.yearFrom ?? undefined, yearTo: criteria.required.yearTo ?? undefined, sort: criteria.preferences.sort, page: 1 }));
  related = bases.length > 0;
  const settled = await Promise.allSettled(calls); partialFailures += settled.filter((r) => r.status === "rejected").length;
  let candidates = settled.flatMap((r) => r.status === "fulfilled" && "items" in r.value ? r.value.items as Candidate[] : []);
  candidates = candidates.filter((item) => applies(item, criteria, item.mediaType === "series" ? "tv" : "movie"));
  const unique = [...new Map(candidates.map((item) => [`${item.mediaType}:${item.ids.tmdb}`, item])).values()];
  unique.sort((a, b) => criteria.preferences.sort === "rating" ? (b.rating ?? 0) * Math.log((b.votes ?? 0) + 1) - (a.rating ?? 0) * Math.log((a.votes ?? 0) + 1) : (b.popularity ?? 0) - (a.popularity ?? 0));
  const items = unique.slice(0, criteria.requestedCount).map((item) => ({ id: item.id, ids: item.ids, source: "tmdb" as const, title: item.title, year: item.year ?? "—", type: item.mediaType === "series" ? "Série" as const : "Filme" as const, poster: item.poster ?? "N/A", reason: reason(item, criteria, related, language) }));
  if (!items.length && settled.every((r) => r.status === "rejected")) throw new ProviderError("unavailable", language === "en" ? "The catalog failed and no item could be displayed." : "O catálogo falhou e nenhum item pôde ser exibido.", "tmdb", 503);
  const short = items.length < criteria.requestedCount;
  const message = !items.length ? (language === "en" ? "No catalog title meets every required criterion." : "Nenhum título do catálogo atende a todos os critérios obrigatórios.") : short ? (language === "en" ? `Only ${items.length} title(s) met every required criterion.` : `Apenas ${items.length} título(s) atenderam a todos os critérios obrigatórios.`) : (language === "en" ? `${items.length} verified catalog recommendations.` : `${items.length} recomendações verificadas no catálogo.`);
  return { criteria, items, message, canBroaden: short, partialFailures, limitations: criteria.limitations };
}
