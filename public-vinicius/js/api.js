/**
 * api.js — acesso aos proxies PHP (omdb.php, tmdb.php, youtube.php).
 * Nenhuma chave fica no código: o servidor lê as chaves do .env. Se o
 * usuário cadastrou a própria chave em "Adicionar APIs", ela vai no
 * cabeçalho X-User-Api-Key (nunca na URL) e tem prioridade.
 */
import { getDataApiKeyFor } from "./storage.js";

/* APIs de dados listadas no modal "Adicionar APIs" */
export const DATA_APIS = {
  omdb: {
    label:    "OMDb API",
    endpoint: "omdb.php",
    docsUrl:  "https://www.omdbapi.com/apikey.aspx"
  },
  tmdb: {
    label:    "TMDB — The Movie Database",
    endpoint: "tmdb.php",
    docsUrl:  "https://www.themoviedb.org/settings/api",
    keyPlaceholder: "API Key (v3 auth) — 32 chars"
  },
  youtube: {
    label:    "YouTube Data API v3",
    endpoint: "youtube.php",
    docsUrl:  "https://console.cloud.google.com/apis/library/youtube.googleapis.com",
    keyPlaceholder: "AIza..."
  }
};

function proxyFetch(service, params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([name, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(name, value);
  });

  const headers = { Accept: "application/json" };
  const userKey = getDataApiKeyFor(service);
  if (userKey) headers["X-User-Api-Key"] = userKey;

  return fetch(`${DATA_APIS[service].endpoint}?${query.toString()}`, { headers });
}

/* Retornam a Response (para quem precisa checar res.ok) */
export const omdbFetch    = params => proxyFetch("omdb", params);
export const tmdbFetch    = params => proxyFetch("tmdb", params);
export const youtubeFetch = params => proxyFetch("youtube", params);

/* Atalhos que já devolvem o JSON */
export const omdbJson = params => omdbFetch(params).then(res => res.json());
export const tmdbJson = params => tmdbFetch(params).then(res => res.json());
