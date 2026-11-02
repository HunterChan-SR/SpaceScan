import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  File,
  Folder,
  FolderOpen,
  HardDrive,
  HelpCircle,
  Home,
  LayoutGrid,
  List,
  LoaderCircle,
  MoreHorizontal,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  X,
  AlertCircle,
  Link2,
} from "lucide-react";
import type {
  Bootstrap,
  Category,
  DirectoryView,
  Entry,
  EntryDetails,
  Preferences,
  ScanProgress,
  ScanSummary,
  ViewQuery,
} from "./shared/types";
import { formatBytes, categoryColors } from "./shared/categories";
import { translator } from "./i18n";
import { Treemap } from "./Treemap";

const api = window.spacescan;
const defaultPreferences: Preferences = {
  language: "zh",
  theme: "system",
  metric: "logical",
  recent: [],
};
function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className={`brand ${small ? "small" : ""}`}>
      <span className="brand-symbol">
        <i />
        <i />
        <i />
        <i />
      </span>
      {!small && (
        <span>
          Space<span className="brand-light">Scan</span>
        </span>
      )}
    </div>
  );
}
function EntryIcon({ entry, size = 17 }: { entry: Entry; size?: number }) {
  const Icon =
    entry.kind === "directory" ? Folder : entry.kind === "link" ? Link2 : File;
  return <Icon size={size} style={{ color: categoryColors[entry.category] }} />;
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={close}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
      aria-labelledby="modal-title"
    >
      <div className="dialog-body">
        <div className="dialog-heading">
          <h2 id="modal-title">{title}</h2>
          <button className="icon-button" onClick={close} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function App() {
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [prefs, setPrefs] = useState(defaultPreferences);
  const t = useMemo(() => translator(prefs.language), [prefs.language]);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [view, setView] = useState<DirectoryView | null>(null);
  const [parentId, setParentId] = useState(0);
  const [selected, setSelected] = useState<EntryDetails | null>(null);
  const [search, setSearch] = useState(""),
    [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");
  const [sort, setSort] = useState<ViewQuery["sort"]>("size"),
    [descending, setDescending] = useState(true);
  const [offset, setOffset] = useState(0),
    [mode, setMode] = useState<"map" | "list">("map");
  const [modal, setModal] = useState<"help" | "settings" | "issues" | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [working, setWorking] = useState(false),
    [loadingView, setLoadingView] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const viewRequest = useRef(0),
    detailRequest = useRef(0);
  const scanning = progress?.state === "scanning";
  const blocked = scanning || working;
  const fail = useCallback(
    (error: unknown) =>
      setNotice({
        text:
          error instanceof Error
            ? error.message.replace(
                /^Error invoking remote method '[^']+': Error: /,
                "",
              )
            : String(error),
        error: true,
      }),
    [],
  );

  useEffect(() => {
    if (!api) {
      fail("SpaceScan needs its desktop runtime. Start it with npm run dev.");
      return;
    }
    const unsubscribe = api.onProgress((next) => {
      setProgress(next);
      if (next.state === "scanning") {
        setSummary(null);
        setView(null);
        setSelected(null);
        setParentId(0);
        setOffset(0);
        detailRequest.current++;
        viewRequest.current++;
      } else if (next.state === "failed") {
        setSummary(null);
        setView(null);
        setSelected(null);
        fail(next.message ?? "Scan failed");
      } else {
        void api.summary().then(setSummary).catch(fail);
        void api
          .bootstrap()
          .then((value) => {
            setBoot(value);
            setPrefs(value.preferences);
          })
          .catch(fail);
      }
    });
    void api
      .bootstrap()
      .then((value) => {
        setBoot(value);
        setPrefs(value.preferences);
        if (value.progress) setProgress(value.progress);
      })
      .catch(fail);
    void api
      .summary()
      .then((value) => {
        if (value) {
          setSummary(value);
          setProgress(value);
        }
      })
      .catch(() => {});
    return unsubscribe;
  }, [fail]);
  useEffect(() => {
    document.documentElement.lang = prefs.language === "zh" ? "zh-CN" : "en";
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        prefs.theme === "system"
          ? media.matches
            ? "dark"
            : "light"
          : prefs.theme);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [prefs]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setOffset(0);
    }, 200);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "f") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const query = useMemo<ViewQuery>(
    () => ({
      scanId: summary?.scanId ?? "",
      parentId,
      metric: prefs.metric,
      sort,
      descending,
      search: debouncedSearch,
      category,
      offset,
      limit: 100,
    }),
    [
      summary?.scanId,
      parentId,
      prefs.metric,
      sort,
      descending,
      debouncedSearch,
      category,
      offset,
    ],
  );
  useEffect(() => {
    if (!summary) return;
    const request = ++viewRequest.current;
    setLoadingView(true);
    void api
      .view(query)
      .then((result) => {
        if (request === viewRequest.current) setView(result);
      })
      .catch((error) => {
        if (request === viewRequest.current) fail(error);
      })
      .finally(() => {
        if (request === viewRequest.current) setLoadingView(false);
      });
  }, [query, summary, fail]);
  const start = useCallback(
    async (location?: string) => {
      if (blocked) return;
      setWorking(true);
      setNotice(null);
      try {
        const root = location ?? (await api.chooseFolder());
        if (root) {
          setSearch("");
          setDebouncedSearch("");
          setCategory("all");
          setOffset(0);
          await api.scan(root);
        }
      } catch (error) {
        fail(error);
      } finally {
        setWorking(false);
      }
    },
    [blocked, fail],
  );
  useEffect(
    () =>
      api?.onMenu((action) => {
        if (action === "open") void start();
        else if (action === "rescan" && progress?.rootPath)
          void start(progress.rootPath);
        else if (action === "help") setModal("help");
      }),
    [start, progress?.rootPath],
  );
  async function select(entry: Entry) {
    const request = ++detailRequest.current;
    try {
      const details = await api.details(entry.id, entry.scanId);
      if (request === detailRequest.current) setSelected(details);
    } catch (error) {
      fail(error);
    }
  }
  function navigate(entry: Entry) {
    if (entry.kind !== "directory") {
      void select(entry);
      return;
    }
    setParentId(entry.id);
    setSearch("");
    setDebouncedSearch("");
    setCategory("all");
    setOffset(0);
    setSelected(null);
    detailRequest.current++;
  }
  async function updatePreferences(update: Partial<Preferences>) {
    try {
      setPrefs(await api.preferences(update));
    } catch (error) {
      fail(error);
    }
  }
  async function entryAction(action: "reveal" | "copyPath" | "trash") {
    if (!selected || blocked) return;
    setWorking(true);
    try {
      const value = await api[action](selected.entry.id, selected.entry.scanId);
      if (action === "copyPath") setNotice({ text: t("copied") });
      if (action === "trash" && value && summary) {
        setSelected(null);
        await api.scan(summary.rootPath);
      }
    } catch (error) {
      fail(error);
    } finally {
      setWorking(false);
    }
  }
  async function exportCSV() {
    setWorking(true);
    try {
      if (await api.exportCSV(query)) setNotice({ text: t("exported") });
    } catch (error) {
      fail(error);
    } finally {
      setWorking(false);
    }
  }
  function changeSort(value: ViewQuery["sort"]) {
    if (sort === value) setDescending(!descending);
    else {
      setSort(value);
      setDescending(value !== "name");
    }
    setOffset(0);
  }
  const activePath = progress?.rootPath;
  const count = new Intl.NumberFormat(prefs.language).format(
    progress?.files ?? 0,
  );
  const duration = progress
    ? `${(progress.elapsedMs / 1000).toFixed(1)} s`
    : "—";
  const hasFilter = !!debouncedSearch || category !== "all";
  const ratioBase = hasFilter ? summary?.root : view?.parent;
  const ratio =
    selected && ratioBase?.[query.metric]
      ? Math.min(
          100,
          (selected.entry[query.metric] / ratioBase[query.metric]) * 100,
        )
      : 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="tagline">{t("tagline")}</p>
        <button
          className="primary choose-sidebar"
          onClick={() => void start()}
          disabled={blocked}
        >
          <FolderOpen size={17} />
          {t("choose")}
        </button>
        <div className="sidebar-scroll">
          <h2 className="eyebrow">{t("locations")}</h2>
          {boot?.locations
            .filter((item) => item.kind !== "recent")
            .map((item) => (
              <button
                className={`location ${activePath === item.path ? "active" : ""}`}
                key={item.path}
                disabled={blocked}
                title={item.path}
                onClick={() => void start(item.path)}
              >
                {item.kind === "home" ? (
                  <Home size={18} />
                ) : (
                  <HardDrive size={18} />
                )}
                <span>
                  <strong>
                    {item.kind === "home"
                      ? prefs.language === "zh"
                        ? "个人文件夹"
                        : "Home folder"
                      : item.name}
                  </strong>
                  <small>
                    {item.available === undefined
                      ? item.path
                      : `${formatBytes(item.available)} ${prefs.language === "zh" ? "可用" : "free"}`}
                  </small>
                </span>
                {activePath === item.path && <span className="active-dot" />}
              </button>
            ))}
          {(boot?.locations.some((item) => item.kind === "recent") ||
            prefs.recent.length > 0) && (
            <h2 className="eyebrow recent-heading">{t("recent")}</h2>
          )}
          {(boot?.locations.filter((item) => item.kind === "recent") ?? []).map(
            (item) => (
              <button
                className={`location ${activePath === item.path ? "active" : ""}`}
                key={item.path}
                disabled={blocked}
                title={item.path}
                onClick={() => void start(item.path)}
              >
                <Clock3 size={17} />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.path}</small>
                </span>
              </button>
            ),
          )}
        </div>
        <div className="sidebar-footer">
          <span className="privacy">
            <ShieldCheck size={15} />
            {t("local")}
          </span>
          <div>
            <button onClick={() => setModal("settings")}>
              <Settings2 size={16} />
              {t("settings")}
            </button>
            <button
              className="icon-button"
              onClick={() => setModal("help")}
              aria-label={t("help")}
            >
              <HelpCircle size={18} />
            </button>
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="location-title">
            <HardDrive size={20} />
            <span>
              {view?.parent.name ??
                (activePath
                  ? activePath.split(/[/\\]/).filter(Boolean).pop() ||
                    activePath
                  : "SpaceScan")}
              <small title={view?.path ?? activePath}>
                {view?.path ?? activePath ?? t("privacy")}
              </small>
            </span>
          </div>
          <div className="top-actions">
            {summary && (
              <button
                className="subtle"
                onClick={() => void exportCSV()}
                disabled={blocked}
              >
                <Download size={16} />
                {t("export")}
              </button>
            )}
            {activePath && (
              <button
                className={scanning ? "stop-button" : "subtle"}
                onClick={() =>
                  scanning
                    ? void api.cancel().catch(fail)
                    : void start(activePath)
                }
                disabled={working}
              >
                {scanning ? <Square size={14} /> : <RefreshCw size={16} />}
                {t(scanning ? "cancel" : "rescan")}
              </button>
            )}
          </div>
        </header>
        {notice && (
          <div
            className={`notice ${notice.error ? "error" : ""}`}
            role={notice.error ? "alert" : "status"}
          >
            {notice.error ? <AlertCircle size={17} /> : <Check size={17} />}
            <span>{notice.text}</span>
            <button
              className="icon-button"
              onClick={() => setNotice(null)}
              aria-label={t("close")}
            >
              <X size={16} />
            </button>
          </div>
        )}
        {!progress && (
          <section className="welcome">
            <div className="welcome-map" aria-hidden="true">
              <div className="art-a">
                <span>SpaceScan</span>
                <i />
                <i />
                <i />
              </div>
              <div className="art-b">
                <i />
                <i />
              </div>
              <div className="art-c" />
              <div className="art-d">
                <i />
                <i />
                <i />
              </div>
            </div>
            <span className="welcome-kicker">YOUR SPACE, AT A GLANCE</span>
            <h1>{t("welcome")}</h1>
            <p>{t("welcomeText")}</p>
            <p className="welcome-hint">{t("welcomeHint")}</p>
            <button
              className="primary large"
              onClick={() => void start()}
              disabled={!boot || blocked}
            >
              {working ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <FolderOpen size={19} />
              )}
              {t("choose")}
              <span className="shortcut">
                {boot?.platform === "darwin" ? "⌘" : "Ctrl"} O
              </span>
            </button>
            <div className="welcome-foot">
              <ShieldCheck size={15} />
              {t("offline")}
            </div>
          </section>
        )}
        {progress && (
          <>
            <section className="stats">
              <div className="stat primary-stat">
                <span>{t("total")}</span>
                <strong>
                  {formatBytes(summary?.root.logical ?? progress.bytes)}
                </strong>
              </div>
              <div className="stat">
                <span>{t("files")}</span>
                <strong>{count}</strong>
              </div>
              <div className="stat">
                <span>{t("duration")}</span>
                <strong>{duration}</strong>
              </div>
              <div className="stat">
                <span>{t("free")}</span>
                <strong>
                  {summary?.available == null
                    ? "—"
                    : formatBytes(summary.available)}
                </strong>
              </div>
            </section>
            {scanning && (
              <section className="scanning-panel" aria-live="polite">
                <div className="scan-orbit">
                  <Brand small />
                </div>
                <h2>
                  {t("scanning")}
                  <span className="animated-dots">…</span>
                </h2>
                <p>{t("busyHint")}</p>
                <div className="scan-progress">
                  <i />
                </div>
                <code title={progress.currentPath}>{progress.currentPath}</code>
                <small>
                  {new Intl.NumberFormat(prefs.language).format(
                    progress.entries,
                  )}{" "}
                  {t("items")}
                </small>
              </section>
            )}
            {progress.state === "failed" && (
              <section className="empty-state">
                <AlertCircle size={36} />
                <h2>{t("failed")}</h2>
                <p>{progress.message}</p>
                <button className="primary" onClick={() => void start()}>
                  {t("choose")}
                </button>
              </section>
            )}
            {summary && (
              <>
                <div className="scan-status">
                  <span>
                    <i
                      className={
                        summary.state === "complete"
                          ? "status-dot"
                          : "status-dot warning"
                      }
                    />
                    {t(
                      summary.state === "cancelled"
                        ? "cancelled"
                        : summary.state === "limited"
                          ? "limited"
                          : "complete",
                    )}
                    <span className="status-divider">·</span>
                    {new Date(summary.completedAt).toLocaleDateString(
                      prefs.language,
                    )}
                  </span>
                  {summary.issues > 0 && (
                    <button
                      className="warning-link"
                      onClick={() => setModal("issues")}
                    >
                      <AlertCircle size={14} />
                      {t("issues")} ({summary.issues})
                    </button>
                  )}
                </div>
                <section className="explorer">
                  <div className="explorer-main">
                    <div className="explorer-toolbar">
                      <div className="segmented">
                        <button
                          className={mode === "map" ? "active" : ""}
                          onClick={() => setMode("map")}
                          aria-label={t("map")}
                        >
                          <LayoutGrid size={16} />
                          {t("map")}
                        </button>
                        <button
                          className={mode === "list" ? "active" : ""}
                          onClick={() => setMode("list")}
                          aria-label={t("list")}
                        >
                          <List size={17} />
                          {t("list")}
                        </button>
                      </div>
                      <label className="metric">
                        <select
                          aria-label={t("size")}
                          value={prefs.metric}
                          onChange={(event) =>
                            void updatePreferences({
                              metric: event.target
                                .value as Preferences["metric"],
                            })
                          }
                        >
                          <option value="logical">{t("logical")}</option>
                          {summary.allocatedSupported && (
                            <option value="allocated">{t("allocated")}</option>
                          )}
                        </select>
                        <button
                          className="icon-button"
                          onClick={() => setModal("help")}
                          aria-label={t("metricHelp")}
                        >
                          <HelpCircle size={14} />
                        </button>
                      </label>
                    </div>
                    <nav className="breadcrumbs" aria-label="Breadcrumbs">
                      <button
                        className="icon-button"
                        title={t("up")}
                        aria-label={t("up")}
                        disabled={
                          !view || view.parent.parentId === null || blocked
                        }
                        onClick={() => {
                          const parent = view?.breadcrumbs.at(-2);
                          if (parent) navigate(parent);
                        }}
                      >
                        <ArrowLeft size={17} />
                      </button>
                      {view?.breadcrumbs.map((entry, index) => (
                        <span key={entry.id}>
                          {index > 0 && <ChevronRight size={13} />}
                          <button
                            title={entry.name}
                            disabled={blocked}
                            className={
                              index === view.breadcrumbs.length - 1
                                ? "current"
                                : ""
                            }
                            onClick={() => navigate(entry)}
                          >
                            {entry.id === 0 && <HardDrive size={13} />}
                            {entry.name}
                          </button>
                        </span>
                      ))}
                    </nav>
                    {mode === "map" && (
                      <>
                        <div className="map-container">
                          {view && view.parent[query.metric] > 0 ? (
                            <Treemap
                              entries={view.map}
                              total={view.parent[query.metric]}
                              metric={query.metric}
                              selected={selected?.entry.id ?? null}
                              groupedLabel={t("grouped")}
                              onSelect={(entry) => void select(entry)}
                              onOpen={navigate}
                            />
                          ) : (
                            <div className="empty-map">
                              <LayoutGrid size={30} />
                              <span>
                                {loadingView ? t("loading") : t("zeroMap")}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="map-caption">
                          <span>{t("mapHint")}</span>
                          <span>
                            {view
                              ? formatBytes(view.parent[query.metric])
                              : "—"}
                          </span>
                        </div>
                      </>
                    )}
                    <div className="file-tools">
                      <label className="search">
                        <Search size={16} />
                        <input
                          ref={searchRef}
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder={t("search")}
                          aria-label={t("search")}
                          maxLength={512}
                        />
                        {search && (
                          <button
                            className="icon-button"
                            onClick={() => setSearch("")}
                            aria-label={t("clear")}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </label>
                      <select
                        value={category}
                        aria-label={t("all")}
                        onChange={(event) => {
                          setCategory(event.target.value as Category | "all");
                          setOffset(0);
                        }}
                      >
                        {(
                          [
                            "all",
                            "folder",
                            "video",
                            "image",
                            "audio",
                            "archive",
                            "code",
                            "document",
                            "other",
                            "link",
                          ] as const
                        ).map((value) => (
                          <option key={value} value={value}>
                            {t(value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {hasFilter && (
                      <div className="filter-note">
                        {view?.total ?? 0} {t("matching")}
                        <button
                          onClick={() => {
                            setSearch("");
                            setCategory("all");
                          }}
                        >
                          {t("clear")}
                        </button>
                      </div>
                    )}
                    <div
                      className={`file-table-wrap ${mode === "list" ? "expanded" : ""}`}
                      aria-busy={loadingView}
                    >
                      <table className="file-table">
                        <thead>
                          <tr>
                            <th>
                              <button onClick={() => changeSort("name")}>
                                {t("name")}
                                {sort === "name" && (
                                  <ArrowDown
                                    size={12}
                                    className={!descending ? "flipped" : ""}
                                  />
                                )}
                              </button>
                            </th>
                            <th>
                              <button onClick={() => changeSort("size")}>
                                {t("size")}
                                {sort === "size" && (
                                  <ArrowDown
                                    size={12}
                                    className={!descending ? "flipped" : ""}
                                  />
                                )}
                              </button>
                            </th>
                            <th>
                              <button onClick={() => changeSort("modified")}>
                                {t("modified")}
                                {sort === "modified" && (
                                  <ArrowDown
                                    size={12}
                                    className={!descending ? "flipped" : ""}
                                  />
                                )}
                              </button>
                            </th>
                            <th aria-label="Open" />
                          </tr>
                        </thead>
                        <tbody>
                          {view?.entries.map((entry) => (
                            <tr
                              key={entry.id}
                              tabIndex={0}
                              aria-selected={selected?.entry.id === entry.id}
                              className={
                                selected?.entry.id === entry.id
                                  ? "selected-row"
                                  : ""
                              }
                              onClick={() => void select(entry)}
                              onDoubleClick={() => navigate(entry)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") navigate(entry);
                                if (event.key === " ") {
                                  event.preventDefault();
                                  void select(entry);
                                }
                              }}
                            >
                              <td>
                                <div className="file-name">
                                  <EntryIcon entry={entry} />
                                  <span title={entry.name}>{entry.name}</span>
                                  {entry.issue && (
                                    <AlertCircle
                                      size={13}
                                      className="warning-icon"
                                    />
                                  )}
                                  {entry.hardlink && <Link2 size={12} />}
                                </div>
                              </td>
                              <td>
                                <span
                                  className="size-bar"
                                  style={{
                                    width: `${Math.min(100, (entry[query.metric] / Math.max(1, view.parent[query.metric])) * 100)}%`,
                                  }}
                                />
                                {formatBytes(entry[query.metric])}
                              </td>
                              <td>
                                {new Date(entry.modified).toLocaleDateString(
                                  prefs.language,
                                )}
                              </td>
                              <td>
                                {entry.kind === "directory" && (
                                  <button
                                    className="row-open icon-button"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      navigate(entry);
                                    }}
                                    aria-label={`${t("openFolder")}: ${entry.name}`}
                                  >
                                    <ChevronRight size={15} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {view?.entries.length === 0 && (
                        <div className="table-empty">
                          <Search size={22} />
                          <strong>
                            {t(hasFilter ? "empty" : "emptyFolder")}
                          </strong>
                          {hasFilter && <span>{t("emptyHint")}</span>}
                        </div>
                      )}
                    </div>
                    <div className="pagination">
                      <span>
                        {view?.total
                          ? `${offset + 1}–${Math.min(offset + 100, view.total)} / ${view.total}`
                          : "0"}{" "}
                        {t("items")}
                      </span>
                      <div>
                        <button
                          className="icon-button"
                          disabled={offset === 0 || loadingView}
                          onClick={() => setOffset(Math.max(0, offset - 100))}
                          aria-label={t("previous")}
                        >
                          <ArrowLeft size={15} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={
                            !view || offset + 100 >= view.total || loadingView
                          }
                          onClick={() => setOffset(offset + 100)}
                          aria-label={t("next")}
                        >
                          <ArrowRight size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <aside className="inspector">
                    <h2 className="eyebrow">{t("details")}</h2>
                    {selected ? (
                      <>
                        <div className="inspector-icon">
                          <EntryIcon entry={selected.entry} size={30} />
                        </div>
                        <h3>{selected.entry.name}</h3>
                        <span className="kind-badge">
                          {t(selected.entry.category)}
                        </span>
                        <strong className="inspector-size">
                          {formatBytes(selected.entry[query.metric])}
                        </strong>
                        <div className="usage-track">
                          <i
                            style={{
                              width: `${ratio}%`,
                              backgroundColor:
                                categoryColors[selected.entry.category],
                            }}
                          />
                        </div>
                        <span className="usage-value">
                          {ratio.toFixed(1)}% · {ratioBase?.name}
                        </span>
                        <dl>
                          <dt>{t("files")}</dt>
                          <dd>
                            {new Intl.NumberFormat(prefs.language).format(
                              selected.entry.files,
                            )}
                          </dd>
                          <dt>{t("modified")}</dt>
                          <dd>
                            {new Date(selected.entry.modified).toLocaleString(
                              prefs.language,
                            )}
                          </dd>
                        </dl>
                        <code className="file-path">{selected.path}</code>
                        {selected.entry.hardlink && (
                          <p className="inspector-note">{t("hardlink")}</p>
                        )}
                        {selected.entry.issue && (
                          <p className="inspector-note warning-icon">
                            {selected.entry.issue}
                          </p>
                        )}
                        <div className="inspector-actions">
                          {selected.entry.kind === "directory" && (
                            <button
                              className="primary"
                              disabled={blocked}
                              onClick={() => navigate(selected.entry)}
                            >
                              <FolderOpen size={16} />
                              {t("openFolder")}
                            </button>
                          )}
                          <button
                            disabled={blocked}
                            onClick={() => void entryAction("reveal")}
                          >
                            <Folder size={16} />
                            {t("reveal")}
                          </button>
                          <button
                            disabled={blocked}
                            onClick={() => void entryAction("copyPath")}
                          >
                            <Copy size={16} />
                            {t("copy")}
                          </button>
                          <button
                            className="danger-button"
                            disabled={blocked || !selected.canTrash}
                            onClick={() => void entryAction("trash")}
                          >
                            <Trash2 size={16} />
                            {t("trash")}
                          </button>
                        </div>
                        {!selected.canTrash && (
                          <p className="inspector-note">
                            {t(
                              selected.reason === "protected"
                                ? "protected"
                                : "incomplete",
                            )}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="inspector-empty">
                        <div>
                          <LayoutGrid size={28} />
                        </div>
                        <h3>{t("select")}</h3>
                        <p>{t("selectHint")}</p>
                      </div>
                    )}
                    <div className="category-legend">
                      <h2 className="eyebrow">{t("typeBreakdown")}</h2>
                      {summary.categories.slice(0, 7).map((item) => (
                        <button
                          key={item.category}
                          onClick={() => {
                            setCategory(item.category);
                            setOffset(0);
                          }}
                        >
                          <span
                            className="legend-dot"
                            style={{
                              backgroundColor: categoryColors[item.category],
                            }}
                          />
                          <span>{t(item.category)}</span>
                          <small>{formatBytes(item.bytes)}</small>
                        </button>
                      ))}
                    </div>
                  </aside>
                </section>
              </>
            )}
          </>
        )}
        <footer className="app-footer">
          <span>
            <ShieldCheck size={12} />
            {t("privacy")}
          </span>
          <span>
            SpaceScan {boot?.version ?? "0.1.0"}
            {working && <> · {t("processing")}</>}
          </span>
        </footer>
      </main>
      {modal && (
        <Modal
          title={t(
            modal === "help"
              ? "helpTitle"
              : modal === "settings"
                ? "settings"
                : "issueTitle",
          )}
          close={() => setModal(null)}
        >
          {modal === "help" && (
            <div className="help-content">
              <Brand />
              <p className="help-version">
                {t("version")} {boot?.version} · {t("offline")}
              </p>
              {(["help1", "help2", "help3", "help4", "help5"] as const).map(
                (key, index) => (
                  <section key={key}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{t(key)}</p>
                  </section>
                ),
              )}
            </div>
          )}
          {modal === "settings" && (
            <div className="settings-content">
              <label>
                {t("language")}
                <select
                  value={prefs.language}
                  onChange={(event) =>
                    void updatePreferences({
                      language: event.target.value as Preferences["language"],
                    })
                  }
                >
                  <option value="zh">简体中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label>
                {t("theme")}
                <select
                  value={prefs.theme}
                  onChange={(event) =>
                    void updatePreferences({
                      theme: event.target.value as Preferences["theme"],
                    })
                  }
                >
                  {(["system", "light", "dark"] as const).map((value) => (
                    <option key={value} value={value}>
                      {t(value)}
                    </option>
                  ))}
                </select>
              </label>
              <p>
                <ShieldCheck size={17} />
                {t("offline")}
              </p>
            </div>
          )}
          {modal === "issues" && (
            <div className="issues-content">
              <p>{t("partial")}</p>
              <p>{t("help5")}</p>
              <ul>
                {summary?.problems.map((problem, index) => (
                  <li key={index}>
                    <strong>{problem.code}</strong>
                    <code>{problem.path}</code>
                  </li>
                ))}
              </ul>
              {(summary?.issues ?? 0) > 100 && (
                <p>
                  100 / {summary?.issues} {t("items")}
                </p>
              )}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
