import { useState } from "react";
import { trimMedia } from "./api";
import "./TrimEditor.css";

interface Props {
  filename: string;
  duration: number;
  onTrimDone: (result: { filename: string; download_url: string }, newDuration: number) => void;
  onCancel: () => void;
}

function secToHMS(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseHMS(val: string): number | null {
  const trimmed = val.trim();
  const asNum = Number(trimmed);
  if (!isNaN(asNum) && trimmed !== "" && asNum >= 0) return asNum;
  const parts = trimmed.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export default function TrimEditor({ filename, duration, onTrimDone, onCancel }: Props) {
  const [startSec, setStartSec] = useState(0);
  const [endSec, setEndSec] = useState(duration);
  const [startInput, setStartInput] = useState("0:00");
  const [endInput, setEndInput] = useState(secToHMS(duration));
  const [trimming, setTrimming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const safeMin = 1;

  function commitStart(val: number) {
    const clamped = Math.max(0, Math.min(val, endSec - safeMin));
    setStartSec(clamped);
    setStartInput(secToHMS(clamped));
  }

  function commitEnd(val: number) {
    const clamped = Math.max(startSec + safeMin, Math.min(val, duration));
    setEndSec(clamped);
    setEndInput(secToHMS(clamped));
  }

  function onStartSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    if (val < endSec - safeMin) {
      setStartSec(val);
      setStartInput(secToHMS(val));
    }
  }

  function onEndSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    if (val > startSec + safeMin) {
      setEndSec(val);
      setEndInput(secToHMS(val));
    }
  }

  function onStartBlur() {
    const sec = parseHMS(startInput);
    if (sec !== null) commitStart(sec);
    else setStartInput(secToHMS(startSec));
  }

  function onEndBlur() {
    const sec = parseHMS(endInput);
    if (sec !== null) commitEnd(sec);
    else setEndInput(secToHMS(endSec));
  }

  async function handleApply() {
    setTrimming(true);
    setError(null);
    try {
      const result = await trimMedia(filename, secToHMS(startSec), secToHMS(endSec));
      onTrimDone(result, endSec - startSec);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка обрезки");
      setTrimming(false);
    }
  }

  const startPct = duration > 0 ? (startSec / duration) * 100 : 0;
  const endPct   = duration > 0 ? (endSec   / duration) * 100 : 100;
  const selDuration = endSec - startSec;

  return (
    <div className="trim-editor">
      <div className="trim-header">
        <span className="trim-title">✂ Режим обрезки</span>
        <span className="trim-fname">{filename}</span>
      </div>

      {/* ── Slider ── */}
      <div className="trim-slider-wrap">
        {/* Visual track */}
        <div className="trim-track">
          <div
            className="trim-selection"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
          {/* Ghost marker lines */}
          <div className="trim-marker" style={{ left: `${startPct}%` }} />
          <div className="trim-marker" style={{ left: `${endPct}%` }} />
        </div>

        {/* Dual range inputs */}
        <input
          type="range"
          className="trim-range"
          min={0}
          max={duration}
          step={0.1}
          value={startSec}
          onChange={onStartSlider}
        />
        <input
          type="range"
          className="trim-range"
          min={0}
          max={duration}
          step={0.1}
          value={endSec}
          onChange={onEndSlider}
        />
      </div>

      <div className="trim-labels">
        <span className="trim-label-time">{secToHMS(0)}</span>
        <span className="trim-label-time">{secToHMS(duration)}</span>
      </div>

      {/* ── Time inputs ── */}
      <div className="trim-time-row">
        <div className="trim-time-group">
          <label className="label">Начало</label>
          <input
            className="input trim-time-input"
            value={startInput}
            onChange={(e) => setStartInput(e.target.value)}
            onBlur={onStartBlur}
            onKeyDown={(e) => e.key === "Enter" && onStartBlur()}
            disabled={trimming}
          />
        </div>

        <div className="trim-dur-badge">
          <span className="trim-dur-label">длина</span>
          <span className="trim-dur-value">{secToHMS(selDuration)}</span>
        </div>

        <div className="trim-time-group trim-time-group-end">
          <label className="label">Конец</label>
          <input
            className="input trim-time-input"
            value={endInput}
            onChange={(e) => setEndInput(e.target.value)}
            onBlur={onEndBlur}
            onKeyDown={(e) => e.key === "Enter" && onEndBlur()}
            disabled={trimming}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span className="alert-icon">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <div className="result-actions">
        <button className="save-btn" onClick={handleApply} disabled={trimming}>
          {trimming ? <><span className="spinner" /> Обрезается...</> : "✂ Применить обрезку"}
        </button>
        <button className="new-btn" onClick={onCancel} disabled={trimming}>
          Отменить
        </button>
      </div>
    </div>
  );
}
