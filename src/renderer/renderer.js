const api = window.launcherApi;

const state = {
  versions: [],
  modpacks: [],
  latest: null,
  selected: null,
  account: null,
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
    elements.addLocalAccount,
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
        <small>${escapeHtml(
          [
            version.versionNumber ? `Pack ${version.versionNumber}` : "",
            version.minecraftVersion ? `MC ${version.minecraftVersion}` : "",
            modpackLoaderLabel(version.loaderType),
            version.publishedAt ? formatDate(version.publishedAt) : "",
          ]
            .filter(Boolean)
            .join(" - ")
        )}</small>
      </span>
      <span class="tag-row">
        <span class="tag ${escapeHtml(String(version.loaderType || "vanilla").toLowerCase())}">${escapeHtml(
          modpackLoaderLabel(version.loaderType)
        )}</span>
        ${
          version.featured
            ? '<span class="tag installed">destaque</span>'
            : ""
        }
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

function renderAccount() {
  if (state.account) {
    const avatarUrl =
      state.account.type === "microsoft"
        ? `https://minotar.net/helm/${state.account.id}/64.png`
        : `https://minotar.net/helm/MHF_Steve/64.png`;
    elements.accountView.innerHTML = `
      <img src="${avatarUrl}" class="avatar" alt="Avatar">
      <div style="flex: 1; overflow: hidden;">
        <strong>${state.account.name}</strong>
        <small>${state.account.type === "microsoft" ? "Microsoft" : "Local"}</small>
      </div>
      <svg id="account-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="transition: transform 0.2s; color: var(--muted);"><polyline points="6 9 12 15 18 9"></polyline></svg>
    `;
    elements.accountStatus.textContent = "Online";
    elements.accountStatus.className = "status-pill status-online";
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
    elements.accountStatus.className = "status-pill status-offline";
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
    elements.accountsList.innerHTML = `<div style="padding: 16px; text-align: center; color: var(--muted);">Nenhuma conta adicionada.</div>`;
    return;
  }
  
  elements.accountsList.innerHTML = accounts.map(acc => `
    <div class="account-item" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--surface-2); border: 1px solid ${acc.isActive ? 'var(--primary)' : 'var(--line)'}; border-radius: 8px; cursor: pointer;" data-id="${acc.accountId}">
      <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
        <img src="https://minotar.net/helm/${acc.type === 'microsoft' ? acc.id : 'MHF_Steve'}/32.png" style="width: 32px; height: 32px; border-radius: 4px;">
        <div style="display: flex; flex-direction: column;">
          <strong style="color: ${acc.isActive ? 'var(--primary)' : 'var(--text)'};">${acc.name}</strong>
          <small style="color: var(--muted); font-size: 11px;">${acc.type === 'microsoft' ? 'Microsoft' : 'Local'}</small>
        </div>
      </div>
      ${acc.isActive ? '<span style="font-size: 11px; padding: 2px 6px; background: var(--primary); color: white; border-radius: 4px; margin-right: 8px;">Ativa</span>' : ''}
      <button class="ghost icon-button small-icon-button btn-remove-account" data-id="${acc.accountId}" aria-label="Remover">×</button>
    </div>
  `).join("");
  
  elements.accountsList.querySelectorAll('.account-item').forEach(el => {
    el.addEventListener('click', async (e) => {
      if (e.target.closest('.btn-remove-account')) return;
      const id = el.getAttribute('data-id');
      await api.setActiveAccount(id);
      await refreshState();
    });
  });
  
  elements.accountsList.querySelectorAll('.btn-remove-account').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await api.removeAccount({ accountId: id });
      await refreshState();
    });
  });
}

function versionLabel(version) {
  const map = {
    release: "release",
    snapshot: "snapshot",
    fabric: "fabric",
    forge: "forge",
    optifine: "optifine",
    modpack: "modpack",
    custom: "custom",
    local: "local",
  };
  return map[version.type] || version.type || "release";
}

function versionDisplayName(version) {
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
  const parts = [versionLabel(version)];
  if (version.modpackVersionNumber) parts.push(`pack ${version.modpackVersionNumber}`);
  if (version.minecraftVersion) parts.push(`MC ${version.minecraftVersion}`);
  if (version.loaderType && version.loaderType !== "vanilla") {
    parts.push(
      version.loaderVersion
        ? `${version.loaderType} ${version.loaderVersion}`
        : version.loaderType
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
    if (numericComparison !== 0) return numericComparison;
  } else if (leftParts || rightParts) {
    return leftParts ? -1 : 1;
  }

  const idComparison = leftSource.localeCompare(rightSource, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (idComparison !== 0) return idComparison;

  return String(left.id || "").localeCompare(String(right.id || ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function filteredVersions() {
  const query = elements.versionSearch.value.trim().toLowerCase();
  const filter = elements.versionFilter.value;
  return state.versions
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
    .slice(0, 260);
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
        <small>${
          version.modpackTitle && version.modpackTitle !== version.id
            ? escapeHtml(version.id)
            : formatDate(version.releaseTime)
        }</small>
      </span>
      <span class="tag-row">
        <span class="tag ${version.type}">${escapeHtml(versionLabel(version))}</span>
        ${version.local ? '<span class="tag local">local</span>' : ""}
        ${version.installed ? '<span class="tag installed">instalada</span>' : ""}
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
        <small>${escapeHtml(
          [
            version.modpackVersionNumber ? `Pack ${version.modpackVersionNumber}` : "",
            version.minecraftVersion ? `MC ${version.minecraftVersion}` : "",
            version.id,
          ]
            .filter(Boolean)
            .join(" - ")
        )}</small>
      </span>
      <span class="tag-row">
        <span class="tag modpack">modpack</span>
        ${version.installed ? '<span class="tag installed">instalada</span>' : ""}
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

    const gameVersions = (modpack.gameVersions || []).slice(0, 3).join(", ");
    const categories = (modpack.categories || []).slice(0, 4);
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
        <small>${escapeHtml(modpack.author ? `por ${modpack.author}` : modpack.slug)}</small>
        <p>${escapeHtml(modpack.description || "Sem descricao.")}</p>
        <div class="tag-row modpack-tags">
          ${gameVersions ? `<span class="tag release">${escapeHtml(gameVersions)}</span>` : ""}
          ${categories.map((category) => `<span class="tag local">${escapeHtml(category)}</span>`).join("")}
        </div>
      </div>
      <div class="modpack-actions"></div>
    `;

    const actions = card.querySelector(".modpack-actions");
    actions.appendChild(button);

    const stats = document.createElement("small");
    stats.textContent = `${formatCompactNumber(modpack.downloads)} downloads`;
    actions.appendChild(stats);

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
  if (!event.silent) appendLog(event.type, event.message);

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
    if (elements.accountsModal) elements.accountsModal.classList.add("hidden");
    await refreshState();
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    setBusy(false);
  }
});

if (elements.addLocalAccountBtn) {
  elements.addLocalAccountBtn.addEventListener("click", () => {
    if (elements.accountsModal) elements.accountsModal.classList.add("hidden");
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
    elements.accountsModal.classList.remove("hidden");
    renderAccountsModal();
  });
}

if (elements.closeAccountsModal) {
  elements.closeAccountsModal.addEventListener("click", () => elements.accountsModal.classList.add("hidden"));
}
if (elements.cancelAccountsModal) {
  elements.cancelAccountsModal.addEventListener("click", () => elements.accountsModal.classList.add("hidden"));
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
