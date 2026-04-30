const api = window.launcherApi;

const state = {
  versions: [],
  latest: null,
  selected: null,
  account: null,
  settings: null,
  busy: false,
  progressMode: "idle",
  progressValue: 0,
  progressResetTimer: null,
};

const elements = {
  accountStatus: document.querySelector("#account-status"),
  accountView: document.querySelector("#account-view"),
  addAccount: document.querySelector("#add-account"),
  addLocalAccount: document.querySelector("#add-local-account"),
  removeAccount: document.querySelector("#remove-account"),
  localAccountModal: document.querySelector("#local-account-modal"),
  closeLocalAccountModal: document.querySelector("#close-local-account-modal"),
  cancelLocalAccount: document.querySelector("#cancel-local-account"),
  confirmLocalAccount: document.querySelector("#confirm-local-account"),
  localAccountUsername: document.querySelector("#local-account-username"),
  localAccountHint: document.querySelector("#local-account-hint"),
  minMemory: document.querySelector("#min-memory"),
  maxMemory: document.querySelector("#max-memory"),
  javaPath: document.querySelector("#java-path"),
  windowWidth: document.querySelector("#window-width"),
  windowHeight: document.querySelector("#window-height"),
  openFolder: document.querySelector("#open-folder"),
  latestLine: document.querySelector("#latest-line"),
  versionFilter: document.querySelector("#version-filter"),
  refreshVersions: document.querySelector("#refresh-versions"),
  versionSearch: document.querySelector("#version-search"),
  versionList: document.querySelector("#version-list"),
  selectedVersion: document.querySelector("#selected-version"),
  selectedMeta: document.querySelector("#selected-meta"),
  installVersion: document.querySelector("#install-version"),
  launchVersion: document.querySelector("#launch-version"),
  progressBox: document.querySelector("#progress-box"),
  progressLabel: document.querySelector("#progress-label"),
  progressPercent: document.querySelector("#progress-percent"),
  progressBar: document.querySelector("#progress-bar"),
  minecraftPath: document.querySelector("#minecraft-path"),
  clearLog: document.querySelector("#clear-log"),
  logOutput: document.querySelector("#log-output"),
  java8Path: document.querySelector("#java8-path"),
  logSize: document.querySelector("#log-size"),
};

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function appendLog(type, message) {
  const prefix = type ? `[${type}]` : "[log]";
  const line = `${new Date().toLocaleTimeString("pt-BR")} ${prefix} ${message}`;
  elements.logOutput.textContent +=
    elements.logOutput.textContent.length > 0 ? `\n${line}` : line;
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
}

function setBusy(value) {
  state.busy = value;
  [
    elements.addAccount,
    elements.addLocalAccount,
    elements.removeAccount,
    elements.refreshVersions,
    elements.installVersion,
    elements.launchVersion,
  ].forEach((button) => {
    button.disabled = value;
  });

  if (elements.confirmLocalAccount) {
    elements.confirmLocalAccount.disabled = value;
  }

  syncActionButtons();
}

function canInstallSelectedVersion() {
  return Boolean(state.selected && !state.selected.local && !state.selected.installed);
}

function syncActionButtons() {
  const hasSelection = Boolean(state.selected);

  elements.installVersion.hidden = !canInstallSelectedVersion();
  elements.installVersion.disabled = state.busy || !canInstallSelectedVersion();
  elements.launchVersion.disabled = state.busy || !hasSelection;
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
    renderAccount();
  } catch (error) {
    appendLog("error", error.message || String(error));
    elements.localAccountHint.textContent = error.message || String(error);
    elements.localAccountHint.classList.add("error");
  } finally {
    setBusy(false);
    updateLocalAccountHint();
    renderAccount();
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
  if (!state.account) {
    elements.accountStatus.textContent = "Offline";
    elements.accountStatus.classList.remove("online");
    elements.accountView.innerHTML = `
      <div class="avatar">?</div>
      <div>
        <strong>Nenhuma conta</strong>
        <small>Microsoft ou local</small>
      </div>
    `;
    elements.removeAccount.disabled = true || state.busy;
    return;
  }

  const isLocal = state.account.type === "local";
  elements.accountStatus.textContent = isLocal ? "Local" : "Online";
  elements.accountStatus.classList.add("online");
  elements.accountView.innerHTML = `
    <div class="avatar">${state.account.name.slice(0, 1).toUpperCase()}</div>
    <div>
      <strong>${escapeHtml(state.account.name)}</strong>
      <small>${isLocal ? "Conta local" : "Microsoft/Minecraft"}</small>
    </div>
  `;
  elements.removeAccount.disabled = state.busy;
}

function versionLabel(version) {
  const map = {
    release: "release",
    snapshot: "snapshot",
    fabric: "fabric",
    forge: "forge",
    optifine: "optifine",
    custom: "custom",
    local: "local",
  };
  return map[version.type] || version.type || "release";
}

function versionDescription(version) {
  const parts = [versionLabel(version)];
  if (version.minecraftVersion) parts.push(`MC ${version.minecraftVersion}`);
  if (version.loaderVersion) parts.push(version.loaderVersion);
  if (version.releaseTime) parts.push(formatDate(version.releaseTime));
  if (version.local) parts.push("local");
  if (version.installed) parts.push("instalada");
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
    .filter((version) => {
      if (filter === "all") return true;
      if (filter === "installed") return version.installed || version.local;
      return version.type === filter;
    })
    .filter((version) => !query || version.id.toLowerCase().includes(query))
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
        <strong>${escapeHtml(version.id)}</strong>
        <small>${formatDate(version.releaseTime)}</small>
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

function renderSelected() {
  if (!state.selected) {
    elements.selectedVersion.textContent = "-";
    elements.selectedMeta.textContent = "Escolha uma versao";
    syncActionButtons();
    return;
  }

  elements.selectedVersion.textContent = state.selected.id;
  elements.selectedMeta.textContent = versionDescription(state.selected);
  syncActionButtons();
}

function renderLatest() {
  if (!state.latest) {
    elements.latestLine.textContent = "Manifesto nao carregado";
    return;
  }
  elements.latestLine.textContent = `Latest release ${state.latest.release} / snapshot ${state.latest.snapshot}`;
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
  elements.progressBox.classList.remove("idle");
  elements.progressLabel.textContent = label;
  elements.progressPercent.textContent = `${safePercent}%`;
  elements.progressBar.style.width = `${safePercent}%`;
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

function handleLauncherEvent(event) {
  if (!event.silent) appendLog(event.type, event.message);

  if (event.type === "install") {
    setBusy(true);
    setProgress(event.message, 0, "install");
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

  if (event.type === "download-status" && event.status) {
    const { current, total, type } = event.status;
    const percent = total ? Math.round((current / total) * 100) : 0;
    setProgress(type || "Download", progressFromStage(type, percent, state.progressMode), state.progressMode);
  }

  if (event.type === "debug") {
    handleLaunchDebugProgress(event.message);
  }

  if (event.type === "success") {
    if (state.progressMode === "launch") {
      setProgress("Jogo iniciado", 100, "launch");
      scheduleProgressClear(1200);
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
    scheduleProgressClear();
  }
}

async function refreshState(forceVersions = false) {
  try {
    setBusy(true);
    const data = await api.getState();
    const manifest = forceVersions ? await api.refreshVersions() : data.versions;
    state.account = data.account;
    state.busy = Boolean(data.busy);
    state.versions = manifest.versions;
    state.latest = manifest.latest;
    applySettings(data.settings);
    elements.minecraftPath.textContent = data.paths.minecraft;
    state.selected =
      state.versions.find((version) => version.id === state.latest.release) ||
      state.versions[0] ||
      null;
    renderAccount();
    renderLatest();
    renderSelected();
    renderVersions();
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

elements.addAccount.addEventListener("click", async () => {
  setBusy(true);
  try {
    state.account = await api.addAccount();
    renderAccount();
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    setBusy(false);
    renderAccount();
  }
});

elements.addLocalAccount.addEventListener("click", openLocalAccountModal);
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

document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !elements.localAccountModal.classList.contains("hidden")
  ) {
    closeLocalAccountModal();
  }
});

elements.removeAccount.addEventListener("click", async () => {
  setBusy(true);
  try {
    await api.removeAccount();
    state.account = null;
    renderAccount();
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    setBusy(false);
    renderAccount();
  }
});

elements.refreshVersions.addEventListener("click", async () => {
  try {
    setBusy(true);
    const data = await api.refreshVersions();
    state.versions = data.versions;
    state.latest = data.latest;
    renderLatest();
    renderVersions();
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
  renderVersions();
});

elements.versionSearch.addEventListener("input", renderVersions);
elements.installVersion.addEventListener("click", () => runAction("install"));
elements.launchVersion.addEventListener("click", () => runAction("launch"));
elements.openFolder.addEventListener("click", () => api.openMinecraftFolder());
elements.clearLog.addEventListener("click", () => {
  elements.logOutput.textContent = "";
});

elements.logSize.addEventListener("change", saveSettingsQuietly);
elements.java8Path.addEventListener("change", saveSettingsQuietly);

[
  elements.minMemory,
  elements.maxMemory,
  elements.javaPath,
  elements.windowWidth,
  elements.windowHeight,
].forEach((input) => {
  input.addEventListener("change", saveSettingsQuietly);
});

api.onEvent(handleLauncherEvent);
refreshState();
