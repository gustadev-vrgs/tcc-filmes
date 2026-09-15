import { NextResponse } from "next/server";
import { AiError, runAi } from "../../../lib/server/ai";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 16_384) throw new AiError("invalid_input", "Corpo da requisição excede 16 KiB.", 413);
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 16_384) throw new AiError("invalid_input", "Corpo da requisição excede 16 KiB.", 413);
    let body: unknown;
    try { body = JSON.parse(rawBody); } catch { throw new AiError("invalid_input", "Corpo deve ser JSON válido.", 400); }
    return NextResponse.json(await runAi(body), { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AiError) {
      const headers: Record<string, string> = { "cache-control": "private, no-store" };
      if (error.retryAfter) headers["retry-after"] = error.retryAfter;
      return NextResponse.json({ error: error.message, code: error.code, provider: "openai" }, { status: error.status, headers });
    }
    return NextResponse.json({ error: "Erro inesperado no serviço de IA.", code: "unavailable", provider: "openai" }, { status: 500, headers: { "cache-control": "private, no-store" } });
  }
}
