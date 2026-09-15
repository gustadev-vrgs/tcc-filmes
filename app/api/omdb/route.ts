import { NextResponse } from "next/server";
import { getOmdbDetails, searchOmdb } from "../../../lib/server/omdb";
import { imdbIdParam, pageParam, textParam, type MediaType } from "../../../lib/server/params";
import { ProviderError } from "../../../lib/server/provider-error";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type");
  try {
    if (type === "search") {
      const media = searchParams.get("media");
      if (media !== null && media !== "movie" && media !== "series") {
        throw new ProviderError("invalid_response", "Parâmetro media deve ser movie ou series.", "omdb", 400);
      }
      return NextResponse.json(await searchOmdb({
        query: textParam(searchParams.get("q"), "q"),
        page: pageParam(searchParams.get("page")),
        mediaType: media as MediaType | undefined
      }));
    }
    if (type === "details") {
      return NextResponse.json(await getOmdbDetails(imdbIdParam(searchParams.get("id"))));
    }
    throw new ProviderError("invalid_response", "Operação inválida. Use search ou details.", "omdb", 400);
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message, code: error.code, provider: error.provider }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro inesperado ao consultar a OMDb.", code: "unavailable", provider: "omdb" }, { status: 500 });
  }
}
