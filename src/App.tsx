import { useState, useRef, useEffect } from "react";
import {
  fetchInfo,
  downloadMedia,
  triggerBrowserDownload,
  setCover,
  setMetadata,
  formatDuration,
  formatViews,
  type Quality,
  type MediaFormat,
  type VideoInfo,
  type DownloadResult,
} from "./api";
import AudioPlayer from "./AudioPlayer";
import TrimEditor from "./TrimEditor";
import "./App.css";

type Theme = "purple" | "red" | "green" | "blue" | "orange";

const THEMES: { id: Theme; color: string; label: string }[] = [
  { id: "purple", color: "#6366f1", label: "Фиолетовый" },
  { id: "red",    color: "#ef4444", label: "Красный"    },
  { id: "green",  color: "#22c55e", label: "Зелёный"    },
  { id: "blue",   color: "#3b82f6", label: "Синий"      },
  { id: "orange", color: "#f97316", label: "Оранжевый"  },
];

function applyTheme(theme: Theme) {
  if (theme === "purple") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

function ColorPicker() {
  const [active, setActive] = useState<Theme>(() => {
    const saved = localStorage.getItem("app-theme") as Theme | null;
    return saved ?? "purple";
  });

  useEffect(() => {
    applyTheme(active);
  }, []);

  function handleSelect(theme: Theme) {
    setActive(theme);
    applyTheme(theme);
    localStorage.setItem("app-theme", theme);
  }

  return (
    <div className="color-picker" aria-label="Выбор цветовой темы">
      {THEMES.map((t) => (
        <button
          key={t.id}
          className={`color-swatch${active === t.id ? " active" : ""}`}
          style={{ background: t.color }}
          onClick={() => handleSelect(t.id)}
          title={t.label}
          aria-label={t.label}
          aria-pressed={active === t.id}
        />
      ))}
    </div>
  );
}

const QUALITIES: { value: Quality; label: string }[] = [
  { value: "best",   label: "Лучшее" },
  { value: "2160p",  label: "4K (2160p)" },
  { value: "1080p",  label: "1080p" },
  { value: "720p",   label: "720p" },
  { value: "480p",   label: "480p" },
  { value: "360p",   label: "360p" },
  { value: "worst",  label: "Минимальное" },
];

type Status = "idle" | "loading-info" | "ready" | "downloading" | "done" | "error";

export default function App() {
  const [url, setUrl]               = useState("");
  const [format, setFormat]         = useState<MediaFormat>("audio");
  const [quality, setQuality]       = useState<Quality>("best");
  const [status, setStatus]         = useState<Status>("idle");
  const [info, setInfo]             = useState<VideoInfo | null>(null);
  const [result, setResult]         = useState<DownloadResult | null>(null);
  // playerSrc отделён от result.download_url — меняется только при новой обложке,
  // чтобы плеер не перезагружался при записи тегов/сохранении
  const [playerSrc, setPlayerSrc]   = useState<string>("");
  const [error, setError]           = useState<string | null>(null);
  const [customTitle, setCustomTitle]   = useState("");
  const [customAuthor, setCustomAuthor] = useState("");
  const [coverPreview, setCoverPreview]   = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError]       = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [editMode, setEditMode]           = useState(false);
  const [fileDuration, setFileDuration]   = useState(0);
  // Snapshot before trim — for "Вернуть оригинал"
  const [originalResult, setOriginalResult]       = useState<DownloadResult | null>(null);
  const [originalPlayerSrc, setOriginalPlayerSrc] = useState<string>("");

  const inputRef    = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isValidUrl = url.trim().startsWith("http");
  const isLoading  = status === "loading-info" || status === "downloading";

  // ── Дебаунс /info при вводе ─────────────────────────────────────────────
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!url.trim().startsWith("http")) {
      setInfo(null);
      setError(null);
      if (status === "loading-info") setStatus("idle");
      return;
    }

    setStatus("loading-info");
    setInfo(null);
    setError(null);
    setResult(null);

    debounceRef.current = setTimeout(() => loadInfo(url.trim()), 700);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadInfo(u: string) {
    try {
      const data = await fetchInfo(u);
      setInfo(data);
      setStatus("ready");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
      setStatus("error");
    }
  }

  // ── Скачивание ───────────────────────────────────────────────────────────
  async function handleDownload() {
    if (!isValidUrl) return;
    setStatus("downloading");
    setError(null);
    setResult(null);
    try {
      const data = await downloadMedia(url.trim(), format, quality);
      setResult(data);
      setPlayerSrc(data.download_url);
      setCustomTitle(data.title || info?.title || "");
      setCustomAuthor(info?.uploader || "");
      setFileDuration(info?.duration ?? 0);
      setOriginalResult(null);
      setOriginalPlayerSrc("");
      setEditMode(false);
      setStatus("done");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Неизвестная ошибка");
      setStatus("error");
    }
  }

  // ── Сохранить: записать теги → скачать (плеер не трогаем) ──────────────
  async function handleSave() {
    if (!result) return;
    setSaving(true);
    try {
      const updated = await setMetadata(
        result.filename,
        customTitle.trim(),
        customAuthor.trim()
      );
      // Обновляем рабочий файл (но НЕ playerSrc — плеер продолжает играть)
      setResult((prev) => prev ? { ...prev, filename: updated.filename, download_url: updated.download_url } : prev);

      const ext = updated.filename.split(".").pop() ?? "";
      const name = customAuthor.trim()
        ? `${customAuthor.trim()} - ${customTitle.trim()}.${ext}`
        : `${customTitle.trim()}.${ext}`;
      triggerBrowserDownload(updated.download_url, name || updated.filename);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  // ── Сброс ────────────────────────────────────────────────────────────────
  async function handleCoverSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !result) return;
    setCoverError(null);
    setCoverUploading(true);
    // локальный превью сразу
    const blobUrl = URL.createObjectURL(file);
    setCoverPreview(blobUrl);
    try {
      const updated = await setCover(result.filename, file);
      // Обновляем рабочий файл и playerSrc (обложка меняет контент файла)
      setResult((prev) => prev ? { ...prev, filename: updated.filename, download_url: updated.download_url } : prev);
      setPlayerSrc(updated.download_url);
    } catch (err) {
      setCoverError(err instanceof Error ? err.message : "Ошибка загрузки обложки");
      setCoverPreview(null);
    } finally {
      setCoverUploading(false);
      e.target.value = "";
    }
  }

  // ── Trim editing ─────────────────────────────────────────────────────────
  function handleEnterEditMode() {
    if (!result) return;
    if (!originalResult) {
      setOriginalResult(result);
      setOriginalPlayerSrc(playerSrc);
    }
    setEditMode(true);
  }

  function handleTrimDone(
    trimmed: { filename: string; download_url: string },
    newDuration: number
  ) {
    setResult((prev) =>
      prev ? { ...prev, filename: trimmed.filename, download_url: trimmed.download_url } : prev
    );
    setPlayerSrc(trimmed.download_url);
    setFileDuration(newDuration);
    setEditMode(false);
  }

  function handleCancelEdit() {
    setEditMode(false);
  }

  function handleRevertToOriginal() {
    if (!originalResult) return;
    setResult(originalResult);
    setPlayerSrc(originalPlayerSrc);
    setFileDuration(info?.duration ?? 0);
    setOriginalResult(null);
    setOriginalPlayerSrc("");
  }

  function handleReset() {
    setUrl("");
    setInfo(null);
    setResult(null);
    setError(null);
    setStatus("idle");
    setCustomTitle("");
    setCustomAuthor("");
    setCoverPreview(null);
    setCoverError(null);
    setSaving(false);
    setPlayerSrc("");
    setEditMode(false);
    setOriginalResult(null);
    setOriginalPlayerSrc("");
    setFileDuration(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleUrlChange(v: string) {
    setUrl(v);
    setResult(null);
    setCustomTitle("");
    setCustomAuthor("");
    if (status === "done") setStatus("idle");
  }

  const ext = result?.filename.split(".").pop() ?? "";

  return (
    <div className="page">
      <ColorPicker />
      <header className="header">
        <div className="logo">
          <span className="logo-text">Downloader</span>
        </div>
        <p className="tagline">Бесплатный (по реалу) скачиватель, пользуйтесь на здоровье! &lt;3</p>
      </header>

      <main className="card">

        {/* ── URL input ── */}
        <div className="field">
          <label className="label">Ссылка на видео</label>
          <div className="input-row">
            <input
              ref={inputRef}
              className="input"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              disabled={status === "downloading"}
              autoFocus
            />
            {url && (
              <button className="clear-btn" onClick={handleReset} title="Очистить">✕</button>
            )}
          </div>
        </div>

        {/* ── Video preview / skeleton ── */}
        {status === "loading-info" && (
          <div className="preview skeleton">
            <div className="skeleton-thumb" />
            <div className="skeleton-lines">
              <div className="skeleton-line wide" />
              <div className="skeleton-line narrow" />
            </div>
          </div>
        )}

        {info && status !== "idle" && status !== "loading-info" && (
          <div className="preview">
            {info.thumbnail && (
              <img className="preview-thumb" src={info.thumbnail} alt={info.title} />
            )}
            <div className="preview-meta">
              <p className="preview-title">{info.title}</p>
              <div className="preview-sub">
                {info.uploader && <span>{info.uploader}</span>}
                {info.duration  && <span>{formatDuration(info.duration)}</span>}
                {info.view_count && <span>{formatViews(info.view_count)}</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── Format toggle ── */}
        <div className="field">
          <label className="label">Формат</label>
          <div className="toggle">
            <button
              className={`toggle-btn ${format === "audio" ? "active" : ""}`}
              onClick={() => setFormat("audio")}
              disabled={isLoading}
            >
              Аудио (MP3)
            </button>
            <button
              className={`toggle-btn ${format === "video" ? "active" : ""}`}
              onClick={() => setFormat("video")}
              disabled={isLoading}
            >
              Видео (MP4)
            </button>
          </div>
        </div>

        {/* ── Quality (только видео) ── */}
        {format === "video" && (
          <div className="field">
            <label className="label">Качество</label>
            <select
              className="select"
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
              disabled={isLoading}
            >
              {QUALITIES.map((q) => (
                <option key={q.value} value={q.value}>{q.label}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Error ── */}
        {status === "error" && error && (
          <div className="alert alert-error">
            <span className="alert-icon">⚠</span>
            <span>{error}</span>
          </div>
        )}

        {/* ── Download button ── */}
        {status !== "done" && (
          <button
            className={`download-btn ${isLoading ? "loading" : ""}`}
            onClick={handleDownload}
            disabled={!isValidUrl || isLoading}
          >
            {status === "downloading" ? (
              <><span className="spinner" />Скачивается...</>
            ) : status === "loading-info" ? (
              <><span className="spinner" />Загрузка информации...</>
            ) : (
              <>⬇ Скачать {format === "audio" ? "аудио" : "видео"}</>
            )}
          </button>
        )}

        {/* ── Результат: плеер + редактирование / переименование ── */}
        {status === "done" && result && (
          <div className="result-section">

            {/* Плеер */}
            {format === "audio" ? (
              <AudioPlayer
                src={playerSrc}
                title={customTitle || result.title}
                author={customAuthor}
                thumbnail={coverPreview ?? info?.thumbnail}
              />
            ) : (
              <div className="player-wrap">
                <video
                  className="player-video"
                  controls
                  src={playerSrc || result.download_url}
                />
              </div>
            )}

            {editMode ? (
              /* ── Режим обрезки ── */
              <div className="edit-panel">
                <TrimEditor
                  filename={result.filename}
                  duration={fileDuration}
                  onTrimDone={handleTrimDone}
                  onCancel={handleCancelEdit}
                />
              </div>
            ) : (
              /* ── Поля переименования ── */
              <div className="rename-section">
                {/* Строка с кнопкой обрезки и откатом */}
                <div className="edit-bar">
                  <button className="trim-open-btn" onClick={handleEnterEditMode}>
                    ✂ Обрезать
                  </button>
                  {originalResult && (
                    <button className="revert-btn" onClick={handleRevertToOriginal}>
                      ↩ Вернуть оригинал
                    </button>
                  )}
                </div>

                <p className="rename-title">Сохранить как</p>

                <div className="rename-body">
                  {/* Обложка — только для аудио */}
                  {format === "audio" && (
                    <div className="cover-block">
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        onChange={handleCoverSelect}
                      />
                      <button
                        className={`cover-btn ${coverUploading ? "cover-loading" : ""}`}
                        onClick={() => coverInputRef.current?.click()}
                        disabled={coverUploading}
                        title="Нажмите чтобы загрузить обложку"
                      >
                        {coverPreview || info?.thumbnail ? (
                          <img
                            className="cover-img"
                            src={coverPreview ?? info?.thumbnail ?? ""}
                            alt="обложка"
                          />
                        ) : (
                          <span className="cover-placeholder">🎵</span>
                        )}
                        <span className="cover-overlay">
                          {coverUploading ? <span className="spinner" /> : "✎ Изменить"}
                        </span>
                      </button>
                      {coverError && (
                        <p className="cover-error">{coverError}</p>
                      )}
                      <p className="cover-hint">JPG / PNG / WebP</p>
                    </div>
                  )}

                  <div className="rename-fields">
                    <div className="field">
                      <label className="label">Название</label>
                      <input
                        className="input"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="Название файла"
                      />
                    </div>
                    <div className="field">
                      <label className="label">Автор</label>
                      <input
                        className="input"
                        value={customAuthor}
                        onChange={(e) => setCustomAuthor(e.target.value)}
                        placeholder="Имя исполнителя / канал"
                      />
                    </div>
                  </div>
                </div>

                <div className="filename-preview">
                  <span className="filename-preview-label">Имя файла:</span>
                  <span className="filename-preview-value">
                    {customAuthor.trim()
                      ? `${customAuthor.trim()} - ${customTitle.trim() || "…"}.${ext}`
                      : `${customTitle.trim() || "…"}.${ext}`}
                  </span>
                </div>

                <div className="result-actions">
                  <button className="save-btn" onClick={handleSave} disabled={saving}>
                    {saving ? <><span className="spinner" /> Сохранение...</> : "Сохранить"}
                  </button>
                  <button className="new-btn" onClick={handleReset}>
                    + Новое скачивание
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}
