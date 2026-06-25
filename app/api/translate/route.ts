import { NextResponse } from "next/server";

type TranslateRequest = {
  text?: string;
  targetLanguage?: string;
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return jsonError("A chave da OpenAI não está configurada no servidor.", 500);
  }

  let payload: TranslateRequest;

  try {
    payload = (await request.json()) as TranslateRequest;
  } catch {
    return jsonError("Envie um JSON válido para tradução.", 400);
  }

  const text = payload.text?.trim();
  const targetLanguage = payload.targetLanguage;

  if (!text) {
    return jsonError("Informe o texto que deve ser traduzido.", 400);
  }

  if (targetLanguage !== "pt-BR") {
    return NextResponse.json({ translatedText: text });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TRANSLATION_MODEL ?? "gpt-4.1-mini",
        input: [
          {
            role: "system",
            content:
              "Traduza sinopses de filmes e séries para português do Brasil. Preserve títulos, nomes de pessoas, anos, notas e durações. Responda somente com a tradução."
          },
          {
            role: "user",
            content: text
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      return jsonError("Não foi possível traduzir o texto agora.", response.status);
    }

    const data = (await response.json()) as { output_text?: string };
    const translatedText = data.output_text?.trim() || text;

    return NextResponse.json({ translatedText });
  } catch (error) {
    console.error("Erro ao traduzir sinopse:", error);
    return jsonError("Erro inesperado ao traduzir o texto.", 500);
  }
}
