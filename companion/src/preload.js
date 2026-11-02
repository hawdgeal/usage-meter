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
  connectBrowsers: () => ipcRenderer.invoke("connect-browsers"),
  miniMenu: () => ipcRenderer.invoke("mini-menu"),
  togglePin: () => ipcRenderer.invoke("toggle-pin"),
  dragStart: () => ipcRenderer.invoke("drag-start"),
  dragEnd: () => ipcRenderer.invoke("drag-end"),
  // edge: "left" or "right"; the companion follows the pointer until widthEnd
  widthStart: (edge) => ipcRenderer.invoke("width-start", edge),
  widthEnd: () => ipcRenderer.invoke("width-end"),
  // The companion's own look: the editor saves it; Settings imports or resets it.
  saveLook: (site, value) => ipcRenderer.invoke("save-look", site, value),
  importLook: (site) => ipcRenderer.invoke("look-import", site),
  resetLook: (site) => ipcRenderer.invoke("look-reset", site),
  customize: (app) => ipcRenderer.invoke("customize", app),
  // Screen color picker: pickColor resolves to "#rrggbb" or null. The picker layer uses the other two.
  pickColor: () => ipcRenderer.invoke("pick-color"),
  onPicker: (cb) => ipcRenderer.on("picker", (_e, p) => cb(p)),
  pickerDone: (pick) => ipcRenderer.invoke("picker-done", !!pick),
  // true while the pointer is over this window (the companion polls the cursor)
  onHover: (cb) => ipcRenderer.on("hover", (_e, on) => cb(!!on)),
});
