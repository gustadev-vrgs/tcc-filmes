/**
 * ai.js — motor de IA do Ideal Film Finder (compartilhado pelas páginas).
 * Suporta DOIS mecanismos, escolhidos pelo usuário no modal
 * "AI Engine Settings" (botão no cabeçalho ou clique na barra de status):
 *
 *   1) WebLLM  — IA roda 100% no navegador via WebGPU (local, gratuito, privado).
 *      O usuário escolhe QUAL modelo local usar (ver WEBLLM_MODEL_CATALOG).
 *      Requisitos: Chrome/Edge 113+ ou Firefox Nightly com WebGPU habilitado.
 *
 *   2) API     — chamadas diretas, do próprio navegador, para o provedor de
 *      IA na nuvem escolhido (OpenAI, Anthropic, Google, Groq, xAI,
 *      OpenRouter ou endpoint compatível com OpenAI), com a chave do
 *      próprio usuário — salva só no localStorage deste navegador.
 *
 * A biblioteca do WebLLM só é baixada quando o motor local é realmente
 * usado. Na página inicial o modelo é pré-carregado; na página do filme
 * ele só carrega quando o usuário pede um resumo.
 *
 * O modelo local roda dentro de um SERVICE WORKER (sw.js), que continua
 * vivo quando o usuário troca de página — assim o modelo não é carregado
 * de novo a cada navegação. Se o Service Worker não estiver disponível
 * (navegador sem suporte, página fora de localhost/HTTPS ou recarregamento
 * forçado com Ctrl+Shift+R), o modelo roda na própria página, como antes.
 */
import { t, isPt, onLanguageChange } from "./i18n.js";
import { renderCustomSelect, showToast } from "./ui.js";
import { getAiApiKeyFor, setAiApiKeyFor } from "./storage.js";

// Versão fixa — precisa ser a mesma importada em sw.js
const WEBLLM_CDN = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/+esm";

/* ================================================
   SERVICE WORKER DO WEBLLM (modelo sobrevive à troca de página)
   ================================================ */
const WEBLLM_SW_URL      = "sw.js";
const SW_KEEPALIVE_MS    = 10000; // o navegador encerra Service Workers ociosos após ~30 s
let swRegistrationPromise    = null;
let swKeepAliveTimer         = null;
let llmEngineInServiceWorker = false; // o engine atual está no Service Worker?

const canUseServiceWorker = () => "serviceWorker" in navigator && window.isSecureContext;

function registerWebllmServiceWorker() {
  if (!canUseServiceWorker()) return Promise.resolve(null);
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register(WEBLLM_SW_URL, { type: "module" })
      .then(registration => {
        startServiceWorkerKeepAlive();
        return registration;
      })
      .catch(err => {
        console.warn("Service Worker do WebLLM indisponível — o modelo vai rodar na própria página:", err);
        return null;
      });
  }
  return swRegistrationPromise;
}

/* Espera a página ser controlada pelo Service Worker. Na primeira visita
   isso acontece logo após a instalação (clients.claim). Se ele já está
   ativo mas não controla esta página (ex.: Ctrl+Shift+R), não adianta
   esperar — retorna false e o modelo roda na própria página. */
async function waitForServiceWorkerControl(timeoutMs = 30000) {
  const registration = await registerWebllmServiceWorker();
  if (!registration) return false;
  if (navigator.serviceWorker.controller) return true;
  if (registration.active && !registration.installing && !registration.waiting) return false;

  return new Promise(resolve => {
    const finish = () => resolve(!!navigator.serviceWorker.controller);
    const timer  = setTimeout(finish, timeoutMs);
    navigator.serviceWorker.addEventListener("controllerchange", () => { clearTimeout(timer); finish(); }, { once: true });
  });
}

/* Mantém o Service Worker (e o modelo carregado nele) vivo enquanto o site
   está aberto — inclusive em páginas que ainda não usaram a IA, como a
   página do filme antes de pedir um resumo. Quando o engine já está
   conectado, ele mesmo envia esses sinais. */
function startServiceWorkerKeepAlive() {
  if (swKeepAliveTimer || !canUseServiceWorker()) return;
  const ping = () => {
    if (aiEngineMode !== "webllm" || (llmEngine && llmEngineInServiceWorker)) return;
    navigator.serviceWorker.controller?.postMessage({ kind: "keepAlive", uuid: crypto.randomUUID() });
  };
  ping();
  swKeepAliveTimer = setInterval(ping, SW_KEEPALIVE_MS);
}

/* ================================================
   CATÁLOGO DE MODELOS WEBLLM (execução local, no navegador)
   IDs reais do prebuiltAppConfig do @mlc-ai/web-llm — ver
   https://github.com/mlc-ai/web-llm/blob/main/src/config.ts
   ================================================ */
export const WEBLLM_MODEL_CATALOG = [
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",   name: "Llama 3.2 · 1B",  size: "~0.9 GB", tag: "fastest"  },
  { id: "Llama-3.2-3B-Instruct-q4f32_1-MLC",   name: "Llama 3.2 · 3B",  size: "~3.0 GB", tag: "default"  },
  { id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",   name: "SmolLM2 · 1.7B",  size: "~1.8 GB", tag: "small"    },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC",   name: "Phi 3.5 Mini",    size: "~3.7 GB", tag: "Microsoft" },
  { id: "Phi-4-mini-instruct-q4f16_1-MLC",     name: "Phi 4 Mini",      size: "~3.4 GB", tag: "Microsoft" },
  { id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",   name: "Llama 3.1 · 8B",  size: "~5.0 GB", tag: "quality"   },
  { id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",name: "Mistral 7B v0.3", size: "~4.6 GB", tag: "quality"   },
  { id: "Hermes-3-Llama-3.1-8B-q4f16_1-MLC",   name: "Hermes 3 · 8B",   size: "~4.9 GB", tag: "quality"   }
];
const DEFAULT_WEBLLM_MODEL = "Llama-3.2-3B-Instruct-q4f32_1-MLC";

/* ================================================
   CATÁLOGO DE PROVEDORES DE API (execução na nuvem)
   "compat" indica o formato de requisição:
   "openai"    → padrão OpenAI Chat Completions (usado por vários provedores)
   "anthropic" → formato da Anthropic Messages API
   "google"    → formato da Google Gemini generateContent API
   ================================================ */
export const API_PROVIDERS = {
  openai: {
    label: "OpenAI",
    compat: "openai",
    endpoint: "https://api.openai.com/v1/chat/completions",
    keyPlaceholder: "sk-...",
    docsUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-4o-mini", label: "GPT-4o mini" },
      { id: "gpt-4o",      label: "GPT-4o" },
      { id: "gpt-4.1-mini",label: "GPT-4.1 mini" },
      { id: "gpt-4.1",     label: "GPT-4.1" },
      { id: "o4-mini",     label: "o4-mini (reasoning)" }
    ]
  },
  anthropic: {
    label: "Anthropic (Claude)",
    compat: "anthropic",
    endpoint: "https://api.anthropic.com/v1/messages",
    keyPlaceholder: "sk-ant-...",
    docsUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
      { id: "claude-sonnet-5",           label: "Claude Sonnet 5" },
      { id: "claude-opus-4-8",           label: "Claude Opus 4.8" }
    ]
  },
  google: {
    label: "Google (Gemini)",
    compat: "google",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    keyPlaceholder: "AIza...",
    docsUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro",   label: "Gemini 2.5 Pro" },
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }
    ]
  },
  groq: {
    label: "Groq",
    compat: "openai",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
    keyPlaceholder: "gsk_...",
    docsUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B Versatile" },
      { id: "llama-3.1-8b-instant",    label: "Llama 3.1 8B Instant" },
      { id: "gemma2-9b-it",            label: "Gemma 2 9B" }
    ]
  },
  xai: {
    label: "xAI (Grok)",
    compat: "openai",
    endpoint: "https://api.x.ai/v1/chat/completions",
    keyPlaceholder: "xai-...",
    docsUrl: "https://console.x.ai",
    models: [
      { id: "grok-4",      label: "Grok 4" },
      { id: "grok-3",      label: "Grok 3" },
      { id: "grok-3-mini", label: "Grok 3 Mini" }
    ]
  },
  openrouter: {
    label: "OpenRouter",
    compat: "openai",
    endpoint: "https://openrouter.ai/api/v1/chat/completions",
    keyPlaceholder: "sk-or-...",
    docsUrl: "https://openrouter.ai/keys",
    models: [
      { id: "openai/gpt-4o-mini",                 label: "OpenAI · GPT-4o mini" },
      { id: "anthropic/claude-3.5-sonnet",        label: "Anthropic · Claude 3.5 Sonnet" },
      { id: "google/gemini-2.0-flash-001",        label: "Google · Gemini 2.0 Flash" },
      { id: "meta-llama/llama-3.3-70b-instruct",  label: "Meta · Llama 3.3 70B" }
    ]
  },
  custom: {
    label: "Custom / Other (OpenAI-compatible)",
    compat: "openai",
    endpoint: "", // definido pelo usuário em aiApiCustomEndpoint
    keyPlaceholder: "API key (if required)",
    docsUrl: "",
    models: [] // usuário sempre digita o id do modelo manualmente
  }
};

/* ================================================
   ESTADO DO MOTOR
   ================================================ */
// Modelo local selecionado — persiste a escolha do usuário entre visitas
let webllmModelId  = localStorage.getItem("aiWebllmModel") || DEFAULT_WEBLLM_MODEL;
let llmEngine      = null;  // instância do engine WebLLM
let llmLoading     = false; // true enquanto o modelo ainda está carregando
let llmUnavailable = false; // true se WebGPU não for suportado / falhou ao carregar
let llmLoadError   = "";    // mensagem do último erro de carregamento
let llmLoadPromise = null;  // carregamento em andamento (quem chama pode aguardar)
let eagerLoad      = true;  // pré-carrega o modelo local assim que a página abre?

// "webllm" ou "api" — persiste a escolha do usuário entre visitas
let aiEngineMode  = localStorage.getItem("aiEngineMode")  || "webllm";
// Provedor de API selecionado — persiste a escolha do usuário entre visitas
let apiProviderId = localStorage.getItem("aiApiProvider") || "openai";

/* --- Elementos da barra de status --- */
const statusBar   = document.getElementById("webllm-status-bar");
const statusText  = document.getElementById("webllm-status-text");
const progressBar = document.getElementById("webllm-progress-bar");

const webgpuUnsupportedText = () => isPt()
  ? "WebGPU não suportado — use Chrome/Edge 113+"
  : "WebGPU not supported — use Chrome/Edge 113+";

function setStatus(msg, progress = null, state = "loading") {
  statusText.textContent = "AI Engine: " + msg;
  statusBar.className    = ""; // limpa classes de estado
  if (state === "ready")   statusBar.classList.add("ready");
  if (state === "error")   statusBar.classList.add("error");
  if (state === "loading") statusBar.classList.add("loading");

  const pctEl = document.getElementById("webllm-progress-pct");
  if (progress !== null) {
    const pct = Math.round(progress * 100);
    progressBar.style.width = pct + "%";
    document.getElementById("webllm-progress-wrap").style.display = "block";
    if (pctEl) { pctEl.textContent = pct + "%"; pctEl.style.display = "inline"; }
  } else {
    document.getElementById("webllm-progress-wrap").style.display = "none";
    if (pctEl) pctEl.style.display = "none";
  }
}

/**
 * Carrega (ou troca) o modelo WebLLM local.
 * @param {string} modelId - id do modelo (deve existir em WEBLLM_MODEL_CATALOG / prebuiltAppConfig)
 * @param {object} opts
 * @param {boolean} opts.force - força o recarregamento mesmo se já for o modelo atual
 * @returns {Promise<void>} resolve quando o carregamento termina (com ou sem sucesso)
 */
function loadWebllmModel(modelId, opts = {}) {
  const { force = false } = opts;
  if (llmLoading) return llmLoadPromise; // já está carregando — aguarda o mesmo carregamento
  if (llmEngine && !force && webllmModelId === modelId) return Promise.resolve();

  if (!navigator.gpu) {
    llmUnavailable = true;
    llmLoadError   = "";
    setStatus(webgpuUnsupportedText(), null, "error");
    return Promise.resolve();
  }

  llmLoading     = true;
  llmUnavailable = false;
  llmLoadError   = "";
  statusBar.classList.remove("hidden-bar");

  const modelCfg  = WEBLLM_MODEL_CATALOG.find(m => m.id === modelId);
  const modelName = modelCfg ? modelCfg.name : modelId;

  llmLoadPromise = (async () => {
    try {
      const isFirstEverLoad = !localStorage.getItem("webllmEverLoaded");
      const firstLoadHint   = isFirstEverLoad
        ? (isPt()
            ? " (1ª vez pode levar alguns minutos — fica salvo no navegador depois)"
            : " (first time can take a few minutes — cached in your browser after that)")
        : "";
      setStatus((isPt() ? "Carregando " : "Loading ") + modelName + "…" + firstLoadHint, 0);

      const startedAt = performance.now();
      const webllm    = await import(WEBLLM_CDN);
      const initProgressCallback = (report) => {
        // report.progress vai de 0 a 1; report.text descreve a etapa
        const pct = report.progress ?? 0;
        setStatus(report.text || `${modelName} — ${Math.round(pct * 100)}%`, pct);
      };

      if (llmEngine && llmEngineInServiceWorker) {
        // Já conectado ao Service Worker: só troca de modelo (o mesmo modelo não recarrega)
        await llmEngine.reload(modelId);
      } else {
        // Libera o modelo anterior carregado na própria página (se houver)
        if (llmEngine) {
          try { await llmEngine.unload(); } catch (e) { console.warn("WebLLM unload warning:", e); }
          llmEngine = null;
        }

        // 1º) Engine no Service Worker — se o modelo já estiver carregado lá
        //     (veio de outra página do site), a conexão é praticamente imediata
        if (await waitForServiceWorkerControl()) {
          try {
            llmEngine = await webllm.CreateServiceWorkerMLCEngine(modelId, { initProgressCallback });
            llmEngineInServiceWorker = true;
          } catch (swErr) {
            console.warn("WebLLM no Service Worker falhou — carregando na própria página:", swErr);
            llmEngine = null;
          }
        }

        // 2º) Fallback: engine na própria página (recarrega a cada troca de página)
        if (!llmEngine) {
          llmEngine = await webllm.CreateMLCEngine(modelId, { initProgressCallback });
          llmEngineInServiceWorker = false;
        }
      }

      webllmModelId = modelId;
      localStorage.setItem("aiWebllmModel", modelId);
      localStorage.setItem("webllmEverLoaded", "1");
      llmLoading = false;
      setStatus((isPt() ? "Pronto" : "Ready") + " ✓ — " + modelName, 1, "ready");
      updateAIEngineButtonLabel();

      // Reconexão rápida (modelo já estava no Service Worker): nem mostra a barra.
      // Carregamento de verdade: mostra "Pronto" por 3 s e depois oculta.
      const reconnected = performance.now() - startedAt < 1500;
      setTimeout(() => {
        if (aiEngineMode === "webllm") statusBar.classList.add("hidden-bar");
      }, reconnected ? 0 : 3000);

    } catch (err) {
      llmEngine      = null;
      llmEngineInServiceWorker = false;
      llmUnavailable = true;
      llmLoading     = false;
      llmLoadError   = (isPt() ? "Falha ao carregar modelo — " : "Failed to load model — ") + err.message;
      console.error("WebLLM init error:", err);
      setStatus(llmLoadError, null, "error");
    }
  })();

  return llmLoadPromise;
}

/* Reflete o modo atual (API ou WebLLM) na barra de status */
export function updateStatusBarForMode() {
  const statusIcon = document.getElementById("webllm-status-icon");
  if (aiEngineMode === "api") {
    const providerCfg = API_PROVIDERS[apiProviderId] || API_PROVIDERS.openai;
    const hasKey      = !!getAiApiKeyFor(apiProviderId);
    const modelId     = getCurrentApiModelId();

    statusBar.classList.remove("hidden-bar", "loading");
    document.getElementById("webllm-progress-wrap").style.display = "none";

    if (hasKey && modelId) {
      statusBar.classList.remove("error");
      statusBar.classList.add("ready");
      if (statusIcon) statusIcon.className = "fa-solid fa-cloud";
      statusText.textContent = isPt()
        ? `IA: usando ${providerCfg.label} · ${modelId} (com sua chave de API)`
        : `AI: using ${providerCfg.label} · ${modelId} (with your API key)`;
    } else {
      statusBar.classList.remove("ready");
      statusBar.classList.add("error");
      if (statusIcon) statusIcon.className = "fa-solid fa-key";
      statusText.textContent = isPt()
        ? `IA: configure um modelo e sua chave de API para ${providerCfg.label} — clique aqui`
        : `AI: set a model and your API key for ${providerCfg.label} — click here`;
    }
    return;
  }

  if (statusIcon) statusIcon.className = "fa-solid fa-microchip";
  if (llmLoading) return; // a própria barra já mostra o progresso

  if (llmEngine) {
    const modelCfg  = WEBLLM_MODEL_CATALOG.find(m => m.id === webllmModelId);
    const modelName = modelCfg ? modelCfg.name : webllmModelId;
    setStatus((isPt() ? "Pronto" : "Ready") + " ✓ — " + modelName, 1, "ready");
    setTimeout(() => {
      if (aiEngineMode === "webllm") statusBar.classList.add("hidden-bar");
    }, 3000);
  } else if (llmUnavailable) {
    setStatus(llmLoadError || webgpuUnsupportedText(), null, "error");
  } else if (eagerLoad) {
    loadWebllmModel(webllmModelId);
  } else {
    statusBar.classList.add("hidden-bar");
  }
}

function updateAIEngineButtonLabel() {
  const btn = document.getElementById("aiEngineButton");
  if (!btn) return;
  const prefix = isPt() ? "IA" : "AI";
  let detail, icon;

  if (aiEngineMode === "api") {
    const providerCfg = API_PROVIDERS[apiProviderId] || API_PROVIDERS.openai;
    const modelId     = getCurrentApiModelId();
    detail = modelId ? `${providerCfg.label} · ${modelId}` : providerCfg.label;
    icon   = "fa-cloud";
  } else {
    const modelCfg = WEBLLM_MODEL_CATALOG.find(m => m.id === webllmModelId);
    detail = "WebLLM · " + (modelCfg ? modelCfg.name : webllmModelId);
    icon   = "fa-microchip";
  }

  btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${prefix}: ${detail} <span class="arrow">▼</span>`;
}

/* ================================================
   PERSISTÊNCIA: modelos escolhidos, por provedor (as chaves ficam em
   storage.js, compartilhadas com o modal "Adicionar APIs")
   ================================================ */
function getApiModels() {
  try { return JSON.parse(localStorage.getItem("aiApiModels")) || {}; }
  catch { return {}; }
}
function setApiModelFor(providerId, modelId) {
  const models = getApiModels();
  models[providerId] = modelId;
  localStorage.setItem("aiApiModels", JSON.stringify(models));
}
function getCurrentApiModelId() {
  const providerCfg = API_PROVIDERS[apiProviderId];
  const stored      = getApiModels()[apiProviderId];
  if (stored) return stored;
  return (providerCfg && providerCfg.models[0] && providerCfg.models[0].id) || "";
}
function getCustomEndpoint() {
  return localStorage.getItem("aiApiCustomEndpoint") || "";
}

/**
 * Envia mensagens diretamente, do navegador, para o provedor de IA na nuvem
 * escolhido pelo usuário — usando o modelo e a chave de API que ele configurou.
 */
async function callCloudProvider(messages, maxTokens = 300) {
  const providerCfg = API_PROVIDERS[apiProviderId];
  if (!providerCfg) {
    throw new Error(isPt() ? "Provedor de IA inválido." : "Invalid AI provider.");
  }

  const apiKey = getAiApiKeyFor(apiProviderId);
  if (!apiKey) {
    throw new Error(isPt()
      ? `Cole sua chave de API para ${providerCfg.label} nas configurações de IA (ou em Adicionar APIs).`
      : `Paste your API key for ${providerCfg.label} in the AI settings (or in Add APIs).`);
  }

  const modelId = getCurrentApiModelId();
  if (!modelId) {
    throw new Error(isPt()
      ? "Selecione (ou digite) um modelo nas configurações de IA."
      : "Select (or type) a model in the AI settings.");
  }

  const endpoint = apiProviderId === "custom" ? getCustomEndpoint() : providerCfg.endpoint;
  if (!endpoint) {
    throw new Error(isPt()
      ? "Informe a URL do endpoint nas configurações de IA."
      : "Enter the endpoint URL in the AI settings.");
  }

  let response;
  try {
    if (providerCfg.compat === "anthropic") {
      const systemMsg = messages.find(m => m.role === "system");
      const chatMsgs  = messages
        .filter(m => m.role !== "system")
        .map(m => ({ role: m.role, content: m.content }));

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: modelId,
          ...(systemMsg ? { system: systemMsg.content } : {}),
          messages: chatMsgs,
          max_tokens: maxTokens,
          temperature: 0.7
        })
      });

    } else if (providerCfg.compat === "google") {
      const systemMsg = messages.find(m => m.role === "system");
      const turnMsgs  = messages.filter(m => m.role !== "system");
      const url = endpoint.replace("{model}", encodeURIComponent(modelId));

      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: turnMsgs.map(m => ({
            role:  m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          })),
          ...(systemMsg ? { systemInstruction: { parts: [{ text: systemMsg.content }] } } : {}),
          generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 }
        })
      });

    } else {
      // Formato compatível com OpenAI (OpenAI, Groq, xAI, OpenRouter, endpoint customizado)
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: modelId,
          messages,
          max_tokens: maxTokens,
          temperature: 0.7
        })
      });
    }
  } catch (networkErr) {
    throw new Error(isPt()
      ? `Não foi possível contatar ${providerCfg.label}. Verifique sua conexão e a URL do endpoint.`
      : `Could not reach ${providerCfg.label}. Check your connection and the endpoint URL.`);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new Error(isPt()
      ? `Resposta inválida de ${providerCfg.label}.`
      : `Invalid response from ${providerCfg.label}.`);
  }

  if (!response.ok) {
    const apiErrMsg = data?.error?.message || data?.error || data?.message
      || (isPt() ? "Erro na API." : "API error.");
    throw new Error(`${providerCfg.label}: ${apiErrMsg}`);
  }

  let content;
  if (providerCfg.compat === "anthropic") {
    content = data?.content?.[0]?.text;
  } else if (providerCfg.compat === "google") {
    content = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).join("");
  } else {
    content = data?.choices?.[0]?.message?.content;
  }

  if (!content) {
    throw new Error(isPt()
      ? `${providerCfg.label} não retornou nenhum conteúdo.`
      : `${providerCfg.label} returned no content.`);
  }

  return content.trim();
}

/**
 * Envia mensagens ao engine WebLLM local e retorna o texto gerado.
 * Se o modelo ainda não carregou, espera o carregamento terminar.
 */
async function callWebLLM(messages, maxTokens = 300) {
  if (llmLoading) {
    await llmLoadPromise;
  } else if (!llmEngine && !llmUnavailable) {
    await loadWebllmModel(webllmModelId);
  }

  if (llmUnavailable || !llmEngine) {
    throw new Error(llmLoadError || (isPt()
      ? "WebGPU não disponível neste navegador."
      : "WebGPU not available in this browser."));
  }

  const reply = await llmEngine.chat.completions.create({
    messages,
    max_tokens:  maxTokens,
    temperature: 0.7,
    stream:      false
  });

  return reply.choices[0].message.content.trim();
}

/**
 * Roteia a chamada para o mecanismo de IA selecionado pelo usuário (API ou WebLLM).
 * @param {Array}  messages  - array de { role, content }
 * @param {number} maxTokens - máximo de tokens na resposta
 * @returns {Promise<string>}
 */
export async function callLLM(messages, maxTokens = 300) {
  if (aiEngineMode === "api") return callCloudProvider(messages, maxTokens);
  return callWebLLM(messages, maxTokens);
}

/**
 * Checagem antes de usar a IA: avisa (toast) se o motor local não pode
 * rodar neste navegador. Retorna false quando não dá pra continuar.
 */
export function assertAiUsable() {
  if (aiEngineMode !== "webllm") return true;

  if (llmUnavailable) {
    showToast(llmLoadError || (isPt()
      ? "IA local não disponível: seu navegador não suporta WebGPU. Use Chrome ou Edge 113+."
      : "Local AI unavailable: your browser does not support WebGPU. Use Chrome or Edge 113+."), "error");
    return false;
  }
  if (llmLoading || !llmEngine) {
    showToast(isPt()
      ? "O modelo de IA local ainda está carregando — seu pedido continua assim que ele estiver pronto."
      : "The local AI model is still loading — your request will continue as soon as it's ready.", "info", 4000);
  }
  return true;
}

/* ================================================
   MODAL "AI ENGINE SETTINGS" — motor, modelo local, provedor, modelo de
   API e chave fornecida pelo usuário. Nada é aplicado até o usuário
   clicar em "Save & Use"; até lá tudo fica em variáveis de rascunho
   (staging), preenchidas a partir do estado atual sempre que o modal abre.
   ================================================ */
let stagingEngine         = aiEngineMode;
let stagingWebllmModel    = webllmModelId;
let stagingApiProvider    = apiProviderId;
let stagingApiModelValue  = "";   // id do dropdown, ou "__custom__"
let stagingApiCustomModel = "";   // texto livre quando "__custom__" / provedor "custom"
let stagingApiKey         = "";
let stagingApiEndpoint    = "";

function clearAiSettingsError() {
  const box = document.getElementById("aiSettingsError");
  if (box) { box.textContent = ""; box.classList.remove("visible"); }
}
function showAiSettingsError(msg) {
  const box = document.getElementById("aiSettingsError");
  if (box) { box.textContent = msg; box.classList.add("visible"); }
}

function renderWebllmModelOptions() {
  renderCustomSelect(
    "webllmModelSelectBtn", "webllmModelOptionsList",
    WEBLLM_MODEL_CATALOG.map(m => ({ value: m.id, label: m.name, meta: `${m.size} · ${m.tag}` })),
    stagingWebllmModel,
    value => window.onWebllmModelChange(value)
  );
}

function renderApiProviderOptions() {
  renderCustomSelect(
    "apiProviderSelectBtn", "apiProviderOptionsList",
    Object.keys(API_PROVIDERS).map(id => ({ value: id, label: API_PROVIDERS[id].label })),
    stagingApiProvider,
    value => window.onApiProviderChange(value)
  );
}

function renderApiModelOptions(providerId) {
  const providerCfg = API_PROVIDERS[providerId] || API_PROVIDERS.openai;
  const items = providerCfg.models.map(m => ({ value: m.id, label: m.label }));
  items.push({ value: "__custom__", label: t().aiCustomModelOption });
  renderCustomSelect(
    "apiModelSelectBtn", "apiModelOptionsList",
    items, stagingApiModelValue,
    value => window.onApiModelChange(value)
  );
}

/* Reflete as variáveis de rascunho (staging) nos elementos do modal */
function syncModalUIFromStaging() {
  const cardWebllm = document.getElementById("engineCardWebllm");
  const cardApi    = document.getElementById("engineCardApi");
  if (cardWebllm) cardWebllm.classList.toggle("selected", stagingEngine === "webllm");
  if (cardApi)    cardApi.classList.toggle("selected", stagingEngine === "api");

  const panelWebllm = document.getElementById("panelWebllm");
  const panelApi    = document.getElementById("panelApi");
  if (panelWebllm) panelWebllm.classList.toggle("panel-visible", stagingEngine === "webllm");
  if (panelApi)    panelApi.classList.toggle("panel-visible", stagingEngine === "api");

  renderWebllmModelOptions();
  renderApiProviderOptions();
  renderApiModelOptions(stagingApiProvider);

  const customModelInput = document.getElementById("apiModelCustomInput");
  const providerCfg      = API_PROVIDERS[stagingApiProvider] || API_PROVIDERS.openai;
  const showCustomModel  = stagingApiModelValue === "__custom__" || stagingApiProvider === "custom";
  if (customModelInput) {
    customModelInput.style.display = showCustomModel ? "block" : "none";
    customModelInput.value = stagingApiCustomModel;
    customModelInput.placeholder = t().aiCustomModelPlaceholder;
  }

  const endpointWrap  = document.getElementById("apiCustomEndpointWrap");
  const endpointInput = document.getElementById("apiCustomEndpointInput");
  const showEndpoint  = stagingApiProvider === "custom";
  if (endpointWrap)  endpointWrap.style.display = showEndpoint ? "block" : "none";
  if (endpointInput) endpointInput.value = stagingApiEndpoint;

  const keyInput = document.getElementById("apiKeyInput");
  if (keyInput) {
    keyInput.value = stagingApiKey;
    keyInput.type  = "password";
    keyInput.placeholder = providerCfg.keyPlaceholder || t().apiKeysPlaceholder;
  }
  const toggleBtn = document.getElementById("toggleKeyVisibility");
  if (toggleBtn) toggleBtn.innerHTML = `<i class="fa-solid fa-eye"></i>`;
}

/* Preenche o modelo de rascunho a partir do que já está salvo para o provedor */
function loadStagingModelFor(providerId) {
  const providerCfg = API_PROVIDERS[providerId] || API_PROVIDERS.openai;
  const savedModel  = getApiModels()[providerId];
  const knownIds    = providerCfg.models.map(m => m.id);

  if (providerId === "custom") {
    stagingApiModelValue  = "__custom__";
    stagingApiCustomModel = savedModel || "";
  } else if (savedModel && knownIds.includes(savedModel)) {
    stagingApiModelValue  = savedModel;
    stagingApiCustomModel = "";
  } else if (savedModel) {
    stagingApiModelValue  = "__custom__";
    stagingApiCustomModel = savedModel;
  } else {
    stagingApiModelValue  = knownIds[0] || "__custom__";
    stagingApiCustomModel = "";
  }

  stagingApiKey      = getAiApiKeyFor(providerId);
  stagingApiEndpoint = getCustomEndpoint();
}

window.abrirConfiguracaoIA = () => {
  stagingEngine      = aiEngineMode;
  stagingWebllmModel = webllmModelId;
  stagingApiProvider = apiProviderId;
  loadStagingModelFor(apiProviderId);

  syncModalUIFromStaging();
  clearAiSettingsError();

  document.getElementById("aiSettingsModal").style.display = "flex";
};

window.fecharConfiguracaoIA = () => {
  document.getElementById("aiSettingsModal").style.display = "none";
};

window.selecionarEngineUI = engine => {
  if (engine !== "webllm" && engine !== "api") return;
  stagingEngine = engine;
  clearAiSettingsError();
  syncModalUIFromStaging();
};

window.onWebllmModelChange = value => { stagingWebllmModel = value; };

window.onApiProviderChange = providerId => {
  if (!API_PROVIDERS[providerId]) return;
  stagingApiProvider = providerId;
  loadStagingModelFor(providerId);
  clearAiSettingsError();
  syncModalUIFromStaging();
};

window.onApiModelChange = value => {
  stagingApiModelValue = value;
  clearAiSettingsError();
  syncModalUIFromStaging();
};

window.onApiModelCustomInput = value => { stagingApiCustomModel = value; };
window.onApiEndpointInput    = value => { stagingApiEndpoint    = value; };
window.onApiKeyInput         = value => { stagingApiKey         = value; };

window.toggleApiKeyVisibility = () => {
  const keyInput  = document.getElementById("apiKeyInput");
  const toggleBtn = document.getElementById("toggleKeyVisibility");
  if (!keyInput) return;
  const showing = keyInput.type === "text";
  keyInput.type = showing ? "password" : "text";
  if (toggleBtn) toggleBtn.innerHTML = showing
    ? `<i class="fa-solid fa-eye"></i>`
    : `<i class="fa-solid fa-eye-slash"></i>`;
};

window.salvarConfiguracaoIA = () => {
  clearAiSettingsError();

  if (stagingEngine === "webllm") {
    const chosenModel  = stagingWebllmModel || DEFAULT_WEBLLM_MODEL;
    const modelChanged = chosenModel !== webllmModelId || !llmEngine;

    aiEngineMode = "webllm";
    localStorage.setItem("aiEngineMode", "webllm");
    localStorage.setItem("aiWebllmModel", chosenModel);

    window.fecharConfiguracaoIA();
    updateAIEngineButtonLabel();

    if (modelChanged) {
      loadWebllmModel(chosenModel, { force: true });
    } else {
      updateStatusBarForMode();
    }

  } else {
    const providerId  = stagingApiProvider;
    const providerCfg = API_PROVIDERS[providerId];
    if (!providerCfg) { showAiSettingsError("Invalid provider."); return; }

    let modelId = stagingApiModelValue;
    if (modelId === "__custom__" || providerId === "custom") {
      modelId = (stagingApiCustomModel || "").trim();
    }
    const key      = (stagingApiKey || "").trim();
    const endpoint = providerId === "custom" ? (stagingApiEndpoint || "").trim() : "";

    if (!modelId) {
      showAiSettingsError(isPt() ? "Informe ou selecione um modelo." : "Enter or select a model.");
      return;
    }
    if (!key) {
      showAiSettingsError(isPt() ? "Cole sua chave de API." : "Paste your API key.");
      return;
    }
    if (providerId === "custom" && !endpoint) {
      showAiSettingsError(isPt() ? "Informe a URL do endpoint." : "Enter the endpoint URL.");
      return;
    }

    aiEngineMode  = "api";
    apiProviderId = providerId;
    localStorage.setItem("aiEngineMode", "api");
    localStorage.setItem("aiApiProvider", providerId);
    setApiModelFor(providerId, modelId);
    setAiApiKeyFor(providerId, key);
    if (providerId === "custom") localStorage.setItem("aiApiCustomEndpoint", endpoint);

    window.fecharConfiguracaoIA();
    updateAIEngineButtonLabel();
    updateStatusBarForMode();
  }
};

// Fecha o modal ao clicar fora do conteúdo (na área escurecida)
document.getElementById("aiSettingsModal")?.addEventListener("click", e => {
  if (e.target.id === "aiSettingsModal") window.fecharConfiguracaoIA();
});

/* ================================================
   TEXTOS (idioma)
   ================================================ */
onLanguageChange(() => {
  const texts   = t();
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const setHtml = (id, value) => { const el = document.getElementById(id); if (el) el.innerHTML = value; };

  updateAIEngineButtonLabel();
  updateStatusBarForMode();

  setText("aiSettingsTitle",       texts.aiSettingsTitle);
  setText("engineCardWebllmTitle", texts.aiEngineCardWebllmTitle);
  setText("engineDescWebllm",      texts.aiEngineCardWebllmDesc);
  setText("engineCardApiTitle",    texts.aiEngineCardApiTitle);
  setText("engineDescApi",         texts.aiEngineCardApiDesc);
  setText("lblWebllmModel",        texts.aiLabelWebllmModel);
  setText("webllmModelHint",       texts.aiWebllmModelHint);
  setText("lblApiProvider",        texts.aiLabelProvider);
  setText("lblApiModel",           texts.aiLabelModel);
  setText("lblApiEndpoint",        texts.aiLabelEndpoint);
  setText("lblApiKey",             texts.aiLabelApiKey);
  setText("apiKeyHint",            texts.aiApiKeyHint);
  setHtml("btnSaveAiSettings",     texts.aiSaveButton);

  // Se o modal estiver aberto, re-renderiza as opções (rótulo "Outro/Other…")
  if (document.getElementById("aiSettingsModal")?.style.display === "flex") {
    syncModalUIFromStaging();
  }
});

/**
 * Inicializa o motor de IA na página.
 * @param {object}  opts
 * @param {boolean} opts.eager - pré-carrega o modelo local já na abertura da página
 */
export function initAi({ eager = true } = {}) {
  eagerLoad = eager;
  updateAIEngineButtonLabel();
  // Registra o Service Worker e começa o keepAlive já na abertura da página,
  // mesmo sem usar a IA — senão o modelo carregado nele seria descartado
  if (aiEngineMode === "webllm") registerWebllmServiceWorker();
  updateStatusBarForMode();
}
