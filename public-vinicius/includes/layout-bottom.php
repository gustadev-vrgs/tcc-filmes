<?php
/**
 * layout-bottom.php — fim comum a todas as páginas: fecha a moldura,
 * modais compartilhados (Favoritos, Motor de IA, Adicionar APIs) e o
 * script da página.
 *
 * Variáveis esperadas da página que inclui:
 *   $pageScript          (string) arquivo JS em js/ (ex.: "home.js")
 *   $includeTrailerModal (bool)   inclui o modal de trailer (página do filme)
 */
$pageScript          = $pageScript ?? 'home.js';
$includeTrailerModal = $includeTrailerModal ?? false;
?>
  <div class="film-sprockets film-sprockets-bottom" aria-hidden="true"></div>
</div>

  <!-- Modal de Favoritos -->
  <div id="favoritesModal">
    <div class="modal-content">
      <button class="close-modal" onclick="fecharFavoritos()"><i class="fa-solid fa-xmark"></i></button>
      <h2 id="favoritesTitle">Favorites</h2>
      <div id="favoritesList"></div>
    </div>
  </div>

  <!-- Modal "Adicionar APIs" — o usuário cola as próprias chaves (salvas no navegador) -->
  <div id="apiKeysModal">
    <div class="modal-content">
      <button class="close-modal" onclick="fecharApiKeys()"><i class="fa-solid fa-xmark"></i></button>
      <h2><i class="fa-solid fa-key"></i> <span id="apiKeysTitle">Add APIs</span></h2>
      <p class="ai-settings-hint api-keys-intro" id="apiKeysIntro"></p>
      <div class="api-keys-list" id="apiKeysList"></div>
      <div class="ai-settings-actions">
        <button type="button" class="ai-settings-save" id="btnSaveApiKeys" onclick="salvarApiKeys()"><i class="fa-solid fa-floppy-disk"></i> Save</button>
      </div>
    </div>
  </div>

  <!-- Modal de Configuração do Motor de IA -->
  <div id="aiSettingsModal">
    <div class="modal-content">
      <button class="close-modal" onclick="fecharConfiguracaoIA()"><i class="fa-solid fa-xmark"></i></button>
      <h2><i class="fa-solid fa-microchip"></i> <span id="aiSettingsTitle">AI Engine Settings</span></h2>

      <!-- Escolha do motor: WebLLM (local) ou API na nuvem -->
      <div class="ai-settings-section">
        <div class="engine-choice-cards">
          <button type="button" class="engine-card" id="engineCardWebllm" data-engine-card="webllm" onclick="selecionarEngineUI('webllm')">
            <i class="fa-solid fa-microchip"></i>
            <span class="engine-card-title" id="engineCardWebllmTitle">WebLLM (Local)</span>
            <span class="engine-card-desc" id="engineDescWebllm">Runs fully in your browser via WebGPU. Free, private, no API key needed.</span>
          </button>
          <button type="button" class="engine-card" id="engineCardApi" data-engine-card="api" onclick="selecionarEngineUI('api')">
            <i class="fa-solid fa-cloud"></i>
            <span class="engine-card-title" id="engineCardApiTitle">Cloud API</span>
            <span class="engine-card-desc" id="engineDescApi">Use a cloud provider's model with your own API key. Faster, no download.</span>
          </button>
        </div>
      </div>

      <!-- Painel WebLLM: seleção do modelo local -->
      <div class="ai-settings-panel" id="panelWebllm">
        <label class="ai-settings-label" id="lblWebllmModel">Local model</label>
        <div class="mode-toggle custom-select" id="webllmModelToggle">
          <button type="button" class="custom-select-btn" id="webllmModelSelectBtn" aria-haspopup="listbox">
            <span class="custom-select-label">Select a model…</span>
            <span class="arrow">▼</span>
          </button>
          <div class="mode-options custom-select-options" id="webllmModelOptionsList" role="listbox"></div>
        </div>
        <p class="ai-settings-hint" id="webllmModelHint">Bigger models are smarter but take longer to download and use more memory.</p>
      </div>

      <!-- Painel API: provedor, modelo e chave de API fornecida pelo usuário -->
      <div class="ai-settings-panel" id="panelApi">
        <label class="ai-settings-label" id="lblApiProvider">Provider</label>
        <div class="mode-toggle custom-select" id="apiProviderToggle">
          <button type="button" class="custom-select-btn" id="apiProviderSelectBtn" aria-haspopup="listbox">
            <span class="custom-select-label">Select a provider…</span>
            <span class="arrow">▼</span>
          </button>
          <div class="mode-options custom-select-options" id="apiProviderOptionsList" role="listbox"></div>
        </div>

        <label class="ai-settings-label" id="lblApiModel">Model</label>
        <div class="mode-toggle custom-select" id="apiModelToggle">
          <button type="button" class="custom-select-btn" id="apiModelSelectBtn" aria-haspopup="listbox">
            <span class="custom-select-label">Select a model…</span>
            <span class="arrow">▼</span>
          </button>
          <div class="mode-options custom-select-options" id="apiModelOptionsList" role="listbox"></div>
        </div>
        <input type="text" id="apiModelCustomInput" placeholder="model-id (e.g. gpt-4o-mini)" style="display:none; margin-top:8px;" oninput="onApiModelCustomInput(this.value)" />

        <div id="apiCustomEndpointWrap" style="display:none;">
          <label class="ai-settings-label" for="apiCustomEndpointInput" id="lblApiEndpoint">Endpoint URL (OpenAI-compatible)</label>
          <input type="text" id="apiCustomEndpointInput" placeholder="https://.../v1/chat/completions" oninput="onApiEndpointInput(this.value)" />
        </div>

        <label class="ai-settings-label" for="apiKeyInput" id="lblApiKey">API Key</label>
        <div class="api-key-input-wrap">
          <input type="password" id="apiKeyInput" placeholder="Paste your API key" oninput="onApiKeyInput(this.value)" autocomplete="off" spellcheck="false" />
          <button type="button" id="toggleKeyVisibility" onclick="toggleApiKeyVisibility()" title="Show/hide key"><i class="fa-solid fa-eye"></i></button>
        </div>
        <p class="ai-settings-hint" id="apiKeyHint">Your key is stored only in this browser (localStorage) and sent directly to the provider. It never passes through our server.</p>
      </div>

      <p class="ai-settings-error" id="aiSettingsError"></p>

      <div class="ai-settings-actions">
        <button type="button" class="ai-settings-save" id="btnSaveAiSettings" onclick="salvarConfiguracaoIA()"><i class="fa-solid fa-check"></i> Save &amp; Use</button>
      </div>
    </div>
  </div>

<?php if ($includeTrailerModal): ?>
  <!-- Modal de Trailer -->
  <div id="trailerModal">
    <div class="modal-content trailer-modal-content">
      <button class="close-modal" onclick="fecharTrailer()"><i class="fa-solid fa-xmark"></i></button>
      <h2 id="trailerModalTitle"><i class="fa-solid fa-clapperboard"></i> Trailer</h2>
      <div class="trailer-frame-wrap" id="trailerFrameWrap"></div>
    </div>
  </div>
<?php endif; ?>

  <script type="module" src="js/<?= htmlspecialchars($pageScript, ENT_QUOTES, 'UTF-8') ?>?v=4"></script>

</body>
</html>
