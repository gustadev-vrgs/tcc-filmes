export type ProviderErrorCode =
  | "configuration"
  | "not_found"
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "invalid_response"
  | "unavailable";

export class ProviderError extends Error {
  constructor(
    public readonly code: ProviderErrorCode,
    message: string,
    public readonly provider: "omdb" | "tmdb",
    public readonly status: number
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export function configurationError(provider: "omdb" | "tmdb") {
  const variable = provider === "omdb" ? "OMDB_API_KEY" : "TMDB_API_KEY";
  return new ProviderError(
    "configuration",
    `${provider.toUpperCase()} não está configurada no servidor. Defina ${variable}.`,
    provider,
    503
  );
}

export function providerHttpError(provider: "omdb" | "tmdb", status: number) {
  if (status === 401 || status === 403) {
    return new ProviderError("authentication", `A credencial da ${provider.toUpperCase()} foi recusada.`, provider, 502);
  }
  if (status === 404) {
    return new ProviderError("not_found", "Título não encontrado.", provider, 404);
  }
  if (status === 429) {
    return new ProviderError("rate_limit", `O limite de consultas da ${provider.toUpperCase()} foi atingido.`, provider, 429);
  }
  return new ProviderError("unavailable", `${provider.toUpperCase()} está indisponível no momento.`, provider, 502);
}
