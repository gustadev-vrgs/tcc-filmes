<?php
/**
 * openai.php — Proxy para a OpenAI Chat Completions usando a chave do
 * servidor (OPENAI_API_KEY no arquivo .env). O site usa as chaves de IA
 * que o próprio usuário cadastra no navegador; este proxy fica disponível
 * para uso com a chave do servidor.
 */
require __DIR__ . '/includes/env.php';

header('Content-Type: application/json; charset=utf-8');

$api_key = env_value('OPENAI_API_KEY');
if ($api_key === '') {
    json_error(500, 'OpenAI API key is not configured. Set OPENAI_API_KEY in .env.');
}

// Lê o JSON enviado pelo cliente
$data = json_decode(file_get_contents('php://input'), true);

// Validação básica
if (empty($data['messages'])) {
    json_error(400, 'The "messages" field is required.');
}

$request_body = json_encode([
    'model'       => $data['model']       ?? 'gpt-4o-mini',
    'messages'    => $data['messages'],
    'max_tokens'  => $data['max_tokens']  ?? 150,
    'temperature' => $data['temperature'] ?? 0.7,
]);

// Executa a chamada via cURL
$ch = curl_init('https://api.openai.com/v1/chat/completions');
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $request_body,
    CURLOPT_HTTPHEADER     => [
        'Content-Type: application/json',
        'Authorization: Bearer ' . $api_key,
    ],
]);

$response = curl_exec($ch);
$err      = curl_error($ch);
curl_close($ch);

if ($response === false || $err) {
    json_error(502, 'Failed to fetch data from OpenAI.', ['details' => $err]);
}

// Retorna o JSON puro
echo $response;
