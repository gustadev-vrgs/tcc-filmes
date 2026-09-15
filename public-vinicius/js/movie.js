/**
 * movie.js — PÁGINA DO FILME/SÉRIE (filme.php?id=<imdbID>)
 *
 *   • NOTAS (IMDb, Rotten Tomatoes, Metacritic) — já vêm na resposta do omdb.php.
 *   • TRAILER — vídeos oficiais do TMDB; se não houver, YouTube Data API
 *     (youtube.php) como reforço; se nada for encontrado, link de busca.
 *   • ONDE ASSISTIR + ELENCO (com fotos) — TMDB (dados do JustWatch).
 *   • ABAS — Sinopse / Elenco / Detalhes (ficha técnica do omdb.php).
 *   • RESUMO POR IA e FAVORITOS.
 */
import { t, isPt, onLanguageChange, refreshTranslations } from "./i18n.js";
import { initCommon } from "./common.js";
import { callLLM, assertAiUsable } from "./ai.js";
import { showToast, showLoader, hideLoader, posterFrame, typeWriter, renderCustomSelect } from "./ui.js";
import { getFavoritos, salvarFavoritos } from "./storage.js";
import { omdbJson, tmdbFetch, youtubeFetch } from "./api.js";

const detalhes = document.querySelector("div.detalhes");
const erro     = document.querySelector("div.erro");

const imdbIdFromUrl = (() => {
  const id = (new URLSearchParams(location.search).get("id") || "").trim();
  return /^tt\d+$/.test(id) ? id : null;
})();

let currentMovieDetail = null;

/* ================================================
   ERRO
   ================================================ */
function exibirErro() {
  currentMovieDetail     = null;
  detalhes.style.display = "none";
  erro.style.display     = "block";
}

/* ================================================
   NOTAS (IMDb, Rotten Tomatoes, Metacritic)
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
   TRAILER
   ================================================ */
// Cache do resultado já resolvido em segundo plano (por carregarExtrasTmdb)
let currentTrailerVideoId     = null; // string (YouTube video id) ou null (sem trailer no TMDB)
let currentTrailerResolvedFor = null; // imdbID para o qual o cache acima é válido

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

// Encontra o item do TMDB correspondente ao filme (find por ID do IMDb)
async function encontrarNoTmdb(filme) {
  const findRes  = await tmdbFetch({ type: "find", value: filme.imdbID });
  const findData = await findRes.json();
  if (!findRes.ok || findData.error) throw new Error(findData.error || "TMDB find failed");

  const isSeries = (filme.Type || "").toLowerCase() === "series";
  const results  = isSeries ? findData.tv_results : findData.movie_results;
  if (!results || !results.length) return null;
  return { tmdbId: results[0].id, media: isSeries ? "tv" : "movie" };
}

// Resolve o trailer do zero via TMDB (find -> videos). Usado como
// fallback quando o cache de carregarExtrasTmdb ainda não está pronto.
async function buscarTrailerTmdb(filme) {
  const found = await encontrarNoTmdb(filme);
  if (!found) return null;

  const vidRes  = await tmdbFetch({ type: "videos", value: found.tmdbId, media: found.media });
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

  const wrap = document.getElementById("trailerFrameWrap");

  // Já resolvido em segundo plano (ao abrir a página) e com sucesso?
  if (currentTrailerResolvedFor === filme.imdbID && currentTrailerVideoId) {
    if (wrap) wrap.innerHTML = montarIframeTrailer(currentTrailerVideoId, filme.Title);
    return;
  }

  if (wrap) wrap.innerHTML = `<div class="trailer-loading"><i class="fa-solid fa-spinner fa-spin"></i> ${t().loadingTrailer}</div>`;

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
      const res  = await youtubeFetch({ q: query });
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

  // O usuário pode ter fechado o modal enquanto buscava
  if (!currentMovieDetail || currentMovieDetail.imdbID !== filme.imdbID) return;
  const wrapNow = document.getElementById("trailerFrameWrap");
  if (!wrapNow || document.getElementById("trailerModal")?.style.display !== "flex") return;

  if (videoId) {
    wrapNow.innerHTML = montarIframeTrailer(videoId, filme.Title);
  } else {
    renderTrailerFallback(query, lastError);
  }
};

// Link para pesquisar manualmente no YouTube, junto com o motivo real (se houver)
function renderTrailerFallback(query, err) {
  const wrap = document.getElementById("trailerFrameWrap");
  if (!wrap) return;
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
  const debugMsg = err && err.message ? String(err.message).replace(/</g, "&lt;") : "";
  wrap.innerHTML = `
    <div class="trailer-fallback">
      <i class="fa-solid fa-triangle-exclamation"></i>
      <p>${t().trailerNotFound}</p>
      <a href="${url}" target="_blank" rel="noopener noreferrer" class="trailer-fallback-link">
        <i class="fa-brands fa-youtube"></i> ${t().searchOnYoutube}
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
  if (e.target.id === "trailerModal") window.fecharTrailer();
});

/* ================================================
   ONDE ASSISTIR + ELENCO (com fotos) — via TMDB. A resposta de
   "providers" já traz TODAS as regiões, então trocar de região no
   seletor não faz nenhuma requisição nova.
   ================================================ */
const WATCH_REGIONS = ["BR", "US", "PT", "GB", "ES", "MX"];

// Guarda o objeto "results" (todas as regiões) do filme exibido
let currentWatchProvidersData = null;

function getWatchRegion() {
  const saved = localStorage.getItem("watchRegion");
  if (saved && WATCH_REGIONS.includes(saved)) return saved;
  return isPt() ? "BR" : "US";
}

window.onWatchRegionChange = region => {
  localStorage.setItem("watchRegion", region);
  renderWatchProviders();
};

function renderWatchProviders() {
  const container = document.getElementById("watchProvidersContainer");
  if (!container) return;

  const region     = getWatchRegion();
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
    : `<span class="watch-providers-empty">${t().noWhereToWatch}</span>`;

  container.innerHTML = `
    <div class="watch-providers">
      <span class="watch-providers-label"><i class="fa-solid fa-tv"></i> ${t().whereToWatch}</span>
      <div class="mode-toggle custom-select region-select" id="watchRegionToggle">
        <button type="button" class="custom-select-btn" id="watchRegionBtn" aria-haspopup="listbox">
          <span class="custom-select-label">${region}</span>
          <span class="arrow">▼</span>
        </button>
        <div class="mode-options custom-select-options" id="watchRegionOptionsList" role="listbox"></div>
      </div>
      ${bodyHtml}
    </div>
    ${icons.length ? `<span class="watch-providers-attribution">${t().watchProvidersAttribution}</span>` : ""}
  `;

  renderCustomSelect(
    "watchRegionBtn", "watchRegionOptionsList",
    WATCH_REGIONS.map(r => ({ value: r, label: r })),
    region,
    value => window.onWatchRegionChange(value)
  );
}

// Elenco a partir do omdb.php (só nomes, sem foto) — estado inicial
// imediato e fallback caso o TMDB não esteja configurado
function renderCastFallback(filme) {
  const actors = (filme.Actors && filme.Actors !== "N/A")
    ? filme.Actors.split(",").map(a => a.trim()).filter(Boolean)
    : [];
  if (!actors.length) return `<p class="cast-empty">${t().castEmpty}</p>`;
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
  // Elenco: mostra a lista simples do omdb.php enquanto a versão com fotos carrega
  const castContainer = document.getElementById("castContainer");
  if (castContainer) castContainer.innerHTML = renderCastFallback(filme);

  // Onde assistir: estado de carregamento
  currentWatchProvidersData = null;
  const watchContainer = document.getElementById("watchProvidersContainer");
  if (watchContainer) {
    watchContainer.innerHTML = `<span class="watch-providers-loading-text"><i class="fa-solid fa-spinner fa-spin"></i> ${t().loadingWhereToWatch}</span>`;
  }

  // Trailer: zera o cache — será preenchido abaixo
  currentTrailerVideoId     = null;
  currentTrailerResolvedFor = null;

  try {
    const found = await encontrarNoTmdb(filme);

    // Não encontrado no TMDB — mantém o fallback do elenco; marca o trailer
    // como "resolvido sem resultado" (evita tentar de novo o TMDB ao clicar)
    if (!found) {
      currentTrailerResolvedFor = filme.imdbID;
      if (currentMovieDetail && currentMovieDetail.imdbID === filme.imdbID) renderWatchProviders();
      return;
    }

    const { tmdbId, media } = found;
    const [provRes, creditsRes, videosRes] = await Promise.all([
      tmdbFetch({ type: "providers", value: tmdbId, media }),
      tmdbFetch({ type: "credits",   value: tmdbId, media }),
      tmdbFetch({ type: "videos",    value: tmdbId, media })
    ]);
    const [provData, creditsData, videosData] = await Promise.all([provRes.json(), creditsRes.json(), videosRes.json()]);

    if (!currentMovieDetail || currentMovieDetail.imdbID !== filme.imdbID) return;

    if (provRes.ok && !provData.error) currentWatchProvidersData = provData.results || null;
    renderWatchProviders();

    if (creditsRes.ok && !creditsData.error && Array.isArray(creditsData.cast) && creditsData.cast.length) {
      const el = document.getElementById("castContainer");
      if (el) el.innerHTML = renderCastGrid(creditsData.cast);
    }

    if (videosRes.ok && !videosData.error) {
      currentTrailerVideoId     = escolherMelhorTrailer(videosData.results || []);
      currentTrailerResolvedFor = filme.imdbID;
    }

  } catch (err) {
    console.error("TMDB extras error:", err);
    if (currentMovieDetail && currentMovieDetail.imdbID === filme.imdbID) {
      const el = document.getElementById("watchProvidersContainer");
      if (el) el.innerHTML = `<span class="watch-providers-empty">${t().noWhereToWatch}</span>`;
    }
  }
}

/* ================================================
   FICHA TÉCNICA (aba "Detalhes")
   ================================================ */
function renderFichaTecnica(filme) {
  const isSeries = (filme.Type || "").toLowerCase() === "series";
  const texts = t();

  const rows = [
    { label: texts.fichaDirector,   value: filme.Director },
    { label: texts.fichaWriter,     value: filme.Writer },
    { label: texts.fichaRuntime,    value: filme.Runtime },
    { label: texts.fichaSeasons,    value: (isSeries ? filme.totalSeasons : null) },
    { label: texts.fichaRated,      value: filme.Rated },
    { label: texts.fichaReleased,   value: filme.Released },
    { label: texts.fichaLanguage,   value: filme.Language },
    { label: texts.fichaCountry,    value: filme.Country },
    { label: texts.fichaAwards,     value: filme.Awards },
    { label: texts.fichaBoxOffice,  value: filme.BoxOffice },
    { label: texts.fichaProduction, value: filme.Production }
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
    : `<p class="ficha-empty">${texts.fichaEmpty}</p>`;
}

window.mudarAbaDetalhes = tab => {
  document.querySelectorAll(".detail-tab-btn")
    .forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
  document.querySelectorAll(".detail-tab-panel")
    .forEach(panel => panel.classList.toggle("active", panel.dataset.tabPanel === tab));
};

/* ================================================
   MONTA A PÁGINA DO FILME
   ================================================ */
function updateFilmDetails() {
  if (!currentMovieDetail) return;
  const filme      = currentMovieDetail;
  const texts      = t();
  const isFavorite = getFavoritos().includes(filme.imdbID);

  const resumoSalvo = localStorage.getItem("resumo_" + filme.imdbID);

  const hasPoster   = !!(filme.Poster && filme.Poster !== "N/A");
  const backdropSrc = hasPoster ? filme.Poster : "";

  detalhes.innerHTML = `
    <div class="detalhes-hero">
      <div class="detalhes-backdrop" style="${backdropSrc ? `background-image:url('${backdropSrc}')` : ""}"></div>
      <div class="detalhes-backdrop-fade"></div>
    </div>
    <button class="detalhes-back" onclick="voltarParaPesquisa()" title="${texts.backToSearch.replace(/<[^>]*>/g, '')}">
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
          <button class="gerarResumo ${resumoSalvo ? "generated" : ""}" onclick="gerarResumo()" ${resumoSalvo ? "disabled" : ""}>
            ${resumoSalvo ? texts.summaryGenerated : texts.generateSummary}
          </button>
          <button class="watchTrailerBtn" onclick="abrirTrailer()">
            <i class="fa-solid fa-clapperboard"></i> ${texts.watchTrailer}
          </button>
          <button id="favToggleButton" class="${isFavorite ? "is-favorite" : ""}" onclick="toggleFavorito()">
            ${isFavorite ? texts.removeFromFavorites : texts.addToFavorites}
          </button>
        </div>
        <div class="resumo-section">
          <div class="resumo-container" id="resumoContainer" style="display:${resumoSalvo ? "block" : "none"};"></div>
        </div>
      </div>
    </div>

    <div class="detail-tabs">
      <div class="detail-tabs-nav">
        <button class="detail-tab-btn active" data-tab="sinopse" onclick="mudarAbaDetalhes('sinopse')">
          <i class="fa-solid fa-align-left"></i> ${texts.tabSinopse}
        </button>
        <button class="detail-tab-btn" data-tab="elenco" onclick="mudarAbaDetalhes('elenco')">
          <i class="fa-solid fa-users"></i> ${texts.tabElenco}
        </button>
        <button class="detail-tab-btn" data-tab="ficha" onclick="mudarAbaDetalhes('ficha')">
          <i class="fa-solid fa-list"></i> ${texts.tabDetalhes}
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
      <button class="voltarInicial" onclick="location.href = 'index.php'">
        ${texts.backToHome}
      </button>
    </div>
  `;

  // O resumo vem da IA — entra como texto puro, nunca como HTML
  if (resumoSalvo) document.getElementById("resumoContainer").textContent = resumoSalvo;

  carregarExtrasTmdb(filme);
}

async function carregarDetalhes(imdbID) {
  showLoader();
  try {
    const filme = await omdbJson({ type: "i", value: imdbID });
    hideLoader();

    if (!filme || filme.Response === "False") {
      if (filme?.Error) console.warn("OMDb:", filme.Error);
      exibirErro();
      return;
    }

    currentMovieDetail = filme;
    document.title     = `${filme.Title} (${filme.Year}) — Ideal Film Finder`;
    erro.style.display = "none";

    updateFilmDetails();
    detalhes.style.display = "block";
    setTimeout(() => detalhes.classList.add("show"), 50);
  } catch (err) {
    hideLoader();
    console.error("Erro ao carregar filme:", err);
    exibirErro();
  }
}

/* Volta para a página anterior do site (ex.: resultados da busca); se o
   usuário abriu o link direto, vai para a página inicial */
window.voltarParaPesquisa = () => {
  let cameFromSite = false;
  try {
    cameFromSite = !!document.referrer && new URL(document.referrer).origin === location.origin;
  } catch {}
  if (cameFromSite && history.length > 1) history.back();
  else location.href = "index.php";
};

/* ================================================
   GERA RESUMO — VIA IA (API ou WebLLM, conforme escolha do usuário)
   ================================================ */
window.gerarResumo = async () => {
  if (!currentMovieDetail) return;

  const { Title: titulo, Plot: plot, imdbID } = currentMovieDetail;
  const resumoContainer = document.getElementById("resumoContainer");
  const btn             = document.querySelector(".gerarResumo");

  const marcarGerado = () => {
    if (!btn) return;
    btn.disabled  = true;
    btn.classList.add("generated");
    btn.innerHTML = t().summaryGenerated;
  };

  // Se já está salvo, só exibe
  const resumoSalvo = localStorage.getItem("resumo_" + imdbID);
  if (resumoSalvo) {
    resumoContainer.style.display = "block";
    typeWriter(resumoContainer, resumoSalvo, 20);
    marcarGerado();
    return;
  }

  if (!assertAiUsable()) return;

  resumoContainer.style.display = "block";
  resumoContainer.textContent   = t().loadingSummary;
  showLoader();

  // Desabilita botão durante a geração
  if (btn) { btn.disabled = true; btn.innerHTML = t().generatingSummary; }

  const systemMessage = isPt()
    ? "Você é um resumidor criativo de filmes. Crie um resumo curto e intrigante para um filme sem revelar spoilers importantes. Responda apenas com o resumo, sem preâmbulos."
    : "You are a creative movie summarizer. Create a short, intriguing summary for a movie without revealing major spoilers. Reply only with the summary, no preamble.";
  const userMessage = isPt()
    ? `Crie um resumo curto e instigante para o filme "${titulo}". Use o seguinte enredo como contexto: ${plot}`
    : `Generate a short, enticing summary for the movie "${titulo}". Use the following plot as context: ${plot}`;

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
    marcarGerado();

    // Pode ter trocado de idioma (re-render) enquanto a IA respondia
    const container = document.getElementById("resumoContainer");
    if (container) {
      container.style.display = "block";
      typeWriter(container, resumo, 20);
    }

  } catch (err) {
    hideLoader();
    console.error("Erro IA (gerarResumo):", err);

    const btnNow = document.querySelector(".gerarResumo");
    if (btnNow) {
      btnNow.disabled  = false;
      btnNow.innerHTML = t().generateSummary;
    }
    const container = document.getElementById("resumoContainer");
    if (container) container.style.display = "none";

    showToast((isPt() ? "Erro ao gerar resumo: " : "Error generating summary: ") + err.message, "error");
  }
};

/* ================================================
   FAVORITOS
   ================================================ */
function syncFavButton() {
  const btn = document.getElementById("favToggleButton");
  if (!btn || !currentMovieDetail) return;
  const isFavorite = getFavoritos().includes(currentMovieDetail.imdbID);
  btn.innerHTML = isFavorite ? t().removeFromFavorites : t().addToFavorites;
  btn.classList.toggle("is-favorite", isFavorite);
}

window.toggleFavorito = () => {
  if (!currentMovieDetail) return;
  const imdbID = currentMovieDetail.imdbID;
  const favoritos = getFavoritos();
  salvarFavoritos(favoritos.includes(imdbID)
    ? favoritos.filter(id => id !== imdbID)
    : [...favoritos, imdbID]);
  // salvarFavoritos dispara "favorites:changed" → syncFavButton
};

document.addEventListener("favorites:changed", syncFavButton);

/* ================================================
   TEXTOS (idioma)
   ================================================ */
onLanguageChange(() => {
  const texts = t();
  const errMsg = erro.querySelector("h2");
  if (errMsg) errMsg.innerText = texts.errorMessage;
  const errBtn = erro.querySelector("button");
  if (errBtn) errBtn.innerHTML = texts.backToHome;

  if (currentMovieDetail) updateFilmDetails();
});

/* ================================================
   INICIALIZAÇÃO
   ================================================ */
// Na página do filme o modelo local só carrega quando o usuário pede um resumo
initCommon({ eagerAi: false });
refreshTranslations();

// Chaves de API alteradas em "Adicionar APIs": recarrega o que depende delas
document.addEventListener("apikeys:changed", () => {
  if (currentMovieDetail) carregarExtrasTmdb(currentMovieDetail);
  else if (imdbIdFromUrl) carregarDetalhes(imdbIdFromUrl);
});

if (imdbIdFromUrl) carregarDetalhes(imdbIdFromUrl);
else exibirErro();
