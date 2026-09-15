<?php
/**
 * env.php — lê as chaves de API do arquivo .env (nenhuma chave fica no
 * código) e decide qual chave cada proxy deve usar:
 *
 *   1) a chave que o próprio usuário cadastrou em Configurações >
 *      "Adicionar APIs" (salva no navegador e enviada pelo JS no cabeçalho
 *      X-User-Api-Key — nunca na URL);
 *   2) se ele não cadastrou nenhuma, a chave do servidor definida no .env.
 */

function load_env(): void {
    static $loaded = false;
    if ($loaded) return;
    $loaded = true;

    $path = dirname(__DIR__) . '/.env';
    if (!is_readable($path)) return;

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;

        [$name, $value] = explode('=', $line, 2);
        $name  = trim($name);
        $value = trim($value);

        // Aceita valores entre aspas: CHAVE="valor"
        $len = strlen($value);
        if ($len >= 2 && ($value[0] === '"' || $value[0] === "'") && $value[$len - 1] === $value[0]) {
            $value = substr($value, 1, -1);
        }

        $_ENV[$name] = $value;
    }
}

function env_value(string $name): string {
    load_env();
    if (isset($_ENV[$name]) && $_ENV[$name] !== '') return (string) $_ENV[$name];
    $fromSystem = getenv($name);
    return $fromSystem === false ? '' : (string) $fromSystem;
}

/**
 * @return array{0: string, 1: string} [chave, origem] — origem é "user" ou "server"
 */
function resolve_api_key(string $envName): array {
    $userKey = trim((string) ($_SERVER['HTTP_X_USER_API_KEY'] ?? ''));
    if ($userKey !== '') {
        // Só caracteres ASCII visíveis — descarta qualquer coisa estranha
        $valid = preg_match('/^[\x21-\x7E]{1,512}$/', $userKey) === 1;
        return [$valid ? $userKey : '', 'user'];
    }
    return [env_value($envName), 'server'];
}

function json_error(int $status, string $message, array $extra = []): void {
    http_response_code($status);
    echo json_encode(['error' => $message] + $extra);
    exit;
}
