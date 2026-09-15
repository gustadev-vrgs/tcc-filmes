import { NextResponse } from "next/server";
import { numericIdParam, pageParam, tmdbMediaParam } from "../../../lib/server/params";
import { ProviderError } from "../../../lib/server/provider-error";
import { queryTmdb } from "../../../lib/server/tmdb";

const OPERATIONS = ["search", "discover", "related", "highlights", "credits", "videos", "providers", "resolve"] as const;
type Operation = (typeof OPERATIONS)[number];

function year(value: string | null, name: string) {
  if (value === null) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1900 || parsed > 2100) {
    throw new ProviderError("invalid_response", `${name} deve estar entre 1900 e 2100.`, "tmdb", 400);
  }
  return parsed;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const operation = params.get("operation") as Operation | null;
    if (!operation || !OPERATIONS.includes(operation)) {
      throw new ProviderError("invalid_response", `Operação inválida. Permitidas: ${OPERATIONS.join(", ")}.`, "tmdb", 400);
    }
    const media = tmdbMediaParam(params.get("media"));
    const needsId = ["related", "credits", "videos", "providers"].includes(operation);
    const id = needsId || (operation === "resolve" && !params.get("imdbId")) ? numericIdParam(params.get("id")) : undefined;
    const query = params.get("query")?.trim();
    if (operation === "search" && (!query || query.length > 120)) {
      throw new ProviderError("invalid_response", "Parâmetro query inválido.", "tmdb", 400);
    }
    const imdbId = params.get("imdbId")?.trim();
    if (imdbId && !/^tt\d{5,12}$/.test(imdbId)) {
      throw new ProviderError("invalid_response", "Identificador IMDb inválido.", "tmdb", 400);
    }
    const genres = params.get("genres")?.trim();
    if (genres && !/^\d+(,\d+)*$/.test(genres)) {
      throw new ProviderError("invalid_response", "Parâmetro genres inválido.", "tmdb", 400);
    }
    const sort = params.get("sort");
    if (sort && sort !== "popularity" && sort !== "rating") {
      throw new ProviderError("invalid_response", "Parâmetro sort inválido.", "tmdb", 400);
    }
    const window = params.get("window");
    if (window && window !== "day" && window !== "week") {
      throw new ProviderError("invalid_response", "Parâmetro window inválido.", "tmdb", 400);
    }
    const requestedLanguage = params.get("language");
    if (requestedLanguage && requestedLanguage !== "pt-BR" && requestedLanguage !== "en-US") {
      throw new ProviderError("invalid_response", "Parâmetro language inválido.", "tmdb", 400);
    }
    return NextResponse.json(await queryTmdb({
      operation, media, id, imdbId: imdbId || undefined, query,
      page: pageParam(params.get("page"), "tmdb"), genres: genres || undefined,
      yearFrom: year(params.get("yearFrom"), "yearFrom"),
      yearTo: year(params.get("yearTo"), "yearTo"),
      sort: sort as "popularity" | "rating" | undefined,
      window: window as "day" | "week" | undefined,
      language: requestedLanguage as "pt-BR" | "en-US" | undefined
    }));
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message, code: error.code, provider: error.provider }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro inesperado ao consultar a TMDB.", code: "unavailable", provider: "tmdb" }, { status: 500 });
  }
}
