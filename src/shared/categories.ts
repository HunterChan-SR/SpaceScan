import type { Category } from "./types";
const groups: [Category, string[]][] = [
  [
    "image",
    [
      "png",
      "jpg",
      "jpeg",
      "gif",
      "webp",
      "heic",
      "heif",
      "svg",
      "tiff",
      "tif",
      "raw",
      "psd",
      "avif",
      "ico",
      "bmp",
    ],
  ],
  [
    "video",
    ["mp4", "mov", "mkv", "avi", "webm", "m4v", "mpeg", "mpg", "wmv", "ts"],
  ],
  ["audio", ["mp3", "wav", "flac", "aac", "m4a", "ogg", "aiff", "opus"]],
  [
    "archive",
    [
      "zip",
      "gz",
      "tar",
      "rar",
      "7z",
      "dmg",
      "iso",
      "xz",
      "bz2",
      "zst",
      "pkg",
      "exe",
      "msi",
      "deb",
      "rpm",
      "appimage",
    ],
  ],
  [
    "code",
    [
      "js",
      "jsx",
      "ts",
      "tsx",
      "py",
      "rs",
      "go",
      "c",
      "h",
      "cpp",
      "hpp",
      "swift",
      "java",
      "kt",
      "rb",
      "php",
      "html",
      "css",
      "scss",
      "json",
      "yaml",
      "yml",
      "toml",
      "lock",
      "sql",
      "sh",
      "vue",
      "svelte",
    ],
  ],
  [
    "document",
    [
      "pdf",
      "txt",
      "md",
      "rtf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "csv",
      "ppt",
      "pptx",
      "pages",
      "numbers",
      "key",
      "epub",
    ],
  ],
];
const extensions = new Map(
  groups.flatMap(([category, values]) =>
    values.map((value) => [value, category] as const),
  ),
);
export const categoryOf = (name: string): Category =>
  extensions.get(name.toLowerCase().split(".").pop() ?? "") ?? "other";
export const categoryColors: Record<Category, string> = {
  folder: "#7970d5",
  code: "#7970d5",
  image: "#45a99a",
  video: "#cd9560",
  audio: "#d07e99",
  archive: "#749bcb",
  document: "#b8a359",
  other: "#8b94a5",
  link: "#96a6b2",
};
export function formatBytes(bytes: number, locale = "en"): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes === 0) return "0 B";
  const i = Math.min(5, Math.floor(Math.log(bytes) / Math.log(1024)));
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: i > 0 ? 1 : 0 }).format(bytes / 1024 ** i)} ${units[i]}`;
}
