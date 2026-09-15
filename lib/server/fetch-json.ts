import { ProviderError, providerHttpError } from "./provider-error";

type Provider = "omdb" | "tmdb";

export async function fetchProviderJson(
  url: URL,
  options: { provider: Provider; timeoutMs?: number; revalidate?: number }
): Promise<unknown> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestInit: RequestInit & { next: { revalidate: number } } = {
      headers: { Accept: "application/json" },
      signal: controller.signal,
      next: { revalidate: options.revalidate ?? 300 }
    };
    const response = await fetch(url, requestInit);

    if (!response.ok) throw providerHttpError(options.provider, response.status);

    try {
      return await response.json();
    } catch {
      throw new ProviderError("invalid_response", `Resposta inválida da ${options.provider.toUpperCase()}.`, options.provider, 502);
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (controller.signal.aborted) {
      throw new ProviderError("timeout", `A ${options.provider.toUpperCase()} demorou demais para responder.`, options.provider, 504);
    }
    throw new ProviderError("unavailable", `Não foi possível consultar a ${options.provider.toUpperCase()}.`, options.provider, 502);
  } finally {
    clearTimeout(timeout);
  }
}
