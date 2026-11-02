import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import { Worker } from "node:worker_threads";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { locations } from "./locations";
import type {
  EntryDetails,
  Preferences,
  ScanProgress,
  ScanSummary,
  ViewQuery,
} from "../src/shared/types";

// A standard explicit profile path also permits testing packaged apps without
// touching a user's normal preferences or recent locations.
const profilePath = app.commandLine.getSwitchValue("user-data-dir");
if (profilePath) app.setPath("userData", path.resolve(profilePath));
else if (!app.isPackaged && process.env.SPACESCAN_TEST_PROFILE)
  app.setPath("userData", process.env.SPACESCAN_TEST_PROFILE);
let window: BrowserWindow | null = null,
  worker: Worker | null = null;
let requestId = 0,
  busy = false,
  scanning = false;
let lastPath = "";
let lastProgress: ScanProgress | null = null;
let cancelTimer: NodeJS.Timeout | null = null;
const pending = new Map<
  number,
  {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  }
>();
const allowedPaths = new Set<string>();
let preferences: Preferences = {
  language: "zh",
  theme: "system",
  metric: "logical",
  recent: [],
};
const home = app.getPath("home");
const devURL = !app.isPackaged ? process.env.SPACESCAN_DEV_URL : undefined;
const rendererURL =
  devURL ? new URL(devURL).href : pathToFileURL(path.join(__dirname, "../dist/index.html")).href;
function rpc<T>(
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!worker) {
      reject(new Error("Scanner unavailable. Restart SpaceScan."));
      return;
    }
    const id = ++requestId;
    const timer = setTimeout(
      () => {
        pending.delete(id);
        reject(new Error("The disk is not responding. Try a smaller folder."));
      },
      method === "export" ? 300_000 : 30_000,
    );
    pending.set(id, { resolve: (value) => resolve(value as T), reject, timer });
    worker.postMessage({ id, method, args });
  });
}
function startWorker() {
  worker = new Worker(path.join(__dirname, "worker.cjs"));
  const instance = worker;
  worker.on(
    "message",
    (message: {
      id?: number;
      value: unknown;
      error?: string;
      event?: string;
    }) => {
      if (message.event === "progress") {
        const progress = message.value as ScanProgress;
        lastProgress = progress;
        scanning = progress.state === "scanning";
        if (!scanning && cancelTimer) {
          clearTimeout(cancelTimer);
          cancelTimer = null;
        }
        if (progress.rootPath) {
          lastPath = progress.rootPath;
          allowedPaths.add(lastPath);
        }
        if (window && !window.isDestroyed())
          window.webContents.send("progress", progress);
        return;
      }
      const handler = pending.get(message.id!);
      if (!handler) return;
      pending.delete(message.id!);
      clearTimeout(handler.timer);
      if (message.error) handler.reject(new Error(message.error));
      else handler.resolve(message.value);
    },
  );
  worker.on("error", (cause: unknown) => {
    if (worker !== instance) return;
    worker = null;
    const error = cause instanceof Error ? cause : new Error(String(cause));
    for (const handler of pending.values()) {
      clearTimeout(handler.timer);
      handler.reject(error);
    }
    pending.clear();
    scanning = false;
    lastProgress = {
      scanId: "",
      state: "failed",
      rootPath: lastPath,
      entries: 0,
      files: 0,
      bytes: 0,
      elapsedMs: 0,
      currentPath: "",
      issues: 0,
      message: error.message,
    };
    window?.webContents.send("progress", lastProgress);
  });
}
let preferenceSave = Promise.resolve();
function savePreferences() {
  const contents = JSON.stringify(preferences, null, 2);
  preferenceSave = preferenceSave
    .catch(() => {})
    .then(async () => {
      const directory = app.getPath("userData");
      await mkdir(directory, { recursive: true });
      const destination = path.join(directory, "preferences.json");
      await writeFile(`${destination}.tmp`, contents, { mode: 0o600 });
      await rename(`${destination}.tmp`, destination);
    });
  return preferenceSave;
}
function validateSender(event: IpcMainInvokeEvent) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    event.senderFrame.url !== rendererURL
  )
    throw new Error("Untrusted application frame.");
}
function handle(name: string, fn: (...args: unknown[]) => unknown) {
  ipcMain.handle(name, (event, ...args) => {
    validateSender(event);
    return fn(...args);
  });
}
function validateNode(id: unknown, scanId: unknown): Record<string, unknown> {
  if (
    !Number.isSafeInteger(id) ||
    Number(id) < 0 ||
    typeof scanId !== "string" ||
    scanId.length > 64
  )
    throw new Error("Invalid entry.");
  if (scanning || busy)
    throw new Error("Wait for the current operation to finish.");
  return { nodeId: id, scanId, home };
}
function validateQuery(value: unknown): ViewQuery {
  const q = value as ViewQuery;
  if (
    !q ||
    typeof q !== "object" ||
    typeof q.scanId !== "string" ||
    q.scanId.length > 64 ||
    !Number.isSafeInteger(q.parentId) ||
    q.parentId < 0 ||
    !["logical", "allocated"].includes(q.metric) ||
    !["name", "size", "modified"].includes(q.sort) ||
    typeof q.descending !== "boolean" ||
    typeof q.search !== "string" ||
    q.search.length > 512 ||
    ![
      "all",
      "folder",
      "image",
      "video",
      "audio",
      "archive",
      "code",
      "document",
      "other",
      "link",
    ].includes(q.category) ||
    !Number.isSafeInteger(q.offset) ||
    q.offset < 0 ||
    !Number.isSafeInteger(q.limit) ||
    q.limit < 1 ||
    q.limit > 200
  )
    throw new Error("Invalid view request.");
  return q;
}
async function scan(root: unknown) {
  if (typeof root !== "string" || !allowedPaths.has(root))
    throw new Error("Select this folder using the folder picker first.");
  if (busy || scanning)
    throw new Error("Wait for the current operation to finish.");
  if (!worker) startWorker();
  scanning = true;
  lastPath = root;
  try {
    await rpc("scan", { path: root });
  } catch (error) {
    scanning = false;
    throw error;
  }
  preferences.recent = [
    root,
    ...preferences.recent.filter((p) => p !== root),
  ].slice(0, 6);
  await savePreferences();
}
function createWindow() {
  window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 650,
    title: "SpaceScan",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#14161b" : "#f7f8fa",
    show: false,
    titleBarStyle: "default",
    autoHideMenuBar: process.platform !== "darwin",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== rendererURL) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );
  window.webContents.session.setPermissionCheckHandler(() => false);
  window.once("ready-to-show", () => window?.show());
  window.on("closed", () => {
    window = null;
  });
  void window.loadURL(rendererURL);
}

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  void app.whenReady().then(async () => {
    try {
      const loaded = JSON.parse(
        await readFile(
          path.join(app.getPath("userData"), "preferences.json"),
          "utf8",
        ),
      );
      preferences = {
        language: loaded.language === "en" ? "en" : "zh",
        theme: ["light", "dark", "system"].includes(loaded.theme)
          ? loaded.theme
          : "system",
        metric:
          loaded.metric === "allocated" && process.platform !== "win32"
            ? "allocated"
            : "logical",
        recent: Array.isArray(loaded.recent)
          ? loaded.recent
              .filter(
                (p: unknown) => typeof p === "string" && path.isAbsolute(p),
              )
              .slice(0, 6)
          : [],
      };
    } catch {
      /* New profile or recoverable invalid preference file. */
    }
    nativeTheme.themeSource = preferences.theme;
    for (const item of await locations(home, preferences.recent))
      allowedPaths.add(item.path);
    startWorker();
    handle("bootstrap", async () => ({
      version: app.getVersion(),
      platform: process.platform,
      preferences,
      locations: await locations(home, preferences.recent),
      progress: lastProgress,
    }));
    handle("chooseFolder", async () => {
      if (scanning || busy)
        throw new Error("Wait for the current operation to finish.");
      const result = await dialog.showOpenDialog(window!, {
        properties: ["openDirectory"],
        title: "SpaceScan",
      });
      const selected = result.canceled ? null : (result.filePaths[0] ?? null);
      if (selected) allowedPaths.add(selected);
      return selected;
    });
    handle("scan", scan);
    handle("cancel", async () => {
      await rpc("cancel");
      if (scanning && !cancelTimer)
        cancelTimer = setTimeout(() => {
          if (!scanning) return;
          const stuckWorker = worker;
          worker = null;
          scanning = false;
          cancelTimer = null;
          stuckWorker?.removeAllListeners();
          void stuckWorker?.terminate();
          for (const handler of pending.values()) {
            clearTimeout(handler.timer);
            handler.reject(new Error("Scan stopped."));
          }
          pending.clear();
          lastProgress = {
            scanId: "",
            state: "failed",
            rootPath: lastPath,
            entries: 0,
            files: 0,
            bytes: 0,
            elapsedMs: 0,
            currentPath: "",
            issues: 0,
            message:
              preferences.language === "zh"
                ? "文件系统未响应，扫描已停止。请选择可访问的目录重试。"
                : "The filesystem did not respond. The scan was stopped. Try an accessible folder.",
          };
          window?.webContents.send("progress", lastProgress);
          startWorker();
        }, 5000);
    });
    handle("summary", () => rpc<ScanSummary | null>("summary"));
    handle("view", (q: unknown) => rpc("view", { ...validateQuery(q) }));
    handle("details", (id: unknown, scanId: unknown) =>
      rpc("details", validateNode(id, scanId)),
    );
    handle("reveal", async (id: unknown, scanId: unknown) => {
      const result = await rpc<EntryDetails>(
        "details",
        validateNode(id, scanId),
      );
      shell.showItemInFolder(result.path);
    });
    handle("copyPath", async (id: unknown, scanId: unknown) => {
      const result = await rpc<EntryDetails>(
        "details",
        validateNode(id, scanId),
      );
      clipboard.writeText(result.path);
    });
    handle("trash", async (id: unknown, scanId: unknown) => {
      const args = validateNode(id, scanId);
      busy = true;
      try {
        const details = await rpc<EntryDetails>("details", args);
        if (!details.canTrash)
          throw new Error("This entry cannot be moved to Trash.");
        const zh = preferences.language === "zh";
        const result = await dialog.showMessageBox(window!, {
          type: "warning",
          title: "SpaceScan",
          message: zh
            ? `将“${details.entry.name}”移到回收站？`
            : `Move “${details.entry.name}” to Trash?`,
          detail: `${details.path}\n\n${zh ? "文件夹及其内容会一起移入系统回收站。实际释放空间取决于回收站和文件系统。" : "Folders and their contents will be moved to the system Trash / Recycle Bin. Reclaimed space depends on the Trash and filesystem."}`,
          buttons: zh ? ["取消", "移到回收站"] : ["Cancel", "Move to Trash"],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
        });
        if (result.response !== 1) return false;
        const target = await rpc<string>("validateTrash", args);
        await shell.trashItem(target);
        return true;
      } finally {
        busy = false;
      }
    });
    handle("exportCSV", async (value: unknown) => {
      const query = validateQuery(value);
      if (scanning || busy)
        throw new Error("Wait for the current operation to finish.");
      busy = true;
      try {
        const result = await dialog.showSaveDialog(window!, {
          defaultPath: "SpaceScan.csv",
          filters: [{ name: "CSV", extensions: ["csv"] }],
        });
        if (result.canceled || !result.filePath) return false;
        return await rpc("export", {
          scanId: query.scanId,
          query,
          destination: result.filePath,
        });
      } finally {
        busy = false;
      }
    });
    handle("preferences", async (update: unknown) => {
      if (!update || typeof update !== "object")
        throw new Error("Invalid preferences.");
      const p = update as Partial<Preferences>;
      if (p.language && ["zh", "en"].includes(p.language))
        preferences.language = p.language;
      if (p.theme && ["light", "dark", "system"].includes(p.theme))
        preferences.theme = p.theme;
      if (p.metric && ["logical", "allocated"].includes(p.metric))
        preferences.metric =
          process.platform === "win32" ? "logical" : p.metric;
      nativeTheme.themeSource = preferences.theme;
      await savePreferences();
      return preferences;
    });
    const send = (action: string) => window?.webContents.send("menu", action);
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === "darwin"
          ? [
              {
                label: "SpaceScan",
                submenu: [
                  { role: "about" as const },
                  { type: "separator" as const },
                  { role: "hide" as const },
                  { role: "hideOthers" as const },
                  { type: "separator" as const },
                  { role: "quit" as const },
                ],
              },
            ]
          : []),
        {
          label: "File",
          submenu: [
            {
              label: "Scan Folder…",
              accelerator: "CmdOrCtrl+O",
              click: () => send("open"),
            },
            {
              label: "Rescan",
              accelerator: "CmdOrCtrl+R",
              click: () => send("rescan"),
            },
            { type: "separator" },
            { role: "close" },
          ],
        },
        { role: "editMenu" },
        {
          label: "View",
          submenu: [
            { role: "resetZoom" },
            { role: "zoomIn" },
            { role: "zoomOut" },
            { role: "togglefullscreen" },
          ],
        },
        {
          label: "Help",
          submenu: [{ label: "SpaceScan Help", click: () => send("help") }],
        },
      ]),
    );
    createWindow();
    app.on("activate", () => {
      if (!window) createWindow();
    });
  });
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => {
  void worker?.terminate();
  for (const handler of pending.values()) clearTimeout(handler.timer);
});
