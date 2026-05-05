const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcherApi", {
  getState: () => ipcRenderer.invoke("state:get"),
  refreshVersions: () => ipcRenderer.invoke("versions:refresh"),
  uninstallVersion: (payload) => ipcRenderer.invoke("version:uninstall", payload),
  searchModpacks: (query, filters) => ipcRenderer.invoke("modpacks:search", query, filters),
  getModpackVersions: (projectId) => ipcRenderer.invoke("modpacks:versions", projectId),
  installModpack: (payload) => ipcRenderer.invoke("modpacks:install", payload),
  addAccount: () => ipcRenderer.invoke("account:add"),
  addLocalAccount: (username) => ipcRenderer.invoke("account:addLocal", username),
  removeAccount: (payload) => ipcRenderer.invoke("account:remove", payload),
  setActiveAccount: (accountId) => ipcRenderer.invoke("account:setActive", accountId),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  installMinecraft: (payload) => ipcRenderer.invoke("minecraft:install", payload),
  launchMinecraft: (payload) => ipcRenderer.invoke("minecraft:launch", payload),
  openMinecraftFolder: () => ipcRenderer.invoke("paths:openMinecraft"),
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
  openLogWindow: () => ipcRenderer.send("window:openLog"),
  appendLog: (type, message) => ipcRenderer.send("log:append", { type, message }),
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launcher:event", listener);
    return () => ipcRenderer.removeListener("launcher:event", listener);
  },
  onLogInit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("log:init", listener);
    return () => ipcRenderer.removeListener("log:init", listener);
  },
  onLogEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("log:event", listener);
    return () => ipcRenderer.removeListener("log:event", listener);
  },
});
