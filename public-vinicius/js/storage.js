/**
 * storage.js — tudo que fica salvo no navegador (localStorage):
 * favoritos e as chaves de API cadastradas pelo próprio usuário.
 */

function readJSON(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

/* ================================================
   FAVORITOS
   ================================================ */
export const getFavoritos = () => [...new Set(readJSON("favoritos", []))];

export const salvarFavoritos = favoritos => {
  localStorage.setItem("favoritos", JSON.stringify(favoritos));
  // Avisa a página atual (ex.: botão de favorito da página do filme)
  document.dispatchEvent(new CustomEvent("favorites:changed"));
};

/* ================================================
   CHAVES DE API DOS PROVEDORES DE IA (OpenAI, Anthropic, Google...)
   Cada provedor guarda a própria chave — usadas direto do navegador.
   ================================================ */
export const getAiApiKeys   = () => readJSON("aiApiKeys", {});
export const getAiApiKeyFor = providerId => getAiApiKeys()[providerId] || "";

export function setAiApiKeyFor(providerId, key) {
  const keys = getAiApiKeys();
  if (key) keys[providerId] = key; else delete keys[providerId];
  localStorage.setItem("aiApiKeys", JSON.stringify(keys));
}

/* ================================================
   CHAVES DAS APIs DE DADOS (OMDb, TMDB, YouTube)
   Enviadas aos proxies PHP no cabeçalho X-User-Api-Key; quando vazias, o
   servidor usa a chave padrão do arquivo .env.
   ================================================ */
export const getDataApiKeys   = () => readJSON("dataApiKeys", {});
export const getDataApiKeyFor = service => getDataApiKeys()[service] || "";

export function setDataApiKeys(keys) {
  const clean = {};
  Object.entries(keys || {}).forEach(([service, key]) => {
    const value = String(key || "").trim();
    if (value) clean[service] = value;
  });
  localStorage.setItem("dataApiKeys", JSON.stringify(clean));
}
