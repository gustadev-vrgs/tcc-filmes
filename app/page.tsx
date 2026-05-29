export default function Home() {
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

            <form className="action-form">
              <label className="field-group" htmlFor="title-search">
                <span>Buscar por título</span>
                <input
                  id="title-search"
                  name="title"
                  type="search"
                  placeholder="Ex.: Interestelar, Breaking Bad, Matrix..."
                  autoComplete="off"
                />
              </label>
              <button type="button" className="primary-button">
                Buscar título
              </button>

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
