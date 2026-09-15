"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { type CatalogItem, type Language, type MovieDetails } from "../lib/catalog";
import { getLanguagePreference, getLegacyFavoriteIds, loadMyList, MAX_LIST_ITEMS, mergeMyLists, MY_LIST_KEY, parseMyListJson, persistMyList, safePosterUrl, saveLanguagePreference, type MyListItem } from "../lib/local-storage";
import { isCatalogSearchPayload } from "../lib/validation";
import { isRecommendationResponse } from "../lib/recommendation";

type ActiveMode = "search" | "recommend";
type FilterKey = "Todos" | "Filme" | "Série";
type ChatMessage = { role: "user" | "assistant"; content: string };
type SummaryState = { text: string; engine: string; model: string; promptVersion: string };

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
  onClose, saved, onToggle, summary, aiLoading, aiError, chat, question, onQuestionChange, onSummary, onChat, onNewChat, onRetry
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
  onQuestionChange: (value: string) => void;
  onSummary: () => void;
  onChat: (event: FormEvent<HTMLFormElement>) => void;
  onNewChat: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="details-backdrop" role="presentation" onClick={onClose}>
      <section
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
                <span>{details.imdbRating && details.imdbRating !== "N/A" ? `IMDb ${details.imdbRating}` : labels.ratingUnavailable}</span>
              </div>
              <p className="details-plot">{details.plot ?? labels.plotUnavailable}</p>
              <dl className="details-list">
                <div><dt>{labels.genre}</dt><dd>{details.genre ?? labels.unavailable}</dd></div>
                <div><dt>{labels.direction}</dt><dd>{details.director ?? details.writer ?? labels.unavailable}</dd></div>
                <div><dt>{labels.cast}</dt><dd>{details.actors ?? labels.unavailable}</dd></div>
                <div><dt>{labels.type}</dt><dd>{details.mediaType === "series" ? labels.series : labels.movie}</dd></div>
              </dl>
              <button type="button" className={`gold-button detail-list-button ${saved ? "saved" : ""}`} onClick={() => onToggle(details)} aria-pressed={saved}>{saved ? `✓ ${labels.removeList}` : `＋ ${labels.addList}`}</button>
              <section className="title-ai" aria-labelledby="title-ai-heading">
                <div className="title-ai-heading">
                  <div><span className="details-kicker">{labels.aiGenerated}</span><h3 id="title-ai-heading">{labels.aiTitle}</h3></div>
                  <label>{labels.engine}<select value="openai" disabled aria-label={labels.engine}><option value="openai">{labels.openAiEngine}</option></select></label>
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
  const labels = translations[language];

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

    try {
      let imdbId = item.ids?.imdb ?? (item.id.startsWith("tt") ? item.id : null);
      if (!imdbId && item.ids?.tmdb) {
        const media = item.type === "Série" ? "tv" : "movie";
        const resolved = await fetch(`/api/tmdb?operation=resolve&media=${media}&id=${item.ids.tmdb}`, { signal: controller.signal });
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
      const response = await fetch("/api/recommendations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: prompt, language, broaden }), signal: controller.signal });
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
          <button type="button" onClick={() => { setShowMyList(false); setActiveMode("search"); }}>{labels.search}</button>
          <button type="button" onClick={() => setActiveMode("recommend")}>{labels.aiRecommendation}</button>
          <button type="button" onClick={() => { setShowMyList(true); scrollToResults(); }}>{labels.myList}{myList?.length ? ` (${myList.length})` : ""}</button>
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
            <p className="eyebrow">{showMyList ? labels.myList : labels.results}</p>
            <h2 id="results-title">{showMyList ? labels.myList : labels.yourCuration}</h2>
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
        {hasSearched && (visibleItems.length > 0 || isLoading) ? (
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
          onQuestionChange={setQuestion}
          onSummary={() => void callTitleAi("summary")}
          onChat={askTitle}
          onNewChat={newChat}
          onRetry={() => question.trim() ? void callTitleAi("chat", question.trim()) : void callTitleAi("summary")}
        />
      )}

      <footer className="site-footer">{labels.footer}</footer>
    </main>
  );
}
