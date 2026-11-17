import React from 'react';
import { useTTS } from '../../context/TTSContext';

/**
 * Floating TTS dock — sits in the bottom-right corner whenever TTS is
 * enabled. Shows the currently-speaking item, queue depth, pause/resume,
 * skip + clear, and a volume slider. Hidden entirely when TTS is off so
 * it doesn't clutter the UI for users who don't use it.
 */
export function TTSDock() {
  const tts = useTTS();

  if (!tts.enabled) return null;

  const idle = !tts.current && tts.pending === 0;

  return (
    <div
      className="fixed bottom-3 right-3 z-40 select-none"
      role="region"
      aria-label="TTS playback controls"
    >
      <div className="rounded-lg border border-border bg-surface-1/95 backdrop-blur shadow-lg px-3 py-2 min-w-[220px] max-w-[320px]">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              tts.current ? (tts.paused ? 'bg-amber-400' : 'bg-success animate-pulse') : 'bg-text-muted/40'
            }`}
          />
          <span className="text-xs text-text-muted flex-1 truncate">
            {tts.current
              ? `${tts.paused ? 'Paused' : 'Speaking'}${tts.current.label ? ` · ${tts.current.label}` : ''}`
              : idle ? 'TTS ready' : `${tts.pending} queued`}
          </span>
        </div>

        {tts.error && (
          <div className="text-[10px] text-error mb-1.5 truncate" title={tts.error}>
            {tts.error}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {tts.paused ? (
            <button
              className="btn btn-xs"
              onClick={tts.resume}
              title="Resume"
              aria-label="Resume"
            >
              ▶
            </button>
          ) : (
            <button
              className="btn btn-xs"
              onClick={tts.pause}
              title="Pause"
              aria-label="Pause"
              disabled={!tts.current}
            >
              ⏸
            </button>
          )}
          <button
            className="btn btn-xs"
            onClick={tts.skip}
            title="Skip current"
            aria-label="Skip current"
            disabled={!tts.current}
          >
            ⏭
          </button>
          <button
            className="btn btn-xs"
            onClick={tts.clear}
            title="Clear queue"
            aria-label="Clear queue"
            disabled={idle}
          >
            ✕
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={tts.volume}
            onChange={(e) => tts.setVolume(Number(e.target.value))}
            className="flex-1 ml-1"
            aria-label="Volume"
            title={`Volume: ${Math.round(tts.volume * 100)}%`}
          />
        </div>
      </div>
    </div>
  );
}
