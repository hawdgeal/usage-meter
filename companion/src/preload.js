// The only bridge between the app's pages and the main process.
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("companion", {
  getState: () => ipcRenderer.invoke("state"),
  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  refresh: (app) => ipcRenderer.invoke("refresh", app),
  setSettings: (patch) => ipcRenderer.invoke("settings", patch),
  panelState: (site, patch) => ipcRenderer.invoke("panel-state", site, patch),
  openUrl: (url) => ipcRenderer.invoke("open-url", url),
  resize: (h) => ipcRenderer.invoke("resize", h),
  popupApp: (app) => ipcRenderer.invoke("popup-app", app),
  openSettings: () => ipcRenderer.invoke("open-settings"),
  hide: () => ipcRenderer.invoke("hide"),
  connectBrowsers: () => ipcRenderer.invoke("connect-browsers"),
  miniMenu: () => ipcRenderer.invoke("mini-menu"),
});
