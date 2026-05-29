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

type ActiveTool = "search" | "recommendation";

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

function isNotFoundMessage(message: string | null) {
  return message?.startsWith("Não encontramos nada") ?? false;
}

export default function Home() {
  const [activeTool, setActiveTool] = useState<ActiveTool>("search");
  const [title, setTitle] = useState("");
  const [recommendationPrompt, setRecommendationPrompt] = useState("");
  const [recommendationMessage, setRecommendationMessage] = useState<string | null>(null);
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

  function handleRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!recommendationPrompt.trim()) {
      setRecommendationMessage("Descreva rapidamente o que você quer assistir.");
      return;
    }

    setRecommendationMessage("A recomendação por IA será exibida nesta área quando o módulo estiver conectado.");
  }

  return (
    <main className="app-catalog-shell">
      <div className="catalog-page">
        <header className="site-header" aria-label="Cabeçalho principal">
          <a className="brand" href="/" aria-label="AskFilmX - página inicial">
            <span className="brand-mark">AFX</span>
            <span>AskFilmX</span>
          </a>

          <nav className="header-pills" aria-label="Recursos do AskFilmX">
            <button type="button" onClick={() => setActiveTool("search")}>Busca</button>
            <button type="button" onClick={() => setActiveTool("recommendation")}>IA generativa</button>
            <span>Sem spoilers</span>
          </nav>
        </header>

        <section className="catalog-intro" aria-labelledby="catalog-title">
          <div>
            <p className="eyebrow">Catálogo inteligente</p>
            <h1 id="catalog-title">O que você quer assistir?</h1>
            <p>Encontre filmes e séries ou peça sugestões sem spoilers importantes.</p>
          </div>
          <p className="intro-note">Pôsteres, ano e tipo aparecem em uma grade rápida de consultar.</p>
        </section>

        <section className="tool-panel" aria-label="Ferramentas de busca e recomendação">
          <div className="tool-tabs" role="tablist" aria-label="Escolha como começar">
            <button
              type="button"
              id="search-tab"
              className={activeTool === "search" ? "tool-tab active" : "tool-tab"}
              onClick={() => setActiveTool("search")}
              role="tab"
              aria-selected={activeTool === "search"}
              aria-controls="search-panel"
            >
              Buscar por título
            </button>
            <button
              type="button"
              id="recommendation-tab"
              className={activeTool === "recommendation" ? "tool-tab active" : "tool-tab"}
              onClick={() => setActiveTool("recommendation")}
              role="tab"
              aria-selected={activeTool === "recommendation"}
              aria-controls="recommendation-panel"
            >
              Pedir recomendação por IA
            </button>
          </div>

          <div className="tool-content">
            <form
              id="search-panel"
              className={activeTool === "search" ? "tool-form active" : "tool-form"}
              onSubmit={handleTitleSearch}
              role="tabpanel"
              aria-labelledby="search-tab"
            >
              <label className="field-group" htmlFor="title-search">
                <span>Busque pelo nome de um filme ou série.</span>
                <div className="inline-action">
                  <input
                    id="title-search"
                    name="title"
                    type="search"
                    placeholder="Digite um título, ex.: Matrix, Dark, Interestelar"
                    autoComplete="off"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                  <button type="submit" className="primary-button" disabled={isLoading}>
                    {isLoading ? "Buscando..." : "Buscar"}
                  </button>
                </div>
              </label>
            </form>

            <form
              id="recommendation-panel"
              className={activeTool === "recommendation" ? "tool-form active" : "tool-form"}
              onSubmit={handleRecommendation}
              role="tabpanel"
              aria-labelledby="recommendation-tab"
            >
              <label className="field-group" htmlFor="ai-recommendation">
                <span>Descreva o que você quer assistir e receba sugestões com IA.</span>
                <textarea
                  id="ai-recommendation"
                  name="recommendation"
                  placeholder="Ex.: série curta de suspense psicológico, clima sombrio e sem terror explícito"
                  rows={4}
                  value={recommendationPrompt}
                  onChange={(event) => setRecommendationPrompt(event.target.value)}
                />
              </label>
              <button type="submit" className="secondary-button">
                Recomendar
              </button>
              {recommendationMessage && <p className="recommendation-feedback">{recommendationMessage}</p>}
            </form>
          </div>
        </section>

        <section className="results-section" aria-labelledby="results-title">
          <div className="results-heading">
            <div>
              <p className="eyebrow">Catálogo</p>
              <h2 id="results-title">Resultados encontrados</h2>
            </div>
            <p className="results-helper" aria-live="polite">
              {isLoading && "Buscando títulos e preparando a grade..."}
              {!isLoading && message && !isNotFoundMessage(message) && message}
              {!isLoading && isNotFoundMessage(message) && "Nenhum resultado encontrado para essa busca."}
              {!isLoading && results.length > 0 &&
                `Encontramos ${totalResults} resultado${totalResults === "1" ? "" : "s"}.`}
              {!isLoading && !message && results.length === 0 && "Os pôsteres aparecerão aqui após a busca."}
            </p>
          </div>

          {isLoading ? (
            <div className="results-grid loading-grid" aria-label="Carregando resultados">
              {Array.from({ length: 6 }).map((_, index) => (
                <div className="movie-card skeleton-card" key={index}>
                  <div className="poster-frame skeleton-poster" />
                  <div className="movie-info">
                    <span className="skeleton-line wide" />
                    <span className="skeleton-line short" />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length > 0 ? (
            <div className={results.length < 5 ? "results-grid short-grid" : "results-grid"} aria-label="Resultados da busca por título">
              {results.map((movie) => (
                <a
                  className="movie-card"
                  href={`https://www.imdb.com/title/${movie.imdbID}/`}
                  key={movie.imdbID}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Abrir detalhes de ${movie.Title}`}
                >
                  <div className="poster-frame">
                    {hasPoster(movie.Poster) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={movie.Poster} alt={`Pôster de ${movie.Title}`} />
                    ) : (
                      <div className="poster-placeholder" aria-label={`Sem pôster disponível para ${movie.Title}`}>
                        <span>Sem pôster</span>
                      </div>
                    )}
                  </div>
                  <div className="movie-info">
                    <h3>{movie.Title}</h3>
                    <div className="movie-meta">
                      <span>{movie.Year}</span>
                      <strong>{formatType(movie.Type)}</strong>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ) : (
            <div className={isNotFoundMessage(message) ? "empty-catalog empty-error" : "empty-catalog"} aria-label="Catálogo aguardando busca">
              <div className="empty-poster" />
              <div>
                <h3>{isNotFoundMessage(message) ? "Nenhum título encontrado." : "Seu catálogo começa com uma busca."}</h3>
                <p>
                  {isNotFoundMessage(message)
                    ? "Tente pesquisar pelo título original, remover acentos ou usar apenas uma palavra principal."
                    : "Digite um título acima para montar uma grade de filmes e séries com pôsteres em destaque."}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
