const { app, BrowserWindow, ipcMain, shell } = require("electron");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("minecraft-launcher-core");
const { Auth } = require("msmc");

const VERSION_MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

let mainWindow;
let busy = false;
let activeProcess = null;
let activeIdleGuard = null;

class InstallOnlyClient extends Client {
  startMinecraft() {
    this.installSucceeded = true;
    this.emit("debug", "[Nexus]: Instalacao concluida. O jogo nao sera aberto.");
    setImmediate(() => this.emit("close", 0));
    return null;
  }
}

function userDataPath(...segments) {
  return path.join(app.getPath("userData"), ...segments);
}

function accountPath() {
  return userDataPath("account.json");
}

function settingsPath() {
  return userDataPath("settings.json");
}

function versionsCachePath() {
  return userDataPath("cache", "version_manifest_v2.json");
}

function minecraftRoot() {
  return path.join(app.getPath("appData"), ".minecraft");
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[Nexus]: Failed to read ${filePath}`, error);
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureParent(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function defaultSettings() {
  return {
    maxMemory: "4G",
    minMemory: "1G",
    javaPath: "",
    windowWidth: 1280,
    windowHeight: 720,
    showSnapshots: true,
    versionFilter: "installed",
    schemaVersion: 2,
  };
}

function loadSettings() {
  const loaded = readJson(settingsPath(), {});
  const settings = { ...defaultSettings(), ...loaded };
  if (loaded.schemaVersion !== 2 && loaded.versionFilter === "release") {
    settings.versionFilter = "installed";
  }
  if (!["installed", "release", "snapshot", "all"].includes(settings.versionFilter)) {
    settings.versionFilter = "installed";
  }
  return settings;
}

function saveSettings(input) {
  const safe = {
    ...loadSettings(),
    maxMemory: normalizeMemory(input.maxMemory, "4G"),
    minMemory: normalizeMemory(input.minMemory, "1G"),
    javaPath: typeof input.javaPath === "string" ? input.javaPath.trim() : "",
    windowWidth: clampNumber(input.windowWidth, 854, 3840, 1280),
    windowHeight: clampNumber(input.windowHeight, 480, 2160, 720),
    showSnapshots: Boolean(input.showSnapshots),
    schemaVersion: 2,
    versionFilter: ["installed", "release", "snapshot", "all"].includes(
      input.versionFilter
    )
      ? input.versionFilter
      : "installed",
  };
  writeJson(settingsPath(), safe);
  return safe;
}

function normalizeMemory(value, fallback) {
  const text = String(value || "").trim().toUpperCase();
  if (/^\d+G$/.test(text)) return text;
  if (/^\d+M$/.test(text)) return text;
  if (/^\d+$/.test(text)) return `${text}G`;
  return fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function publicAccount(account = loadAccount()) {
  if (!account || !account.profile) return null;
  return {
    name: account.profile.name,
    id: account.profile.id,
    xuid: account.xuid || null,
    updatedAt: account.updatedAt || null,
    demo: Boolean(account.profile.demo),
  };
}

function loadAccount() {
  return readJson(accountPath(), null);
}

function saveAccount(refreshToken, minecraftSession) {
  const account = {
    refreshToken,
    profile: {
      id: minecraftSession.profile.id,
      name: minecraftSession.profile.name,
      demo: Boolean(minecraftSession.profile.demo),
    },
    xuid: minecraftSession.xuid || null,
    updatedAt: new Date().toISOString(),
  };
  writeJson(accountPath(), account);
  return account;
}

function deleteAccount() {
  if (fs.existsSync(accountPath())) fs.unlinkSync(accountPath());
}

function redactSecrets(input) {
  return String(input)
    .replace(/(--accessToken\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(--clientId\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(access_token["':=\s]+)[^"',\s]+/gi, "$1[redacted]")
    .replace(/(refresh_token["':=\s]+)[^"',\s]+/gi, "$1[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]");
}

function sendEvent(type, message, extra = {}) {
  if (activeIdleGuard) activeIdleGuard.touch();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("launcher:event", {
    type,
    message: redactSecrets(message),
    at: new Date().toISOString(),
    ...extra,
  });
}

function createIdleGuard(timeoutMs, message) {
  let lastActivity = Date.now();
  let timer = null;

  const guard = {
    touch() {
      lastActivity = Date.now();
    },
    promise: new Promise((resolve, reject) => {
      timer = setInterval(() => {
        if (Date.now() - lastActivity >= timeoutMs) {
          reject(new Error(message));
        }
      }, 10000);
    }),
    stop() {
      if (timer) clearInterval(timer);
    },
  };

  return guard;
}

function translateAuthCode(code) {
  const map = {
    "load.auth.microsoft": "Validando token Microsoft...",
    "load.auth.xboxLive.1": "Autenticando no Xbox Live...",
    "load.auth.xsts": "Obtendo XSTS...",
    "load.auth.minecraft.login": "Entrando no Minecraft Services...",
    "load.auth.minecraft.profile": "Carregando perfil Java...",
    "load.auth.minecraft.gamepass": "Conferindo licenca Game Pass/Minecraft...",
  };
  return map[code] || code;
}

function attachAuthEvents(auth) {
  auth.on("load", (code) => sendEvent("auth", translateAuthCode(code)));
}

async function addMicrosoftAccount() {
  const auth = new Auth("select_account");
  attachAuthEvents(auth);

  const xbox = await auth.launch("electron", {
    width: 520,
    height: 700,
    resizable: false,
    title: "Entrar com Microsoft",
    parent: mainWindow,
    modal: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const minecraft = await xbox.getMinecraft();
  if (minecraft.isDemo()) {
    throw new Error(
      "Esta conta nao parece ter Minecraft Java Edition ativo. Entre com uma conta que possua o jogo ou Game Pass valido."
    );
  }

  const account = saveAccount(xbox.save(), minecraft);
  sendEvent("success", `Conta vinculada: ${account.profile.name}`);
  return publicAccount(account);
}

async function getMinecraftSession() {
  const account = loadAccount();
  if (!account || !account.refreshToken) {
    throw new Error("Vincule uma conta Microsoft/Minecraft antes de continuar.");
  }

  const auth = new Auth("none");
  attachAuthEvents(auth);

  const xbox = await auth.refresh(account.refreshToken);
  const minecraft = await xbox.getMinecraft();
  if (minecraft.isDemo()) {
    throw new Error("A conta vinculada nao possui acesso completo ao Minecraft Java.");
  }

  saveAccount(xbox.save(), minecraft);
  return minecraft;
}

function isVersionInstalled(id) {
  const folder = path.join(minecraftRoot(), "versions", id);
  return (
    fs.existsSync(path.join(folder, `${id}.json`)) &&
    fs.existsSync(path.join(folder, `${id}.jar`))
  );
}

function getLocalVersionJsonPath(id) {
  return path.join(minecraftRoot(), "versions", id, `${id}.json`);
}

function getLocalVersionJarPath(id) {
  return path.join(minecraftRoot(), "versions", id, `${id}.jar`);
}

function localVersionFromDirectory(entry) {
  if (!entry.isDirectory()) return null;

  const id = entry.name;
  const versionJsonPath = getLocalVersionJsonPath(id);
  const versionJarPath = getLocalVersionJarPath(id);
  const versionJson = readJson(versionJsonPath, null);

  if (!versionJson && !fs.existsSync(versionJarPath)) return null;

  const stats = fs.statSync(path.join(minecraftRoot(), "versions", id));
  return {
    id,
    type: versionJson?.type || (versionJson?.inheritsFrom ? "custom" : "local"),
    url: null,
    time: versionJson?.time || stats.mtime.toISOString(),
    releaseTime: versionJson?.releaseTime || stats.mtime.toISOString(),
    complianceLevel: versionJson?.complianceLevel ?? null,
    installed: true,
    local: true,
    inheritsFrom: versionJson?.inheritsFrom || null,
  };
}

function loadLocalVersions() {
  const versionsDir = path.join(minecraftRoot(), "versions");
  if (!fs.existsSync(versionsDir)) return [];

  return fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .map(localVersionFromDirectory)
    .filter(Boolean);
}

function sortVersions(versions) {
  return versions.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? -1 : 1;
    return new Date(b.releaseTime || b.time || 0) - new Date(a.releaseTime || a.time || 0);
  });
}

function normalizeManifest(manifest) {
  const merged = new Map();

  for (const version of manifest.versions) {
    merged.set(version.id, {
      id: version.id,
      type: version.type,
      url: version.url,
      time: version.time,
      releaseTime: version.releaseTime,
      complianceLevel: version.complianceLevel ?? null,
      installed: isVersionInstalled(version.id),
      local: false,
      inheritsFrom: null,
    });
  }

  for (const localVersion of loadLocalVersions()) {
    const existing = merged.get(localVersion.id);
    merged.set(localVersion.id, {
      ...localVersion,
      ...existing,
      installed: true,
      local: true,
      type:
        existing?.type ||
        localVersion.type ||
        (localVersion.inheritsFrom ? "custom" : "local"),
      releaseTime: existing?.releaseTime || localVersion.releaseTime,
      time: existing?.time || localVersion.time,
    });
  }

  return {
    latest: manifest.latest,
    versions: sortVersions(Array.from(merged.values())),
  };
}

async function loadVersions(force = false) {
  const cachePath = versionsCachePath();
  if (!force) {
    const cached = readJson(cachePath, null);
    if (cached) return normalizeManifest(cached);
  }

  try {
    const response = await fetch(VERSION_MANIFEST_URL, {
      headers: { "User-Agent": "NexusMCLauncher/0.1" },
    });
    if (!response.ok) {
      throw new Error(`Manifest HTTP ${response.status}`);
    }
    const manifest = await response.json();
    writeJson(cachePath, manifest);
    return normalizeManifest(manifest);
  } catch (error) {
    const cached = readJson(cachePath, null);
    if (cached) {
      sendEvent("warning", "Falha ao atualizar versoes; usando cache local.");
      return normalizeManifest(cached);
    }
    throw error;
  }
}

async function resolveVersionMeta(version) {
  if (version && version.url) return version;

  const manifest = await loadVersions(false);
  const found = manifest.versions.find((item) => item.id === version.id && item.url);
  if (!found) throw new Error(`Versao ${version.id} nao encontrada no manifesto.`);
  return found;
}

async function resolveOfficialVersionMeta(id) {
  const manifest = await loadVersions(false);
  const found = manifest.versions.find((item) => item.id === id && item.url);
  if (!found) throw new Error(`Versao base ${id} nao encontrada no manifesto.`);
  return found;
}

async function ensureVersionJson(version) {
  const versionDir = path.join(minecraftRoot(), "versions", version.id);
  const versionJsonPath = path.join(versionDir, `${version.id}.json`);
  const existing = readJson(versionJsonPath, null);

  if (existing && existing.id === version.id && existing.downloads?.client?.url) {
    return existing;
  }

  const meta = await resolveVersionMeta(version);
  if (!meta.url) throw new Error(`Manifesto da versao ${version.id} sem URL.`);

  sendEvent("install", `Baixando manifesto da versao ${version.id}...`);
  const response = await fetch(meta.url, {
    headers: { "User-Agent": "NexusMCLauncher/0.1" },
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar manifesto ${version.id}: HTTP ${response.status}`);
  }

  const versionJson = await response.json();
  fs.mkdirSync(versionDir, { recursive: true });
  writeJson(versionJsonPath, versionJson);
  return versionJson;
}

function sha1File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function downloadFile(url, destination, type, label) {
  ensureParent(destination);
  const tempPath = `${destination}.part`;
  const controller = new AbortController();
  let idleTimer = null;
  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), 120000);
  };

  resetIdleTimer();
  let writer = null;

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "NexusMCLauncher/0.1" },
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`${label}: download falhou com HTTP ${response.status}`);
    }

    const total = Number(response.headers.get("content-length")) || 0;
    let current = 0;
    let lastEmit = 0;
    writer = fs.createWriteStream(tempPath);
    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = Buffer.from(value);
      current += chunk.length;
      resetIdleTimer();
      if (!writer.write(chunk)) {
        await new Promise((resolve) => writer.once("drain", resolve));
      }

      const now = Date.now();
      if (now - lastEmit > 250 || current === total) {
        lastEmit = now;
        const percent = total ? Math.round((current / total) * 100) : 0;
        sendEvent("download-status", `${label}: ${percent}%`, {
          silent: true,
          status: { type, current, total },
        });
      }
    }

    await new Promise((resolve, reject) => {
      writer.once("finish", resolve);
      writer.once("error", reject);
      writer.end();
    });

    fs.renameSync(tempPath, destination);
  } catch (error) {
    if (writer) writer.destroy();
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    if (error.name === "AbortError") {
      throw new Error(`${label}: download sem progresso por 2 minutos.`);
    }
    throw error;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
  }
}

async function ensureClientJar(version, versionJson) {
  const download = versionJson.downloads?.client;
  if (!download?.url) {
    throw new Error(`A versao ${version.id} nao possui download de cliente.`);
  }

  const jarPath = path.join(
    minecraftRoot(),
    "versions",
    version.id,
    `${version.id}.jar`
  );

  if (fs.existsSync(jarPath) && download.sha1) {
    const hash = await sha1File(jarPath);
    if (hash === download.sha1) return;

    sendEvent(
      "warning",
      `Arquivo ${version.id}.jar incompleto ou invalido. Baixando novamente...`
    );
    fs.unlinkSync(jarPath);
  } else if (fs.existsSync(jarPath)) {
    return;
  }

  sendEvent("install", `Baixando cliente ${version.id}...`);
  await downloadFile(download.url, jarPath, "version-jar", "Cliente Minecraft");

  if (download.sha1) {
    const hash = await sha1File(jarPath);
    if (hash !== download.sha1) {
      fs.unlinkSync(jarPath);
      throw new Error(`Falha de integridade no cliente ${version.id}.`);
    }
  }
}

async function ensureVersionFiles(version) {
  const localJson = readJson(getLocalVersionJsonPath(version.id), null);
  const localJarPath = getLocalVersionJarPath(version.id);

  if (version.local || localJson) {
    if (!localJson) {
      if (fs.existsSync(localJarPath)) {
        return {
          ...version,
          launchNumber: version.id,
          custom: null,
          type: version.type || "local",
        };
      }
      throw new Error(`Versao local ${version.id} sem JSON valido.`);
    }

    const baseId = localJson.inheritsFrom || null;
    if (baseId) {
      const baseMeta = await resolveOfficialVersionMeta(baseId);
      const baseJson = await ensureVersionJson(baseMeta);
      await ensureClientJar(baseMeta, baseJson);

      return {
        ...version,
        type: version.type || localJson.type || "custom",
        launchNumber: baseId,
        custom: version.id,
        inheritsFrom: baseId,
      };
    }

    if (localJson.downloads?.client?.url) {
      await ensureClientJar({ ...version, id: version.id }, localJson);
      return {
        ...version,
        type: version.type || localJson.type || "local",
        launchNumber: version.id,
        custom: null,
      };
    }

    if (fs.existsSync(localJarPath)) {
      return {
        ...version,
        type: version.type || localJson.type || "local",
        launchNumber: version.id,
        custom: null,
      };
    }

    throw new Error(
      `Versao local ${version.id} nao tem JAR nem versao base herdada.`
    );
  }

  const meta = await resolveVersionMeta(version);
  const versionJson = await ensureVersionJson(meta);
  await ensureClientJar(meta, versionJson);
  return {
    ...meta,
    type: meta.type || versionJson.type || "release",
    launchNumber: meta.id,
    custom: null,
  };
}

function launcherOptions(version, minecraftSession, settings) {
  const selectedType = version.type || "release";
  const launchNumber = version.launchNumber || version.inheritsFrom || version.id;
  return {
    clientPackage: null,
    authorization: minecraftSession.mclc(),
    root: minecraftRoot(),
    version: {
      number: launchNumber,
      type: selectedType,
      custom: version.custom || undefined,
    },
    memory: {
      max: normalizeMemory(settings.maxMemory, "4G"),
      min: normalizeMemory(settings.minMemory, "1G"),
    },
    javaPath: settings.javaPath || undefined,
    window: {
      width: clampNumber(settings.windowWidth, 854, 3840, 1280),
      height: clampNumber(settings.windowHeight, 480, 2160, 720),
      fullscreen: false,
    },
    overrides: {
      detached: false,
      maxSockets: 8,
      url: {
        meta: "https://piston-meta.mojang.com",
        resource: "https://resources.download.minecraft.net",
      },
    },
    cache: userDataPath("cache"),
    timeout: 120000,
  };
}

function readableStage(type) {
  const map = {
    "version-jar": "Cliente",
    "asset-json": "Indice de assets",
    assets: "Assets",
    "assets-copy": "Assets legados",
    classes: "Bibliotecas",
    "classes-custom": "Bibliotecas",
    "classes-maven-custom": "Bibliotecas Maven",
    natives: "Natives",
    log4j: "Log4j",
    "client-package": "Pacote",
  };
  return map[type] || type || "Download";
}

function wireLauncher(client) {
  const lastStatus = new Map();

  client.on("debug", (message) => sendEvent("debug", message));
  client.on("data", (message) => sendEvent("game", message));
  client.on("download", (name) =>
    sendEvent("download", `Baixado: ${name}`, { silent: true })
  );
  client.on("progress", (progress) => {
    const total = progress.total || 0;
    const percent = total ? Math.round((progress.task / total) * 100) : 0;
    const silent = progress.task !== 0 && progress.task !== total;
    sendEvent(
      "progress",
      `${readableStage(progress.type)}: ${progress.task}/${progress.total}`,
      { progress, silent, percent }
    );
  });
  client.on("download-status", (status) => {
    const visibleTypes = new Set([
      "version-jar",
      "asset-json",
      "log4j",
      "client-package",
    ]);
    if (!visibleTypes.has(status.type)) return;

    const total = status.total || 0;
    const percent = total ? Math.round((status.current / total) * 100) : 0;
    const now = Date.now();
    const last = lastStatus.get(status.type) || { at: 0, percent: -1 };
    if (now - last.at < 250 && percent !== 100 && percent === last.percent) return;

    lastStatus.set(status.type, { at: now, percent });
    sendEvent("download-status", `${readableStage(status.type)}: ${percent}%`, {
      status,
      silent: true,
    });
  });
  client.on("close", (code) => {
    sendEvent("close", `Minecraft finalizado com codigo ${code}.`, { code });
    busy = false;
    activeProcess = null;
  });
}

async function runMinecraft(mode, input) {
  if (busy) throw new Error("Ja existe uma instalacao ou jogo em andamento.");
  if (!input || !input.version || !input.version.id) {
    throw new Error("Selecione uma versao do Minecraft.");
  }

  busy = true;
  sendEvent(
    mode === "install" ? "install" : "launch",
    mode === "install"
      ? `Instalando ${input.version.id}...`
      : `Abrindo ${input.version.id}...`
  );

  try {
    const settings = saveSettings(input.settings || {});
    const minecraft = await getMinecraftSession();
    const preparedVersion = await ensureVersionFiles(input.version);
    const client = mode === "install" ? new InstallOnlyClient() : new Client();
    wireLauncher(client);

    const idleGuard = createIdleGuard(
      180000,
      "Download sem progresso por 3 minutos. Verifique a internet e tente novamente."
    );
    activeIdleGuard = idleGuard;

    activeProcess = await Promise.race([
      client.launch(launcherOptions(preparedVersion, minecraft, settings)),
      idleGuard.promise,
    ]);
    idleGuard.stop();
    activeIdleGuard = null;

    if (mode === "install" && !client.installSucceeded) {
      busy = false;
      throw new Error("A instalacao nao foi concluida. Veja o log para detalhes.");
    }

    if (!activeProcess && mode !== "install") {
      busy = false;
      throw new Error("O Minecraft nao iniciou. Veja o log para detalhes.");
    }

    sendEvent(
      "success",
      mode === "install"
        ? `${preparedVersion.id} instalada.`
        : `${preparedVersion.id} iniciado.`
    );

    if (mode === "install") {
      await loadVersions(true).catch(() => null);
    }

    return { ok: true };
  } catch (error) {
    if (activeIdleGuard) {
      activeIdleGuard.stop();
      activeIdleGuard = null;
    }
    busy = false;
    activeProcess = null;
    sendEvent("error", error.message || String(error));
    throw error;
  }
}

async function getState() {
  const [versions, settings] = await Promise.all([
    loadVersions(false),
    Promise.resolve(loadSettings()),
  ]);
  return {
    account: publicAccount(),
    versions,
    settings,
    paths: {
      data: app.getPath("userData"),
      minecraft: minecraftRoot(),
    },
    busy,
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 650,
    title: "Nexus MC Launcher",
    autoHideMenuBar: true,
    backgroundColor: "#171918",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("state:get", () => getState());
  ipcMain.handle("versions:refresh", () => loadVersions(true));
  ipcMain.handle("account:add", () => addMicrosoftAccount());
  ipcMain.handle("account:remove", () => {
    deleteAccount();
    sendEvent("success", "Conta removida.");
    return null;
  });
  ipcMain.handle("settings:save", (_event, settings) => saveSettings(settings));
  ipcMain.handle("minecraft:install", (_event, payload) =>
    runMinecraft("install", payload)
  );
  ipcMain.handle("minecraft:launch", (_event, payload) =>
    runMinecraft("launch", payload)
  );
  ipcMain.handle("paths:openMinecraft", async () => {
    fs.mkdirSync(minecraftRoot(), { recursive: true });
    return shell.openPath(minecraftRoot());
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (activeProcess && !activeProcess.killed) {
    activeProcess.kill();
  }
});
