import { NextResponse } from "next/server";
import { AiError } from "../../../lib/server/ai";
import { ProviderError } from "../../../lib/server/provider-error";
import { recommend } from "../../../lib/server/recommendations";

export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.text !== "string" || !body.text.trim() || body.text.length > 2_000 || (body.language !== "pt-BR" && body.language !== "en")) return NextResponse.json({ error: "Pedido ou idioma inválido.", code: "invalid_input" }, { status: 400 });
    return NextResponse.json(await recommend(body.text.trim(), body.language, {}, body.broaden === true), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AiError || error instanceof ProviderError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Não foi possível concluir a recomendação.", code: "unavailable" }, { status: 503 });
  }
}
