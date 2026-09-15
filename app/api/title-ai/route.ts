import { NextResponse } from "next/server";
import { AiError } from "../../../lib/server/ai";
import { ProviderError } from "../../../lib/server/provider-error";
import { runTitleAi } from "../../../lib/server/title-ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16_384) throw new AiError("invalid_input", "Corpo da requisição excede 16 KiB.", 413);
    let body: unknown;
    try { body = JSON.parse(raw); } catch { throw new AiError("invalid_input", "Corpo deve ser JSON válido.", 400); }
    return NextResponse.json(await runTitleAi(body), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AiError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "cache-control": "private, no-store" } });
    if (error instanceof ProviderError) return NextResponse.json({ error: error.message, code: error.code, provider: error.provider }, { status: error.status, headers: { "cache-control": "private, no-store" } });
    return NextResponse.json({ error: "Serviço indisponível.", code: "unavailable" }, { status: 500, headers: { "cache-control": "private, no-store" } });
  }
}
