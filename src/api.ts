const BASE = "";

export type Quality = "best" | "2160p" | "1080p" | "720p" | "480p" | "360p" | "worst";
export type MediaFormat = "video" | "audio";

export interface DownloadResult {
  filename: string;
  size_mb: number;
  download_url: string;
  title: string;
}

export interface VideoInfo {
  title: string;
  duration: number | null;
  uploader: string | null;
  view_count: number | null;
  thumbnail: string | null;
  webpage_url: string;
}

export async function fetchInfo(url: string): Promise<VideoInfo> {
  const res = await fetch(`${BASE}/info?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка сервера" }));
    throw new Error(err.detail ?? "Ошибка получения информации");
  }
  return res.json();
}

export async function downloadMedia(
  url: string,
  format: MediaFormat,
  quality: Quality
): Promise<DownloadResult> {
  const endpoint = format === "video" ? "/download/video" : "/download/audio";
  const res = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, quality }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка сервера" }));
    throw new Error(err.detail ?? "Ошибка скачивания");
  }
  return res.json();
}

export function triggerBrowserDownload(downloadUrl: string, customFilename?: string) {
  const a = document.createElement("a");
  a.href = downloadUrl;
  if (customFilename) a.download = customFilename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function formatDuration(sec: number | null): string {
  if (!sec) return "";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export async function setMetadata(
  filename: string,
  title: string,
  artist: string
): Promise<{ filename: string; download_url: string }> {
  const form = new FormData();
  form.append("filename", filename);
  form.append("title", title);
  form.append("artist", artist);
  const res = await fetch("/edit/set-metadata", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка сервера" }));
    throw new Error(err.detail ?? "Ошибка записи тегов");
  }
  return res.json();
}

export async function setCover(
  filename: string,
  coverFile: File
): Promise<{ filename: string; download_url: string }> {
  const form = new FormData();
  form.append("filename", filename);
  form.append("cover", coverFile);
  const res = await fetch("/edit/set-cover", { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Ошибка сервера" }));
    throw new Error(err.detail ?? "Ошибка встраивания обложки");
  }
  return res.json();
}

export function formatViews(n: number | null): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M просмотров`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K просмотров`;
  return `${n} просмотров`;
}
