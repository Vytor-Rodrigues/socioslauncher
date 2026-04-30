const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Client } = require("minecraft-launcher-core");
const { Auth } = require("msmc");

const VERSION_MANIFEST_URL =
  "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const LAUNCHER_NAME = "Nexus MC Launcher";
const LAUNCHER_VERSION = "0.1.0";

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
    console.warn(`[Nexus]: Failed to read ${filePath}`, error);
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
    logFontSize: clampNumber(input.logFontSize, 8, 36, 12),
    javaPath: typeof input.javaPath === "string" ? input.javaPath.trim() : "",
    java8Path: typeof input.java8Path === "string" ? input.java8Path.trim() : "",
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

  const preferredMajor = isLegacyJavaNeeded(version) ? 8 : null;
  const inspected = candidates
    .map((candidate) => ({ path: candidate, info: javaVersionInfo(candidate) }))
    .filter((candidate) => candidate.info);

  if (preferredMajor !== null) {
    const preferred = inspected.find((candidate) => candidate.info.major === preferredMajor);
    if (preferred) return preferred.path;
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
    const candidate = version.launchNumber || version.inheritsFrom || version.id || "";
    const match = minecraftVersionFromText(candidate);
    if (match && match.startsWith("1.")) {
      const parts = match.split(".");
      const minor = Number.parseInt(parts[1], 10);
      if (!Number.isNaN(minor) && minor <= 8) return true;
    }

    if (version.launchJsonPath && fs.existsSync(version.launchJsonPath)) {
      const json = readJson(version.launchJsonPath, null);
      if (json && typeof json.mainClass === "string") {
        const mc = json.mainClass.toLowerCase();
        if (mc.includes("launchwrapper") || mc.includes("fml") || mc.includes("forge")) return true;
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
    ...localAdditionalLibraries(id),
  ]);
}

async function ensureLocalLaunchLibraries(id, versionJson) {
  for (const library of versionLaunchLibraries(versionJson, id)) {
    if (!library || libraryRuleBlocked(library)) continue;

    const artifactPath = libraryArtifactPath(library);
    if (!artifactPath || fs.existsSync(artifactPath)) continue;

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

function hasStructuredGameArguments(versionJson) {
  return Array.isArray(versionJson?.arguments?.game) && versionJson.arguments.game.length > 0;
}

function hasLegacyGameArguments(versionJson) {
  return typeof versionJson?.minecraftArguments === "string" &&
    versionJson.minecraftArguments.trim().length > 0;
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

function uniqueLibraries(libraries) {
  const seen = new Set();
  const output = [];

  for (const library of libraries.filter(Boolean)) {
    const key = library.name || JSON.stringify(library);
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
        minecraftJar: localJarPath || getLocalVersionJarPath(baseMeta.id),
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
        minecraftJar: findLocalVersionJar(version.id) || getLocalVersionJarPath(version.id),
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
        minecraftJar: localJarPath,
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

function launcherOptions(version, minecraftSession, settings) {
  const selectedType = version.type || "release";
  const launchNumber = version.launchNumber || version.inheritsFrom || version.id;
  const instanceCwd = version.gameDirectory || (version.local ? versionDirectory(version.id) : null);
  const authorization = minecraftSession.mclc();
  authorization.user_properties = JSON.stringify(
    authorization.user_properties || {}
  );
  authorization.meta = {
    ...authorization.meta,
    clientId: authorization.meta?.clientId || "00000000402b5328",
  };

  return {
    clientPackage: null,
    authorization,
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
    const options = launcherOptions(preparedVersion, minecraft, settings);
    sendEvent(
      "debug",
      options.javaPath
        ? `Java selecionado: ${options.javaPath}`
        : "Java selecionado: java do sistema"
    );
    if (
      options.javaPath &&
      !settings.javaPath &&
      !settings.java8Path &&
      isLegacyJavaNeeded(preparedVersion)
    ) {
      sendEvent("debug", "Runtime Java legacy compativel detectado automaticamente.");
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
