import { useRef, useEffect, useState, useCallback } from "react";
import "./AudioPlayer.css";

interface Props {
  src: string;
  title: string;
  author: string;
  thumbnail?: string | null;
}

const BAR_COUNT = 72;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function AudioPlayer({ src, title, author, thumbnail }: Props) {
  const audioRef   = useRef<HTMLAudioElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const ctxRef      = useRef<AudioContext | null>(null);
  const connectedRef = useRef(false);
  const barsRef    = useRef<Float32Array>(new Float32Array(BAR_COUNT).fill(0));

  const [playing, setPlaying]     = useState(false);
  const [current, setCurrent]     = useState(0);
  const [duration, setDuration]   = useState(0);
  const [volume, setVolume]       = useState(0.85);
  const [dragging, setDragging]   = useState(false);

  // ── Web Audio setup ────────────────────────────────────────────────────────
  function setupAudio() {
    if (connectedRef.current || !audioRef.current) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const source = ctx.createMediaElementSource(audioRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    ctxRef.current = ctx;
    analyserRef.current = analyser;
    connectedRef.current = true;
  }

  // ── Canvas draw loop ───────────────────────────────────────────────────────
  const draw = useCallback(() => {
    rafRef.current = requestAnimationFrame(draw);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx2d.clearRect(0, 0, W, H);

    let freqData: Uint8Array | null = null;
    if (analyserRef.current) {
      freqData = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(freqData);
    }

    const barW    = (W - BAR_COUNT * 2) / BAR_COUNT;
    const maxFreqBin = analyserRef.current
      ? Math.floor(analyserRef.current.frequencyBinCount * 0.65)
      : BAR_COUNT;

    // read CSS theme variables once per frame
    const cssVars = getComputedStyle(document.documentElement);
    const c0 = cssVars.getPropertyValue("--eq-c0").trim();
    const c1 = cssVars.getPropertyValue("--eq-c1").trim();
    const c2 = cssVars.getPropertyValue("--eq-c2").trim();
    const c3 = cssVars.getPropertyValue("--eq-c3").trim();

    for (let i = 0; i < BAR_COUNT; i++) {
      // map bar index to frequency bin
      const binIdx = Math.floor((i / BAR_COUNT) * maxFreqBin);
      const rawVal = freqData ? freqData[binIdx] / 255 : 0;

      // smooth bars with exponential decay
      const prev = barsRef.current[i];
      barsRef.current[i] = rawVal > prev
        ? lerp(prev, rawVal, 0.55)   // rise fast
        : lerp(prev, rawVal, 0.12);  // fall slow

      const barH = Math.max(3, barsRef.current[i] * H * 0.92);
      const x    = i * (barW + 2);
      const y    = H - barH;

      const t = barsRef.current[i];
      const grad = ctx2d.createLinearGradient(x, y, x, H);
      grad.addColorStop(0, t > 0.6 ? c3 : t > 0.3 ? c2 : c1);
      grad.addColorStop(1, c0);
      ctx2d.fillStyle = grad;

      const radius = Math.min(barW / 2, 3);
      ctx2d.beginPath();
      ctx2d.roundRect(x, y, barW, barH, [radius, radius, 0, 0]);
      ctx2d.fill();
    }
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // ── Canvas resize ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth  * devicePixelRatio;
      canvas.height = canvas.offsetHeight * devicePixelRatio;
      canvas.getContext("2d")?.scale(devicePixelRatio, devicePixelRatio);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  // ── Playback controls ──────────────────────────────────────────────────────
  async function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    setupAudio();
    if (ctxRef.current?.state === "suspended") await ctxRef.current.resume();
    if (el.paused) { await el.play(); setPlaying(true); }
    else           { el.pause();      setPlaying(false); }
  }

  function skip(sec: number) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = Math.max(0, Math.min(duration, audioRef.current.currentTime + sec));
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    if (audioRef.current) audioRef.current.currentTime = val;
    setCurrent(val);
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = Number(e.target.value);
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
  }

  function fmt(sec: number) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  return (
    <div className="ap">
      {/* hidden audio element */}
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={(e) => { if (!dragging) setCurrent(e.currentTarget.currentTime); }}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />

      {/* equalizer canvas */}
      <div className="ap-eq-wrap">
        <canvas ref={canvasRef} className="ap-eq" />
        {!playing && (
          <div className="ap-eq-idle">
            {[...Array(BAR_COUNT)].map((_, i) => (
              <span
                key={i}
                className="ap-eq-idle-bar"
                style={{ animationDelay: `${(i % 8) * 0.1}s` }}
              />
            ))}
          </div>
        )}
      </div>

      {/* meta */}
      <div className="ap-meta">
        {thumbnail && <img className="ap-thumb" src={thumbnail} alt={title} />}
        <div className="ap-text">
          <p className="ap-title">{title || "Без названия"}</p>
          <p className="ap-author">{author || "Неизвестный исполнитель"}</p>
        </div>
      </div>

      {/* seek bar */}
      <div className="ap-seek">
        <span className="ap-time">{fmt(current)}</span>
        <div className="ap-range-wrap">
          <div className="ap-range-track">
            <div className="ap-range-fill" style={{ width: `${progress}%` }} />
          </div>
          <input
            className="ap-range-input"
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            onMouseDown={() => setDragging(true)}
            onMouseUp={() => setDragging(false)}
            onTouchStart={() => setDragging(true)}
            onTouchEnd={() => setDragging(false)}
            onChange={seek}
          />
        </div>
        <span className="ap-time">{fmt(duration)}</span>
      </div>

      {/* controls */}
      <div className="ap-controls">
        <button className="ap-btn ap-btn-sm" onClick={() => skip(-10)} title="-10с">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/><text x="8" y="16" fontSize="5" fontWeight="bold" stroke="none" fill="currentColor">10</text></svg>
        </button>

        <button className="ap-btn ap-btn-play" onClick={togglePlay}>
          {playing
            ? <svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>
          }
        </button>

        <button className="ap-btn ap-btn-sm" onClick={() => skip(10)} title="+10с">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.5"/><text x="8" y="16" fontSize="5" fontWeight="bold" stroke="none" fill="currentColor">10</text></svg>
        </button>
      </div>

      {/* volume */}
      <div className="ap-volume">
        <button
          className="ap-vol-icon"
          onClick={() => {
            const next = volume > 0 ? 0 : 0.85;
            setVolume(next);
            if (audioRef.current) audioRef.current.volume = next;
          }}
        >
          {volume === 0
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            : volume < 0.5
            ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
          }
        </button>
        <div className="ap-vol-range-wrap">
          <div className="ap-range-track">
            <div className="ap-range-fill" style={{ width: `${volume * 100}%` }} />
          </div>
          <input
            className="ap-range-input"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={handleVolumeChange}
          />
        </div>
      </div>
    </div>
  );
}
