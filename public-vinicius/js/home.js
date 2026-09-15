/**
 * home.js — PÁGINA INICIAL (index.php)
 *
 *   • Busca por título (OMDb) com paginação — a pesquisa fica na URL
 *     (index.php?q=...&page=...), então "voltar" da página do filme
 *     mostra os mesmos resultados.
 *   • Recomendações por IA (RAG-lite com a TMDB) — a última lista fica
 *     guardada na sessão do navegador (index.php?rec=1).
 *   • Destaques da Semana (TMDB trending).
 *
 * Clicar em um filme abre a página dele: filme.php?id=<imdbID>.
 */
import { t, isPt, onLanguageChange, refreshTranslations } from "./i18n.js";
import { initCommon, getRecommendationCount, movieUrl } from "./common.js";
import { callLLM, assertAiUsable } from "./ai.js";
import { showToast, showLoader, hideLoader, posterFrame, scrollElByPage } from "./ui.js";
import { omdbJson, tmdbJson } from "./api.js";

/* ================================================
   GÊNEROS DA TMDB (lista fixa e estável). Usada para "aterrar" a IA: em
   vez de deixar o modelo inventar filmes de memória, ele escolhe gêneros
   dessa lista e a busca real acontece no catálogo da TMDB (RAG-lite).
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
   ESTADO E ELEMENTOS
   ================================================ */
let termoPesquisa     = "";
let paginaAtual       = 1;
let totalResultados   = 0;
let searchType        = ""; // "" (início) | "titulo" | "recomendacao"
const filmesPorPagina = 10;

const REC_STORAGE_KEY = "lastRecommendations";
let recSession = null; // { prompt, items: [{ imdbID, Title, Poster, rank }] }

const frmPesquisa       = document.getElementById("pesquisaForm");
const frmIA             = document.getElementById("iaForm");
const inputPesquisa     = frmPesquisa.querySelector("input[name='pesquisa']");
const inputPrompt       = frmIA.querySelector("input[name='prompt']");
const lista             = document.querySelector("div.lista");
const posterRowWrap     = document.getElementById("posterRowWrap");
const erro              = document.querySelector("div.erro");
const navegacao         = document.querySelector("div.navegacao");
const highlightsSection = document.getElementById("highlightsSection");
const highlightsRow     = document.getElementById("highlightsRow");

/* Mantém a pesquisa atual na URL, sem criar entradas novas no histórico */
function setPageUrl(params = {}) {
  const query = new URLSearchParams(params).toString();
  history.replaceState(null, "", query ? `index.php?${query}` : "index.php");
}

function scrollToMovies() {
  if (lista) lista.scrollIntoView({ behavior: "smooth" });
}

const esconderDestaques = () => { highlightsSection.style.display = "none"; };

/* ================================================
   SETAS DO POSTER ROW
   Só aparecem quando a lista realmente tem filmes para rolar — antes elas
   ficavam visíveis com a lista vazia (abaixo dos Destaques da Semana e no
   topo da página de detalhes).
   ================================================ */
function updatePosterRowArrows() {
  const hasOverflow = lista.style.display !== "none"
    && lista.children.length > 0
    && lista.scrollWidth - lista.clientWidth > 1;
  posterRowWrap.classList.toggle("has-overflow", hasOverflow);
}

new MutationObserver(updatePosterRowArrows).observe(lista, { childList: true, attributes: true, attributeFilter: ["style"] });
window.addEventListener("resize", updatePosterRowArrows);
document.addEventListener("layout:changed", updatePosterRowArrows);

window.scrollListaPrev      = () => scrollElByPage(lista, -1);
window.scrollListaNext      = () => scrollElByPage(lista, 1);
window.scrollHighlightsPrev = () => scrollElByPage(highlightsRow, -1);
window.scrollHighlightsNext = () => scrollElByPage(highlightsRow, 1);

/* ================================================
   EVENTOS DOS FORMULÁRIOS
   ================================================ */
frmPesquisa.onsubmit = e => {
  e.preventDefault();
  pesquisarTitulo(inputPesquisa.value);
};

frmIA.onsubmit = e => {
  e.preventDefault();
  recomendarFilmes(inputPrompt.value);
};

function pesquisarTitulo(titulo) {
  inputPesquisa.value = titulo;
  termoPesquisa = titulo.trim();
  paginaAtual   = 1;
  buscarFilmes();
}

/* ================================================
   BUSCA DE FILMES (OMDb via PHP)
   ================================================ */
const buscarFilmes = () => {
  if (!termoPesquisa) return;
  searchType = "titulo";
  setPageUrl(paginaAtual > 1 ? { q: termoPesquisa, page: paginaAtual } : { q: termoPesquisa });

  showLoader();
  omdbJson({ type: "s", value: termoPesquisa, page: paginaAtual })
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
  erro.style.display      = "none";
  navegacao.style.display = "none";
  esconderDestaques();

  if (json.Response === "False") { exibirErro(); return; }

  totalResultados     = parseInt(json.totalResults, 10);
  lista.style.display = "flex";

  json.Search.forEach((filme, i) => {
    const item = document.createElement("div");
    item.className = "item";
    item.style.setProperty("--i", i);
    item.innerHTML = `${posterFrame(filme)}<h2>${filme.Title}</h2>`;
    item.onclick   = () => { location.href = movieUrl(filme.imdbID); };
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
   ERRO / VOLTAR AO INÍCIO
   ================================================ */
const exibirErro = () => {
  lista.innerHTML         = "";
  erro.style.display      = "block";
  navegacao.style.display = "none";
  esconderDestaques();
};

const voltarPaginaInicial = () => {
  inputPesquisa.value = "";
  inputPrompt.value   = "";

  lista.innerHTML         = "";
  erro.style.display      = "none";
  navegacao.style.display = "none";
  searchType              = "";
  termoPesquisa           = "";
  recSession              = null;
  try { sessionStorage.removeItem(REC_STORAGE_KEY); } catch {}
  setPageUrl();
  window.scrollTo({ top: 0, behavior: "smooth" });

  carregarDestaques();
};
window.voltarPaginaInicial = voltarPaginaInicial;

/* ================================================
   DESTAQUES DA SEMANA — mostrados na página inicial, sem precisar de
   nenhuma pesquisa (TMDB trending). Se a TMDB não estiver configurada,
   falha em silêncio e a seção simplesmente não aparece.
   ================================================ */
async function carregarDestaques() {
  // Só faz sentido na tela inicial — se já tem pesquisa/recomendação, não mexe
  if (searchType) return;

  try {
    const json = await tmdbJson({ type: "trending", media: "movie", window: "week" });
    const candidatos = Array.isArray(json?.results) ? json.results.slice(0, 10) : [];
    if (!candidatos.length || searchType) return; // TMDB indisponível/sem chave — segue sem essa seção

    highlightsRow.innerHTML         = "";
    highlightsSection.style.display = "block";

    candidatos.forEach((cand, i) => {
      tmdbJson({ type: "resolve", value: cand.id, media: "movie" })
        .then(({ imdb_id }) => imdb_id ? omdbJson({ type: "i", value: imdb_id }) : null)
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
          item.onclick = () => { location.href = movieUrl(filme.imdbID); };
          highlightsRow.appendChild(item);
        })
        .catch(err => console.warn("Erro ao carregar destaque da semana", err));
    });
  } catch (e) {
    console.warn("Destaques da semana indisponíveis (TMDB não configurada?)", e);
  }
}

/* ================================================
   RECOMENDAÇÃO POR IA — RAG-lite
     1) IA extrai critérios estruturados do pedido em texto livre
        (gêneros de uma lista fixa, ano, "parecido com X"...)
     2) Esses critérios buscam candidatos REAIS no catálogo da TMDB
     3) Cada candidato é resolvido pro ID do IMDb e depois pro OMDB
   Se a TMDB não estiver configurada, cai no comportamento antigo
   (recomendarFilmesFallbackLLM).
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
  const wanted     = getRecommendationCount();

  const addResults = (results, media) => {
    (results || []).forEach(r => {
      if (!allResults.some(x => x.id === r.id && x.__media === media)) {
        allResults.push({ ...r, __media: media });
      }
    });
  };

  // Caminho "parecido com X": resolve o título pra um item real e usa /recommendations
  const mediaGuess = criteria.media_type === "tv" ? "tv" : "movie";
  if (criteria.similar_to) {
    try {
      const searchJson = await tmdbJson({ type: "search", value: criteria.similar_to, media: mediaGuess });
      const best = searchJson?.results?.[0];
      if (best?.id) {
        const recJson = await tmdbJson({ type: "recommendations", value: best.id, media: mediaGuess });
        addResults(recJson?.results, mediaGuess);
        if (allResults.length >= wanted) return allResults;
        // veio pouca coisa — complementa com o discover por gênero abaixo
      }
    } catch (e) {
      console.warn("Falha ao buscar recomendações 'parecido com'", e);
    }
  }

  // Caminho normal: catálogo real filtrado por gênero/ano/nota
  const mediaTypes = criteria.media_type === "any" ? ["movie", "tv"] : [criteria.media_type];

  for (const media of mediaTypes) {
    const genreIds = mapGenresToIds(criteria.genres, media);
    try {
      const json = await tmdbJson({
        type: "discover",
        media,
        sort:      criteria.sort,
        genres:    genreIds.join(","),
        year_from: criteria.year_from,
        year_to:   criteria.year_to
      });
      if (Array.isArray(json?.results)) addResults(json.results, media);
    } catch (e) {
      console.warn("Falha no discover TMDB (" + media + ")", e);
    }
  }

  // Ainda rendeu pouca coisa (gênero raro / ano muito restritivo) → relaxa e completa
  if (allResults.length < wanted) {
    for (const media of mediaTypes) {
      try {
        const json = await tmdbJson({ type: "discover", media, sort: "popularity" });
        if (Array.isArray(json?.results)) addResults(json.results, media);
      } catch (e) { /* melhor-esforço — se falhar aqui, segue com o que já tem */ }
    }
  }

  return allResults;
}

function resetListaParaRecomendacoes() {
  lista.innerHTML         = "";
  erro.style.display      = "none";
  navegacao.style.display = "none";
  lista.style.display     = "flex";
  esconderDestaques();
}

/* --- Última lista de recomendações, guardada na sessão do navegador --- */
function startRecSession(prompt) {
  recSession = { prompt, items: [] };
  saveRecSession();
  setPageUrl({ rec: 1 });
}

function saveRecSession() {
  try { sessionStorage.setItem(REC_STORAGE_KEY, JSON.stringify(recSession)); } catch {}
}

function restoreRecSession() {
  let data = null;
  try { data = JSON.parse(sessionStorage.getItem(REC_STORAGE_KEY)); } catch {}
  if (!data || !Array.isArray(data.items) || !data.items.length) return false;

  searchType        = "recomendacao";
  recSession        = data;
  inputPrompt.value = data.prompt || "";
  resetListaParaRecomendacoes();
  data.items.forEach(filme => renderRecommendationCard(filme, filme.rank));
  scrollToMovies();
  return true;
}

/* Card de recomendação — inserido na posição do ranking, mesmo que as
   respostas cheguem fora de ordem */
function renderRecommendationCard(filme, rank) {
  const item = document.createElement("div");
  item.className = "item";
  item.dataset.rank = rank;
  item.dataset.imdb = filme.imdbID;
  item.style.setProperty("--i", rank);
  item.innerHTML = `
    ${posterFrame(filme)}
    <h2 class="recTitle">${filme.Title}</h2>
    <button type="button" class="search-similar-btn">${t().searchSimilar}</button>`;
  item.querySelector(".recTitle").onclick = () => { location.href = movieUrl(filme.imdbID); };
  item.querySelector(".search-similar-btn").onclick = () => pesquisarTitulo(filme.Title);

  const next = [...lista.children].find(el => Number(el.dataset.rank) > rank);
  lista.insertBefore(item, next || null);
}

function addRecommendation(filme, rank) {
  if (lista.querySelector(`[data-imdb="${filme.imdbID}"]`)) return;
  renderRecommendationCard(filme, rank);
  if (recSession) {
    recSession.items.push({ imdbID: filme.imdbID, Title: filme.Title, Poster: filme.Poster, rank });
    saveRecSession();
  }
}

// Comportamento antigo (IA "solta", sem retrieval) — usado como rede de
// segurança quando a TMDB não está configurada ou não retorna nada.
async function recomendarFilmesFallbackLLM(prompt) {
  const count = getRecommendationCount();
  const systemPrompt =
    "You are an assistant that recommends films and series based on the description given by the user. " +
    "Reply ONLY with a plain list of film/series titles in English, one per line, no numbering, no explanations, no extra text.";

  const userPrompt = isPt()
    ? `Recomende ${count} filmes ou séries para alguém que quer: ${prompt}`
    : `Recommend ${count} films or series for someone who wants: ${prompt}`;

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
  startRecSession(prompt);

  titulos.forEach((titulo, i) => {
    omdbJson({ type: "s", value: titulo, page: 1 })
      .then(json => {
        if (json.Response === "True" && json.Search?.length) addRecommendation(json.Search[0], i);
      })
      .catch(err => console.error("Erro ao buscar OMDb para " + titulo, err));
  });

  scrollToMovies();
}

const recomendarFilmes = async prompt => {
  prompt = (prompt || "").trim();
  if (!prompt) return;
  if (!assertAiUsable()) return;

  searchType = "recomendacao";
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
    if (criteria.sort === "rating") {
      candidates.sort((a, b) =>
        (b.vote_average || 0) * Math.log((b.vote_count || 1) + 1) -
        (a.vote_average || 0) * Math.log((a.vote_count || 1) + 1));
    } else {
      candidates.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    }
    const shortlist = candidates.slice(0, getRecommendationCount());

    hideLoader();
    resetListaParaRecomendacoes();
    startRecSession(prompt);

    // 5) Cada candidato: resolve TMDB→IMDb e busca os dados completos no OMDB
    shortlist.forEach((cand, i) => {
      tmdbJson({ type: "resolve", value: cand.id, media: cand.__media })
        .then(({ imdb_id }) => imdb_id ? omdbJson({ type: "i", value: imdb_id }) : null)
        .then(filme => {
          if (!filme || filme.Response === "False") return;
          addRecommendation(filme, i);
        })
        .catch(err => console.error("Erro ao resolver recomendação TMDB→OMDB", err));
    });

    scrollToMovies();

  } catch (err) {
    hideLoader();
    console.error("Erro IA (recomendarFilmes):", err);
    showToast((isPt() ? "Erro ao obter recomendações: " : "Error getting recommendations: ") + err.message, "error");
  }
};

/* ================================================
   TEXTOS (idioma)
   ================================================ */
onLanguageChange(() => {
  const texts = t();

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

  inputPesquisa.placeholder = texts.searchPlaceholder;
  frmPesquisa.querySelector("button").innerHTML = texts.searchButton;
  inputPrompt.placeholder = texts.recommendationPlaceholder;
  frmIA.querySelector("button").innerHTML = texts.recommendationButton;

  const highlightsHeading = highlightsSection.querySelector(".highlights-heading");
  if (highlightsHeading) highlightsHeading.innerHTML = `<i class="fa-solid fa-fire"></i> ${texts.weeklyHighlights}`;

  lista.querySelectorAll(".search-similar-btn").forEach(btn => { btn.innerHTML = texts.searchSimilar; });

  const errMsg = erro.querySelector("h2");
  if (errMsg) errMsg.innerText = texts.errorMessage;
  const errBtn = erro.querySelector("button");
  if (errBtn) errBtn.innerHTML = texts.backToHome;
});

/* ================================================
   INICIALIZAÇÃO
   ================================================ */
initCommon({
  onQuickSearch: pesquisarTitulo,
  onHomeLink:    voltarPaginaInicial,
  eagerAi:       true
});
refreshTranslations();

// Chaves de API alteradas em "Adicionar APIs": tenta de novo os destaques
document.addEventListener("apikeys:changed", () => carregarDestaques());

(function restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const q      = (params.get("q") || "").trim();

  if (q) {
    inputPesquisa.value = q;
    termoPesquisa = q;
    paginaAtual   = Math.max(1, parseInt(params.get("page"), 10) || 1);
    buscarFilmes();
    return;
  }

  if (params.has("rec") && restoreRecSession()) return;

  if (params.has("rec")) setPageUrl();
  carregarDestaques();
})();
