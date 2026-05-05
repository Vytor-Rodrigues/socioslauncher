const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const AdmZip = require("adm-zip");
const { Client } = require("minecraft-launcher-core");
const { Auth } = require("msmc");

const VERSION_MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const FABRIC_META_ROOT = "https://meta.fabricmc.net/v2/versions/loader";
const BMCL_API_ROOT = "https://bmclapi2.bangbang93.com";
const MODRINTH_API_ROOT = "https://api.modrinth.com/v2";
const LAUNCHER_NAME = "Socios Client";
const LAUNCHER_VERSION = "0.1.0";
const HTTP_USER_AGENT = `${LAUNCHER_NAME}/${LAUNCHER_VERSION}`;
const SETTINGS_SCHEMA_VERSION = 3;
const REMOTE_GAME_VERSION_LIMIT = 36;

let mainWindow;
let logWindow = null;
const logHistory = [];
let busy = false;
let activeProcess = null;
let activeIdleGuard = null;
let activeLaunchContext = null;
let globalDownloadTracker = null;

class InstallOnlyClient extends Client {
  startMinecraft() {
    this.installSucceeded = true;
    this.emit("debug", "[Socios Client]: Instalacao concluida. O jogo nao sera aberto.");
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

function remoteCatalogCachePath(name) {
  return userDataPath("cache", "remote-catalogs", `${name}.json`);
}

function installerCachePath(loader, id, fileName) {
  return userDataPath("cache", "installers", loader, id, fileName);
}

function modpackArchiveCachePath(projectId, versionId, fileName) {
  return userDataPath(
    "cache",
    "modpacks",
    sanitizeFileName(projectId),
    sanitizeFileName(versionId),
    sanitizeFileName(fileName || `${versionId}.mrpack`)
  );
}

function launchJsonPath(id) {
  const hash = crypto.createHash("sha1").update(id).digest("hex");
  return userDataPath("cache", "launch-json", `${hash}.json`);
}

function minecraftRoot() {
  return path.join(app.getPath("appData"), ".minecraft");
}

function versionDirectory(id) {
  return path.join(minecraftRoot(), "versions", id);
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.warn(`[Socios Client]: Failed to read ${filePath}`, error);
    return fallback;
  }
}

function writeJson(filePath, value) {
  ensureParent(filePath);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultSettings() {
  return {
    maxMemory: "4G",
    minMemory: "1G",
    logFontSize: 12,
    javaPath: "",
    java8Path: "",
    windowWidth: 1280,
    windowHeight: 720,
    showSnapshots: true,
    versionFilter: "all",
    schemaVersion: SETTINGS_SCHEMA_VERSION,
  };
}

function loadSettings() {
  const loaded = readJson(settingsPath(), {});
  const settings = { ...defaultSettings(), ...loaded };
  if (loaded.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    if (loaded.versionFilter === "release") {
      settings.versionFilter = "all";
    }
    if (loaded.versionFilter === "installed" || !loaded.versionFilter) {
      settings.versionFilter = "all";
    }
  }
  if (
    !["installed", "release", "snapshot", "fabric", "forge", "optifine", "all"].includes(
      settings.versionFilter
    )
  ) {
    settings.versionFilter = "all";
  }
  return settings;
}

function saveSettings(input) {
  const safe = {
    ...loadSettings(),
    maxMemory: normalizeMemory(input.maxMemory, "4G"),
    minMemory: normalizeMemory(input.minMemory, "1G"),
    logFontSize: clampNumber(input.logFontSize, 8, 36, 12),
    javaPath: typeof input.javaPath === "string" ? input.javaPath.trim() : "",
    java8Path: typeof input.java8Path === "string" ? input.java8Path.trim() : "",
    windowWidth: clampNumber(input.windowWidth, 854, 3840, 1280),
    windowHeight: clampNumber(input.windowHeight, 480, 2160, 720),
    showSnapshots: Boolean(input.showSnapshots),
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    versionFilter: [
      "installed",
      "release",
      "snapshot",
      "fabric",
      "forge",
      "optifine",
      "all",
    ].includes(input.versionFilter)
      ? input.versionFilter
      : "all",
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

function bundledJavaPath(component) {
  if (!component) return "";

  const candidates = [
    path.join(
      minecraftRoot(),
      "runtime",
      component,
      "windows",
      component,
      "bin",
      "java.exe"
    ),
    path.join(
      minecraftRoot(),
      "runtime",
      component,
      "windows",
      component,
      "bin",
      "javaw.exe"
    ),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function walkForJavaExecutables(directory, maxDepth = 4, results = []) {
  if (!directory || maxDepth < 0) return results;

  for (const entry of safeReadDirectory(directory)) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && /^javaw?\.exe$/i.test(entry.name)) {
      results.push(fullPath);
      continue;
    }

    if (entry.isDirectory()) {
      walkForJavaExecutables(fullPath, maxDepth - 1, results);
    }
  }

  return results;
}

function commonJavaSearchRoots() {
  const roots = [
    path.join(minecraftRoot(), "runtime"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Java"),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Java"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Eclipse Adoptium"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Microsoft"),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Zulu"),
    path.join(
      process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
      "Minecraft Launcher",
      "runtime"
    ),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Minecraft Launcher", "runtime"),
  ];

  return [...new Set(roots.filter((value) => value && fs.existsSync(value)))];
}

function javaVersionInfo(javaPath) {
  const result = spawnSync(javaPath, ["-version"], {
    encoding: "utf8",
    windowsHide: true,
  });

  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  return parseJavaVersionOutput(output);
}

function parseJavaVersionOutput(output) {
  const text = String(output || "");
  const match = text.match(/version\s+"([^"]+)"/i) || text.match(/openjdk\s+version\s+"([^"]+)"/i);
  const versionText = match ? match[1] : "";
  if (!versionText) return null;

  let major = null;
  if (versionText.startsWith("1.")) {
    major = Number.parseInt(versionText.split(".")[1], 10);
  } else {
    major = Number.parseInt(versionText.split(/[.+-]/)[0], 10);
  }

  if (Number.isNaN(major)) return null;
  return { major, versionText };
}

function discoveredJavaCandidates() {
  const candidates = [];
  const preferredLegacy = [
    path.join(minecraftRoot(), "runtime", "jre-legacy", "windows", "jre-legacy", "bin", "javaw.exe"),
    path.join(minecraftRoot(), "runtime", "jre-legacy", "windows", "jre-legacy", "bin", "java.exe"),
  ];

  for (const candidate of preferredLegacy) {
    if (fs.existsSync(candidate)) candidates.push(candidate);
  }

  for (const root of commonJavaSearchRoots()) {
    candidates.push(...walkForJavaExecutables(root));
  }

  return [...new Set(candidates.filter((value) => value && fs.existsSync(value)))];
}

function autoDetectJavaPath(version) {
  const candidates = discoveredJavaCandidates();
  if (!candidates.length) return undefined;

  const needsLegacy = isLegacyJavaNeeded(version);
  const declaredMajor = Number.parseInt(version?.javaVersion?.majorVersion, 10);
  const preferredMajor = !Number.isNaN(declaredMajor)
    ? declaredMajor
    : needsLegacy
      ? 8
      : null;
  const inspected = candidates
    .map((candidate) => ({ path: candidate, info: javaVersionInfo(candidate) }))
    .filter((candidate) => candidate.info);

  if (preferredMajor !== null) {
    // Try exact match first
    const preferred = inspected.find((candidate) => candidate.info.major === preferredMajor);
    if (preferred) return preferred.path;
  }

  // For legacy versions, never fall back to Java 9+ automatically
  if (needsLegacy) {
    // Try any Java <= 8
    const legacyFallback = inspected
      .filter((c) => c.info.major <= 8)
      .sort((a, b) => b.info.major - a.info.major)[0];
    if (legacyFallback) return legacyFallback.path;
    // No legacy java found — return undefined so we can warn the user
    return undefined;
  }

  const bundledComponent = version.javaVersion?.component;
  if (bundledComponent) {
    const bundled = bundledJavaPath(bundledComponent);
    if (bundled) return bundled;
  }

  return undefined;
}

function resolveJavaPath(version, settings) {
  // User-specified java path takes precedence
  if (settings.javaPath) return settings.javaPath;

  // Optional explicit Java 8 override still works, but auto-detection is preferred.
  if (isLegacyJavaNeeded(version) && settings.java8Path) return settings.java8Path;

  const autoDetected = autoDetectJavaPath(version);
  if (autoDetected) return autoDetected;

  const component = version.javaVersion?.component;
  const javaPath = bundledJavaPath(component);
  if (javaPath) return javaPath;

  return undefined;
}

function isLegacyJavaNeeded(version) {
  // Heuristic: Minecraft 1.x where minor <= 8 often requires Java 8 (LaunchWrapper/Forge era)
  try {
    const declaredMajor = Number.parseInt(version?.javaVersion?.majorVersion, 10);
    if (!Number.isNaN(declaredMajor)) {
      return declaredMajor <= 8;
    }

    const candidate = version.launchNumber || version.inheritsFrom || version.id || "";
    const match = minecraftVersionFromText(candidate);
    let minor = null;
    if (match && match.startsWith("1.")) {
      const parts = match.split(".");
      minor = Number.parseInt(parts[1], 10);
      if (!Number.isNaN(minor) && minor <= 8) return true;
      if (!Number.isNaN(minor) && minor >= 17) return false;
    }

    // Try to read the version JSON from disk to inspect mainClass
    const pathsToTry = [];
    if (version.launchJsonPath) pathsToTry.push(version.launchJsonPath);
    // Also try the standard versionDirectory location
    if (version.id) {
      pathsToTry.push(path.join(versionDirectory(version.id), `${version.id}.json`));
    }
    for (const jsonPath of pathsToTry) {
      if (jsonPath && fs.existsSync(jsonPath)) {
        const json = readJson(jsonPath, null);
        if (json && typeof json.mainClass === "string") {
          const mc = json.mainClass.toLowerCase();
          if (mc.includes("launchwrapper") || mc.includes("fml") || mc.includes("forge")) {
            if (minor === null || Number.isNaN(minor)) return true;
            return minor <= 16;
          }
        }
        // If the version uses old-style minecraftArguments (pre-1.13 format), it likely needs Java 8
        if (json && typeof json.minecraftArguments === "string" && !json.arguments) {
          return true;
        }
        // If inheritsFrom points to an older version
        if (json && json.inheritsFrom) {
          const inheritedMatch = minecraftVersionFromText(json.inheritsFrom);
          if (inheritedMatch && inheritedMatch.startsWith("1.")) {
            const inheritedMinor = Number.parseInt(inheritedMatch.split(".")[1], 10);
            if (!Number.isNaN(inheritedMinor) && inheritedMinor <= 8) return true;
          }
        }
        break; // Found and read a JSON, no need to try more
      }
    }
  } catch (_e) {
    // fallthrough
  }
  return false;
}

function publicAccount(account = loadAccount()) {
  if (!account || !account.profile) return null;
  return {
    type: account.type || "microsoft",
    name: account.profile.name,
    id: account.profile.id,
    xuid: account.xuid || null,
    updatedAt: account.updatedAt || null,
    demo: Boolean(account.profile.demo),
  };
}

function accountsPath() {
  return userDataPath("accounts.json");
}

function loadAccountsData() {
  const data = readJson(accountsPath(), null);
  if (data && Array.isArray(data.accounts)) return data;
  
  // Migrate old account.json if it exists
  const oldData = readJson(userDataPath("account.json"), null);
  if (oldData && oldData.profile) {
    oldData.accountId = oldData.profile.id;
    return {
      activeId: oldData.profile.id,
      accounts: [oldData]
    };
  }
  
  return { activeId: null, accounts: [] };
}

function saveAccountsData(data) {
  writeJson(accountsPath(), data);
}

function loadAccount() {
  const data = loadAccountsData();
  if (!data.activeId) return null;
  return data.accounts.find(a => a.accountId === data.activeId) || null;
}

function publicAccounts() {
  const data = loadAccountsData();
  return data.accounts.map(acc => ({
    accountId: acc.accountId,
    type: acc.type || "microsoft",
    name: acc.profile.name,
    id: acc.profile.id,
    xuid: acc.xuid || null,
    updatedAt: acc.updatedAt || null,
    demo: Boolean(acc.profile.demo),
    isActive: acc.accountId === data.activeId
  }));
}

function saveMicrosoftAccount(refreshToken, minecraftSession) {
  const data = loadAccountsData();
  const accountId = minecraftSession.profile.id;
  const account = {
    accountId,
    type: "microsoft",
    refreshToken,
    profile: {
      id: minecraftSession.profile.id,
      name: minecraftSession.profile.name,
      demo: Boolean(minecraftSession.profile.demo),
    },
    xuid: minecraftSession.xuid || null,
    updatedAt: new Date().toISOString(),
  };
  
  const existingIdx = data.accounts.findIndex(a => a.accountId === accountId);
  if (existingIdx >= 0) data.accounts[existingIdx] = account;
  else data.accounts.push(account);
  
  data.activeId = accountId;
  saveAccountsData(data);
  return account;
}

function offlineUuid(username) {
  const digest = crypto
    .createHash("md5")
    .update(`OfflinePlayer:${username}`, "utf8")
    .digest();

  digest[6] = (digest[6] & 0x0f) | 0x30;
  digest[8] = (digest[8] & 0x3f) | 0x80;

  return [...digest].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function normalizeOfflineUsername(username) {
  const value = String(username || "").trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(value)) {
    throw new Error(
      "O nome da conta local deve ter de 3 a 16 caracteres e usar apenas letras, numeros ou underscore."
    );
  }
  return value;
}

function saveLocalAccount(username) {
  const safeUsername = normalizeOfflineUsername(username);
  const accountId = offlineUuid(safeUsername);
  const data = loadAccountsData();
  
  const account = {
    accountId,
    type: "local",
    refreshToken: null,
    profile: {
      id: accountId,
      name: safeUsername,
      demo: false,
    },
    xuid: null,
    updatedAt: new Date().toISOString(),
  };
  
  const existingIdx = data.accounts.findIndex(a => a.accountId === accountId);
  if (existingIdx >= 0) data.accounts[existingIdx] = account;
  else data.accounts.push(account);
  
  data.activeId = accountId;
  saveAccountsData(data);
  return account;
}

function deleteAccount(accountId) {
  const data = loadAccountsData();
  if (!accountId) accountId = data.activeId;
  
  data.accounts = data.accounts.filter(a => a.accountId !== accountId);
  if (data.activeId === accountId) {
    data.activeId = data.accounts.length > 0 ? data.accounts[0].accountId : null;
  }
  saveAccountsData(data);
}

function setActiveAccount(accountId) {
  const data = loadAccountsData();
  if (data.accounts.some(a => a.accountId === accountId)) {
    data.activeId = accountId;
    saveAccountsData(data);
  }
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
  
  const eventData = {
    type,
    message: redactSecrets(message),
    at: new Date().toISOString(),
    ...extra,
  };
  
  if (type !== 'progress' && type !== 'download-status' && type !== 'install-progress' && type !== 'install-start') {
    logHistory.push({ type: eventData.type, message: eventData.message, time: Date.now() });
    if (logHistory.length > 1000) logHistory.shift();
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.webContents.send("log:event", logHistory[logHistory.length - 1]);
    }
  }

  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("launcher:event", eventData);
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

function stopIdleGuard() {
  if (activeIdleGuard) {
    activeIdleGuard.stop();
    activeIdleGuard = null;
  }
}

function stopLaunchProcessPolling(context) {
  if (!context?.processPollTimer) return;
  clearInterval(context.processPollTimer);
  context.processPollTimer = null;
}

function isProcessAlive(processRef) {
  if (!processRef) return false;
  if (processRef.exitCode !== null && processRef.exitCode !== undefined) return false;

  const pid = Number(processRef.pid);
  if (!Number.isInteger(pid) || pid <= 0) return true;

  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function startLaunchProcessPolling(processRef, context) {
  stopLaunchProcessPolling(context);
  if (!processRef || !context) return;

  context.processPollTimer = setInterval(() => {
    if (!activeLaunchContext || activeLaunchContext !== context || context.finished) {
      stopLaunchProcessPolling(context);
      return;
    }

    if (!isProcessAlive(processRef)) {
      finalizeLaunchContext(
        context,
        processRef.exitCode ?? 0,
        "process-poll"
      );
    }
  }, 500);
}

function detachLaunchProcessListeners(context) {
  if (!context?.process || !context.processListeners) return;
  const { process, processListeners } = context;
  process.off("close", processListeners.onClose);
  process.off("exit", processListeners.onExit);
  process.off("error", processListeners.onError);
  context.processListeners = null;
}

function clearLaunchContext(context) {
  if (!context || activeLaunchContext !== context) return;
  stopLaunchProcessPolling(context);
  detachLaunchProcessListeners(context);
  stopIdleGuard();
  activeProcess = null;
  busy = false;
  activeLaunchContext = null;
}

function uninstallVersion(input) {
  if (busy) throw new Error("Ja existe uma instalacao ou jogo em andamento.");

  const id = String(input?.id || "").trim();
  if (!id) {
    throw new Error("Versao nao informada para desinstalacao.");
  }

  const directory = versionDirectory(id);
  if (!fs.existsSync(directory)) {
    throw new Error(`A versao ${id} nao esta instalada.`);
  }

  fs.rmSync(directory, { recursive: true, force: true });

  const launchJson = launchJsonPath(id);
  if (fs.existsSync(launchJson)) {
    fs.rmSync(launchJson, { force: true });
  }

  sendEvent("success", `Versao ${id} desinstalada.`);
  return { ok: true, id };
}

function finalizeLaunchContext(context, code, source = "client") {
  if (!context || activeLaunchContext !== context || context.finished) return;
  context.finished = true;
  sendEvent("close", `Minecraft finalizado com codigo ${code ?? 0}.`, {
    code: code ?? 0,
    source,
  });
  clearLaunchContext(context);
}

function watchLaunchProcess(processRef, context) {
  if (!processRef || !context || activeLaunchContext !== context) return;
  context.process = processRef;
  const onClose = (code) => finalizeLaunchContext(context, code, "process-close");
  const onExit = (code) => finalizeLaunchContext(context, code, "process-exit");
  const onError = (error) => {
    sendEvent("error", error?.message || "Falha ao monitorar o processo do Minecraft.");
    finalizeLaunchContext(context, 1, "process-error");
  };

  context.processListeners = { onClose, onExit, onError };
  processRef.on("close", onClose);
  processRef.on("exit", onExit);
  processRef.on("error", onError);
  startLaunchProcessPolling(processRef, context);
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

  const account = saveMicrosoftAccount(xbox.save(), minecraft);
  sendEvent("success", `Conta vinculada: ${account.profile.name}`);
  return publicAccount(account);
}

async function addLocalAccount(username) {
  const account = saveLocalAccount(username);
  sendEvent("success", `Conta local criada: ${account.profile.name}`);
  return publicAccount(account);
}

async function getAuthorization() {
  const account = loadAccount();
  if (!account || !account.profile) {
    throw new Error("Adicione uma conta Microsoft ou local antes de continuar.");
  }

  if ((account.type || "microsoft") === "local") {
    return {
      access_token: account.profile.id,
      client_token: account.profile.id,
      uuid: account.profile.id,
      name: account.profile.name,
      user_properties: "{}",
      meta: {
        type: "legacy",
        xuid: "0",
        demo: false,
        offline: true,
      },
    };
  }

  if (!account.refreshToken) {
    throw new Error("Vincule uma conta Microsoft/Minecraft antes de continuar.");
  }

  const auth = new Auth("none");
  attachAuthEvents(auth);

  const xbox = await auth.refresh(account.refreshToken);
  const minecraft = await xbox.getMinecraft();
  if (minecraft.isDemo()) {
    throw new Error("A conta vinculada nao possui acesso completo ao Minecraft Java.");
  }

  saveMicrosoftAccount(xbox.save(), minecraft);
  return minecraft.mclc();
}

function isVersionInstalled(id) {
  const folder = versionDirectory(id);
  return (
    fs.existsSync(path.join(folder, `${id}.json`)) &&
    fs.existsSync(path.join(folder, `${id}.jar`))
  );
}

function getLocalVersionJsonPath(id) {
  return path.join(versionDirectory(id), `${id}.json`);
}

function getLocalVersionJarPath(id) {
  return path.join(versionDirectory(id), `${id}.jar`);
}

function safeReadDirectory(directory) {
  try {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      return [];
    }
    return fs.readdirSync(directory, { withFileTypes: true });
  } catch (_error) {
    return [];
  }
}

function versionDirectoryJars(id) {
  const directory = versionDirectory(id);
  return safeReadDirectory(directory)
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".jar"))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => path.basename(left).localeCompare(path.basename(right)));
}

function isLauncherInstallerJar(filePath) {
  const name = path.basename(filePath).toLowerCase();
  return /(?:^|[-_. ])installer(?:[-_. ]|$)/.test(name);
}

function findLocalVersionJar(id) {
  const exact = getLocalVersionJarPath(id);
  if (fs.existsSync(exact) && !isLauncherInstallerJar(exact)) return exact;

  const jars = versionDirectoryJars(id).filter(
    (filePath) => !isLauncherInstallerJar(filePath)
  );
  if (!jars.length) return null;

  const normalizedId = id.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const matching = jars.find((filePath) =>
    path.basename(filePath, ".jar").toLowerCase().replace(/[^a-z0-9]+/g, "") ===
    normalizedId
  );
  return matching || jars[0];
}

function localVersionFromDirectory(entry) {
  if (!entry.isDirectory()) return null;

  const id = entry.name;
  const versionJsonPath = getLocalVersionJsonPath(id);
  const versionJarPath = findLocalVersionJar(id);
  const versionJson = readJson(versionJsonPath, null);

  if (!versionJson && !versionJarPath) return null;

  const stats = fs.statSync(versionDirectory(id));
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
    minecraftVersion: versionJson?.minecraftVersion || versionJson?.inheritsFrom || null,
    loaderType: versionJson?.loaderType || null,
    loaderVersion: versionJson?.loaderVersion || null,
    modpackTitle: versionJson?.modpackTitle || null,
    modpackProjectId: versionJson?.modpackProjectId || null,
    modpackVersionId: versionJson?.modpackVersionId || null,
    modpackVersionNumber: versionJson?.modpackVersionNumber || null,
  };
}

function normalizeDownloadUrl(url) {
  if (typeof url !== "string") return url;
  return url.replace(
    /^http:\/\/files\.minecraftforge\.net\/maven\/?/i,
    "https://maven.minecraftforge.net/"
  );
}

function artifactPathFromUrl(url) {
  if (typeof url !== "string") return "";

  try {
    const parsed = new URL(url);
    const pathName = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    const mavenIndex = pathName.toLowerCase().indexOf("maven/");
    return mavenIndex >= 0
      ? pathName.slice(mavenIndex + "maven/".length)
      : pathName;
  } catch (_error) {
    const clean = url.split("?")[0].replace(/\\/g, "/");
    const mavenIndex = clean.toLowerCase().indexOf("/maven/");
    return mavenIndex >= 0
      ? clean.slice(mavenIndex + "/maven/".length)
      : clean.split("/").filter(Boolean).pop() || "";
  }
}

function normalizeLibraryShape(library) {
  if (!library || typeof library !== "object") return library;

  if (library.url) library.url = normalizeDownloadUrl(library.url);

  if (library.artifact && !library.downloads?.artifact) {
    library.downloads = {
      ...(library.downloads || {}),
      artifact: library.artifact,
    };
  }

  if (library.classifies && !library.downloads?.classifiers) {
    const classifiers = {};
    for (const [key, value] of Object.entries(library.classifies)) {
      classifiers[key] = value;
      classifiers[`natives-${key}`] = value;
    }

    if (!classifiers["natives-windows"] && library.classifies["windows-64"]) {
      classifiers["natives-windows"] = library.classifies["windows-64"];
    }
    if (!classifiers["natives-osx"] && library.classifies.osx) {
      classifiers["natives-osx"] = library.classifies.osx;
    }
    if (!classifiers["natives-linux"] && library.classifies.linux) {
      classifiers["natives-linux"] = library.classifies.linux;
    }

    library.downloads = {
      ...(library.downloads || {}),
      classifiers,
    };
  }

  if (library.downloads?.artifact?.url) {
    library.downloads.artifact.url = normalizeDownloadUrl(
      library.downloads.artifact.url
    );
  }

  if (library.exact_url) {
    const artifact = {
      ...(library.downloads?.artifact || {}),
      path:
        library.downloads?.artifact?.path ||
        library.artifact?.path ||
        artifactPathFromUrl(library.exact_url),
      url: normalizeDownloadUrl(library.exact_url),
    };
    library.downloads = {
      ...(library.downloads || {}),
      artifact,
    };
  }

  if (library.downloads?.artifact?.url) {
    delete library.url;
  }

  return library;
}

function parseMavenName(name) {
  const parts = String(name || "").split(":");
  if (parts.length < 3) return null;
  return {
    group: parts[0],
    artifact: parts[1],
    version: parts[2],
    classifier: parts[3] || "",
  };
}

function libraryArtifactPath(library) {
  if (isNativeOnlyLibrary(library)) {
    return null;
  }

  const artifact = library?.downloads?.artifact || library?.artifact || null;
  if (artifact?.path) {
    return path.join(
      minecraftRoot(),
      "libraries",
      ...String(artifact.path).split(/[\\/]+/)
    );
  }

  const parsed = parseMavenName(library?.name);
  if (!parsed) return null;

  const fileName = `${parsed.artifact}-${parsed.version}${
    parsed.classifier ? `-${parsed.classifier}` : ""
  }.jar`;
  return path.join(
    minecraftRoot(),
    "libraries",
    ...parsed.group.split("."),
    parsed.artifact,
    parsed.version,
    fileName
  );
}

function hasExplicitArtifact(library) {
  return Boolean(
    library?.downloads?.artifact || library?.artifact || library?.exact_url
  );
}

function isNativeOnlyLibrary(library) {
  return (
    !hasExplicitArtifact(library) &&
    Boolean(library?.natives || library?.downloads?.classifiers)
  );
}

function localAdditionalMetadataPath(id) {
  return path.join(versionDirectory(id), "TLauncherAdditional.json");
}

function localAdditionalLibraries(id) {
  const metadata = readJson(localAdditionalMetadataPath(id), null);
  if (!Array.isArray(metadata?.modsLibraries)) return [];

  return metadata.modsLibraries
    .map((library) => normalizeVersionShape(cloneJson(library)))
    .filter(Boolean);
}

function legacyLaunchwrapperSupportLibraries(versionJson) {
  const libraries = Array.isArray(versionJson?.libraries) ? versionJson.libraries : [];
  const usesLegacyLaunchwrapper = libraries.some(
    (library) => library?.name === "net.minecraft:launchwrapper:1.12"
  );
  const hasAsmSupport = libraries.some((library) =>
    String(library?.name || "").startsWith("org.ow2.asm:")
  );

  if (!usesLegacyLaunchwrapper || hasAsmSupport) {
    return [];
  }

  return [{ name: "org.ow2.asm:asm-all:5.0.3" }];
}

function libraryRuleBlocked(library) {
  if (!Array.isArray(library?.rules) || library.rules.length === 0) {
    return false;
  }

  if (library.rules.length > 1) {
    if (
      library.rules[0].action === "allow" &&
      library.rules[1].action === "disallow" &&
      library.rules[1].os?.name === "osx"
    ) {
      return currentMinecraftOs() === "osx";
    }
    return true;
  }

  const [rule] = library.rules;
  return rule.action === "allow" && rule.os ? rule.os.name !== currentMinecraftOs() : false;
}

function libraryDownloadUrl(library) {
  const candidates = libraryDownloadCandidates(library);
  return candidates[0] || null;
}

function libraryDownloadCandidates(library) {
  if (isNativeOnlyLibrary(library)) {
    return [];
  }

  if (library?.downloads?.artifact?.url) {
    return [normalizeDownloadUrl(library.downloads.artifact.url)];
  }

  if (library?.artifact?.url) {
    return [normalizeDownloadUrl(library.artifact.url)];
  }

  if (library?.exact_url) {
    return [normalizeDownloadUrl(library.exact_url)];
  }

  const parsed = parseMavenName(library?.name);
  if (!parsed) return [];

  const fileName = `${parsed.artifact}-${parsed.version}${
    parsed.classifier ? `-${parsed.classifier}` : ""
  }.jar`;

  const relativePath = `${parsed.group.replace(/\./g, "/")}/${parsed.artifact}/${parsed.version}/${fileName}`;
  const bases = [];

  if (library?.url) {
    bases.push(library.url);
  }

  bases.push(
    "https://libraries.minecraft.net/",
    "https://repo.maven.apache.org/maven2/",
    "https://search.maven.org/remotecontent?filepath=",
    "https://maven.minecraftforge.net/"
  );

  const urls = [];
  for (const base of bases.filter(Boolean)) {
    if (base.includes("remotecontent?filepath=")) {
      urls.push(`${base}${relativePath}`);
      continue;
    }
    urls.push(normalizeDownloadUrl(`${base}${relativePath}`));
  }

  return [...new Set(urls)];
}

function versionLaunchLibraries(versionJson, id) {
  return uniqueLibraries([
    ...(Array.isArray(versionJson?.libraries) ? versionJson.libraries : []),
    ...legacyLaunchwrapperSupportLibraries(versionJson),
    ...localAdditionalLibraries(id),
  ]);
}

async function ensureLocalLaunchLibraries(id, versionJson) {
  for (const library of versionLaunchLibraries(versionJson, id)) {
    if (!library || libraryRuleBlocked(library)) continue;

    const artifactPath = libraryArtifactPath(library);
    if (!artifactPath) continue;

    if (fs.existsSync(artifactPath)) {
      const expectedSize = Number.parseInt(library?.downloads?.artifact?.size, 10);
      const actualSize = fs.statSync(artifactPath).size;

      if (!Number.isNaN(expectedSize) && expectedSize > 0 && actualSize !== expectedSize) {
        sendEvent(
          "warning",
          `Biblioteca ${library.name} corrompida/incompleta. Baixando novamente...`
        );
        fs.unlinkSync(artifactPath);
      } else {
        continue;
      }
    }

    const downloadCandidates = libraryDownloadCandidates(library);
    if (!downloadCandidates.length) continue;

    sendEvent("debug", `Baixando biblioteca local ausente: ${library.name}`);

    let lastError = null;
    let downloaded = false;
    for (const downloadUrl of downloadCandidates) {
      try {
        await downloadFile(
          downloadUrl,
          artifactPath,
          "classes-custom",
          `Biblioteca ${library.name}`
        );
        downloaded = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!downloaded && lastError) {
      throw lastError;
    }

    const expectedSha1 = String(library?.downloads?.artifact?.sha1 || "").trim().toLowerCase();
    if (expectedSha1) {
      const actualSha1 = await sha1File(artifactPath);
      if (actualSha1 !== expectedSha1) {
        fs.unlinkSync(artifactPath);
        throw new Error(`Biblioteca ${library.name} falhou na verificacao de integridade.`);
      }
    }
  }
}

function resolveLaunchClassPaths(versionJson, id) {
  return versionLaunchLibraries(versionJson, id)
    .filter((library) => !libraryRuleBlocked(library))
    .map((library) => libraryArtifactPath(library))
    .filter((filePath) => filePath && fs.existsSync(filePath));
}

function isForgeLibrary(library) {
  const parsed = parseMavenName(library?.name);
  return (
    parsed?.group === "net.minecraftforge" &&
    parsed.artifact.toLowerCase().includes("forge")
  );
}

function minecraftVersionFromForgeLibrary(library) {
  if (!isForgeLibrary(library)) return null;
  const parsed = parseMavenName(library.name);
  const match = parsed?.version.match(/^\d+\.\d+(?:\.\d+)?/);
  return match ? match[0] : null;
}

function minecraftVersionFromText(value) {
  const matches = String(value || "").match(/\b\d+\.\d+(?:\.\d+)?\b/g) || [];
  if (!matches.length) return null;

  const preferred = matches.find((item) => item.startsWith("1."));
  return preferred || matches[0];
}

function isModernMinecraftVersion(value) {
  const match = String(value || "").match(/^1\.(\d+)/);
  if (!match) return false;
  return Number.parseInt(match[1], 10) >= 13;
}

function hasStructuredGameArguments(versionJson) {
  return Array.isArray(versionJson?.arguments?.game) && versionJson.arguments.game.length > 0;
}

function hasLegacyGameArguments(versionJson) {
  return typeof versionJson?.minecraftArguments === "string" &&
    versionJson.minecraftArguments.trim().length > 0;
}

function hasOptiFineTweakerArgument(versionJson) {
  const tweakClass = "optifine.OptiFineTweaker";
  const structuredArgs = Array.isArray(versionJson?.arguments?.game)
    ? versionJson.arguments.game
    : [];
  for (let index = 0; index < structuredArgs.length - 1; index += 1) {
    if (structuredArgs[index] === "--tweakClass" && structuredArgs[index + 1] === tweakClass) {
      return true;
    }
  }

  if (!hasLegacyGameArguments(versionJson)) return false;
  return /(^|\s)--tweakClass\s+optifine\.OptiFineTweaker(?:\s|$)/.test(
    versionJson.minecraftArguments
  );
}

function appendTweakClassArgument(minecraftArguments, tweakClass) {
  const baseArguments = String(minecraftArguments || "").trim();
  const tweakPattern = new RegExp(
    `(^|\\s)--tweakClass\\s+${String(tweakClass).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`
  );
  if (tweakPattern.test(baseArguments)) return baseArguments;
  return `${baseArguments} --tweakClass ${tweakClass}`.trim();
}

function isSelfContainedLocalVersion(versionJson, localJarPath) {
  if (!versionJson || typeof versionJson !== "object") return false;
  if (versionJson.inheritsFrom || versionJson.jar) return false;

  const hasLibraries = Array.isArray(versionJson.libraries) && versionJson.libraries.length > 0;
  const hasMainClass = typeof versionJson.mainClass === "string" && versionJson.mainClass.trim().length > 0;
  const hasGameArgs =
    hasStructuredGameArguments(versionJson) || hasLegacyGameArguments(versionJson);
  const hasClientJarSource = Boolean(localJarPath || versionJson.downloads?.client?.url);

  return hasLibraries && hasMainClass && hasGameArgs && hasClientJarSource;
}

function normalizeVersionShape(value) {
  if (Array.isArray(value)) return value.map(normalizeVersionShape);
  if (!value || typeof value !== "object") return value;

  const normalized = {};
  for (const [key, child] of Object.entries(value)) {
    normalized[key] = normalizeVersionShape(child);
  }

  if (normalized.values !== undefined && normalized.value === undefined) {
    normalized.value = normalized.values;
  }

  if (
    normalized.name &&
    (normalized.artifact ||
      normalized.classifies ||
      normalized.downloads ||
      normalized.url ||
      normalized.exact_url)
  ) {
    normalizeLibraryShape(normalized);
  }

  return normalized;
}

function libraryIdentityKey(library) {
  if (!library || typeof library !== "object") {
    return JSON.stringify(library);
  }

  const artifactPath =
    library?.downloads?.artifact?.path ||
    library?.artifact?.path ||
    library?.downloads?.artifact?.url ||
    library?.artifact?.url ||
    library?.exact_url ||
    "";
  const classifierKeys = library?.downloads?.classifiers
    ? Object.keys(library.downloads.classifiers).sort().join(",")
    : "";
  const nativeKeys = library?.natives
    ? Object.keys(library.natives)
        .sort()
        .map((key) => `${key}:${library.natives[key]}`)
        .join(",")
    : "";
  const rulesKey = Array.isArray(library?.rules) ? JSON.stringify(library.rules) : "";

  return [library.name || "", artifactPath, classifierKeys, nativeKeys, rulesKey].join("|");
}

function uniqueLibraries(libraries) {
  const seen = new Set();
  const output = [];

  for (const library of libraries.filter(Boolean)) {
    const key = libraryIdentityKey(library);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(library);
  }

  return output;
}

function mergeArguments(baseArguments = {}, childArguments = {}) {
  const merged = { ...baseArguments, ...childArguments };

  if (baseArguments.game || childArguments.game) {
    merged.game =
      childArguments.game && childArguments.game.length
        ? [...(baseArguments.game || []), ...childArguments.game]
        : baseArguments.game || childArguments.game || [];
  }

  if (baseArguments.jvm || childArguments.jvm) {
    merged.jvm = [...(baseArguments.jvm || []), ...(childArguments.jvm || [])];
  }

  return merged;
}

function mergeInheritedVersion(baseJson, childJson) {
  const base = normalizeVersionShape(cloneJson(baseJson));
  const child = normalizeVersionShape(cloneJson(childJson));
  const merged = {
    ...base,
    ...child,
    id: child.id || base.id,
    type: child.type || base.type,
    mainClass: child.mainClass || base.mainClass,
    libraries: uniqueLibraries([...(child.libraries || []), ...(base.libraries || [])]),
    arguments: mergeArguments(base.arguments, child.arguments),
  };

  if (!child.minecraftArguments && base.minecraftArguments) {
    merged.minecraftArguments = base.minecraftArguments;
  }
  if (!child.assetIndex && base.assetIndex) merged.assetIndex = base.assetIndex;
  if ((!child.assets || child.assets === "legacy") && base.assets) {
    merged.assets = base.assets;
  }
  if (!child.downloads && base.downloads) merged.downloads = base.downloads;
  if (!child.javaVersion && base.javaVersion) merged.javaVersion = base.javaVersion;
  if (!child.logging && base.logging) merged.logging = base.logging;

  delete merged.inheritsFrom;
  return merged;
}

function writeNormalizedLaunchJson(id, versionJson) {
  const normalized = normalizeVersionShape(cloneJson(versionJson));
  const filePath = launchJsonPath(id);
  writeJson(filePath, normalized);
  return filePath;
}

function localBaseVersionCandidates(id, versionJson) {
  const candidates = [
    versionJson?.inheritsFrom,
    versionJson?.jar,
    versionJson?.minecraftVersion,
  ];

  for (const library of versionJson?.libraries || []) {
    candidates.push(minecraftVersionFromForgeLibrary(library));
  }

  candidates.push(minecraftVersionFromText(versionJson?.id));
  candidates.push(minecraftVersionFromText(id));

  return [...new Set(candidates.filter(Boolean))];
}

async function resolveFirstOfficialVersionMeta(candidates) {
  if (!candidates.length) return null;
  let manifest;
  try {
    manifest = await loadVersions(false);
  } catch (_error) {
    return null;
  }

  for (const id of candidates) {
    const found = manifest.versions.find((item) => item.id === id && item.url);
    if (found) return found;
  }

  return null;
}

function formatFabricVersionId(minecraftVersion, loaderVersion) {
  return `fabric-loader-${loaderVersion}-${minecraftVersion}`;
}

function formatForgeVersionId(minecraftVersion, forgeVersion) {
  return `${minecraftVersion}-forge-${forgeVersion}`;
}

function formatOptiFineVersionId(minecraftVersion, optiFineVersion) {
  return `${minecraftVersion}-OptiFine_${optiFineVersion}`;
}

function denormalizeOptiFineGameVersion(version) {
  if (version === "1.8.0") return "1.8";
  if (version === "1.9.0") return "1.9";
  return version;
}

function normalizeOptiFineLookupVersion(version) {
  if (version === "1.8") return "1.8.0";
  if (version === "1.9") return "1.9.0";
  return version;
}

function isOptiFinePreviewItem(item) {
  const patch = String(item?.patch || "").toLowerCase();
  return patch.startsWith("pre") || patch.startsWith("alpha");
}

function normalizeForgeLookupVersion(gameVersion) {
  return gameVersion === "1.7.10-pre4" ? "1.7.10_pre4" : gameVersion;
}

function normalizeForgeBranch(gameVersion, branch) {
  if (gameVersion === "1.7.10-pre4") {
    return "prerelease";
  }
  return String(branch || "");
}

function forgeInstallerUrls(gameVersion, forgeVersion, branch = "") {
  const lookupVersion = normalizeForgeLookupVersion(gameVersion);
  const lookupBranch = normalizeForgeBranch(gameVersion, branch);
  const branchSuffix = lookupBranch ? `-${lookupBranch}` : "";
  const classifier = `${lookupVersion}-${forgeVersion}${branchSuffix}`;
  const fileName1 = `forge-${classifier}-installer.jar`;
  const fileName2 = `forge-${classifier}-${lookupVersion}-installer.jar`;
  const urls = [
    `https://files.minecraftforge.net/maven/net/minecraftforge/forge/${classifier}/${fileName1}`,
    `https://files.minecraftforge.net/maven/net/minecraftforge/forge/${classifier}-${lookupVersion}/${fileName2}`,
  ];

  const bmclUrl = new URL(`${BMCL_API_ROOT}/forge/download`);
  bmclUrl.searchParams.set("mcversion", gameVersion);
  bmclUrl.searchParams.set("version", forgeVersion);
  if (lookupBranch) bmclUrl.searchParams.set("branch", lookupBranch);
  bmclUrl.searchParams.set("category", "installer");
  bmclUrl.searchParams.set("format", "jar");
  urls.push(bmclUrl.toString());

  return [...new Set(urls)];
}

function sanitizeFileName(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

async function fetchJson(url, label) {
  const response = await fetch(url, {
    headers: { "User-Agent": HTTP_USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`${label}: HTTP ${response.status}`);
  }

  return response.json();
}

function searchModpacksUrl(query, filters = {}, limit = 24) {
  const url = new URL(`${MODRINTH_API_ROOT}/search`);
  const normalizedQuery = String(query || "").trim();
  url.searchParams.set("limit", String(Math.min(50, Math.max(1, Number(limit) || 24))));
  url.searchParams.set("index", normalizedQuery ? "relevance" : "downloads");

  // Build facets: always filter by project_type:modpack, then optionally by loader and game_version
  const facets = [["project_type:modpack"]];
  const loader = String(filters.loader || "").trim().toLowerCase();
  const gameVersion = String(filters.gameVersion || "").trim();
  if (loader) facets.push([`categories:${loader}`]);
  if (gameVersion) facets.push([`versions:${gameVersion}`]);
  url.searchParams.set("facets", JSON.stringify(facets));

  if (normalizedQuery) {
    url.searchParams.set("query", normalizedQuery);
  }
  return url.toString();
}

async function searchModpacks(query, filters = {}, limit = 24) {
  const result = await fetchJson(searchModpacksUrl(query, filters, limit), "Modrinth search");
  const hits = Array.isArray(result?.hits) ? result.hits : [];

  return {
    hits: hits.map((hit) => ({
      projectId: hit.project_id,
      slug: hit.slug || hit.project_id,
      title: hit.title || hit.name || hit.project_id,
      description: hit.description || hit.summary || "",
      author: hit.author || "",
      iconUrl: hit.icon_url || "",
      downloads: Number(hit.downloads) || 0,
      follows: Number(hit.follows) || 0,
      latestVersion: hit.latest_version || "",
      gameVersions: Array.isArray(hit.versions) ? hit.versions : [],
      categories:
        Array.isArray(hit.display_categories) && hit.display_categories.length
          ? hit.display_categories
          : Array.isArray(hit.categories)
            ? hit.categories
            : [],
    })),
    totalHits: Number(result?.total_hits) || hits.length,
    offset: Number(result?.offset) || 0,
    limit: Number(result?.limit) || limit,
  };
}

async function modrinthProjectVersions(projectId) {
  const url = new URL(
    `${MODRINTH_API_ROOT}/project/${encodeURIComponent(projectId)}/version`
  );
  url.searchParams.set("include_changelog", "false");
  const versions = await fetchJson(url.toString(), `Modrinth versions ${projectId}`);
  return Array.isArray(versions) ? versions : [];
}

function primaryModpackFile(version) {
  if (!Array.isArray(version?.files) || !version.files.length) return null;
  return version.files.find((file) => file?.primary) || version.files[0];
}

function modpackDependencyInfo(dependencies) {
  const source = dependencies && typeof dependencies === "object" ? dependencies : {};
  const minecraftVersion = String(source.minecraft || "").trim();

  if (source["fabric-loader"]) {
    return {
      minecraftVersion,
      loaderType: "fabric",
      loaderVersion: String(source["fabric-loader"] || "").trim(),
    };
  }

  if (source.forge) {
    return {
      minecraftVersion,
      loaderType: "forge",
      loaderVersion: String(source.forge || "").trim(),
    };
  }

  if (source["quilt-loader"]) {
    return {
      minecraftVersion,
      loaderType: "quilt",
      loaderVersion: String(source["quilt-loader"] || "").trim(),
    };
  }

  if (source.neoforge || source["neo-forge"]) {
    return {
      minecraftVersion,
      loaderType: "neoforge",
      loaderVersion: String(source.neoforge || source["neo-forge"] || "").trim(),
    };
  }

  return {
    minecraftVersion,
    loaderType: null,
    loaderVersion: null,
  };
}

function modpackVersionLoaderNames(version) {
  const rawLoaders = Array.isArray(version?.mrpack_loaders) && version.mrpack_loaders.length
    ? version.mrpack_loaders
    : Array.isArray(version?.loaders)
      ? version.loaders
      : [];

  return rawLoaders
    .map((loader) => String(loader || "").trim().toLowerCase())
    .filter((loader) => loader && loader !== "mrpack");
}

function modpackVersionInfo(version) {
  const minecraftVersion = Array.isArray(version?.game_versions)
    ? String(version.game_versions.find(Boolean) || "").trim()
    : "";
  const loaders = modpackVersionLoaderNames(version);

  let loaderType = null;
  if (loaders.includes("fabric")) {
    loaderType = "fabric";
  } else if (loaders.includes("forge")) {
    loaderType = "forge";
  } else if (loaders.includes("quilt")) {
    loaderType = "quilt";
  } else if (loaders.includes("neoforge")) {
    loaderType = "neoforge";
  } else if (loaders.includes("minecraft") || loaders.length === 0) {
    loaderType = null;
  }

  return {
    minecraftVersion,
    loaderType,
    loaderVersion: null,
  };
}

function supportedModpackDependencyInfo(info) {
  return Boolean(info?.minecraftVersion) && (!info.loaderType || ["fabric", "forge"].includes(info.loaderType));
}

function supportedModpackError(info) {
  if (!info?.minecraftVersion) {
    return "O modpack nao informa a versao base do Minecraft.";
  }

  if (info.loaderType && !["fabric", "forge"].includes(info.loaderType)) {
    return `Este launcher instala modpacks vanilla, Fabric e Forge. Loader nao suportado: ${info.loaderType}.`;
  }

  return "Nenhuma versao compativel do modpack foi encontrada.";
}

function selectSupportedModpackVersion(versions) {
  let fallbackError = "Nenhuma versao compativel do modpack foi encontrada.";

  for (const version of versions) {
    const file = primaryModpackFile(version);
    const info = modpackVersionInfo(version);

    if (!file?.url) {
      continue;
    }

    if (!supportedModpackDependencyInfo(info)) {
      fallbackError = supportedModpackError(info);
      continue;
    }

    return { version, file, dependencyInfo: info };
  }

  throw new Error(fallbackError);
}

function compatibleModpackVersions(versions) {
  const results = [];

  for (const version of Array.isArray(versions) ? versions : []) {
    const file = primaryModpackFile(version);
    const info = modpackVersionInfo(version);

    if (!file?.url || !supportedModpackDependencyInfo(info)) {
      continue;
    }

    results.push({
      id: version.id,
      name: version.name || version.version_number || version.id,
      versionNumber: version.version_number || version.name || version.id,
      minecraftVersion: info.minecraftVersion,
      loaderType: info.loaderType || "vanilla",
      publishedAt: version.date_published || version.date_created || null,
      featured: Boolean(version.featured),
    });
  }

  return results;
}

function selectModpackVersionById(versions, versionId) {
  const normalizedId = String(versionId || "").trim();
  if (!normalizedId) {
    return selectSupportedModpackVersion(versions);
  }

  const selectedVersion = Array.isArray(versions)
    ? versions.find((version) => String(version?.id || "") === normalizedId)
    : null;

  if (!selectedVersion) {
    throw new Error("A versao escolhida do modpack nao foi encontrada.");
  }

  const file = primaryModpackFile(selectedVersion);
  const info = modpackVersionInfo(selectedVersion);

  if (!file?.url || !supportedModpackDependencyInfo(info)) {
    throw new Error(supportedModpackError(info));
  }

  return { version: selectedVersion, file, dependencyInfo: info };
}

async function getModpackVersions(projectId) {
  if (!projectId) {
    throw new Error("Projeto do modpack nao informado.");
  }

  const versions = await modrinthProjectVersions(projectId);
  const compatible = compatibleModpackVersions(versions);

  if (!compatible.length) {
    selectSupportedModpackVersion(versions);
  }

  return compatible;
}

function modpackInstallVersionId(project, version) {
  const slug = sanitizeFileName(project?.slug || project?.projectId || project?.title || "modpack")
    .toLowerCase();
  const versionPart = sanitizeFileName(version?.version_number || version?.id || "latest")
    .toLowerCase();
  return `modrinth-${slug}-${versionPart}`;
}

function resolveModpackPath(baseDirectory, relativePath) {
  const normalizedRelative = path.normalize(String(relativePath || "").replace(/\\/g, "/"));
  const resolvedBase = path.resolve(baseDirectory);
  const resolvedPath = path.resolve(resolvedBase, normalizedRelative);

  if (resolvedPath !== resolvedBase && !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    throw new Error(`Caminho invalido no modpack: ${relativePath}`);
  }

  return resolvedPath;
}

function readModpackIndex(zip) {
  const index = readInstallerJsonEntry(zip, "modrinth.index.json");
  if (!index || typeof index !== "object") {
    throw new Error("Arquivo modrinth.index.json ausente ou invalido no modpack.");
  }
  return index;
}

function extractModpackOverrides(zip, prefix, destinationDirectory) {
  for (const entry of zip.getEntries()) {
    const entryName = String(entry.entryName || "");
    if (!entryName.startsWith(prefix)) continue;
    if (entry.isDirectory || entryName.endsWith("/")) continue;

    const relativeName = entryName.slice(prefix.length);
    if (!relativeName) continue;

    const targetPath = resolveModpackPath(destinationDirectory, relativeName);
    ensureParent(targetPath);
    fs.writeFileSync(targetPath, entry.getData());
  }
}

async function ensureModpackIndexedFile(file, destinationDirectory) {
  const targetPath = resolveModpackPath(destinationDirectory, file.path);
  ensureParent(targetPath);

  if (fs.existsSync(targetPath) && file?.hashes?.sha1) {
    const existingHash = await sha1File(targetPath).catch(() => null);
    if (existingHash === file.hashes.sha1) {
      return targetPath;
    }
  }

  await downloadFileWithCandidates(
    file.downloads || [file.url],
    targetPath,
    "classes-custom",
    path.basename(file.path || targetPath)
  );

  if (file?.hashes?.sha1) {
    const downloadedHash = await sha1File(targetPath);
    if (downloadedHash !== file.hashes.sha1) {
      if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
      throw new Error(`Arquivo ${file.path} baixado com hash invalido.`);
    }
  }

  return targetPath;
}

function remoteFabricVersion(versionInfo) {
  const id = formatFabricVersionId(versionInfo.minecraftVersion, versionInfo.loaderVersion);
  return {
    id,
    type: "fabric",
    url: `${FABRIC_META_ROOT}/${encodeURIComponent(versionInfo.minecraftVersion)}/${encodeURIComponent(
      versionInfo.loaderVersion
    )}/profile/json`,
    time: new Date().toISOString(),
    releaseTime: new Date().toISOString(),
    complianceLevel: null,
    installed: isVersionInstalled(id),
    local: false,
    inheritsFrom: versionInfo.minecraftVersion,
    remoteLoader: true,
    loaderType: "fabric",
    loaderVersion: versionInfo.loaderVersion,
    minecraftVersion: versionInfo.minecraftVersion,
  };
}

function remoteForgeVersion(versionInfo) {
  const id = formatForgeVersionId(versionInfo.minecraftVersion, versionInfo.loaderVersion);
  const urls = forgeInstallerUrls(versionInfo.minecraftVersion, versionInfo.loaderVersion);
  return {
    id,
    type: "forge",
    url: null,
    time: new Date().toISOString(),
    releaseTime: new Date().toISOString(),
    complianceLevel: null,
    installed: isVersionInstalled(id),
    local: false,
    inheritsFrom: versionInfo.minecraftVersion,
    remoteLoader: true,
    loaderType: "forge",
    loaderVersion: versionInfo.loaderVersion,
    minecraftVersion: versionInfo.minecraftVersion,
    installerUrl: urls[0],
    installerUrls: urls,
  };
}

async function prepareModpackBaseJson(versionInfo) {
  if (versionInfo.loaderType === "fabric") {
    const installedId = await installRemoteFabricVersion(remoteFabricVersion(versionInfo));
    const versionJson = readJson(getLocalVersionJsonPath(installedId), null);
    if (!versionJson) {
      throw new Error(`Nao foi possivel preparar o loader Fabric para ${versionInfo.minecraftVersion}.`);
    }
    return normalizeVersionShape(cloneJson(versionJson));
  }

  if (versionInfo.loaderType === "forge") {
    const installedId = await installRemoteForgeVersion(remoteForgeVersion(versionInfo));
    const versionJson = readJson(getLocalVersionJsonPath(installedId), null);
    if (!versionJson) {
      throw new Error(`Nao foi possivel preparar o loader Forge para ${versionInfo.minecraftVersion}.`);
    }
    return normalizeVersionShape(cloneJson(versionJson));
  }

  await ensureBaseVersionReady(versionInfo.minecraftVersion);
  return {
    id: versionInfo.minecraftVersion,
    inheritsFrom: versionInfo.minecraftVersion,
  };
}

function buildInstalledModpackVersionJson(modpackId, project, version, versionInfo, baseJson) {
  const versionJson = normalizeVersionShape(cloneJson(baseJson || {}));

  versionJson.id = modpackId;
  versionJson.type = "modpack";
  versionJson.inheritsFrom = versionJson.inheritsFrom || versionInfo.minecraftVersion;
  versionJson.time = new Date().toISOString();
  versionJson.releaseTime = version?.date_published || new Date().toISOString();
  versionJson.minecraftVersion = versionInfo.minecraftVersion;
  versionJson.loaderType = versionInfo.loaderType || "vanilla";
  versionJson.loaderVersion = versionInfo.loaderVersion || "";
  versionJson.modpackProjectId = project.projectId;
  versionJson.modpackVersionId = version.id;
  versionJson.modpackTitle = project.title || project.projectId;
  versionJson.modpackVersionNumber = version.version_number || version.name || version.id;
  if (project.author) {
    versionJson.modpackAuthor = project.author;
  }

  return versionJson;
}

async function installModpack(payload) {
  if (busy) throw new Error("Ja existe uma instalacao ou jogo em andamento.");
  if (!payload?.projectId) {
    throw new Error("Projeto do modpack nao informado.");
  }

  busy = true;
  const projectLabel = payload.title || payload.projectId;
  sendEvent("install", `Buscando modpack ${projectLabel}...`);

  // Reset global download tracker for this install session
  globalDownloadTracker = { totalBytes: 0, downloadedBytes: 0, filesDone: 0, filesTotal: 0, startTime: Date.now() };

  try {
    const projectVersions = await modrinthProjectVersions(payload.projectId);
    const selected = selectModpackVersionById(projectVersions, payload.versionId);
    const archiveFileName = selected.file.filename || `${selected.version.id}.mrpack`;
    const archivePath = modpackArchiveCachePath(
      payload.projectId,
      selected.version.id,
      archiveFileName
    );

    sendEvent(
      "debug",
      `Versao do modpack escolhida: ${selected.version.version_number || selected.version.id}`
    );

    if (!fs.existsSync(archivePath)) {
      await downloadFileWithCandidates(
        [selected.file.url],
        archivePath,
        "client-package",
        `Modpack ${projectLabel}`
      );
    }

    const archive = new AdmZip(archivePath);
    const modpackIndex = readModpackIndex(archive);
    if (modpackIndex.game && modpackIndex.game !== "minecraft") {
      throw new Error(`Jogo nao suportado pelo modpack: ${modpackIndex.game}`);
    }

    const versionInfo = modpackDependencyInfo(
      modpackIndex.dependencies && Object.keys(modpackIndex.dependencies).length
        ? modpackIndex.dependencies
        : selected.version.dependencies
    );

    if (!supportedModpackDependencyInfo(versionInfo)) {
      throw new Error(supportedModpackError(versionInfo));
    }

    const modpackId = modpackInstallVersionId(payload, selected.version);
    const versionDir = versionDirectory(modpackId);
    fs.mkdirSync(versionDir, { recursive: true });

    const baseJson = await prepareModpackBaseJson(versionInfo);

    // Compute total file count and total expected bytes for global progress
    const indexedFiles = (Array.isArray(modpackIndex.files) ? modpackIndex.files : []).filter(f => f?.path);
    const totalExpectedBytes = indexedFiles.reduce((sum, f) => sum + (Number(f.fileSize) || 0), 0);
    globalDownloadTracker.filesTotal = indexedFiles.length;
    globalDownloadTracker.totalBytes = totalExpectedBytes;
    globalDownloadTracker.startTime = Date.now();

    // Send install-start event with modpack name and file count
    sendEvent("install-start", `Baixando ${projectLabel}`, {
      modpackName: projectLabel,
      filesTotal: indexedFiles.length,
      totalBytes: totalExpectedBytes,
    });

    for (let i = 0; i < indexedFiles.length; i++) {
      await ensureModpackIndexedFile(indexedFiles[i], versionDir);
      globalDownloadTracker.filesDone = i + 1;
      // After each file completes, emit global progress update
      const globalPercent = globalDownloadTracker.filesTotal
        ? Math.round((globalDownloadTracker.filesDone / globalDownloadTracker.filesTotal) * 100)
        : 0;
      sendEvent("install-progress", `Baixando ${projectLabel}: ${globalPercent}%`, {
        silent: true,
        modpackName: projectLabel,
        filesDone: globalDownloadTracker.filesDone,
        filesTotal: globalDownloadTracker.filesTotal,
        downloadedBytes: globalDownloadTracker.downloadedBytes,
        totalBytes: globalDownloadTracker.totalBytes,
        startTime: globalDownloadTracker.startTime,
      });
    }

    extractModpackOverrides(archive, "overrides/", versionDir);
    extractModpackOverrides(archive, "client-overrides/", versionDir);

    const installedVersionJson = buildInstalledModpackVersionJson(
      modpackId,
      payload,
      selected.version,
      versionInfo,
      baseJson
    );
    writeJson(getLocalVersionJsonPath(modpackId), installedVersionJson);

    await loadVersions(true).catch(() => null);

    sendEvent("success", `${projectLabel} instalado com sucesso.`);
    return {
      ok: true,
      versionId: modpackId,
      title: projectLabel,
      versionNumber: selected.version.version_number || selected.version.id,
      projectId: payload.projectId,
    };
  } catch (error) {
    sendEvent("error", error.message || String(error));
    throw error;
  } finally {
    busy = false;
    globalDownloadTracker = null;
  }
}

async function loadCachedRemoteCatalog(name, force, loader) {
  const cachePath = remoteCatalogCachePath(name);
  if (!force) {
    const cached = readJson(cachePath, null);
    if (cached) return cached;
  }

  try {
    const result = await loader();
    writeJson(cachePath, result);
    return result;
  } catch (error) {
    const cached = readJson(cachePath, null);
    if (cached) {
      sendEvent("warning", `Falha ao atualizar ${name}; usando cache local.`);
      return cached;
    }
    throw error;
  }
}

async function mapWithConcurrency(items, limit, iteratee) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try {
        results[index] = await iteratee(items[index], index);
      } catch (_error) {
        results[index] = null;
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results.filter(Boolean);
}

function remoteCatalogCandidates(manifest) {
  const officialVersions = (manifest?.versions || [])
    .filter((version) => version.url && ["release", "snapshot"].includes(version.type))
    .sort(
      (left, right) =>
        new Date(right.releaseTime || right.time || 0) - new Date(left.releaseTime || left.time || 0)
    );

  const candidates = officialVersions
    .slice(0, REMOTE_GAME_VERSION_LIMIT)
    .map((version) => version.id);

  for (const localVersion of loadLocalVersions()) {
    for (const candidate of localBaseVersionCandidates(localVersion.id, {
      id: localVersion.id,
      inheritsFrom: localVersion.inheritsFrom,
      minecraftVersion: localVersion.inheritsFrom,
      libraries: [],
    })) {
      if (candidate) candidates.push(candidate);
    }
  }

  return [...new Set(candidates.filter(Boolean))];
}

async function loadFabricCatalog(manifest, force = false) {
  return loadCachedRemoteCatalog("fabric", force, async () => {
    const candidates = remoteCatalogCandidates(manifest);
    const releaseTimeById = new Map(
      (manifest?.versions || []).map((version) => [version.id, version.releaseTime || version.time])
    );

    const versions = await mapWithConcurrency(candidates, 6, async (minecraftVersion) => {
      const loaders = await fetchJson(
        `${FABRIC_META_ROOT}/${encodeURIComponent(minecraftVersion)}`,
        `Fabric ${minecraftVersion}`
      );
      const latest = Array.isArray(loaders) ? loaders[0] : null;
      if (!latest?.loader?.version) return null;

      const id = formatFabricVersionId(minecraftVersion, latest.loader.version);
      return {
        id,
        type: "fabric",
        url: `${FABRIC_META_ROOT}/${encodeURIComponent(minecraftVersion)}/${encodeURIComponent(
          latest.loader.version
        )}/profile/json`,
        time: releaseTimeById.get(minecraftVersion) || new Date().toISOString(),
        releaseTime: releaseTimeById.get(minecraftVersion) || new Date().toISOString(),
        complianceLevel: null,
        installed: isVersionInstalled(id),
        local: false,
        inheritsFrom: minecraftVersion,
        remoteLoader: true,
        loaderType: "fabric",
        loaderVersion: latest.loader.version,
        minecraftVersion,
        stable: latest.loader.stable !== false,
      };
    });

    return { versions };
  });
}

async function loadForgeCatalog(manifest, force = false) {
  return loadCachedRemoteCatalog("forge", force, async () => {
    const candidates = remoteCatalogCandidates(manifest);
    const versions = await mapWithConcurrency(candidates, 5, async (minecraftVersion) => {
      const list = await fetchJson(
        `${BMCL_API_ROOT}/forge/minecraft/${encodeURIComponent(minecraftVersion)}`,
        `Forge ${minecraftVersion}`
      );
      if (!Array.isArray(list) || !list.length) return null;

      const latest = [...list]
        .filter((item) =>
          Array.isArray(item?.files) &&
          item.files.some((file) => file?.category === "installer" && file?.format === "jar")
        )
        .sort((left, right) => {
        if ((right.build || 0) !== (left.build || 0)) {
          return (right.build || 0) - (left.build || 0);
        }
        return new Date(right.modified || 0) - new Date(left.modified || 0);
        })[0];

      if (!latest?.version) return null;
      const id = formatForgeVersionId(minecraftVersion, latest.version);
      return {
        id,
        type: "forge",
        url: null,
        time: latest.modified || new Date().toISOString(),
        releaseTime: latest.modified || new Date().toISOString(),
        complianceLevel: null,
        installed: isVersionInstalled(id),
        local: false,
        inheritsFrom: minecraftVersion,
        remoteLoader: true,
        loaderType: "forge",
        loaderVersion: latest.version,
        minecraftVersion,
        installerUrl: forgeInstallerUrls(minecraftVersion, latest.version, latest.branch || "")[0],
        installerUrls: forgeInstallerUrls(minecraftVersion, latest.version, latest.branch || ""),
      };
    });

    return { versions };
  });
}

async function loadOptiFineCatalog(_manifest, force = false) {
  return loadCachedRemoteCatalog("optifine", force, async () => {
    const list = await fetchJson(`${BMCL_API_ROOT}/optifine/versionlist`, "OptiFine");
    if (!Array.isArray(list)) return { versions: [] };

    const byGameVersion = new Map();
    for (const item of list) {
      if (!item?.mcversion || !item?.type || !item?.patch) continue;
      const lookupVersion = String(item.mcversion);
      const minecraftVersion = denormalizeOptiFineGameVersion(lookupVersion);
      const preview = isOptiFinePreviewItem(item);
      const current = byGameVersion.get(minecraftVersion);
      if (current && !current.preview) continue;
      if (current && current.preview && preview) continue;

      const optiFineVersion = `${item.type}_${item.patch}`;
      const id = formatOptiFineVersionId(minecraftVersion, optiFineVersion);
      byGameVersion.set(minecraftVersion, {
        id,
        type: "optifine",
        url: null,
        time: new Date().toISOString(),
        releaseTime: new Date().toISOString(),
        complianceLevel: null,
        installed: isVersionInstalled(id),
        local: false,
        inheritsFrom: minecraftVersion,
        remoteLoader: true,
        loaderType: "optifine",
        loaderVersion: optiFineVersion,
        minecraftVersion,
        preview,
        installerUrl: `${BMCL_API_ROOT}/optifine/${encodeURIComponent(
          normalizeOptiFineLookupVersion(minecraftVersion)
        )}/${encodeURIComponent(item.type)}/${encodeURIComponent(item.patch)}`,
      });
    }

    return {
      versions: Array.from(byGameVersion.values()).map((version) => {
        const { preview, ...rest } = version;
        return rest;
      }),
    };
  });
}

async function loadRemoteLoaderCatalogs(manifest, force = false) {
  const results = await Promise.allSettled([
    loadFabricCatalog(manifest, force),
    loadForgeCatalog(manifest, force),
    loadOptiFineCatalog(manifest, force),
  ]);

  return results.flatMap((result) => {
    if (result.status !== "fulfilled") return [];
    return result.value?.versions || [];
  });
}

async function ensureBaseVersionReady(versionId) {
  const meta = await resolveOfficialVersionMeta(versionId);
  const versionJson = await ensureVersionJson(meta);
  await ensureClientJar(meta, versionJson);
  return { meta, versionJson };
}

function libraryNameContains(library, value) {
  return String(library?.name || "").toLowerCase().includes(String(value || "").toLowerCase());
}

function findInstalledForgeVersionId(minecraftVersion, forgeVersion) {
  for (const entry of safeReadDirectory(path.join(minecraftRoot(), "versions"))) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const versionJson = readJson(getLocalVersionJsonPath(id), null);
    if (!versionJson) continue;
    if (String(versionJson.id || "").includes(forgeVersion) && versionJson.inheritsFrom === minecraftVersion) {
      return id;
    }
    const hasForgeLibrary = Array.isArray(versionJson.libraries) && versionJson.libraries.some((library) =>
      libraryNameContains(library, `net.minecraftforge:forge:${minecraftVersion}-${forgeVersion}`)
    );
    if (hasForgeLibrary) return id;
  }
  return null;
}

function patchLocalVersionType(id, type) {
  const versionJsonPath = getLocalVersionJsonPath(id);
  const versionJson = readJson(versionJsonPath, null);
  if (!versionJson) return;
  if (versionJson.type === type) return;
  versionJson.type = type;
  writeJson(versionJsonPath, versionJson);
}

function runJavaProcess(javaPath, args, cwd, label) {
  const result = spawnSync(javaPath || "java", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });

  const output = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  if (output) {
    sendEvent("debug", `${label}: ${output}`);
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${label} falhou com codigo ${result.status}.`);
  }
}

function removeJarEntry(filePath, entryName) {
  if (!fs.existsSync(filePath)) return;

  try {
    const zip = new AdmZip(filePath);
    zip.deleteFile(entryName);
    zip.writeZip(filePath);
  } catch (_error) {}
}

function optiFineLibraryDestination(artifact, version, fileName) {
  return path.join(minecraftRoot(), "libraries", "optifine", artifact, version, fileName);
}

function copyInstallerEntry(zip, entryName, destination) {
  const entry = zip.getEntry(entryName);
  if (!entry) return false;
  ensureParent(destination);
  fs.writeFileSync(destination, entry.getData());
  return true;
}

function readInstallerTextEntry(zip, entryName) {
  const entry = zip.getEntry(entryName);
  if (!entry) return null;
  return String(entry.getData().toString("utf8") || "").trim();
}

function readInstallerJsonEntry(zip, entryName) {
  const text = readInstallerTextEntry(zip, entryName);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

function legacyForgeInstallProfile(zip) {
  const profile = readInstallerJsonEntry(zip, "install_profile.json");
  if (!profile || typeof profile !== "object") return null;
  if (!profile.install || !profile.versionInfo) return null;
  return profile;
}

function installLegacyForgeFromInstaller(version, installerPath) {
  const zip = new AdmZip(installerPath);
  const profile = legacyForgeInstallProfile(zip);
  if (!profile) {
    throw new Error(`Instalador Forge legado invalido: ${version.id}`);
  }

  const installPath = String(profile.install?.path || "").trim();
  const filePath = String(profile.install?.filePath || "").trim();
  if (!installPath || !filePath) {
    throw new Error(`Instalador Forge legado sem path/filePath: ${version.id}`);
  }

  const forgeLibrary = normalizeVersionShape({ name: installPath });
  const forgeLibraryPath = libraryArtifactPath(forgeLibrary);
  if (!forgeLibraryPath) {
    throw new Error(`Nao foi possivel resolver a biblioteca principal do Forge ${version.id}.`);
  }
  if (!copyInstallerEntry(zip, filePath, forgeLibraryPath)) {
    throw new Error(`Arquivo ${filePath} nao existe dentro do instalador Forge ${version.id}.`);
  }

  const installedVersionJson = normalizeVersionShape(cloneJson(profile.versionInfo));
  installedVersionJson.id = version.id;
  installedVersionJson.type = "forge";
  installedVersionJson.time = installedVersionJson.time || new Date().toISOString();
  installedVersionJson.releaseTime = installedVersionJson.releaseTime || new Date().toISOString();

  const versionJsonPath = getLocalVersionJsonPath(version.id);
  fs.mkdirSync(versionDirectory(version.id), { recursive: true });
  writeJson(versionJsonPath, installedVersionJson);
  return version.id;
}

function isLegacyForgeInstaller(installerPath) {
  try {
    const zip = new AdmZip(installerPath);
    return Boolean(legacyForgeInstallProfile(zip));
  } catch (_error) {
    return false;
  }
}

function installOptiFineArtifacts(version, installerPath, javaPath) {
  const zip = new AdmZip(installerPath);
  const mavenVersion = `${version.minecraftVersion}_${version.loaderVersion}`;
  const outputLibrary = optiFineLibraryDestination(
    "OptiFine",
    mavenVersion,
    `OptiFine-${mavenVersion}.jar`
  );
  ensureParent(outputLibrary);

  if (zip.getEntry("optifine/Patcher.class")) {
    runJavaProcess(
      javaPath,
      [
        "-cp",
        installerPath,
        "optifine.Patcher",
        getLocalVersionJarPath(version.minecraftVersion),
        installerPath,
        outputLibrary,
      ],
      minecraftRoot(),
      "Patcher OptiFine"
    );
  } else {
    fs.copyFileSync(installerPath, outputLibrary);
  }

  if (!fs.existsSync(outputLibrary)) {
    throw new Error(`Biblioteca OptiFine ${mavenVersion} nao foi gerada.`);
  }

  removeJarEntry(outputLibrary, "META-INF/mods.toml");

  const libraries = [{ name: `optifine:OptiFine:${mavenVersion}` }];
  let hasCustomLaunchwrapper = false;

  const launchwrapperOfVersion = readInstallerTextEntry(zip, "launchwrapper-of.txt");
  if (launchwrapperOfVersion) {
    const launchwrapperOfJar = `launchwrapper-of-${launchwrapperOfVersion}.jar`;
    const destination = optiFineLibraryDestination(
      "launchwrapper-of",
      launchwrapperOfVersion,
      launchwrapperOfJar
    );
    if (copyInstallerEntry(zip, launchwrapperOfJar, destination)) {
      libraries.push({ name: `optifine:launchwrapper-of:${launchwrapperOfVersion}` });
      hasCustomLaunchwrapper = true;
    }
  }

  if (!hasCustomLaunchwrapper && zip.getEntry("launchwrapper-2.0.jar")) {
    const destination = optiFineLibraryDestination(
      "launchwrapper",
      "2.0",
      "launchwrapper-2.0.jar"
    );
    if (copyInstallerEntry(zip, "launchwrapper-2.0.jar", destination)) {
      libraries.push({ name: "optifine:launchwrapper:2.0" });
      hasCustomLaunchwrapper = true;
    }
  }

  if (!hasCustomLaunchwrapper) {
    libraries.push({ name: "net.minecraft:launchwrapper:1.12" });
    libraries.push({ name: "org.ow2.asm:asm-all:5.0.3" });
  }

  return libraries;
}

async function installRemoteFabricVersion(version) {
  await ensureBaseVersionReady(version.minecraftVersion);
  const versionJsonPath = getLocalVersionJsonPath(version.id);
  if (fs.existsSync(versionJsonPath)) {
    patchLocalVersionType(version.id, "fabric");
    return version.id;
  }

  sendEvent("install", `Preparando Fabric ${version.id}...`);
  const profileJson = await fetchJson(version.url, `Fabric ${version.id}`);
  const versionDir = versionDirectory(version.id);
  fs.mkdirSync(versionDir, { recursive: true });
  writeJson(versionJsonPath, {
    ...profileJson,
    id: version.id,
    type: "fabric",
    time: new Date().toISOString(),
    releaseTime: new Date().toISOString(),
  });
  return version.id;
}

async function installRemoteForgeVersion(version) {
  const { meta, versionJson } = await ensureBaseVersionReady(version.minecraftVersion);
  const expectedId = version.id;
  if (fs.existsSync(getLocalVersionJsonPath(expectedId))) {
    patchLocalVersionType(expectedId, "forge");
    return expectedId;
  }

  sendEvent("install", `Instalando Forge ${version.loaderVersion} para ${version.minecraftVersion}...`);
  const installerPath = installerCachePath(
    "forge",
    sanitizeFileName(expectedId),
    `forge-${sanitizeFileName(expectedId)}-installer.jar`
  );
  if (!fs.existsSync(installerPath)) {
    await downloadFileWithCandidates(
      version.installerUrls || [version.installerUrl],
      installerPath,
      "client-package",
      "Instalador Forge"
    );
  }

  if (isLegacyForgeInstaller(installerPath)) {
    sendEvent(
      "debug",
      `Instalador Forge legado detectado para ${version.minecraftVersion}; aplicando instalacao automatica sem CLI.`
    );
    return installLegacyForgeFromInstaller(version, installerPath);
  }

  const javaPath = resolveJavaPath({ ...meta, javaVersion: versionJson.javaVersion }, loadSettings());
  try {
    runJavaProcess(
      javaPath,
      ["-jar", installerPath, "--installClient", minecraftRoot()],
      minecraftRoot(),
      "Instalador Forge"
    );
  } catch (_error) {
    runJavaProcess(
      javaPath,
      ["-jar", installerPath, "--installClient"],
      minecraftRoot(),
      "Instalador Forge"
    );
  }

  const installedId = findInstalledForgeVersionId(version.minecraftVersion, version.loaderVersion) || expectedId;
  patchLocalVersionType(installedId, "forge");
  return installedId;
}

function optiFineLibraryNames(versionJson) {
  return Array.isArray(versionJson?.libraries)
    ? versionJson.libraries.map((library) => library?.name).filter(Boolean)
    : [];
}

function needsOptiFineRepair(version, versionJson) {
  if (!versionJson || typeof versionJson !== "object") return true;

  const libraries = optiFineLibraryNames(versionJson);
  const expectedOptiFineLibrary = `optifine:OptiFine:${version.minecraftVersion}_${version.loaderVersion}`;
  const hasOptiFineLibrary = libraries.includes(expectedOptiFineLibrary);
  const hasLaunchwrapperOf = libraries.some((name) => name.startsWith("optifine:launchwrapper-of:"));
  const hasLaunchwrapper2 = libraries.includes("optifine:launchwrapper:2.0");
  const hasLegacyLaunchwrapper = libraries.includes("net.minecraft:launchwrapper:1.12");
  const hasAsmSupport = libraries.some((name) => name.startsWith("org.ow2.asm:"));
  const hasAnySupportedLaunchwrapper = hasLaunchwrapperOf || hasLaunchwrapper2 || hasLegacyLaunchwrapper;
  const requiresCustomLaunchwrapper = isModernMinecraftVersion(version.minecraftVersion);
  const hasTweaker = hasOptiFineTweakerArgument(versionJson);

  if (!hasOptiFineLibrary || !hasAnySupportedLaunchwrapper) return true;
  if (!hasTweaker) return true;
  if (requiresCustomLaunchwrapper && !hasLaunchwrapperOf && !hasLaunchwrapper2) return true;
  if (!requiresCustomLaunchwrapper && hasLegacyLaunchwrapper && !hasAsmSupport) return true;
  return false;
}

async function installRemoteOptiFineVersion(version) {
  const { meta, versionJson } = await ensureBaseVersionReady(version.minecraftVersion);
  const versionJsonPath = getLocalVersionJsonPath(version.id);
  const existingVersionJson = readJson(versionJsonPath, null);
  const repairRequired = needsOptiFineRepair(version, existingVersionJson);

  if (existingVersionJson && !repairRequired) {
    patchLocalVersionType(version.id, "optifine");
    return version.id;
  }

  sendEvent(
    "install",
    repairRequired
      ? `Reparando OptiFine ${version.loaderVersion} para ${version.minecraftVersion}...`
      : `Preparando OptiFine ${version.loaderVersion} para ${version.minecraftVersion}...`
  );
  const installerPath = installerCachePath(
    "optifine",
    sanitizeFileName(version.id),
    `OptiFine-${sanitizeFileName(version.id)}-installer.jar`
  );
  if (!fs.existsSync(installerPath)) {
    await downloadFile(version.installerUrl, installerPath, "client-package", "Instalador OptiFine");
  }

  const javaPath = resolveJavaPath({ ...meta, javaVersion: versionJson.javaVersion }, loadSettings());

  if (repairRequired) {
    fs.rmSync(versionDirectory(version.id), { recursive: true, force: true });
  }

  const libraries = installOptiFineArtifacts(version, installerPath, javaPath);
  const optiFineTweaker = "optifine.OptiFineTweaker";
  const installedVersionJson = {
    id: version.id,
    type: "optifine",
    inheritsFrom: version.minecraftVersion,
    javaVersion: versionJson.javaVersion || null,
    time: new Date().toISOString(),
    releaseTime: new Date().toISOString(),
    mainClass: "net.minecraft.launchwrapper.Launch",
    libraries,
  };

  if (hasLegacyGameArguments(versionJson)) {
    installedVersionJson.minecraftArguments = appendTweakClassArgument(
      versionJson.minecraftArguments,
      optiFineTweaker
    );
  }

  installedVersionJson.arguments = {
    game: ["--tweakClass", optiFineTweaker],
  };

  fs.mkdirSync(versionDirectory(version.id), { recursive: true });
  writeJson(versionJsonPath, installedVersionJson);

  if (needsOptiFineRepair(version, installedVersionJson)) {
    throw new Error(`OptiFine ${version.id} nao foi preparado corretamente em segundo plano.`);
  }

  patchLocalVersionType(version.id, "optifine");
  return version.id;
}

async function installRemoteLoaderVersion(version) {
  if (version.loaderType === "fabric") {
    return installRemoteFabricVersion(version);
  }
  if (version.loaderType === "forge") {
    return installRemoteForgeVersion(version);
  }
  if (version.loaderType === "optifine") {
    return installRemoteOptiFineVersion(version);
  }
  throw new Error(`Loader remoto nao suportado: ${version.loaderType}`);
}

function findMatchingLocalForgeJar(id, library) {
  const artifactPath = libraryArtifactPath(library);
  const expectedName = artifactPath ? path.basename(artifactPath).toLowerCase() : "";
  const parsed = parseMavenName(library?.name);
  const candidates = versionDirectoryJars(id).filter((filePath) =>
    path.basename(filePath).toLowerCase().includes("forge")
  );

  if (!candidates.length) return null;

  const exact = candidates.find(
    (filePath) => path.basename(filePath).toLowerCase() === expectedName
  );
  if (exact) return exact;

  const expectedIsInstaller = expectedName.includes("installer");
  const version = parsed?.version?.toLowerCase() || "";
  return (
    candidates.find((filePath) => {
      const name = path.basename(filePath).toLowerCase();
      if (!expectedIsInstaller && name.includes("installer")) return false;
      return version && name.includes(version);
    }) || null
  );
}

function ensureLocalForgeLibraries(id, launchJson) {
  for (const library of launchJson?.libraries || []) {
    if (!isForgeLibrary(library)) continue;

    const artifactPath = libraryArtifactPath(library);
    if (!artifactPath || fs.existsSync(artifactPath)) continue;

    const localForgeJar = findMatchingLocalForgeJar(id, library);
    if (!localForgeJar) continue;

    ensureParent(artifactPath);
    fs.copyFileSync(localForgeJar, artifactPath);
    sendEvent(
      "debug",
      `Forge local usado: ${localForgeJar} -> ${artifactPath}`
    );
  }
}

function modernForgeClientJar(versionJson) {
  const mainClass = String(versionJson?.mainClass || "").toLowerCase();
  if (!mainClass.includes("bootstraplauncher")) return null;

  const libraries = Array.isArray(versionJson?.libraries) ? versionJson.libraries : [];
  const fmlloader = libraries.find((library) =>
    String(library?.name || "").startsWith("net.minecraftforge:fmlloader:")
  );
  const fmlloaderVersion = String(fmlloader?.name || "").split(":")[2] || "";
  if (!fmlloaderVersion) return null;

  const clientJar = path.join(
    minecraftRoot(),
    "libraries",
    "net",
    "minecraftforge",
    "forge",
    fmlloaderVersion,
    `forge-${fmlloaderVersion}-client.jar`
  );
  if (fs.existsSync(clientJar)) return clientJar;

  const universalJar = path.join(
    minecraftRoot(),
    "libraries",
    "net",
    "minecraftforge",
    "forge",
    fmlloaderVersion,
    `forge-${fmlloaderVersion}-universal.jar`
  );
  if (fs.existsSync(universalJar)) return universalJar;

  return null;
}

function preferredMinecraftJar(versionJson, fallbackJarPath) {
  return modernForgeClientJar(versionJson) || fallbackJarPath || null;
}

function currentMinecraftOs() {
  if (process.platform === "win32") return "windows";
  if (process.platform === "darwin") return "osx";
  return "linux";
}

function ruleMatches(rule) {
  if (!rule || typeof rule !== "object") return true;
  const os = rule.os || null;
  if (os?.name && os.name !== currentMinecraftOs()) return false;
  if (os?.arch && os.arch !== process.arch) return false;
  if (rule.features) return false;
  return true;
}

function shouldUseArgument(arg) {
  if (!arg || typeof arg !== "object" || !Array.isArray(arg.rules)) return true;

  let allowed = false;
  for (const rule of arg.rules) {
    if (!ruleMatches(rule)) continue;
    allowed = rule.action === "allow";
  }
  return allowed;
}

function nativeDirectoryForVersion(versionJson, id) {
  const versionId = versionJson?.id || id;
  const minor = Number.parseInt(String(versionId).split(".")[1], 10);
  if (!Number.isNaN(minor) && minor >= 19) return minecraftRoot();
  return path.join(minecraftRoot(), "natives", versionId);
}

function jvmPlaceholderMap(versionJson, id) {
  return {
    "${natives_directory}": nativeDirectoryForVersion(versionJson, id),
    "${launcher_name}": LAUNCHER_NAME,
    "${launcher_version}": app.getVersion?.() || LAUNCHER_VERSION,
    "${classpath_separator}": process.platform === "win32" ? ";" : ":",
    "${library_directory}": path.join(minecraftRoot(), "libraries"),
    "${version_name}": id,
  };
}

function replaceJvmPlaceholders(value, placeholders) {
  let output = value;
  for (const [placeholder, replacement] of Object.entries(placeholders)) {
    output = output.split(placeholder).join(replacement);
  }
  return output;
}

function argumentValues(arg) {
  if (typeof arg === "string" || typeof arg === "number") return [String(arg)];
  if (!arg || typeof arg !== "object" || !shouldUseArgument(arg)) return [];

  const raw = arg.value || arg.values;
  if (Array.isArray(raw)) return raw.map(String);
  if (raw === undefined || raw === null) return [];
  return [String(raw)];
}

function extractJvmArgs(versionJson, id) {
  const args = Array.isArray(versionJson?.arguments?.jvm)
    ? versionJson.arguments.jvm
    : [];
  const values = [];
  const placeholders = jvmPlaceholderMap(versionJson, id);

  for (let index = 0; index < args.length; index++) {
    const list = argumentValues(args[index]);
    for (let itemIndex = 0; itemIndex < list.length; itemIndex++) {
      const item = list[itemIndex];
      const next =
        list[itemIndex + 1] || argumentValues(args[index + 1])[0] || "";
      if (
        ["-cp", "-classpath", "--class-path"].includes(item) &&
        String(next).includes("${classpath}")
      ) {
        itemIndex += 1;
        continue;
      }

      if (item.includes("${classpath}")) continue;

      const replaced = replaceJvmPlaceholders(item, placeholders);
      if (replaced.includes("${")) continue;
      values.push(replaced);
    }
  }

  return values;
}

function directoryHasFiles(directory, depth = 2) {
  for (const entry of safeReadDirectory(directory)) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile()) return true;
    if (entry.isDirectory() && depth > 0 && directoryHasFiles(fullPath, depth - 1)) {
      return true;
    }
  }
  return false;
}

function directoryHasEntries(directory) {
  return safeReadDirectory(directory).length > 0;
}

function versionGameDirectory(id) {
  const directory = versionDirectory(id);

  try {
    if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
      return null;
    }

    const hasInstanceFiles =
      fs.existsSync(path.join(directory, "options.txt")) ||
      directoryHasFiles(path.join(directory, "mods")) ||
      directoryHasFiles(path.join(directory, "config")) ||
      directoryHasEntries(path.join(directory, "saves")) ||
      directoryHasEntries(path.join(directory, "resourcepacks")) ||
      directoryHasEntries(path.join(directory, "shaderpacks"));

    return hasInstanceFiles ? directory : null;
  } catch (_error) {
    return null;
  }
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
      ...version,
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
    if (cached) {
      const remoteVersions = await loadRemoteLoaderCatalogs(cached, false).catch(() => []);
      return normalizeManifest({
        ...cached,
        versions: [...cached.versions, ...remoteVersions],
      });
    }
  }

  try {
    const response = await fetch(VERSION_MANIFEST_URL, {
      headers: { "User-Agent": HTTP_USER_AGENT },
    });
    if (!response.ok) {
      throw new Error(`Manifest HTTP ${response.status}`);
    }
    const manifest = await response.json();
    writeJson(cachePath, manifest);
    const remoteVersions = await loadRemoteLoaderCatalogs(manifest, force).catch(() => []);
    return normalizeManifest({
      ...manifest,
      versions: [...manifest.versions, ...remoteVersions],
    });
  } catch (error) {
    const cached = readJson(cachePath, null);
    if (cached) {
      sendEvent("warning", "Falha ao atualizar versoes; usando cache local.");
      const remoteVersions = await loadRemoteLoaderCatalogs(cached, false).catch(() => []);
      return normalizeManifest({
        ...cached,
        versions: [...cached.versions, ...remoteVersions],
      });
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
  const versionDir = versionDirectory(version.id);
  const versionJsonPath = path.join(versionDir, `${version.id}.json`);
  const existing = readJson(versionJsonPath, null);

  if (existing && existing.id === version.id && existing.downloads?.client?.url) {
    return existing;
  }

  const meta = await resolveVersionMeta(version);
  if (!meta.url) throw new Error(`Manifesto da versao ${version.id} sem URL.`);

  sendEvent("install", `Baixando manifesto da versao ${version.id}...`);
  const response = await fetch(meta.url, {
    headers: { "User-Agent": HTTP_USER_AGENT },
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
      headers: { "User-Agent": HTTP_USER_AGENT },
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

      // Update global download tracker if active (modpack install)
      if (globalDownloadTracker) {
        globalDownloadTracker.downloadedBytes += chunk.length;
      }

      const now = Date.now();
      if (now - lastEmit > 250 || current === total) {
        lastEmit = now;
        const percent = total ? Math.round((current / total) * 100) : 0;
        sendEvent("download-status", `${label}: ${percent}%`, {
          silent: true,
          status: { type, current, total, label },
          // Include global tracker data so renderer can show aggregate progress
          global: globalDownloadTracker ? {
            downloadedBytes: globalDownloadTracker.downloadedBytes,
            totalBytes: globalDownloadTracker.totalBytes,
            filesDone: globalDownloadTracker.filesDone,
            filesTotal: globalDownloadTracker.filesTotal,
            startTime: globalDownloadTracker.startTime,
          } : null,
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

async function downloadFileWithCandidates(urls, destination, type, label) {
  const candidates = [...new Set((Array.isArray(urls) ? urls : [urls]).filter(Boolean))];
  let lastError = null;

  for (const url of candidates) {
    try {
      await downloadFile(url, destination, type, label);
      return;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`${label}: nenhuma URL de download disponivel.`);
}

async function ensureClientJar(version, versionJson) {
  const download = versionJson.downloads?.client;
  if (!download?.url) {
    throw new Error(`A versao ${version.id} nao possui download de cliente.`);
  }

  const jarPath = path.join(versionDirectory(version.id), `${version.id}.jar`);

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
  const localJarPath = findLocalVersionJar(version.id);
  const gameDirectory = versionGameDirectory(version.id);

  if (version.remoteLoader) {
    const installedId = await installRemoteLoaderVersion(version);
    return ensureVersionFiles({
      ...version,
      id: installedId,
      local: true,
      remoteLoader: false,
    });
  }

  if (version.local || localJson) {
    if (!localJson) {
      if (localJarPath) {
        return {
          ...version,
          launchNumber: version.id,
          custom: null,
          type: version.type || "local",
          minecraftJar: localJarPath,
          gameDirectory,
        };
      }
      throw new Error(`Versao local ${version.id} sem JSON valido.`);
    }

    const normalizedLocalJson = normalizeVersionShape(cloneJson(localJson));
    const explicitBaseId = localJson.inheritsFrom || localJson.jar || null;
    const selfContainedLocalVersion = isSelfContainedLocalVersion(
      normalizedLocalJson,
      localJarPath
    );
    const baseMeta = explicitBaseId
      ? await resolveOfficialVersionMeta(explicitBaseId)
      : selfContainedLocalVersion
        ? null
      : await resolveFirstOfficialVersionMeta(
          localBaseVersionCandidates(version.id, normalizedLocalJson)
        );

    if (selfContainedLocalVersion) {
      sendEvent(
        "debug",
        `Usando JSON local completo da versao ${version.id} sem mesclar manifesto oficial.`
      );
    }

    if (baseMeta) {
      const baseJson = await ensureVersionJson(baseMeta);
      if (explicitBaseId || !localJarPath) {
        await ensureClientJar(baseMeta, baseJson);
      }

      const launchJson = mergeInheritedVersion(baseJson, normalizedLocalJson);
      ensureLocalForgeLibraries(version.id, launchJson);
      await ensureLocalLaunchLibraries(version.id, launchJson);
      const launchJsonFile = writeNormalizedLaunchJson(version.id, launchJson);

      return {
        ...version,
        type: localJson.type || version.type || "custom",
        launchNumber: version.id,
        custom: null,
        inheritsFrom: baseMeta.id,
        javaVersion: launchJson.javaVersion || baseJson.javaVersion || null,
        launchJsonPath: launchJsonFile,
        minecraftJar: preferredMinecraftJar(
          launchJson,
          localJarPath || getLocalVersionJarPath(baseMeta.id)
        ),
        classes: resolveLaunchClassPaths(launchJson, version.id),
        gameDirectory,
        extraJvmArgs: extractJvmArgs(
          normalizedLocalJson,
          version.id
        ),
      };
    }

    if (localJson.downloads?.client?.url) {
      const launchJson = normalizedLocalJson;
      ensureLocalForgeLibraries(version.id, launchJson);
      await ensureLocalLaunchLibraries(version.id, launchJson);
      const launchJsonFile = writeNormalizedLaunchJson(version.id, launchJson);
      if (!localJarPath) {
        await ensureClientJar({ ...version, id: version.id }, launchJson);
      }
      return {
        ...version,
        type: localJson.type || version.type || "local",
        launchNumber: version.id,
        custom: null,
        javaVersion: launchJson.javaVersion || null,
        launchJsonPath: launchJsonFile,
        minecraftJar: preferredMinecraftJar(
          launchJson,
          findLocalVersionJar(version.id) || getLocalVersionJarPath(version.id)
        ),
        classes: resolveLaunchClassPaths(launchJson, version.id),
        gameDirectory,
        extraJvmArgs: extractJvmArgs(launchJson, version.id),
      };
    }

    if (localJarPath) {
      const launchJson = normalizedLocalJson;
      ensureLocalForgeLibraries(version.id, launchJson);
      await ensureLocalLaunchLibraries(version.id, launchJson);
      const launchJsonFile = writeNormalizedLaunchJson(version.id, launchJson);
      return {
        ...version,
        type: localJson.type || version.type || "local",
        launchNumber: version.id,
        custom: null,
        javaVersion: launchJson.javaVersion || null,
        launchJsonPath: launchJsonFile,
        minecraftJar: preferredMinecraftJar(launchJson, localJarPath),
        classes: resolveLaunchClassPaths(launchJson, version.id),
        gameDirectory,
        extraJvmArgs: extractJvmArgs(launchJson, version.id),
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
    javaVersion: versionJson.javaVersion || null,
    gameDirectory,
  };
}

function launcherOptions(version, authorization, settings) {
  const selectedType = version.type || "release";
  const launchNumber = version.launchNumber || version.inheritsFrom || version.id;
  const instanceCwd = version.gameDirectory || (version.local ? versionDirectory(version.id) : null);
  const resolvedAuthorization = { ...authorization };
  resolvedAuthorization.user_properties =
    typeof resolvedAuthorization.user_properties === "string"
      ? resolvedAuthorization.user_properties
      : JSON.stringify(resolvedAuthorization.user_properties || {});
  resolvedAuthorization.meta = {
    ...resolvedAuthorization.meta,
    clientId: resolvedAuthorization.meta?.clientId || "00000000402b5328",
  };

  return {
    clientPackage: null,
    authorization: resolvedAuthorization,
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
    javaPath: resolveJavaPath(version, settings),
    customArgs: [
      "-Djava.net.preferIPv4Stack=true",
      "-Djava.net.preferIPv4Addresses=true",
      "-Dsun.net.client.defaultConnectTimeout=20000",
      "-Dsun.net.client.defaultReadTimeout=20000",
      ...(version.extraJvmArgs || []),
    ],
    window: {
      width: clampNumber(settings.windowWidth, 854, 3840, 1280),
      height: clampNumber(settings.windowHeight, 480, 2160, 720),
      fullscreen: false,
    },
    overrides: {
      detached: false,
      maxSockets: 8,
      cwd: instanceCwd || undefined,
      classes: version.classes,
      versionJson: version.launchJsonPath,
      minecraftJar: version.minecraftJar,
      gameDirectory: version.gameDirectory || undefined,
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
  const context = activeLaunchContext;

  client.on("debug", (message) => sendEvent("debug", message));
  client.on("data", (message) => {
    sendEvent("game", message);
    try {
      const text = String(message || "");
      if (
        text.includes("ClassCastException") &&
        text.includes("URLClassLoader")
      ) {
        sendEvent(
          "error",
          "Erro de ClassCastException detectado (URLClassLoader). Isso indica runtime Java incompatível para esta versão modded. O launcher agora prioriza automaticamente um runtime legacy compatível quando ele existe no sistema."
        );
      }
    } catch (_e) {}
  });
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
  client.on("close", (code) => finalizeLaunchContext(context, code, "client-close"));
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
    const authorization = await getAuthorization();
    const preparedVersion = await ensureVersionFiles(input.version);
    const client = mode === "install" ? new InstallOnlyClient() : new Client();
    const launchContext = {
      mode,
      versionId: preparedVersion.id,
      finished: false,
      process: null,
      processListeners: null,
    };
    activeLaunchContext = launchContext;
    wireLauncher(client);
    const options = launcherOptions(preparedVersion, authorization, settings);
    sendEvent(
      "debug",
      options.javaPath
        ? `Java selecionado: ${options.javaPath}`
        : "Java selecionado: java do sistema"
    );
    // Warn if this version needs Java 8 but no compatible Java was found
    if (isLegacyJavaNeeded(preparedVersion)) {
      if (!options.javaPath) {
        sendEvent(
          "error",
          "AVISO: Esta versao requer Java 8, mas nenhum Java 8 foi encontrado no sistema. " +
          "Configure o caminho do Java 8 nas configuracoes (campo 'Java') ou instale o Java 8. " +
          "O jogo pode falhar ao iniciar."
        );
      } else {
        sendEvent("debug", "Runtime Java 8 (legacy) selecionado automaticamente.");
      }
    }
    if (options.overrides.gameDirectory) {
      sendEvent(
        "debug",
        `Diretorio da instancia: ${options.overrides.gameDirectory}`
      );
    }
    if (options.overrides.cwd && options.overrides.cwd !== options.root) {
      sendEvent("debug", `Diretorio de trabalho da instancia: ${options.overrides.cwd}`);
    }

    const idleGuard = createIdleGuard(
      180000,
      "Download sem progresso por 3 minutos. Verifique a internet e tente novamente."
    );
    activeIdleGuard = idleGuard;

    activeProcess = await Promise.race([
      client.launch(options),
      idleGuard.promise,
    ]);
    if (mode !== "install") {
      watchLaunchProcess(activeProcess, launchContext);
    }
    stopIdleGuard();

    if (mode === "install" && !client.installSucceeded) {
      clearLaunchContext(launchContext);
      throw new Error("A instalacao nao foi concluida. Veja o log para detalhes.");
    }

    if (!activeProcess && mode !== "install") {
      clearLaunchContext(launchContext);
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
    stopIdleGuard();
    if (activeLaunchContext) {
      clearLaunchContext(activeLaunchContext);
    } else {
      busy = false;
      activeProcess = null;
    }
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
    accounts: publicAccounts(),
    busy,
    versions,
    settings,
    paths: {
      data: app.getPath("userData"),
      minecraft: minecraftRoot(),
    },
  };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    resizable: true,
    maximizable: true,
    title: "Socios Client",
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: "#09090b",
    icon: path.join(app.getAppPath(), "taskbar-logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId(LAUNCHER_NAME);
  }
  ipcMain.handle("state:get", () => getState());
  ipcMain.handle("versions:refresh", () => loadVersions(true));
  ipcMain.handle("version:uninstall", (_event, payload) => uninstallVersion(payload));
  ipcMain.handle("modpacks:search", (_event, query, filters) => searchModpacks(query, filters || {}));
  ipcMain.handle("modpacks:versions", (_event, projectId) => getModpackVersions(projectId));
  ipcMain.handle("modpacks:install", (_event, payload) => installModpack(payload));
  ipcMain.handle("account:add", async () => {
    try {
      return await addMicrosoftAccount();
    } catch (err) {
      if (err.message === "error.gui.closed") return null;
      throw err;
    }
  });
  ipcMain.handle("account:addLocal", (_event, username) => addLocalAccount(username));
  ipcMain.handle("account:remove", (_event, payload) => {
    deleteAccount(payload?.accountId);
    sendEvent("success", "Conta removida.");
    return null;
  });
  ipcMain.handle("account:setActive", (_event, accountId) => {
    setActiveAccount(accountId);
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

  ipcMain.on("window:minimize", () => {
    if (mainWindow) mainWindow.minimize();
  });
  ipcMain.on("window:maximize", () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    }
  });
  ipcMain.on("window:close", () => {
    if (mainWindow) mainWindow.close();
  });

  ipcMain.on("log:append", (_event, { type, message }) => {
    const logData = { type, message, time: Date.now() };
    logHistory.push(logData);
    if (logHistory.length > 1000) logHistory.shift();
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.webContents.send("log:event", logData);
    }
  });

  ipcMain.on("window:openLog", () => {
    if (logWindow && !logWindow.isDestroyed()) {
      logWindow.focus();
      return;
    }
    logWindow = new BrowserWindow({
      width: 800,
      height: 600,
      title: "Socios Client - Log",
      backgroundColor: "#09090b",
      autoHideMenuBar: true,
      icon: path.join(app.getAppPath(), "taskbar-logo.png"),
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    logWindow.loadFile(path.join(__dirname, "renderer", "log.html"));
    logWindow.on("closed", () => {
      logWindow = null;
    });
    logWindow.webContents.on("did-finish-load", () => {
      logWindow.webContents.send("log:init", logHistory);
    });
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
