<?php
/**
 * index.php — PÁGINA INICIAL: busca por título, recomendações por IA,
 * Destaques da Semana e a lista de resultados. Ao clicar em um filme, o
 * usuário vai para a página do filme (filme.php?id=...).
 */
$pageTitle  = 'Ideal Film Finder';
$bodyClass  = 'page-home';
$pageScript = 'home.js';
require __DIR__ . '/includes/layout-top.php';
?>

  <div class="app-shell">
    <aside class="control-panel">

      <!-- Logo -->
      <div id="logo-container">
        <img src="logo.png" alt="Logo do Site" />
      </div>

      <div class="marquee-lights" aria-hidden="true"></div>

      <!-- Introdução -->
      <div class="intro-section">
        <div class="intro-text">
          Here you can <strong>search movies</strong> manually or get <strong>recommendations</strong> based on a quick description.
          <span class="help-icon" aria-hidden="true"></span>
          <div class="help-tooltip">
            <p><strong>How does it work?</strong></p>
            <p>1. Use the search field to look for movies by title.<br>
               2. Use the recommendation field to get suggestions based on a description.<br>
               3. Click the help icon for more information.</p>
          </div>
        </div>
      </div>

      <div class="search-panel">
        <div class="search-col search-col-title">
          <div class="search-col-icon"><i class="fa-solid fa-magnifying-glass"></i></div>
          <h3 class="search-col-heading">Search by Title</h3>
          <!-- Formulário de Pesquisa -->
          <div class="input-explanation">
            <span>Enter the movie name you wish to search for. Provide the full name or part of it to find your desired movie.</span>
          </div>
          <form id="pesquisaForm">
            <div class="input-container">
              <input name="pesquisa" placeholder="Enter the movie name" required />
              <span class="clear-input" onclick="this.previousElementSibling.value = ''">×</span>
            </div>
            <button type="submit"><i class="fa-solid fa-search"></i> Search</button>
          </form>
        </div>

        <div class="search-col search-col-ai">
          <div class="search-col-icon"><i class="fa-solid fa-wand-magic-sparkles"></i></div>
          <h3 class="search-col-heading">Ask the AI</h3>
          <!-- Formulário de Recomendação -->
          <div class="input-explanation">
            <span>Describe what you want to watch. Write a brief description or genre to get movie suggestions.</span>
          </div>
          <form id="iaForm">
            <div class="input-container">
              <input name="prompt" placeholder="Describe what you want to watch" required />
              <span class="clear-input" onclick="this.previousElementSibling.value = ''">×</span>
            </div>
            <button type="submit"><i class="fa-solid fa-magic"></i> Recommend Movies</button>
          </form>
        </div>
      </div>
    </aside>

    <main class="content-panel">
      <!-- Loader -->
      <div id="loader">
        <div class="spinner"></div>
      </div>

      <!-- Destaques da Semana — sempre em uma única fileira horizontal,
           visualmente diferente dos cards de resultado de pesquisa -->
      <section class="highlights-section" id="highlightsSection" style="display:none;">
        <h2 class="highlights-heading"><i class="fa-solid fa-fire"></i> Weekly Highlights</h2>
        <div class="highlights-row-wrap">
          <button type="button" class="highlights-arrow highlights-prev" onclick="scrollHighlightsPrev()" aria-label="Previous"><i class="fa-solid fa-chevron-left"></i></button>
          <div class="highlights-row" id="highlightsRow"></div>
          <button type="button" class="highlights-arrow highlights-next" onclick="scrollHighlightsNext()" aria-label="Next"><i class="fa-solid fa-chevron-right"></i></button>
        </div>
      </section>

      <!-- Lista de Filmes (resultados da busca / recomendações).
           As setas só aparecem no layout Poster Row quando há filmes para rolar. -->
      <div class="poster-row-wrap" id="posterRowWrap">
        <button type="button" class="poster-row-arrow poster-row-prev" onclick="scrollListaPrev()" aria-label="Previous"><i class="fa-solid fa-chevron-left"></i></button>
        <div class="lista"></div>
        <button type="button" class="poster-row-arrow poster-row-next" onclick="scrollListaNext()" aria-label="Next"><i class="fa-solid fa-chevron-right"></i></button>
      </div>

      <!-- Paginação -->
      <div class="navegacao" style="display: none;"></div>

      <!-- Mensagem de Erro -->
      <div class="erro" style="display: none;">
        <h2>Oops! No movie found.</h2>
        <button onclick="voltarPaginaInicial()"><i class="fa-solid fa-house"></i> Back to Home</button>
      </div>
    </main>
  </div>

<?php require __DIR__ . '/includes/layout-bottom.php'; ?>
