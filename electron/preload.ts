import { contextBridge, ipcRenderer } from "electron";
import type { AppAPI, ScanProgress } from "../src/shared/types";
const api: AppAPI = {
  runtime: {
    sandboxed: !!process.sandboxed,
    contextIsolated: !!process.contextIsolated,
  },
  bootstrap: () => ipcRenderer.invoke("bootstrap"),
  chooseFolder: () => ipcRenderer.invoke("chooseFolder"),
  scan: (path) => ipcRenderer.invoke("scan", path),
  cancel: () => ipcRenderer.invoke("cancel"),
  summary: () => ipcRenderer.invoke("summary"),
  view: (query) => ipcRenderer.invoke("view", query),
  details: (id, scanId) => ipcRenderer.invoke("details", id, scanId),
  reveal: (id, scanId) => ipcRenderer.invoke("reveal", id, scanId),
  copyPath: (id, scanId) => ipcRenderer.invoke("copyPath", id, scanId),
  trash: (id, scanId) => ipcRenderer.invoke("trash", id, scanId),
  exportCSV: (query) => ipcRenderer.invoke("exportCSV", query),
  preferences: (update) => ipcRenderer.invoke("preferences", update),
  onProgress: (callback) => {
    const listener = (_: unknown, value: ScanProgress) => callback(value);
    ipcRenderer.on("progress", listener);
    return () => ipcRenderer.removeListener("progress", listener);
  },
  onMenu: (callback) => {
    const listener = (_: unknown, value: "open" | "rescan" | "help") =>
      callback(value);
    ipcRenderer.on("menu", listener);
    return () => ipcRenderer.removeListener("menu", listener);
  },
};
contextBridge.exposeInMainWorld("spacescan", api);
