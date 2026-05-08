const api = window.launcherApi;
const CRAFTY_SKINS_PAGE_SIZE = 6;
const CRAFTY_SKIN_PREVIEW_DELAY_MS = 800;
const CRAFTY_SKIN_SEARCH_DELAY_MS = 320;

let skinHoverTimer = null;
let skinViewer = null;
let activeSkinPreviewIndex = null;

const state = {
  versions: [],
  modpacks: [],
  latest: null,
  selected: null,
  account: null,
  accounts: [],
  settings: null,
  busy: false,
  activeTab: "versions",
  activeModpacksTab: "search",
  modpacksLoading: false,
  modpackQuery: "",
  modpackTotalHits: 0,
  modpackSearchTimer: null,
  installingModpackId: null,
  pendingModpack: null,
  modpackVersions: [],
  progressMode: "idle",
  progressValue: 0,
  progressResetTimer: null,
  modpackFilters: { loader: "", gameVersion: "" },
  modpackFiltersOpen: false,
  // Download tracking for progress bar
  downloadModpackName: "",
  downloadStartTime: 0,
  downloadedBytes: 0,
  downloadTotalBytes: 0,
  downloadFilesDone: 0,
  downloadFilesTotal: 0,
  downloadLastSpeedBytes: 0,
  downloadLastSpeedTime: 0,
  downloadSpeed: 0,
  skinEditorAccountId: null,
  skinCatalog: [],
  skinCatalogQuery: "",
  skinCatalogPage: 1,
  skinCatalogPageSize: CRAFTY_SKINS_PAGE_SIZE,
  skinCatalogLoaded: false,
  skinCatalogLoadedQuery: "",
  skinCatalogLoading: false,
  skinCatalogRequestId: 0,
  skinCatalogSearchTimer: null,
  skinCatalogError: "",
  skinApplyBusy: false,
};

const elements = {
  navVersions: document.querySelector("#nav-versions"),
  navModpacks: document.querySelector("#nav-modpacks"),
  topbarTitle: document.querySelector("#topbar-title"),
  browseMode: document.querySelector("#browse-mode"),
  accountStatus: document.querySelector("#account-status"),
  accountView: document.querySelector("#account-view"),
  accountDropdown: document.querySelector("#account-dropdown"),
  accountChevron: document.querySelector("#account-chevron"),
  manageAccountsBtn: document.querySelector("#manage-accounts-btn"),
  addAccount: document.querySelector("#add-account"),
  addLocalAccountBtn: document.querySelector("#add-local-account-btn"),
  accountsModal: document.querySelector("#accounts-modal"),
  closeAccountsModal: document.querySelector("#close-accounts-modal"),
  cancelAccountsModal: document.querySelector("#cancel-accounts-modal"),
  accountsList: document.querySelector("#accounts-list"),
  accountSkinPanel: document.querySelector("#account-skin-panel"),
  accountSkinPanelTitle: document.querySelector("#account-skin-panel-title"),
  accountSkinPanelSubtitle: document.querySelector("#account-skin-panel-subtitle"),
  accountSkinPreview: document.querySelector("#account-skin-preview"),
  accountSkinStatus: document.querySelector("#account-skin-status"),
  accountSkinHint: document.querySelector("#account-skin-hint"),
  closeAccountSkinPanel: document.querySelector("#close-account-skin-panel"),
  accountSkinUploadBtn: document.querySelector("#account-skin-upload-btn"),
  accountSkinFile: document.querySelector("#account-skin-file"),
  accountSkinVariant: document.querySelector("#account-skin-variant"),
  reloadCraftySkins: document.querySelector("#reload-crafty-skins"),
  craftySkinSearch: document.querySelector("#crafty-skin-search"),
  craftySkinsList: document.querySelector("#crafty-skins-list"),
  craftySkinsPagination: document.querySelector("#crafty-skins-pagination"),
  craftySkinHoverPopup: document.querySelector("#crafty-skin-hover-popup"),
  craftySkinHoverCanvas: document.querySelector("#crafty-skin-hover-canvas"),
  craftySkinHoverTitle: document.querySelector("#crafty-skin-hover-title"),
  craftySkinHoverMeta: document.querySelector("#crafty-skin-hover-meta"),
  localAccountModal: document.querySelector("#local-account-modal"),
  closeLocalAccountModal: document.querySelector("#close-local-account-modal"),
  cancelLocalAccount: document.querySelector("#cancel-local-account"),
  confirmLocalAccount: document.querySelector("#confirm-local-account"),
  localAccountUsername: document.querySelector("#local-account-username"),
  localAccountHint: document.querySelector("#local-account-hint"),
  modpackVersionModal: document.querySelector("#modpack-version-modal"),
  closeModpackVersionModal: document.querySelector("#close-modpack-version-modal"),
  cancelModpackVersion: document.querySelector("#cancel-modpack-version"),
  modpackVersionTitle: document.querySelector("#modpack-version-title"),
  modpackVersionSubtitle: document.querySelector("#modpack-version-subtitle"),
  modpackVersionList: document.querySelector("#modpack-version-list"),
  minMemory: document.querySelector("#min-memory"),
  maxMemory: document.querySelector("#max-memory"),
  javaPath: document.querySelector("#java-path"),
  windowWidth: document.querySelector("#window-width"),
  windowHeight: document.querySelector("#window-height"),
  openFolder: document.querySelector("#open-folder"),
  latestLine: document.querySelector("#latest-line"),
  versionFilter: document.querySelector("#version-filter"),
  refreshVersions: document.querySelector("#refresh-versions"),
  modpackSubtabs: document.querySelector("#modpack-subtabs"),
  modpacksSearchTab: document.querySelector("#modpacks-search-tab"),
  modpacksDownloadedTab: document.querySelector("#modpacks-downloaded-tab"),
  versionSearch: document.querySelector("#version-search"),
  launcherGrid: document.querySelector("#launcher-grid"),
  playPanel: document.querySelector("#play-panel"),
  versionList: document.querySelector("#version-list"),
  selectedPanel: document.querySelector("#selected-panel"),
  clearSelection: document.querySelector("#clear-selection"),
  playActions: document.querySelector("#play-actions"),
  selectedVersion: document.querySelector("#selected-version"),
  selectedMeta: document.querySelector("#selected-meta"),
  installVersion: document.querySelector("#install-version"),
  uninstallVersion: document.querySelector("#uninstall-version"),
  launchVersion: document.querySelector("#launch-version"),
  progressBox: document.querySelector("#progress-box"),
  progressLabel: document.querySelector("#progress-label"),
  progressPercent: document.querySelector("#progress-percent"),
  progressBar: document.querySelector("#progress-bar"),
  topProgressBox: document.querySelector("#top-progress-box"),
  topProgressLabel: document.querySelector("#top-progress-label"),
  topProgressPercent: document.querySelector("#top-progress-percent"),
  topProgressBar: document.querySelector("#top-progress-bar"),
  minecraftPath: document.querySelector("#minecraft-path"),
  clearLog: document.querySelector("#clear-log"),
  logOutput: document.querySelector("#log-output"),
  java8Path: document.querySelector("#java8-path"),
  logSize: document.querySelector("#log-size"),
  modpackFilterBtn: document.querySelector("#modpack-filter-btn"),
  modpackFiltersPanel: document.querySelector("#modpack-filters"),
  modpackFilterVersion: document.querySelector("#modpack-filter-version"),
  winMin: document.querySelector("#win-min"),
  winMax: document.querySelector("#win-max"),
  winClose: document.querySelector("#win-close"),
  btnShowLog: document.querySelector("#btn-show-log"),
};

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function appendLog(type, message) {
  if (api.appendLog) {
    api.appendLog(type, message);
  }
}

function setBusy(value) {
  state.busy = value;
  [
    elements.navVersions,
    elements.navModpacks,
    elements.browseMode,
    elements.addAccount,
    elements.addLocalAccountBtn,
    elements.removeAccount,
    elements.refreshVersions,
    elements.installVersion,
    elements.uninstallVersion,
    elements.launchVersion,
  ]
    .filter(Boolean)
    .forEach((button) => {
      button.disabled = value;
    });

  if (elements.confirmLocalAccount) {
    elements.confirmLocalAccount.disabled = value;
  }

  if (elements.cancelModpackVersion) {
    elements.cancelModpackVersion.disabled = value;
  }

  if (elements.closeModpackVersionModal) {
    elements.closeModpackVersionModal.disabled = value;
  }

  syncActionButtons();

  if (
    elements.modpackVersionModal &&
    !elements.modpackVersionModal.classList.contains("hidden")
  ) {
    renderModpackVersionOptions();
  }

  if (elements.accountsModal && !elements.accountsModal.classList.contains("hidden")) {
    renderAccountsModal();
  }
}

function canInstallSelectedVersion() {
  return Boolean(state.selected && !state.selected.local && !state.selected.installed);
}

function canUninstallSelectedVersion() {
  return Boolean(state.selected && (state.selected.installed || state.selected.local));
}

function clearSelectedVersion() {
  if (state.busy) return;
  state.selected = null;
  renderSelected();
  renderCatalog();
}

let _playPanelLeaveTimer = null;
let _playPanelVisible = false;

function animatePlayPanel(show) {
  const panel = elements.playPanel;
  if (!panel) return;

  if (show) {
    // Cancel any pending hide
    if (_playPanelLeaveTimer) {
      clearTimeout(_playPanelLeaveTimer);
      _playPanelLeaveTimer = null;
    }

    // Restore grid layout immediately so it animates while panel slides in
    elements.launcherGrid.classList.remove("no-selection");

    if (_playPanelVisible) {
      // Panel already open — no animation needed
      panel.classList.remove("hidden", "leaving", "entering");
      return;
    }

    // First selection (or after closing): play slide-in
    _playPanelVisible = true;
    panel.classList.remove("hidden", "leaving");
    void panel.offsetWidth;
    panel.classList.add("entering");
    panel.addEventListener("animationend", () => {
      panel.classList.remove("entering");
    }, { once: true });
  } else {
    if (panel.classList.contains("hidden")) return;
    _playPanelVisible = false;
    panel.classList.remove("entering");
    panel.classList.add("leaving");
    // Collapse grid column immediately — CSS transition animates it
    elements.launcherGrid.classList.add("no-selection");
    _playPanelLeaveTimer = setTimeout(() => {
      panel.classList.add("hidden");
      panel.classList.remove("leaving");
      _playPanelLeaveTimer = null;
    }, 750);
  }
}

function syncActionButtons() {
  const hasSelection = Boolean(state.selected);
  const canInstall = canInstallSelectedVersion();

  animatePlayPanel(hasSelection);
  elements.selectedPanel.classList.toggle("hidden", !hasSelection);
  elements.installVersion.hidden = !canInstall;
  elements.installVersion.disabled = state.busy || !canInstall;
  elements.uninstallVersion.classList.toggle("hidden", !canUninstallSelectedVersion());
  elements.uninstallVersion.disabled = state.busy || !canUninstallSelectedVersion();
  elements.launchVersion.disabled = state.busy || !hasSelection;
  elements.clearSelection.disabled = state.busy || !hasSelection;
  elements.playActions.classList.toggle("launch-only", hasSelection && !canInstall);
}

function validateLocalUsername(value) {
  const normalized = String(value || "").trim();
  const valid = /^[A-Za-z0-9_]{3,16}$/.test(normalized);

  return {
    normalized,
    valid,
    message: valid
      ? "Use de 3 a 16 caracteres com letras, numeros ou _."
      : "Username invalido. Use 3-16 caracteres com letras, numeros ou _.",
  };
}

function updateLocalAccountHint() {
  const { valid, message } = validateLocalUsername(elements.localAccountUsername.value);
  elements.localAccountHint.textContent = message;
  elements.localAccountHint.classList.toggle("error", !valid);
  elements.confirmLocalAccount.disabled = state.busy || !valid;
}

function openLocalAccountModal() {
  elements.localAccountUsername.value =
    state.account?.type === "local" ? state.account.name : "Player";
  elements.localAccountModal.classList.remove("hidden");
  elements.localAccountModal.setAttribute("aria-hidden", "false");
  updateLocalAccountHint();
  requestAnimationFrame(() => {
    elements.localAccountUsername.focus();
    elements.localAccountUsername.select();
  });
}

function closeLocalAccountModal() {
  elements.localAccountModal.classList.add("hidden");
  elements.localAccountModal.setAttribute("aria-hidden", "true");
}

function modpackLoaderLabel(loaderType) {
  const normalized = String(loaderType || "vanilla").toLowerCase();
  if (normalized === "vanilla") return "Vanilla";
  if (normalized === "fabric") return "Fabric";
  if (normalized === "forge") return "Forge";
  if (normalized === "neoforge") return "NeoForge";
  if (normalized === "forgeoptifine") return "ForgeOptifine";
  return normalized;
}

function closeModpackVersionModal() {
  state.pendingModpack = null;
  state.modpackVersions = [];
  elements.modpackVersionModal.classList.add("hidden");
  elements.modpackVersionModal.setAttribute("aria-hidden", "true");
  elements.modpackVersionList.innerHTML = "";
}

function openModpackVersionModal(modpack, versions) {
  state.pendingModpack = modpack;
  state.modpackVersions = Array.isArray(versions) ? versions : [];
  elements.modpackVersionTitle.textContent = `Escolher versao de ${modpack.title}`;
  elements.modpackVersionSubtitle.textContent = "Selecione qual versao voce quer baixar.";
  elements.modpackVersionModal.classList.remove("hidden");
  elements.modpackVersionModal.setAttribute("aria-hidden", "false");
  renderModpackVersionOptions();
  requestAnimationFrame(() => {
    const firstButton = elements.modpackVersionList.querySelector("button");
    if (firstButton) firstButton.focus();
  });
}

function renderModpackVersionOptions() {
  elements.modpackVersionList.innerHTML = "";

  const fragment = document.createDocumentFragment();
  state.modpackVersions.forEach((version) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "modpack-version-item";
    button.disabled = state.busy;
    button.innerHTML = `
      <span class="modpack-version-copy">
        <strong>${escapeHtml(version.name || version.versionNumber || version.id)}</strong>
      </span>
    `;
    button.addEventListener("click", () => installModpackVersion(state.pendingModpack, version.id));
    fragment.appendChild(button);
  });

  elements.modpackVersionList.appendChild(fragment);
}

async function submitLocalAccount() {
  const { normalized, valid, message } = validateLocalUsername(
    elements.localAccountUsername.value
  );

  if (!valid) {
    elements.localAccountHint.textContent = message;
    elements.localAccountHint.classList.add("error");
    elements.localAccountUsername.focus();
    elements.localAccountUsername.select();
    return;
  }

  setBusy(true);
  try {
    state.account = await api.addLocalAccount(normalized);
    closeLocalAccountModal();
    await refreshState();
  } catch (error) {
    appendLog("error", error.message || String(error));
    elements.localAccountHint.textContent = error.message || String(error);
    elements.localAccountHint.classList.add("error");
  } finally {
    setBusy(false);
    updateLocalAccountHint();
  }
}

function currentSettings() {
  return {
    minMemory: elements.minMemory.value,
    maxMemory: elements.maxMemory.value,
    javaPath: elements.javaPath.value,
    java8Path: elements.java8Path.value,
    logFontSize: Number(elements.logSize.value) || 12,
    windowWidth: elements.windowWidth.value,
    windowHeight: elements.windowHeight.value,
    versionFilter: elements.versionFilter.value,
  };
}

function applySettings(settings) {
  state.settings = settings;
  elements.minMemory.value = settings.minMemory;
  elements.maxMemory.value = settings.maxMemory;
  elements.javaPath.value = settings.javaPath;
  elements.java8Path.value = settings.java8Path || "";
  elements.logSize.value = settings.logFontSize || 12;
  elements.windowWidth.value = settings.windowWidth;
  elements.windowHeight.value = settings.windowHeight;
  elements.versionFilter.value = settings.versionFilter;

  // Apply log font size
  try {
    const size = Number(settings.logFontSize) || 12;
    elements.logOutput.style.fontSize = `${size}px`;
  } catch (_e) {}
}

function accountTypeLabel(type) {
  return type === "microsoft" ? "Microsoft" : "Local";
}

function selectedSkinEditorAccount() {
  return (state.accounts || []).find((account) => account.accountId === state.skinEditorAccountId) || null;
}

function closeAccountsModal() {
  state.skinEditorAccountId = null;
  clearCraftySkinSearchTimer();
  clearCraftySkinHoverTimer();
  hideCraftySkinHoverPopup();
  if (elements.accountSkinFile) {
    elements.accountSkinFile.value = "";
  }
  if (elements.accountsModal) {
    elements.accountsModal.classList.add("hidden");
    elements.accountsModal.setAttribute("aria-hidden", "true");
  }
  renderAccountsModal();
}

function openSkinEditor(accountId) {
  state.skinEditorAccountId = accountId;
  const account = selectedSkinEditorAccount();
  if (account && elements.accountSkinVariant) {
    elements.accountSkinVariant.value = account.skin?.variant || "classic";
  }
  renderAccountsModal();
  loadCraftySkins();
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value || 0));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler o arquivo da skin."));
    reader.readAsDataURL(file);
  });
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function clearCraftySkinSearchTimer() {
  if (state.skinCatalogSearchTimer) {
    clearTimeout(state.skinCatalogSearchTimer);
    state.skinCatalogSearchTimer = null;
  }
}

function queueCraftySkinSearch() {
  clearCraftySkinSearchTimer();
  state.skinCatalogSearchTimer = setTimeout(() => {
    state.skinCatalogSearchTimer = null;
    loadCraftySkins();
  }, CRAFTY_SKIN_SEARCH_DELAY_MS);
}

function filteredCraftySkins() {
  return state.skinCatalog.map((skin, index) => ({ skin, index }));
}

function totalCraftySkinPages() {
  return Math.max(1, Math.ceil(filteredCraftySkins().length / state.skinCatalogPageSize));
}

function visibleCraftySkins() {
  const filtered = filteredCraftySkins();
  const totalPages = totalCraftySkinPages();
  if (state.skinCatalogPage > totalPages) {
    state.skinCatalogPage = totalPages;
  }

  const start = (state.skinCatalogPage - 1) * state.skinCatalogPageSize;
  return filtered.slice(start, start + state.skinCatalogPageSize);
}

function hideCraftySkinHoverPopup() {
  if (elements.craftySkinHoverPopup) {
    elements.craftySkinHoverPopup.classList.add("hidden");
    elements.craftySkinHoverPopup.setAttribute("aria-hidden", "true");
  }
  activeSkinPreviewIndex = null;
}

function clearCraftySkinHoverTimer() {
  if (skinHoverTimer) {
    clearTimeout(skinHoverTimer);
    skinHoverTimer = null;
  }
}

function ensureSkinViewer() {
  if (skinViewer || !elements.craftySkinHoverCanvas || !window.skinview3d?.SkinViewer) {
    return skinViewer;
  }

  skinViewer = new window.skinview3d.SkinViewer({
    canvas: elements.craftySkinHoverCanvas,
    width: 260,
    height: 320,
    enableControls: false,
    zoom: 0.72,
  });
  skinViewer.autoRotate = true;
  skinViewer.autoRotateSpeed = 1.4;
  skinViewer.globalLight.intensity = 1.2;
  skinViewer.cameraLight.intensity = 0.7;
  return skinViewer;
}

function positionCraftySkinHoverPopup(card) {
  if (!elements.craftySkinHoverPopup || !card) return;

  const cardRect = card.getBoundingClientRect();
  const popupWidth = 286;
  const popupHeight = 396;
  const gap = 18;
  const margin = 16;

  let left = cardRect.right + gap;
  if (left + popupWidth > window.innerWidth - margin) {
    left = cardRect.left - popupWidth - gap;
  }

  let top = cardRect.top + cardRect.height / 2 - popupHeight / 2;
  top = Math.max(margin, Math.min(top, window.innerHeight - popupHeight - margin));
  left = Math.max(margin, Math.min(left, window.innerWidth - popupWidth - margin));

  elements.craftySkinHoverPopup.style.left = `${Math.round(left)}px`;
  elements.craftySkinHoverPopup.style.top = `${Math.round(top)}px`;
}

function textureDataUrl(textureBase64) {
  return `data:image/png;base64,${textureBase64}`;
}

function showCraftySkinHoverPopup(index, card) {
  const skin = state.skinCatalog[index];
  if (!skin || !card) return;

  const viewer = ensureSkinViewer();
  if (!viewer || !elements.craftySkinHoverPopup) return;

  viewer.loadSkin(textureDataUrl(skin.textureBase64), {
    model: skin.variant === "slim" ? "slim" : "default",
  });
  viewer.width = 260;
  viewer.height = 320;
  viewer.zoom = 0.72;
  viewer.fov = 42;
  viewer.autoRotate = true;

  elements.craftySkinHoverTitle.textContent = skin.label;
  elements.craftySkinHoverMeta.textContent = `Modelo ${
    skin.variant === "slim" ? "Slim" : "Classic"
  } • ${formatCompactNumber(skin.popularity)} curtidas`;

  positionCraftySkinHoverPopup(card);
  elements.craftySkinHoverPopup.classList.remove("hidden");
  elements.craftySkinHoverPopup.setAttribute("aria-hidden", "false");
  activeSkinPreviewIndex = index;
}

function scheduleCraftySkinHoverPopup(index, card) {
  clearCraftySkinHoverTimer();
  hideCraftySkinHoverPopup();
  skinHoverTimer = setTimeout(() => {
    showCraftySkinHoverPopup(index, card);
    skinHoverTimer = null;
  }, CRAFTY_SKIN_PREVIEW_DELAY_MS);
}

function renderCraftySkinPagination() {
  if (!elements.craftySkinsPagination) return;

  const filteredCount = filteredCraftySkins().length;
  const totalPages = totalCraftySkinPages();
  if (state.skinCatalogLoading || filteredCount === 0 || totalPages <= 1) {
    elements.craftySkinsPagination.innerHTML = "";
    elements.craftySkinsPagination.classList.add("hidden");
    return;
  }

  const pageButtons = [];
  for (let page = 1; page <= totalPages; page += 1) {
    pageButtons.push(`
      <button
        class="crafty-page-button${page === state.skinCatalogPage ? " active" : ""}"
        type="button"
        data-page="${page}"
      >
        ${page}
      </button>
    `);
  }

  elements.craftySkinsPagination.innerHTML = `
    <button
      class="ghost crafty-page-nav"
      type="button"
      data-page-nav="prev"
      ${state.skinCatalogPage <= 1 ? "disabled" : ""}
    >
      Anterior
    </button>
    <div class="crafty-page-buttons">${pageButtons.join("")}</div>
    <span class="crafty-page-status">Pagina ${state.skinCatalogPage} de ${totalPages}</span>
    <button
      class="ghost crafty-page-nav"
      type="button"
      data-page-nav="next"
      ${state.skinCatalogPage >= totalPages ? "disabled" : ""}
    >
      Proxima
    </button>
  `;
  elements.craftySkinsPagination.classList.remove("hidden");
}

function renderCraftySkinList(account) {
  if (!elements.craftySkinsList) return;

  const searchQuery = String(state.skinCatalogQuery || "").trim();

  if (state.skinCatalogLoading) {
    elements.craftySkinsList.innerHTML =
      '<div class="crafty-skins-empty">Carregando skins da Crafty...</div>';
    renderCraftySkinPagination();
    return;
  }

  if (state.skinCatalogError && state.skinCatalog.length === 0) {
    elements.craftySkinsList.innerHTML = `<div class="crafty-skins-empty">${escapeHtml(
      state.skinCatalogError
    )}</div>`;
    renderCraftySkinPagination();
    return;
  }

  if (!state.skinCatalog.length) {
    elements.craftySkinsList.innerHTML = searchQuery
      ? `<div class="crafty-skins-empty">Nenhuma skin encontrada para &quot;${escapeHtml(
          searchQuery
        )}&quot;.</div>`
      : '<div class="crafty-skins-empty">Nenhuma skin da Crafty disponivel agora.</div>';
    renderCraftySkinPagination();
    return;
  }

  elements.craftySkinsList.innerHTML = visibleCraftySkins()
    .map(({ skin, index }) => {
      const isSelected = Boolean(account?.skin?.hash && account.skin.hash === skin.hash);
      return `
        <button
          class="crafty-skin-card${isSelected ? " selected" : ""}"
          type="button"
          data-index="${index}"
          ${state.busy || state.skinApplyBusy ? "disabled" : ""}
        >
          <img src="${escapeHtml(skin.headUrl || skin.previewUrl)}" class="crafty-skin-image" alt="${escapeHtml(
        skin.label
      )}">
          <div class="crafty-skin-copy">
            <strong>${escapeHtml(skin.label)}</strong>
            <small>${escapeHtml(`Modelo ${skin.variant === "slim" ? "Slim" : "Classic"}`)}</small>
            <small>${escapeHtml(
              `${formatCompactNumber(skin.popularity)} curtidas · ${formatCompactNumber(
                skin.playersCount
              )} usos`
            )}</small>
          </div>
        </button>
      `;
    })
    .join("");

  renderCraftySkinPagination();
}

function renderAccountSkinPanel() {
  if (!elements.accountSkinPanel) return;

  const account = selectedSkinEditorAccount();
  if (elements.accountsModal) {
    elements.accountsModal.classList.toggle("skin-editor-open", Boolean(account));
  }

  if (!account) {
    elements.accountSkinPanel.classList.add("hidden");
    clearCraftySkinHoverTimer();
    hideCraftySkinHoverPopup();
    if (elements.accountSkinPreview) {
      elements.accountSkinPreview.removeAttribute("src");
    }
    if (elements.craftySkinsList) {
      elements.craftySkinsList.innerHTML = "";
    }
    return;
  }

  elements.accountSkinPanel.classList.remove("hidden");
  elements.accountSkinPanelTitle.textContent = `Trocar skin de ${account.name}`;
  elements.accountSkinPanelSubtitle.textContent =
    account.type === "microsoft"
      ? "A nova skin sera aplicada na conta Microsoft e salva no launcher."
      : "Em conta local, a skin personalizada aparece no launcher.";

  if (elements.accountSkinPreview) {
    elements.accountSkinPreview.src = account.skin?.previewUrl || account.avatarUrl;
    elements.accountSkinPreview.alt = `Skin de ${account.name}`;
  }

  if (elements.craftySkinSearch) {
    elements.craftySkinSearch.value = state.skinCatalogQuery;
    elements.craftySkinSearch.disabled = state.busy || state.skinApplyBusy;
  }

  if (elements.accountSkinVariant) {
    elements.accountSkinVariant.value = account.skin?.variant || elements.accountSkinVariant.value || "classic";
    elements.accountSkinVariant.disabled = state.busy || state.skinApplyBusy;
  }

  if (elements.accountSkinUploadBtn) {
    elements.accountSkinUploadBtn.disabled = state.busy || state.skinApplyBusy;
  }

  if (elements.reloadCraftySkins) {
    elements.reloadCraftySkins.disabled = state.busy || state.skinCatalogLoading || state.skinApplyBusy;
  }

  const details = [];
  if (account.skin?.label) {
    details.push(account.skin.label);
  }
  if (account.skin?.updatedAt) {
    details.push(`Atualizada em ${formatDate(account.skin.updatedAt)}`);
  }
  if (account.skin?.sessionVerifiedAt) {
    details.push("Confirmada no online-mode");
  } else if (account.skin?.verifiedAt) {
    details.push("Confirmada na Minecraft Services");
  } else if (account.skin?.localOnly) {
    details.push("Local");
  }
  if (state.skinCatalogError) {
    details.push(state.skinCatalogError);
  }

  elements.accountSkinStatus.textContent =
    details.join(" • ") || "Use um PNG proprio ou escolha uma skin pronta da Crafty.";
  elements.accountSkinHint.textContent =
    account.type === "microsoft"
      ? "Arquivos PNG validos: 64x64 ou 64x32. Em servidores online-mode, outros jogadores veem a skin apos a sincronizacao da Minecraft Services."
      : "Contas locais usam authlib-injector para mostrar a skin dentro do jogo em sessoes locais/offline. No primeiro uso o launcher pode baixar esse componente.";

  renderCraftySkinList(account);
}

function renderAccount() {
  if (state.account) {
    elements.accountView.innerHTML = `
      <img src="${escapeHtml(state.account.avatarUrl)}" class="avatar avatar-image" alt="Avatar">
      <div style="flex: 1; overflow: hidden;">
        <strong>${state.account.name}</strong>
        <small>${accountTypeLabel(state.account.type)}</small>
      </div>
      <svg id="account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; color: var(--muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>
    `;
    elements.accountStatus.textContent = "Online";
    elements.accountStatus.className = "status-pill online";
  } else {
    elements.accountView.innerHTML = `
      <div class="avatar">?</div>
      <div style="flex: 1; overflow: hidden;">
        <strong>Nenhuma conta</strong>
        <small>Adicione ou selecione</small>
      </div>
      <svg id="account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; color: var(--muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>
    `;
    elements.accountStatus.textContent = "Offline";
    elements.accountStatus.className = "status-pill";
  }

  // Restore the chevron listener reference
  elements.accountChevron = document.querySelector("#account-chevron");
  
  if (elements.accountsModal && !elements.accountsModal.classList.contains("hidden")) {
    renderAccountsModal();
  }
}

function renderAccountsModal() {
  if (!elements.accountsList) return;
  const accounts = state.accounts || [];
  if (accounts.length === 0) {
    elements.accountsList.innerHTML = '<div class="accounts-empty">Nenhuma conta adicionada.</div>';
    renderAccountSkinPanel();
    return;
  }

  elements.accountsList.innerHTML = accounts
    .map((account) => {
      const isEditing = state.skinEditorAccountId === account.accountId;
      return `
        <div class="account-item${account.isActive ? " active" : ""}${isEditing ? " editing" : ""}" data-id="${escapeHtml(
        account.accountId
      )}">
          <div class="account-item-main">
            <button
              class="account-skin-trigger"
              type="button"
              data-id="${escapeHtml(account.accountId)}"
              aria-label="Trocar skin de ${escapeHtml(account.name)}"
              ${state.busy || state.skinApplyBusy ? "disabled" : ""}
            >
              <img src="${escapeHtml(account.skin?.previewUrl || account.avatarUrl)}" class="account-item-avatar" alt="Skin de ${escapeHtml(
        account.name
      )}">
            </button>
            <div class="account-item-copy">
              <strong>${escapeHtml(account.name)}</strong>
              <small>${escapeHtml(accountTypeLabel(account.type))}</small>
            </div>
          </div>
          <div class="account-item-actions">
            ${
              account.skin
                ? `<span class="account-chip">${escapeHtml(
                    account.skin.source === "crafty" ? "Crafty" : "Skin"
                  )}</span>`
                : ""
            }
            ${account.isActive ? '<span class="account-chip account-chip-active">Ativa</span>' : ""}
            <button
              class="ghost icon-button small-icon-button btn-remove-account"
              type="button"
              data-id="${escapeHtml(account.accountId)}"
              aria-label="Remover conta ${escapeHtml(account.name)}"
              ${state.busy || state.skinApplyBusy ? "disabled" : ""}
            >
              ×
            </button>
          </div>
        </div>
      `;
    })
    .join("");

  renderAccountSkinPanel();
}

async function loadCraftySkins(force = false) {
  const searchQuery = String(state.skinCatalogQuery || "").trim();
  const searchKey = normalizeSearchText(searchQuery);
  if (!force && state.skinCatalogLoaded && state.skinCatalogLoadedQuery === searchKey) return;

  const requestId = state.skinCatalogRequestId + 1;
  const queryChanged = state.skinCatalogLoadedQuery !== searchKey;
  state.skinCatalogRequestId = requestId;

  state.skinCatalogLoading = true;
  state.skinCatalogError = "";
  if (queryChanged) {
    state.skinCatalog = [];
  }
  clearCraftySkinHoverTimer();
  hideCraftySkinHoverPopup();
  renderAccountSkinPanel();

  try {
    const skins = await api.getCraftySkins({ search: searchQuery });
    if (requestId !== state.skinCatalogRequestId) return;

    state.skinCatalog = Array.isArray(skins) ? skins : [];
    state.skinCatalogLoaded = true;
    state.skinCatalogLoadedQuery = searchKey;
  } catch (error) {
    if (requestId !== state.skinCatalogRequestId) return;

    state.skinCatalogError = error.message || String(error);
    appendLog("error", state.skinCatalogError);
  } finally {
    if (requestId !== state.skinCatalogRequestId) return;

    state.skinCatalogLoading = false;
    renderAccountSkinPanel();
  }
}

async function applySkinToSelectedAccount(payload) {
  const account = selectedSkinEditorAccount();
  if (!account) return;

  state.skinApplyBusy = true;
  renderAccountSkinPanel();

  try {
    await api.updateAccountSkin({
      accountId: account.accountId,
      ...payload,
    });
    await refreshState();
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    state.skinApplyBusy = false;
    renderAccountSkinPanel();
  }
}

function versionLabel(version) {
  const map = {
    release: "release",
    snapshot: "snapshot",
    fabric: "fabric",
    forge: "forge",
    neoforge: "neoforge",
    optifine: "optifine",
    forgeoptifine: "forgeoptifine",
    modpack: "modpack",
    custom: "custom",
    local: "local",
  };
  return map[version.type] || version.type || "release";
}

function loaderDisplayName(loaderType) {
  const value = String(loaderType || "").toLowerCase();
  if (value === "optifine") return "Optifine";
  if (value === "forge") return "Forge";
  if (value === "neoforge") return "NeoForge";
  if (value === "fabric") return "Fabric";
  if (value === "forgeoptifine") return "ForgeOptifine";
  return modpackLoaderLabel(loaderType);
}

function isForgeOptiFineVersion(version) {
  return String(version?.loaderType || version?.type || "").toLowerCase() === "forgeoptifine";
}

function versionDisplayName(version) {
  const loaderType = String(version?.loaderType || version?.type || "").toLowerCase();
  const minecraftVersion = version?.minecraftVersion || version?.inheritsFrom || "";

  if (isForgeOptiFineVersion(version)) {
    return `ForgeOptifine ${minecraftVersion || version.id || ""}`.trim();
  }

  if (loaderType === "fabric") {
    const parts = [loaderDisplayName(loaderType), minecraftVersion];
    if (version?.loaderVersion) {
      parts.push(`Loader ${version.loaderVersion}`);
    }
    return parts.filter(Boolean).join(" ").trim() || version?.id || "-";
  }

  if (["optifine", "forge", "neoforge"].includes(loaderType)) {
    return `${loaderDisplayName(loaderType)} ${minecraftVersion || version?.id || ""}`.trim();
  }

  return version?.modpackTitle || version?.id || "-";
}

function isDownloadedModpack(version) {
  return Boolean(version && (version.type === "modpack" || version.modpackProjectId || version.modpackTitle));
}

function downloadedModpacks() {
  const query = elements.versionSearch ? elements.versionSearch.value.trim().toLowerCase() : "";
  return state.versions
    .filter((version) => isDownloadedModpack(version) && (version.installed || version.local))
    .filter((version) => 
        !query || 
        version.id.toLowerCase().includes(query) || 
        String(version.modpackTitle || "").toLowerCase().includes(query)
    )
    .sort(compareVersions);
}

function versionDescription(version) {
  const loaderType = String(version?.loaderType || version?.type || "").toLowerCase();

  if (isForgeOptiFineVersion(version)) {
    return "";
  }

  if (["optifine", "forge", "neoforge"].includes(loaderType)) {
    return version?.loaderVersion ? `Loader ${version.loaderVersion}` : "";
  }

  if (loaderType === "fabric") {
    return "";
  }

  const parts = [versionLabel(version)];
  if (version.modpackVersionNumber) parts.push(`pack ${version.modpackVersionNumber}`);
  if (version.minecraftVersion) parts.push(`MC ${version.minecraftVersion}`);
  if (version.loaderType && version.loaderType !== "vanilla") {
    parts.push(
      version.loaderVersion
        ? `${modpackLoaderLabel(version.loaderType)} ${version.loaderVersion}`
        : modpackLoaderLabel(version.loaderType)
    );
  }
  if (version.loaderVersion && (!version.loaderType || version.loaderType === "vanilla")) {
    parts.push(version.loaderVersion);
  }
  if (version.releaseTime) parts.push(formatDate(version.releaseTime));
  if (version.local) parts.push("local");
  if (version.installed) parts.push("instalada");
  if (version.modpackTitle && version.id && version.modpackTitle !== version.id) {
    parts.push(version.id);
  }
  return parts.join(" - ");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function versionSortSource(version) {
  return String(version.minecraftVersion || version.id || "");
}

function versionLoaderSortSource(version) {
  return String(
    version.rawVersion ||
      version.forgeVersion ||
      version.loaderVersion ||
      version.id ||
      ""
  );
}

function parseNumericVersionParts(value) {
  const match = String(value || "").match(/\d+(?:\.\d+)+|\d+/);
  if (!match) return null;
  return match[0].split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function compareVersionParts(leftParts, rightParts) {
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const left = leftParts[index] ?? 0;
    const right = rightParts[index] ?? 0;
    if (left !== right) return left - right;
  }
  return 0;
}

function compareVersions(left, right) {
  const leftSource = versionSortSource(left);
  const rightSource = versionSortSource(right);
  const leftParts = parseNumericVersionParts(leftSource);
  const rightParts = parseNumericVersionParts(rightSource);

  if (leftParts && rightParts) {
    const numericComparison = compareVersionParts(leftParts, rightParts);
    if (numericComparison !== 0) return -numericComparison;
  } else if (leftParts || rightParts) {
    return leftParts ? 1 : -1;
  }

  const leftLoaderSource = versionLoaderSortSource(left);
  const rightLoaderSource = versionLoaderSortSource(right);
  const leftLoaderParts = parseNumericVersionParts(leftLoaderSource);
  const rightLoaderParts = parseNumericVersionParts(rightLoaderSource);

  if (leftLoaderParts && rightLoaderParts) {
    const loaderComparison = compareVersionParts(leftLoaderParts, rightLoaderParts);
    if (loaderComparison !== 0) return -loaderComparison;
  } else if (leftLoaderParts || rightLoaderParts) {
    return leftLoaderParts ? 1 : -1;
  }

  const releaseTimeComparison =
    new Date(right.releaseTime || right.time || 0) - new Date(left.releaseTime || left.time || 0);
  if (releaseTimeComparison !== 0) return releaseTimeComparison;

  const idComparison = leftSource.localeCompare(rightSource, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (idComparison !== 0) return -idComparison;

  return -String(left.id || "").localeCompare(String(right.id || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function shouldDeduplicateMinecraftVersion(version) {
  const loaderType = String(version?.loaderType || version?.type || "").toLowerCase();
  return loaderType === "optifine" || loaderType === "neoforge" || loaderType === "forge";
}

function deduplicateListedVersions(versions) {
  const deduplicated = [];
  const seen = new Set();

  for (const version of versions) {
    if (!shouldDeduplicateMinecraftVersion(version)) {
      deduplicated.push(version);
      continue;
    }

    const minecraftVersion = String(version?.minecraftVersion || version?.inheritsFrom || "").trim();
    const loaderType = String(version?.loaderType || version?.type || "").toLowerCase();
    const key = `${loaderType}:${minecraftVersion}`;

    if (!minecraftVersion || seen.has(key)) {
      continue;
    }

    seen.add(key);
    deduplicated.push(version);
  }

  return deduplicated;
}

function filteredVersions() {
  const query = elements.versionSearch.value.trim().toLowerCase();
  const filter = elements.versionFilter.value;
  return deduplicateListedVersions(
    state.versions
    .filter((version) => !isDownloadedModpack(version))
    .filter((version) => {
      if (filter === "all") return true;
      if (filter === "installed") return version.installed || version.local;
      return version.type === filter;
    })
    .filter(
      (version) =>
        !query ||
        version.id.toLowerCase().includes(query) ||
        String(version.modpackTitle || "").toLowerCase().includes(query)
    )
    .sort(compareVersions)
      .slice(0, 1200)
      );
}

function renderVersions() {
  const versions = filteredVersions();
  elements.versionList.innerHTML = "";

  if (versions.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhuma versao encontrada";
    elements.versionList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  versions.forEach((version) => {
    const button = document.createElement("button");
    button.className = "version-item";
    if (state.selected && state.selected.id === version.id) {
      button.classList.add("selected");
    }
    button.type = "button";
    button.innerHTML = `
      <span class="version-main">
        <strong>${escapeHtml(versionDisplayName(version))}</strong>
      </span>
    `;
    button.addEventListener("click", () => {
      state.selected = version;
      renderSelected();
      renderVersions();
    });
    fragment.appendChild(button);
  });

  elements.versionList.appendChild(fragment);
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("pt-BR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Number(value) || 0);
}

function renderDownloadedModpacks() {
  const modpacks = downloadedModpacks();
  elements.versionList.innerHTML = "";

  if (!modpacks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Nenhum modpack baixado ainda";
    elements.versionList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  modpacks.forEach((version) => {
    const button = document.createElement("button");
    button.className = "version-item";
    if (state.selected && state.selected.id === version.id) {
      button.classList.add("selected");
    }
    button.type = "button";
    button.innerHTML = `
      <span class="version-main">
        <strong>${escapeHtml(versionDisplayName(version))}</strong>
      </span>
    `;
    button.addEventListener("click", () => {
      state.selected = version;
      renderSelected();
      renderCatalog();
    });
    fragment.appendChild(button);
  });

  elements.versionList.appendChild(fragment);
}

function renderModpacks() {
  if (state.activeModpacksTab === "downloaded") {
    renderDownloadedModpacks();
    return;
  }

  elements.versionList.innerHTML = "";

  if (state.modpacksLoading) {
    const loading = document.createElement("div");
    loading.className = "empty-state";
    loading.textContent = "Buscando modpacks no Modrinth...";
    elements.versionList.appendChild(loading);
    return;
  }

  if (!state.modpacks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.modpackQuery
      ? "Nenhum modpack encontrado"
      : "Pesquise ou atualize para listar modpacks do Modrinth";
    elements.versionList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  state.modpacks.forEach((modpack) => {
    const card = document.createElement("article");
    card.className = "modpack-item";
    if (state.selected && state.selected.projectId === modpack.projectId) {
      card.classList.add("selected");
    }

    const button = document.createElement("button");
    button.className = "secondary";
    button.type = "button";
    button.textContent =
      state.installingModpackId === modpack.projectId ? "Baixando..." : "Baixar";
    button.disabled = state.busy || state.installingModpackId === modpack.projectId;
    button.addEventListener("click", () => startModpackInstall(modpack));

    card.innerHTML = `
      ${
        modpack.iconUrl
          ? `<img class="modpack-icon" src="${escapeHtml(modpack.iconUrl)}" alt="" />`
          : '<div class="modpack-icon-placeholder">M</div>'
      }
      <div class="modpack-copy">
        <strong>${escapeHtml(modpack.title)}</strong>
      </div>
      <div class="modpack-actions"></div>
    `;

    const actions = card.querySelector(".modpack-actions");
    actions.appendChild(button);

    fragment.appendChild(card);
  });

  elements.versionList.appendChild(fragment);
}

function renderCatalog() {
  if (state.activeTab === "modpacks") {
    renderModpacks();
    return;
  }

  renderVersions();
}

function renderSelected() {
  if (!state.selected) {
    elements.selectedVersion.textContent = "-";
    elements.selectedMeta.textContent = "Escolha uma versao";
    syncActionButtons();
    return;
  }

  // Se for um modpack do Modrinth (tem projectId, não tem id de versão)
  if (state.selected.projectId && !state.selected.minecraftVersion) {
    elements.selectedVersion.textContent = escapeHtml(state.selected.title || "Modpack");
    const meta = [
      state.selected.author ? `por ${state.selected.author}` : "",
      `${formatCompactNumber(state.selected.downloads)} downloads`
    ].filter(Boolean).join(" - ");
    elements.selectedMeta.textContent = meta || "Modpack do Modrinth";
  } else {
    elements.selectedVersion.textContent = versionDisplayName(state.selected);
    elements.selectedMeta.textContent = versionDescription(state.selected);
  }
  syncActionButtons();
}

function renderLatest() {
  if (state.activeTab === "modpacks") {
    elements.topbarTitle.textContent = "Modpacks";
    if (state.activeModpacksTab === "downloaded") {
      const total = downloadedModpacks().length;
      elements.latestLine.textContent = total
        ? `${total} modpacks baixados`
        : "Seus modpacks instalados aparecem aqui.";
    } else if (state.modpacksLoading) {
      elements.latestLine.textContent = "Buscando catalogo do Modrinth...";
    } else if (state.modpacks.length) {
      elements.latestLine.textContent = `${state.modpackTotalHits || state.modpacks.length} modpacks encontrados`;
    } else {
      elements.latestLine.textContent = "Pesquise modpacks do Modrinth para baixar.";
    }
    elements.versionFilter.classList.add("hidden");
    elements.modpackSubtabs.classList.remove("hidden");
    elements.modpacksSearchTab.classList.toggle("active", state.activeModpacksTab === "search");
    elements.modpacksDownloadedTab.classList.toggle(
      "active",
      state.activeModpacksTab === "downloaded"
    );
    elements.refreshVersions.classList.add("hidden");
    elements.versionSearch.parentElement.classList.remove("hidden");
    // Show the filter button for all modpack tabs
    if (elements.modpackFilterBtn) {
      elements.modpackFilterBtn.classList.remove("hidden");
    }
    renderModpackFilterUI();
    return;
  }

  elements.topbarTitle.textContent = "Versões";
  elements.latestLine.textContent = "";
  elements.versionFilter.classList.remove("hidden");
  elements.modpackSubtabs.classList.add("hidden");
  elements.versionSearch.parentElement.classList.remove("hidden");
  elements.refreshVersions.classList.remove("hidden");
  elements.refreshVersions.textContent = "Atualizar";
  if (elements.modpackFilterBtn) {
    elements.modpackFilterBtn.classList.add("hidden");
  }
  if (elements.modpackFiltersPanel) {
    state.modpackFiltersOpen = false;
    elements.modpackFiltersPanel.classList.add("hidden");
  }
}

function clearModpackSearchTimer() {
  if (state.modpackSearchTimer) {
    clearTimeout(state.modpackSearchTimer);
    state.modpackSearchTimer = null;
  }
}

function hasActiveModpackFilters() {
  return Boolean(state.modpackFilters.loader || state.modpackFilters.gameVersion);
}

function renderModpackFilterUI() {
  if (!elements.modpackFiltersPanel) return;
  // Sync chip active states
  elements.modpackFiltersPanel.querySelectorAll(".filter-chip[data-filter='loader']").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.value === state.modpackFilters.loader);
  });
  // Sync version select
  if (elements.modpackFilterVersion) {
    elements.modpackFilterVersion.value = state.modpackFilters.gameVersion || "";
  }
  // Sync funnel button active state
  if (elements.modpackFilterBtn) {
    elements.modpackFilterBtn.classList.toggle("active", hasActiveModpackFilters());
  }
}

async function refreshModpacks(query = state.modpackQuery) {
  state.modpacksLoading = true;
  state.modpackQuery = String(query || "").trim();
  renderLatest();
  renderCatalog();

  try {
    const result = await api.searchModpacks(state.modpackQuery, state.modpackFilters);
    state.modpacks = result.hits || [];
    state.modpackTotalHits = result.totalHits || state.modpacks.length;
  } catch (error) {
    appendLog("error", error.message || String(error));
    state.modpacks = [];
    state.modpackTotalHits = 0;
  } finally {
    state.modpacksLoading = false;
    renderLatest();
    renderCatalog();
  }
}

function queueModpackSearch() {
  clearModpackSearchTimer();
  state.modpackSearchTimer = setTimeout(() => {
    refreshModpacks(elements.versionSearch.value);
  }, 320);
}

function setActiveModpacksTab(tab) {
  if (state.activeModpacksTab === tab) return;
  state.activeModpacksTab = tab;
  if (tab === "search" && !state.modpacks.length && !state.modpacksLoading) {
    refreshModpacks(state.modpackQuery);
  }
  renderLatest();
  renderCatalog();
}

function setActiveTab(tab) {
  if (state.activeTab === tab) return;

  state.activeTab = tab;
  if (elements.browseMode) {
    elements.browseMode.value = tab;
  }
  if (elements.navVersions) {
    elements.navVersions.classList.toggle("active", tab === "versions");
  }
  if (elements.navModpacks) {
    elements.navModpacks.classList.toggle("active", tab === "modpacks");
  }

  if (tab === "versions") {
    clearModpackSearchTimer();
    elements.versionSearch.value = "";
  } else {
    elements.versionSearch.value = state.modpackQuery;
    if (state.activeModpacksTab === "search" && !state.modpacks.length && !state.modpacksLoading) {
      refreshModpacks(state.modpackQuery);
    }
  }

  renderLatest();
  renderCatalog();
  renderSelected();
}

async function startModpackInstall(modpack) {
  if (!modpack?.projectId) return;

  // Marcar o modpack como selecionado no painel de seleção
  state.selected = modpack;
  renderSelected();

  state.installingModpackId = modpack.projectId;
  setBusy(true);
  renderCatalog();

  try {
    const versions = await api.getModpackVersions(modpack.projectId);
    if (versions.length <= 1) {
      await installModpackVersion(modpack, versions[0]?.id || null);
      return;
    }

    openModpackVersionModal(modpack, versions);
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    state.installingModpackId = null;
    setBusy(false);
    renderCatalog();
  }
}

async function installModpackVersion(modpack, versionId = null) {
  if (!modpack?.projectId) return;

  state.installingModpackId = modpack.projectId;
  setBusy(true);
  renderCatalog();

  try {
    closeModpackVersionModal();
    const result = await api.installModpack({ ...modpack, versionId });
    const data = await api.refreshVersions();
    state.versions = data.versions;
    state.latest = data.latest;
    state.selected =
      state.versions.find((version) => version.id === result.versionId) || state.selected;
    state.activeModpacksTab = "downloaded";
    setActiveTab("modpacks");
    renderLatest();
    renderSelected();
    renderCatalog();
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    state.installingModpackId = null;
    setBusy(false);
    renderCatalog();
    renderAccount();
  }
}

function cancelProgressReset() {
  if (state.progressResetTimer) {
    clearTimeout(state.progressResetTimer);
    state.progressResetTimer = null;
  }
}

function clearProgress() {
  cancelProgressReset();
  state.progressMode = "idle";
  state.progressValue = 0;
  
  elements.progressBox.classList.add("idle");
  elements.progressLabel.textContent = "";
  elements.progressPercent.textContent = "";
  elements.progressBar.style.width = "0%";

  if (elements.topProgressBox) {
    elements.topProgressBox.classList.add("idle");
    elements.topProgressLabel.textContent = "";
    elements.topProgressPercent.textContent = "";
    elements.topProgressBar.style.width = "0%";
  }
}

function scheduleProgressClear(delay = 0) {
  cancelProgressReset();
  if (delay <= 0) {
    clearProgress();
    return;
  }

  state.progressResetTimer = setTimeout(() => {
    clearProgress();
  }, delay);
}

function setProgress(label, percent, mode = state.progressMode || "download") {
  cancelProgressReset();
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  state.progressMode = mode;
  state.progressValue = safePercent;
  
  if (mode === "install" || mode === "download") {
    if (elements.topProgressBox) {
      elements.topProgressBox.classList.remove("idle");
      elements.topProgressLabel.textContent = label;
      elements.topProgressPercent.textContent = `${safePercent}%`;
      elements.topProgressBar.style.width = `${safePercent}%`;
    }
  } else {
    elements.progressBox.classList.remove("idle");
    elements.progressLabel.textContent = label;
    elements.progressPercent.textContent = `${safePercent}%`;
    elements.progressBar.style.width = `${safePercent}%`;
  }
}

function bumpLaunchProgress(percent, label) {
  if (state.progressMode !== "launch") return;
  const nextPercent = Math.max(state.progressValue, percent);
  setProgress(label, nextPercent, "launch");
}

function progressFromStage(type, percent, mode) {
  if (mode !== "launch") return percent;

  const stages = {
    "client-package": { start: 2, span: 20 },
    "version-jar": { start: 6, span: 16 },
    classes: { start: 18, span: 18 },
    "classes-custom": { start: 18, span: 18 },
    "classes-maven-custom": { start: 18, span: 18 },
    "asset-json": { start: 40, span: 6 },
    assets: { start: 46, span: 28 },
    "assets-copy": { start: 46, span: 28 },
    natives: { start: 78, span: 10 },
    log4j: { start: 88, span: 4 },
  };

  const stage = stages[type];
  if (!stage) return Math.max(state.progressValue, percent);
  return Math.round(stage.start + (Math.max(0, Math.min(100, percent)) / 100) * stage.span);
}

function handleLaunchDebugProgress(message) {
  if (state.progressMode !== "launch") return;

  const text = String(message || "").toLowerCase();
  if (text.includes("java selecionado")) return bumpLaunchProgress(8, "Preparando Java");
  if (text.includes("diretorio de trabalho da instancia")) return bumpLaunchProgress(12, "Preparando instancia");
  if (text.includes("using java version")) return bumpLaunchProgress(16, "Inicializando launcher");
  if (text.includes("attempting to download assets")) return bumpLaunchProgress(46, "Baixando assets");
  if (text.includes("downloaded assets")) return bumpLaunchProgress(76, "Assets prontos");
  if (text.includes("downloaded and extracted natives")) return bumpLaunchProgress(88, "Extraindo natives");
  if (text.includes("set launch options")) return bumpLaunchProgress(92, "Configurando inicializacao");
  if (text.includes("launching with arguments")) return bumpLaunchProgress(96, "Abrindo jogo");
}

function formatBytes(bytes) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond <= 0) return "";
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatETA(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return "";
  if (seconds < 60) return `${Math.ceil(seconds)}s restantes`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s restantes`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m restantes`;
}

function updateDownloadSpeed(downloadedBytes) {
  const now = Date.now();
  const elapsed = now - state.downloadLastSpeedTime;
  if (elapsed >= 500) {
    const bytesDelta = downloadedBytes - state.downloadLastSpeedBytes;
    state.downloadSpeed = Math.max(0, (bytesDelta / elapsed) * 1000);
    state.downloadLastSpeedBytes = downloadedBytes;
    state.downloadLastSpeedTime = now;
  }
}

function computeETA(downloadedBytes, totalBytes) {
  if (!state.downloadSpeed || state.downloadSpeed <= 0 || downloadedBytes >= totalBytes) return 0;
  const remainingBytes = totalBytes - downloadedBytes;
  return remainingBytes / state.downloadSpeed;
}

function setDownloadProgress(modpackName, percent, downloadedBytes, totalBytes, filesDone, filesTotal) {
  cancelProgressReset();
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  state.progressMode = "install";
  state.progressValue = safePercent;
  state.downloadModpackName = modpackName;

  updateDownloadSpeed(downloadedBytes);
  const eta = computeETA(downloadedBytes, totalBytes);

  // Build label with modpack name
  const label = `Baixando: ${modpackName}`;

  // Build detailed info string
  const parts = [];
  if (totalBytes > 0) {
    parts.push(`${formatBytes(downloadedBytes)} / ${formatBytes(totalBytes)}`);
  }
  if (filesTotal > 0) {
    parts.push(`${filesDone}/${filesTotal} arquivos`);
  }
  const speedStr = formatSpeed(state.downloadSpeed);
  if (speedStr) parts.push(speedStr);
  const etaStr = formatETA(eta);
  if (etaStr) parts.push(etaStr);

  const detailText = parts.length ? parts.join(" • ") : "";

  // Update top progress bar (the global one)
  if (elements.topProgressBox) {
    elements.topProgressBox.classList.remove("idle");
    elements.topProgressLabel.textContent = label;
    elements.topProgressPercent.textContent = `${safePercent}%`;
    elements.topProgressBar.style.width = `${safePercent}%`;

    // Update or create detail element
    let detailEl = elements.topProgressBox.querySelector(".progress-detail");
    if (!detailEl) {
      detailEl = document.createElement("span");
      detailEl.className = "progress-detail";
      const header = elements.topProgressBox.querySelector(".progress-header");
      if (header) header.appendChild(detailEl);
    }
    detailEl.textContent = detailText;
  }
}

function handleLauncherEvent(event) {
  if (event.type === "install") {
    setBusy(true);
    // Use modpack name from event message if available, otherwise from state
    const modpackName = state.downloadModpackName || state.selected?.modpackTitle || state.selected?.id || "Minecraft";
    setProgress(`Baixando: ${modpackName}`, 0, "install");
  }

  if (event.type === "install-start") {
    setBusy(true);
    const modpackName = event.modpackName || "Modpack";
    state.downloadModpackName = modpackName;
    state.downloadStartTime = Date.now();
    state.downloadedBytes = 0;
    state.downloadTotalBytes = event.totalBytes || 0;
    state.downloadFilesDone = 0;
    state.downloadFilesTotal = event.filesTotal || 0;
    state.downloadLastSpeedBytes = 0;
    state.downloadLastSpeedTime = Date.now();
    state.downloadSpeed = 0;
    setDownloadProgress(modpackName, 0, 0, state.downloadTotalBytes, 0, state.downloadFilesTotal);
  }

  if (event.type === "install-progress") {
    const modpackName = event.modpackName || state.downloadModpackName || "Modpack";
    const filesDone = event.filesDone || 0;
    const filesTotal = event.filesTotal || state.downloadFilesTotal || 1;
    const downloadedBytes = event.downloadedBytes || 0;
    const totalBytes = event.totalBytes || state.downloadTotalBytes || 0;
    state.downloadedBytes = downloadedBytes;
    state.downloadFilesDone = filesDone;

    // Use file-based progress as fallback if byte totals not available
    let percent;
    if (totalBytes > 0) {
      percent = (downloadedBytes / totalBytes) * 100;
    } else {
      percent = filesTotal > 0 ? (filesDone / filesTotal) * 100 : 0;
    }

    setDownloadProgress(modpackName, percent, downloadedBytes, totalBytes, filesDone, filesTotal);
  }

  if (event.type === "download-status" && event.global) {
    // Real-time per-chunk progress during modpack install
    const g = event.global;
    const modpackName = state.downloadModpackName || "Modpack";
    state.downloadedBytes = g.downloadedBytes || 0;

    let percent;
    if (g.totalBytes > 0) {
      percent = (g.downloadedBytes / g.totalBytes) * 100;
    } else if (g.filesTotal > 0) {
      percent = (g.filesDone / g.filesTotal) * 100;
    } else {
      percent = 0;
    }

    setDownloadProgress(
      modpackName,
      percent,
      g.downloadedBytes || 0,
      g.totalBytes || state.downloadTotalBytes,
      g.filesDone || state.downloadFilesDone,
      g.filesTotal || state.downloadFilesTotal
    );
  }

  if (event.type === "download-status" && !event.global && state.progressMode !== "install") {
    // Non-modpack download (version install, etc.) — use regular progress
    if (event.status) {
      const { current, total, label } = event.status;
      const percent = total ? Math.round((current / total) * 100) : 0;
      setProgress(label || "Baixando", percent, state.progressMode || "download");
    }
  }

  if (event.type === "launch") {
    setBusy(true);
    setProgress("Preparando jogo", 4, "launch");
  }

  if (event.type === "progress" && event.progress) {
    const { task, total, type } = event.progress;
    const percent = total ? Math.round((task / total) * 100) : 0;
    setProgress(type, progressFromStage(type, percent, state.progressMode), state.progressMode);
  }

  if (event.type === "debug") {
    handleLaunchDebugProgress(event.message);
  }

  if (event.type === "success") {
    if (state.progressMode === "launch") {
      setProgress("Jogo iniciado", 100, "launch");
      scheduleProgressClear(1200);
    } else if (state.progressMode === "install") {
      const modpackName = state.downloadModpackName || "Modpack";
      setDownloadProgress(modpackName, 100, state.downloadTotalBytes, state.downloadTotalBytes, state.downloadFilesTotal, state.downloadFilesTotal);
      // Clear download detail element
      setTimeout(() => {
        const detailEl = elements.topProgressBox?.querySelector(".progress-detail");
        if (detailEl) detailEl.textContent = "";
      }, 1500);
      scheduleProgressClear(2000);
    } else {
      scheduleProgressClear(150);
    }
  }

  if (event.type === "game" && state.progressMode === "launch") {
    const text = String(event.message || "");
    if (text.includes("Launching target")) {
      bumpLaunchProgress(98, "Abrindo cliente");
    } else {
      setProgress("Jogo iniciado", 100, "launch");
      scheduleProgressClear(1200);
    }
  }

  if (event.type === "close" || event.type === "error") {
    setBusy(false);
    // Clean up download detail element
    const detailEl = elements.topProgressBox?.querySelector(".progress-detail");
    if (detailEl) detailEl.textContent = "";
    state.downloadModpackName = "";
    state.downloadSpeed = 0;
    scheduleProgressClear();
  }
}

async function refreshState(forceVersions = false) {
  try {
    setBusy(true);
    const previousSelectionId = state.selected?.id || null;
    const data = await api.getState();
    const manifest = forceVersions ? await api.refreshVersions() : data.versions;
    state.account = data.account;
    state.accounts = data.accounts || [];
    if (
      state.skinEditorAccountId &&
      !state.accounts.some((account) => account.accountId === state.skinEditorAccountId)
    ) {
      state.skinEditorAccountId = null;
    }
    state.busy = Boolean(data.busy);
    state.versions = manifest.versions;
    state.latest = manifest.latest;
    applySettings(data.settings);
    elements.minecraftPath.textContent = data.paths.minecraft;
    state.selected = state.versions.find((version) => version.id === previousSelectionId) || null;
    renderAccount();
    renderLatest();
    renderSelected();
    renderCatalog();
    clearProgress();
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    setBusy(Boolean(state.busy));
    renderAccount();
  }
}

async function saveSettingsQuietly() {
  try {
    state.settings = await api.saveSettings(currentSettings());
  } catch (error) {
    appendLog("error", error.message || String(error));
  }
}

async function runAction(action) {
  if (!state.selected) {
    appendLog("error", "Selecione uma versao.");
    return;
  }
  if (!state.account) {
    appendLog("error", "Adicione uma conta Microsoft ou local.");
    return;
  }

  setBusy(true);
  try {
    const payload = {
      version: state.selected,
      settings: currentSettings(),
    };
    if (action === "install") {
      await api.installMinecraft(payload);
      const data = await api.refreshVersions();
      state.versions = data.versions;
      state.latest = data.latest;
      state.selected =
        state.versions.find((version) => version.id === payload.version.id) ||
        state.selected;
      renderLatest();
      renderSelected();
      renderVersions();
      setBusy(false);
    } else {
      await api.launchMinecraft(payload);
    }
  } catch (error) {
    appendLog("error", error.message || String(error));
    setBusy(false);
  }
}

async function uninstallSelectedVersion() {
  if (!state.selected || !canUninstallSelectedVersion()) {
    appendLog("error", "Selecione uma versao instalada para desinstalar.");
    return;
  }

  const selectedVersion = state.selected;
  const selectedName = versionDisplayName(selectedVersion);
  const confirmed = window.confirm(
    `Desinstalar ${selectedName}?${
      selectedVersion.modpackTitle ? " Isso tambem remove os arquivos da instancia." : ""
    }`
  );
  if (!confirmed) return;

  setBusy(true);
  try {
    await api.uninstallVersion({ id: selectedVersion.id });
    const data = await api.refreshVersions();
    state.versions = data.versions;
    state.latest = data.latest;
    state.selected = null;
    renderLatest();
    renderSelected();
    renderCatalog();
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    setBusy(false);
    renderAccount();
  }
}

elements.addAccount.addEventListener("click", async () => {
  setBusy(true);
  try {
    const newAcc = await api.addAccount();
    if (newAcc) state.account = newAcc;
    closeAccountsModal();
    await refreshState();
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    setBusy(false);
  }
});

if (elements.addLocalAccountBtn) {
  elements.addLocalAccountBtn.addEventListener("click", () => {
    closeAccountsModal();
    openLocalAccountModal();
  });
}
elements.closeLocalAccountModal.addEventListener("click", closeLocalAccountModal);
elements.cancelLocalAccount.addEventListener("click", closeLocalAccountModal);
elements.confirmLocalAccount.addEventListener("click", submitLocalAccount);
elements.localAccountUsername.addEventListener("input", updateLocalAccountHint);
elements.localAccountUsername.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    submitLocalAccount();
  }
  if (event.key === "Escape") {
    event.preventDefault();
    closeLocalAccountModal();
  }
});
elements.localAccountModal.addEventListener("click", (event) => {
  if (event.target === elements.localAccountModal) {
    closeLocalAccountModal();
  }
});
elements.closeModpackVersionModal.addEventListener("click", closeModpackVersionModal);
elements.cancelModpackVersion.addEventListener("click", closeModpackVersionModal);
elements.modpackVersionModal.addEventListener("click", (event) => {
  if (event.target === elements.modpackVersionModal && !state.busy) {
    closeModpackVersionModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (!elements.modpackVersionModal.classList.contains("hidden") && !state.busy) {
    closeModpackVersionModal();
    return;
  }

  if (!elements.localAccountModal.classList.contains("hidden")) {
    closeLocalAccountModal();
    return;
  }

  if (!elements.accountsModal.classList.contains("hidden")) {
    closeAccountsModal();
  }
});

if (elements.accountsList) {
  elements.accountsList.addEventListener("click", async (event) => {
    const removeButton = event.target.closest(".btn-remove-account");
    if (removeButton) {
      const accountId = removeButton.getAttribute("data-id");
      await api.removeAccount({ accountId });
      await refreshState();
      return;
    }

    const skinButton = event.target.closest(".account-skin-trigger");
    if (skinButton) {
      event.preventDefault();
      openSkinEditor(skinButton.getAttribute("data-id"));
      return;
    }

    const accountItem = event.target.closest(".account-item");
    if (!accountItem || state.busy || state.skinApplyBusy) return;
    await api.setActiveAccount(accountItem.getAttribute("data-id"));
    await refreshState();
  });
}

if (elements.accountSkinUploadBtn) {
  elements.accountSkinUploadBtn.addEventListener("click", () => {
    if (state.busy || state.skinApplyBusy || !elements.accountSkinFile) return;
    elements.accountSkinFile.click();
  });
}

if (elements.accountSkinFile) {
  elements.accountSkinFile.addEventListener("change", async () => {
    const [file] = elements.accountSkinFile.files || [];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      await applySkinToSelectedAccount({
        source: "upload",
        dataUrl,
        variant: elements.accountSkinVariant?.value || "classic",
        label: file.name || "Arquivo local",
      });
    } finally {
      elements.accountSkinFile.value = "";
    }
  });
}

if (elements.reloadCraftySkins) {
  elements.reloadCraftySkins.addEventListener("click", () => {
    clearCraftySkinSearchTimer();
    loadCraftySkins(true);
  });
}

if (elements.craftySkinSearch) {
  elements.craftySkinSearch.addEventListener("input", (event) => {
    state.skinCatalogQuery = event.target.value || "";
    state.skinCatalogPage = 1;
    state.skinCatalogError = "";
    clearCraftySkinHoverTimer();
    hideCraftySkinHoverPopup();
    queueCraftySkinSearch();
  });
}

if (elements.craftySkinsList) {
  elements.craftySkinsList.addEventListener("mouseover", (event) => {
    const card = event.target.closest(".crafty-skin-card");
    if (!card || !elements.craftySkinsList.contains(card)) return;
    if (event.relatedTarget && card.contains(event.relatedTarget)) return;

    const index = Number(card.getAttribute("data-index"));
    if (Number.isNaN(index)) return;
    scheduleCraftySkinHoverPopup(index, card);
  });

  elements.craftySkinsList.addEventListener("mouseout", (event) => {
    const card = event.target.closest(".crafty-skin-card");
    if (!card || !elements.craftySkinsList.contains(card)) return;
    if (event.relatedTarget && card.contains(event.relatedTarget)) return;

    clearCraftySkinHoverTimer();
    hideCraftySkinHoverPopup();
  });

  elements.craftySkinsList.addEventListener("scroll", () => {
    clearCraftySkinHoverTimer();
    hideCraftySkinHoverPopup();
  });

  elements.craftySkinsList.addEventListener("click", async (event) => {
    const card = event.target.closest(".crafty-skin-card");
    if (!card || state.busy || state.skinApplyBusy) return;

    clearCraftySkinHoverTimer();
    hideCraftySkinHoverPopup();
    const index = Number(card.getAttribute("data-index"));
    const skin = state.skinCatalog[index];
    if (!skin) return;

    await applySkinToSelectedAccount({
      source: "crafty",
      textureBase64: skin.textureBase64,
      hash: skin.hash,
      skinId: skin.id,
      variant: skin.variant,
      label: skin.label,
    });
  });
}

if (elements.craftySkinsPagination) {
  elements.craftySkinsPagination.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-page]");
    if (pageButton) {
      state.skinCatalogPage = Number(pageButton.getAttribute("data-page"));
      clearCraftySkinHoverTimer();
      hideCraftySkinHoverPopup();
      renderAccountSkinPanel();
      return;
    }

    const navButton = event.target.closest("[data-page-nav]");
    if (!navButton) return;

    const direction = navButton.getAttribute("data-page-nav");
    const totalPages = totalCraftySkinPages();
    if (direction === "prev") {
      state.skinCatalogPage = Math.max(1, state.skinCatalogPage - 1);
    } else {
      state.skinCatalogPage = Math.min(totalPages, state.skinCatalogPage + 1);
    }

    clearCraftySkinHoverTimer();
    hideCraftySkinHoverPopup();
    renderAccountSkinPanel();
  });
}

window.addEventListener("resize", () => {
  if (activeSkinPreviewIndex === null) return;
  const activeCard = elements.craftySkinsList?.querySelector(
    `.crafty-skin-card[data-index="${activeSkinPreviewIndex}"]`
  );
  if (!activeCard) {
    hideCraftySkinHoverPopup();
    return;
  }
  positionCraftySkinHoverPopup(activeCard);
});

window.addEventListener("beforeunload", () => {
  clearCraftySkinHoverTimer();
  if (skinViewer) {
    skinViewer.dispose();
    skinViewer = null;
  }
});


elements.refreshVersions.addEventListener("click", async () => {
  if (state.activeTab === "modpacks") {
    if (state.activeModpacksTab === "search") {
      refreshModpacks(elements.versionSearch.value);
      return;
    }

    try {
      setBusy(true);
      const data = await api.refreshVersions();
      state.versions = data.versions;
      state.latest = data.latest;
      renderLatest();
      renderCatalog();
    } catch (error) {
      appendLog("error", error.message || String(error));
    } finally {
      setBusy(false);
      renderAccount();
    }
    return;
  }

  try {
    setBusy(true);
    const data = await api.refreshVersions();
    state.versions = data.versions;
    state.latest = data.latest;
    renderLatest();
    renderCatalog();
    appendLog("success", "Manifesto atualizado.");
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    setBusy(false);
    renderAccount();
  }
});

elements.versionFilter.addEventListener("change", () => {
  saveSettingsQuietly();
  renderCatalog();
});

elements.versionSearch.addEventListener("input", () => {
  if (state.activeTab === "modpacks" && state.activeModpacksTab === "search") {
    state.modpackQuery = elements.versionSearch.value.trim();
    queueModpackSearch();
    return;
  }

  renderCatalog();
});
elements.modpacksSearchTab.addEventListener("click", () => setActiveModpacksTab("search"));
elements.modpacksDownloadedTab.addEventListener("click", () => setActiveModpacksTab("downloaded"));
elements.installVersion.addEventListener("click", () => runAction("install"));
elements.uninstallVersion.addEventListener("click", uninstallSelectedVersion);
elements.launchVersion.addEventListener("click", () => runAction("launch"));
elements.clearSelection.addEventListener("click", clearSelectedVersion);
elements.openFolder.addEventListener("click", () => api.openMinecraftFolder());

elements.accountView.addEventListener("click", () => {
  if (elements.accountDropdown) {
    const isHidden = elements.accountDropdown.classList.contains("hidden");
    elements.accountDropdown.classList.toggle("hidden");
    if (elements.accountChevron) {
      elements.accountChevron.style.transform = isHidden ? "rotate(180deg)" : "rotate(0deg)";
    }
  }
});

if (elements.manageAccountsBtn) {
  elements.manageAccountsBtn.addEventListener("click", () => {
    elements.accountDropdown.classList.add("hidden");
    if (elements.accountChevron) elements.accountChevron.style.transform = "rotate(0deg)";
    state.skinEditorAccountId = null;
    elements.accountsModal.classList.remove("hidden");
    elements.accountsModal.setAttribute("aria-hidden", "false");
    renderAccountsModal();
  });
}

if (elements.closeAccountsModal) {
  elements.closeAccountsModal.addEventListener("click", closeAccountsModal);
}
if (elements.cancelAccountsModal) {
  elements.cancelAccountsModal.addEventListener("click", closeAccountsModal);
}
if (elements.closeAccountSkinPanel) {
  elements.closeAccountSkinPanel.addEventListener("click", () => {
    state.skinEditorAccountId = null;
    renderAccountsModal();
  });
}
if (elements.accountsModal) {
  elements.accountsModal.addEventListener("click", (event) => {
    if (event.target === elements.accountsModal) {
      closeAccountsModal();
    }
  });
}
if (elements.btnShowLog) {
  elements.btnShowLog.addEventListener("click", () => {
    if (api.openLogWindow) api.openLogWindow();
  });
}

if (elements.logSize) elements.logSize.addEventListener("change", saveSettingsQuietly);
if (elements.java8Path) elements.java8Path.addEventListener("change", saveSettingsQuietly);

[
  elements.minMemory,
  elements.maxMemory,
  elements.windowWidth,
  elements.windowHeight,
].forEach((input) => {
  if (input) input.addEventListener("change", saveSettingsQuietly);
});

if (elements.navVersions) {
  elements.navVersions.addEventListener("click", () => setActiveTab("versions"));
}
if (elements.navModpacks) {
  elements.navModpacks.addEventListener("click", () => setActiveTab("modpacks"));
}
if (elements.browseMode) {
  elements.browseMode.addEventListener("change", () => {
    setActiveTab(elements.browseMode.value === "modpacks" ? "modpacks" : "versions");
  });
}

if (elements.winMin) elements.winMin.addEventListener("click", () => api.minimize());
if (elements.winMax) elements.winMax.addEventListener("click", () => api.maximize());
if (elements.winClose) elements.winClose.addEventListener("click", () => api.close());

// --- Modpack filter panel ---
if (elements.modpackFilterBtn) {
  elements.modpackFilterBtn.addEventListener("click", () => {
    state.modpackFiltersOpen = !state.modpackFiltersOpen;
    if (elements.modpackFiltersPanel) {
      elements.modpackFiltersPanel.classList.toggle("hidden", !state.modpackFiltersOpen);
    }
    elements.modpackFilterBtn.classList.toggle("active",
      state.modpackFiltersOpen || hasActiveModpackFilters()
    );
  });
}

if (elements.modpackFiltersPanel) {
  // Loader chip clicks
  elements.modpackFiltersPanel.querySelectorAll(".filter-chip[data-filter='loader']").forEach((chip) => {
    chip.addEventListener("click", () => {
      const value = chip.dataset.value;
      // Toggle: click same chip again to deselect
      state.modpackFilters.loader = state.modpackFilters.loader === value ? "" : value;
      renderModpackFilterUI();
      refreshModpacks(elements.versionSearch.value);
    });
  });
}

// Game version select
if (elements.modpackFilterVersion) {
  elements.modpackFilterVersion.addEventListener("change", () => {
    state.modpackFilters.gameVersion = elements.modpackFilterVersion.value;
    renderModpackFilterUI();
    refreshModpacks(elements.versionSearch.value);
  });
}

// Close filter dropdown when clicking outside
document.addEventListener("click", (e) => {
  if (!elements.modpackFiltersPanel || !elements.modpackFilterBtn) return;
  if (state.modpackFiltersOpen &&
      !elements.modpackFiltersPanel.contains(e.target) &&
      !elements.modpackFilterBtn.contains(e.target)) {
    state.modpackFiltersOpen = false;
    elements.modpackFiltersPanel.classList.add("hidden");
    if (elements.modpackFilterBtn) {
      elements.modpackFilterBtn.classList.toggle("active", hasActiveModpackFilters());
    }
  }
});

api.onEvent(handleLauncherEvent);
refreshState();
