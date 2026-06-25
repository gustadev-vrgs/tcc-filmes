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

const translations = {
  "pt-BR": {
    search: "Buscar", aiRecommendation: "Recomendar com IA", myList: "Minha Lista", about: "Sobre",
    searchByTitle: "Busque por título", searchPlaceholder: "Busque por um título...", searchLoading: "Buscando", getRecommendation: "Pedir recomendação",
    tellUs: "Conte o que quer assistir", describeMood: "Descreva seu momento, humor ou referência cinematográfica.", yourCuration: "Sua curadoria",
    all: "Todos", movie: "Filme", series: "Série", previous: "Anterior", next: "Próximo", catalog: "CATÁLOGO", recommendation: "RECOMENDAÇÃO",
    heroTitle: "Encontre o filme certo para o seu momento.", heroText: "Busque títulos ou descreva seu humor para receber uma curadoria mais inteligente, sem ruído visual.",
    results: "Resultados", initialStatus: "Digite uma busca ou peça uma recomendação para começar.", emptyState: "Use a busca ou descreva uma vontade acima. Os resultados aparecerão aqui somente depois da sua ação.",
    titleRequired: "Informe um título, gênero ou referência para buscar.", searchingTitles: "Buscando títulos...", loadingPage: "Carregando página", unableSearch: "Não foi possível buscar agora.",
    foundPrefix: "Encontramos", resultSingular: "resultado", resultPlural: "resultados", forText: "para", pageText: "Página", ofText: "de",
    requestReceived: "Pedido recebido. A integração com IA foi preservada; nenhum card fictício será exibido sem uma resposta conectada.", describeToRecommend: "Descreva o que você quer assistir para pedir uma recomendação.",
    aiPlaceholder: "Ex.: Quero algo melancólico, visualmente sofisticado, com ritmo contemplativo e final marcante.", suggestionsLabel: "Sugestões de prompts", filtersLabel: "Filtros de resultados", resultsLabel: "Resultados de busca audiovisual", loadingResults: "Carregando resultados",
    openDetails: "Abrir detalhes de", posterOf: "Pôster de", closeDetails: "Fechar detalhes", loadingDetails: "Carregando detalhes...", unableDetails: "Não foi possível abrir os detalhes agora.",
    runtimeUnavailable: "Duração indisponível", ratingUnavailable: "Nota indisponível", plotUnavailable: "Sinopse indisponível.", genre: "Gênero", direction: "Direção / criação", cast: "Elenco", type: "Tipo", unavailable: "Indisponível",
    help: "Pesquise um título ou descreva o que quer assistir. O AskFilm busca resultados reais e mostra filmes ou séries relacionados.", footer: "AskFilm © 2026 — Curadoria audiovisual com IA"
  },
  en: {
    search: "Search", aiRecommendation: "AI Recommendation", myList: "My List", about: "About",
    searchByTitle: "Search by title", searchPlaceholder: "Search for a title...", searchLoading: "Searching", getRecommendation: "Get recommendation",
    tellUs: "Tell us what you want to watch", describeMood: "Describe your mood, moment, or cinematic reference.", yourCuration: "Your curation",
    all: "All", movie: "Movie", series: "Series", previous: "Previous", next: "Next", catalog: "CATALOG", recommendation: "RECOMMENDATION",
    heroTitle: "Find the right film for your moment.", heroText: "Search titles or describe your mood to get smarter curation without visual noise.",
    results: "Results", initialStatus: "Enter a search or ask for a recommendation to get started.", emptyState: "Use search or describe what you want above. Results will appear here only after your action.",
    titleRequired: "Enter a title, genre, or reference to search.", searchingTitles: "Searching titles...", loadingPage: "Loading page", unableSearch: "Search is unavailable right now.",
    foundPrefix: "Found", resultSingular: "result", resultPlural: "results", forText: "for", pageText: "Page", ofText: "of",
    requestReceived: "Request received. The AI integration was preserved; no fake cards will be shown without a connected response.", describeToRecommend: "Describe what you want to watch to request a recommendation.",
    aiPlaceholder: "E.g.: I want something melancholy, visually sophisticated, contemplative, with a striking ending.", suggestionsLabel: "Prompt suggestions", filtersLabel: "Result filters", resultsLabel: "Audiovisual search results", loadingResults: "Loading results",
    openDetails: "Open details for", posterOf: "Poster for", closeDetails: "Close details", loadingDetails: "Loading details...", unableDetails: "Details are unavailable right now.",
    runtimeUnavailable: "Runtime unavailable", ratingUnavailable: "Rating unavailable", plotUnavailable: "Plot unavailable.", genre: "Genre", direction: "Direction / creation", cast: "Cast", type: "Type", unavailable: "Unavailable",
    help: "Search for a title or describe what you want to watch. AskFilm finds real results and shows related movies or series.", footer: "AskFilm © 2026 — Audiovisual curation with AI"
  }
} as const;

const placeholderExamples: Record<Language, string[]> = {
  "pt-BR": ["Busque por um título...", "Ex.: filme de mistério", "Ex.: série de ficção científica"],
  en: ["Search for a title...", "E.g.: mystery movie", "E.g.: science fiction series"]
};
const suggestionChips: Record<Language, string[]> = {
  "pt-BR": ["Anime psicológico e perturbador", "Thriller nórdico estilo True Detective", "Filme para choro em família", "Comédia britânica anos 90"],
  en: ["Dark psychological anime", "Nordic thriller like True Detective", "Family tearjerker movie", "90s British comedy"]
};
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
  labels,
  onChange,
  onSubmit
}: {
  isLoading: boolean;
  placeholder: string;
  value: string;
  labels: (typeof translations)[Language];
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="spotlight-search" onSubmit={onSubmit} aria-label={labels.searchByTitle}>
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
        {isLoading ? labels.searchLoading : labels.search}
      </button>
    </form>
  );
}

function AIPromptBox({
  isLoading,
  value,
  labels,
  chips,
  onChange,
  onSubmit
}: {
  isLoading: boolean;
  value: string;
  labels: (typeof translations)[Language];
  chips: string[];
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="ai-prompt-card" onSubmit={onSubmit} aria-label={labels.aiRecommendation}>
      <label htmlFor="ai-recommendation">{labels.describeMood}</label>
      <textarea
        id="ai-recommendation"
        name="recommendation"
        placeholder={labels.aiPlaceholder}
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <div className="prompt-footer">
        <div className="suggestion-chips" aria-label={labels.suggestionsLabel}>
          {chips.map((chip) => (
            <button key={chip} type="button" onClick={() => onChange(chip)}>
              {chip}
            </button>
          ))}
        </div>
        <button type="submit" className="gold-button sparkle-button" disabled={isLoading}>
          <span aria-hidden="true">✦</span>
          {labels.getRecommendation}
        </button>
      </div>
    </form>
  );
}

function translateFilter(filter: FilterKey, labels: (typeof translations)[Language]) {
  if (filter === "Todos") return labels.all;
  if (filter === "Filme") return labels.movie;
  if (filter === "Série") return labels.series;
  return filter;
}

function FilterBar({ activeFilter, labels, onChange }: { activeFilter: FilterKey; labels: (typeof translations)[Language]; onChange: (filter: FilterKey) => void }) {
  return (
    <div className="filter-bar" aria-label={labels.filtersLabel}>
      {filterOptions.map((filter) => (
        <button
          type="button"
          key={filter}
          className={activeFilter === filter ? "filter-pill active" : "filter-pill"}
          onClick={() => onChange(filter)}
        >
          {translateFilter(filter, labels)}
        </button>
      ))}
    </div>
  );
}

function MovieCard({ item, labels, onSelect }: { item: CatalogItem; labels: (typeof translations)[Language]; onSelect: (item: CatalogItem) => void }) {
  const hasPoster = item.poster && item.poster !== "N/A";

  return (
    <article className="movie-card" aria-label={`${item.title}, ${translateFilter(item.type, labels)}`}>
      <button
        type="button"
        className="poster-art real-poster poster-button"
        onClick={() => onSelect(item)}
        aria-label={`${labels.openDetails} ${item.title}`}
      >
        {hasPoster ? <img src={item.poster} alt={`${labels.posterOf} ${item.title}`} /> : <div className="poster-fallback">AskFilm</div>}
        <span className="type-badge">{translateFilter(item.type, labels).toUpperCase()}</span>
      </button>
      <div className="movie-caption">
        <h3>{item.title}</h3>
        <p>{item.year} • {translateFilter(item.type, labels)}</p>
      </div>
    </article>
  );
}

function ResultsGrid({ isLoading, items, labels, onSelect }: { isLoading: boolean; items: CatalogItem[]; labels: (typeof translations)[Language]; onSelect: (item: CatalogItem) => void }) {
  if (isLoading) {
    return (
      <div className="results-grid" aria-label={labels.loadingResults}>
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
    <div className="results-grid" aria-label={labels.resultsLabel}>
      {items.map((item) => (
        <MovieCard item={item} key={item.id} labels={labels} onSelect={onSelect} />
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
  labels,
  onPageChange
}: {
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  labels: (typeof translations)[Language];
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pageItems = getPaginationRange(currentPage, totalPages);

  return (
    <nav className="pagination" aria-label={labels.results}>
      <button type="button" onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1 || isLoading}>
        {labels.previous}
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
        {labels.next}
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
  const [language, setLanguage] = useState<Language>("pt-BR");
  const [searchTitle, setSearchTitle] = useState("");
  const [recommendationPrompt, setRecommendationPrompt] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Todos");
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>(translations["pt-BR"].initialStatus);
  const [visibleItems, setVisibleItems] = useState<CatalogItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState<MovieDetails | null>(null);
  const [language, setLanguage] = useState<Language>("pt-BR");
  const [translatedSynopsis, setTranslatedSynopsis] = useState("");
  const [isSynopsisTranslating, setIsSynopsisTranslating] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const resultsRef = useRef<HTMLElement | null>(null);
  const labels = translations[language];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((currentIndex) => (currentIndex + 1) % placeholderExamples[language].length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, [language]);

  useEffect(() => {
    const savedLanguage = window.localStorage.getItem("askfilm-language");
    if (savedLanguage === "pt-BR" || savedLanguage === "en") {
      setLanguage(savedLanguage);
      setStatusMessage(translations[savedLanguage].initialStatus);
    }
  }, []);

  useEffect(() => {
    let isCurrent = true;
    const originalPlot = hasValue(selectedDetails?.Plot) ? selectedDetails?.Plot ?? "" : "";

    if (!selectedDetails || !originalPlot || language === "en") {
      setTranslatedSynopsis("");
      setIsSynopsisTranslating(false);
      return () => {
        isCurrent = false;
      };
    }

    const cacheKey = `askfilm_translation_${selectedDetails.imdbID}_${language}`;
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
      body: JSON.stringify({ text: originalPlot, targetLanguage: language })
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
  }, [language, selectedDetails]);

  const filteredItems = activeFilter === "Todos" ? visibleItems : visibleItems.filter((item) => item.type === activeFilter);

  function scrollToResults() {
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function runTitleSearch(query: string, page = 1) {
    setIsLoading(true);
    setHasSearched(true);
    setStatusMessage(page === 1 ? labels.searchingTitles : `${labels.loadingPage} ${page}...`);

    try {
      const response = await fetch(`/api/omdb?type=search&q=${encodeURIComponent(query)}&page=${page}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? labels.unableSearch);
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
        `${labels.foundPrefix} ${totalResults} ${totalResults === 1 ? labels.resultSingular : labels.resultPlural} ${labels.forText} “${query}”. ${labels.pageText} ${page} ${labels.ofText} ${nextTotalPages}.`
      );
      scrollToResults();
    } catch (error) {
      setVisibleItems([]);
      setCurrentPage(1);
      setTotalPages(0);
      setStatusMessage(error instanceof Error ? error.message : labels.unableSearch);
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
      setStatusMessage(labels.titleRequired);
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
        throw new Error(data.error ?? labels.unableDetails);
      }

      setSelectedDetails(data as MovieDetails);
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : labels.unableDetails);
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
        ? labels.requestReceived
        : labels.describeToRecommend
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
          <button type="button" onClick={() => setLanguage((current) => current === "pt-BR" ? "en" : "pt-BR")} aria-label="Alternar idioma">{language === "pt-BR" ? "PT-BR" : "EN"}</button>
        </nav>
      </header>

      <section className="hero-section" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">AskFilm</p>
          <h1 id="hero-title">{labels.heroTitle}</h1>
          <p>{labels.heroText}</p>
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
              {labels.search}
            </button>
            <button
              type="button"
              className={activeMode === "recommend" ? "active" : ""}
              onClick={() => setActiveMode("recommend")}
              role="tab"
              aria-selected={activeMode === "recommend"}
            >
              {labels.aiRecommendation}
            </button>
          </div>

          <div className="panel-section">
            <div className="mode-heading">
              <span>{activeMode === "search" ? labels.catalog : labels.recommendation}</span>
              <h2>{activeMode === "search" ? labels.searchByTitle : labels.tellUs}</h2>
            </div>
            {activeMode === "search" ? (
              <SearchBar
                isLoading={isLoading}
                placeholder={placeholderExamples[language][placeholderIndex]}
                value={searchTitle}
                labels={labels}
                onChange={setSearchTitle}
                onSubmit={handleTitleSearch}
              />
            ) : (
              <AIPromptBox
                isLoading={isLoading}
                value={recommendationPrompt}
                labels={labels}
                chips={suggestionChips[language]}
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
            <p className="eyebrow">{labels.results}</p>
            <h2 id="results-title">{labels.yourCuration}</h2>
          </div>
          <div className="status-badge" aria-live="polite">{statusMessage}</div>
        </div>
        {visibleItems.length > 0 && <FilterBar activeFilter={activeFilter} labels={labels} onChange={setActiveFilter} />}
        {hasSearched && (visibleItems.length > 0 || isLoading) ? (
          <>
            <ResultsGrid isLoading={isLoading} items={filteredItems} labels={labels} onSelect={handleSelectMovie} />
            <Pagination currentPage={currentPage} totalPages={totalPages} isLoading={isLoading} labels={labels} onPageChange={handlePageChange} />
          </>
        ) : (
          <div className="empty-state">
            <p>{labels.emptyState}</p>
          </div>
        )}
      </section>

      {(isDetailsLoading || selectedDetails || detailsError) && (
        <DetailsModal
          details={selectedDetails}
          isLoading={isDetailsLoading}
          error={detailsError}
          language={language}
          synopsis={language === "pt-BR" ? (translatedSynopsis || (isSynopsisTranslating ? "" : selectedDetails?.Plot ?? "")) : hasValue(selectedDetails?.Plot) ? selectedDetails?.Plot ?? "" : ""}
          onClose={closeDetails}
        />
      )}

      <footer className="site-footer">{labels.footer}</footer>
    </main>
  );
}
