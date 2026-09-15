import assert from "node:assert/strict";
import test from "node:test";
import { AiError, parseAiInput, runAi } from "../lib/server/ai";

const env = { AI_CLOUD_ENABLED: "true", OPENAI_API_KEY: "test-key" };
const success = (value: object) => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(value) }] }] }), { status: 200, headers: { "content-type": "application/json" } });

async function rejectsCode(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => error instanceof AiError && error.code === code);
}

test("validates input and bounds conversation history", () => {
  assert.equal(parseAiInput({ operation: "chat", text: "Olá", history: [] }).language, "pt-BR");
  assert.throws(() => parseAiInput({ operation: "chat", text: "x".repeat(1_501) }), /text/);
  assert.throws(() => parseAiInput({ operation: "chat", text: "oi", history: Array.from({ length: 9 }, () => ({ role: "user", content: "oi" })) }), /Histórico/);
  assert.throws(() => parseAiInput({ operation: "unknown", text: "oi" }), /Operação/);
});

test("uses the fixed Responses endpoint, structured output and server limits", async () => {
  let request: { url?: string; init?: RequestInit } = {};
  const result = await runAi({ operation: "interpret_request", text: "terror lento", language: "pt-BR" }, { env, fetch: async (url, init) => {
    request = { url: String(url), init };
    return success({ criteria: { version: 1, mediaType: "movie", required: { genres: ["Horror"], yearFrom: null, yearTo: null }, preferences: { sort: "popularity" }, similarTo: null, requestedCount: 6, clarification: null, limitations: ["Ritmo não é verificável no catálogo."] } });
  } });
  assert.equal(result.operation, "interpret_request");
  assert.equal(request.url, "https://api.openai.com/v1/responses");
  const body = JSON.parse(String(request.init?.body));
  assert.equal(body.model, "gpt-4.1-mini");
  assert.equal(body.max_output_tokens, 400);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(request.init?.headers && (request.init.headers as Record<string, string>).authorization, "Bearer test-key");
});

test("rejects disabled service, absent key and non-allowlisted model before fetching", async () => {
  await rejectsCode(() => runAi({ operation: "chat", text: "oi" }, { env: {} }), "disabled");
  await rejectsCode(() => runAi({ operation: "chat", text: "oi" }, { env: { AI_CLOUD_ENABLED: "true" } }), "configuration");
  await rejectsCode(() => runAi({ operation: "chat", text: "oi" }, { env: { ...env, OPENAI_MODEL: "prototype-model" } }), "model_not_allowed");
});

test("maps provider 429 without retrying and preserves retry-after", async () => {
  let calls = 0;
  await assert.rejects(() => runAi({ operation: "chat", text: "oi" }, { env, fetch: async () => {
    calls += 1;
    return new Response("rate limit", { status: 429, headers: { "retry-after": "9" } });
  } }), (error: unknown) => error instanceof AiError && error.code === "rate_limited" && error.retryAfter === "9");
  assert.equal(calls, 1);
});

test("retries a provider 5xx only once", async () => {
  let calls = 0;
  const result = await runAi({ operation: "summarize", text: "Uma história." }, { env, fetch: async () => {
    calls += 1;
    return calls === 1 ? new Response("oops", { status: 503 }) : success({ summary: "Resumo." });
  } });
  assert.equal(result.operation, "summarize");
  assert.equal(calls, 2);
});

test("handles timeout, incomplete, refusal and invalid JSON", async () => {
  await rejectsCode(
    () => runAi({ operation: "chat", text: "oi" }, {
      env,
      timeoutMs: 5,
      fetch: (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      })
    }),
    "timeout"
  );
  await rejectsCode(() => runAi({ operation: "chat", text: "oi" }, { env, fetch: async () => new Response(JSON.stringify({ status: "incomplete", output: [] }), { status: 200 }) }), "incomplete");
  await rejectsCode(() => runAi({ operation: "chat", text: "oi" }, { env, fetch: async () => new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "refusal", refusal: "no" }] }] }), { status: 200 }) }), "refusal");
  await rejectsCode(() => runAi({ operation: "chat", text: "oi" }, { env, fetch: async () => new Response(JSON.stringify({ status: "completed", output: [{ content: [{ type: "output_text", text: "{" }] }] }), { status: 200 }) }), "invalid_response");
});
