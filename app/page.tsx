"use client";

import { FormEvent, useEffect, useState } from "react";

type ActiveMode = "search" | "recommend";
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

const placeholderExamples = ["Busque por um título...", "Ex.: filme de mistério", "Ex.: série de ficção científica"];
const suggestionChips = [
  "Anime psicológico e perturbador",
  "Thriller nórdico estilo True Detective",
  "Filme para choro em família",
  "Comédia britânica anos 90"
];
const filterOptions: FilterKey[] = ["Todos", "Filme", "Série"];

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

function MovieCard({ item }: { item: CatalogItem }) {
  const hasPoster = item.poster && item.poster !== "N/A";

  return (
    <article className="movie-card" aria-label={`${item.title}, ${item.type}`}>
      <div className="poster-art real-poster">
        {hasPoster ? <img src={item.poster} alt={`Pôster de ${item.title}`} /> : <div className="poster-fallback">AskFilm</div>}
        <span className="type-badge">{item.type.toUpperCase()}</span>
      </div>
      <div className="movie-caption">
        <div>
          <h3>{item.title}</h3>
          <p>{item.year}</p>
        </div>
      </div>
    </article>
  );
}

function ResultsGrid({ isLoading, items }: { isLoading: boolean; items: CatalogItem[] }) {
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
        <MovieCard item={item} key={item.id} />
      ))}
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

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((currentIndex) => (currentIndex + 1) % placeholderExamples.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  const filteredItems = activeFilter === "Todos" ? visibleItems : visibleItems.filter((item) => item.type === activeFilter);

  async function handleTitleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveMode("search");
    setIsLoading(true);
    setHasSearched(true);
    setStatusMessage("Buscando títulos...");
    setActiveFilter("Todos");

    const query = searchTitle.trim();

    if (!query) {
      setVisibleItems([]);
      setStatusMessage("Informe um título, gênero ou referência para buscar.");
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/omdb?type=search&q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível buscar agora.");
      }

      const items = (data.Search as SearchItem[]).map(mapSearchItem);
      setVisibleItems(items);
      setStatusMessage(`Encontramos ${items.length} resultado${items.length === 1 ? "" : "s"} para “${query}”.`);
    } catch (error) {
      setVisibleItems([]);
      setStatusMessage(error instanceof Error ? error.message : "Não foi possível buscar agora.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveMode("recommend");
    setHasSearched(true);
    setVisibleItems([]);
    setStatusMessage(
      recommendationPrompt.trim()
        ? "Pedido recebido. A recomendação com IA permanece sem cards fictícios nesta tela."
        : "Descreva o que você quer assistir para pedir uma recomendação."
    );
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
        </nav>
      </header>

      <section className="hero-section" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">AskFilm</p>
          <h1 id="hero-title">Encontre o filme certo para o seu momento.</h1>
          <p>Busque títulos ou descreva seu humor para receber uma curadoria mais inteligente, sem ruído visual.</p>
        </div>

        <div className="interaction-panel" aria-label="Modos de interação">
          <div className="mode-toggle" role="tablist" aria-label="Escolha um modo">
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
              <span>{activeMode === "search" ? "Catálogo" : "IA"}</span>
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

      <section className="results-section" id="results" aria-labelledby="results-title">
        <div className="results-heading">
          <div>
            <p className="eyebrow">Resultados</p>
            <h2 id="results-title">Sua curadoria</h2>
          </div>
          <div className="status-badge" aria-live="polite">{statusMessage}</div>
        </div>
        {visibleItems.length > 0 && <FilterBar activeFilter={activeFilter} onChange={setActiveFilter} />}
        {hasSearched && (visibleItems.length > 0 || isLoading) ? (
          <ResultsGrid isLoading={isLoading} items={filteredItems} />
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

      <footer className="site-footer">AskFilm © 2026 — Curadoria audiovisual com IA</footer>
    </main>
  );
}
