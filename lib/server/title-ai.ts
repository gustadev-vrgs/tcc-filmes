import { getOmdbDetails } from "./omdb";
import { AiError, type AiMessage, runAi } from "./ai";

export const TITLE_AI_PROMPT_VERSION = "title-context-v1";
export const TITLE_AI_ENGINE = "openai";
export const TITLE_AI_MODEL = "gpt-4.1-mini";

type TitleAiInput = {
  action: "summary" | "chat";
  imdbId: string;
  language?: "pt-BR" | "en";
  question?: string;
  history?: AiMessage[];
  engine?: string;
};

function parse(value: unknown): TitleAiInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiError("invalid_input", "Corpo JSON inválido.", 400);
  const body = value as Record<string, unknown>;
  if (body.action !== "summary" && body.action !== "chat") throw new AiError("invalid_input", "Ação inválida.", 400);
  if (typeof body.imdbId !== "string" || !/^tt\d{5,12}$/.test(body.imdbId)) throw new AiError("invalid_input", "Identificador IMDb inválido.", 400);
  if (body.engine !== undefined && body.engine !== TITLE_AI_ENGINE) throw new AiError("model_not_allowed", "Mecanismo não permitido.", 400);
  if (body.language !== undefined && body.language !== "pt-BR" && body.language !== "en") throw new AiError("invalid_input", "Idioma inválido.", 400);
  if (body.action === "chat" && (typeof body.question !== "string" || !body.question.trim())) throw new AiError("invalid_input", "Pergunta obrigatória.", 400);
  return { action: body.action, imdbId: body.imdbId, language: body.language as TitleAiInput["language"], question: body.question as string | undefined, history: body.history as AiMessage[] | undefined, engine: body.engine as string | undefined };
}

function titleContext(details: Awaited<ReturnType<typeof getOmdbDetails>>) {
  return [
    `Título: ${details.title}`,
    `Ano: ${details.year ?? "indisponível"}`,
    `Tipo: ${details.mediaType}`,
    `Sinopse: ${details.plot ?? "indisponível"}`,
    `Gêneros: ${details.genre ?? "indisponível"}`,
    `Direção/criação: ${details.director ?? details.writer ?? "indisponível"}`,
    `Elenco: ${details.actors ?? "indisponível"}`,
    `Duração: ${details.runtime ?? "indisponível"}`,
    `Nota IMDb: ${details.imdbRating ?? "indisponível"}`
  ].join("\n");
}

export async function runTitleAi(raw: unknown, deps: { details?: typeof getOmdbDetails; ai?: typeof runAi } = {}) {
  const input = parse(raw);
  const details = await (deps.details ?? getOmdbDetails)(input.imdbId);
  const context = titleContext(details);
  if (!details.plot && input.action === "summary") {
    throw new AiError("invalid_input", input.language === "en" ? "There is not enough plot information to create a reliable summary." : "Não há sinopse suficiente para criar um resumo confiável.", 422);
  }
  const ai = deps.ai ?? runAi;
  const result = await ai(input.action === "summary" ? {
    operation: "summarize",
    text: "Crie um resumo curto, sem spoilers importantes. Se os dados não sustentarem uma afirmação, omita-a.",
    language: input.language,
    context
  } : {
    operation: "chat",
    text: input.question!,
    language: input.language,
    context,
    history: input.history
  });
  return {
    ...result,
    title: { imdbId: input.imdbId, name: details.title },
    engine: TITLE_AI_ENGINE,
    model: TITLE_AI_MODEL,
    promptVersion: TITLE_AI_PROMPT_VERSION,
    generatedByAi: true
  };
}
