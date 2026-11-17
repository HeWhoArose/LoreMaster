import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';
import type { DialogueSegment } from '../utils/dialogueSplit';

/**
 * useTTS — singleton-ish hook that owns the TTS queue + a single
 * <audio> element. Components consume it via TTSContext (see
 * TTSProvider) so the dock, chat messages, and settings tab all act
 * on the same queue.
 *
 * Design choices:
 *   - Server-proxied synthesis (POST /api/tts/synthesize → audio
 *     bytes). We Blob-URL the bytes and feed an HTMLAudioElement.
 *     This keeps CORS + auth simple and mirrors the LM Studio
 *     pattern.
 *   - Queue is a plain array of `QueueItem`. We synthesize lazily
 *     (one ahead) to avoid hammering the server for queued items
 *     that may be skipped.
 *   - `volume` is reflected onto the live audio element immediately.
 *   - Pause/resume use the underlying audio element. `skip` aborts
 *     the current item; `clear` empties the queue + stops audio.
 */

export interface QueueItem {
  id: string;
  /** Voice id; empty → server-side default. */
  voice: string;
  text: string;
  /** Optional human label for the dock ("Aria", "Narrator"). */
  label?: string;
  /** NPC id when this segment was attributed; for highlighting. */
  speaker?: string;
}

export interface TTSState {
  enabled: boolean;
  volume: number;
  paused: boolean;
  /** Currently-playing item, if any. */
  current: QueueItem | null;
  /** Queue length INCLUDING the current item. */
  pending: number;
  /** Last error, if any (cleared on next successful playback). */
  error: string | null;
}

export interface TTSControls extends TTSState {
  setEnabled: (v: boolean) => void;
  setVolume: (v: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  clear: () => void;
  /** Enqueue a single segment. */
  enqueue: (item: Omit<QueueItem, 'id'>) => void;
  /** Enqueue many (e.g. output of splitDialogue). */
  enqueueAll: (items: Array<Omit<QueueItem, 'id'>>) => void;
  /** Play a one-shot (clears queue first). Used by the "Play" button. */
  playNow: (items: Array<Omit<QueueItem, 'id'>>) => void;
}

let _id = 0;
const nextId = () => `tts-${++_id}-${Date.now()}`;

export function useTTSEngine(initial: { enabled: boolean; volume: number }): TTSControls {
  const [enabled, setEnabledState] = useState(initial.enabled);
  const [volume, setVolumeState] = useState(initial.volume);
  const [paused, setPaused] = useState(false);
  const [current, setCurrent] = useState<QueueItem | null>(null);
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Stable refs so the playback loop doesn't churn between renders.
  const queueRef = useRef<QueueItem[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const enabledRef = useRef(enabled);
  const volumeRef = useRef(volume);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);
  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = clamp01(volume);
  }, [volume]);

  // Lazy create the <audio> element on first use.
  function getAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = 'auto';
      el.volume = clamp01(volumeRef.current);
      audioRef.current = el;
    }
    return audioRef.current;
  }

  function refreshPending() {
    setPending(queueRef.current.length + (playingRef.current ? 1 : 0));
  }

  function cleanupBlob() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }

  const playOne = useCallback(async (item: QueueItem): Promise<void> => {
    setCurrent(item);
    setError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const blob = await api.synthesizeTTS(item.text, item.voice || undefined);
      if (ac.signal.aborted) return;
      cleanupBlob();
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      const audio = getAudio();
      audio.src = url;
      audio.volume = clamp01(volumeRef.current);
      await new Promise<void>((resolve, reject) => {
        const onEnded = () => {
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          resolve();
        };
        const onError = () => {
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          reject(new Error('audio playback failed'));
        };
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);
        ac.signal.addEventListener('abort', () => {
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          try { audio.pause(); } catch { /* ignore */ }
          resolve(); // treat skip as "done"
        });
        audio.play().catch((e) => {
          // Autoplay restrictions etc. — bubble up.
          audio.removeEventListener('ended', onEnded);
          audio.removeEventListener('error', onError);
          reject(e);
        });
      });
    } catch (e: any) {
      if (!ac.signal.aborted) {
        setError(e?.message || 'TTS playback failed');
      }
    }
  }, []);

  const drain = useCallback(async () => {
    if (playingRef.current) return;
    playingRef.current = true;
    try {
      while (enabledRef.current && queueRef.current.length > 0) {
        const next = queueRef.current.shift()!;
        refreshPending();
        await playOne(next);
      }
    } finally {
      playingRef.current = false;
      setCurrent(null);
      cleanupBlob();
      refreshPending();
    }
  }, [playOne]);

  const enqueue = useCallback((item: Omit<QueueItem, 'id'>) => {
    if (!item.text.trim()) return;
    queueRef.current.push({ ...item, id: nextId() });
    refreshPending();
    if (enabledRef.current && !paused) void drain();
  }, [drain, paused]);

  const enqueueAll = useCallback((items: Array<Omit<QueueItem, 'id'>>) => {
    let added = 0;
    for (const it of items) {
      if (it.text.trim()) {
        queueRef.current.push({ ...it, id: nextId() });
        added++;
      }
    }
    if (added) refreshPending();
    if (added && enabledRef.current && !paused) void drain();
  }, [drain, paused]);

  const skip = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    queueRef.current = [];
    abortRef.current?.abort();
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* ignore */ }
      audioRef.current.src = '';
    }
    cleanupBlob();
    setCurrent(null);
    refreshPending();
  }, []);

  const pause = useCallback(() => {
    setPaused(true);
    try { audioRef.current?.pause(); } catch { /* ignore */ }
  }, []);

  const resume = useCallback(() => {
    setPaused(false);
    const a = audioRef.current;
    if (a && a.src) {
      a.play().catch((e) => setError(e?.message || 'resume failed'));
    } else if (enabledRef.current) {
      void drain();
    }
  }, [drain]);

  const playNow = useCallback((items: Array<Omit<QueueItem, 'id'>>) => {
    clear();
    enqueueAll(items);
  }, [clear, enqueueAll]);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    if (!v) {
      // Disabling stops everything.
      queueRef.current = [];
      abortRef.current?.abort();
      try { audioRef.current?.pause(); } catch { /* ignore */ }
      cleanupBlob();
      setCurrent(null);
      setPending(0);
    }
  }, []);

  const setVolume = useCallback((v: number) => {
    setVolumeState(clamp01(v));
  }, []);

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      try { audioRef.current?.pause(); } catch { /* ignore */ }
      cleanupBlob();
    };
  }, []);

  return {
    enabled,
    volume,
    paused,
    current,
    pending,
    error,
    setEnabled,
    setVolume,
    pause,
    resume,
    skip,
    clear,
    enqueue,
    enqueueAll,
    playNow,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}
