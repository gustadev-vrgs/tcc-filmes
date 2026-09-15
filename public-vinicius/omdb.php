<?php
/**
 * omdb.php — Proxy para a OMDb API (busca por título e detalhes por ID).
 *
 * A chave NÃO fica no código: vem de OMDB_API_KEY no arquivo .env, ou da
 * chave que o usuário cadastrou em Configurações > Adicionar APIs.
 *
 *   omdb.php?type=s&value=<texto>&page=<n>   -> busca por título
 *   omdb.php?type=i&value=<imdbID>           -> detalhes de um título
 */
require __DIR__ . '/includes/env.php';

header('Content-Type: application/json; charset=utf-8');

[$api_key, $keySource] = resolve_api_key('OMDB_API_KEY');
if ($api_key === '') {
    json_error(500, $keySource === 'user'
        ? 'The OMDb API key saved in "Add APIs" is invalid.'
        : 'OMDb API key is not configured. Set OMDB_API_KEY in .env or add your own key in Settings > Add APIs.');
}

// Parâmetros da requisição GET
$type  = $_GET['type']  ?? 'i'; // 's' = search, 'i' = lookup by ID
$value = $_GET['value'] ?? '';
$page  = $_GET['page']  ?? 1;

// Monta a URL da OMDb
if ($type === 's') {
    $url = sprintf(
        'http://www.omdbapi.com/?apikey=%s&s=%s&page=%d',
        urlencode($api_key),
        urlencode($value),
        intval($page)
    );
} else {
    $url = sprintf(
        'http://www.omdbapi.com/?apikey=%s&i=%s',
        urlencode($api_key),
        urlencode($value)
    );
}

// Requisição à OMDb — ignore_errors repassa o corpo mesmo em 401 (ex.: chave inválida)
$context  = stream_context_create(['http' => ['timeout' => 8, 'ignore_errors' => true]]);
$response = @file_get_contents($url, false, $context);
if ($response === false) {
    json_error(502, 'Failed to fetch data from OMDb.');
}

// Retorna o JSON puro
echo $response;
