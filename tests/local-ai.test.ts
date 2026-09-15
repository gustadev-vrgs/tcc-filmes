import assert from "node:assert/strict";
import test from "node:test";
import { LocalAiManager, LOCAL_MODELS } from "../lib/client/local-ai";

function browser(gpu = true, secure = true) {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: secure } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: gpu ? { gpu: {} } : {} });
}

function mockedEngine(content = '{"summary":"Resumo fiel."}') {
  let unloads = 0; type Completion = { choices: Array<{ message: { content: string | null } }> };
  let resolve: ((value: Completion) => void) | null = null;
  const engine = { chat: { completions: { create: () => new Promise<Completion>((done) => { resolve = done; }) } }, unload: async () => { unloads += 1; }, interruptGenerate: () => undefined };
  return { engine, complete: () => resolve?.({ choices: [{ message: { content } }] }), unloads: () => unloads };
}

test("seleção explícita evita carga duplicada e troca libera o mecanismo", async () => {
  browser(); const mock = mockedEngine(); let creates = 0;
  const manager = new LocalAiManager(() => undefined, async () => ({ CreateMLCEngine: async () => { creates += 1; return mock.engine; } }));
  await Promise.all([manager.load(LOCAL_MODELS[0].id), manager.load(LOCAL_MODELS[0].id)]);
  assert.equal(creates, 1);
  await manager.load(LOCAL_MODELS[1].id);
  assert.equal(creates, 2); assert.equal(mock.unloads(), 1);
});

test("incompatibilidade e download interrompido mantêm erro local sem fallback", async () => {
  browser(false); const states: string[] = [];
  const manager = new LocalAiManager((status) => states.push(status.phase), async () => { throw new Error("rede interrompida"); });
  await assert.rejects(manager.load(LOCAL_MODELS[0].id), /WebGPU/);
  browser(); await assert.rejects(manager.load(LOCAL_MODELS[0].id), /rede interrompida/);
  assert.equal(states.at(-1), "error");
});

test("uma geração local por vez e saída usa o mesmo contrato", async () => {
  browser(); const mock = mockedEngine();
  const manager = new LocalAiManager(() => undefined, async () => ({ CreateMLCEngine: async () => mock.engine }));
  await manager.load(LOCAL_MODELS[0].id);
  const details = { id: "tt1234567", ids: { imdb: "tt1234567", tmdb: null }, source: "omdb" as const, title: "Filme", year: "2020", mediaType: "movie" as const, poster: null, plot: "Uma história.", genre: null, director: null, writer: null, actors: null, runtime: null, imdbRating: null, partial: false };
  const first = manager.title("summary", details, "pt-BR");
  await assert.rejects(manager.title("summary", details, "pt-BR"), /operação local/);
  mock.complete(); assert.equal((await first).text, "Resumo fiel.");
});
