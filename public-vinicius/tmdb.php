<?php
/**
 * tmdb.php — Proxy simples para a API do TMDB (The Movie Database).
 *
 * Usado pela página do filme ("Onde assistir", elenco, trailer) e pela
 * página inicial (Destaques da Semana e recomendações por IA). Segue o
 * mesmo padrão de omdb.php (?type=...&value=...).
 *
 * COMO CONFIGURAR (gratuito):
 *   1. Crie uma conta em https://www.themoviedb.org/signup
 *   2. Vá em Configurações > API: https://www.themoviedb.org/settings/api
 *      e gere uma "API Key (v3 auth)".
 *   3. Coloque a chave no arquivo .env, em TMDB_API_KEY=...
 *      (ou cadastre a sua em Configurações > Adicionar APIs, no site).
 *
 * Sem a chave configurada, este arquivo responde com erro 500 e as seções
 * que dependem da TMDB simplesmente não aparecem — o resto do site
 * (busca, detalhes, IA) continua funcionando normalmente.
 *
 * ENDPOINTS SUPORTADOS:
 *
 *   tmdb.php?type=find&value=<imdbID>
 *     -> encontra o item do TMDB correspondente a um ID do IMDb (ex.: tt1234567)
 *
 *   tmdb.php?type=providers&value=<tmdbID>&media=movie|tv
 *     -> onde assistir (streaming/grátis/aluguel/compra), todas as regiões
 *
 *   tmdb.php?type=credits&value=<tmdbID>&media=movie|tv
 *     -> elenco e equipe técnica
 *
 *   tmdb.php?type=videos&value=<tmdbID>&media=movie|tv
 *     -> trailers/teasers oficiais hospedados no YouTube
 *
 *   tmdb.php?type=discover&media=movie|tv&genres=<ids separados por vírgula>
 *                          &year_from=<ano>&year_to=<ano>&sort=popularity|rating
 *     -> catálogo real filtrado por gênero/ano/nota (RAG das recomendações)
 *
 *   tmdb.php?type=search&value=<texto>&media=movie|tv
 *     -> busca por título
 *
 *   tmdb.php?type=recommendations&value=<tmdbID>&media=movie|tv
 *     -> filmes/séries relacionados a um item específico
 *
 *   tmdb.php?type=resolve&value=<tmdbID>&media=movie|tv
 *     -> resolve um ID da TMDB para o ID do IMDb: {"imdb_id": "tt..."}
 *
 *   tmdb.php?type=trending&media=movie|tv&window=day|week
 *     -> filmes/séries em alta (Destaques da Semana)
 */
require __DIR__ . '/includes/env.php';

header("Content-Type: application/json; charset=utf-8");

const TMDB_BASE = "https://api.themoviedb.org/3";

[$tmdbKey, $keySource] = resolve_api_key('TMDB_API_KEY');

function tmdb_fetch(string $url): void {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_HTTPHEADER     => ["Accept: application/json"],
    ]);
    $body   = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error  = curl_error($ch);
    curl_close($ch);

    if ($body === false) {
        json_error(502, "TMDB request failed: " . $error);
    }

    http_response_code($status ?: 200);
    echo $body;
    exit;
}

if ($tmdbKey === "" || strlen($tmdbKey) !== 32) {
    json_error(500, $keySource === 'user'
        ? 'The TMDB API key saved in "Add APIs" is invalid — it should be the 32-character "API Key (v3 auth)" from themoviedb.org.'
        : 'TMDB API key not configured (or invalid) on the server. Set TMDB_API_KEY in .env to your 32-character v3 auth key from themoviedb.org, or add your own key in Settings > Add APIs.');
}

$type  = $_GET["type"]  ?? "";
$value = $_GET["value"] ?? "";
$media = ($_GET["media"] ?? "movie") === "tv" ? "tv" : "movie";
$auth  = "?api_key=" . rawurlencode($tmdbKey);

if ($type === "find" && $value !== "") {
    tmdb_fetch(TMDB_BASE . "/find/" . rawurlencode($value) . $auth . "&external_source=imdb_id");

} elseif ($type === "providers" && $value !== "") {
    tmdb_fetch(TMDB_BASE . "/" . $media . "/" . rawurlencode($value) . "/watch/providers" . $auth);

} elseif ($type === "credits" && $value !== "") {
    tmdb_fetch(TMDB_BASE . "/" . $media . "/" . rawurlencode($value) . "/credits" . $auth);

} elseif ($type === "videos" && $value !== "") {
    tmdb_fetch(TMDB_BASE . "/" . $media . "/" . rawurlencode($value) . "/videos" . $auth);

} elseif ($type === "trending") {
    $window = ($_GET["window"] ?? "week") === "day" ? "day" : "week";
    tmdb_fetch(TMDB_BASE . "/trending/" . $media . "/" . $window . $auth);

} elseif ($type === "discover") {
    // Gêneros: só aceita dígitos e vírgulas (IDs da TMDB), qualquer outra
    // coisa é descartada por segurança antes de ir para a URL.
    $genres   = preg_replace('/[^0-9,]/', '', $_GET["genres"] ?? "");
    $yearFrom = isset($_GET["year_from"]) ? (int) $_GET["year_from"] : 0;
    $yearTo   = isset($_GET["year_to"])   ? (int) $_GET["year_to"]   : 0;
    $sort     = ($_GET["sort"] ?? "popularity") === "rating" ? "vote_average.desc" : "popularity.desc";

    $params = [
        "api_key"        => $tmdbKey,
        "sort_by"        => $sort,
        "include_adult"  => "false",
        "vote_count.gte" => "40", // evita itens obscuros com poucas avaliações
    ];
    if ($genres !== "") $params["with_genres"] = $genres;

    $dateField = $media === "tv" ? "first_air_date" : "primary_release_date";
    if ($yearFrom > 1900) $params[$dateField . ".gte"] = $yearFrom . "-01-01";
    if ($yearTo   > 1900) $params[$dateField . ".lte"] = $yearTo   . "-12-31";

    tmdb_fetch(TMDB_BASE . "/discover/" . $media . "?" . http_build_query($params));

} elseif ($type === "search" && $value !== "") {
    tmdb_fetch(TMDB_BASE . "/search/" . $media . $auth . "&include_adult=false&query=" . rawurlencode($value));

} elseif ($type === "recommendations" && $value !== "") {
    tmdb_fetch(TMDB_BASE . "/" . $media . "/" . rawurlencode($value) . "/recommendations" . $auth);

} elseif ($type === "resolve" && $value !== "") {
    // Resolve um ID da TMDB para o ID do IMDb correspondente, para
    // reaproveitar a página do filme (baseada em OMDB).
    $url = TMDB_BASE . "/" . $media . "/" . rawurlencode($value) . $auth
         . ($media === "tv" ? "&append_to_response=external_ids" : "");

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 8,
        CURLOPT_HTTPHEADER     => ["Accept: application/json"],
    ]);
    $body   = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($body === false || $status >= 400) {
        json_error($status ?: 502, "TMDB resolve failed", ["imdb_id" => null]);
    }

    $data   = json_decode($body, true);
    $imdbId = $media === "tv"
        ? ($data["external_ids"]["imdb_id"] ?? null)
        : ($data["imdb_id"] ?? null);

    echo json_encode(["imdb_id" => $imdbId]);

} else {
    json_error(400, "Invalid request. Use ?type=find|providers|credits|videos|discover|search|recommendations|resolve|trending (see the comments at the top of tmdb.php).");
}
