import assert from "node:assert/strict";
import test from "node:test";
import { AiError, type AiInput, type AiResult } from "../lib/server/ai";
import { runTitleAi, TITLE_AI_PROMPT_VERSION } from "../lib/server/title-ai";

const details = (plot: string | null) => async () => ({ id: "imdb:tt1234567", ids: { imdb: "tt1234567", tmdb: null }, mediaType: "movie" as const, title: "Safe title", year: "2020", poster: null, plot, source: "omdb" as const, partial: false, runtime: "90 min", genre: "Drama", director: "Director", writer: null, actors: "Actor", imdbRating: "7.0" });

test("builds trusted title context on the server and returns generation identity", async () => {
  let sent: unknown;
  const result = await runTitleAi({ action: "summary", imdbId: "tt1234567", language: "en", engine: "openai", context: "FAKE" }, {
    details: details("A real plot. <script>alert(1)</script>"),
    ai: async (input: unknown) => { sent = input; return { operation: "summarize", summary: "A short summary." } as AiResult; }
  });
  const aiInput = sent as AiInput;
  assert.match(aiInput.context ?? "", /A real plot/);
  assert.doesNotMatch(aiInput.context ?? "", /FAKE/);
  assert.equal(result.generatedByAi, true);
  assert.equal(result.promptVersion, TITLE_AI_PROMPT_VERSION);
});

test("does not invent a summary without a synopsis", async () => {
  await assert.rejects(() => runTitleAi({ action: "summary", imdbId: "tt1234567" }, { details: details(null) }), (error: unknown) => error instanceof AiError && error.status === 422);
});

test("validates title, engine, question and delegates bounded chat validation", async () => {
  await assert.rejects(() => runTitleAi({ action: "chat", imdbId: "bad", question: "hi" }), /IMDb/);
  await assert.rejects(() => runTitleAi({ action: "chat", imdbId: "tt1234567", question: "hi", engine: "paid-auto" }), /Mecanismo/);
  await assert.rejects(() => runTitleAi({ action: "chat", imdbId: "tt1234567" }), /Pergunta/);
  await assert.rejects(() => runTitleAi({ action: "chat", imdbId: "tt1234567", question: "hi", history: Array.from({ length: 9 }, () => ({ role: "user", content: "x" })) }, { details: details("plot"), ai: async (input) => { throw (() => { const parsed = input as AiInput; return new AiError("invalid_input", parsed.history!.length > 8 ? "Histórico excede o limite." : "unexpected", 400); })(); } }), /Histórico/);
});
