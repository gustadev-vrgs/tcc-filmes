"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type ActiveMode = "search" | "recommend";
type FilterKey = "Todos" | "Filme" | "Série" | "Anime" | "Doc";

type CatalogItem = {
  id: string;
  title: string;
  year: string;
  type: Exclude<FilterKey, "Todos">;
  genre: string;
  platform: string;
  rating: number;
  synopsis: string;
  palette: string;
};

const placeholderExamples = ["Blade Runner 2049...", "Neon Genesis Evangelion...", "Succession..."];
const suggestionChips = [
  "Anime psicológico e perturbador",
  "Thriller nórdico estilo True Detective",
  "Filme para choro em família",
  "Comédia britânica anos 90"
];
const filterOptions: FilterKey[] = ["Todos", "Filme", "Série", "Anime", "Doc"];

const catalogItems: CatalogItem[] = [
  {
    id: "arrival",
    title: "A Chegada",
    year: "2016",
    type: "Filme",
    genre: "Sci-fi contemplativo",
    platform: "Prime Video",
    rating: 4.7,
    synopsis: "Uma linguista decifra uma visita extraterrestre em uma narrativa sobre memória, tempo e afeto.",
    palette: "poster-amber"
  },
  {
    id: "severance",
    title: "Ruptura",
    year: "2022",
    type: "Série",
    genre: "Mistério corporativo",
    platform: "Apple TV+",
    rating: 4.8,
    synopsis: "Funcionários separam memórias pessoais e profissionais em um thriller elegante e inquietante.",
    palette: "poster-blue"
  },
  {
    id: "evangelion",
    title: "Neon Genesis Evangelion",
    year: "1995",
    type: "Anime",
    genre: "Drama psicológico",
    platform: "Netflix",
    rating: 4.9,
    synopsis: "Mechas, trauma e filosofia se encontram em um clássico de animação denso e perturbador.",
    palette: "poster-violet"
  },
  {
    id: "senna",
    title: "Senna",
    year: "2010",
    type: "Doc",
    genre: "Documentário esportivo",
    platform: "Globoplay",
    rating: 4.6,
    synopsis: "Arquivo, velocidade e mito constroem um retrato emocional de Ayrton Senna.",
    palette: "poster-green"
  },
  {
    id: "parasite",
    title: "Parasita",
    year: "2019",
    type: "Filme",
    genre: "Suspense social",
    platform: "Max",
    rating: 4.9,
    synopsis: "Uma família se infiltra na casa de outra em uma sátira afiada sobre classe e desejo.",
    palette: "poster-crimson"
  },
  {
    id: "dark",
    title: "Dark",
    year: "2017",
    type: "Série",
    genre: "Sci-fi temporal",
    platform: "Netflix",
    rating: 4.7,
    synopsis: "Desaparecimentos em uma cidade alemã revelam ciclos familiares, paradoxos e segredos.",
    palette: "poster-slate"
  },
  {
    id: "perfect-blue",
    title: "Perfect Blue",
    year: "1997",
    type: "Anime",
    genre: "Thriller psicológico",
    platform: "MUBI",
    rating: 4.8,
    synopsis: "Uma idol em transição para atriz perde a fronteira entre performance, perseguição e identidade.",
    palette: "poster-pink"
  },
  {
    id: "jane",
    title: "Jane",
    year: "2017",
    type: "Doc",
    genre: "Natureza e biografia",
    platform: "Disney+",
    rating: 4.5,
    synopsis: "Imagens raras compõem um retrato íntimo da pesquisadora Jane Goodall e dos chimpanzés.",
    palette: "poster-earth"
  }
];

function getStars(rating: number) {
  return "★".repeat(Math.round(rating));
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
          Tipo: {filter}
        </button>
      ))}
      <button type="button" className="filter-pill">Gênero</button>
      <button type="button" className="filter-pill">Plataforma</button>
      <button type="button" className="filter-pill">Avaliação 4+</button>
    </div>
  );
}

function MovieCard({ item }: { item: CatalogItem }) {
  return (
    <article className="movie-card" aria-label={`${item.title}, ${item.type}`}>
      <div className={`poster-art ${item.palette}`}>
        <button type="button" className="bookmark-button" aria-label={`Salvar ${item.title} na lista`}>⌑</button>
        <span className="type-badge">{item.type.toUpperCase()}</span>
        <div className="poster-title" aria-hidden="true">
          <span>{item.title}</span>
        </div>
        <div className="movie-overlay">
          <p className="rating" aria-label={`Avaliação ${item.rating} de 5`}>
            <span aria-hidden="true">{getStars(item.rating)}</span> {item.rating.toFixed(1)}
          </p>
          <h3>{item.title}</h3>
          <p>{item.synopsis}</p>
          <button type="button">Ver detalhes</button>
        </div>
      </div>
      <div className="movie-caption">
        <div>
          <h3>{item.title}</h3>
          <p>{item.year} · {item.genre}</p>
        </div>
        <strong>{item.rating.toFixed(1)}</strong>
      </div>
    </article>
  );
}

function ResultsGrid({ isLoading, items }: { isLoading: boolean; items: CatalogItem[] }) {
  if (isLoading) {
    return (
      <div className="results-grid" aria-label="Carregando recomendações">
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="skeleton-card" key={index}>
            <span />
            <strong />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="results-grid" aria-label="Resultados de curadoria audiovisual">
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
  const [statusMessage, setStatusMessage] = useState("Seleção editorial inicial com filmes, séries, animes e documentários.");
  const [visibleItems, setVisibleItems] = useState<CatalogItem[]>(catalogItems);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((currentIndex) => (currentIndex + 1) % placeholderExamples.length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, []);

  const filteredItems = useMemo(() => {
    if (activeFilter === "Todos") {
      return visibleItems;
    }

    return visibleItems.filter((item) => item.type === activeFilter);
  }, [activeFilter, visibleItems]);

  function finishWithMockResults(nextItems: CatalogItem[], message: string) {
    window.setTimeout(() => {
      setVisibleItems(nextItems);
      setStatusMessage(message);
      setIsLoading(false);
    }, 700);
  }

  function handleTitleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveMode("search");
    setIsLoading(true);
    setStatusMessage("Buscando no catálogo editorial...");

    const query = searchTitle.trim().toLowerCase();
    const nextItems = query
      ? catalogItems.filter((item) => `${item.title} ${item.genre} ${item.type}`.toLowerCase().includes(query))
      : catalogItems;

    finishWithMockResults(
      nextItems.length > 0 ? nextItems : catalogItems.slice(0, 4),
      nextItems.length > 0
        ? `Encontramos ${nextItems.length} curadoria${nextItems.length === 1 ? "" : "s"} para sua busca.`
        : "Nada exato no mock visual; exibimos títulos próximos para explorar."
    );
  }

  function handleRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveMode("recommend");
    setIsLoading(true);
    setStatusMessage("IA respondendo");

    const prompt = recommendationPrompt.toLowerCase();
    const nextItems = catalogItems.filter((item) => {
      const searchable = `${item.title} ${item.genre} ${item.synopsis} ${item.type}`.toLowerCase();
      return prompt.split(" ").some((word) => word.length > 4 && searchable.includes(word));
    });

    finishWithMockResults(
      nextItems.length > 0 ? nextItems : [catalogItems[2], catalogItems[6], catalogItems[1], catalogItems[4]],
      "Recomendação simulada pronta: uma seleção com tensão, autoria e atmosfera."
    );
  }

  return (
    <main className="app-shell">
      <header className="site-header" aria-label="Navegação principal">
        <a className="brand" href="#top" aria-label="AskFilmX - página inicial">
          <span className="film-reel" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <span className="brand-wordmark">AFX</span>
          <span className="brand-name">AskFilmX</span>
        </a>
        <nav className="main-nav" aria-label="Seções do AskFilmX">
          <button type="button" onClick={() => setActiveMode("search")}>Buscar</button>
          <button type="button" onClick={() => setActiveMode("recommend")}>Recomendar com IA</button>
          <a href="#results">Minha Lista</a>
          <a href="#how-it-works">Sobre</a>
        </nav>
      </header>

      <section className="hero-section" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Cinematic editorial intelligence</p>
          <h1 id="hero-title">O que você quer assistir hoje?</h1>
          <p>Curadoria inteligente para cinéfilos exigentes.</p>
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
              <span>{activeMode === "search" ? "Modo 1" : "Modo 2"}</span>
              <h2>{activeMode === "search" ? "Busca por título" : "Recomendação por IA"}</h2>
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
            <p className="eyebrow">Seleção em cartaz</p>
            <h2 id="results-title">Resultados curados</h2>
          </div>
          <div className={isLoading && activeMode === "recommend" ? "status-badge typing" : "status-badge"} aria-live="polite">
            {statusMessage}
            {isLoading && activeMode === "recommend" && <span aria-hidden="true"><i /> <i /> <i /></span>}
          </div>
        </div>
        <FilterBar activeFilter={activeFilter} onChange={setActiveFilter} />
        <ResultsGrid isLoading={isLoading} items={filteredItems} />
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
            <h3>IA analisa seu gosto</h3>
            <p>O mock simula uma leitura editorial do seu pedido.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Receba recomendações</h3>
            <p>Explore pôsteres, rating e contexto em uma grade de catálogo.</p>
          </article>
        </div>
      </section>

      <footer className="site-footer">AskFilmX © 2025 — Curadoria audiovisual com IA</footer>
    </main>
  );
}
