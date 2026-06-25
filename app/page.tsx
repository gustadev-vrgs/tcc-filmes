"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type ActiveMode = "search" | "recommend";
type Language = "pt-BR" | "en";
type FilterKey = "Todos" | "Filme" | "Série" | "Anime" | "Doc";

type SearchItem = {
  Title: string;
  Year: string;
  imdbID: string;
  Type: string;
  Poster: string;
};

type CatalogItem = {
  id: string;
  title: string;
  year: string;
  type: Exclude<FilterKey, "Todos">;
  poster: string;
};

type OmdbSearchPayload = {
  Search: SearchItem[];
  totalResults: string;
};

type MovieDetails = SearchItem & {
  Rated?: string;
  Released?: string;
  Runtime?: string;
  Genre?: string;
  Director?: string;
  Writer?: string;
  Actors?: string;
  Plot?: string;
  imdbRating?: string;
};

const placeholderExamples = ["Busque por um título...", "Ex.: filme de mistério", "Ex.: série de ficção científica"];
const suggestionChips = [
  "Anime psicológico e perturbador",
  "Thriller nórdico estilo True Detective",
  "Filme para choro em família",
  "Comédia britânica anos 90"
];
const filterOptions: FilterKey[] = ["Todos", "Filme", "Série"];

const detailsCopy = {
  "pt-BR": {
    close: "Fechar detalhes",
    loading: "Carregando detalhes...",
    posterAlt: "Pôster de",
    runtimeUnavailable: "Duração indisponível",
    ratingUnavailable: "Nota indisponível",
    synopsis: "Sinopse",
    synopsisUnavailable: "Sinopse indisponível.",
    genre: "GÊNERO",
    directorCreator: "DIREÇÃO / CRIAÇÃO",
    cast: "ELENCO",
    type: "TIPO",
    unavailable: "Não informado",
    movie: "Filme",
    series: "Série",
    movieBadge: "FILME",
    seriesBadge: "SÉRIE"
  },
  en: {
    close: "Close details",
    loading: "Loading details...",
    posterAlt: "Poster for",
    runtimeUnavailable: "Runtime unavailable",
    ratingUnavailable: "Rating unavailable",
    synopsis: "Synopsis",
    synopsisUnavailable: "Synopsis unavailable.",
    genre: "GENRE",
    directorCreator: "DIRECTOR / CREATOR",
    cast: "CAST",
    type: "TYPE",
    unavailable: "N/A",
    movie: "Movie",
    series: "Series",
    movieBadge: "MOVIE",
    seriesBadge: "SERIES"
  }
} as const;

const genreTranslations: Record<string, string> = {
  Action: "Ação", Adventure: "Aventura", Animation: "Animação", Biography: "Biografia", Comedy: "Comédia",
  Crime: "Crime", Documentary: "Documentário", Drama: "Drama", Family: "Família", Fantasy: "Fantasia",
  History: "História", Horror: "Terror", Music: "Música", Musical: "Musical", Mystery: "Mistério",
  Romance: "Romance", "Sci-Fi": "Ficção científica", Sport: "Esporte", Thriller: "Suspense", War: "Guerra", Western: "Faroeste"
};

function hasValue(value?: string) {
  return Boolean(value && value !== "N/A");
}

function formatDetailsType(type: string | undefined, language: Language) {
  const copy = detailsCopy[language];
  return type === "series" ? copy.series : copy.movie;
}

function formatDetailsBadge(type: string | undefined, language: Language) {
  const copy = detailsCopy[language];
  return type === "series" ? copy.seriesBadge : copy.movieBadge;
}

function formatGenre(genre: string | undefined, language: Language) {
  if (!hasValue(genre)) {
    return detailsCopy[language].unavailable;
  }

  if (language === "en") {
    return genre as string;
  }

  return (genre as string).split(",").map((item) => {
    const trimmed = item.trim();
    return genreTranslations[trimmed] ?? trimmed;
  }).join(", ");
}

function mapItemType(type: string): CatalogItem["type"] {
  if (type === "series") {
    return "Série";
  }

  return "Filme";
}

function mapSearchItem(item: SearchItem): CatalogItem {
  return {
    id: item.imdbID,
    title: item.Title,
    year: item.Year,
    type: mapItemType(item.Type),
    poster: item.Poster
  };
}

function SearchBar({
  isLoading,
  placeholder,
  value,
  onChange,
  onSubmit
}: {
  isLoading: boolean;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="spotlight-search" onSubmit={onSubmit} aria-label="Busca por título">
      <span className="search-icon" aria-hidden="true">⌕</span>
      <input
        id="title-search"
        name="title"
        type="search"
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="submit" className="gold-button" disabled={isLoading}>
        {isLoading ? "Buscando" : "Buscar"}
      </button>
    </form>
  );
}

function AIPromptBox({
  isLoading,
  value,
  onChange,
  onSubmit
}: {
  isLoading: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="ai-prompt-card" onSubmit={onSubmit} aria-label="Recomendação por IA generativa">
      <label htmlFor="ai-recommendation">Descreva seu momento, humor ou referência cinematográfica.</label>
      <textarea
        id="ai-recommendation"
        name="recommendation"
        placeholder="Ex.: Quero algo melancólico, visualmente sofisticado, com ritmo contemplativo e final marcante."
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="prompt-footer">
        <div className="suggestion-chips" aria-label="Sugestões de prompts">
          {suggestionChips.map((chip) => (
            <button key={chip} type="button" onClick={() => onChange(chip)}>
              {chip}
            </button>
          ))}
        </div>
        <button type="submit" className="gold-button sparkle-button" disabled={isLoading}>
          <span aria-hidden="true">✦</span>
          Pedir recomendação
        </button>
      </div>
    </form>
  );
}

function FilterBar({ activeFilter, onChange }: { activeFilter: FilterKey; onChange: (filter: FilterKey) => void }) {
  return (
    <div className="filter-bar" aria-label="Filtros de resultados">
      {filterOptions.map((filter) => (
        <button
          type="button"
          key={filter}
          className={activeFilter === filter ? "filter-pill active" : "filter-pill"}
          onClick={() => onChange(filter)}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}

function MovieCard({ item, onSelect }: { item: CatalogItem; onSelect: (item: CatalogItem) => void }) {
  const hasPoster = item.poster && item.poster !== "N/A";

  return (
    <article className="movie-card" aria-label={`${item.title}, ${item.type}`}>
      <button
        type="button"
        className="poster-art real-poster poster-button"
        onClick={() => onSelect(item)}
        aria-label={`Abrir detalhes de ${item.title}`}
      >
        {hasPoster ? <img src={item.poster} alt={`Pôster de ${item.title}`} /> : <div className="poster-fallback">AskFilm</div>}
        <span className="type-badge">{item.type.toUpperCase()}</span>
      </button>
      <div className="movie-caption">
        <h3>{item.title}</h3>
        <p>{item.year} • {item.type}</p>
      </div>
    </article>
  );
}

function ResultsGrid({ isLoading, items, onSelect }: { isLoading: boolean; items: CatalogItem[]; onSelect: (item: CatalogItem) => void }) {
  if (isLoading) {
    return (
      <div className="results-grid" aria-label="Carregando resultados">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="skeleton-card" key={index}>
            <span />
            <strong />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="results-grid" aria-label="Resultados de busca audiovisual">
      {items.map((item) => (
        <MovieCard item={item} key={item.id} onSelect={onSelect} />
      ))}
    </div>
  );
}

function getPaginationRange(currentPage: number, totalPages: number) {
  const pages: Array<number | "ellipsis-left" | "ellipsis-right"> = [];

  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  pages.push(1);

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  if (start > 2) {
    pages.push("ellipsis-left");
  }

  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }

  if (end < totalPages - 1) {
    pages.push("ellipsis-right");
  }

  pages.push(totalPages);

  return pages;
}

function Pagination({
  currentPage,
  totalPages,
  isLoading,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pageItems = getPaginationRange(currentPage, totalPages);

  return (
    <nav className="pagination" aria-label="Paginação dos resultados">
      <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1 || isLoading}>
        Anterior
      </button>
      <div className="pagination-pages">
        {pageItems.map((page) =>
          typeof page === "number" ? (
            <button
              type="button"
              key={page}
              className={page === currentPage ? "active" : ""}
              onClick={() => onPageChange(page)}
              disabled={page === currentPage || isLoading}
              aria-current={page === currentPage ? "page" : undefined}
            >
              {page}
            </button>
          ) : (
            <span key={page} aria-hidden="true">…</span>
          )
        )}
      </div>
      <button type="button" onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages || isLoading}>
        Próximo
      </button>
    </nav>
  );
}

function DetailsModal({
  details,
  isLoading,
  error,
  language,
  synopsis,
  onClose
}: {
  details: MovieDetails | null;
  isLoading: boolean;
  error: string;
  language: Language;
  synopsis: string;
  onClose: () => void;
}) {
  const copy = detailsCopy[language];
  const directorOrCreator = hasValue(details?.Director) ? details?.Director : hasValue(details?.Writer) ? details?.Writer : copy.unavailable;

  return (
    <div className="details-backdrop" role="presentation" onClick={onClose}>
      <section
        className="details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="close-details" onClick={onClose} aria-label={copy.close}>×</button>
        {isLoading ? (
          <div className="details-loading">{copy.loading}</div>
        ) : error ? (
          <div className="details-error">{error}</div>
        ) : details ? (
          <div className="details-content">
            <div className="details-poster">
              {details.Poster && details.Poster !== "N/A" ? (
                <img src={details.Poster} alt={`${copy.posterAlt} ${details.Title}`} />
              ) : (
                <div className="poster-fallback">AskFilm</div>
              )}
            </div>
            <div className="details-copy">
              <span className="details-kicker">{formatDetailsBadge(details.Type, language)} • {details.Year}</span>
              <h2 id="details-title">{details.Title}</h2>
              <div className="details-meta">
                <span>{hasValue(details.Runtime) ? details.Runtime : copy.runtimeUnavailable}</span>
                <span>{hasValue(details.imdbRating) ? `IMDb ${details.imdbRating}` : copy.ratingUnavailable}</span>
              </div>
              <div className="details-synopsis"><span>{copy.synopsis}</span><p className="details-plot">{synopsis || copy.synopsisUnavailable}</p></div>
              <dl className="details-list">
                <div><dt>{copy.genre}</dt><dd>{formatGenre(details.Genre, language)}</dd></div>
                <div><dt>{copy.directorCreator}</dt><dd>{directorOrCreator}</dd></div>
                <div><dt>{copy.cast}</dt><dd>{hasValue(details.Actors) ? details.Actors : copy.unavailable}</dd></div>
                <div><dt>{copy.type}</dt><dd>{formatDetailsType(details.Type, language)}</dd></div>
              </dl>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function Home() {
  const [activeMode, setActiveMode] = useState<ActiveMode>("recommend");
  const [searchTitle, setSearchTitle] = useState("");
  const [recommendationPrompt, setRecommendationPrompt] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Todos");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Digite uma busca ou peça uma recomendação para começar.");
  const [visibleItems, setVisibleItems] = useState<CatalogItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<MovieDetails | null>(null);
  const [detailsLanguage, setDetailsLanguage] = useState<Language>("pt-BR");
  const [translatedSynopsis, setTranslatedSynopsis] = useState("");
  const [isSynopsisTranslating, setIsSynopsisTranslating] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const resultsRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((currentIndex) => (currentIndex + 1) % placeholderExamples.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const originalPlot = hasValue(selectedDetails?.Plot) ? selectedDetails?.Plot ?? "" : "";

    if (!selectedDetails || !originalPlot || detailsLanguage === "en") {
      setTranslatedSynopsis("");
      setIsSynopsisTranslating(false);
      return () => {
        isCurrent = false;
      };
    }

    const cacheKey = `askfilm_translation_${selectedDetails.imdbID}_${detailsLanguage}`;
    const cachedTranslation = window.localStorage.getItem(cacheKey);

    if (cachedTranslation) {
      setTranslatedSynopsis(cachedTranslation);
      setIsSynopsisTranslating(false);
      return () => {
        isCurrent = false;
      };
    }

    setIsSynopsisTranslating(true);

    fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: originalPlot, targetLanguage: detailsLanguage })
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Translation failed");
        }

        return response.json() as Promise<{ translatedText?: string }>;
      })
      .then((data) => {
        if (!isCurrent) {
          return;
        }

        const nextTranslation = data.translatedText?.trim() || originalPlot;
        setTranslatedSynopsis(nextTranslation);
        window.localStorage.setItem(cacheKey, nextTranslation);
      })
      .catch(() => {
        if (isCurrent) {
          setTranslatedSynopsis(originalPlot);
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsSynopsisTranslating(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [detailsLanguage, selectedDetails]);

  const filteredItems = activeFilter === "Todos" ? visibleItems : visibleItems.filter((item) => item.type === activeFilter);

  function scrollToResults() {
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function runTitleSearch(query: string, page = 1) {
    setIsLoading(true);
    setHasSearched(true);
    setStatusMessage(page === 1 ? "Buscando títulos..." : `Carregando página ${page}...`);

    try {
      const response = await fetch(`/api/omdb?type=search&q=${encodeURIComponent(query)}&page=${page}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível buscar agora.");
      }

      const payload = data as OmdbSearchPayload;
      const items = payload.Search.map(mapSearchItem);
      const totalResults = Number(payload.totalResults);
      const nextTotalPages = Number.isFinite(totalResults) ? Math.ceil(totalResults / 10) : 0;

      setVisibleItems(items);
      setCurrentPage(page);
      setTotalPages(nextTotalPages);
      setLastSearchQuery(query);
      setStatusMessage(
        `Encontramos ${totalResults} resultado${totalResults === 1 ? "" : "s"} para “${query}”. Página ${page} de ${nextTotalPages}.`
      );
      scrollToResults();
    } catch (error) {
      setVisibleItems([]);
      setCurrentPage(1);
      setTotalPages(0);
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível buscar agora.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTitleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveMode("search");
    setActiveFilter("Todos");

    const query = searchTitle.trim();

    if (!query) {
      setVisibleItems([]);
      setCurrentPage(1);
      setTotalPages(0);
      setLastSearchQuery("");
      setHasSearched(true);
      setStatusMessage("Informe um título, gênero ou referência para buscar.");
      return;
    }

    await runTitleSearch(query, 1);
  }

  async function handleSelectMovie(item: CatalogItem) {
    setIsDetailsLoading(true);
    setDetailsError("");
    setSelectedDetails(null);

    try {
      const response = await fetch(`/api/omdb?type=details&id=${encodeURIComponent(item.id)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível abrir os detalhes agora.");
      }

      setSelectedDetails(data as MovieDetails);
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Não foi possível abrir os detalhes agora.");
    } finally {
      setIsDetailsLoading(false);
    }
  }

  function closeDetails() {
    setSelectedDetails(null);
    setTranslatedSynopsis("");
    setDetailsError("");
    setIsDetailsLoading(false);
  }

  function handleRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveMode("recommend");
    setHasSearched(true);
    setVisibleItems([]);
    setCurrentPage(1);
    setTotalPages(0);
    setLastSearchQuery("");
    setStatusMessage(
      recommendationPrompt.trim()
        ? "Pedido recebido. A integração com IA foi preservada; nenhum card fictício será exibido sem uma resposta conectada."
        : "Descreva o que você quer assistir para pedir uma recomendação."
    );
    scrollToResults();
  }

  function handlePageChange(page: number) {
    if (!lastSearchQuery || page < 1 || page > totalPages || page === currentPage) {
      return;
    }

    void runTitleSearch(lastSearchQuery, page);
  }

  return (
    <main className="app-shell">
      <header className="site-header" aria-label="Navegação principal">
        <a className="brand" href="#top" aria-label="AskFilm - página inicial">
          <span className="film-reel" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-wordmark">AF</span>
          <span className="brand-name">AskFilm</span>
        </a>
        <nav className="main-nav" aria-label="Seções do AskFilm">
          <button type="button" onClick={() => setActiveMode("search")}>Buscar</button>
          <button type="button" onClick={() => setActiveMode("recommend")}>Recomendar com IA</button>
          <a href="#results">Minha Lista</a>
          <a href="#how-it-works">Sobre</a>
          <button type="button" onClick={() => setDetailsLanguage((current) => current === "pt-BR" ? "en" : "pt-BR")} aria-label="Alternar idioma">{detailsLanguage === "pt-BR" ? "PT-BR" : "EN"}</button>
        </nav>
      </header>

      <section className="hero-section" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">AskFilm</p>
          <h1 id="hero-title">Encontre o filme certo para o seu momento.</h1>
          <p>Busque títulos ou descreva seu humor para receber uma curadoria mais inteligente, sem ruído visual.</p>
        </div>

        <div className="interaction-panel" aria-label="Modos de interação">
          <div className={`mode-toggle ${activeMode === "search" ? "is-search" : "is-recommend"}`} role="tablist" aria-label="Escolha um modo">
            <button
              type="button"
              className={activeMode === "search" ? "active" : ""}
              onClick={() => setActiveMode("search")}
              role="tab"
              aria-selected={activeMode === "search"}
            >
              Buscar
            </button>
            <button
              type="button"
              className={activeMode === "recommend" ? "active" : ""}
              onClick={() => setActiveMode("recommend")}
              role="tab"
              aria-selected={activeMode === "recommend"}
            >
              Recomendar com IA
            </button>
          </div>

          <div className="panel-section">
            <div className="mode-heading">
              <span>{activeMode === "search" ? "CATÁLOGO" : "RECOMENDAÇÃO"}</span>
              <h2>{activeMode === "search" ? "Busque por título" : "Conte o que quer assistir"}</h2>
            </div>
            {activeMode === "search" ? (
              <SearchBar
                isLoading={isLoading}
                placeholder={placeholderExamples[placeholderIndex]}
                value={searchTitle}
                onChange={setSearchTitle}
                onSubmit={handleTitleSearch}
              />
            ) : (
              <AIPromptBox
                isLoading={isLoading}
                value={recommendationPrompt}
                onChange={setRecommendationPrompt}
                onSubmit={handleRecommendation}
              />
            )}
          </div>
        </div>
      </section>

      <section className="results-section" id="results" aria-labelledby="results-title" ref={resultsRef}>
        <div className="results-heading">
          <div>
            <p className="eyebrow">Resultados</p>
            <h2 id="results-title">Sua curadoria</h2>
          </div>
          <div className="status-badge" aria-live="polite">{statusMessage}</div>
        </div>
        {visibleItems.length > 0 && <FilterBar activeFilter={activeFilter} onChange={setActiveFilter} />}
        {hasSearched && (visibleItems.length > 0 || isLoading) ? (
          <>
            <ResultsGrid isLoading={isLoading} items={filteredItems} onSelect={handleSelectMovie} />
            <Pagination currentPage={currentPage} totalPages={totalPages} isLoading={isLoading} onPageChange={handlePageChange} />
          </>
        ) : (
          <div className="empty-state">
            <p>Use a busca ou descreva uma vontade acima. Os resultados aparecerão aqui somente depois da sua ação.</p>
          </div>
        )}
      </section>

      <section className="how-it-works" id="how-it-works" aria-labelledby="how-title">
        <p className="eyebrow">Como funciona</p>
        <h2 id="how-title">Da vontade vaga ao título certo.</h2>
        <div className="steps-grid">
          <article>
            <span>01</span>
            <h3>Descreva o que quer</h3>
            <p>Use uma referência, gênero, humor ou restrição de tempo.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Busque ou peça IA</h3>
            <p>A tela prioriza sua intenção e evita cards fixos de demonstração.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Explore resultados reais</h3>
            <p>Os cards aparecem apenas após uma busca ou resposta conectada ao fluxo atual.</p>
          </article>
        </div>
      </section>

      {(isDetailsLoading || selectedDetails || detailsError) && (
        <DetailsModal
          details={selectedDetails}
          isLoading={isDetailsLoading}
          error={detailsError}
          language={detailsLanguage}
          synopsis={detailsLanguage === "pt-BR" ? (translatedSynopsis || (isSynopsisTranslating ? "" : selectedDetails?.Plot ?? "")) : hasValue(selectedDetails?.Plot) ? selectedDetails?.Plot ?? "" : ""}
          onClose={closeDetails}
        />
      )}

      <footer className="site-footer">AskFilm © 2026 — Curadoria audiovisual com IA</footer>
    </main>
  );
}
