"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { type CatalogItem, type Language, type MovieDetails } from "../lib/catalog";
import { getLanguagePreference, getLegacyFavoriteIds, loadMyList, MAX_LIST_ITEMS, mergeMyLists, MY_LIST_KEY, parseMyListJson, persistMyList, safePosterUrl, saveLanguagePreference, type MyListItem } from "../lib/local-storage";
import { isCatalogSearchPayload } from "../lib/validation";
import { isRecommendationResponse } from "../lib/recommendation";
import { LOCAL_MODELS, LocalAiManager, type LocalStatus } from "../lib/client/local-ai";

type ActiveMode = "search" | "recommend";
type FilterKey = "Todos" | "Filme" | "Série";
type ChatMessage = { role: "user" | "assistant"; content: string };
type SummaryState = { text: string; engine: string; model: string; promptVersion: string };
type Credit = { id: number; name: string; character?: string; job?: string; profile_path?: string | null };
type Video = { key: string; site: string; type: string; official?: boolean; name: string };
type Provider = { provider_id: number; provider_name: string; logo_path?: string | null };
type Extras = { tmdbId: number | null; cast: Credit[]; crew: Credit[]; videos: Video[]; providers: { link?: string; flatrate?: Provider[]; rent?: Provider[]; buy?: Provider[] } | null; related: CatalogItem[]; loading: boolean; partial: boolean };
const emptyExtras: Extras = { tmdbId: null, cast: [], crew: [], videos: [], providers: null, related: [], loading: false, partial: false };

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
    requestReceived: "Pedido recebido.", describeToRecommend: "Descreva o que você quer assistir para pedir uma recomendação.", broadenSearch: "Ampliar busca removendo gênero e período", partialCatalog: "Parte do catálogo não respondeu.",
    aiPlaceholder: "Ex.: Quero algo melancólico, visualmente sofisticado, com ritmo contemplativo e final marcante.", suggestionsLabel: "Sugestões de prompts", filtersLabel: "Filtros de resultados", resultsLabel: "Resultados de busca audiovisual", loadingResults: "Carregando resultados",
    openDetails: "Abrir detalhes de", posterOf: "Pôster de", closeDetails: "Fechar detalhes", loadingDetails: "Carregando detalhes...", unableDetails: "Não foi possível abrir os detalhes agora.",
    runtimeUnavailable: "Duração indisponível", ratingUnavailable: "Nota indisponível", plotUnavailable: "Sinopse indisponível.", genre: "Gênero", direction: "Direção / criação", cast: "Elenco", type: "Tipo", unavailable: "Indisponível",
    addList: "Adicionar à lista", removeList: "Remover da lista", savedHere: "Sua lista fica salva neste navegador", noSync: "Não há sincronização automática. Apagar os dados deste site remove a lista.", clearList: "Limpar lista", clearConfirm: "Remover todos os títulos da sua lista?", exportList: "Exportar JSON", importList: "Importar JSON", listEmpty: "Sua lista está vazia.", searchAction: "Pesquisar títulos", listLoading: "Carregando sua lista...", storageWarning: "O armazenamento está indisponível. Você pode usar a lista temporariamente nesta aba.", invalidImport: "O arquivo não contém uma lista válida.", importDone: "Lista combinada sem duplicações.", legacyOffer: "Encontramos favoritos do protótipo neste navegador.", legacyImport: "Importar favoritos", limitReached: "A lista atingiu o limite de 250 títulos.",
    aiTitle: "AskFilmX sobre este título", aiSummary: "Resumo curto", generateSummary: "Gerar resumo", retry: "Tentar novamente", aiGenerated: "Gerado por IA", engine: "Mecanismo", openAiEngine: "OpenAI · gpt-4.1-mini (nuvem)", paidNotice: "Este mecanismo pode gerar cobrança. Ele só é usado quando você pedir.", chatTitle: "Converse sobre o título", chatPlaceholder: "Pergunte sobre este título…", send: "Enviar", temporaryChat: "Conversa temporária: será apagada ao recarregar.", newChat: "Nova conversa", noPlotAi: "Sem sinopse suficiente para um resumo confiável.", aiError: "Não foi possível obter uma resposta.",
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
    requestReceived: "Request received.", describeToRecommend: "Describe what you want to watch to request a recommendation.", broadenSearch: "Broaden search by removing genre and period", partialCatalog: "Part of the catalog did not respond.",
    aiPlaceholder: "E.g.: I want something melancholy, visually sophisticated, contemplative, with a striking ending.", suggestionsLabel: "Prompt suggestions", filtersLabel: "Result filters", resultsLabel: "Audiovisual search results", loadingResults: "Loading results",
    openDetails: "Open details for", posterOf: "Poster for", closeDetails: "Close details", loadingDetails: "Loading details...", unableDetails: "Details are unavailable right now.",
    runtimeUnavailable: "Runtime unavailable", ratingUnavailable: "Rating unavailable", plotUnavailable: "Plot unavailable.", genre: "Genre", direction: "Direction / creation", cast: "Cast", type: "Type", unavailable: "Unavailable",
    addList: "Add to list", removeList: "Remove from list", savedHere: "Your list is saved in this browser", noSync: "There is no automatic sync. Clearing this site's data removes the list.", clearList: "Clear list", clearConfirm: "Remove every title from your list?", exportList: "Export JSON", importList: "Import JSON", listEmpty: "Your list is empty.", searchAction: "Search titles", listLoading: "Loading your list...", storageWarning: "Storage is unavailable. You can use the list temporarily in this tab.", invalidImport: "This file does not contain a valid list.", importDone: "List merged without duplicates.", legacyOffer: "We found prototype favorites in this browser.", legacyImport: "Import favorites", limitReached: "Your list has reached the 250-title limit.",
    aiTitle: "AskFilmX for this title", aiSummary: "Short summary", generateSummary: "Generate summary", retry: "Try again", aiGenerated: "AI-generated", engine: "Engine", openAiEngine: "OpenAI · gpt-4.1-mini (cloud)", paidNotice: "This engine may incur charges. It is used only when you request it.", chatTitle: "Discuss this title", chatPlaceholder: "Ask about this title…", send: "Send", temporaryChat: "Temporary chat: it will be erased when you reload.", newChat: "New conversation", noPlotAi: "Not enough plot information for a reliable summary.", aiError: "A response could not be obtained.",
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

function MovieCard({ item, labels, onSelect, saved, onToggle }: { item: CatalogItem; labels: (typeof translations)[Language]; onSelect: (item: CatalogItem) => void; saved: boolean; onToggle: (item: CatalogItem) => void }) {
  const poster = safePosterUrl(item.poster);

  return (
    <article className="movie-card" aria-label={`${item.title}, ${translateFilter(item.type, labels)}`}>
      <button
        type="button"
        className="poster-art real-poster poster-button"
        onClick={() => onSelect(item)}
        aria-label={`${labels.openDetails} ${item.title}`}
      >
        {poster ? <img src={poster} alt={`${labels.posterOf} ${item.title}`} /> : <div className="poster-fallback">AskFilm</div>}
        <span className="type-badge">{translateFilter(item.type, labels).toUpperCase()}</span>
      </button>
      <div className="movie-caption">
        <h3>{item.title}</h3>
        <p>{item.year} • {translateFilter(item.type, labels)}</p>
        {item.reason && <p className="recommendation-reason">{item.reason}</p>}
        <button type="button" className={`list-toggle ${saved ? "saved" : ""}`} onClick={() => onToggle(item)} aria-pressed={saved}>{saved ? `✓ ${labels.removeList}` : `＋ ${labels.addList}`}</button>
      </div>
    </article>
  );
}

function ResultsGrid({ isLoading, items, labels, onSelect, isSaved, onToggle }: { isLoading: boolean; items: CatalogItem[]; labels: (typeof translations)[Language]; onSelect: (item: CatalogItem) => void; isSaved: (item: CatalogItem) => boolean; onToggle: (item: CatalogItem) => void }) {
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
        <MovieCard item={item} key={item.id} labels={labels} onSelect={onSelect} saved={isSaved(item)} onToggle={onToggle} />
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
  labels,
  onClose, saved, onToggle, summary, aiLoading, aiError, chat, question, engineLabel, onQuestionChange, onSummary, onChat, onNewChat, onRetry,
  extras, region, language, onRegionChange, onSelectRelated
}: {
  details: MovieDetails | null;
  isLoading: boolean;
  error: string;
  labels: (typeof translations)[Language];
  onClose: () => void;
  saved: boolean;
  onToggle: (details: MovieDetails) => void;
  summary: SummaryState | null;
  aiLoading: "summary" | "chat" | null;
  aiError: string;
  chat: ChatMessage[];
  question: string;
  engineLabel: string;
  onQuestionChange: (value: string) => void;
  onSummary: () => void;
  onChat: (event: FormEvent<HTMLFormElement>) => void;
  onNewChat: () => void;
  onRetry: () => void;
  extras: Extras;
  region: string;
  language: Language;
  onRegionChange: (region: string) => void;
  onSelectRelated: (item: CatalogItem) => void;
}) {
  const modalRef = useRef<HTMLElement | null>(null);
  const [videoKey, setVideoKey] = useState<string | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    modal?.querySelector<HTMLElement>("button")?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !modal) return;
      const nodes = Array.from(modal.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
      if (!nodes.length) return;
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = ""; previous?.focus(); };
  }, []);
  const copy = language === "pt-BR" ? {
    catalogRating: "Nota do catálogo", votesNotice: "Esta é uma nota do catálogo, não uma avaliação de usuários do AskFilmX.",
    watch: "Onde assistir", region: "Região", subscription: "Assinatura", rent: "Aluguel", buy: "Compra", noWatch: "Sem dados de disponibilidade para esta região.",
    trailer: "Trailer", play: "Reproduzir trailer", noTrailer: "Nenhum trailer adequado informado pelo catálogo.", credits: "Elenco e ficha técnica", crew: "Ficha técnica", related: "Você também pode gostar", loading: "Carregando dados complementares…", source: "Dados e imagens: TMDB. Disponibilidade sujeita a alterações; confirme no provedor.", noCredits: "Elenco e equipe não informados."
  } : {
    catalogRating: "Catalog rating", votesNotice: "This is a catalog rating, not an AskFilmX user review.",
    watch: "Where to watch", region: "Region", subscription: "Subscription", rent: "Rent", buy: "Buy", noWatch: "No availability data for this region.",
    trailer: "Trailer", play: "Play trailer", noTrailer: "No suitable trailer was provided by the catalog.", credits: "Cast and crew", crew: "Crew", related: "You may also like", loading: "Loading additional data…", source: "Data and images: TMDB. Availability may change; confirm with the provider.", noCredits: "Cast and crew not provided."
  };
  const trailer = extras.videos.find((video) => video.site === "YouTube" && /^[\w-]{11}$/.test(video.key) && video.type === "Trailer")
    ?? extras.videos.find((video) => video.site === "YouTube" && /^[\w-]{11}$/.test(video.key));
  const providerGroups: Array<[string, Provider[] | undefined]> = [[copy.subscription, extras.providers?.flatrate], [copy.rent, extras.providers?.rent], [copy.buy, extras.providers?.buy]];
  return (
    <div className="details-backdrop" role="presentation" onClick={onClose}>
      <section
        ref={modalRef}
        className="details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="close-details" onClick={onClose} aria-label={labels.closeDetails}>×</button>
        {isLoading ? (
          <div className="details-loading">{labels.loadingDetails}</div>
        ) : error ? (
          <div className="details-error">{error}</div>
        ) : details ? (
          <div className="details-content">
            <div className="details-poster">
              {details.poster && details.poster !== "N/A" ? (
                <img src={details.poster} alt={`${labels.posterOf} ${details.title}`} />
              ) : (
                <div className="poster-fallback">AskFilm</div>
              )}
            </div>
            <div className="details-copy">
              <span className="details-kicker">{details.mediaType === "series" ? labels.series : labels.movie} • {details.year ?? "—"}</span>
              <h2 id="details-title">{details.title}</h2>
              <div className="details-meta">
                <span>{details.runtime ?? labels.runtimeUnavailable}</span>
                <span>{details.imdbRating && details.imdbRating !== "N/A" ? `${copy.catalogRating}: IMDb ${details.imdbRating}` : labels.ratingUnavailable}</span>
              </div>
              <small className="catalog-note">{copy.votesNotice}</small>
              <p className="details-plot">{details.plot ?? labels.plotUnavailable}</p>
              <dl className="details-list">
                <div><dt>{labels.genre}</dt><dd>{details.genre ?? labels.unavailable}</dd></div>
                <div><dt>{labels.direction}</dt><dd>{details.director ?? details.writer ?? labels.unavailable}</dd></div>
                <div><dt>{labels.cast}</dt><dd>{details.actors ?? labels.unavailable}</dd></div>
                <div><dt>{labels.type}</dt><dd>{details.mediaType === "series" ? labels.series : labels.movie}</dd></div>
              </dl>
              <button type="button" className={`gold-button detail-list-button ${saved ? "saved" : ""}`} onClick={() => onToggle(details)} aria-pressed={saved}>{saved ? `✓ ${labels.removeList}` : `＋ ${labels.addList}`}</button>
              <div className="detail-extras" aria-busy={extras.loading}>
                {extras.loading && <p className="extras-loading">{copy.loading}</p>}
                <section><h3>{copy.trailer}</h3>{trailer ? (videoKey === trailer.key ? <div className="video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1`} title={trailer.name} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /></div> : <button className="secondary-button" type="button" onClick={() => setVideoKey(trailer.key)}>▶ {copy.play}</button>) : !extras.loading && <p className="empty-copy">{copy.noTrailer}</p>}</section>
                <section><div className="section-title-row"><h3>{copy.watch}</h3><label>{copy.region}<select value={region} onChange={(event) => onRegionChange(event.target.value)}><option value="BR">Brasil</option><option value="US">United States</option><option value="PT">Portugal</option><option value="GB">United Kingdom</option></select></label></div>
                  {providerGroups.some(([, providers]) => providers?.length) ? <div className="provider-groups">{providerGroups.map(([name, providers]) => providers?.length ? <div key={name}><strong>{name}</strong><div className="provider-list">{providers.map((provider) => <span key={provider.provider_id}>{provider.logo_path && <img src={`https://image.tmdb.org/t/p/w92${provider.logo_path}`} alt="" />} {provider.provider_name}</span>)}</div></div> : null)}</div> : !extras.loading && <p className="empty-copy">{copy.noWatch}</p>}
                  {extras.providers?.link && <a className="catalog-link" href={extras.providers.link} target="_blank" rel="noreferrer">TMDB ↗</a>}
                </section>
                <section><h3>{copy.credits}</h3>{extras.cast.length || extras.crew.length ? <><div className="credit-list">{extras.cast.slice(0, 8).map((person) => <span key={`cast-${person.id}`}><b>{person.name}</b>{person.character && <small>{person.character}</small>}</span>)}</div><h4>{copy.crew}</h4><p className="crew-line">{extras.crew.slice(0, 6).map((person) => `${person.name}${person.job ? ` (${person.job})` : ""}`).join(" · ")}</p></> : !extras.loading && <p className="empty-copy">{copy.noCredits}</p>}</section>
                {extras.related.length > 0 && <section><h3>{copy.related}</h3><div className="related-list">{extras.related.slice(0, 6).map((item) => <button type="button" key={item.id} onClick={() => onSelectRelated(item)}>{item.poster !== "N/A" && <img src={item.poster} alt="" />}<span>{item.title}<small>{item.year}</small></span></button>)}</div></section>}
                {extras.tmdbId && <p className="attribution">{copy.source}</p>}
              </div>
              <section className="title-ai" aria-labelledby="title-ai-heading">
                <div className="title-ai-heading">
                  <div><span className="details-kicker">{labels.aiGenerated}</span><h3 id="title-ai-heading">{labels.aiTitle}</h3></div>
                  <label>{labels.engine}<select value="active" disabled aria-label={labels.engine}><option value="active">{engineLabel}</option></select></label>
                </div>
                <p className="ai-cost-note">{labels.paidNotice}</p>
                <div className="ai-summary">
                  <strong>{labels.aiSummary}</strong>
                  {summary ? <><p>{summary.text}</p><small>{labels.aiGenerated} · {summary.engine} / {summary.model}</small></> : <p>{details.plot ? "—" : labels.noPlotAi}</p>}
                  <button type="button" onClick={onSummary} disabled={aiLoading !== null || !details.plot}>{aiError && !summary ? labels.retry : labels.generateSummary}</button>
                </div>
                <div className="title-chat">
                  <div className="chat-bar"><strong>{labels.chatTitle}</strong><button type="button" onClick={onNewChat} disabled={aiLoading !== null}>{labels.newChat}</button></div>
                  <p className="temporary-note">{labels.temporaryChat}</p>
                  {chat.length > 0 && <div className="chat-log" role="log" aria-live="polite">{chat.map((message, index) => <p key={index} className={message.role}><b>{message.role === "user" ? "Você" : "AskFilmX"}:</b> {message.content}</p>)}</div>}
                  <form onSubmit={onChat} className="chat-form"><label className="sr-only" htmlFor="title-question">{labels.chatPlaceholder}</label><input id="title-question" value={question} maxLength={1500} onChange={(event) => onQuestionChange(event.target.value)} placeholder={labels.chatPlaceholder} /><button type="submit" disabled={aiLoading !== null || !question.trim()}>{aiLoading === "chat" ? "…" : labels.send}</button></form>
                </div>
                {aiError && <div className="ai-error" role="alert">{aiError} <button type="button" disabled={aiLoading !== null} onClick={onRetry}>{labels.retry}</button></div>}
              </section>
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
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [summary, setSummary] = useState<SummaryState | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState<"summary" | "chat" | null>(null);
  const [titleAiError, setTitleAiError] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [lastSearchQuery, setLastSearchQuery] = useState("");
  const [showMyList, setShowMyList] = useState(false);
  const [myList, setMyList] = useState<MyListItem[] | null>(null);
  const [listNotice, setListNotice] = useState("");
  const [canBroaden, setCanBroaden] = useState(false);
  const [recommendationLimitations, setRecommendationLimitations] = useState<string[]>([]);
  const [storageLimited, setStorageLimited] = useState(false);
  const [legacyIds, setLegacyIds] = useState<string[]>([]);
  const [aiEngine, setAiEngine] = useState<"cloud" | "local">("cloud");
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [localModel, setLocalModel] = useState(LOCAL_MODELS[0].id as string);
  const [localStatus, setLocalStatus] = useState<LocalStatus>({ phase: "idle", progress: 0, message: "O modelo só será baixado após sua escolha." });
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [region, setRegion] = useState("BR");
  const [extras, setExtras] = useState<Extras>(emptyExtras);
  const importRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const searchControllerRef = useRef<AbortController | null>(null);
  const detailsControllerRef = useRef<AbortController | null>(null);
  const searchSequenceRef = useRef(0);
  const detailsSequenceRef = useRef(0);
  const titleAiControllerRef = useRef<AbortController | null>(null);
  const titleAiSequenceRef = useRef(0);
  const titleAiInFlightRef = useRef(false);
  const summaryCacheRef = useRef(new Map<string, SummaryState>());
  const recommendationInFlightRef = useRef<number | null>(null);
  const localAiRef = useRef<LocalAiManager | null>(null);
  const labels = translations[language];

  if (!localAiRef.current) localAiRef.current = new LocalAiManager(setLocalStatus);

  async function activateLocal() {
    setAiEngine("local");
    try { await localAiRef.current!.load(localModel); }
    catch { /* Status contains the actionable error; cloud is never selected implicitly. */ }
  }

  async function activateCloud() {
    titleAiControllerRef.current?.abort(); searchControllerRef.current?.abort();
    await localAiRef.current?.dispose(); setAiEngine("cloud");
  }

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPlaceholderIndex((currentIndex) => (currentIndex + 1) % placeholderExamples[language].length);
    }, 2200);

    return () => window.clearInterval(interval);
  }, [language]);

  useEffect(() => {
    const savedLanguage = getLanguagePreference();
    if (savedLanguage) {
      setLanguage(savedLanguage);
      setStatusMessage(translations[savedLanguage].initialStatus);
    }
  }, []);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("askfilmx:theme") === "light" ? "light" : "dark";
    setTheme(storedTheme);
    document.documentElement.dataset.theme = storedTheme;
    const storedRegion = window.localStorage.getItem("askfilmx:region");
    if (storedRegion && /^(BR|US|PT|GB)$/.test(storedRegion)) setRegion(storedRegion);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    async function highlights() {
      try {
        const response = await fetch(`/api/tmdb?operation=highlights&media=movie&page=1&language=${language === "pt-BR" ? "pt-BR" : "en-US"}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.items)) return;
        setVisibleItems(data.items.slice(0, 8).map((item: any) => ({ id: item.id, ids: item.ids, source: "tmdb", title: item.title, year: item.year ?? "—", type: item.mediaType === "series" ? "Série" : "Filme", poster: item.poster ?? "N/A" })));
        setStatusMessage(language === "pt-BR" ? "Destaques desta semana no catálogo." : "This week's catalog highlights.");
      } catch { /* Destaques são complementares; busca e lista continuam disponíveis. */ }
    }
    void highlights();
    return () => controller.abort();
  }, [language]);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next); document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("askfilmx:theme", next); } catch {}
  }

  function changeRegion(next: string) {
    setRegion(next);
    try { window.localStorage.setItem("askfilmx:region", next); } catch {}
    if (extras.tmdbId && selectedDetails) void loadExtras(extras.tmdbId, selectedDetails.mediaType, next);
  }

  function tmdbItems(data: any): CatalogItem[] {
    return Array.isArray(data?.items) ? data.items.map((item: any) => ({ id: item.id, ids: item.ids, source: "tmdb", title: item.title, year: item.year ?? "—", type: item.mediaType === "series" ? "Série" : "Filme", poster: item.poster ?? "N/A" })) : [];
  }

  async function loadExtras(tmdbId: number, mediaType: "movie" | "series", targetRegion = region) {
    const media = mediaType === "series" ? "tv" : "movie";
    setExtras((current) => ({ ...emptyExtras, tmdbId, loading: true, providers: current.tmdbId === tmdbId ? current.providers : null }));
    const query = (operation: string) => fetch(`/api/tmdb?operation=${operation}&media=${media}&id=${tmdbId}&language=${language === "pt-BR" ? "pt-BR" : "en-US"}`).then(async (response) => response.ok ? response.json() : null).catch(() => null);
    const [credits, videos, providers, related] = await Promise.all([query("credits"), query("videos"), query("providers"), query("related")]);
    const country = providers?.results?.[targetRegion] ?? null;
    setExtras({ tmdbId, loading: false, partial: !credits || !videos || !providers || !related, cast: Array.isArray(credits?.cast) ? credits.cast : [], crew: Array.isArray(credits?.crew) ? credits.crew.filter((person: Credit) => ["Director", "Writer", "Creator", "Screenplay"].includes(person.job ?? "")) : [], videos: Array.isArray(videos?.results) ? videos.results : [], providers: country, related: tmdbItems(related) });
  }

  useEffect(() => {
    const loaded = loadMyList();
    setMyList(loaded.value);
    setStorageLimited(Boolean(loaded.error));
    setLegacyIds(getLegacyFavoriteIds());
    function sync(event: StorageEvent) {
      if (event.key === MY_LIST_KEY) {
        const next = loadMyList();
        setMyList(next.value);
        setStorageLimited(Boolean(next.error));
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);

  function toListItem(item: CatalogItem | MovieDetails): MyListItem {
    const detail = "mediaType" in item;
    const ids = item.ids ?? { imdb: item.id.startsWith("tt") ? item.id : null, tmdb: null };
    return { id: item.id, ids, source: item.source ?? "omdb", title: item.title, year: (detail ? item.year : item.year) ?? "—", type: detail ? (item.mediaType === "series" ? "Série" : "Filme") : item.type, poster: safePosterUrl(item.poster), addedAt: new Date().toISOString() };
  }

  function matchesList(item: CatalogItem | MovieDetails) {
    const candidate = toListItem(item);
    return (myList ?? []).some((saved) => mergeMyLists([saved], [candidate]).length === 1);
  }

  function updateList(next: MyListItem[]) {
    setMyList(next);
    const error = persistMyList(next);
    setStorageLimited(Boolean(error));
    if (error) setListNotice(labels.storageWarning);
  }

  function toggleList(item: CatalogItem | MovieDetails) {
    const current = myList ?? [];
    const candidate = toListItem(item);
    const existing = current.find((saved) => mergeMyLists([saved], [candidate]).length === 1);
    if (existing) updateList(current.filter((entry) => entry !== existing));
    else if (current.length >= MAX_LIST_ITEMS) setListNotice(labels.limitReached);
    else updateList(mergeMyLists(current, [candidate]));
  }

  function exportList() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), items: myList ?? [] }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "askfilmx-minha-lista.json"; anchor.click(); URL.revokeObjectURL(url);
  }

  async function importList(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    if (file.size > 256 * 1024) { setListNotice(labels.invalidImport); return; }
    const parsed = parseMyListJson(await file.text());
    if (parsed.error) { setListNotice(labels.invalidImport); return; }
    updateList(mergeMyLists(myList ?? [], parsed.value)); setListNotice(labels.importDone);
  }

  async function importLegacy() {
    const imported: MyListItem[] = [];
    for (const id of legacyIds) {
      try { const response = await fetch(`/api/omdb?type=details&id=${encodeURIComponent(id)}`); if (!response.ok) continue; imported.push(toListItem(await response.json() as MovieDetails)); } catch {}
    }
    updateList(mergeMyLists(myList ?? [], imported)); setLegacyIds([]); setListNotice(labels.importDone);
  }

  function toggleLanguage() {
    const nextLanguage: Language = language === "pt-BR" ? "en" : "pt-BR";
    setLanguage(nextLanguage);
    saveLanguagePreference(nextLanguage);
    setStatusMessage(translations[nextLanguage].initialStatus);
    titleAiControllerRef.current?.abort();
    titleAiSequenceRef.current += 1;
    titleAiInFlightRef.current = false; setAiLoading(null); setTitleAiError(""); setChat([]); setQuestion("");
    const id = selectedDetails?.ids.imdb;
    setSummary(id ? summaryCacheRef.current.get(`${id}|${nextLanguage}|openai|gpt-4.1-mini|title-context-v1`) ?? null : null);
  }

  function scrollToResults() {
    window.setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  async function runTitleSearch(query: string, page = 1, filter = activeFilter) {
    searchControllerRef.current?.abort();
    recommendationInFlightRef.current = null;
    setCanBroaden(false);
    setRecommendationLimitations([]);
    const controller = new AbortController();
    searchControllerRef.current = controller;
    const sequence = ++searchSequenceRef.current;
    setIsLoading(true);
    setHasSearched(true);
    setStatusMessage(page === 1 ? labels.searchingTitles : `${labels.loadingPage} ${page}...`);

    try {
      const media = filter === "Todos" ? "" : `&media=${filter === "Série" ? "series" : "movie"}`;
      const response = await fetch(`/api/omdb?type=search&q=${encodeURIComponent(query)}&page=${page}${media}`, { signal: controller.signal });
      const data = await response.json();

      if (sequence !== searchSequenceRef.current) return;

      if (!response.ok) {
        throw new Error(data.error ?? labels.unableSearch);
      }

      if (!isCatalogSearchPayload(data)) {
        throw new Error(labels.unableSearch);
      }

      const items = data.items.flatMap((item) => item.ids.imdb ? [{
        id: item.ids.imdb,
        ids: item.ids,
        source: item.source,
        title: item.title,
        year: item.year ?? "—",
        type: item.mediaType === "series" ? "Série" as const : "Filme" as const,
        poster: item.poster ?? "N/A"
      }] : []);
      const totalResults = Number(data.totalResults);
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
      if (controller.signal.aborted || sequence !== searchSequenceRef.current) return;
      setVisibleItems([]);
      setCurrentPage(1);
      setTotalPages(0);
      setStatusMessage(error instanceof Error ? error.message : labels.unableSearch);
    } finally {
      if (sequence === searchSequenceRef.current) setIsLoading(false);
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

    await runTitleSearch(query, 1, "Todos");
  }

  async function handleSelectMovie(item: CatalogItem) {
    titleAiControllerRef.current?.abort(); titleAiSequenceRef.current += 1;
    titleAiInFlightRef.current = false; setSummary(null); setChat([]); setQuestion(""); setAiLoading(null); setTitleAiError("");
    detailsControllerRef.current?.abort();
    const controller = new AbortController();
    detailsControllerRef.current = controller;
    const sequence = ++detailsSequenceRef.current;
    setIsDetailsLoading(true);
    setDetailsError("");
    setSelectedDetails(null);
    setExtras({ ...emptyExtras, loading: true });

    try {
      let imdbId = item.ids?.imdb ?? (item.id.startsWith("tt") ? item.id : null);
      if (!imdbId && item.ids?.tmdb) {
        const media = item.type === "Série" ? "tv" : "movie";
        const resolved = await fetch(`/api/tmdb?operation=resolve&media=${media}&id=${item.ids.tmdb}&language=${language === "pt-BR" ? "pt-BR" : "en-US"}`, { signal: controller.signal });
        const identifiers = await resolved.json();
        if (!resolved.ok || typeof identifiers.imdbId !== "string") throw new Error(labels.unableDetails);
        imdbId = identifiers.imdbId;
      }
      if (!imdbId) throw new Error(labels.unableDetails);
      const response = await fetch(`/api/omdb?type=details&id=${encodeURIComponent(imdbId)}`, { signal: controller.signal });
      const data = await response.json();

      if (sequence !== detailsSequenceRef.current) return;

      if (!response.ok) {
        throw new Error(data.error ?? labels.unableDetails);
      }

      const nextDetails = data as MovieDetails;
      setSelectedDetails(nextDetails);
      if (nextDetails.ids.imdb) setSummary(summaryCacheRef.current.get(`${nextDetails.ids.imdb}|${language}|openai|gpt-4.1-mini|title-context-v1`) ?? null);
      let tmdbId = item.ids?.tmdb ?? null;
      if (!tmdbId && nextDetails.ids.imdb) {
        const media = nextDetails.mediaType === "series" ? "tv" : "movie";
        const resolved = await fetch(`/api/tmdb?operation=resolve&media=${media}&imdbId=${nextDetails.ids.imdb}&language=${language === "pt-BR" ? "pt-BR" : "en-US"}`, { signal: controller.signal });
        const identifiers = resolved.ok ? await resolved.json() : null;
        tmdbId = typeof identifiers?.tmdbId === "number" ? identifiers.tmdbId : null;
      }
      if (tmdbId) void loadExtras(tmdbId, nextDetails.mediaType);
      else setExtras(emptyExtras);
    } catch (error) {
      if (controller.signal.aborted || sequence !== detailsSequenceRef.current) return;
      setDetailsError(error instanceof Error ? error.message : labels.unableDetails);
    } finally {
      if (sequence === detailsSequenceRef.current) setIsDetailsLoading(false);
    }
  }

  function closeDetails() {
    detailsControllerRef.current?.abort();
    detailsSequenceRef.current += 1;
    setSelectedDetails(null);
    setDetailsError("");
    setIsDetailsLoading(false);
    setExtras(emptyExtras);
    titleAiControllerRef.current?.abort(); titleAiSequenceRef.current += 1; titleAiInFlightRef.current = false; setAiLoading(null);
  }

  async function callTitleAi(action: "summary" | "chat", text?: string) {
    const imdbId = selectedDetails?.ids.imdb;
    if (!imdbId || titleAiInFlightRef.current) return;
    titleAiInFlightRef.current = true;
    const controller = new AbortController(); titleAiControllerRef.current?.abort(); titleAiControllerRef.current = controller;
    const sequence = ++titleAiSequenceRef.current;
    setAiLoading(action); setTitleAiError("");
    const sentHistory = chat.slice(-8);
    try {
      if (aiEngine === "local") {
        if (!selectedDetails) throw new Error(labels.aiError);
        const local = await localAiRef.current!.title(action, selectedDetails, language, text, sentHistory);
        if (sequence !== titleAiSequenceRef.current) return;
        if (action === "summary") {
          const value = { text: local.text, engine: local.engine, model: local.model, promptVersion: local.promptVersion };
          summaryCacheRef.current.set(`${imdbId}|${language}|${local.engine}|${local.model}|${local.promptVersion}`, value); setSummary(value);
        } else if (text) { setChat((current) => [...current, { role: "user" as const, content: text }, { role: "assistant" as const, content: local.text }].slice(-10)); setQuestion(""); }
        return;
      }
      const response = await fetch("/api/title-ai", { method: "POST", headers: { "content-type": "application/json" }, signal: controller.signal, body: JSON.stringify({ action, imdbId, language, engine: "openai", question: text, history: action === "chat" ? sentHistory : undefined }) });
      const data = await response.json();
      if (sequence !== titleAiSequenceRef.current || controller.signal.aborted || selectedDetails?.ids.imdb !== imdbId) return;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : labels.aiError);
      if (action === "summary" && typeof data.summary === "string") {
        const value = { text: data.summary, engine: data.engine, model: data.model, promptVersion: data.promptVersion };
        const key = `${imdbId}|${language}|${data.engine}|${data.model}|${data.promptVersion}`;
        summaryCacheRef.current.set(key, value);
        while (summaryCacheRef.current.size > 12) summaryCacheRef.current.delete(summaryCacheRef.current.keys().next().value!);
        setSummary(value);
      } else if (action === "chat" && typeof data.answer === "string" && text) {
        const answer = data.answer as string;
        setChat((current) => [...current, { role: "user" as const, content: text }, { role: "assistant" as const, content: answer }].slice(-10));
        setQuestion("");
      } else throw new Error(labels.aiError);
    } catch (error) {
      if (!controller.signal.aborted && sequence === titleAiSequenceRef.current) setTitleAiError(error instanceof Error ? error.message : labels.aiError);
    } finally { if (sequence === titleAiSequenceRef.current) { titleAiInFlightRef.current = false; setAiLoading(null); } }
  }

  function askTitle(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const text = question.trim(); if (text) void callTitleAi("chat", text); }
  function newChat() { titleAiControllerRef.current?.abort(); titleAiSequenceRef.current += 1; titleAiInFlightRef.current = false; setChat([]); setQuestion(""); setTitleAiError(""); setAiLoading(null); }

  async function requestRecommendation(broaden = false) {
    const prompt = recommendationPrompt.trim();
    if (!prompt) { setStatusMessage(labels.describeToRecommend); setHasSearched(true); return; }
    if (recommendationInFlightRef.current !== null) return;
    searchControllerRef.current?.abort();
    const controller = new AbortController(); searchControllerRef.current = controller;
    const sequence = ++searchSequenceRef.current;
    recommendationInFlightRef.current = sequence;
    setIsLoading(true); setHasSearched(true); setShowMyList(false); setVisibleItems([]); setCanBroaden(false); setRecommendationLimitations([]); setStatusMessage(labels.requestReceived); scrollToResults();
    try {
      const criteria = aiEngine === "local" ? await localAiRef.current!.interpret(prompt, language) : undefined;
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(criteria ? { criteria, language, broaden } : { text: prompt, language, broaden }), signal: controller.signal });
      const data = await response.json();
      if (sequence !== searchSequenceRef.current) return;
      if (!response.ok) throw new Error(data.error ?? labels.unableSearch);
      if (!isRecommendationResponse(data)) throw new Error(labels.unableSearch);
      setVisibleItems(data.items); setCanBroaden(data.canBroaden); setRecommendationLimitations(data.limitations);
      setStatusMessage(`${data.message}${data.partialFailures ? ` ${labels.partialCatalog}` : ""}`);
    } catch (error) {
      if (controller.signal.aborted || sequence !== searchSequenceRef.current) return;
      setVisibleItems([]); setStatusMessage(error instanceof Error ? error.message : labels.unableSearch);
    } finally {
      if (recommendationInFlightRef.current === sequence) recommendationInFlightRef.current = null;
      if (sequence === searchSequenceRef.current) setIsLoading(false);
    }
  }

  function handleRecommendation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActiveMode("recommend");
    setCurrentPage(1);
    setTotalPages(0);
    setLastSearchQuery("");
    void requestRecommendation();
  }

  function handlePageChange(page: number) {
    if (!lastSearchQuery || page < 1 || page > totalPages || page === currentPage) {
      return;
    }

    void runTitleSearch(lastSearchQuery, page);
  }

  function handleFilterChange(filter: FilterKey) {
    setActiveFilter(filter);
    if (lastSearchQuery) void runTitleSearch(lastSearchQuery, 1, filter);
  }

  return (
    <main className="app-shell">
      <header className="site-header" aria-label={language === "pt-BR" ? "Navegação principal" : "Main navigation"}>
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
        <nav className="main-nav" aria-label={language === "pt-BR" ? "Seções do AskFilmX" : "AskFilmX sections"}>
          <button type="button" onClick={() => { setShowMyList(false); setActiveMode("search"); }}>{labels.search}</button>
          <button type="button" onClick={() => setActiveMode("recommend")}>{labels.aiRecommendation}</button>
          <button type="button" onClick={() => { setShowMyList(true); scrollToResults(); }}>{labels.myList}{myList?.length ? ` (${myList.length})` : ""}</button>
          <button type="button" onClick={() => setShowAiSettings(true)}>{language === "pt-BR" ? "IA" : "AI"}: {aiEngine === "local" ? (language === "pt-BR" ? "local" : "device") : (language === "pt-BR" ? "nuvem" : "cloud")}</button>
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label={language === "pt-BR" ? "Alternar tema claro ou escuro" : "Toggle light or dark theme"}>{theme === "dark" ? "☀" : "☾"}</button>
          <a href="#about-help">{labels.about}</a>
          <button type="button" className="language-toggle" onClick={toggleLanguage} aria-label="PT-BR / EN">
            {language === "pt-BR" ? "PT-BR" : "EN"}
          </button>
          <button type="button" id="about-help" className="help-button" aria-label={labels.about}>
            ?
            <span className="help-tooltip" role="tooltip">{labels.help}</span>
          </button>
        </nav>
      </header>

      {showAiSettings && <div className="details-backdrop" role="presentation" onClick={() => setShowAiSettings(false)}>
        <section className="ai-settings" role="dialog" aria-modal="true" aria-labelledby="ai-settings-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="close-details" onClick={() => setShowAiSettings(false)} aria-label={labels.closeDetails}>×</button>
          <p className="eyebrow">AskFilmX</p><h2 id="ai-settings-title">{language === "pt-BR" ? "Mecanismo de IA" : "AI engine"}</h2>
          <p>{language === "pt-BR" ? "Escolha entre respostas na nuvem ou neste dispositivo. A IA só é acionada quando você pede." : "Choose cloud or on-device answers. AI only runs when you request it."}</p>
          <div className="engine-options">
            <button type="button" className={aiEngine === "cloud" ? "active" : ""} onClick={() => void activateCloud()}><strong>OpenAI ({language === "pt-BR" ? "nuvem" : "cloud"})</strong><span>{language === "pt-BR" ? "Rápida e sem download; pode gerar cobrança." : "Fast and download-free; may incur charges."}</span></button>
            <div className={aiEngine === "local" ? "engine-card active" : "engine-card"}><strong>WebLLM (neste dispositivo)</strong>
              <label htmlFor="local-model">Modelo e download aproximado</label>
              <select id="local-model" value={localModel} disabled={localStatus.phase === "downloading"} onChange={(event) => setLocalModel(event.target.value)}>{LOCAL_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label} · {model.size}</option>)}</select>
              <button type="button" onClick={() => void activateLocal()} disabled={localStatus.phase === "downloading"}>{localStatus.phase === "error" ? "Tentar download novamente" : "Usar e baixar este modelo"}</button>
            </div>
          </div>
          <div className={`local-status ${localStatus.phase}`} role="status" aria-live="polite"><span>{localStatus.message} Downloads podem falhar ou ser interrompidos.</span>{localStatus.phase === "downloading" && <><progress max="1" value={localStatus.progress} /><b>{Math.round(localStatus.progress * 100)}%</b></>}</div>
          <p className="temporary-note">Requer navegador com WebGPU e contexto seguro (HTTPS/localhost). O cache técnico é administrado pelo WebLLM/navegador.</p>
        </section>
      </div>}

      <section className="hero-section" id="top" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">AskFilm</p>
          <h1 id="hero-title">{labels.heroTitle}</h1>
          <p>{labels.heroText}</p>
        </div>

        <div className="interaction-panel" aria-label={language === "pt-BR" ? "Modos de interação" : "Interaction modes"}>
          <div className={`mode-toggle ${activeMode === "search" ? "is-search" : "is-recommend"}`} role="tablist" aria-label={language === "pt-BR" ? "Escolha um modo" : "Choose a mode"}>
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
            <p className="eyebrow">{showMyList ? labels.myList : !hasSearched ? (language === "pt-BR" ? "Destaques" : "Highlights") : labels.results}</p>
            <h2 id="results-title">{showMyList ? labels.myList : !hasSearched ? (language === "pt-BR" ? "Em alta esta semana" : "Trending this week") : labels.yourCuration}</h2>
          </div>
          <div className="status-badge" aria-live="polite">{showMyList ? labels.savedHere : statusMessage}</div>
        </div>
        {showMyList ? (
          <div className="my-list-view">
            <p className="privacy-note">{labels.noSync}</p>
            {storageLimited && <p className="storage-warning" role="status">{labels.storageWarning}</p>}
            {listNotice && <p className="list-notice" role="status">{listNotice}</p>}
            {legacyIds.length > 0 && <div className="legacy-offer"><span>{labels.legacyOffer}</span><button type="button" onClick={() => void importLegacy()}>{labels.legacyImport}</button></div>}
            <div className="list-actions">
              <button type="button" onClick={exportList} disabled={!myList?.length}>{labels.exportList}</button>
              <button type="button" onClick={() => importRef.current?.click()}>{labels.importList}</button>
              <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => void importList(event)} />
              <button type="button" className="danger-button" disabled={!myList?.length} onClick={() => { if (window.confirm(labels.clearConfirm)) updateList([]); }}>{labels.clearList}</button>
            </div>
            {myList === null ? <div className="empty-state"><p>{labels.listLoading}</p></div> : myList.length ? (
              <ResultsGrid isLoading={false} items={myList.map((item) => ({ ...item, poster: item.poster ?? "N/A" }))} labels={labels} onSelect={handleSelectMovie} isSaved={matchesList} onToggle={toggleList} />
            ) : <div className="empty-state"><p>{labels.listEmpty}</p><button type="button" className="gold-button" onClick={() => { setShowMyList(false); setActiveMode("search"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{labels.searchAction}</button></div>}
          </div>
        ) : <>
        {lastSearchQuery && <FilterBar activeFilter={activeFilter} labels={labels} onChange={handleFilterChange} />}
        {recommendationLimitations.length > 0 && <div className="recommendation-limitations" role="note"><ul>{recommendationLimitations.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {(hasSearched || visibleItems.length > 0) && (visibleItems.length > 0 || isLoading) ? (
          <>
            <ResultsGrid isLoading={isLoading} items={visibleItems} labels={labels} onSelect={handleSelectMovie} isSaved={matchesList} onToggle={toggleList} />
            <Pagination currentPage={currentPage} totalPages={totalPages} isLoading={isLoading} labels={labels} onPageChange={handlePageChange} />
          </>
        ) : (
          <div className="empty-state">
            <p>{hasSearched ? statusMessage : labels.emptyState}</p>
          </div>
        )}
        {canBroaden && !isLoading && <button type="button" className="broaden-button" onClick={() => void requestRecommendation(true)}>{labels.broadenSearch}</button>}
        </>}
      </section>

      {(isDetailsLoading || selectedDetails || detailsError) && (
        <DetailsModal
          details={selectedDetails}
          isLoading={isDetailsLoading}
          error={detailsError}
          labels={labels}
          onClose={closeDetails}
          saved={selectedDetails ? matchesList(selectedDetails) : false}
          onToggle={toggleList}
          summary={summary}
          aiLoading={aiLoading}
          aiError={titleAiError}
          chat={chat}
          question={question}
          engineLabel={aiEngine === "local" ? `WebLLM · ${LOCAL_MODELS.find((model) => model.id === localModel)?.label ?? localModel} (local)` : labels.openAiEngine}
          onQuestionChange={setQuestion}
          onSummary={() => void callTitleAi("summary")}
          onChat={askTitle}
          onNewChat={newChat}
          onRetry={() => question.trim() ? void callTitleAi("chat", question.trim()) : void callTitleAi("summary")}
          extras={extras}
          region={region}
          language={language}
          onRegionChange={changeRegion}
          onSelectRelated={handleSelectMovie}
        />
      )}

      <footer className="site-footer"><p>{labels.footer}</p><p>This product uses the TMDB API but is not endorsed or certified by TMDB. YouTube is used only to play catalog-linked videos after your interaction.</p></footer>
    </main>
  );
}
