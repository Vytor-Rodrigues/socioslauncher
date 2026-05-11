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
  activeCatalogKind: "modpacks",
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
  modsCatalog: [],
  modsCatalogLoading: false,
  modsCatalogTotalHits: 0,
  installingModId: null,
  pendingModProject: null,
  pendingModVersions: [],
  pendingModTargetVersionId: "",
  launchModsEntries: [],
  launchModsRootPath: "",
  launchModsUsingFallbackRoot: false,
  launchModsLoading: false,
  launchModsLoadedVersionId: null,
  launchModsTruncated: false,
  modsEntries: [],
  modsRootPath: "",
  modsUsingFallbackRoot: false,
  modsTruncated: false,
  modsLoading: false,
  modsSaving: false,
  modsLoadedVersionId: null,
  modsSelectedPath: "",
  modsSelectedEditable: false,
  modsSelectedSize: 0,
  modsSelectedModifiedAt: "",
  modsFileContent: "",
  modsOriginalContent: "",
  modsStatusMessage: "",
  modsListRequestId: 0,
  modsFileRequestId: 0,
  modpackEditorOpen: false,
  addModModalOpen: false,
  addModQuery: "",
  addModResults: [],
  addModLoading: false,
  addModTotalHits: 0,
  addModSearchTimer: null,
  createModpackModalOpen: false,
  createModpackLoading: false,
  createModpackName: "",
  createModpackTags: "",
  createModpackMinecraftVersion: "",
  createModpackLoader: "",
  createModpackError: "",
  createModpackStep: 1,
  createModpackModsLoading: false,
  createModpackModsQuery: "",
  createModpackModsResults: [],
  createModpackSelectedMods: [],
  createModpackModsSearchTimer: null,
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
  catalogModsTab: document.querySelector("#catalog-mods-tab"),
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
  createModpackButton: document.querySelector("#create-modpack-button"),
  winMin: document.querySelector("#win-min"),
  winMax: document.querySelector("#win-max"),
  winClose: document.querySelector("#win-close"),
  btnShowLog: document.querySelector("#btn-show-log"),
  modsEditorPanel: document.querySelector("#mods-editor-panel"),
  openModpackEditor: document.querySelector("#open-modpack-editor"),
  modpackEditorModal: document.querySelector("#modpack-editor-modal"),
  closeModpackEditor: document.querySelector("#close-modpack-editor"),
  launchModsPanel: document.querySelector("#launch-mods-panel"),
  launchModsRootLabel: document.querySelector("#launch-mods-root-label"),
  launchModsRefresh: document.querySelector("#launch-mods-refresh"),
  launchModsList: document.querySelector("#launch-mods-list"),
  modsRootLabel: document.querySelector("#mods-root-label"),
  modsRefresh: document.querySelector("#mods-refresh"),
  modsSave: document.querySelector("#mods-save"),
  openAddModModal: document.querySelector("#open-add-mod-modal"),
  modsFileList: document.querySelector("#mods-file-list"),
  modsSelectedFile: document.querySelector("#mods-selected-file"),
  modsFileStatus: document.querySelector("#mods-file-status"),
  modsFileContent: document.querySelector("#mods-file-content"),
  addModModal: document.querySelector("#add-mod-modal"),
  closeAddModModal: document.querySelector("#close-add-mod-modal"),
  cancelAddModModal: document.querySelector("#cancel-add-mod-modal"),
  addModSearch: document.querySelector("#add-mod-search"),
  addModResults: document.querySelector("#add-mod-results"),
  createModpackModal: document.querySelector("#create-modpack-modal"),
  closeCreateModpackModal: document.querySelector("#close-create-modpack-modal"),
  cancelCreateModpack: document.querySelector("#cancel-create-modpack"),
  backCreateModpackStep: document.querySelector("#back-create-modpack-step"),
  confirmCreateModpack: document.querySelector("#confirm-create-modpack"),
  createModpackSubtitle: document.querySelector("#create-modpack-subtitle"),
  createModpackStepSetup: document.querySelector("#create-modpack-step-setup"),
  createModpackStepMods: document.querySelector("#create-modpack-step-mods"),
  createModpackName: document.querySelector("#create-modpack-name"),
  createModpackTags: document.querySelector("#create-modpack-tags"),
  createModpackVersion: document.querySelector("#create-modpack-version"),
  createModpackLoader: document.querySelector("#create-modpack-loader"),
  createModpackSummaryTitle: document.querySelector("#create-modpack-summary-title"),
  createModpackSummaryMeta: document.querySelector("#create-modpack-summary-meta"),
  createModpackModSearch: document.querySelector("#create-modpack-mod-search"),
  createModpackSelectedCount: document.querySelector("#create-modpack-selected-count"),
  clearCreateModpackMods: document.querySelector("#clear-create-modpack-mods"),
  createModpackSelectedList: document.querySelector("#create-modpack-selected-list"),
  createModpackModResults: document.querySelector("#create-modpack-mod-results"),
  createModpackError: document.querySelector("#create-modpack-error"),
  modpackTargetVersionRow: document.querySelector("#modpack-target-version-row"),
  modpackTargetVersion: document.querySelector("#modpack-target-version"),
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

  if (elements.confirmCreateModpack) {
    elements.confirmCreateModpack.disabled = value || state.createModpackLoading;
  }

  if (elements.closeCreateModpackModal) {
    elements.closeCreateModpackModal.disabled = value || state.createModpackLoading;
  }

  if (elements.cancelCreateModpack) {
    elements.cancelCreateModpack.disabled = value || state.createModpackLoading;
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
  syncModsEditorForSelection();
  syncLaunchModsForSelection();
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
  state.pendingModProject = null;
  state.pendingModTargetVersionId = "";
  state.modpackVersions = [];
  state.pendingModVersions = [];
  elements.modpackVersionModal.classList.add("hidden");
  elements.modpackVersionModal.setAttribute("aria-hidden", "true");
  elements.modpackVersionList.innerHTML = "";
  if (elements.modpackTargetVersionRow) {
    elements.modpackTargetVersionRow.classList.add("hidden");
  }
  if (elements.modpackTargetVersion) {
    elements.modpackTargetVersion.innerHTML = "";
  }
}

function openModpackVersionModal(modpack, versions) {
  state.pendingModpack = modpack;
  state.pendingModProject = null;
  state.modpackVersions = Array.isArray(versions) ? versions : [];
  elements.modpackVersionTitle.textContent = `Escolher versao de ${modpack.title}`;
  elements.modpackVersionSubtitle.textContent = "Selecione qual versao voce quer baixar.";
  if (elements.modpackTargetVersionRow) {
    elements.modpackTargetVersionRow.classList.add("hidden");
  }
  elements.modpackVersionModal.classList.remove("hidden");
  elements.modpackVersionModal.setAttribute("aria-hidden", "false");
  renderModpackVersionOptions();
  requestAnimationFrame(() => {
    const firstButton = elements.modpackVersionList.querySelector("button");
    if (firstButton) firstButton.focus();
  });
}

function installedVersionsForMods() {
  return state.versions
    .filter((version) => version?.installed || version?.local)
    .filter((version) => !version?.projectId)
    .sort(compareVersions);
}

function openModVersionModal(modProject, versions, options = {}) {
  state.pendingModProject = modProject;
  state.pendingModpack = null;
  state.pendingModTargetVersionId = String(options.targetVersionId || "").trim();
  state.pendingModVersions = Array.isArray(versions) ? versions : [];
  elements.modpackVersionTitle.textContent = `Escolher versao de ${modProject.title}`;
  elements.modpackVersionSubtitle.textContent = state.pendingModTargetVersionId
    ? "Selecione a versao do mod para adicionar ao modpack atual."
    : "Selecione a versao do mod e em qual instalacao ele sera colocado.";

  if (elements.modpackTargetVersionRow && elements.modpackTargetVersion) {
    const options = installedVersionsForMods();
    elements.modpackTargetVersion.innerHTML = "";

    options.forEach((version) => {
      const option = document.createElement("option");
      option.value = version.id;
      option.textContent = versionDisplayName(version);
      elements.modpackTargetVersion.appendChild(option);
    });

    if (state.pendingModTargetVersionId) {
      elements.modpackTargetVersion.value = state.pendingModTargetVersionId;
      elements.modpackTargetVersionRow.classList.add("hidden");
    } else {
      elements.modpackTargetVersionRow.classList.toggle("hidden", !options.length);
    }
  }

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
  const isModSelection = Boolean(state.pendingModProject);
  const versions = isModSelection ? state.pendingModVersions : state.modpackVersions;

  versions.forEach((version) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "modpack-version-item";
    button.disabled = state.busy;
    button.innerHTML = `
      <span class="modpack-version-copy">
        <strong>${escapeHtml(version.name || version.versionNumber || version.id)}</strong>
        <small>${escapeHtml(
          isModSelection
            ? [
                Array.isArray(version.minecraftVersions) ? version.minecraftVersions.join(", ") : "",
                Array.isArray(version.loaders) ? version.loaders.join(", ") : "",
              ]
                .filter(Boolean)
                .join(" • ")
            : [version.minecraftVersion, modpackLoaderLabel(version.loaderType)].filter(Boolean).join(" • ")
        )}</small>
      </span>
    `;
    button.addEventListener("click", () => {
      if (isModSelection) {
        installSelectedModVersion(version.id);
        return;
      }
      installModpackVersion(state.pendingModpack, version.id);
    });
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

  if (isDownloadedModpack(version) && version?.modpackTitle) {
    return String(version.modpackTitle).trim() || version?.id || "-";
  }

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
  if (!version || !(version.installed || version.local)) return false;

  return Boolean(
    version.type === "modpack" ||
      (version.modpackProjectId && version.modpackTitle && version.modpackVersionNumber)
  );
}

function downloadedModpacks() {
  const query = elements.versionSearch ? elements.versionSearch.value.trim().toLowerCase() : "";
  return state.versions
    .filter((version) => isDownloadedModpack(version) && (version.installed || version.local))
  .filter((version) => 
    !query || 
    version.id.toLowerCase().includes(query) || 
    String(version.modpackTitle || "").toLowerCase().includes(query) ||
    (Array.isArray(version.modpackTags) && version.modpackTags.some((tag) => String(tag || "").toLowerCase().includes(query)))
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
  if (Array.isArray(version.modpackTags) && version.modpackTags.length) {
    parts.push(`tags ${version.modpackTags.join(", ")}`);
  }
  return parts.join(" - ");
}

function versionCompactDetails(version) {
  const minecraftVersion = String(version?.minecraftVersion || version?.inheritsFrom || "").trim();
  const loaderType = String(version?.loaderType || version?.type || "").trim().toLowerCase();
  const parts = [];

  if (minecraftVersion) {
    parts.push(`MC ${minecraftVersion}`);
  }

  if (["fabric", "forge", "neoforge", "optifine", "forgeoptifine"].includes(loaderType)) {
    parts.push(loaderDisplayName(loaderType));
  }

  return parts.join(" • ");
}

function modpackCategoryLabel(tag) {
  const normalized = String(tag || "").trim().toLowerCase();
  const labels = {
    action: "Ação",
    combat: "Combate",
    adventure: "Aventura",
    fantasy: "Fantasia",
    magic: "Magia",
    rpg: "RPG",
    tech: "Tech",
    technology: "Tecnologia",
    exploration: "Exploração",
    quests: "Quests",
    questing: "Quests",
    optimization: "Otimização",
    vanilla: "Vanilla",
    "vanilla-like": "Vanilla+",
    "vanilla+": "Vanilla+",
    hardcore: "Hardcore",
    multiplayer: "Multiplayer",
    economy: "Economia",
    decoration: "Decoração",
    building: "Construção",
    automation: "Automação",
    scifi: "Sci-Fi",
    "sci-fi": "Sci-Fi",
    horror: "Terror",
    "kitchen-sink": "Kitchen Sink",
    minigames: "Minigames",
    survival: "Sobrevivência",
    skyblock: "Skyblock",
    pvp: "PvP",
  };

  if (labels[normalized]) return labels[normalized];
  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function modpackGenreTags(categories, limit = 5) {
  const ignored = new Set(["fabric", "forge", "neoforge", "quilt", "mrpack"]);
  const normalized = Array.isArray(categories)
    ? [...new Set(categories.map((tag) => String(tag || "").trim().toLowerCase()).filter(Boolean))]
    : [];

  return normalized
    .filter((tag) => !ignored.has(tag))
    .slice(0, limit)
    .map(modpackCategoryLabel);
}

function renderTagRow(tags, className = "tag-row") {
  const normalizedTags = Array.isArray(tags)
    ? [...new Set(tags.map((tag) => String(tag || "").trim()).filter(Boolean))]
    : [];

  if (!normalizedTags.length) return "";

  return `
    <span class="${className}">
      ${normalizedTags.map((tag) => `<span class="tag custom">${escapeHtml(tag)}</span>`).join("")}
    </span>
  `;
}

function parseCreateModpackTags(value) {
  return [...new Set(
    String(value || "")
      .split(/[,;]+/)
      .map((tag) => tag.trim())
      .filter(Boolean)
  )];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function modsEditorVisible() {
  return (
    Boolean(state.selected?.id) &&
    (
      (
        state.activeTab === "modpacks" &&
        state.activeModpacksTab === "downloaded" &&
        isDownloadedModpack(state.selected)
      ) ||
      (
        state.activeTab === "versions" &&
        Boolean(state.selected?.installed || state.selected?.local)
      )
    ) &&
    Boolean(state.selected?.id)
  );
}

function selectedModpackToggleableEntry() {
  return state.modsEntries.find((entry) => entry.relativePath === state.modsSelectedPath) || null;
}

function isToggleableModpackEntry(entry) {
  if (!entry) return false;
  return /\.jar(?:\.desactived)?$/i.test(String(entry.name || entry.relativePath || ""));
}

function isActiveModpackEntry(entry) {
  if (!isToggleableModpackEntry(entry)) return false;
  return !String(entry.name || entry.relativePath || "").toLowerCase().endsWith(".desactived");
}

function closeAddModSearchTimer() {
  if (state.addModSearchTimer) {
    clearTimeout(state.addModSearchTimer);
    state.addModSearchTimer = null;
  }
}

function availableCreateModpackVersions() {
  const versions = new Set();

  state.versions.forEach((version) => {
    const versionId = String(version?.id || "").trim();
    if (!versionId) return;
    if (version?.type !== "release" || !version?.url) return;

    const hasSupportedLoader = ["neoforge", "fabric", "forge"].some((loaderType) =>
      state.versions.some(
        (candidate) =>
          Boolean(candidate?.remoteLoader) &&
          String(candidate?.minecraftVersion || "").trim() === versionId &&
          String(candidate?.loaderType || "").trim().toLowerCase() === loaderType
      )
    );

    if (hasSupportedLoader) {
      versions.add(versionId);
    }
  });

  return Array.from(versions).sort((left, right) => {
    const leftParts = parseNumericVersionParts(left);
    const rightParts = parseNumericVersionParts(right);

    if (leftParts && rightParts) {
      return -compareVersionParts(leftParts, rightParts);
    }
    if (leftParts || rightParts) {
      return leftParts ? -1 : 1;
    }

    return String(right).localeCompare(String(left), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function availableCreateModpackLoaders(minecraftVersion = state.createModpackMinecraftVersion) {
  const normalizedVersion = String(minecraftVersion || "").trim();
  const loaders = new Set();

  state.versions.forEach((version) => {
    if (String(version?.minecraftVersion || "").trim() !== normalizedVersion) return;
    const loaderType = String(version?.loaderType || "").trim().toLowerCase();
    if (Boolean(version?.remoteLoader) && ["neoforge", "fabric", "forge"].includes(loaderType)) {
      loaders.add(loaderType);
    }
  });

  return ["neoforge", "fabric", "forge"].filter((loaderType) => loaders.has(loaderType));
}

function createModpackSelectionFilters() {
  return {
    gameVersion: String(state.createModpackMinecraftVersion || "").trim(),
    loader: String(state.createModpackLoader || "").trim().toLowerCase(),
  };
}

function closeCreateModpackModsSearchTimer() {
  if (state.createModpackModsSearchTimer) {
    clearTimeout(state.createModpackModsSearchTimer);
    state.createModpackModsSearchTimer = null;
  }
}

function isCreateModSelected(projectId) {
  return state.createModpackSelectedMods.some((mod) => mod.projectId === projectId);
}

function toggleCreateModSelection(mod) {
  if (!mod?.projectId) return;

  if (isCreateModSelected(mod.projectId)) {
    state.createModpackSelectedMods = state.createModpackSelectedMods.filter(
      (entry) => entry.projectId !== mod.projectId
    );
  } else {
    state.createModpackSelectedMods = [
      ...state.createModpackSelectedMods,
      {
        projectId: mod.projectId,
        title: mod.title || mod.projectId,
        description: mod.description || "",
        iconUrl: mod.iconUrl || "",
      },
    ];
  }

  renderCreateModpackModal();
}

function removeCreateModSelection(projectId) {
  if (!projectId) return;
  state.createModpackSelectedMods = state.createModpackSelectedMods.filter((entry) => entry.projectId !== projectId);
  renderCreateModpackModal();
}

async function searchModsForCreateModpack(query = state.createModpackModsQuery) {
  if (!state.createModpackModalOpen || state.createModpackStep !== 2) return;

  state.createModpackModsLoading = true;
  state.createModpackModsQuery = String(query || "").trim();
  renderCreateModpackModal();

  try {
    const result = await api.searchMods(state.createModpackModsQuery, createModpackSelectionFilters());
    state.createModpackModsResults = result.hits || [];
  } catch (error) {
    state.createModpackModsResults = [];
    state.createModpackError = error.message || String(error);
    appendLog("error", state.createModpackError);
  } finally {
    state.createModpackModsLoading = false;
    renderCreateModpackModal();
  }
}

function queueCreateModpackModsSearch() {
  closeCreateModpackModsSearchTimer();
  state.createModpackModsSearchTimer = setTimeout(() => {
    searchModsForCreateModpack(state.createModpackModsQuery);
  }, 320);
}

async function goToCreateModpackModsStep() {
  if (!state.createModpackName.trim() || !state.createModpackMinecraftVersion || !state.createModpackLoader) {
    state.createModpackError = "Preencha o nome, a versao e o loader do modpack.";
    renderCreateModpackModal();
    return;
  }

  state.createModpackStep = 2;
  state.createModpackError = "";
  state.createModpackModsResults = [];
  renderCreateModpackModal();
  await searchModsForCreateModpack("");
}

function ensureCreateModpackSelections() {
  const versions = availableCreateModpackVersions();
  if (!versions.length) {
    state.createModpackMinecraftVersion = "";
    state.createModpackLoader = "";
    return;
  }

  if (!versions.includes(state.createModpackMinecraftVersion)) {
    state.createModpackMinecraftVersion = versions[0];
  }

  const loaders = availableCreateModpackLoaders(state.createModpackMinecraftVersion);
  if (!loaders.includes(state.createModpackLoader)) {
    state.createModpackLoader = loaders[0] || "";
  }
}

function resetCreateModpackModalState() {
  state.createModpackModalOpen = false;
  state.createModpackLoading = false;
  state.createModpackName = "";
  state.createModpackTags = "";
  state.createModpackMinecraftVersion = "";
  state.createModpackLoader = "";
  state.createModpackError = "";
  state.createModpackStep = 1;
  state.createModpackModsLoading = false;
  state.createModpackModsQuery = "";
  state.createModpackModsResults = [];
  state.createModpackSelectedMods = [];
  closeCreateModpackModsSearchTimer();
}

function renderCreateModpackModal() {
  if (!elements.createModpackModal) return;

  ensureCreateModpackSelections();

  const visible = state.createModpackModalOpen;
  elements.createModpackModal.classList.toggle("hidden", !visible);
  elements.createModpackModal.setAttribute("aria-hidden", visible ? "false" : "true");

  if (!visible) return;

  const versions = availableCreateModpackVersions();
  const loaders = availableCreateModpackLoaders();
  const stepTwoVisible = state.createModpackStep === 2;

  if (elements.createModpackStepSetup) {
    elements.createModpackStepSetup.classList.toggle("hidden", stepTwoVisible);
  }
  if (elements.createModpackStepMods) {
    elements.createModpackStepMods.classList.toggle("hidden", !stepTwoVisible);
  }

  if (
    elements.createModpackName &&
    document.activeElement !== elements.createModpackName &&
    elements.createModpackName.value !== state.createModpackName
  ) {
    elements.createModpackName.value = state.createModpackName;
  }

  if (
    elements.createModpackTags &&
    document.activeElement !== elements.createModpackTags &&
    elements.createModpackTags.value !== state.createModpackTags
  ) {
    elements.createModpackTags.value = state.createModpackTags;
  }

  if (elements.createModpackVersion) {
    elements.createModpackVersion.innerHTML = versions.length
      ? versions
          .map((version) => `<option value="${escapeHtml(version)}">${escapeHtml(version)}</option>`)
          .join("")
      : '<option value="">Nenhuma versao disponivel</option>';
    elements.createModpackVersion.value = state.createModpackMinecraftVersion || versions[0] || "";
    elements.createModpackVersion.disabled = state.createModpackLoading || !versions.length;
  }

  if (elements.createModpackLoader) {
    elements.createModpackLoader.innerHTML = loaders.length
      ? loaders
          .map(
            (loaderType) =>
              `<option value="${escapeHtml(loaderType)}">${escapeHtml(loaderDisplayName(loaderType))}</option>`
          )
          .join("")
      : '<option value="">Nenhum loader disponivel</option>';
    elements.createModpackLoader.value = state.createModpackLoader || loaders[0] || "";
    elements.createModpackLoader.disabled = state.createModpackLoading || !loaders.length;
  }

  if (elements.createModpackSubtitle) {
    elements.createModpackSubtitle.textContent = stepTwoVisible
      ? "Selecione os mods compativeis que serao baixados automaticamente apos criar a versao."
      : "Escolha o nome, a versao do Minecraft e o loader antes de selecionar os mods.";
  }

  if (elements.backCreateModpackStep) {
    elements.backCreateModpackStep.classList.toggle("hidden", !stepTwoVisible);
    elements.backCreateModpackStep.disabled = state.createModpackLoading || state.createModpackModsLoading;
  }

  if (elements.createModpackSummaryTitle) {
    elements.createModpackSummaryTitle.textContent = state.createModpackName.trim() || "Novo modpack";
  }

  if (elements.createModpackSummaryMeta) {
    elements.createModpackSummaryMeta.textContent = [
      state.createModpackMinecraftVersion || "Sem versao",
      state.createModpackLoader ? loaderDisplayName(state.createModpackLoader) : "Sem loader",
      parseCreateModpackTags(state.createModpackTags).length
        ? `Tags: ${parseCreateModpackTags(state.createModpackTags).join(", ")}`
        : "",
    ].join(" • ");
  }

  if (elements.createModpackModSearch && elements.createModpackModSearch.value !== state.createModpackModsQuery) {
    elements.createModpackModSearch.value = state.createModpackModsQuery;
  }

  if (elements.createModpackSelectedCount) {
    const total = state.createModpackSelectedMods.length;
    elements.createModpackSelectedCount.textContent = `${total} mod${total === 1 ? "" : "s"} selecionado${total === 1 ? "" : "s"}`;
  }

  if (elements.clearCreateModpackMods) {
    elements.clearCreateModpackMods.disabled =
      state.createModpackLoading || state.createModpackModsLoading || !state.createModpackSelectedMods.length;
  }

  if (elements.createModpackSelectedList) {
    elements.createModpackSelectedList.innerHTML = "";

    if (!state.createModpackSelectedMods.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state mods-empty-state";
      empty.textContent = "Os mods escolhidos aparecem aqui.";
      elements.createModpackSelectedList.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();
      state.createModpackSelectedMods.forEach((mod) => {
        const item = document.createElement("div");
        item.className = "create-modpack-selected-item";
        item.innerHTML = `
          <div class="create-modpack-selected-copy">
            <strong>${escapeHtml(mod.title || mod.projectId)}</strong>
            <small>${escapeHtml(mod.description || mod.projectId || "")}</small>
          </div>
        `;

        const removeButton = document.createElement("button");
        removeButton.className = "ghost small-button";
        removeButton.type = "button";
        removeButton.textContent = "Remover";
        removeButton.disabled = state.createModpackLoading;
        removeButton.addEventListener("click", () => removeCreateModSelection(mod.projectId));

        item.appendChild(removeButton);
        fragment.appendChild(item);
      });
      elements.createModpackSelectedList.appendChild(fragment);
    }
  }

  if (elements.createModpackModResults) {
    elements.createModpackModResults.innerHTML = "";

    if (state.createModpackModsLoading) {
      const loading = document.createElement("div");
      loading.className = "empty-state mods-empty-state";
      loading.textContent = "Buscando mods compativeis...";
      elements.createModpackModResults.appendChild(loading);
    } else if (!state.createModpackModsResults.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state mods-empty-state";
      empty.textContent = state.createModpackModsQuery
        ? "Nenhum mod compativel encontrado"
        : "Pesquise mods para incluir nesse modpack.";
      elements.createModpackModResults.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();
      state.createModpackModsResults.forEach((mod) => {
        const card = document.createElement("article");
        card.className = "modpack-item";
        if (isCreateModSelected(mod.projectId)) {
          card.classList.add("selected");
        }

        const button = document.createElement("button");
        button.className = isCreateModSelected(mod.projectId) ? "primary" : "secondary";
        button.type = "button";
        button.textContent = isCreateModSelected(mod.projectId) ? "Selecionado" : "Selecionar";
        button.disabled = state.createModpackLoading;
        button.addEventListener("click", () => toggleCreateModSelection(mod));

        card.innerHTML = `
          ${
            mod.iconUrl
              ? `<img class="modpack-icon" src="${escapeHtml(mod.iconUrl)}" alt="" />`
              : '<div class="modpack-icon-placeholder">M</div>'
          }
          <div class="modpack-copy">
            <strong>${escapeHtml(mod.title)}</strong>
            <small>${escapeHtml(mod.description || "")}</small>
          </div>
          <div class="modpack-actions"></div>
        `;

        card.querySelector(".modpack-actions").appendChild(button);
        fragment.appendChild(card);
      });
      elements.createModpackModResults.appendChild(fragment);
    }
  }

  if (elements.createModpackError) {
    elements.createModpackError.textContent = state.createModpackError || "";
    elements.createModpackError.classList.toggle("hidden", !state.createModpackError);
  }

  if (elements.confirmCreateModpack) {
    elements.confirmCreateModpack.textContent = state.createModpackLoading
      ? "Criando..."
      : stepTwoVisible
        ? "Criar modpack"
        : "Avancar";
    elements.confirmCreateModpack.disabled =
      state.createModpackLoading ||
      (stepTwoVisible
        ? false
        : !state.createModpackName.trim() || !state.createModpackMinecraftVersion || !state.createModpackLoader);
  }
}

function refreshCreateModpackNameState() {
  if (elements.createModpackSummaryTitle) {
    elements.createModpackSummaryTitle.textContent = state.createModpackName.trim() || "Novo modpack";
  }

  if (elements.createModpackSummaryMeta) {
    elements.createModpackSummaryMeta.textContent = [
      state.createModpackMinecraftVersion || "Sem versao",
      state.createModpackLoader ? loaderDisplayName(state.createModpackLoader) : "Sem loader",
      parseCreateModpackTags(state.createModpackTags).length
        ? `Tags: ${parseCreateModpackTags(state.createModpackTags).join(", ")}`
        : "",
    ].filter(Boolean).join(" • ");
  }

  if (elements.createModpackError) {
    elements.createModpackError.textContent = state.createModpackError || "";
    elements.createModpackError.classList.toggle("hidden", !state.createModpackError);
  }

  if (elements.confirmCreateModpack) {
    const stepTwoVisible = state.createModpackStep === 2;
    const isSetupValid =
      state.createModpackName.trim() &&
      state.createModpackMinecraftVersion &&
      state.createModpackLoader;

    elements.confirmCreateModpack.disabled =
      state.createModpackLoading || (stepTwoVisible ? false : !isSetupValid);

    // Update button text based on step
    elements.confirmCreateModpack.textContent = stepTwoVisible ? "Criar Modpack" : "Prosseguir";
  }
}

function openCreateModpackModal() {
  if (state.activeTab !== "modpacks" || state.activeModpacksTab !== "downloaded") return;

  state.createModpackModalOpen = true;
  state.createModpackLoading = false;
  state.createModpackError = "";
  state.createModpackStep = 1;
  ensureCreateModpackSelections();
  renderCreateModpackModal();

  requestAnimationFrame(() => {
    if (!elements.createModpackName || !state.createModpackModalOpen) return;
    elements.createModpackName.focus();
    if (!state.createModpackName) {
      elements.createModpackName.select();
    }
  });
}

function closeCreateModpackModal(force = false) {
  if (state.createModpackLoading && !force) return;
  resetCreateModpackModalState();
  renderCreateModpackModal();
}

function selectedModpackSearchFilters() {
  const gameVersion = String(state.selected?.minecraftVersion || state.selected?.inheritsFrom || "").trim();
  const loader = String(state.selected?.loaderType || "").trim().toLowerCase();

  return {
    gameVersion,
    loader: ["fabric", "forge", "neoforge", "quilt"].includes(loader) ? loader : "",
  };
}

async function createCustomModpackFromModal() {
  if (state.createModpackLoading) return;

  if (state.createModpackStep !== 2) {
    await goToCreateModpackModsStep();
    return;
  }

  const name = state.createModpackName.trim();
  if (!name || !state.createModpackMinecraftVersion || !state.createModpackLoader) {
    state.createModpackError = "Preencha o nome, a versao e o loader do modpack.";
    renderCreateModpackModal();
    return;
  }

  state.createModpackLoading = true;
  state.createModpackError = "";
  renderCreateModpackModal();
  setBusy(true);

  try {
    const created = await api.createCustomModpack({
      name,
      tags: parseCreateModpackTags(state.createModpackTags),
      minecraftVersion: state.createModpackMinecraftVersion,
      loaderType: state.createModpackLoader,
    });

    const failedMods = [];
    for (const mod of state.createModpackSelectedMods) {
      try {
        const versions = await api.getModVersions(mod.projectId);
        const selectedVersion = Array.isArray(versions) ? versions[0] : null;
        if (!selectedVersion?.id) {
          throw new Error(`Nenhuma versao compativel encontrada para ${mod.title || mod.projectId}.`);
        }

        await api.installMod({
          projectId: mod.projectId,
          title: mod.title || mod.projectId,
          versionId: selectedVersion.id,
          targetVersionId: created.versionId,
        });
      } catch (error) {
        failedMods.push({
          title: mod.title || mod.projectId,
          message: error.message || String(error),
        });
      }
    }

    const data = await api.refreshVersions();

    state.versions = data.versions;
    state.latest = data.latest;
    state.activeTab = "modpacks";
    state.activeCatalogKind = "modpacks";
    state.activeModpacksTab = "downloaded";
    state.selected = state.versions.find((version) => version.id === created.versionId) || null;
    state.modpackQuery = "";
    if (elements.versionSearch) {
      elements.versionSearch.value = "";
    }

    closeAddModSearchTimer();
    state.addModQuery = "";
    state.addModResults = [];
    state.addModTotalHits = 0;
    state.modpackEditorOpen = false;
    state.addModModalOpen = false;

    closeCreateModpackModal(true);
    renderSelected();
    renderLatest();
    renderCatalog();
    syncModsEditorForSelection(true);
    syncLaunchModsForSelection(true);

    if (failedMods.length) {
      appendLog(
        "warning",
        `${created.title} foi criado, mas ${failedMods.length} mod(s) falharam no download.`
      );
      failedMods.forEach((failure) => appendLog("warning", `${failure.title}: ${failure.message}`));
    } else {
      appendLog(
        "success",
        `${created.title} criado com sucesso${state.createModpackSelectedMods.length ? " com os mods selecionados" : ""}.`
      );
    }
  } catch (error) {
    state.createModpackError = error.message || String(error);
    appendLog("error", state.createModpackError);
    renderCreateModpackModal();
  } finally {
    state.createModpackLoading = false;
    setBusy(false);
    renderCreateModpackModal();
    renderLatest();
  }
}

function isModsFileDirty() {
  return state.modsSelectedEditable && state.modsFileContent !== state.modsOriginalContent;
}

function resetModsFileSelection() {
  state.modsSelectedPath = "";
  state.modsSelectedEditable = false;
  state.modsSelectedSize = 0;
  state.modsSelectedModifiedAt = "";
  state.modsFileContent = "";
  state.modsOriginalContent = "";
}

function resetModsBrowser() {
  state.modsEntries = [];
  state.modsRootPath = "";
  state.modsUsingFallbackRoot = false;
  state.modsTruncated = false;
  state.modsLoadedVersionId = null;
  state.modsStatusMessage = "";
  state.modsLoading = false;
  state.modsSaving = false;
  resetModsFileSelection();
}

function selectedModsEntry() {
  return state.modsEntries.find((entry) => entry.relativePath === state.modsSelectedPath) || null;
}

function confirmDiscardModsChanges() {
  if (!isModsFileDirty()) return true;
  return window.confirm("Existem alteracoes nao salvas nesse arquivo. Deseja descartá-las?");
}

function renderModsEditor(forceTextareaSync = false) {
  if (!elements.modsEditorPanel || !elements.modpackEditorModal) return;

  const available = modsEditorVisible();
  elements.modsEditorPanel.classList.toggle("hidden", !available);
  elements.modpackEditorModal.classList.toggle("hidden", !available || !state.modpackEditorOpen);
  elements.modpackEditorModal.setAttribute(
    "aria-hidden",
    !available || !state.modpackEditorOpen ? "true" : "false"
  );

  if (!available) {
    return;
  }

  const selectedEntry = selectedModsEntry();
  const dirty = isModsFileDirty();

  if (elements.modsRootLabel) {
    if (state.modsLoading) {
      elements.modsRootLabel.textContent = "Carregando arquivos da pasta mods...";
    } else if (state.modsRootPath) {
      const suffix = state.modsUsingFallbackRoot ? " (usando mods da .minecraft)" : "";
      elements.modsRootLabel.textContent = `${state.modsRootPath}${suffix}`;
    } else {
      elements.modsRootLabel.textContent = "Selecione um mod do modpack para editar ou desativar.";
    }
  }

  if (elements.modsRefresh) {
    elements.modsRefresh.disabled = state.busy || state.modsLoading || state.modsSaving;
  }

  if (elements.modsSave) {
    elements.modsSave.disabled =
      state.busy ||
      state.modsLoading ||
      state.modsSaving ||
      !state.modsSelectedEditable ||
      !dirty;
    elements.modsSave.textContent = state.modsSaving ? "Salvando..." : "Salvar";
  }

  if (elements.openAddModModal) {
    elements.openAddModModal.disabled = state.busy || state.modsLoading;
  }

  if (elements.modsFileList) {
    elements.modsFileList.innerHTML = "";

    if (state.modsLoading) {
      const empty = document.createElement("div");
      empty.className = "empty-state mods-empty-state";
      empty.textContent = "Carregando arquivos...";
      elements.modsFileList.appendChild(empty);
    } else if (!state.modsEntries.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state mods-empty-state";
      empty.textContent = "Nenhum arquivo encontrado dentro da pasta mods.";
      elements.modsFileList.appendChild(empty);
    } else {
      const fragment = document.createDocumentFragment();

      state.modsEntries.forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mods-file-item";
        if (entry.relativePath === state.modsSelectedPath) {
          button.classList.add("selected");
        }
        if (!entry.editable) {
          button.classList.add("readonly");
        }

        const meta = [];
        meta.push(formatBytes(entry.size));
        if (!entry.editable) meta.push("somente leitura");

        button.innerHTML = `
          <span class="mods-file-copy">
            <strong>${escapeHtml(entry.name)}</strong>
            <small>${escapeHtml(entry.relativePath)}</small>
            <span>${escapeHtml(meta.join(" • "))}</span>
          </span>
        `;

        button.addEventListener("click", () => {
          openModsFileEntry(entry);
        });

        if (isToggleableModpackEntry(entry)) {
          const toggle = document.createElement("button");
          toggle.type = "button";
          toggle.className = `mods-file-toggle ${isActiveModpackEntry(entry) ? "enabled" : "disabled"}`;
          toggle.textContent = isActiveModpackEntry(entry) ? "Ativo" : "Desativado";
          toggle.setAttribute("aria-label", isActiveModpackEntry(entry) ? "Mod ativo" : "Mod desativado");
          toggle.setAttribute("aria-pressed", isActiveModpackEntry(entry) ? "true" : "false");
          toggle.title = isActiveModpackEntry(entry) ? "Mod ativo" : "Mod desativado";
          toggle.disabled = state.busy || state.modsLoading || state.modsSaving;
          toggle.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleSelectedModpackMod(entry);
          });
          button.appendChild(toggle);
        }

        fragment.appendChild(button);
      });

      if (state.modsTruncated) {
        const notice = document.createElement("div");
        notice.className = "mods-list-notice";
        notice.textContent = "Lista parcial: muitos arquivos dentro da pasta mods.";
        fragment.appendChild(notice);
      }

      elements.modsFileList.appendChild(fragment);
    }
  }

  if (elements.modsSelectedFile) {
    elements.modsSelectedFile.textContent = state.modsSelectedPath || "Nenhum arquivo selecionado";
  }

  if (elements.modsFileStatus) {
    if (!state.modsSelectedPath) {
      elements.modsFileStatus.textContent = state.modsStatusMessage || "Escolha um arquivo de texto para editar.";
    } else {
      const details = [];
      if (state.modsSelectedSize) details.push(formatBytes(state.modsSelectedSize));
      if (state.modsSelectedModifiedAt) details.push(`Atualizado ${formatDate(state.modsSelectedModifiedAt)}`);
      if (!state.modsSelectedEditable) {
        details.push(state.modsStatusMessage || "Arquivo binario ou grande demais para edicao.");
      } else if (dirty) {
        details.push("Alteracoes nao salvas");
      } else if (state.modsStatusMessage) {
        details.push(state.modsStatusMessage);
      } else {
        details.push("Pronto para editar");
      }
      elements.modsFileStatus.textContent = details.join(" • ");
    }
  }

  if (elements.modsFileContent) {
    elements.modsFileContent.disabled =
      state.busy || state.modsLoading || state.modsSaving || !state.modsSelectedEditable;
    elements.modsFileContent.placeholder = state.modsSelectedEditable
      ? "Edite o arquivo aqui e clique em Salvar."
      : state.modsSelectedPath
        ? "Esse arquivo nao pode ser editado pelo launcher."
        : "Selecione um arquivo da lista para editar aqui.";

    if (forceTextareaSync || elements.modsFileContent.value !== state.modsFileContent) {
      elements.modsFileContent.value = state.modsFileContent;
    }
  }
}

async function loadModsFiles(forceReload = false) {
  if (!modsEditorVisible()) {
    resetModsBrowser();
    renderModsEditor(true);
    return;
  }

  if (!state.modpackEditorOpen) {
    renderModsEditor(true);
    return;
  }

  const versionId = state.selected.id;
  if (!forceReload && state.modsLoadedVersionId === versionId && state.modsEntries.length) {
    renderModsEditor();
    return;
  }

  const requestId = ++state.modsListRequestId;
  state.modsLoading = true;
  state.modsStatusMessage = "";
  if (forceReload || state.modsLoadedVersionId !== versionId) {
    resetModsFileSelection();
  }
  renderModsEditor(true);

  try {
    const response = await api.listModFiles({ versionId });
    if (requestId !== state.modsListRequestId) return;

    state.modsEntries = Array.isArray(response?.entries) ? response.entries : [];
    state.modsRootPath = response?.rootPath || "";
    state.modsUsingFallbackRoot = Boolean(response?.usingFallbackRoot);
    state.modsTruncated = Boolean(response?.truncated);
    state.modsLoadedVersionId = versionId;

    if (!state.modsEntries.some((entry) => entry.relativePath === state.modsSelectedPath)) {
      resetModsFileSelection();
    }
  } catch (error) {
    if (requestId !== state.modsListRequestId) return;
    resetModsBrowser();
    state.modsStatusMessage = error.message || String(error);
    appendLog("error", error.message || String(error));
  } finally {
    if (requestId === state.modsListRequestId) {
      state.modsLoading = false;
      renderModsEditor(true);
    }
  }
}

async function openModsFileEntry(entry) {
  if (!entry || !modsEditorVisible() || !state.modpackEditorOpen) return;
  if (!confirmDiscardModsChanges()) return;

  state.modsSelectedPath = entry.relativePath;
  state.modsSelectedSize = entry.size || 0;
  state.modsSelectedModifiedAt = entry.modifiedAt || "";
  state.modsSelectedEditable = Boolean(entry.editable);
  state.modsStatusMessage = entry.editable
    ? "Carregando arquivo..."
    : "Arquivo binario ou grande demais para edicao no launcher.";
  state.modsFileContent = "";
  state.modsOriginalContent = "";
  renderModsEditor(true);

  if (!entry.editable) {
    return;
  }

  const requestId = ++state.modsFileRequestId;

  try {
    const response = await api.readModFile({
      versionId: state.selected.id,
      relativePath: entry.relativePath,
    });

    if (requestId !== state.modsFileRequestId) return;

    state.modsSelectedPath = response.relativePath;
    state.modsSelectedEditable = true;
    state.modsSelectedSize = response.size || 0;
    state.modsSelectedModifiedAt = response.modifiedAt || "";
    state.modsFileContent = response.content || "";
    state.modsOriginalContent = response.content || "";
    state.modsStatusMessage = "";
    renderModsEditor(true);
  } catch (error) {
    if (requestId !== state.modsFileRequestId) return;
    state.modsSelectedEditable = false;
    state.modsStatusMessage = error.message || String(error);
    state.modsFileContent = "";
    state.modsOriginalContent = "";
    appendLog("error", error.message || String(error));
    renderModsEditor(true);
  }
}

async function saveModsFile() {
  if (!modsEditorVisible() || !state.modpackEditorOpen || !state.modsSelectedEditable || !state.modsSelectedPath) return;
  if (!isModsFileDirty()) return;

  state.modsSaving = true;
  state.modsStatusMessage = "Salvando arquivo...";
  renderModsEditor();

  try {
    const response = await api.writeModFile({
      versionId: state.selected.id,
      relativePath: state.modsSelectedPath,
      content: state.modsFileContent,
    });

    state.modsOriginalContent = state.modsFileContent;
    state.modsSelectedSize =
      response.size || new TextEncoder().encode(state.modsFileContent || "").length;
    state.modsSelectedModifiedAt = response.modifiedAt || "";
    state.modsStatusMessage = "Arquivo salvo com sucesso.";
    state.modsEntries = state.modsEntries.map((entry) =>
      entry.relativePath === state.modsSelectedPath
        ? {
            ...entry,
            size: state.modsSelectedSize,
            modifiedAt: state.modsSelectedModifiedAt,
            editable: true,
          }
        : entry
    );
  } catch (error) {
    state.modsStatusMessage = error.message || String(error);
    appendLog("error", error.message || String(error));
  } finally {
    state.modsSaving = false;
    renderModsEditor();
  }
}

function syncModsEditorForSelection(forceReload = false) {
  if (!modsEditorVisible()) {
    state.modpackEditorOpen = false;
    state.addModModalOpen = false;
    resetModsBrowser();
    renderModsEditor(true);
    renderAddModModal();
    return;
  }

  renderModsEditor(true);
  if (state.modpackEditorOpen) {
    loadModsFiles(forceReload);
  }
}

function openModpackEditorModal() {
  if (!modsEditorVisible()) return;
  state.modpackEditorOpen = true;
  renderModsEditor(true);
  loadModsFiles(true);
}

function closeModpackEditorModal() {
  if (!confirmDiscardModsChanges()) return;
  state.modpackEditorOpen = false;
  state.addModModalOpen = false;
  renderModsEditor(true);
  renderAddModModal();
}

async function toggleSelectedModpackMod(entry = null) {
  const resolvedEntry = entry || selectedModpackToggleableEntry();
  const preserveSelection = resolvedEntry?.relativePath || "";
  if (!resolvedEntry || !isToggleableModpackEntry(resolvedEntry) || !modsEditorVisible()) return;

  try {
    const response = await api.toggleModpackFileActive({
      versionId: state.selected.id,
      relativePath: resolvedEntry.relativePath,
      enabled: !isActiveModpackEntry(resolvedEntry),
    });

    state.modsSelectedPath = response.relativePath || preserveSelection;
    await loadModsFiles(true);
    if (state.modsSelectedPath) {
      const nextEntry = state.modsEntries.find((item) => item.relativePath === state.modsSelectedPath);
      if (nextEntry) {
        await openModsFileEntry(nextEntry);
      }
    }
  } catch (error) {
    appendLog("error", error.message || String(error));
  }
}

function renderAddModModal() {
  if (!elements.addModModal || !elements.addModResults) return;

  const visible = state.addModModalOpen && modsEditorVisible() && state.modpackEditorOpen;
  elements.addModModal.classList.toggle("hidden", !visible);
  elements.addModModal.setAttribute("aria-hidden", visible ? "false" : "true");

  if (!visible) return;

  if (elements.addModSearch && elements.addModSearch.value !== state.addModQuery) {
    elements.addModSearch.value = state.addModQuery;
  }

  elements.addModResults.innerHTML = "";

  if (state.addModLoading) {
    const loading = document.createElement("div");
    loading.className = "empty-state mods-empty-state";
    loading.textContent = "Buscando mods...";
    elements.addModResults.appendChild(loading);
    return;
  }

  if (!state.addModResults.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state mods-empty-state";
    empty.textContent = state.addModQuery
      ? "Nenhum mod encontrado"
      : "Pesquise um mod para adicionar a este modpack.";
    elements.addModResults.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  state.addModResults.forEach((mod) => {
    const card = document.createElement("article");
    card.className = "modpack-item";

    const button = document.createElement("button");
    button.className = "secondary";
    button.type = "button";
    button.textContent = state.installingModId === mod.projectId ? "Adicionando..." : "Adicionar";
    button.disabled = state.busy || state.installingModId === mod.projectId;
    button.addEventListener("click", () => startAddModToSelectedModpack(mod));

    card.innerHTML = `
      ${
        mod.iconUrl
          ? `<img class="modpack-icon" src="${escapeHtml(mod.iconUrl)}" alt="" />`
          : '<div class="modpack-icon-placeholder">M</div>'
      }
      <div class="modpack-copy">
        <strong>${escapeHtml(mod.title)}</strong>
        <small>${escapeHtml(mod.description || "")}</small>
      </div>
      <div class="modpack-actions"></div>
    `;

    card.querySelector(".modpack-actions").appendChild(button);
    fragment.appendChild(card);
  });

  elements.addModResults.appendChild(fragment);
}

function openAddModPopup() {
  if (!modsEditorVisible() || !state.modpackEditorOpen) return;
  state.addModModalOpen = true;
  renderAddModModal();
  if (!state.addModResults.length) {
    searchModsForCurrentModpack(state.addModQuery);
  }
}

function closeAddModPopup() {
  state.addModModalOpen = false;
  renderAddModModal();
}

async function searchModsForCurrentModpack(query = "") {
  if (!modsEditorVisible()) return;

  state.addModLoading = true;
  state.addModQuery = String(query || "").trim();
  renderAddModModal();

  try {
    const selectedFilters = selectedModpackSearchFilters();
    const result = await api.searchMods(state.addModQuery, {
      ...(state.modpackFilters || {}),
      gameVersion: selectedFilters.gameVersion || state.modpackFilters?.gameVersion || "",
      loader: selectedFilters.loader || state.modpackFilters?.loader || "",
    });
    state.addModResults = result.hits || [];
    state.addModTotalHits = result.totalHits || state.addModResults.length;
  } catch (error) {
    appendLog("error", error.message || String(error));
    state.addModResults = [];
    state.addModTotalHits = 0;
  } finally {
    state.addModLoading = false;
    renderAddModModal();
  }
}

function queueAddModSearch() {
  closeAddModSearchTimer();
  state.addModSearchTimer = setTimeout(() => {
    searchModsForCurrentModpack(state.addModQuery);
  }, 320);
}

async function startAddModToSelectedModpack(modProject) {
  if (!modProject?.projectId || !modsEditorVisible()) return;

  state.installingModId = modProject.projectId;
  renderAddModModal();

  try {
    const versions = await api.getModVersions(modProject.projectId);
    closeAddModPopup();
    openModVersionModal(modProject, versions, {
      targetVersionId: state.selected.id,
      hideTarget: true,
    });
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    state.installingModId = null;
    renderAddModModal();
  }
}

function launchModsVisible() {
  return (
    state.activeTab === "versions" &&
    elements.versionFilter?.value === "installed" &&
    Boolean(state.selected?.id) &&
    (state.selected?.installed || state.selected?.local) &&
    isDownloadedModpack(state.selected)
  );
}

function renderLaunchModsPanel() {
  if (!elements.launchModsPanel) return;

  const visible = launchModsVisible();
  elements.launchModsPanel.classList.toggle("hidden", !visible);
  if (!visible) return;

  if (elements.launchModsRootLabel) {
    if (state.launchModsLoading) {
      elements.launchModsRootLabel.textContent = "Carregando mods dessa versao...";
    } else if (state.launchModsRootPath) {
      const suffix = state.launchModsUsingFallbackRoot ? " (usando mods da .minecraft)" : "";
      elements.launchModsRootLabel.textContent = `${state.launchModsRootPath}${suffix}`;
    } else {
      elements.launchModsRootLabel.textContent = "Ative ou desative os mods desta versao antes de jogar.";
    }
  }

  if (elements.launchModsRefresh) {
    elements.launchModsRefresh.disabled = state.busy || state.launchModsLoading;
  }

  if (elements.launchModsList) {
    elements.launchModsList.innerHTML = "";

    if (state.launchModsLoading) {
      const empty = document.createElement("div");
      empty.className = "empty-state mods-empty-state";
      empty.textContent = "Carregando mods...";
      elements.launchModsList.appendChild(empty);
      return;
    }

    if (!state.launchModsEntries.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state mods-empty-state";
      empty.textContent = "Nenhum mod .jar encontrado para essa versao.";
      elements.launchModsList.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    state.launchModsEntries.forEach((entry) => {
      const row = document.createElement("article");
      row.className = "launch-mod-item";
      row.innerHTML = `
        <div class="launch-mod-copy">
          <strong>${escapeHtml(entry.displayName)}</strong>
          <small>${escapeHtml(entry.relativePath)}</small>
        </div>
      `;

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = `launch-mod-toggle ${entry.enabled ? "enabled" : "ghost"}`;
      toggle.textContent = entry.enabled ? "Ativado" : "Desativado";
      toggle.disabled = state.busy || state.launchModsLoading;
      toggle.addEventListener("click", () => toggleLaunchModEntry(entry));
      row.appendChild(toggle);
      fragment.appendChild(row);
    });

    if (state.launchModsTruncated) {
      const notice = document.createElement("div");
      notice.className = "mods-list-notice";
      notice.textContent = "Lista parcial: muitos mods nesta pasta.";
      fragment.appendChild(notice);
    }

    elements.launchModsList.appendChild(fragment);
  }
}

async function loadLaunchMods(forceReload = false) {
  if (!launchModsVisible()) {
    state.launchModsEntries = [];
    state.launchModsRootPath = "";
    state.launchModsUsingFallbackRoot = false;
    state.launchModsLoadedVersionId = null;
    state.launchModsTruncated = false;
    state.launchModsLoading = false;
    renderLaunchModsPanel();
    return;
  }

  const versionId = state.selected.id;
  if (!forceReload && state.launchModsLoadedVersionId === versionId && state.launchModsEntries.length) {
    renderLaunchModsPanel();
    return;
  }

  state.launchModsLoading = true;
  renderLaunchModsPanel();

  try {
    const response = await api.listLaunchMods({ versionId });
    state.launchModsEntries = Array.isArray(response?.entries) ? response.entries : [];
    state.launchModsRootPath = response?.rootPath || "";
    state.launchModsUsingFallbackRoot = Boolean(response?.usingFallbackRoot);
    state.launchModsLoadedVersionId = versionId;
    state.launchModsTruncated = Boolean(response?.truncated);
  } catch (error) {
    state.launchModsEntries = [];
    state.launchModsRootPath = "";
    state.launchModsUsingFallbackRoot = false;
    state.launchModsLoadedVersionId = null;
    state.launchModsTruncated = false;
    appendLog("error", error.message || String(error));
  } finally {
    state.launchModsLoading = false;
    renderLaunchModsPanel();
  }
}

async function toggleLaunchModEntry(entry) {
  if (!launchModsVisible() || !entry?.relativePath) return;

  try {
    await api.toggleLaunchMod({
      versionId: state.selected.id,
      relativePath: entry.relativePath,
      enabled: !entry.enabled,
    });
    await loadLaunchMods(true);
  } catch (error) {
    appendLog("error", error.message || String(error));
  }
}

function syncLaunchModsForSelection(forceReload = false) {
  loadLaunchMods(forceReload);
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
        ${renderTagRow(version.modpackTags)}
      </span>
    `;
    button.addEventListener("click", () => {
      state.selected = version;
      renderSelected();
      renderVersions();
      syncModsEditorForSelection();
      syncLaunchModsForSelection();
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
        <small>${escapeHtml(versionCompactDetails(version) || "-")}</small>
      </span>
    `;
    button.addEventListener("click", () => {
      state.selected = version;
      renderSelected();
      renderCatalog();
      syncModsEditorForSelection();
    });
    fragment.appendChild(button);
  });

  elements.versionList.appendChild(fragment);
}

function renderModsCatalog() {
  elements.versionList.innerHTML = "";

  if (state.modsCatalogLoading) {
    const loading = document.createElement("div");
    loading.className = "empty-state";
    loading.textContent = "Buscando mods no Modrinth...";
    elements.versionList.appendChild(loading);
    return;
  }

  if (!state.modsCatalog.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.modpackQuery
      ? "Nenhum mod encontrado"
      : "Pesquise mods do Modrinth para instalar";
    elements.versionList.appendChild(empty);
    return;
  }

  const fragment = document.createDocumentFragment();

  state.modsCatalog.forEach((mod) => {
    const card = document.createElement("article");
    card.className = "modpack-item";
    if (state.selected && state.selected.projectId === mod.projectId) {
      card.classList.add("selected");
    }

    const button = document.createElement("button");
    button.className = "secondary";
    button.type = "button";
    button.textContent = state.installingModId === mod.projectId ? "Instalando..." : "Instalar";
    button.disabled = state.busy || state.installingModId === mod.projectId;
    button.addEventListener("click", () => startModInstall(mod));

    card.innerHTML = `
      ${
        mod.iconUrl
          ? `<img class="modpack-icon" src="${escapeHtml(mod.iconUrl)}" alt="" />`
          : '<div class="modpack-icon-placeholder">M</div>'
      }
      <div class="modpack-copy">
        <strong>${escapeHtml(mod.title)}</strong>
        <small>${escapeHtml(mod.description || "")}</small>
      </div>
      <div class="modpack-actions"></div>
    `;

    const actions = card.querySelector(".modpack-actions");
    actions.appendChild(button);
    fragment.appendChild(card);
  });

  elements.versionList.appendChild(fragment);
}

function renderModpacks() {
  if (state.activeModpacksTab === "downloaded") {
    renderDownloadedModpacks();
    return;
  }

  if (state.activeCatalogKind === "mods") {
    renderModsCatalog();
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
        ${renderTagRow(modpackGenreTags(modpack.categories), "modpack-tags")}
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
    elements.selectedVersion.textContent = escapeHtml(
      state.selected.title || (state.activeCatalogKind === "mods" ? "Mod" : "Modpack")
    );
    const meta = [
      state.selected.author ? `por ${state.selected.author}` : "",
      `${formatCompactNumber(state.selected.downloads)} downloads`
    ].filter(Boolean).join(" - ");
    elements.selectedMeta.textContent = meta || (state.activeCatalogKind === "mods" ? "Mod do Modrinth" : "Modpack do Modrinth");
  } else {
    const compactDetails = versionCompactDetails(state.selected);
    elements.selectedVersion.innerHTML = compactDetails
      ? `${escapeHtml(versionDisplayName(state.selected))}<small class="selected-version-inline-meta">${escapeHtml(compactDetails)}</small>`
      : escapeHtml(versionDisplayName(state.selected));
    elements.selectedMeta.textContent = versionDescription(state.selected);
  }
  syncActionButtons();
}

function renderLatest() {
  if (state.activeTab === "modpacks") {
    if (elements.createModpackButton) {
      elements.createModpackButton.classList.toggle("hidden", state.activeModpacksTab !== "downloaded");
    }
    elements.topbarTitle.textContent =
      state.activeModpacksTab === "downloaded"
        ? "Modpacks"
        : state.activeCatalogKind === "mods"
          ? "Mods"
          : "Modpacks";
    if (state.activeModpacksTab === "downloaded") {
      const total = downloadedModpacks().length;
      elements.latestLine.textContent = total
        ? `${total} modpacks baixados`
        : "Seus modpacks instalados aparecem aqui.";
    } else if (state.activeCatalogKind === "mods" && state.modsCatalogLoading) {
      elements.latestLine.textContent = "Buscando catalogo de mods do Modrinth...";
    } else if (state.activeCatalogKind === "mods" && state.modsCatalog.length) {
      elements.latestLine.textContent = `${state.modsCatalogTotalHits || state.modsCatalog.length} mods encontrados`;
    } else if (state.activeCatalogKind === "mods") {
      elements.latestLine.textContent = "Pesquise mods do Modrinth para instalar.";
    } else if (state.modpacksLoading) {
      elements.latestLine.textContent = "Buscando catalogo do Modrinth...";
    } else if (state.modpacks.length) {
      elements.latestLine.textContent = `${state.modpackTotalHits || state.modpacks.length} modpacks encontrados`;
    } else {
      elements.latestLine.textContent = "Pesquise modpacks do Modrinth para baixar.";
    }
    elements.versionFilter.classList.add("hidden");
    elements.modpackSubtabs.classList.remove("hidden");
    if (elements.catalogModsTab) {
      elements.catalogModsTab.classList.toggle(
        "active",
        state.activeModpacksTab !== "downloaded" && state.activeCatalogKind === "mods"
      );
    }
    elements.modpacksSearchTab.classList.toggle(
      "active",
      state.activeModpacksTab !== "downloaded" && state.activeCatalogKind === "modpacks"
    );
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

  if (elements.createModpackButton) {
    elements.createModpackButton.classList.add("hidden");
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
  if (state.activeCatalogKind === "mods") {
    state.modsCatalogLoading = true;
    state.modpackQuery = String(query || "").trim();
    renderLatest();
    renderCatalog();

    try {
      const result = await api.searchMods(state.modpackQuery, state.modpackFilters);
      state.modsCatalog = result.hits || [];
      state.modsCatalogTotalHits = result.totalHits || state.modsCatalog.length;
    } catch (error) {
      appendLog("error", error.message || String(error));
      state.modsCatalog = [];
      state.modsCatalogTotalHits = 0;
    } finally {
      state.modsCatalogLoading = false;
      renderLatest();
      renderCatalog();
    }
    return;
  }

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
  if (tab === "downloaded") {
    state.activeCatalogKind = "modpacks";
  }
  if (
    tab === "search" &&
    ((state.activeCatalogKind === "modpacks" && !state.modpacks.length && !state.modpacksLoading) ||
      (state.activeCatalogKind === "mods" && !state.modsCatalog.length && !state.modsCatalogLoading))
  ) {
    refreshModpacks(state.modpackQuery);
  }
  renderLatest();
  renderCatalog();
  syncModsEditorForSelection();
  syncLaunchModsForSelection();
}

function setActiveCatalogKind(kind) {
  if (state.activeCatalogKind === kind) return;
  state.activeCatalogKind = kind;
  state.selected = null;
  renderSelected();
  renderLatest();
  renderCatalog();
  syncModsEditorForSelection();
  syncLaunchModsForSelection();
  if (state.activeModpacksTab === "search") {
    refreshModpacks(elements.versionSearch.value);
  }
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
    if (
      state.activeModpacksTab === "search" &&
      ((state.activeCatalogKind === "modpacks" && !state.modpacks.length && !state.modpacksLoading) ||
        (state.activeCatalogKind === "mods" && !state.modsCatalog.length && !state.modsCatalogLoading))
    ) {
      refreshModpacks(state.modpackQuery);
    }
  }

  renderLatest();
  renderCatalog();
  renderSelected();
  syncModsEditorForSelection();
  syncLaunchModsForSelection();
}

async function startModpackInstall(modpack) {
  if (!modpack?.projectId) return;

  // Marcar o modpack como selecionado no painel de seleção
  state.selected = modpack;
  renderSelected();
  syncModsEditorForSelection();

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

async function startModInstall(modProject) {
  if (!modProject?.projectId) return;

  state.selected = modProject;
  renderSelected();

  state.installingModId = modProject.projectId;
  setBusy(true);
  renderCatalog();

  try {
    const versions = await api.getModVersions(modProject.projectId);
    if (!installedVersionsForMods().length) {
      throw new Error("Instale pelo menos uma versao primeiro para receber mods.");
    }
    openModVersionModal(modProject, versions);
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    state.installingModId = null;
    setBusy(false);
    renderCatalog();
  }
}

async function installSelectedModVersion(modVersionId) {
  if (!state.pendingModProject?.projectId) return;
  const targetVersionId = state.pendingModTargetVersionId || elements.modpackTargetVersion?.value || "";
  if (!targetVersionId) {
    appendLog("error", "Escolha a versao instalada que recebera o mod.");
    return;
  }

  const modProject = state.pendingModProject;

  state.installingModId = modProject.projectId;
  setBusy(true);
  renderCatalog();

  try {
    closeModpackVersionModal();
    await api.installMod({
      ...modProject,
      versionId: modVersionId,
      targetVersionId,
    });
    appendLog("success", `Mod instalado em ${targetVersionId}.`);
    if (state.selected?.id === targetVersionId) {
      loadModsFiles(true);
    }
    if (state.activeTab === "versions" && state.selected?.id === targetVersionId) {
      syncLaunchModsForSelection(true);
    }
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    state.installingModId = null;
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
    syncModsEditorForSelection(true);
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
    syncModsEditorForSelection();
    syncLaunchModsForSelection();
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
      syncModsEditorForSelection(true);
      syncLaunchModsForSelection(true);
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
    syncModsEditorForSelection();
    syncLaunchModsForSelection();
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
if (elements.openModpackEditor) {
  elements.openModpackEditor.addEventListener("click", openModpackEditorModal);
}
if (elements.closeModpackEditor) {
  elements.closeModpackEditor.addEventListener("click", closeModpackEditorModal);
}
if (elements.modpackEditorModal) {
  elements.modpackEditorModal.addEventListener("click", (event) => {
    if (event.target === elements.modpackEditorModal) {
      closeModpackEditorModal();
    }
  });
}
if (elements.openAddModModal) {
  elements.openAddModModal.addEventListener("click", openAddModPopup);
}
if (elements.closeAddModModal) {
  elements.closeAddModModal.addEventListener("click", closeAddModPopup);
}
if (elements.cancelAddModModal) {
  elements.cancelAddModModal.addEventListener("click", closeAddModPopup);
}
if (elements.addModModal) {
  elements.addModModal.addEventListener("click", (event) => {
    if (event.target === elements.addModModal) {
      closeAddModPopup();
    }
  });
}
if (elements.addModSearch) {
  elements.addModSearch.addEventListener("input", (event) => {
    state.addModQuery = event.target.value || "";
    queueAddModSearch();
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") {
    return;
  }

  if (state.addModModalOpen) {
    closeAddModPopup();
    return;
  }

  if (state.modpackEditorOpen) {
    closeModpackEditorModal();
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
      syncLaunchModsForSelection(true);
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
  syncLaunchModsForSelection(true);
});

elements.versionSearch.addEventListener("input", () => {
  if (state.activeTab === "modpacks" && state.activeModpacksTab === "search") {
    state.modpackQuery = elements.versionSearch.value.trim();
    queueModpackSearch();
    return;
  }

  renderCatalog();
});
if (elements.createModpackButton) {
  elements.createModpackButton.addEventListener("click", openCreateModpackModal);
}
if (elements.closeCreateModpackModal) {
  elements.closeCreateModpackModal.addEventListener("click", closeCreateModpackModal);
}
if (elements.cancelCreateModpack) {
  elements.cancelCreateModpack.addEventListener("click", closeCreateModpackModal);
}
if (elements.backCreateModpackStep) {
  elements.backCreateModpackStep.addEventListener("click", () => {
    if (state.createModpackLoading) return;
    state.createModpackStep = 1;
    state.createModpackError = "";
    renderCreateModpackModal();
  });
}
if (elements.confirmCreateModpack) {
  elements.confirmCreateModpack.addEventListener("click", createCustomModpackFromModal);
}
if (elements.createModpackModal) {
  elements.createModpackModal.addEventListener("click", (event) => {
    if (event.target === elements.createModpackModal) {
      closeCreateModpackModal();
    }
  });
}
if (elements.createModpackName) {
  elements.createModpackName.addEventListener("input", (event) => {
    state.createModpackName = event.target.value || "";
    state.createModpackError = "";
    refreshCreateModpackNameState();
  });
}
if (elements.createModpackTags) {
  elements.createModpackTags.addEventListener("input", (event) => {
    state.createModpackTags = event.target.value || "";
    state.createModpackError = "";
    refreshCreateModpackNameState();
  });
}
if (elements.createModpackVersion) {
  elements.createModpackVersion.addEventListener("change", (event) => {
    state.createModpackMinecraftVersion = event.target.value || "";
    state.createModpackError = "";
    state.createModpackSelectedMods = [];
    state.createModpackModsResults = [];
    state.createModpackModsQuery = "";
    ensureCreateModpackSelections();
    renderCreateModpackModal();
  });
}
if (elements.createModpackLoader) {
  elements.createModpackLoader.addEventListener("change", (event) => {
    state.createModpackLoader = event.target.value || "";
    state.createModpackError = "";
    state.createModpackSelectedMods = [];
    state.createModpackModsResults = [];
    state.createModpackModsQuery = "";
    renderCreateModpackModal();
  });
}
if (elements.createModpackModSearch) {
  elements.createModpackModSearch.addEventListener("input", (event) => {
    state.createModpackModsQuery = event.target.value || "";
    state.createModpackError = "";
    queueCreateModpackModsSearch();
  });
}
if (elements.clearCreateModpackMods) {
  elements.clearCreateModpackMods.addEventListener("click", () => {
    state.createModpackSelectedMods = [];
    renderCreateModpackModal();
  });
}
elements.modpacksSearchTab.addEventListener("click", () => {
  setActiveCatalogKind("modpacks");
  setActiveModpacksTab("search");
});
elements.modpacksDownloadedTab.addEventListener("click", () => setActiveModpacksTab("downloaded"));
if (elements.catalogModsTab) {
  elements.catalogModsTab.addEventListener("click", () => {
    setActiveCatalogKind("mods");
    setActiveModpacksTab("search");
  });
}
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

if (elements.modsRefresh) {
  elements.modsRefresh.addEventListener("click", () => {
    syncModsEditorForSelection(true);
  });
}

if (elements.launchModsRefresh) {
  elements.launchModsRefresh.addEventListener("click", () => {
    syncLaunchModsForSelection(true);
  });
}

if (elements.modsSave) {
  elements.modsSave.addEventListener("click", saveModsFile);
}

if (elements.modsFileContent) {
  elements.modsFileContent.addEventListener("input", (event) => {
    state.modsFileContent = event.target.value || "";
    if (state.modsSelectedEditable) {
      state.modsStatusMessage = "";
    }
    renderModsEditor();
  });

  elements.modsFileContent.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveModsFile();
    }
  });
}

api.onEvent(handleLauncherEvent);
refreshState();
