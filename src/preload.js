const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("launcherApi", {
  getState: () => ipcRenderer.invoke("state:get"),
  refreshVersions: () => ipcRenderer.invoke("versions:refresh"),
  addAccount: () => ipcRenderer.invoke("account:add"),
  removeAccount: () => ipcRenderer.invoke("account:remove"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  installMinecraft: (payload) => ipcRenderer.invoke("minecraft:install", payload),
  launchMinecraft: (payload) => ipcRenderer.invoke("minecraft:launch", payload),
  openMinecraftFolder: () => ipcRenderer.invoke("paths:openMinecraft"),
  onEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("launcher:event", listener);
    return () => ipcRenderer.removeListener("launcher:event", listener);
  },
});
