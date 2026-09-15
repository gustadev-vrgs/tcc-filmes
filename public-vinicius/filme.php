<?php
/**
 * filme.php — PÁGINA DO FILME/SÉRIE: filme.php?id=<imdbID>
 * Pôster, notas, onde assistir, trailer, resumo por IA, favoritos e as
 * abas Sinopse / Elenco / Detalhes. O conteúdo é montado por js/movie.js.
 */
$pageTitle           = 'Ideal Film Finder';
$bodyClass           = 'page-movie detail-view';
$pageScript          = 'movie.js';
$includeTrailerModal = true;
require __DIR__ . '/includes/layout-top.php';
?>

  <div class="app-shell">
    <main class="content-panel">
      <!-- Loader -->
      <div id="loader">
        <div class="spinner"></div>
      </div>

      <!-- Detalhes do Filme -->
      <div class="detalhes" style="display: none;"></div>

      <!-- Mensagem de Erro -->
      <div class="erro" style="display: none;">
        <h2>Oops! No movie found.</h2>
        <button onclick="location.href = 'index.php'"><i class="fa-solid fa-house"></i> Back to Home</button>
      </div>
    </main>
  </div>

<?php require __DIR__ . '/includes/layout-bottom.php'; ?>
