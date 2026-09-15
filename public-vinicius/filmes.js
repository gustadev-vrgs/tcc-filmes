/**
 * filmes.js — Ideal Film Finder
 * Suporta DOIS mecanismos de IA, escolhidos pelo usuário através do modal
 * "AI Engine Settings" (botão no cabeçalho ou clique na barra de status):
 *
 *   1) WebLLM  — IA roda 100% no navegador via WebGPU (local, gratuito, privado).
 *      O usuário escolhe QUAL modelo local usar (Llama, Phi, Mistral, etc.),
 *      dentre um catálogo pré-definido (ver WEBLLM_MODEL_CATALOG abaixo).
 *      Requisitos: Chrome/Edge 113+ ou Firefox Nightly com WebGPU habilitado.
 *
 *   2) API     — chamadas diretas, do próprio navegador, para o provedor de
 *      IA na nuvem escolhido pelo usuário (OpenAI, Anthropic, Google, Groq,
 *      xAI, OpenRouter ou um endpoint customizado compatível com a API da
 *      OpenAI). O usuário escolhe o PROVEDOR, o MODELO daquele provedor
 *      (ou digita um id de modelo customizado) e cola sua PRÓPRIA chave de
 *      API. A chave fica salva somente no localStorage deste navegador e é
 *      enviada diretamente ao provedor — nunca passa pelo nosso servidor.
 *
 * Toda a escolha (motor, modelo local, provedor, modelo de API e chaves)
 * fica salva em localStorage e é usada tanto para o resumo de filmes quanto
 * para as recomendações por descrição.
 *
 * NA PÁGINA DE DETALHES DO FILME/SÉRIE, além do resumo por IA, também há:
 *
 *   • NOTAS (IMDb, Rotten Tomatoes, Metacritic) — já incluídas de graça na
 *     resposta do próprio omdb.php (campos imdbRating e Ratings), sem
 *     nenhuma API extra.
 *
 *   • TRAILER — busca primeiro os vídeos oficiais do TMDB (mesma chave já
 *     usada em "onde assistir"/"elenco" — se aquelas seções já funcionam,
 *     o trailer passa a funcionar sozinho, sem configuração extra). Só se
 *     o TMDB não tiver nenhum trailer para o título, usa como reforço a
 *     YouTube Data API v3 via o proxy youtube.php (opcional, arquivo
 *     incluído — precisa de chave própria do Google Cloud Console, ver
 *     instruções no topo de youtube.php). Se nada for encontrado, mostra
 *     um link para pesquisar manualmente, junto com o motivo real da
 *     falha (visível no botão e no console do navegador).
 *
 *   • ONDE ASSISTIR + ELENCO (com fotos) — usa a API gratuita do TMDB
 *     (The Movie Database), via o proxy tmdb.php (arquivo incluído).
 *     "Onde assistir" agrega dados de streaming do JustWatch; "Elenco"
 *     usa os créditos do TMDB. Para funcionar, configure uma chave TMDB
 *     gratuita em tmdb.php — veja as instruções no topo daquele arquivo.
 *     Sem a chave, "Onde assistir" some e "Elenco" cai de volta para a
 *     lista simples de nomes do omdb.php (sem fotos).
 *
 *   • ABAS — Sinopse / Elenco / Detalhes (ficha técnica: direção, roteiro,
 *     duração, classificação, idioma, país, prêmios, bilheteria etc.),
 *     tudo já vindo do omdb.php, sem nenhuma API extra.
 */

import * as webllm from "https://esm.run/@mlc-ai/web-llm";

/* ================================================
   CATÁLOGO DE MODELOS WEBLLM (execução local, no navegador)
   IDs reais do prebuiltAppConfig do @mlc-ai/web-llm — ver
   https://github.com/mlc-ai/web-llm/blob/main/src/config.ts
   ================================================ */
const WEBLLM_MODEL_CATALOG = [
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

// Modelo local selecionado — persiste a escolha do usuário entre visitas
let webllmModelId = localStorage.getItem("aiWebllmModel") || DEFAULT_WEBLLM_MODEL;

// Instância global do engine
let llmEngine = null;
// true enquanto o modelo ainda está carregando
let llmLoading = false;
// true se WebGPU não for suportado / falhou ao carregar
let llmUnavailable = false;

/* ================================================
   GÊNEROS DA TMDB (lista fixa e estável — não muda, não precisa de
   chamada extra à API). Usada para "aterrar" a IA: em vez de deixar o
   modelo inventar filmes de memória, ele escolhe gêneros dessa lista e
   a busca real acontece no catálogo da TMDB (RAG-lite).
   ================================================ */
const TMDB_GENRES_MOVIE = {
  "Action": 28, "Adventure": 12, "Animation": 16, "Comedy": 35, "Crime": 80,
  "Documentary": 99, "Drama": 18, "Family": 10751, "Fantasy": 14, "History": 36,
  "Horror": 27, "Music": 10402, "Mystery": 9648, "Romance": 10749,
  "Science Fiction": 878, "TV Movie": 10770, "Thriller": 53, "War": 10752, "Western": 37
};
const TMDB_GENRES_TV = {
  "Action & Adventure": 10759, "Animation": 16, "Comedy": 35, "Crime": 80,
  "Documentary": 99, "Drama": 18, "Family": 10751, "Kids": 10762, "Mystery": 9648,
  "News": 10763, "Reality": 10764, "Sci-Fi & Fantasy": 10765, "Soap": 10766,
  "Talk": 10767, "War & Politics": 10768, "Western": 37
};

/* ================================================
   CATÁLOGO DE PROVEDORES DE API (execução na nuvem)
   Cada provedor define endpoint, modelos sugeridos e como montar a
   requisição/ler a resposta. "compat" indica o formato de requisição:
   "openai"    → padrão OpenAI Chat Completions (usado por vários provedores)
   "anthropic" → formato da Anthropic Messages API
   "google"    → formato da Google Gemini generateContent API
   ================================================ */
const API_PROVIDERS = {
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
   TRADUÇÕES
   ================================================ */
const translations = {
  en: {
    headerTitle:              "Ideal Film Finder",
    modeButtonDark:           "Mode: Dark",
    modeButtonLight:          "Mode: Light",
    modeOptionDark:           "<i class='fa-solid fa-moon'></i> Dark — deep, low-light canvas",
    modeOptionLight:          "<i class='fa-solid fa-sun'></i> Light — bright, airy canvas",
    styleButtonDefault:       "Style: Default",
    styleButtonVintage:       "Style: Vintage",
    styleButtonNeon:          "Style: Neon",
    styleButtonRainbow:       "Style: Rainbow",
    styleButtonMono:          "Style: Monochrome",
    styleOptionDefault:       "<i class='fa-solid fa-circle'></i> Default — clean modern palette",
    styleOptionVintage:       "<i class='fa-solid fa-clapperboard'></i> Vintage — aged film reel, sepia and grain",
    styleOptionNeon:          "<i class='fa-solid fa-bolt'></i> Neon — electric glow, high-contrast accents",
    styleOptionRainbow:       "<i class='fa-solid fa-rainbow'></i> Rainbow — full-spectrum highlights",
    styleOptionMono:          "<i class='fa-solid fa-circle-half-stroke'></i> Monochrome — grayscale only",
    favorites:                "Favorites",
    introText:                "Here you can <strong>search movies</strong> manually or get <strong>recommendations</strong> based on a quick description.",
    helpTooltip:              `<p><strong>How does it work?</strong></p><p>1. Use the search field to look for movies by title.<br>2. Use the recommendation field to get suggestions based on a description.<br>3. Click the help icon for more information.</p>`,
    searchExplanation:        "Enter the movie name you wish to search for. Provide the full name or part of it to find your desired movie.",
    searchPlaceholder:        "Enter the movie name",
    searchButton:             "<i class='fa-solid fa-search'></i> Search",
    settingsButtonTitle:      "Display settings (layout, mode, style)",
    recCountButton:           "AI results",
    recCountQuick:            "quick picks",
    recCountDefault:          "default",
    recCountMore:             "more options",
    weeklyHighlights:         "Weekly Highlights",
    recommendationExplanation:"Describe what you want to watch. Write a brief description or genre to get movie suggestions.",
    searchColTitleHeading:    "Search by Title",
    searchColAiHeading:       "Ask the AI",
    recommendationPlaceholder:"Describe what you want to watch",
    recommendationButton:     "<i class='fa-solid fa-magic'></i> Recommend Movies",
    generateSummary:          "<i class='fa-solid fa-file-lines'></i> Generate Summary",
    summaryGenerated:         "<i class='fa-solid fa-file-lines'></i> Summary Generated",
    addToFavorites:           "<i class='fa-solid fa-heart'></i> Add to Favorites",
    removeFromFavorites:      "<i class='fa-solid fa-heart'></i> Remove from Favorites",
    watchTrailer:             "Watch Trailer",
    whereToWatch:             "Where to watch",
    loadingWhereToWatch:      "Looking up where to watch…",
    noWhereToWatch:           "Not available in this region.",
    watchProvidersAttribution:"Streaming data by JustWatch, via TMDB.",
    loadingTrailer:           "Looking up the trailer…",
    trailerNotFound:          "Couldn't find a trailer automatically.",
    searchOnYoutube:          "Search on YouTube",
    tabSinopse:               "Synopsis",
    tabElenco:                "Cast",
    tabDetalhes:              "Details",
    castEmpty:                "Cast information not available.",
    fichaDirector:            "Director",
    fichaWriter:              "Writer",
    fichaRuntime:             "Runtime",
    fichaSeasons:             "Seasons",
    fichaRated:               "Rated",
    fichaReleased:            "Released",
    fichaLanguage:            "Language",
    fichaCountry:             "Country",
    fichaAwards:              "Awards",
    fichaBoxOffice:           "Box Office",
    fichaProduction:          "Production",
    fichaEmpty:               "No further details available.",
    loadingSummary:           "Loading summary…",
    backToSearch:             "<i class='fa-solid fa-arrow-left'></i> Back to Search",
    backToHome:               "<i class='fa-solid fa-house'></i> Back to Home",
    viewDetails:              "<i class='fa-solid fa-eye'></i> View Details",
    remove:                   "<i class='fa-solid fa-trash'></i> Remove",
    noFavorites:              "You haven't added any movie to favorites yet.",
    searchSimilar:            "<i class='fa-solid fa-magnifying-glass-plus'></i> Search Similar",
    errorMessage:             "Oops! No movie found.",
    aiSettingsTitle:          "AI Engine Settings",
    aiEngineCardWebllmTitle:  "WebLLM (Local)",
    aiEngineCardWebllmDesc:   "Runs fully in your browser via WebGPU. Free, private, no API key needed.",
    aiEngineCardApiTitle:     "Cloud API",
    aiEngineCardApiDesc:      "Use a cloud provider's model with your own API key. Faster, no download.",
    aiLabelWebllmModel:       "Local model",
    aiWebllmModelHint:        "Bigger models are smarter but take longer to download and use more browser memory.",
    aiLabelProvider:          "Provider",
    aiLabelModel:             "Model",
    aiLabelEndpoint:          "Endpoint URL (OpenAI-compatible)",
    aiLabelApiKey:            "API Key",
    aiApiKeyHint:             "Stored only in this browser (localStorage) and sent directly to the provider — it never passes through our server.",
    aiCustomModelPlaceholder: "model-id (e.g. gpt-4o-mini)",
    aiCustomModelOption:      "Other / custom model id…",
    aiSaveButton:             "<i class='fa-solid fa-check'></i> Save & Use",
    layoutDuoShort:           "Layout: Double Feature",
    layoutPremiereShort:      "Layout: Premiere",
    layoutSidebarShort:       "Layout: Side Session",
    layoutRowShort:           "Layout: Poster Row",
    layoutOptionDuo:          "<i class='fa-solid fa-clapperboard'></i> Double Feature — side-by-side search",
    layoutOptionPremiere:     "<i class='fa-solid fa-table-cells'></i> Premiere — classic centered layout",
    layoutOptionSidebar:      "<i class='fa-solid fa-table-columns'></i> Side Session — sticky sidebar search",
    layoutOptionRow:          "<i class='fa-solid fa-film'></i> Poster Row — horizontal scrolling reel"
  },
  pt: {
    headerTitle:              "Ideal Film Finder",
    modeButtonDark:           "Modo: Escuro",
    modeButtonLight:          "Modo: Claro",
    modeOptionDark:           "<i class='fa-solid fa-moon'></i> Escuro — fundo escuro e imersivo",
    modeOptionLight:          "<i class='fa-solid fa-sun'></i> Claro — fundo claro e leve",
    styleButtonDefault:       "Estilo: Padrão",
    styleButtonVintage:       "Estilo: Vintage",
    styleButtonNeon:          "Estilo: Neon",
    styleButtonRainbow:       "Estilo: Arco-íris",
    styleButtonMono:          "Estilo: Monocromático",
    styleOptionDefault:       "<i class='fa-solid fa-circle'></i> Padrão — paleta moderna e limpa",
    styleOptionVintage:       "<i class='fa-solid fa-clapperboard'></i> Vintage — rolo de filme envelhecido, sépia e grão",
    styleOptionNeon:          "<i class='fa-solid fa-bolt'></i> Neon — brilho elétrico, contraste alto",
    styleOptionRainbow:       "<i class='fa-solid fa-rainbow'></i> Arco-íris — destaques em espectro completo",
    styleOptionMono:          "<i class='fa-solid fa-circle-half-stroke'></i> Monocromático — somente tons de cinza",
    favorites:                "Favoritos",
    introText:                "Aqui você pode <strong>pesquisar filmes</strong> manualmente ou obter <strong>recomendações</strong> a partir de uma descrição rápida.",
    helpTooltip:              `<p><strong>Como funciona?</strong></p><p>1. Utilize o campo de pesquisa para buscar filmes pelo título.<br>2. Utilize o campo de recomendação para receber sugestões a partir de uma descrição.<br>3. Clique no ícone de ajuda para mais informações.</p>`,
    searchExplanation:        "Digite o nome do filme que deseja pesquisar. Informe o nome completo ou parte dele para localizar o filme desejado. O título do filme deve ser em inglês",
    searchPlaceholder:        "Digite o nome do filme",
    searchButton:             "<i class='fa-solid fa-search'></i> Pesquisar",
    settingsButtonTitle:      "Configurações de exibição (layout, modo, estilo)",
    recCountButton:           "Resultados da IA",
    recCountQuick:            "escolhas rápidas",
    recCountDefault:          "padrão",
    recCountMore:             "mais opções",
    weeklyHighlights:         "Destaques da Semana",
    recommendationExplanation:"Descreva o que deseja assistir. Escreva uma breve descrição ou gênero para receber sugestões de filmes.",
    searchColTitleHeading:    "Buscar por Título",
    searchColAiHeading:       "Pergunte à IA",
    recommendationPlaceholder:"Descreva o que deseja assistir",
    recommendationButton:     "<i class='fa-solid fa-magic'></i> Recomendar Filmes",
    generateSummary:          "<i class='fa-solid fa-file-lines'></i> Gerar Resumo",
    summaryGenerated:         "<i class='fa-solid fa-file-lines'></i> Resumo já gerado",
    addToFavorites:           "<i class='fa-solid fa-heart'></i> Adicionar aos Favoritos",
    removeFromFavorites:      "<i class='fa-solid fa-heart'></i> Remover dos Favoritos",
    watchTrailer:             "Ver Trailer",
    whereToWatch:             "Onde assistir",
    loadingWhereToWatch:      "Procurando onde assistir…",
    noWhereToWatch:           "Não disponível nesta região.",
    watchProvidersAttribution:"Dados de streaming por JustWatch, via TMDB.",
    loadingTrailer:           "Procurando o trailer…",
    trailerNotFound:          "Não foi possível encontrar um trailer automaticamente.",
    searchOnYoutube:          "Pesquisar no YouTube",
    tabSinopse:               "Sinopse",
    tabElenco:                "Elenco",
    tabDetalhes:              "Detalhes",
    castEmpty:                "Informação de elenco não disponível.",
    fichaDirector:            "Direção",
    fichaWriter:              "Roteiro",
    fichaRuntime:             "Duração",
    fichaSeasons:             "Temporadas",
    fichaRated:               "Classificação",
    fichaReleased:            "Lançamento",
    fichaLanguage:            "Idioma",
    fichaCountry:             "País",
    fichaAwards:              "Prêmios",
    fichaBoxOffice:           "Bilheteria",
    fichaProduction:          "Produtora",
    fichaEmpty:               "Nenhum detalhe adicional disponível.",
    loadingSummary:           "Carregando resumo…",
    backToSearch:             "<i class='fa-solid fa-arrow-left'></i> Voltar à Pesquisa",
    backToHome:               "<i class='fa-solid fa-house'></i> Voltar à Página Inicial",
    viewDetails:              "<i class='fa-solid fa-eye'></i> Ver Detalhes",
    remove:                   "<i class='fa-solid fa-trash'></i> Remover",
    noFavorites:              "Você ainda não adicionou nenhum filme aos favoritos.",
    searchSimilar:            "<i class='fa-solid fa-magnifying-glass-plus'></i> Pesquisar Similares",
    errorMessage:             "Ops! Nenhum filme encontrado.",
    aiSettingsTitle:          "Configurações do Motor de IA",
    aiEngineCardWebllmTitle:  "WebLLM (Local)",
    aiEngineCardWebllmDesc:   "Roda totalmente no seu navegador via WebGPU. Grátis, privado, sem precisar de chave de API.",
    aiEngineCardApiTitle:     "API na Nuvem",
    aiEngineCardApiDesc:      "Use o modelo de um provedor na nuvem com sua própria chave de API. Mais rápido, sem download.",
    aiLabelWebllmModel:       "Modelo local",
    aiWebllmModelHint:        "Modelos maiores são mais inteligentes, mas demoram mais para baixar e usam mais memória do navegador.",
    aiLabelProvider:          "Provedor",
    aiLabelModel:             "Modelo",
    aiLabelEndpoint:          "URL do Endpoint (compatível com OpenAI)",
    aiLabelApiKey:            "Chave de API",
    aiApiKeyHint:             "Fica salva apenas neste navegador (localStorage) e é enviada direto ao provedor — nunca passa pelo nosso servidor.",
    aiCustomModelPlaceholder: "id do modelo (ex.: gpt-4o-mini)",
    aiCustomModelOption:      "Outro / id de modelo personalizado…",
    aiSaveButton:             "<i class='fa-solid fa-check'></i> Salvar e Usar",
    layoutDuoShort:           "Layout: Sessão Dupla",
    layoutPremiereShort:      "Layout: Estreia",
    layoutSidebarShort:       "Layout: Sessão Lateral",
    layoutRowShort:           "Layout: Fileira de Cartazes",
    layoutOptionDuo:          "<i class='fa-solid fa-clapperboard'></i> Sessão Dupla — as duas buscas lado a lado",
    layoutOptionPremiere:     "<i class='fa-solid fa-table-cells'></i> Estreia — layout clássico centralizado",
    layoutOptionSidebar:      "<i class='fa-solid fa-table-columns'></i> Sessão Lateral — busca fixa na lateral",
    layoutOptionRow:          "<i class='fa-solid fa-film'></i> Fileira de Cartazes — rolo horizontal de pôsteres"
  }
};

let currentLanguage = "en";

/* ================================================
   SELEÇÃO DO MECANISMO DE IA (API x WebLLM)
   ================================================ */
// "webllm" ou "api" — persiste a escolha do usuário entre visitas
let aiEngineMode  = localStorage.getItem("aiEngineMode")  || "webllm";
// Provedor de API selecionado — persiste a escolha do usuário entre visitas
let apiProviderId = localStorage.getItem("aiApiProvider") || "openai";

/* ================================================
   SELEÇÃO DE LAYOUT (organização visual da página)
   ================================================ */
// "premiere" | "sidebar" | "row" — persiste a escolha do usuário entre visitas
let siteLayout = localStorage.getItem("siteLayout") || "duo";
document.documentElement.setAttribute("data-layout", siteLayout);

// Quantidade de filmes que a IA devolve por recomendação — persiste entre visitas
let recommendationCount = parseInt(localStorage.getItem("recommendationCount"), 10);
if (![4, 6, 8, 10, 12].includes(recommendationCount)) recommendationCount = 8;

/* --- Elementos da barra de status --- */
const statusBar      = document.getElementById("webllm-status-bar");
const statusText     = document.getElementById("webllm-status-text");
const progressBar    = document.getElementById("webllm-progress-bar");

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
 */
async function loadWebllmModel(modelId, opts = {}) {
  const { force = false } = opts;
  if (llmLoading) return; // já está carregando algo, evita chamadas concorrentes
  if (llmEngine && !force && webllmModelId === modelId) return; // já é este modelo

  if (!navigator.gpu) {
    llmUnavailable = true;
    setStatus(currentLanguage === "pt"
      ? "WebGPU não suportado — use Chrome/Edge 113+"
      : "WebGPU not supported — use Chrome/Edge 113+", null, "error");
    return;
  }

  llmLoading     = true;
  llmUnavailable = false;
  statusBar.classList.remove("hidden-bar");

  const modelCfg  = WEBLLM_MODEL_CATALOG.find(m => m.id === modelId);
  const modelName = modelCfg ? modelCfg.name : modelId;

  try {
    const isFirstEverLoad = !localStorage.getItem("webllmEverLoaded");
    const firstLoadHint   = isFirstEverLoad
      ? (currentLanguage === "pt"
          ? " (1ª vez pode levar alguns minutos — fica salvo no navegador depois)"
          : " (first time can take a few minutes — cached in your browser after that)")
      : "";
    setStatus((currentLanguage === "pt" ? "Carregando " : "Loading ") + modelName + "…" + firstLoadHint, 0);

    // Libera o modelo anterior (se houver) antes de carregar o novo
    if (llmEngine) {
      try { await llmEngine.unload(); } catch (e) { console.warn("WebLLM unload warning:", e); }
      llmEngine = null;
    }

    llmEngine = await webllm.CreateMLCEngine(modelId, {
      initProgressCallback: (report) => {
        // report.progress vai de 0 a 1; report.text descreve a etapa
        const pct = report.progress ?? 0;
        setStatus(report.text || `${modelName} — ${Math.round(pct * 100)}%`, pct);
      }
    });

    webllmModelId = modelId;
    localStorage.setItem("aiWebllmModel", modelId);
    localStorage.setItem("webllmEverLoaded", "1");
    llmLoading = false;
    setStatus((currentLanguage === "pt" ? "Pronto" : "Ready") + " ✓ — " + modelName, 1, "ready");
    updateAIEngineButtonLabel();

    // Oculta a barra após 3 s para não poluir a UI (apenas se ainda em modo webllm)
    setTimeout(() => {
      if (aiEngineMode === "webllm") statusBar.classList.add("hidden-bar");
    }, 3000);

  } catch (err) {
    llmUnavailable = true;
    llmLoading     = false;
    console.error("WebLLM init error:", err);
    setStatus((currentLanguage === "pt" ? "Falha ao carregar modelo — " : "Failed to load model — ") + err.message, null, "error");
  }
}

/* Reflete o modo atual (API ou WebLLM) na barra de status */
function updateStatusBarForMode() {
  const statusIcon = document.getElementById("webllm-status-icon");
  if (aiEngineMode === "api") {
    const providerCfg = API_PROVIDERS[apiProviderId] || API_PROVIDERS.openai;
    const hasKey      = !!getApiKeyFor(apiProviderId);
    const modelId      = getCurrentApiModelId();

    statusBar.classList.remove("hidden-bar");
    document.getElementById("webllm-progress-wrap").style.display = "none";

    if (hasKey && modelId) {
      statusBar.classList.remove("error");
      statusBar.classList.add("ready");
      if (statusIcon) statusIcon.className = "fa-solid fa-cloud";
      statusText.textContent = currentLanguage === "pt"
        ? `IA: usando ${providerCfg.label} · ${modelId} (com sua chave de API)`
        : `AI: using ${providerCfg.label} · ${modelId} (with your API key)`;
    } else {
      statusBar.classList.remove("ready");
      statusBar.classList.add("error");
      if (statusIcon) statusIcon.className = "fa-solid fa-key";
      statusText.textContent = currentLanguage === "pt"
        ? `IA: configure um modelo e sua chave de API para ${providerCfg.label} — clique aqui`
        : `AI: set a model and your API key for ${providerCfg.label} — click here`;
    }
  } else {
    if (statusIcon) statusIcon.className = "fa-solid fa-microchip";
    if (llmEngine && !llmLoading) {
      const modelCfg  = WEBLLM_MODEL_CATALOG.find(m => m.id === webllmModelId);
      const modelName = modelCfg ? modelCfg.name : webllmModelId;
      statusBar.classList.remove("hidden-bar");
      setStatus((currentLanguage === "pt" ? "Pronto" : "Ready") + " ✓ — " + modelName, 1, "ready");
      setTimeout(() => {
        if (aiEngineMode === "webllm") statusBar.classList.add("hidden-bar");
      }, 3000);
    } else if (llmUnavailable) {
      statusBar.classList.remove("hidden-bar");
      setStatus(currentLanguage === "pt"
        ? "WebGPU não suportado — use Chrome/Edge 113+"
        : "WebGPU not supported — use Chrome/Edge 113+", null, "error");
    } else {
      loadWebllmModel(webllmModelId);
    }
  }
}

// Inicializa apenas se o modo padrão/salvo for WebLLM; no modo API só
// atualiza a barra de status (mostrando se falta configurar chave/modelo)
if (aiEngineMode === "webllm") {
  loadWebllmModel(webllmModelId);
} else {
  updateStatusBarForMode();
}

function updateAIEngineButtonLabel() {
  const btn = document.getElementById("aiEngineButton");
  if (!btn) return;
  const prefix = currentLanguage === "pt" ? "IA" : "AI";
  let detail, icon;

  if (aiEngineMode === "api") {
    const providerCfg = API_PROVIDERS[apiProviderId] || API_PROVIDERS.openai;
    const modelId      = getCurrentApiModelId();
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
   MENU DE SELEÇÃO DE LAYOUT
   ================================================ */
window.setLayout = mode => {
  if (!["premiere", "sidebar", "row", "duo"].includes(mode)) return;
  siteLayout = mode;
  localStorage.setItem("siteLayout", mode);
  document.documentElement.setAttribute("data-layout", mode);
  updateLayoutButtonLabel();
  const dropdown = document.getElementById("layoutToggleBtn");
  if (dropdown) dropdown.classList.remove("open");
};

function updateLayoutButtonLabel() {
  const btn = document.getElementById("layoutButton");
  if (!btn) return;
  const texts = translations[currentLanguage];
  const map = {
    duo:      { label: texts.layoutDuoShort,      icon: "fa-clapperboard" },
    premiere: { label: texts.layoutPremiereShort, icon: "fa-table-cells" },
    sidebar:  { label: texts.layoutSidebarShort,  icon: "fa-table-columns" },
    row:      { label: texts.layoutRowShort,      icon: "fa-film" }
  };
  const current = map[siteLayout] || map.duo;
  btn.innerHTML = `<i class="fa-solid ${current.icon}"></i> ${current.label} <span class="arrow">▼</span>`;
}

/* ================================================
   FUNÇÕES AUXILIARES: CHAMAR O MECANISMO DE IA ESCOLHIDO
   ================================================ */

/* ================================================
   PERSISTÊNCIA: chaves de API e modelos escolhidos, por provedor
   (cada provedor guarda sua própria chave/modelo, então trocar de
   provedor e voltar não perde o que já foi configurado)
   ================================================ */
function getApiKeys() {
  try { return JSON.parse(localStorage.getItem("aiApiKeys")) || {}; }
  catch { return {}; }
}
function getApiKeyFor(providerId) {
  return getApiKeys()[providerId] || "";
}
function setApiKeyFor(providerId, key) {
  const keys = getApiKeys();
  if (key) keys[providerId] = key; else delete keys[providerId];
  localStorage.setItem("aiApiKeys", JSON.stringify(keys));
}

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
  const stored       = getApiModels()[apiProviderId];
  if (stored) return stored;
  return (providerCfg && providerCfg.models[0] && providerCfg.models[0].id) || "";
}
function getCustomEndpoint() {
  return localStorage.getItem("aiApiCustomEndpoint") || "";
}

/**
 * Envia mensagens diretamente, do navegador, para o provedor de IA na nuvem
 * escolhido pelo usuário — usando o modelo e a chave de API que ele configurou.
 * @param {Array}  messages   - array de { role, content }
 * @param {number} maxTokens  - máximo de tokens na resposta
 * @returns {Promise<string>}
 */
async function callCloudProvider(messages, maxTokens = 300) {
  const providerCfg = API_PROVIDERS[apiProviderId];
  if (!providerCfg) {
    throw new Error(currentLanguage === "pt" ? "Provedor de IA inválido." : "Invalid AI provider.");
  }

  const apiKey = getApiKeyFor(apiProviderId);
  if (!apiKey) {
    throw new Error(currentLanguage === "pt"
      ? `Cole sua chave de API para ${providerCfg.label} nas configurações de IA.`
      : `Paste your API key for ${providerCfg.label} in the AI settings.`);
  }

  const modelId = getCurrentApiModelId();
  if (!modelId) {
    throw new Error(currentLanguage === "pt"
      ? "Selecione (ou digite) um modelo nas configurações de IA."
      : "Select (or type) a model in the AI settings.");
  }

  const endpoint = apiProviderId === "custom" ? getCustomEndpoint() : providerCfg.endpoint;
  if (!endpoint) {
    throw new Error(currentLanguage === "pt"
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
      const url = endpoint.replace("{model}", encodeURIComponent(modelId)) + `?key=${encodeURIComponent(apiKey)}`;

      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
    throw new Error(currentLanguage === "pt"
      ? `Não foi possível contatar ${providerCfg.label}. Verifique sua conexão e a URL do endpoint.`
      : `Could not reach ${providerCfg.label}. Check your connection and the endpoint URL.`);
  }

  let data;
  try {
    data = await response.json();
  } catch (parseErr) {
    throw new Error(currentLanguage === "pt"
      ? `Resposta inválida de ${providerCfg.label}.`
      : `Invalid response from ${providerCfg.label}.`);
  }

  if (!response.ok) {
    const apiErrMsg = data?.error?.message || data?.error || data?.message
      || (currentLanguage === "pt" ? "Erro na API." : "API error.");
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
    throw new Error(currentLanguage === "pt"
      ? `${providerCfg.label} não retornou nenhum conteúdo.`
      : `${providerCfg.label} returned no content.`);
  }

  return content.trim();
}

/**
 * Envia mensagens ao engine WebLLM local e retorna o texto gerado.
 * @param {Array}  messages   - array de { role, content }
 * @param {number} maxTokens  - máximo de tokens na resposta
 * @returns {Promise<string>}
 */
async function callWebLLM(messages, maxTokens = 300) {
  if (llmUnavailable) {
    throw new Error(currentLanguage === "pt"
      ? "WebGPU não disponível neste navegador."
      : "WebGPU not available in this browser.");
  }
  if (llmLoading || !llmEngine) {
    throw new Error(currentLanguage === "pt"
      ? "O modelo de IA ainda está carregando. Aguarde e tente novamente."
      : "The AI model is still loading. Please wait and try again.");
  }

  const reply = await llmEngine.chat.completions.create({
    messages,
    max_tokens:   maxTokens,
    temperature:  0.7,
    stream:       false
  });

  return reply.choices[0].message.content.trim();
}

/**
 * Roteia a chamada para o mecanismo de IA selecionado pelo usuário (API ou WebLLM).
 * @param {Array}  messages
 * @param {number} maxTokens
 * @returns {Promise<string>}
 */
async function callLLM(messages, maxTokens = 300) {
  if (aiEngineMode === "api") {
    return callCloudProvider(messages, maxTokens);
  }
  // Modo WebLLM: garante que o carregamento foi iniciado
  if (!llmEngine && !llmLoading && !llmUnavailable) {
    loadWebllmModel(webllmModelId);
  }
  return callWebLLM(messages, maxTokens);
}

/* ================================================
   MODAL "AI ENGINE SETTINGS" — motor, modelo local, provedor, modelo de
   API e chave fornecida pelo usuário. Nada é aplicado até o usuário
   clicar em "Save & Use"; até lá tudo fica em variáveis de rascunho
   (staging), preenchidas a partir do estado atual sempre que o modal abre.
   ================================================ */
let stagingEngine           = aiEngineMode;
let stagingWebllmModel      = webllmModelId;
let stagingApiProvider      = apiProviderId;
let stagingApiModelValue    = "";   // id do <select>, ou "__custom__"
let stagingApiCustomModel   = "";   // texto livre quando "__custom__" / provedor "custom"
let stagingApiKey           = "";
let stagingApiEndpoint      = "";

function clearAiSettingsError() {
  const box = document.getElementById("aiSettingsError");
  if (box) { box.textContent = ""; box.classList.remove("visible"); }
}
function showAiSettingsError(msg) {
  const box = document.getElementById("aiSettingsError");
  if (box) { box.textContent = msg; box.classList.add("visible"); }
}

/* Helper genérico: preenche um dropdown customizado (usado no lugar de
   <select> nativo, pra manter a lista de opções com a cara do resto do
   site em vez do estilo padrão do navegador). Pinta o rótulo do botão e
   o item marcado como selecionado; o resto da lógica de estado (staging)
   continua exatamente igual a antes. */
function renderCustomSelect(btnId, listId, items, selectedValue, onChange) {
  const btn  = document.getElementById(btnId);
  const list = document.getElementById(listId);
  if (!btn || !list) return;

  const labelEl = btn.querySelector(".custom-select-label");

  const paint = value => {
    const current = items.find(it => it.value === value);
    if (labelEl) labelEl.textContent = current ? current.label : (items[0]?.label || "");
    list.querySelectorAll("button[data-value]").forEach(b =>
      b.classList.toggle("selected", b.dataset.value === value));
  };

  list.innerHTML = items.map(it => `
    <button type="button" data-value="${it.value}">
      <span>${it.label}</span>${it.meta ? `<span class="csopt-meta">${it.meta}</span>` : ""}
    </button>
  `).join("");

  paint(selectedValue);

  list.querySelectorAll("button[data-value]").forEach(optBtn => {
    optBtn.onclick = () => {
      paint(optBtn.dataset.value);
      onChange(optBtn.dataset.value);
    };
  });
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
  const customLabel = translations[currentLanguage].aiCustomModelOption;
  const items = providerCfg.models.map(m => ({ value: m.id, label: m.label }));
  items.push({ value: "__custom__", label: customLabel });
  renderCustomSelect(
    "apiModelSelectBtn", "apiModelOptionsList",
    items, stagingApiModelValue,
    value => window.onApiModelChange(value)
  );
}

/* Reflete as variáveis de rascunho (staging) nos elementos do modal */
function syncModalUIFromStaging() {
  // Cartões de escolha do motor
  const cardWebllm = document.getElementById("engineCardWebllm");
  const cardApi     = document.getElementById("engineCardApi");
  if (cardWebllm) cardWebllm.classList.toggle("selected", stagingEngine === "webllm");
  if (cardApi)     cardApi.classList.toggle("selected", stagingEngine === "api");

  const panelWebllm = document.getElementById("panelWebllm");
  const panelApi     = document.getElementById("panelApi");
  if (panelWebllm) panelWebllm.classList.toggle("panel-visible", stagingEngine === "webllm");
  if (panelApi)     panelApi.classList.toggle("panel-visible", stagingEngine === "api");

  // Painéis WebLLM e API — repinta os dois dropdowns customizados
  renderWebllmModelOptions();
  renderApiProviderOptions();
  renderApiModelOptions(stagingApiProvider);

  const customModelInput = document.getElementById("apiModelCustomInput");
  const providerCfg      = API_PROVIDERS[stagingApiProvider] || API_PROVIDERS.openai;
  const showCustomModel  = stagingApiModelValue === "__custom__" || stagingApiProvider === "custom";
  if (customModelInput) {
    customModelInput.style.display = showCustomModel ? "block" : "none";
    customModelInput.value = stagingApiCustomModel;
    customModelInput.placeholder = translations[currentLanguage].aiCustomModelPlaceholder;
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
    keyInput.placeholder = providerCfg.keyPlaceholder || (currentLanguage === "pt" ? "Cole sua chave de API" : "Paste your API key");
  }
  const toggleBtn = document.getElementById("toggleKeyVisibility");
  if (toggleBtn) toggleBtn.innerHTML = `<i class="fa-solid fa-eye"></i>`;
}

window.abrirConfiguracaoIA = () => {
  // Repopula o rascunho a partir do estado atualmente salvo
  stagingEngine      = aiEngineMode;
  stagingWebllmModel = webllmModelId;
  stagingApiProvider = apiProviderId;

  const providerCfg = API_PROVIDERS[apiProviderId] || API_PROVIDERS.openai;
  const savedModel  = getApiModels()[apiProviderId];
  const knownIds    = providerCfg.models.map(m => m.id);

  if (apiProviderId === "custom") {
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

  stagingApiKey      = getApiKeyFor(apiProviderId);
  stagingApiEndpoint = getCustomEndpoint();

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

  const providerCfg = API_PROVIDERS[providerId];
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

  stagingApiKey      = getApiKeyFor(providerId);
  stagingApiEndpoint = getCustomEndpoint();

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
  const keyInput   = document.getElementById("apiKeyInput");
  const toggleBtn  = document.getElementById("toggleKeyVisibility");
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
    const chosenModel = stagingWebllmModel || DEFAULT_WEBLLM_MODEL;
    const modelChanged = chosenModel !== webllmModelId || !llmEngine;

    aiEngineMode = "webllm";
    localStorage.setItem("aiEngineMode", "webllm");
    localStorage.setItem("aiWebllmModel", chosenModel);

    fecharConfiguracaoIA();
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
      showAiSettingsError(currentLanguage === "pt" ? "Informe ou selecione um modelo." : "Enter or select a model.");
      return;
    }
    if (!key) {
      showAiSettingsError(currentLanguage === "pt" ? "Cole sua chave de API." : "Paste your API key.");
      return;
    }
    if (providerId === "custom" && !endpoint) {
      showAiSettingsError(currentLanguage === "pt" ? "Informe a URL do endpoint." : "Enter the endpoint URL.");
      return;
    }

    aiEngineMode  = "api";
    apiProviderId = providerId;
    localStorage.setItem("aiEngineMode", "api");
    localStorage.setItem("aiApiProvider", providerId);
    setApiModelFor(providerId, modelId);
    setApiKeyFor(providerId, key);
    if (providerId === "custom") localStorage.setItem("aiApiCustomEndpoint", endpoint);

    fecharConfiguracaoIA();
    updateAIEngineButtonLabel();
    updateStatusBarForMode();
  }
};

// Fecha o modal ao clicar fora do conteúdo (na área escurecida)
document.getElementById("aiSettingsModal")?.addEventListener("click", e => {
  if (e.target.id === "aiSettingsModal") fecharConfiguracaoIA();
});

/* ================================================
   EFEITO DE DIGITAÇÃO
   ================================================ */
function typeWriter(element, text, delay = 20) {
  element.innerHTML = "";
  let i = 0;
  let interval = setInterval(() => {
    element.innerHTML += text.charAt(i);
    i++;
    if (i >= text.length) clearInterval(interval);
  }, delay);
}

/* ================================================
   VARIÁVEIS GLOBAIS
   ================================================ */
let termoPesquisa     = "";
let paginaAtual       = 1;
let totalResultados   = 0;
const filmesPorPagina = 10;

const omdbEndpoint = "omdb.php";

/* ================================================
   PÔSTER — moldura "fotograma de 35mm" + imagem fixa
   de fallback quando o filme/série não tem pôster
   ================================================ */
const POSTER_PLACEHOLDER = "poster-placeholder.svg";

function posterFrame(filme) {
  const hasPoster = !!(filme.Poster && filme.Poster !== "N/A");
  const src   = hasPoster ? filme.Poster : POSTER_PLACEHOLDER;
  const cls   = hasPoster ? "poster-frame" : "poster-frame no-poster";
  const title = (filme.Title || "").replace(/"/g, "&quot;");
  return `<div class="${cls}">
    <img src="${src}" alt="${title}" loading="lazy"
         onload="this.classList.add('loaded')"
         onerror="this.onerror=null; this.src='${POSTER_PLACEHOLDER}'; this.closest('.poster-frame').classList.add('no-poster');" />
  </div>`;
}

let searchType           = "";
let currentMovieDetailId = null;
let currentMovieDetail   = null;

/* ================================================
   ELEMENTOS DOM
   ================================================ */
const frmPesquisa   = document.getElementById("pesquisaForm");
const frmIA         = document.getElementById("iaForm");
const lista         = document.querySelector("div.lista");
const detalhes      = document.querySelector("div.detalhes");
const erro          = document.querySelector("div.erro");
const navegacao     = document.querySelector("div.navegacao");
const loader        = document.getElementById("loader");
const modeToggleBtn  = document.getElementById("modeToggleBtn");
const modeButton     = document.getElementById("modeButton");
const styleToggleBtn = document.getElementById("styleToggleBtn");
const styleButton    = document.getElementById("styleButton");
const recCountToggleBtn = document.getElementById("recCountToggleBtn");
const recCountButton    = document.getElementById("recCountButton");
const aiEngineToggleBtn = document.getElementById("aiEngineToggleBtn");

/* ================================================
   SCROLL
   ================================================ */
function scrollToMovies() {
  if (lista) lista.scrollIntoView({ behavior: "smooth" });
}

/* Navegação por setas em fileiras horizontais (Poster Row, Destaques da
   Semana...); anda uma "página" de itens por clique; ao passar do último
   item volta pro primeiro (e vice-versa), em vez de travar no fim. */
function scrollElByPage(el, direction) {
  if (!el) return;
  const maxScroll = el.scrollWidth - el.clientWidth;
  if (maxScroll <= 1) return; // não há o que rolar

  const epsilon   = 4;
  const pageWidth = el.clientWidth * 0.9;

  if (direction > 0) {
    if (el.scrollLeft >= maxScroll - epsilon) {
      el.scrollTo({ left: 0, behavior: "smooth" });
    } else {
      el.scrollBy({ left: pageWidth, behavior: "smooth" });
    }
  } else {
    if (el.scrollLeft <= epsilon) {
      el.scrollTo({ left: maxScroll, behavior: "smooth" });
    } else {
      el.scrollBy({ left: -pageWidth, behavior: "smooth" });
    }
  }
}
window.scrollListaPrev = () => scrollElByPage(lista, -1);
window.scrollListaNext = () => scrollElByPage(lista, 1);
window.scrollHighlightsPrev = () => scrollElByPage(document.getElementById("highlightsRow"), -1);
window.scrollHighlightsNext = () => scrollElByPage(document.getElementById("highlightsRow"), 1);

/* ================================================
   NOTIFICAÇÕES (toast) — substitui alert() por um aviso não bloqueante
   ================================================ */
function showToast(message, type = "error", duration = 5500) {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  const icons = {
    error:   "fa-circle-exclamation",
    warning: "fa-triangle-exclamation",
    info:    "fa-circle-info",
    success: "fa-circle-check"
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icons[type] || icons.info} toast-icon"></i>
    <span class="toast-message"></span>
    <button type="button" class="toast-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>
  `;
  toast.querySelector(".toast-message").textContent = message; // texto seguro (sem HTML injetado)
  container.appendChild(toast);

  const remove = () => {
    toast.classList.add("toast-out");
    setTimeout(() => toast.remove(), 280);
  };
  const timer = setTimeout(remove, duration);
  toast.querySelector(".toast-close").onclick = () => { clearTimeout(timer); remove(); };
}
window.showToast = showToast;

/* ================================================
   EVENTOS DOS FORMULÁRIOS
   ================================================ */
frmPesquisa.onsubmit = e => {
  e.preventDefault();
  termoPesquisa = e.target.pesquisa.value;
  paginaAtual   = 1;
  searchType    = "titulo";
  buscarFilmes();
};

frmIA.onsubmit = e => {
  e.preventDefault();
  const prompt = e.target.prompt.value;
  searchType   = "recomendacao";
  recomendarFilmes(prompt);
};

/* ================================================
   LOADER
   ================================================ */
const showLoader = () => { loader.style.display = "block"; };
const hideLoader = () => { loader.style.display = "none";  };

/* ================================================
   BUSCA DE FILMES (OMDb via PHP)
   ================================================ */
const buscarFilmes = () => {
  if (!termoPesquisa) return;
  showLoader();
  fetch(`${omdbEndpoint}?type=s&value=${encodeURIComponent(termoPesquisa)}&page=${paginaAtual}`)
    .then(res => res.json())
    .then(json => {
      hideLoader();
      carregarLista(json);
    })
    .catch(() => {
      hideLoader();
      exibirErro();
    });
};

const carregarLista = json => {
  lista.innerHTML         = "";
  detalhes.style.display  = "none";
  detalhes.classList.remove("show");
  document.body.classList.remove("detail-view");
  erro.style.display      = "none";
  navegacao.style.display = "none";
  const highlightsSection = document.getElementById("highlightsSection");
  if (highlightsSection) highlightsSection.style.display = "none";

  if (json.Response === "False") { exibirErro(); return; }

  totalResultados     = parseInt(json.totalResults);
  lista.style.display = "flex";

  json.Search.forEach((filme, i) => {
    const item = document.createElement("div");
    item.className = "item";
    item.style.setProperty("--i", i);

    item.innerHTML = `${posterFrame(filme)}<h2>${filme.Title}</h2>`;
    item.onclick   = () => carregarDetalhes(filme.imdbID);
    lista.appendChild(item);
  });

  renderPagination();
  scrollToMovies();
};

/* ================================================
   PAGINAÇÃO
   ================================================ */
const renderPagination = () => {
  if (searchType !== "titulo" || totalResultados === 0 || lista.innerHTML.trim() === "") {
    navegacao.style.display = "none";
    return;
  }

  const totalPaginas = Math.ceil(totalResultados / filmesPorPagina);
  if (totalPaginas <= 1) { navegacao.style.display = "none"; return; }

  navegacao.style.display = "flex";
  navegacao.innerHTML     = "";

  const addButton = page => {
    const btn = document.createElement("button");
    btn.innerText = page;
    if (page === paginaAtual) btn.classList.add("active");
    btn.onclick = () => { paginaAtual = page; buscarFilmes(); };
    navegacao.appendChild(btn);
  };

  if (totalPaginas <= 7) {
    for (let i = 1; i <= totalPaginas; i++) addButton(i);
  } else {
    addButton(1);
    let left  = paginaAtual - 2;
    let right = paginaAtual + 2;
    if (left < 2)                 { right += (2 - left);                  left = 2; }
    if (right > totalPaginas - 1) { left  -= (right - (totalPaginas - 1)); right = totalPaginas - 1; if (left < 2) left = 2; }
    for (let i = left; i <= right; i++) addButton(i);
    addButton(totalPaginas);
  }
};

/* ================================================
   NOTAS (IMDb, Rotten Tomatoes, Metacritic)
   Já vêm de graça na resposta do omdb.php — nenhuma API extra necessária.
   ================================================ */
function renderRatingsRow(filme) {
  const badges = [];

  if (filme.imdbRating && filme.imdbRating !== "N/A") {
    badges.push(`
      <span class="rating-badge rating-imdb" title="IMDb${filme.imdbVotes && filme.imdbVotes !== "N/A" ? " · " + filme.imdbVotes + " votes" : ""}">
        <i class="fa-solid fa-star"></i> IMDb <strong>${filme.imdbRating}</strong><small>/10</small>
      </span>`);
  }

  (filme.Ratings || []).forEach(r => {
    if (r.Source === "Rotten Tomatoes") {
      const pct = parseInt(r.Value, 10) || 0;
      const cls = pct >= 60 ? "fresh" : "rotten";
      badges.push(`
        <span class="rating-badge rating-rt" title="Rotten Tomatoes">
          <i class="fa-solid fa-splotch ${cls}"></i> RT <strong>${r.Value}</strong>
        </span>`);
    } else if (r.Source === "Metacritic") {
      const score = parseInt(r.Value, 10) || 0;
      const cls   = score >= 61 ? "good" : score >= 40 ? "mixed" : "bad";
      badges.push(`
        <span class="rating-badge rating-mc" title="Metacritic">
          <span class="mc-score ${cls}">${score}</span> Metascore
        </span>`);
    }
  });

  if (!badges.length) return "";
  return `<div class="ratings-row">${badges.join("")}</div>`;
}

/* ================================================
   TRAILER — prioriza os VÍDEOS OFICIAIS do TMDB (mesma chave já usada
   em "onde assistir"/"elenco" — se aquelas seções já funcionam, o
   trailer passa a funcionar automaticamente, sem nenhuma configuração
   extra). Se o TMDB não tiver um trailer para o título, usa a YouTube
   Data API v3 como reforço opcional (proxy youtube.php — precisa de
   uma chave própria, ver youtube.php). Se nada estiver disponível,
   mostra um link para pesquisar manualmente, junto com o motivo real
   da falha (para facilitar o diagnóstico).
   ================================================ */
const youtubeEndpoint = "youtube.php";

// Cache do resultado já resolvido em segundo plano (por carregarExtrasTmdb)
// para o filme atualmente exibido — evita nova consulta ao clicar em "Ver Trailer"
let currentTrailerVideoId    = null; // string (YouTube video id) ou null (sem trailer no TMDB)
let currentTrailerResolvedFor = null; // imdbID para o qual o cache acima é válido

// Escolhe o melhor vídeo do YouTube dentre os retornados pelo TMDB:
// trailer oficial > qualquer trailer > teaser > qualquer vídeo do YouTube
function escolherMelhorTrailer(videos) {
  const yt = (videos || []).filter(v => v.site === "YouTube");
  const pick =
    yt.find(v => v.type === "Trailer" && v.official) ||
    yt.find(v => v.type === "Trailer") ||
    yt.find(v => v.type === "Teaser") ||
    yt[0];
  return pick ? pick.key : null;
}

// Resolve o trailer do zero via TMDB (find -> videos). Usado como
// fallback quando o cache de carregarExtrasTmdb ainda não está pronto.
async function buscarTrailerTmdb(filme) {
  const findRes  = await fetch(`${tmdbEndpoint}?type=find&value=${encodeURIComponent(filme.imdbID)}`);
  const findData = await findRes.json();
  if (!findRes.ok || findData.error) throw new Error(findData.error || "TMDB find failed");

  const isSeries = (filme.Type || "").toLowerCase() === "series";
  const results   = isSeries ? findData.tv_results : findData.movie_results;
  if (!results || !results.length) return null;

  const tmdbId = results[0].id;
  const media  = isSeries ? "tv" : "movie";

  const vidRes  = await fetch(`${tmdbEndpoint}?type=videos&value=${tmdbId}&media=${media}`);
  const vidData = await vidRes.json();
  if (!vidRes.ok || vidData.error) throw new Error(vidData.error || "TMDB videos failed");

  return escolherMelhorTrailer(vidData.results || []);
}

function montarIframeTrailer(videoId, title) {
  return `<iframe
      src="https://www.youtube.com/embed/${videoId}?autoplay=1"
      title="Trailer — ${(title || "").replace(/"/g, "&quot;")}"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen loading="lazy"></iframe>`;
}

window.abrirTrailer = async () => {
  if (!currentMovieDetail) return;
  const filme = currentMovieDetail;
  const query = `${filme.Title} ${filme.Year} official trailer`;

  const titleEl = document.getElementById("trailerModalTitle");
  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-clapperboard"></i> ${filme.Title}`;

  const modal = document.getElementById("trailerModal");
  if (modal) modal.style.display = "flex";

  // Já resolvido em segundo plano (ao abrir a página de detalhes) e com sucesso?
  if (currentTrailerResolvedFor === filme.imdbID && currentTrailerVideoId) {
    const wrap = document.getElementById("trailerFrameWrap");
    if (wrap) wrap.innerHTML = montarIframeTrailer(currentTrailerVideoId, filme.Title);
    return;
  }

  const wrap = document.getElementById("trailerFrameWrap");
  if (wrap) wrap.innerHTML = `<div class="trailer-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${translations[currentLanguage].loadingTrailer}</div>`;

  let videoId   = null;
  let lastError = null;

  // Se o cache ainda não tem resposta para este filme, tenta o TMDB agora
  if (currentTrailerResolvedFor !== filme.imdbID) {
    try {
      videoId = await buscarTrailerTmdb(filme);
    } catch (err) {
      lastError = err;
      console.warn("TMDB trailer lookup failed:", err.message);
    }
  }

  // Reforço opcional: YouTube Data API (só é chamada se o TMDB não achou nada)
  if (!videoId) {
    try {
      const res  = await fetch(`${youtubeEndpoint}?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (res.ok && !data.error && data.videoId) {
        videoId = data.videoId;
      } else if (data.error) {
        lastError = new Error(data.error);
        console.warn("YouTube search fallback failed:", data.error);
      }
    } catch (err) {
      lastError = err;
      console.warn("YouTube search fallback failed:", err.message);
    }
  }

  // O usuário pode ter fechado o modal / trocado de filme enquanto buscava
  if (!currentMovieDetail || currentMovieDetail.imdbID !== filme.imdbID) return;
  const wrapNow = document.getElementById("trailerFrameWrap");
  if (!wrapNow) return;

  if (videoId) {
    wrapNow.innerHTML = montarIframeTrailer(videoId, filme.Title);
  } else {
    renderTrailerFallback(query, lastError);
  }
};

// Mostra um link para pesquisar manualmente no YouTube quando nenhuma
// busca automática encontrou um vídeo, junto com o motivo real (se houver)
function renderTrailerFallback(query, err) {
  const wrap = document.getElementById("trailerFrameWrap");
  if (!wrap) return;
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const debugMsg = err && err.message ? String(err.message).replace(/</g, "&lt;") : "";
  wrap.innerHTML = `
    <div class="trailer-fallback">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <p>${translations[currentLanguage].trailerNotFound}</p>
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="trailer-fallback-link">
        <i class="fa-brands fa-youtube"></i> ${translations[currentLanguage].searchOnYoutube}
      </a>
      ${debugMsg ? `<span class="trailer-fallback-debug">${debugMsg}</span>` : ""}
    </div>`;
}

window.fecharTrailer = () => {
  const modal = document.getElementById("trailerModal");
  if (modal) modal.style.display = "none";
  // Remove o conteúdo para interromper a reprodução ao fechar
  const wrap = document.getElementById("trailerFrameWrap");
  if (wrap) wrap.innerHTML = "";
};

document.getElementById("trailerModal")?.addEventListener("click", e => {
  if (e.target.id === "trailerModal") fecharTrailer();
});

/* ================================================
   ONDE ASSISTIR + ELENCO (com fotos) — via TMDB (dados agregados do
   JustWatch para streaming), usando o proxy tmdb.php (precisa de uma
   chave TMDB gratuita — ver tmdb.php). A resposta de "providers" já
   traz TODAS as regiões de uma vez, então trocar de região no seletor
   não faz nenhuma requisição nova. O elenco cai de volta para a lista
   simples de nomes do omdb.php caso o TMDB não esteja configurado.
   ================================================ */
const tmdbEndpoint = "tmdb.php";
const WATCH_REGIONS = ["BR", "US", "PT", "GB", "ES", "MX"];

// Guarda o objeto "results" (todas as regiões) do filme atualmente exibido
let currentWatchProvidersData = null;

function getWatchRegion() {
  const saved = localStorage.getItem("watchRegion");
  if (saved && WATCH_REGIONS.includes(saved)) return saved;
  return currentLanguage === "pt" ? "BR" : "US";
}

window.onWatchRegionChange = region => {
  localStorage.setItem("watchRegion", region);
  renderWatchProviders();
};

function renderWatchProviders() {
  const container = document.getElementById("watchProvidersContainer");
  if (!container) return;

  const region        = getWatchRegion();
  const regionData = currentWatchProvidersData ? currentWatchProvidersData[region] : null;

  const groups = ["flatrate", "free", "ads", "rent", "buy"];
  const seen   = new Set();
  const icons  = [];
  if (regionData) {
    groups.forEach(key => {
      (regionData[key] || []).forEach(p => {
        if (seen.has(p.provider_id)) return;
        seen.add(p.provider_id);
        icons.push(p);
      });
    });
  }

  const iconsHtml = icons.slice(0, 10).map(p => {
    const name = (p.provider_name || "").replace(/"/g, "&quot;");
    return `<img src="https://image.tmdb.org/t/p/w92${p.logo_path}" alt="${name}" title="${name}" loading="lazy" />`;
  }).join("");

  const bodyHtml = icons.length
    ? `<a class="watch-providers-icons" href="${regionData.link || '#'}" target="_blank" rel="noopener noreferrer">${iconsHtml}</a>`
    : `<span class="watch-providers-empty">${translations[currentLanguage].noWhereToWatch}</span>`;

  container.innerHTML = `
    <div class="watch-providers">
      <span class="watch-providers-label"><i class="fa-solid fa-tv"></i> ${translations[currentLanguage].whereToWatch}</span>
      <div class="mode-toggle custom-select region-select" id="watchRegionToggle">
        <button type="button" class="custom-select-btn" id="watchRegionBtn" aria-haspopup="listbox">
          <span class="custom-select-label">${region}</span>
          <span class="arrow">▼</span>
        </button>
        <div class="mode-options custom-select-options" id="watchRegionOptionsList" role="listbox"></div>
      </div>
      ${bodyHtml}
    </div>
    ${icons.length ? `<span class="watch-providers-attribution">${translations[currentLanguage].watchProvidersAttribution}</span>` : ""}
  `;

  renderCustomSelect(
    "watchRegionBtn", "watchRegionOptionsList",
    WATCH_REGIONS.map(r => ({ value: r, label: r })),
    region,
    value => window.onWatchRegionChange(value)
  );
}

// Elenco a partir do omdb.php (só nomes, sem foto) — usado como estado
// inicial imediato e como fallback caso o TMDB não esteja configurado
function renderCastFallback(filme) {
  const actors = (filme.Actors && filme.Actors !== "N/A")
    ? filme.Actors.split(",").map(a => a.trim()).filter(Boolean)
    : [];
  if (!actors.length) return `<p class="cast-empty">${translations[currentLanguage].castEmpty}</p>`;
  return `<div class="cast-list-plain">${actors.map(a => `<span class="cast-pill"><i class="fa-solid fa-user"></i> ${a}</span>`).join("")}</div>`;
}

// Elenco com fotos, a partir dos créditos do TMDB
function renderCastGrid(castList) {
  if (!castList || !castList.length) return "";
  const cards = castList.slice(0, 18).map(p => {
    const name      = (p.name || "").replace(/"/g, "&quot;");
    const character = (p.character || "").replace(/"/g, "&quot;");
    const photo = p.profile_path
      ? `<img src="https://image.tmdb.org/t/p/w185${p.profile_path}" alt="${name}" loading="lazy" />`
      : `<div class="cast-photo-placeholder"><i class="fa-solid fa-user"></i></div>`;
    return `
      <div class="cast-card">
        <div class="cast-photo">${photo}</div>
        <div class="cast-name">${name}</div>
        ${character ? `<div class="cast-character">${character}</div>` : ""}
      </div>`;
  }).join("");
  return `<div class="cast-grid">${cards}</div>`;
}

async function carregarExtrasTmdb(filme) {
  // Elenco: mostra imediatamente a lista simples do omdb.php enquanto
  // a versão com fotos (TMDB) carrega em segundo plano
  const castContainer = document.getElementById("castContainer");
  if (castContainer) castContainer.innerHTML = renderCastFallback(filme);

  // Onde assistir: mostra estado de carregamento
  currentWatchProvidersData = null;
  const watchContainer = document.getElementById("watchProvidersContainer");
  if (watchContainer) {
    watchContainer.innerHTML = `<span class="watch-providers-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> ${translations[currentLanguage].loadingWhereToWatch}</span>`;
  }

  // Trailer: zera o cache do filme anterior — será preenchido abaixo
  currentTrailerVideoId    = null;
  currentTrailerResolvedFor = null;

  try {
    const findRes  = await fetch(`${tmdbEndpoint}?type=find&value=${encodeURIComponent(filme.imdbID)}`);
    const findData = await findRes.json();
    if (!findRes.ok || findData.error) throw new Error(findData.error || "TMDB find failed");

    const isSeries = (filme.Type || "").toLowerCase() === "series";
    const results   = isSeries ? findData.tv_results : findData.movie_results;

    // Não encontrado no TMDB — mantém o fallback do elenco e limpa o "onde assistir";
    // marca o trailer como "resolvido sem resultado" (evita tentar de novo o TMDB ao clicar)
    if (!results || !results.length) {
      currentTrailerVideoId     = null;
      currentTrailerResolvedFor = filme.imdbID;
      if (currentMovieDetail && currentMovieDetail.imdbID === filme.imdbID) renderWatchProviders();
      return;
    }

    const tmdbId = results[0].id;
    const media  = isSeries ? "tv" : "movie";

    const [provRes, creditsRes, videosRes] = await Promise.all([
      fetch(`${tmdbEndpoint}?type=providers&value=${tmdbId}&media=${media}`),
      fetch(`${tmdbEndpoint}?type=credits&value=${tmdbId}&media=${media}`),
      fetch(`${tmdbEndpoint}?type=videos&value=${tmdbId}&media=${media}`)
    ]);
    const [provData, creditsData, videosData] = await Promise.all([provRes.json(), creditsRes.json(), videosRes.json()]);

    // Evita condição de corrida caso o usuário já tenha trocado de filme
    if (!currentMovieDetail || currentMovieDetail.imdbID !== filme.imdbID) return;

    if (provRes.ok && !provData.error) currentWatchProvidersData = provData.results || null;
    renderWatchProviders();

    if (creditsRes.ok && !creditsData.error && Array.isArray(creditsData.cast) && creditsData.cast.length) {
      const el = document.getElementById("castContainer");
      if (el) el.innerHTML = renderCastGrid(creditsData.cast);
    }
    // Se os créditos falharem, o fallback do omdb.php já exibido permanece

    if (videosRes.ok && !videosData.error) {
      currentTrailerVideoId     = escolherMelhorTrailer(videosData.results || []);
      currentTrailerResolvedFor = filme.imdbID;
    }
    // Se a busca de vídeos falhar, o cache fica "não resolvido" e o clique em
    // "Ver Trailer" tenta de novo (e depois cai para a YouTube Data API)

  } catch (err) {
    console.error("TMDB extras error:", err);
    if (currentMovieDetail && currentMovieDetail.imdbID === filme.imdbID) {
      const el = document.getElementById("watchProvidersContainer");
      if (el) el.innerHTML = `<span class="watch-providers-empty">${translations[currentLanguage].noWhereToWatch}</span>`;
    }
  }
}

/* ================================================
   FICHA TÉCNICA (aba "Detalhes") — direto do omdb.php, sem API extra
   ================================================ */
function renderFichaTecnica(filme) {
  const isSeries = (filme.Type || "").toLowerCase() === "series";
  const t = translations[currentLanguage];

  const rows = [
    { label: t.fichaDirector,   value: filme.Director },
    { label: t.fichaWriter,     value: filme.Writer },
    { label: t.fichaRuntime,    value: filme.Runtime },
    { label: t.fichaSeasons,    value: (isSeries ? filme.totalSeasons : null) },
    { label: t.fichaRated,      value: filme.Rated },
    { label: t.fichaReleased,   value: filme.Released },
    { label: t.fichaLanguage,   value: filme.Language },
    { label: t.fichaCountry,    value: filme.Country },
    { label: t.fichaAwards,     value: filme.Awards },
    { label: t.fichaBoxOffice,  value: filme.BoxOffice },
    { label: t.fichaProduction, value: filme.Production }
  ];

  const itemsHtml = rows
    .filter(r => r.value && r.value !== "N/A")
    .map(r => `
      <div class="ficha-item">
        <span class="ficha-label">${r.label}</span>
        <span class="ficha-value">${r.value}</span>
      </div>`)
    .join("");

  return itemsHtml
    ? `<div class="ficha-grid">${itemsHtml}</div>`
    : `<p class="ficha-empty">${t.fichaEmpty}</p>`;
}

/* ================================================
   ABAS DA PÁGINA DE DETALHES (Sinopse / Elenco / Detalhes)
   ================================================ */
window.mudarAbaDetalhes = tab => {
  document.querySelectorAll(".detail-tab-btn")
    .forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".detail-tab-panel")
    .forEach(panel => panel.classList.toggle("active", panel.dataset.tabPanel === tab));
};

/* ================================================
   ATUALIZA DETALHES NA TELA
   ================================================ */
function updateFilmDetails() {
  if (!currentMovieDetail) return;
  const filme     = currentMovieDetail;
  const favoritos  = getFavoritos();
  const isFavorite = favoritos.includes(filme.imdbID);
  const favText    = isFavorite
    ? translations[currentLanguage].removeFromFavorites
    : translations[currentLanguage].addToFavorites;
  const favClass   = isFavorite ? "is-favorite" : "";

  const resumoSalvo       = localStorage.getItem("resumo_" + filme.imdbID);
  const btnResumoTxt      = resumoSalvo ? translations[currentLanguage].summaryGenerated : translations[currentLanguage].generateSummary;
  const btnResumoDisabled = resumoSalvo ? "disabled" : "";
  const btnResumoClass    = resumoSalvo ? "generated" : "";
  const resumoDisplay     = resumoSalvo ? "block" : "none";
  const resumoContent     = resumoSalvo || "";

  const hasPoster  = !!(filme.Poster && filme.Poster !== "N/A");
  const backdropSrc = hasPoster ? filme.Poster : "";

  detalhes.innerHTML = `
    <div class="detalhes-hero">
      <div class="detalhes-backdrop" style="${backdropSrc ? `background-image:url('${backdropSrc}')` : ""}"></div>
      <div class="detalhes-backdrop-fade"></div>
    </div>
    <button class="detalhes-back" onclick="voltarParaPesquisa()" title="${translations[currentLanguage].backToSearch.replace(/<[^>]*>/g, '')}">
      <i class="fa-solid fa-arrow-left"></i>
    </button>

    <div class="detalhes-body">
      <div class="poster-col">
        ${posterFrame(filme)}
        <span class="session-badge-wrap" aria-hidden="true"><span class="session-badge">★ SESSÃO ★</span></span>
      </div>
      <div class="info">
        <h1>${filme.Title}</h1>
        <div class="meta-ratings-row">
          <div class="meta-row">
            <span class="meta-year"><i class="fa-solid fa-calendar"></i> ${filme.Year}</span>
            <span class="meta-genre"><i class="fa-solid fa-tags"></i> ${filme.Genre}</span>
          </div>
          ${renderRatingsRow(filme)}
        </div>
        <div class="watch-providers-container" id="watchProvidersContainer"></div>
        <div class="action-buttons">
          <button class="gerarResumo ${btnResumoClass}" onclick="gerarResumo()" ${btnResumoDisabled}>
            ${btnResumoTxt}
          </button>
          <button class="watchTrailerBtn" onclick="abrirTrailer()">
            <i class="fa-solid fa-clapperboard"></i> ${translations[currentLanguage].watchTrailer}
          </button>
          <button id="favToggleButton" class="${favClass}" onclick="toggleFavorito('${filme.imdbID}', this)">
            ${favText}
          </button>
        </div>
        <div class="resumo-section">
          <div class="resumo-container" id="resumoContainer" style="display:${resumoDisplay};">
            ${resumoContent}
          </div>
        </div>
      </div>
    </div>

    <div class="detail-tabs">
      <div class="detail-tabs-nav">
        <button class="detail-tab-btn active" data-tab="sinopse" onclick="mudarAbaDetalhes('sinopse')">
          <i class="fa-solid fa-align-left"></i> ${translations[currentLanguage].tabSinopse}
        </button>
        <button class="detail-tab-btn" data-tab="elenco" onclick="mudarAbaDetalhes('elenco')">
          <i class="fa-solid fa-users"></i> ${translations[currentLanguage].tabElenco}
        </button>
        <button class="detail-tab-btn" data-tab="ficha" onclick="mudarAbaDetalhes('ficha')">
          <i class="fa-solid fa-list"></i> ${translations[currentLanguage].tabDetalhes}
        </button>
      </div>

      <div class="detail-tab-panel active" data-tab-panel="sinopse">
        <p class="sinopse">${filme.Plot}</p>
      </div>

      <div class="detail-tab-panel" data-tab-panel="elenco">
        <div id="castContainer">${renderCastFallback(filme)}</div>
      </div>

      <div class="detail-tab-panel" data-tab-panel="ficha">
        ${renderFichaTecnica(filme)}
      </div>
    </div>

    <div class="botoes">
      <button class="voltarInicial" onclick="voltarPaginaInicial()">
        ${translations[currentLanguage].backToHome}
      </button>
    </div>
  `;

  carregarExtrasTmdb(filme);
}

/* ================================================
   CARREGA DETALHES DE UM FILME
   ================================================ */
const carregarDetalhes = imdbID => {
  showLoader();
  fetch(`${omdbEndpoint}?type=i&value=${imdbID}`)
    .then(res => res.json())
    .then(filme => {
      hideLoader();
      currentMovieDetailId = filme.imdbID;
      currentMovieDetail   = filme;

      erro.style.display      = "none";
      lista.style.display     = "none";
      navegacao.style.display = "none";

      updateFilmDetails();
      detalhes.style.display = "block";
      document.body.classList.add("detail-view");
      setTimeout(() => detalhes.classList.add("show"), 50);
      window.scrollTo({ top: 0, behavior: "smooth" });

      const resumoContainer = document.getElementById("resumoContainer");
      const resumoSalvo     = localStorage.getItem("resumo_" + filme.imdbID);
      if (resumoSalvo) {
        resumoContainer.style.display = "block";
        resumoContainer.innerText     = resumoSalvo;
        const btn = document.querySelector(".gerarResumo");
        if (btn) {
          btn.disabled  = true;
          btn.classList.add("generated");
          btn.innerHTML = translations[currentLanguage].summaryGenerated;
        }
      }
    })
    .catch(() => { hideLoader(); exibirErro(); });
};

/* ================================================
   GERA RESUMO — VIA IA (API ou WebLLM, conforme escolha do usuário)
   ================================================ */
window.gerarResumo = async () => {
  if (!currentMovieDetail) return;

  const titulo          = currentMovieDetail.Title;
  const plot            = currentMovieDetail.Plot;
  const imdbID          = currentMovieDetail.imdbID;
  const resumoContainer = document.getElementById("resumoContainer");

  // Se já está salvo, só exibe
  const resumoSalvo = localStorage.getItem("resumo_" + imdbID);
  if (resumoSalvo) {
    resumoContainer.style.display = "block";
    typeWriter(resumoContainer, resumoSalvo, 20);
    const btn = document.querySelector(".gerarResumo");
    if (btn) {
      btn.disabled  = true;
      btn.classList.add("generated");
      btn.innerHTML = translations[currentLanguage].summaryGenerated;
    }
    return;
  }

  // Verifica se o modelo local já carregou (só se aplica ao modo WebLLM)
  if (aiEngineMode === "webllm") {
    if (llmLoading) {
      showToast(currentLanguage === "pt"
        ? "O modelo de IA ainda está carregando. Aguarde alguns instantes e tente novamente."
        : "The AI model is still loading. Please wait a moment and try again.", "warning");
      return;
    }
    if (llmUnavailable) {
      showToast(currentLanguage === "pt"
        ? "IA local não disponível: seu navegador não suporta WebGPU. Use Chrome ou Edge 113+."
        : "Local AI unavailable: your browser does not support WebGPU. Use Chrome or Edge 113+.", "error");
      return;
    }
  }

  resumoContainer.style.display = "block";
  resumoContainer.innerHTML     = translations[currentLanguage].loadingSummary;
  showLoader();

  // Desabilita botão durante a geração
  const btn = document.querySelector(".gerarResumo");
  if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Generating…"; }

  let systemMessage, userMessage;
  if (currentLanguage === "pt") {
    systemMessage = "Você é um resumidor criativo de filmes. Crie um resumo curto e intrigante para um filme sem revelar spoilers importantes. Responda apenas com o resumo, sem preâmbulos.";
    userMessage   = `Crie um resumo curto e instigante para o filme "${titulo}". Use o seguinte enredo como contexto: ${plot}`;
  } else {
    systemMessage = "You are a creative movie summarizer. Create a short, intriguing summary for a movie without revealing major spoilers. Reply only with the summary, no preamble.";
    userMessage   = `Generate a short, enticing summary for the movie "${titulo}". Use the following plot as context: ${plot}`;
  }

  try {
    const resumo = await callLLM(
      [
        { role: "system", content: systemMessage },
        { role: "user",   content: userMessage   }
      ],
      200
    );

    hideLoader();
    localStorage.setItem("resumo_" + imdbID, resumo);

    if (btn) {
      btn.disabled  = true;
      btn.classList.add("generated");
      btn.innerHTML = translations[currentLanguage].summaryGenerated;
    }

    typeWriter(resumoContainer, resumo, 20);

  } catch (err) {
    hideLoader();
    console.error("Erro IA (gerarResumo):", err);

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = translations[currentLanguage].generateSummary;
    }

    resumoContainer.style.display = "none";
    showToast((currentLanguage === "pt" ? "Erro ao gerar resumo: " : "Error generating summary: ") + err.message, "error");
  }
};

/* ================================================
   EXIBE MENSAGEM DE ERRO
   ================================================ */
const exibirErro = () => {
  lista.innerHTML         = "";
  erro.style.display      = "block";
  navegacao.style.display = "none";
  const highlightsSection = document.getElementById("highlightsSection");
  if (highlightsSection) highlightsSection.style.display = "none";
};

/* ================================================
   VOLTAR PARA RESULTADOS
   ================================================ */
const voltarParaPesquisa = () => {
  detalhes.style.display = "none";
  detalhes.classList.remove("show");
  document.body.classList.remove("detail-view");
  lista.style.display    = "flex";
  if (searchType === "titulo" && lista.innerHTML.trim() !== "") {
    renderPagination();
  } else {
    navegacao.style.display = "none";
  }
  scrollToMovies();
};

/* ================================================
   VOLTA À PÁGINA INICIAL
   ================================================ */
const voltarPaginaInicial = () => {
  document.querySelector("form#pesquisaForm input[name='pesquisa']").value = "";
  document.querySelector("form#iaForm    input[name='prompt']").value      = "";

  lista.innerHTML         = "";
  detalhes.style.display  = "none";
  detalhes.classList.remove("show");
  document.body.classList.remove("detail-view");
  erro.style.display      = "none";
  navegacao.style.display = "none";
  searchType              = "";
  window.scrollTo({ top: 0, behavior: "smooth" });

  carregarDestaques();
};

/* ================================================
   FAVORITOS (localStorage)
   ================================================ */
const getFavoritos = () => {
  let fav = JSON.parse(localStorage.getItem("favoritos")) || [];
  return [...new Set(fav)];
};

const salvarFavoritos = favoritos => {
  localStorage.setItem("favoritos", JSON.stringify(favoritos));
};

window.toggleFavorito = (imdbID, btn) => {
  let favoritos = getFavoritos();
  if (favoritos.includes(imdbID)) {
    favoritos   = favoritos.filter(id => id !== imdbID);
    btn.innerHTML = translations[currentLanguage].addToFavorites;
    btn.classList.remove("is-favorite");
  } else {
    favoritos.push(imdbID);
    btn.innerHTML = translations[currentLanguage].removeFromFavorites;
    btn.classList.add("is-favorite");
  }
  salvarFavoritos(favoritos);
};

/* ================================================
   MODAL DE FAVORITOS
   ================================================ */
const mostrarFavoritos = () => {
  const favoritos     = getFavoritos();
  const favoritesList = document.getElementById("favoritesList");
  favoritesList.innerHTML = "";

  if (favoritos.length === 0) {
    favoritesList.innerHTML = `
      <p style="text-align:center;">
        <i class="fa-solid fa-exclamation-circle"></i>
        ${translations[currentLanguage].noFavorites}
      </p>`;
  } else {
    favoritos.forEach(imdbID => {
      fetch(`${omdbEndpoint}?type=i&value=${imdbID}`)
        .then(res => res.json())
        .then(filme => {
          const div = document.createElement("div");
          div.className = "favorite-item";
          div.innerHTML = `
            <span><i class="fa-solid fa-film"></i> ${filme.Title} (${filme.Year})</span>
            <div>
              <button onclick="carregarDetalhes('${filme.imdbID}'); fecharFavoritos()">
                ${translations[currentLanguage].viewDetails}
              </button>
              <button onclick="removerFavorito('${filme.imdbID}')">
                ${translations[currentLanguage].remove}
              </button>
            </div>`;
          favoritesList.appendChild(div);
        });
    });
  }
  document.getElementById("favoritesModal").style.display = "flex";
};

window.removerFavorito = imdbID => {
  let favoritos = getFavoritos();
  favoritos     = favoritos.filter(id => id !== imdbID);
  salvarFavoritos(favoritos);
  mostrarFavoritos();
  if (currentMovieDetailId === imdbID) {
    const favBtn = document.getElementById("favToggleButton");
    if (favBtn) favBtn.innerHTML = translations[currentLanguage].addToFavorites;
  }
};

const fecharFavoritos = () => {
  document.getElementById("favoritesModal").style.display = "none";
};

/* ================================================
   RECOMENDAÇÕES VIA IA (API ou WebLLM, conforme escolha do usuário)
   ================================================ */
/* ================================================
   RECOMENDAÇÃO POR IA — RAG-lite
   Em vez de pedir pro modelo "listar filmes de memória" (o que ele às
   vezes inventa, e que o passo seguinte de busca por título silenciosamente
   descartava quando não batia com nada no OMDB), o fluxo agora é:

     1) IA extrai critérios estruturados do pedido em texto livre
        (gêneros de uma lista fixa, ano, "parecido com X"...)
     2) Esses critérios buscam candidatos REAIS no catálogo da TMDB
        (discover / recommendations) — a IA não inventa mais títulos
     3) Cada candidato é resolvido pro ID do IMDb e then pro OMDB, pra
        reaproveitar a mesma página de detalhes/renderização de sempre

   Funciona igual nos dois motores (WebLLM local ou API na nuvem), já
   que a extração usa a mesma função callLLM() das duas. Se a TMDB não
   estiver configurada (tmdb.php sem chave), cai automaticamente no
   comportamento antigo (recomendarFilmesFallbackLLM).
   ================================================ */

function parseCriteriaJSON(raw) {
  const fallback = { media_type: "movie", genres: [], year_from: null, year_to: null, sort: "popularity", similar_to: "" };
  if (!raw) return fallback;

  // O modelo às vezes envolve o JSON em markdown ou frases — pega só o primeiro bloco { ... }
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return fallback;

  try {
    const parsed = JSON.parse(match[0]);
    return {
      media_type: ["movie", "tv", "any"].includes(parsed.media_type) ? parsed.media_type : "movie",
      genres:     Array.isArray(parsed.genres) ? parsed.genres.filter(g => typeof g === "string") : [],
      year_from:  Number.isFinite(parsed.year_from) ? parsed.year_from : null,
      year_to:    Number.isFinite(parsed.year_to)   ? parsed.year_to   : null,
      sort:       parsed.sort === "rating" ? "rating" : "popularity",
      similar_to: typeof parsed.similar_to === "string" ? parsed.similar_to.trim() : ""
    };
  } catch (e) {
    console.warn("Não consegui interpretar os critérios da IA, usando padrão:", e);
    return fallback;
  }
}

async function extractSearchCriteria(promptText) {
  const movieGenreNames = Object.keys(TMDB_GENRES_MOVIE).join(", ");
  const tvGenreNames    = Object.keys(TMDB_GENRES_TV).join(", ");
  const currentYear     = new Date().getFullYear();

  const systemMsg =
    "You extract structured search criteria from a movie/show request. " +
    "Reply with ONLY a single-line JSON object — no markdown, no code fences, no explanation, nothing before or after it. " +
    'Schema: {"media_type":"movie|tv|any","genres":["..."],"year_from":number|null,"year_to":number|null,"sort":"popularity|rating","similar_to":"title or empty string"}. ' +
    `Valid movie genres: ${movieGenreNames}. Valid tv genres: ${tvGenreNames}. ` +
    "Pick genres ONLY from those lists (choose the closest match). " +
    'If the user wants something "like"/"similar to" one specific named movie or show, put its title in "similar_to" and leave "genres" empty. ' +
    `If no year constraint is implied, use null for year_from/year_to. Current year is ${currentYear}. ` +
    'Example — request: "funny 90s movies" → {"media_type":"movie","genres":["Comedy"],"year_from":1990,"year_to":1999,"sort":"popularity","similar_to":""}';

  const raw = await callLLM(
    [
      { role: "system", content: systemMsg },
      { role: "user",   content: promptText }
    ],
    150
  );

  return parseCriteriaJSON(raw);
}

function mapGenresToIds(genreNames, mediaType) {
  const table = mediaType === "tv" ? TMDB_GENRES_TV : TMDB_GENRES_MOVIE;
  const lowerTable = {};
  Object.keys(table).forEach(k => { lowerTable[k.toLowerCase()] = table[k]; });

  const ids = [];
  (genreNames || []).forEach(name => {
    const id = lowerTable[String(name).toLowerCase().trim()];
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
}

async function fetchCandidatesFromTMDB(criteria) {
  const allResults = [];

  // Caminho "parecido com X": resolve o título pra um item real e usa /recommendations
  const mediaGuess = criteria.media_type === "tv" ? "tv" : "movie";
  if (criteria.similar_to) {
    try {
      const searchRes  = await fetch(`${tmdbEndpoint}?type=search&value=${encodeURIComponent(criteria.similar_to)}&media=${mediaGuess}`);
      const searchJson = await searchRes.json();
      const best = searchJson?.results?.[0];
      if (best?.id) {
        const recRes  = await fetch(`${tmdbEndpoint}?type=recommendations&value=${best.id}&media=${mediaGuess}`);
        const recJson = await recRes.json();
        (recJson?.results || []).forEach(r => allResults.push({ ...r, __media: mediaGuess }));
        if (allResults.length >= recommendationCount) return allResults;
        // veio pouca coisa — não descarta, complementa com o discover por gênero abaixo
      }
    } catch (e) {
      console.warn("Falha ao buscar recomendações 'parecido com'", e);
    }
  }

  // Caminho normal: catálogo real filtrado por gênero/ano/nota
  const mediaTypes = criteria.media_type === "any" ? ["movie", "tv"] : [criteria.media_type];

  for (const media of mediaTypes) {
    const genreIds = mapGenresToIds(criteria.genres, media);
    const params = new URLSearchParams({ media, sort: criteria.sort });
    if (genreIds.length)    params.set("genres", genreIds.join(","));
    if (criteria.year_from) params.set("year_from", criteria.year_from);
    if (criteria.year_to)   params.set("year_to", criteria.year_to);

    try {
      const res  = await fetch(`${tmdbEndpoint}?type=discover&${params.toString()}`);
      const json = await res.json();
      if (Array.isArray(json?.results)) {
        json.results.forEach(r => {
          if (!allResults.some(x => x.id === r.id && x.__media === media)) {
            allResults.push({ ...r, __media: media });
          }
        });
      }
    } catch (e) {
      console.warn("Falha no discover TMDB (" + media + ")", e);
    }
  }

  // Ainda rendeu pouca coisa (gênero raro / ano muito restritivo) → relaxa e completa,
  // até ter o suficiente pra cobrir a quantidade configurada nas Configurações
  if (allResults.length < recommendationCount) {
    for (const media of mediaTypes) {
      try {
        const res  = await fetch(`${tmdbEndpoint}?type=discover&media=${media}&sort=popularity`);
        const json = await res.json();
        if (Array.isArray(json?.results)) {
          json.results.forEach(r => {
            if (!allResults.some(x => x.id === r.id && x.__media === media)) {
              allResults.push({ ...r, __media: media });
            }
          });
        }
      } catch (e) { /* melhor-esforço — se falhar aqui, segue com o que já tem */ }
    }
  }

  return allResults;
}

function resetListaParaRecomendacoes() {
  lista.innerHTML         = "";
  detalhes.style.display  = "none";
  document.body.classList.remove("detail-view");
  erro.style.display      = "none";
  navegacao.style.display = "none";
  lista.style.display     = "flex";
  const highlightsSection = document.getElementById("highlightsSection");
  if (highlightsSection) highlightsSection.style.display = "none";
}

/* ================================================
   DESTAQUES DA SEMANA — mostrados na página inicial, sem precisar de
   nenhuma pesquisa. Usa o mesmo endpoint "trending" da TMDB; se a TMDB
   não estiver configurada, falha em silêncio e a página segue normal
   (só não mostra a seção, sem quebrar nada). Tem sua própria fileira
   horizontal (sempre uma única linha), separada da grade de resultados
   de pesquisa — visual propositalmente diferente.
   ================================================ */
async function carregarDestaques() {
  // Só faz sentido na tela inicial — se já tem pesquisa/recomendação em
  // andamento, ou o usuário já está vendo detalhes, não mexe em nada.
  if (searchType) return;

  const section = document.getElementById("highlightsSection");
  const row     = document.getElementById("highlightsRow");
  if (!section || !row) return;

  try {
    const res  = await fetch(`${tmdbEndpoint}?type=trending&media=movie&window=week`);
    const json = await res.json();
    const candidatos = Array.isArray(json?.results) ? json.results.slice(0, 10) : [];
    if (!candidatos.length) return; // TMDB indisponível/sem chave — segue sem essa seção

    row.innerHTML       = "";
    section.style.display = "block";

    candidatos.forEach((cand, i) => {
      fetch(`${tmdbEndpoint}?type=resolve&value=${cand.id}&media=movie`)
        .then(r => r.json())
        .then(({ imdb_id }) => {
          if (!imdb_id) return null;
          return fetch(`${omdbEndpoint}?type=i&value=${imdb_id}`).then(r => r.json());
        })
        .then(filme => {
          if (!filme || filme.Response === "False") return;
          // Se o usuário já começou outra pesquisa enquanto isso carregava, não polui a fileira
          if (searchType) return;

          const item = document.createElement("div");
          item.className = "highlight-item";
          item.style.setProperty("--i", i);
          item.innerHTML = `
            ${posterFrame(filme)}
            <span class="highlight-rank" aria-hidden="true">${i + 1}</span>
            <h3>${filme.Title}</h3>`;
          item.onclick = () => carregarDetalhes(filme.imdbID);
          row.appendChild(item);
        })
        .catch(err => console.warn("Erro ao carregar destaque da semana", err));
    });
  } catch (e) {
    console.warn("Destaques da semana indisponíveis (TMDB não configurada?)", e);
  }
}

// Comportamento antigo (IA "solta", sem retrieval) — usado como rede de
// segurança quando a TMDB não está configurada ou não retorna nada.
async function recomendarFilmesFallbackLLM(prompt) {
  const systemPrompt =
    "You are an assistant that recommends films and series based on the description given by the user. " +
    "Reply ONLY with a plain list of film/series titles in English, one per line, no numbering, no explanations, no extra text.";

  const userPrompt = currentLanguage === "pt"
    ? `Recomende ${recommendationCount} filmes ou séries para alguém que quer: ${prompt}`
    : `Recommend ${recommendationCount} films or series for someone who wants: ${prompt}`;

  const raw = await callLLM(
    [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt   }
    ],
    250
  );

  hideLoader();

  const titulos = raw
    .split("\n")
    .map(f => f.replace(/^[\d\-\.\*\s]+/, "").trim())
    .filter(f => f.length > 0);

  resetListaParaRecomendacoes();

  titulos.forEach((titulo, i) => {
    fetch(`${omdbEndpoint}?type=s&value=${encodeURIComponent(titulo)}&page=1`)
      .then(res => res.json())
      .then(json => {
        if (json.Response === "True" && json.Search?.length) {
          const filme = json.Search[0];
          const item  = document.createElement("div");
          item.className = "item";
          item.style.setProperty("--i", i);
          const tituloEscapado = filme.Title.replace(/'/g, "\\'");
          item.innerHTML = `
            ${posterFrame(filme)}
            <h2 class="recTitle" onclick="carregarDetalhes('${filme.imdbID}')">
              ${filme.Title}
            </h2>
            <button onclick="pesquisarSimilares('${tituloEscapado}')">
              ${translations[currentLanguage].searchSimilar}
            </button>`;
          lista.appendChild(item);
        }
      })
      .catch(err => console.error("Erro ao buscar OMDb para " + titulo, err));
  });

  scrollToMovies();
}

const recomendarFilmes = async prompt => {

  // Verifica se o modelo local já carregou (só se aplica ao modo WebLLM)
  if (aiEngineMode === "webllm") {
    if (llmLoading) {
      showToast(currentLanguage === "pt"
        ? "O modelo de IA ainda está carregando. Aguarde alguns instantes e tente novamente."
        : "The AI model is still loading. Please wait a moment and try again.", "warning");
      return;
    }
    if (llmUnavailable) {
      showToast(currentLanguage === "pt"
        ? "IA local não disponível: seu navegador não suporta WebGPU. Use Chrome ou Edge 113+."
        : "Local AI unavailable: your browser does not support WebGPU. Use Chrome or Edge 113+.", "error");
      return;
    }
  }

  showLoader();

  try {
    // 1) Extrai critérios estruturados do pedido em texto livre
    const criteria = await extractSearchCriteria(prompt);

    // 2) Busca candidatos REAIS no catálogo da TMDB com base nesses critérios
    const candidates = await fetchCandidatesFromTMDB(criteria);

    // 3) TMDB não configurada / indisponível → cai pro comportamento antigo
    if (!candidates.length) {
      await recomendarFilmesFallbackLLM(prompt);
      return;
    }

    // 4) Ordena pelos critérios pedidos e fica só com os N melhores
    //    (N = quantidade configurada nas Configurações, padrão 8)
    if (criteria.sort === "rating") {
      candidates.sort((a, b) =>
        (b.vote_average || 0) * Math.log((b.vote_count || 1) + 1) -
        (a.vote_average || 0) * Math.log((a.vote_count || 1) + 1));
    } else {
      candidates.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    }
    const shortlist = candidates.slice(0, recommendationCount);

    hideLoader();
    resetListaParaRecomendacoes();

    // 5) Cada candidato: resolve TMDB→IMDb e busca os dados completos no OMDB
    //    (reaproveita posterFrame/carregarDetalhes de sempre). Como já são
    //    itens reais, a chance de "sumir" nessa etapa é bem menor que antes.
    shortlist.forEach((cand, i) => {
      fetch(`${tmdbEndpoint}?type=resolve&value=${cand.id}&media=${cand.__media}`)
        .then(res => res.json())
        .then(({ imdb_id }) => {
          if (!imdb_id) return null;
          return fetch(`${omdbEndpoint}?type=i&value=${imdb_id}`).then(res => res.json());
        })
        .then(filme => {
          if (!filme || filme.Response === "False") return;
          const item = document.createElement("div");
          item.className = "item";
          item.style.setProperty("--i", i);
          const tituloEscapado = filme.Title.replace(/'/g, "\\'");
          item.innerHTML = `
            ${posterFrame(filme)}
            <h2 class="recTitle" onclick="carregarDetalhes('${filme.imdbID}')">
              ${filme.Title}
            </h2>
            <button onclick="pesquisarSimilares('${tituloEscapado}')">
              ${translations[currentLanguage].searchSimilar}
            </button>`;
          lista.appendChild(item);
        })
        .catch(err => console.error("Erro ao resolver recomendação TMDB→OMDB", err));
    });

    scrollToMovies();

  } catch (err) {
    hideLoader();
    console.error("Erro IA (recomendarFilmes):", err);
    showToast((currentLanguage === "pt"
      ? "Erro ao obter recomendações: "
      : "Error getting recommendations: ") + err.message, "error");
  }
};

const pesquisarSimilares = titulo => {
  document.querySelector("input[name='pesquisa']").value = titulo;
  termoPesquisa = titulo;
  paginaAtual   = 1;
  buscarFilmes();
};

/* ================================================
   MENUS SUSPENSOS DO CABEÇALHO (Dark/Light, AI Engine, Configurações...)
   Delegação de evento no document — assim cobre também dropdowns criados
   dinamicamente depois (ex.: o seletor de região em "Onde Assistir").
   Trata aninhamento: o painel de Configurações contém Layout/Modo/Estilo
   como sub-dropdowns; abrir um deles não deve fechar o painel pai.
   ================================================ */
document.addEventListener("click", e => {
  // Clicou numa OPÇÃO (dentro de .mode-options): sempre fecha só aquele
  // dropdown específico — nunca alterna. Isso evita a corrida com
  // setLayout/setMode/setStyle, que já fecham o próprio toggle ao
  // aplicar a escolha (senão o toggle "reabria" por engano, porque o
  // clique via delegação via calcular wasOpen=false depois que aquele
  // fechamento explícito já tinha rodado).
  const optionInList = e.target.closest(".mode-options > button");
  if (optionInList) {
    e.stopPropagation();
    const ownToggle = optionInList.closest(".mode-toggle");
    if (ownToggle) ownToggle.classList.remove("open");
    return;
  }

  const toggle = e.target.closest(".mode-toggle");
  if (toggle) {
    e.stopPropagation();
    const wasOpen = toggle.classList.contains("open");
    // fecha todos os outros, exceto ancestrais do que foi clicado
    // (senão, abrir um sub-item fecharia o painel que o contém)
    document.querySelectorAll(".mode-toggle.open").forEach(d => {
      if (d !== toggle && !d.contains(toggle)) d.classList.remove("open");
    });
    toggle.classList.toggle("open", !wasOpen);
    return;
  }
  document.querySelectorAll(".mode-toggle.open").forEach(d => d.classList.remove("open"));
});

// Modo (Escuro/Claro) — controla fundo, superfície e texto base
window.setMode = mode => {
  if (!["dark", "light"].includes(mode)) return;
  document.body.setAttribute("data-mode", mode);
  const icons  = { dark: "fa-moon", light: "fa-sun" };
  const labels = { dark: translations[currentLanguage].modeButtonDark, light: translations[currentLanguage].modeButtonLight };

  modeButton.innerHTML = `<i class="fa-solid ${icons[mode]}"></i> ${labels[mode]} <span class="arrow">▼</span>`;
  modeToggleBtn.classList.remove("open");
  localStorage.setItem("siteMode", mode);
};

// Estilo (Padrão/Vintage/Neon/Arco-íris/Monocromático) — combina com o Modo acima
window.setStyle = style => {
  if (!["default", "vintage", "neon", "rainbow", "mono"].includes(style)) return;
  document.body.setAttribute("data-style", style);
  const icons = { default: "fa-circle", vintage: "fa-clapperboard", neon: "fa-bolt", rainbow: "fa-rainbow", mono: "fa-circle-half-stroke" };
  const t = translations[currentLanguage];
  const labels = { default: t.styleButtonDefault, vintage: t.styleButtonVintage, neon: t.styleButtonNeon, rainbow: t.styleButtonRainbow, mono: t.styleButtonMono };

  styleButton.innerHTML = `<i class="fa-solid ${icons[style]}"></i> ${labels[style]} <span class="arrow">▼</span>`;
  styleToggleBtn.classList.remove("open");
  localStorage.setItem("siteStyle", style);
};

// Quantidade de filmes que a IA recomenda por pesquisa (afeta só o "Recommend Movies")
window.setRecommendationCount = count => {
  count = parseInt(count, 10);
  if (![4, 6, 8, 10, 12].includes(count)) return;
  recommendationCount = count;
  localStorage.setItem("recommendationCount", String(count));

  if (recCountButton) {
    recCountButton.innerHTML = `<i class="fa-solid fa-list-ol"></i> ${translations[currentLanguage].recCountButton}: ${count} <span class="arrow">▼</span>`;
  }
  document.querySelectorAll("#recCountOptions button[data-recopt]").forEach(b =>
    b.classList.toggle("selected", Number(b.dataset.recopt) === count));
  if (recCountToggleBtn) recCountToggleBtn.classList.remove("open");
};

// Restaura o modo e o estilo salvos (padrão: dark + default)
(function restoreTheme() {
  const savedMode  = localStorage.getItem("siteMode")  || "dark";
  const savedStyle = localStorage.getItem("siteStyle") || "default";
  document.body.setAttribute("data-mode", savedMode);
  document.body.setAttribute("data-style", savedStyle);
})();

// Header transparente sobre o hero; ganha fundo sólido ao rolar (estilo Netflix)
(function watchHeaderScroll() {
  const header = document.querySelector("header");
  if (!header) return;
  const update = () => {
    if (window.scrollY > 12) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  };
  window.addEventListener("scroll", update, { passive: true });
  update();
})();

// Mede a altura real do header (varia entre desktop e mobile, onde ele
// empilha em várias linhas) pra grudar a barra de status do WebLLM bem
// coladinha embaixo dele, sem espaço nem sobreposição.
(function trackHeaderHeight() {
  const header = document.querySelector("header");
  if (!header) return;
  const update = () => {
    document.documentElement.style.setProperty("--header-h-live", header.offsetHeight + "px");
  };
  window.addEventListener("resize", update);
  update();
  // Reavalia depois do primeiro layout completo (fontes/ícones carregando
  // podem mudar a altura um pouquinho depois do primeiro cálculo)
  setTimeout(update, 300);
  setTimeout(update, 1200);
})();

// Busca rápida no header: expande um campo de texto ao lado da lupa,
// reaproveitando a mesma busca por título de sempre.
window.toggleQuickSearch = () => {
  const wrap  = document.getElementById("headerSearchWrap");
  const input = document.getElementById("quickSearchInput");
  if (!wrap || !input) return;
  const opening = !wrap.classList.contains("open");
  wrap.classList.toggle("open", opening);
  if (opening) {
    setTimeout(() => input.focus(), 150);
  } else {
    input.value = "";
  }
};

(function wireQuickSearch() {
  const form  = document.getElementById("quickSearchForm");
  const input = document.getElementById("quickSearchInput");
  if (!form || !input) return;

  form.onsubmit = e => {
    e.preventDefault();
    const valor = input.value.trim();
    if (!valor) return;

    const campoPrincipal = document.querySelector("input[name='pesquisa']");
    if (campoPrincipal) campoPrincipal.value = valor; // mantém o formulário da lateral em sincronia

    termoPesquisa = valor;
    paginaAtual   = 1;
    searchType    = "titulo";
    buscarFilmes();

    document.getElementById("headerSearchWrap")?.classList.remove("open");
    input.value = "";
  };
})();

function applyTranslations() {
  const texts = translations[currentLanguage];

  document.querySelector(".header-left a").innerText = texts.headerTitle;
  const currentMode = document.body.getAttribute("data-mode") || "dark";
  const modeIcon    = currentMode === "light" ? "fa-sun" : "fa-moon";
  modeButton.innerHTML = `<i class="fa-solid ${modeIcon}"></i> ${currentMode === "light" ? texts.modeButtonLight : texts.modeButtonDark} <span class="arrow">▼</span>`;

  const modeOptDark  = document.querySelector("#modeOptions button[data-modeopt='dark']");
  const modeOptLight = document.querySelector("#modeOptions button[data-modeopt='light']");
  if (modeOptDark)  modeOptDark.innerHTML  = texts.modeOptionDark;
  if (modeOptLight) modeOptLight.innerHTML = texts.modeOptionLight;

  const currentStyle  = document.body.getAttribute("data-style") || "default";
  const styleIcons    = { default: "fa-circle", vintage: "fa-clapperboard", neon: "fa-bolt", rainbow: "fa-rainbow", mono: "fa-circle-half-stroke" };
  const styleLabelMap = { default: texts.styleButtonDefault, vintage: texts.styleButtonVintage, neon: texts.styleButtonNeon, rainbow: texts.styleButtonRainbow, mono: texts.styleButtonMono };
  if (styleButton) styleButton.innerHTML = `<i class="fa-solid ${styleIcons[currentStyle]}"></i> ${styleLabelMap[currentStyle]} <span class="arrow">▼</span>`;

  const styleOptDefault = document.querySelector("#styleOptions button[data-styleopt='default']");
  const styleOptVintage = document.querySelector("#styleOptions button[data-styleopt='vintage']");
  const styleOptNeon    = document.querySelector("#styleOptions button[data-styleopt='neon']");
  const styleOptRainbow = document.querySelector("#styleOptions button[data-styleopt='rainbow']");
  const styleOptMono    = document.querySelector("#styleOptions button[data-styleopt='mono']");
  if (styleOptDefault) styleOptDefault.innerHTML = texts.styleOptionDefault;
  if (styleOptVintage) styleOptVintage.innerHTML = texts.styleOptionVintage;
  if (styleOptNeon)    styleOptNeon.innerHTML    = texts.styleOptionNeon;
  if (styleOptRainbow) styleOptRainbow.innerHTML = texts.styleOptionRainbow;
  if (styleOptMono)    styleOptMono.innerHTML    = texts.styleOptionMono;

  // Quantidade de filmes que a IA recomenda por pesquisa
  if (recCountButton) {
    recCountButton.innerHTML = `<i class="fa-solid fa-list-ol"></i> ${texts.recCountButton}: ${recommendationCount} <span class="arrow">▼</span>`;
  }
  const recOptLabels = { 4: texts.recCountQuick, 8: texts.recCountDefault, 12: texts.recCountMore };
  document.querySelectorAll("#recCountOptions button[data-recopt]").forEach(b => {
    const n = Number(b.dataset.recopt);
    b.textContent = recOptLabels[n] ? `${n} — ${recOptLabels[n]}` : String(n);
    b.classList.toggle("selected", n === recommendationCount);
  });

  document.querySelector("button.favorites").innerHTML = `<i class="fa-solid fa-star"></i> ${texts.favorites}`;

  const highlightsHeading = document.querySelector("#highlightsSection .highlights-heading");
  if (highlightsHeading) highlightsHeading.innerHTML = `<i class="fa-solid fa-fire"></i> ${texts.weeklyHighlights}`;

  const langToggle = document.getElementById("langToggleButton");
  langToggle.innerHTML = `<i class="fa-solid fa-language"></i> Language: ${currentLanguage === "en" ? "English" : "Português"}`;

  // Botão do motor de IA + textos do modal "AI Engine Settings"
  updateAIEngineButtonLabel();
  updateStatusBarForMode();

  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const setHtml = (id, value) => { const el = document.getElementById(id); if (el) el.innerHTML = value; };

  setText("aiSettingsTitle",         texts.aiSettingsTitle);
  setText("engineCardWebllmTitle",   texts.aiEngineCardWebllmTitle);
  setText("engineDescWebllm",        texts.aiEngineCardWebllmDesc);
  setText("engineCardApiTitle",      texts.aiEngineCardApiTitle);
  setText("engineDescApi",           texts.aiEngineCardApiDesc);
  setText("lblWebllmModel",          texts.aiLabelWebllmModel);
  setText("webllmModelHint",         texts.aiWebllmModelHint);
  setText("lblApiProvider",          texts.aiLabelProvider);
  setText("lblApiModel",             texts.aiLabelModel);
  setText("lblApiEndpoint",          texts.aiLabelEndpoint);
  setText("lblApiKey",               texts.aiLabelApiKey);
  setText("apiKeyHint",              texts.aiApiKeyHint);
  setHtml("btnSaveAiSettings",       texts.aiSaveButton);

  // Se o modal estiver aberto, re-renderiza as opções de modelo (rótulo "Outro/Other…")
  if (document.getElementById("aiSettingsModal")?.style.display === "flex") {
    renderApiModelOptions(stagingApiProvider);
    syncModalUIFromStaging();
  }

  // Menu de seleção de layout
  updateLayoutButtonLabel();
  const layoutOptDuo      = document.querySelector("#layoutOptions button[data-layoutopt='duo']");
  const layoutOptPremiere = document.querySelector("#layoutOptions button[data-layoutopt='premiere']");
  const layoutOptSidebar  = document.querySelector("#layoutOptions button[data-layoutopt='sidebar']");
  const layoutOptRow      = document.querySelector("#layoutOptions button[data-layoutopt='row']");
  if (layoutOptDuo)      layoutOptDuo.innerHTML      = texts.layoutOptionDuo;
  if (layoutOptPremiere) layoutOptPremiere.innerHTML = texts.layoutOptionPremiere;
  if (layoutOptSidebar)  layoutOptSidebar.innerHTML  = texts.layoutOptionSidebar;
  if (layoutOptRow)      layoutOptRow.innerHTML      = texts.layoutOptionRow;

  const intro = document.querySelector(".intro-text");
  if (intro) {
    intro.innerHTML = texts.introText + `<span class="help-icon"></span>
      <div class="help-tooltip">${texts.helpTooltip}</div>`;
  }

  const expl = document.querySelectorAll(".input-explanation span");
  if (expl.length >= 2) {
    expl[0].innerText = texts.searchExplanation;
    expl[1].innerText = texts.recommendationExplanation;
  }

  const searchColTitleHeading = document.querySelector(".search-col-title .search-col-heading");
  const searchColAiHeading    = document.querySelector(".search-col-ai .search-col-heading");
  if (searchColTitleHeading) searchColTitleHeading.innerText = texts.searchColTitleHeading;
  if (searchColAiHeading)    searchColAiHeading.innerText    = texts.searchColAiHeading;

  const pInput  = document.querySelector("form#pesquisaForm input[name='pesquisa']");
  const pButton = document.querySelector("form#pesquisaForm button");
  if (pInput)  pInput.placeholder = texts.searchPlaceholder;
  if (pButton) pButton.innerHTML  = texts.searchButton;

  const quickInput = document.getElementById("quickSearchInput");
  if (quickInput) quickInput.placeholder = texts.searchPlaceholder;
  const quickBtn = document.getElementById("quickSearchBtn");
  if (quickBtn) quickBtn.title = texts.searchButton.replace(/<[^>]*>/g, "").trim();
  const settingsBtn = document.getElementById("settingsButton");
  if (settingsBtn) settingsBtn.title = texts.settingsButtonTitle;

  const iaInput  = document.querySelector("form#iaForm input[name='prompt']");
  const iaButton = document.querySelector("form#iaForm button");
  if (iaInput)  iaInput.placeholder = texts.recommendationPlaceholder;
  if (iaButton) iaButton.innerHTML  = texts.recommendationButton;

  const errMsg = document.querySelector(".erro h2");
  if (errMsg) errMsg.innerText = texts.errorMessage;

  document.querySelectorAll(".botoes button").forEach(btn => {
    if (btn.classList.contains("voltarInicial"))  btn.innerHTML = texts.backToHome;
  });
  const backBtn = document.querySelector(".detalhes-back");
  if (backBtn) backBtn.title = texts.backToSearch.replace(/<[^>]*>/g, "");

  if (detalhes.style.display === "block") updateFilmDetails();
  if (document.getElementById("favoritesModal").style.display === "flex") mostrarFavoritos();
}

window.toggleLanguage = () => {
  currentLanguage = currentLanguage === "en" ? "pt" : "en";
  applyTranslations();
};

window.voltarPaginaInicial  = voltarPaginaInicial;
window.voltarParaPesquisa   = voltarParaPesquisa;
window.carregarDetalhes     = carregarDetalhes;
window.mostrarFavoritos     = mostrarFavoritos;
window.fecharFavoritos      = fecharFavoritos;
window.pesquisarSimilares   = pesquisarSimilares;

applyTranslations();
carregarDestaques();
