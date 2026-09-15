<?php
/**
 * layout-top.php — início comum a todas as páginas: <head>, cabeçalho
 * (IA, idioma, favoritos, busca rápida, configurações) e barra de status
 * do motor de IA.
 *
 * Variáveis esperadas da página que inclui:
 *   $pageTitle  (string) título da aba
 *   $bodyClass  (string) classes extras do <body> (opcional)
 */
$pageTitle = $pageTitle ?? 'Ideal Film Finder';
$bodyClass = $bodyClass ?? '';
?>
<!DOCTYPE html>
<html lang="en" data-layout="duo">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#0A0D24" />
  <title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?></title>
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8E%AC%3C/text%3E%3C/svg%3E" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" integrity="sha512-iecdLmaskl7CVkqkXNQ/ZH/XLlvWZOJyj7Yy7tcenmpD1ypASozpmT/E0iPtmFIB46ZmdtAc9eNBvH0H/ZpiBw==" crossorigin="anonymous" referrerpolicy="no-referrer" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="FilmesCss.css?v=4"/>
  <script>
    // Aplica layout/idioma salvos antes da primeira pintura — evita o "piscar"
    // do layout padrão a cada troca de página
    try {
      document.documentElement.setAttribute("data-layout", localStorage.getItem("siteLayout") || "duo");
      document.documentElement.lang = localStorage.getItem("siteLanguage") === "pt" ? "pt-br" : "en";
    } catch (e) {}
  </script>
</head>
<body data-mode="dark" data-style="default" class="<?= htmlspecialchars($bodyClass, ENT_QUOTES, 'UTF-8') ?>">
<script>
  try {
    document.body.setAttribute("data-mode",  localStorage.getItem("siteMode")  || "dark");
    document.body.setAttribute("data-style", localStorage.getItem("siteStyle") || "default");
  } catch (e) {}
</script>

<div class="page-frame">
  <div class="vignette-layer" aria-hidden="true"></div>
  <div class="film-sprockets film-sprockets-top" aria-hidden="true"></div>

  <!-- Cabeçalho -->
  <header>
    <div class="header-left">
      <a href="index.php" id="homeLink">Ideal Film Finder</a>
    </div>

    <!-- Centro: funções usadas com mais frequência -->
    <div class="header-center">
      <!-- Botão de configuração do motor de IA: abre o modal de seleção de motor/modelo/provedor/chave -->
      <div class="mode-toggle" id="aiEngineToggleBtn">
        <button id="aiEngineButton" aria-haspopup="dialog" onclick="abrirConfiguracaoIA()">
          <i class="fa-solid fa-microchip"></i> AI: WebLLM (Local) <span class="arrow">▼</span>
        </button>
      </div>

      <button id="langToggleButton" onclick="toggleLanguage()">
        <i class="fa-solid fa-language"></i> Language: English
      </button>

      <button class="favorites" onclick="mostrarFavoritos()"><i class="fa-solid fa-star"></i> Favorites</button>
    </div>

    <!-- Direita: busca rápida + configurações de exibição -->
    <div class="header-right">

      <!-- Busca rápida por título, acessível de qualquer página -->
      <div class="header-search" id="headerSearchWrap">
        <button type="button" class="header-icon-btn" id="quickSearchBtn" onclick="toggleQuickSearch()" aria-haspopup="true" aria-label="Search movies" title="Search movies">
          <i class="fa-solid fa-magnifying-glass"></i>
        </button>
        <form id="quickSearchForm" autocomplete="off">
          <input type="text" id="quickSearchInput" name="q" placeholder="Search movies…" />
        </form>
      </div>

      <!-- Configurações: Layout / Modo / Estilo / Resultados da IA / Adicionar APIs -->
      <div class="mode-toggle" id="settingsToggleBtn">
        <button id="settingsButton" class="header-icon-btn" aria-haspopup="true" aria-label="Display settings" title="Display settings">
          <i class="fa-solid fa-gear"></i>
        </button>
        <div id="settingsOptions" class="mode-options settings-panel">

          <!-- Seleção de organização visual da página -->
          <div class="mode-toggle settings-subtoggle" id="layoutToggleBtn">
            <button id="layoutButton" aria-haspopup="true">
              <i class="fa-solid fa-clapperboard"></i> Layout: Double Feature <span class="arrow">▼</span>
            </button>
            <div id="layoutOptions" class="mode-options">
              <button data-layoutopt="duo" onclick="setLayout('duo')"><i class="fa-solid fa-clapperboard"></i> Double Feature — side-by-side search</button>
              <button data-layoutopt="premiere" onclick="setLayout('premiere')"><i class="fa-solid fa-table-cells"></i> Premiere — classic centered layout</button>
              <button data-layoutopt="sidebar" onclick="setLayout('sidebar')"><i class="fa-solid fa-table-columns"></i> Side Session — sticky sidebar search</button>
              <button data-layoutopt="row" onclick="setLayout('row')"><i class="fa-solid fa-film"></i> Poster Row — horizontal scrolling reel</button>
            </div>
          </div>

          <div class="mode-toggle settings-subtoggle" id="modeToggleBtn">
            <button id="modeButton" aria-haspopup="true">
              <i class="fa-solid fa-moon"></i> Mode: Dark <span class="arrow">▼</span>
            </button>
            <div id="modeOptions" class="mode-options">
              <button data-modeopt="dark" onclick="setMode('dark')"><i class="fa-solid fa-moon"></i> Dark — deep, low-light canvas</button>
              <button data-modeopt="light" onclick="setMode('light')"><i class="fa-solid fa-sun"></i> Light — bright, airy canvas</button>
            </div>
          </div>

          <!-- Seleção de paleta/estilo — combina com o Modo acima (ex.: Dark + Neon) -->
          <div class="mode-toggle settings-subtoggle" id="styleToggleBtn">
            <button id="styleButton" aria-haspopup="true">
              <i class="fa-solid fa-circle"></i> Style: Default <span class="arrow">▼</span>
            </button>
            <div id="styleOptions" class="mode-options">
              <button data-styleopt="default" onclick="setStyle('default')"><i class="fa-solid fa-circle"></i> Default — clean modern palette</button>
              <button data-styleopt="vintage" onclick="setStyle('vintage')"><i class="fa-solid fa-clapperboard"></i> Vintage — aged film reel, sepia and grain</button>
              <button data-styleopt="neon" onclick="setStyle('neon')"><i class="fa-solid fa-bolt"></i> Neon — electric glow, high-contrast accents</button>
              <button data-styleopt="rainbow" onclick="setStyle('rainbow')"><i class="fa-solid fa-rainbow"></i> Rainbow — full-spectrum highlights</button>
              <button data-styleopt="mono" onclick="setStyle('mono')"><i class="fa-solid fa-circle-half-stroke"></i> Monochrome — grayscale only</button>
            </div>
          </div>

          <!-- Quantidade de filmes que a IA recomenda por pesquisa -->
          <div class="mode-toggle settings-subtoggle" id="recCountToggleBtn">
            <button id="recCountButton" aria-haspopup="true">
              <i class="fa-solid fa-list-ol"></i> AI results: 8 <span class="arrow">▼</span>
            </button>
            <div id="recCountOptions" class="mode-options">
              <button data-recopt="4" onclick="setRecommendationCount(4)">4 — quick picks</button>
              <button data-recopt="6" onclick="setRecommendationCount(6)">6</button>
              <button data-recopt="8" onclick="setRecommendationCount(8)">8 — default</button>
              <button data-recopt="10" onclick="setRecommendationCount(10)">10</button>
              <button data-recopt="12" onclick="setRecommendationCount(12)">12 — more options</button>
            </div>
          </div>

          <!-- Chaves de API do próprio usuário (salvas no navegador) -->
          <button type="button" class="settings-action-btn" id="apiKeysMenuButton" onclick="abrirApiKeys()">
            <i class="fa-solid fa-key"></i> Add APIs
          </button>

        </div>
      </div>
    </div>
  </header>

  <!-- Barra de status do motor de IA — fixa logo abaixo do header -->
  <div id="webllm-status-bar" class="hidden-bar" onclick="abrirConfiguracaoIA()" role="button" tabindex="0" title="Click to configure the AI engine">
    <div id="webllm-status-inner">
      <i class="fa-solid fa-microchip" id="webllm-status-icon"></i>
      <span id="webllm-status-text">AI Engine: Initializing...</span>
      <span id="webllm-progress-pct"></span>
      <div id="webllm-progress-wrap">
        <div id="webllm-progress-bar"></div>
      </div>
    </div>
  </div>
