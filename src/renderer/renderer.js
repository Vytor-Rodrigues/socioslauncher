const api = window.launcherApi;

const state = {
  versions: [],
  latest: null,
  selected: null,
  account: null,
  settings: null,
  busy: false,
};

const elements = {
  accountStatus: document.querySelector("#account-status"),
  accountView: document.querySelector("#account-view"),
  addAccount: document.querySelector("#add-account"),
  removeAccount: document.querySelector("#remove-account"),
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
    elements.removeAccount,
    elements.refreshVersions,
    elements.installVersion,
    elements.launchVersion,
  ].forEach((button) => {
    button.disabled = value;
  });
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
        <small>Microsoft/Minecraft</small>
      </div>
    `;
    elements.removeAccount.disabled = true || state.busy;
    return;
  }

  elements.accountStatus.textContent = "Online";
  elements.accountStatus.classList.add("online");
  elements.accountView.innerHTML = `
    <div class="avatar">${state.account.name.slice(0, 1).toUpperCase()}</div>
    <div>
      <strong>${escapeHtml(state.account.name)}</strong>
      <small>${escapeHtml(state.account.id)}</small>
    </div>
  `;
  elements.removeAccount.disabled = state.busy;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
        <span class="tag ${version.type}">${escapeHtml(version.type)}</span>
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
    return;
  }

  elements.selectedVersion.textContent = state.selected.id;
  elements.selectedMeta.textContent = `${state.selected.type} - ${formatDate(
    state.selected.releaseTime
  )}${state.selected.local ? " - local" : ""}${
    state.selected.installed ? " - instalada" : ""
  }`;
}

function renderLatest() {
  if (!state.latest) {
    elements.latestLine.textContent = "Manifesto nao carregado";
    return;
  }
  elements.latestLine.textContent = `Latest release ${state.latest.release} / snapshot ${state.latest.snapshot}`;
}

function setProgress(label, percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  elements.progressLabel.textContent = label;
  elements.progressPercent.textContent = `${safePercent}%`;
  elements.progressBar.style.width = `${safePercent}%`;
}

function handleLauncherEvent(event) {
  if (!event.silent) appendLog(event.type, event.message);

  if (event.type === "install" || event.type === "launch") {
    setBusy(true);
    setProgress(event.message, 0);
  }

  if (event.type === "progress" && event.progress) {
    const { task, total, type } = event.progress;
    const percent = total ? Math.round((task / total) * 100) : 0;
    setProgress(type, percent);
  }

  if (event.type === "download-status" && event.status) {
    const { current, total, type } = event.status;
    const percent = total ? Math.round((current / total) * 100) : 0;
    setProgress(type || "Download", percent);
  }

  if (event.type === "close" || event.type === "error") {
    setBusy(false);
    if (event.type === "close") setProgress("Concluido", 100);
  }
}

async function refreshState(forceVersions = false) {
  try {
    setBusy(true);
    const data = await api.getState();
    const manifest = forceVersions ? await api.refreshVersions() : data.versions;
    state.account = data.account;
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
    setProgress("Aguardando", 0);
  } catch (error) {
    appendLog("error", error.message || String(error));
  } finally {
    setBusy(false);
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
    appendLog("error", "Adicione uma conta Microsoft/Minecraft.");
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
