export type Metric = "logical" | "allocated";
export type Category =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "document"
  | "other"
  | "link";
export type ScanState =
  | "idle"
  | "scanning"
  | "complete"
  | "cancelled"
  | "limited"
  | "failed";
export type Language = "zh" | "en";
export interface Entry {
  id: number;
  scanId: string;
  parentId: number | null;
  name: string;
  kind: "directory" | "file" | "link" | "special";
  logical: number;
  allocated: number;
  files: number;
  modified: number;
  category: Category;
  issue?: string;
  hardlink?: boolean;
}
export interface ScanProgress {
  scanId: string;
  state: ScanState;
  rootPath: string;
  entries: number;
  files: number;
  bytes: number;
  elapsedMs: number;
  currentPath: string;
  issues: number;
  message?: string;
}
export interface ScanSummary extends ScanProgress {
  completedAt: number;
  root: Entry;
  allocatedSupported: boolean;
  capacity: number | null;
  available: number | null;
  categories: { category: Category; bytes: number; files: number }[];
  problems: { path: string; code: string }[];
}
export interface MapEntry extends Entry {
  children?: MapEntry[];
  omitted?: number;
}
export interface ViewQuery {
  scanId: string;
  parentId: number;
  metric: Metric;
  sort: "size" | "name" | "modified";
  descending: boolean;
  search: string;
  category: Category | "all";
  offset: number;
  limit: number;
}
export interface DirectoryView {
  parent: Entry;
  path: string;
  breadcrumbs: Entry[];
  entries: Entry[];
  total: number;
  map: MapEntry[];
  mapOmitted: number;
}
export interface Location {
  name: string;
  path: string;
  kind: "home" | "volume" | "recent";
  available?: number;
  capacity?: number;
}
export interface Preferences {
  language: Language;
  theme: "light" | "dark" | "system";
  metric: Metric;
  recent: string[];
}
export interface Bootstrap {
  version: string;
  platform: string;
  preferences: Preferences;
  locations: Location[];
  progress: ScanProgress | null;
}
export interface EntryDetails {
  entry: Entry;
  path: string;
  canTrash: boolean;
  reason?: string;
}
export interface AppAPI {
  readonly runtime: { sandboxed: boolean; contextIsolated: boolean };
  bootstrap(): Promise<Bootstrap>;
  chooseFolder(): Promise<string | null>;
  scan(path: string): Promise<void>;
  cancel(): Promise<void>;
  summary(): Promise<ScanSummary | null>;
  view(query: ViewQuery): Promise<DirectoryView>;
  details(id: number, scanId: string): Promise<EntryDetails>;
  reveal(id: number, scanId: string): Promise<void>;
  copyPath(id: number, scanId: string): Promise<void>;
  trash(id: number, scanId: string): Promise<boolean>;
  exportCSV(query: ViewQuery): Promise<boolean>;
  preferences(
    update: Partial<Pick<Preferences, "language" | "theme" | "metric">>,
  ): Promise<Preferences>;
  onProgress(callback: (progress: ScanProgress) => void): () => void;
  onMenu(callback: (action: "open" | "rescan" | "help") => void): () => void;
}
declare global {
  interface Window {
    spacescan: AppAPI;
  }
}
