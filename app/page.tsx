"use client";

import { FormEvent, useState } from "react";

type OmdbMovie = {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
};

type OmdbSearchResponse = {
  Search: OmdbMovie[];
  totalResults: string;
  Response: "True";
};

type ApiErrorResponse = {
  error: string;
};

function hasPoster(poster: string) {
  return poster && poster !== "N/A";
}

function formatType(type: string) {
  const labels: Record<string, string> = {
    movie: "Filme",
    series: "Série",
    episode: "Episódio"
  };

  return labels[type] ?? type;
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [results, setResults] = useState<OmdbMovie[]>([]);
  const [totalResults, setTotalResults] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleTitleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = title.trim();

    if (!query) {
      setResults([]);
      setTotalResults(null);
      setMessage("Digite um título para começar a busca.");
      return;
    }

    setIsLoading(true);
    setMessage(null);
    setTotalResults(null);

    try {
      const response = await fetch(`/api/omdb?type=search&q=${encodeURIComponent(query)}&page=1`);
      const data = (await response.json()) as OmdbSearchResponse | ApiErrorResponse;

      if (!response.ok) {
        setResults([]);
        setMessage(
          response.status === 404
            ? "Não encontramos nada com esse título. Tente outro nome ou verifique a grafia."
            : "Não foi possível buscar agora. Tente novamente em instantes."
        );
        console.error("Erro na busca OMDb:", "error" in data ? data.error : data);
        return;
      }

      if ("Search" in data && data.Search.length > 0) {
        setResults(data.Search);
        setTotalResults(data.totalResults);
        setMessage(null);
      } else {
        setResults([]);
        setMessage("Não encontramos nada com esse título. Tente outro nome ou verifique a grafia.");
      }
    } catch (error) {
      setResults([]);
      setMessage("Ocorreu um erro inesperado. Confira sua conexão e tente novamente.");
      console.error("Erro inesperado na busca OMDb:", error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen overflow-hidden bg-ink text-white">
      <div className="page-shell">
        <header className="site-header" aria-label="Cabeçalho principal">
          <a className="brand" href="/" aria-label="AskFilmX - página inicial">
            <span className="brand-mark">AFX</span>
            <span>AskFilmX</span>
          </a>

          <nav className="header-pills" aria-label="Recursos do AskFilmX">
            <span>Busca OMDb</span>
            <span>IA generativa</span>
            <span>Sem spoilers</span>
          </nav>
        </header>

        <section className="hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">Cinema, séries e recomendações inteligentes</p>
            <h1>Encontre filmes e séries com ajuda de IA</h1>
            <p className="hero-subtitle">
              Busque diretamente por um título ou descreva em linguagem natural o que você quer assistir. O AskFilmX combina
              dados de filmes e séries com IA para sugerir opções relevantes, claras e sem spoilers importantes.
            </p>

            <div className="trust-row" aria-label="Destaques da experiência">
              <span>Rápido</span>
              <span>Responsivo</span>
              <span>Privado por padrão</span>
            </div>
          </div>

          <section className="search-card" aria-labelledby="form-title">
            <div className="card-glow" aria-hidden="true" />
            <div className="form-heading">
              <p className="eyebrow">Comece agora</p>
              <h2 id="form-title">O que você quer encontrar?</h2>
            </div>

            <form className="action-form" onSubmit={handleTitleSearch}>
              <label className="field-group" htmlFor="title-search">
                <span>Buscar por título</span>
                <input
                  id="title-search"
                  name="title"
                  type="search"
                  placeholder="Ex.: Interestelar, Breaking Bad, Matrix..."
                  autoComplete="off"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <button type="submit" className="primary-button" disabled={isLoading}>
                {isLoading ? "Buscando..." : "Buscar título"}
              </button>

              <div className="search-feedback" aria-live="polite">
                {isLoading && <p>Consultando a OMDb com segurança pelo servidor...</p>}
                {!isLoading && message && <p>{message}</p>}
                {!isLoading && results.length > 0 && (
                  <p>
                    Encontramos {totalResults} resultado{totalResults === "1" ? "" : "s"}. Exibindo os primeiros cards.
                  </p>
                )}
              </div>

              {results.length > 0 && (
                <div className="results-grid" aria-label="Resultados da busca por título">
                  {results.map((movie) => (
                    <article className="movie-card" key={movie.imdbID}>
                      <div className="poster-frame">
                        {hasPoster(movie.Poster) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={movie.Poster} alt={`Capa de ${movie.Title}`} />
                        ) : (
                          <div className="poster-placeholder" aria-label={`Sem capa disponível para ${movie.Title}`}>
                            <span>Sem capa</span>
                          </div>
                        )}
                      </div>
                      <div className="movie-info">
                        <h3>{movie.Title}</h3>
                        <p>{movie.Year}</p>
                        <span>{formatType(movie.Type)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              <div className="divider" role="separator">
                <span>ou</span>
              </div>

              <label className="field-group" htmlFor="ai-recommendation">
                <span>Pedir recomendação por IA</span>
                <textarea
                  id="ai-recommendation"
                  name="recommendation"
                  placeholder="Ex.: Quero uma série curta de suspense psicológico, com clima sombrio e sem terror explícito."
                  rows={5}
                />
              </label>
              <button type="button" className="secondary-button">
                Pedir recomendação
              </button>
            </form>
          </section>
        </section>
      </div>
    </main>
  );
}
