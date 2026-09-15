<?php
/**
 * youtube.php — Proxy simples para a API pública do YouTube Data v3.
 *
 * Usado como reforço para encontrar o TRAILER de um filme/série quando a
 * TMDB não tem nenhum vídeo para o título.
 *
 * COMO CONFIGURAR (gratuito):
 *   1. Acesse https://console.cloud.google.com/apis/library/youtube.googleapis.com
 *   2. Crie um projeto e clique em "Ativar" na "YouTube Data API v3".
 *   3. Vá em "Credenciais" > "Criar credenciais" > "Chave de API".
 *   4. Coloque a chave no arquivo .env, em YOUTUBE_API_KEY=...
 *      (ou cadastre a sua em Configurações > Adicionar APIs, no site).
 *
 * Sem a chave configurada, este arquivo responde com erro 500 e o botão
 * "Ver Trailer" mostra um link para pesquisar manualmente no YouTube.
 *
 * ENDPOINT:
 *   youtube.php?q=<texto de busca>
 *     -> { videoId: "abc123", title: "..." }  ou  { videoId: null }
 */
require __DIR__ . '/includes/env.php';

header("Content-Type: application/json; charset=utf-8");

const YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

[$youtubeKey, $keySource] = resolve_api_key('YOUTUBE_API_KEY');
if ($youtubeKey === "") {
    json_error(500, $keySource === 'user'
        ? 'The YouTube API key saved in "Add APIs" is invalid.'
        : 'YouTube API key not configured on the server. Set YOUTUBE_API_KEY in .env or add your own key in Settings > Add APIs.');
}

$q = trim($_GET["q"] ?? "");
if ($q === "") {
    json_error(400, "Missing ?q= search query.");
}

$url = YOUTUBE_SEARCH_URL . "?" . http_build_query([
    "part"       => "snippet",
    "q"          => $q,
    "type"       => "video",
    "maxResults" => 1,
    "safeSearch" => "moderate",
    "key"        => $youtubeKey,
]);

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
    json_error(502, "YouTube request failed: " . $error);
}

$data = json_decode($body, true);

if ($status !== 200 || !isset($data["items"])) {
    json_error($status ?: 502, $data["error"]["message"] ?? "YouTube API error");
}

$item = $data["items"][0] ?? null;
if (!$item) {
    echo json_encode(["videoId" => null]);
    exit;
}

echo json_encode([
    "videoId" => $item["id"]["videoId"] ?? null,
    "title"   => $item["snippet"]["title"] ?? null,
]);
