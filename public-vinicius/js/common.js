/**
 * common.js — partes compartilhadas por TODAS as páginas: cabeçalho
 * (idioma, busca rápida, configurações de layout/modo/estilo), modal de
 * Favoritos e modal "Adicionar APIs".
 *
 * Cada página chama initCommon() e depois refreshTranslations().
 */
import { t, isPt, onLanguageChange, toggleLanguage } from "./i18n.js";
import { showToast, escapeAttr } from "./ui.js";
import {
  getFavoritos, salvarFavoritos,
  getDataApiKeys, setDataApiKeys, getAiApiKeyFor, setAiApiKeyFor
} from "./storage.js";
import { omdbJson, DATA_APIS } from "./api.js";
import { API_PROVIDERS, initAi, updateStatusBarForMode } from "./ai.js";

/** Endereço da página de um filme/série */
export const movieUrl = imdbID => `filme.php?id=${encodeURIComponent(imdbID)}`;

/* ================================================
   SELEÇÃO DE LAYOUT (organização visual da página)
   ================================================ */
const LAYOUTS = ["duo", "premiere", "sidebar", "row"];
let siteLayout = localStorage.getItem("siteLayout");
if (!LAYOUTS.includes(siteLayout)) siteLayout = "duo";
document.documentElement.setAttribute("data-layout", siteLayout);

// Quantidade de filmes que a IA devolve por recomendação — persiste entre visitas
let recommendationCount = parseInt(localStorage.getItem("recommendationCount"), 10);
if (![4, 6, 8, 10, 12].includes(recommendationCount)) recommendationCount = 8;
export const getRecommendationCount = () => recommendationCount;

const modeToggleBtn     = document.getElementById("modeToggleBtn");
const modeButton        = document.getElementById("modeButton");
const styleToggleBtn    = document.getElementById("styleToggleBtn");
const styleButton       = document.getElementById("styleButton");
const recCountToggleBtn = document.getElementById("recCountToggleBtn");
const recCountButton    = document.getElementById("recCountButton");

window.setLayout = mode => {
  if (!LAYOUTS.includes(mode)) return;
  siteLayout = mode;
  localStorage.setItem("siteLayout", mode);
  document.documentElement.setAttribute("data-layout", mode);
  updateLayoutButtonLabel();
  document.getElementById("layoutToggleBtn")?.classList.remove("open");
  document.dispatchEvent(new CustomEvent("layout:changed"));
};

function updateLayoutButtonLabel() {
  const btn = document.getElementById("layoutButton");
  if (!btn) return;
  const texts = t();
  const map = {
    duo:      { label: texts.layoutDuoShort,      icon: "fa-clapperboard" },
    premiere: { label: texts.layoutPremiereShort, icon: "fa-table-cells" },
    sidebar:  { label: texts.layoutSidebarShort,  icon: "fa-table-columns" },
    row:      { label: texts.layoutRowShort,      icon: "fa-film" }
  };
  const current = map[siteLayout] || map.duo;
  btn.innerHTML = `<i class="fa-solid ${current.icon}"></i> ${current.label} <span class="arrow">▼</span>`;
}

// Modo (Escuro/Claro) — controla fundo, superfície e texto base
window.setMode = mode => {
  if (!["dark", "light"].includes(mode)) return;
  document.body.setAttribute("data-mode", mode);
  localStorage.setItem("siteMode", mode);
  updateModeButtonLabel();
  modeToggleBtn?.classList.remove("open");
};

function updateModeButtonLabel() {
  if (!modeButton) return;
  const texts = t();
  const mode  = document.body.getAttribute("data-mode") === "light" ? "light" : "dark";
  const icon  = mode === "light" ? "fa-sun" : "fa-moon";
  const label = mode === "light" ? texts.modeButtonLight : texts.modeButtonDark;
  modeButton.innerHTML = `<i class="fa-solid ${icon}"></i> ${label} <span class="arrow">▼</span>`;
}

// Estilo (Padrão/Vintage/Neon/Arco-íris/Monocromático) — combina com o Modo acima
const STYLE_ICONS = { default: "fa-circle", vintage: "fa-clapperboard", neon: "fa-bolt", rainbow: "fa-rainbow", mono: "fa-circle-half-stroke" };

window.setStyle = style => {
  if (!STYLE_ICONS[style]) return;
  document.body.setAttribute("data-style", style);
  localStorage.setItem("siteStyle", style);
  updateStyleButtonLabel();
  styleToggleBtn?.classList.remove("open");
};

function updateStyleButtonLabel() {
  if (!styleButton) return;
  const texts  = t();
  const style  = STYLE_ICONS[document.body.getAttribute("data-style")] ? document.body.getAttribute("data-style") : "default";
  const labels = { default: texts.styleButtonDefault, vintage: texts.styleButtonVintage, neon: texts.styleButtonNeon, rainbow: texts.styleButtonRainbow, mono: texts.styleButtonMono };
  styleButton.innerHTML = `<i class="fa-solid ${STYLE_ICONS[style]}"></i> ${labels[style]} <span class="arrow">▼</span>`;
}

// Quantidade de filmes que a IA recomenda por pesquisa (afeta só o "Recommend Movies")
window.setRecommendationCount = count => {
  count = parseInt(count, 10);
  if (![4, 6, 8, 10, 12].includes(count)) return;
  recommendationCount = count;
  localStorage.setItem("recommendationCount", String(count));
  updateRecCountLabels();
  recCountToggleBtn?.classList.remove("open");
};

function updateRecCountLabels() {
  const texts = t();
  if (recCountButton) {
    recCountButton.innerHTML = `<i class="fa-solid fa-list-ol"></i> ${texts.recCountButton}: ${recommendationCount} <span class="arrow">▼</span>`;
  }
  const recOptLabels = { 4: texts.recCountQuick, 8: texts.recCountDefault, 12: texts.recCountMore };
  document.querySelectorAll("#recCountOptions button[data-recopt]").forEach(b => {
    const n = Number(b.dataset.recopt);
    b.textContent = recOptLabels[n] ? `${n} — ${recOptLabels[n]}` : String(n);
    b.classList.toggle("selected", n === recommendationCount);
  });
}

/* ================================================
   MENUS SUSPENSOS DO CABEÇALHO (AI Engine, Configurações...)
   Delegação de evento no document — cobre também dropdowns criados
   dinamicamente depois (ex.: o seletor de região em "Onde Assistir").
   Trata aninhamento: o painel de Configurações contém Layout/Modo/Estilo
   como sub-dropdowns; abrir um deles não deve fechar o painel pai.
   ================================================ */
document.addEventListener("click", e => {
  // Clicou numa OPÇÃO (dentro de .mode-options): fecha só aquele dropdown
  // específico — nunca alterna (evita a corrida com setLayout/setMode/
  // setStyle, que já fecham o próprio toggle ao aplicar a escolha).
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
    document.querySelectorAll(".mode-toggle.open").forEach(d => {
      if (d !== toggle && !d.contains(toggle)) d.classList.remove("open");
    });
    toggle.classList.toggle("open", !wasOpen);
    return;
  }
  document.querySelectorAll(".mode-toggle.open").forEach(d => d.classList.remove("open"));
});

// Header transparente sobre o hero; ganha fundo sólido ao rolar (estilo Netflix)
(function watchHeaderScroll() {
  const header = document.querySelector("header");
  if (!header) return;
  const update = () => header.classList.toggle("scrolled", window.scrollY > 12);
  window.addEventListener("scroll", update, { passive: true });
  update();
})();

// Mede a altura real do header (varia entre desktop e mobile) pra grudar a
// barra de status da IA bem embaixo dele, sem espaço nem sobreposição.
(function trackHeaderHeight() {
  const header = document.querySelector("header");
  if (!header) return;
  const update = () => {
    document.documentElement.style.setProperty("--header-h-live", header.offsetHeight + "px");
  };
  window.addEventListener("resize", update);
  update();
  setTimeout(update, 300);
  setTimeout(update, 1200);
})();

/* ================================================
   BUSCA RÁPIDA NO HEADER
   Na página inicial pesquisa ali mesmo; nas outras páginas leva para a
   página inicial com a pesquisa (index.php?q=...).
   ================================================ */
let quickSearchHandler = null;

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

    document.getElementById("headerSearchWrap")?.classList.remove("open");
    input.value = "";

    if (quickSearchHandler) quickSearchHandler(valor);
    else location.href = `index.php?q=${encodeURIComponent(valor)}`;
  };
})();

/* ================================================
   MODAL DE FAVORITOS
   ================================================ */
let favoritesRenderToken = 0;

const mostrarFavoritos = () => {
  const favoritos     = getFavoritos();
  const favoritesList = document.getElementById("favoritesList");
  const renderToken   = ++favoritesRenderToken; // descarta respostas de uma abertura anterior
  favoritesList.innerHTML = "";

  if (favoritos.length === 0) {
    favoritesList.innerHTML = `
      <p style="text-align:center;">
        <i class="fa-solid fa-exclamation-circle"></i>
        ${t().noFavorites}
      </p>`;
  } else {
    favoritos.forEach(imdbID => {
      omdbJson({ type: "i", value: imdbID })
        .then(filme => {
          if (renderToken !== favoritesRenderToken || !filme || filme.Response === "False") return;
          const div = document.createElement("div");
          div.className = "favorite-item";
          div.innerHTML = `
            <span><i class="fa-solid fa-film"></i> ${filme.Title} (${filme.Year})</span>
            <div>
              <button type="button" data-action="view">${t().viewDetails}</button>
              <button type="button" data-action="remove">${t().remove}</button>
            </div>`;
          div.querySelector('[data-action="view"]').onclick   = () => { location.href = movieUrl(filme.imdbID); };
          div.querySelector('[data-action="remove"]').onclick = () => window.removerFavorito(filme.imdbID);
          favoritesList.appendChild(div);
        })
        .catch(err => console.warn("Erro ao carregar favorito", imdbID, err));
    });
  }
  document.getElementById("favoritesModal").style.display = "flex";
};

window.removerFavorito = imdbID => {
  salvarFavoritos(getFavoritos().filter(id => id !== imdbID));
  mostrarFavoritos();
};

const fecharFavoritos = () => {
  document.getElementById("favoritesModal").style.display = "none";
};

window.mostrarFavoritos = mostrarFavoritos;
window.fecharFavoritos  = fecharFavoritos;

/* ================================================
   MODAL "ADICIONAR APIs" — o usuário cola as próprias chaves de API.
   Ficam salvas no localStorage (igual aos Favoritos):
     • OMDb / TMDB / YouTube → enviadas aos proxies PHP (X-User-Api-Key)
     • provedores de IA      → as mesmas chaves do modal do motor de IA
   ================================================ */
const apiKeysModal = document.getElementById("apiKeysModal");

function collectApiKeyDraft() {
  const draft = {};
  document.querySelectorAll("#apiKeysList input[data-key-group]").forEach(input => {
    draft[`${input.dataset.keyGroup}:${input.dataset.keyId}`] = input.value;
  });
  return draft;
}

function renderApiKeysList(draft = null) {
  const list = document.getElementById("apiKeysList");
  if (!list) return;
  const texts    = t();
  const dataKeys = getDataApiKeys();

  const field = (group, id, label, docsUrl, placeholder, savedValue) => {
    const inputId = `apikey-${group}-${id}`;
    const value   = draft ? (draft[`${group}:${id}`] ?? savedValue) : savedValue;
    return `
      <div class="api-key-field">
        <div class="api-key-field-head">
          <label for="${inputId}">${label}</label>
          ${docsUrl ? `<a href="${docsUrl}" target="_blank" rel="noopener noreferrer">${texts.apiKeysGetKey} <i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ""}
        </div>
        <div class="api-key-input-wrap">
          <input type="password" id="${inputId}" data-key-group="${group}" data-key-id="${id}"
                 placeholder="${escapeAttr(placeholder || texts.apiKeysPlaceholder)}"
                 value="${escapeAttr(value)}" autocomplete="off" spellcheck="false" />
          <button type="button" data-toggle-for="${inputId}" title="${escapeAttr(texts.showHideKey)}"><i class="fa-solid fa-eye"></i></button>
        </div>
      </div>`;
  };

  const dataFields = Object.entries(DATA_APIS)
    .map(([id, api]) => field("data", id, api.label, api.docsUrl, api.keyPlaceholder, dataKeys[id] || ""))
    .join("");

  const aiFields = Object.entries(API_PROVIDERS)
    .filter(([id]) => id !== "custom") // o endpoint customizado é configurado no modal do motor de IA
    .map(([id, provider]) => field("ai", id, provider.label, provider.docsUrl, provider.keyPlaceholder, getAiApiKeyFor(id)))
    .join("");

  list.innerHTML = `
    <section class="api-keys-group">
      <h3 class="api-keys-group-title"><i class="fa-solid fa-film"></i> ${texts.apiKeysGroupData}</h3>
      ${dataFields}
    </section>
    <section class="api-keys-group">
      <h3 class="api-keys-group-title"><i class="fa-solid fa-cloud"></i> ${texts.apiKeysGroupAi}</h3>
      ${aiFields}
    </section>`;
}

window.abrirApiKeys = () => {
  renderApiKeysList();
  apiKeysModal.style.display = "flex";
};

window.fecharApiKeys = () => {
  apiKeysModal.style.display = "none";
};

window.salvarApiKeys = () => {
  const dataKeys = {};
  document.querySelectorAll("#apiKeysList input[data-key-group]").forEach(input => {
    const value = input.value.trim();
    if (input.dataset.keyGroup === "data") dataKeys[input.dataset.keyId] = value;
    else setAiApiKeyFor(input.dataset.keyId, value);
  });
  setDataApiKeys(dataKeys);

  window.fecharApiKeys();
  updateStatusBarForMode();
  showToast(t().apiKeysSaved, "success", 3500);
  // Deixa a página recarregar o que depende das chaves (destaques, onde assistir...)
  document.dispatchEvent(new CustomEvent("apikeys:changed"));
};

document.getElementById("apiKeysList")?.addEventListener("click", e => {
  const btn = e.target.closest("button[data-toggle-for]");
  if (!btn) return;
  const input = document.getElementById(btn.dataset.toggleFor);
  if (!input) return;
  const showing = input.type === "text";
  input.type    = showing ? "password" : "text";
  btn.innerHTML = `<i class="fa-solid ${showing ? "fa-eye" : "fa-eye-slash"}"></i>`;
});

document.getElementById("apiKeysList")?.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.matches("input[data-key-group]")) {
    e.preventDefault();
    window.salvarApiKeys();
  }
});

apiKeysModal?.addEventListener("click", e => {
  if (e.target === apiKeysModal) window.fecharApiKeys();
});

/* ================================================
   IDIOMA
   ================================================ */
window.toggleLanguage = toggleLanguage;

onLanguageChange(() => {
  const texts = t();

  const homeLink = document.getElementById("homeLink");
  if (homeLink) homeLink.innerText = texts.headerTitle;

  updateModeButtonLabel();
  const modeOptDark  = document.querySelector("#modeOptions button[data-modeopt='dark']");
  const modeOptLight = document.querySelector("#modeOptions button[data-modeopt='light']");
  if (modeOptDark)  modeOptDark.innerHTML  = texts.modeOptionDark;
  if (modeOptLight) modeOptLight.innerHTML = texts.modeOptionLight;

  updateStyleButtonLabel();
  const styleOptions = { default: texts.styleOptionDefault, vintage: texts.styleOptionVintage, neon: texts.styleOptionNeon, rainbow: texts.styleOptionRainbow, mono: texts.styleOptionMono };
  Object.entries(styleOptions).forEach(([style, html]) => {
    const btn = document.querySelector(`#styleOptions button[data-styleopt='${style}']`);
    if (btn) btn.innerHTML = html;
  });

  updateRecCountLabels();

  updateLayoutButtonLabel();
  const layoutOptions = { duo: texts.layoutOptionDuo, premiere: texts.layoutOptionPremiere, sidebar: texts.layoutOptionSidebar, row: texts.layoutOptionRow };
  Object.entries(layoutOptions).forEach(([layout, html]) => {
    const btn = document.querySelector(`#layoutOptions button[data-layoutopt='${layout}']`);
    if (btn) btn.innerHTML = html;
  });

  const favBtn = document.querySelector("button.favorites");
  if (favBtn) favBtn.innerHTML = `<i class="fa-solid fa-star"></i> ${texts.favorites}`;

  const langToggle = document.getElementById("langToggleButton");
  if (langToggle) langToggle.innerHTML = `<i class="fa-solid fa-language"></i> Language: ${isPt() ? "Português" : "English"}`;

  const quickInput = document.getElementById("quickSearchInput");
  if (quickInput) quickInput.placeholder = texts.searchPlaceholder;
  const quickBtn = document.getElementById("quickSearchBtn");
  if (quickBtn) quickBtn.title = texts.searchButton.replace(/<[^>]*>/g, "").trim();
  const settingsBtn = document.getElementById("settingsButton");
  if (settingsBtn) settingsBtn.title = texts.settingsButtonTitle;

  // Favoritos
  const favTitle = document.getElementById("favoritesTitle");
  if (favTitle) favTitle.textContent = texts.favoritesTitle;
  if (document.getElementById("favoritesModal")?.style.display === "flex") mostrarFavoritos();

  // Adicionar APIs
  const apiKeysMenuButton = document.getElementById("apiKeysMenuButton");
  if (apiKeysMenuButton) apiKeysMenuButton.innerHTML = texts.apiKeysMenu;
  const apiKeysTitle = document.getElementById("apiKeysTitle");
  if (apiKeysTitle) apiKeysTitle.textContent = texts.apiKeysTitle;
  const apiKeysIntro = document.getElementById("apiKeysIntro");
  if (apiKeysIntro) apiKeysIntro.textContent = texts.apiKeysIntro;
  const btnSaveApiKeys = document.getElementById("btnSaveApiKeys");
  if (btnSaveApiKeys) btnSaveApiKeys.innerHTML = texts.apiKeysSave;
  if (apiKeysModal?.style.display === "flex") renderApiKeysList(collectApiKeyDraft());
});

/**
 * Inicializa o que é comum a todas as páginas.
 * @param {object}   opts
 * @param {Function} opts.onQuickSearch - trata a busca rápida na própria página (senão vai para index.php?q=)
 * @param {Function} opts.onHomeLink    - trata o clique no título do site sem recarregar a página
 * @param {boolean}  opts.eagerAi       - pré-carrega o modelo de IA local ao abrir a página
 */
export function initCommon({ onQuickSearch = null, onHomeLink = null, eagerAi = true } = {}) {
  quickSearchHandler = onQuickSearch;

  if (onHomeLink) {
    document.getElementById("homeLink")?.addEventListener("click", e => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return; // nova aba/janela continua normal
      e.preventDefault();
      onHomeLink();
    });
  }

  initAi({ eager: eagerAi });
}
