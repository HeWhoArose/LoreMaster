import React, { useEffect, useState } from 'react';
import * as api from '../../api';
import type { GlobalConfig } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';

export interface TTSSettingsProps {
  value: GlobalConfig['tts'];
  onChange: (patch: Partial<GlobalConfig['tts']>) => void;
  saving: boolean;
}

/**
 * TTS settings tab.
 *
 * Works with both major Chatterbox HTTP wrappers:
 *
 *   - devnen/Chatterbox-TTS-Server publishes voice lists via
 *     `/get_predefined_voices` and `/get_reference_files`. We get a real
 *     dropdown.
 *   - travisvn/chatterbox-tts-api has no voice catalog (voices are
 *     server-side sample files). The field stays as free-text.
 *
 * The Test button auto-discovers which fork is running and populates the
 * voice list if available. Free-text input is always allowed so the user
 * can type a filename the server has but didn't advertise.
 */
export function TTSSettings({ value, onChange, saving }: TTSSettingsProps) {
  const [voices, setVoices] = useState<api.TTSVoice[]>([]);
  const [voicesProbed, setVoicesProbed] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Quietly refresh the voice list on first mount IF TTS is already
  // enabled and a URL is saved. Failures are silent — the explicit Test
  // button is the user-facing diagnostic.
  useEffect(() => {
    if (!value.enabled || !value.url) return;
    let alive = true;
    api.listTTSVoices({ url: value.url, apiKey: value.apiKey })
      .then((r) => {
        if (!alive) return;
        if (r.ok) {
          setVoices(r.voices);
          setVoicesProbed(true);
        }
      })
      .catch(() => {/* silent */});
    return () => { alive = false; };
    // Intentionally only re-run when these change (not on every keystroke).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.enabled]);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.testTTS({ url: value.url, apiKey: value.apiKey });
      if (r.ok) {
        const list = r.voices || [];
        setVoices(list);
        setVoicesProbed(true);
        const detail = list.length > 0
          ? `${list.length} voice(s) found`
          : 'server reachable (no voice catalog — use a sample filename)';
        setTestResult({ ok: true, message: `Connected · ${detail}` });
      } else {
        setTestResult({ ok: false, message: r.error || 'Failed' });
      }
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || 'Failed' });
    } finally {
      setTesting(false);
    }
  };

  const hasCatalog = voices.length > 0;

  return (
    <div className="space-y-3">
      <div className="rounded bg-surface-2 border border-border px-3 py-2 text-xs text-text-muted">
        Text-to-speech via Chatterbox. Works with both{' '}
        <a className="text-accent hover:underline" href="https://github.com/devnen/Chatterbox-TTS-Server" target="_blank" rel="noreferrer">
          devnen/Chatterbox-TTS-Server
        </a>{' '}
        and{' '}
        <a className="text-accent hover:underline" href="https://github.com/travisvn/chatterbox-tts-api" target="_blank" rel="noreferrer">
          travisvn/chatterbox-tts-api
        </a>{' '}
        via the OpenAI-compatible <code className="mono">/v1/audio/speech</code> endpoint.
      </div>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <span className="text-sm">Enable TTS</span>
      </label>

      <Field
        label="Server URL"
        hint="devnen defaults to port 8000, travisvn to 4123. Use the base URL — paths are added automatically."
      >
        <input
          type="text"
          value={value.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full mono text-xs"
          placeholder="http://localhost:8000"
        />
      </Field>

      <Field label="API Key" hint="Optional. Sent as Authorization: Bearer.">
        <input
          type="password"
          value={value.apiKey || ''}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          className="w-full mono text-xs"
          autoComplete="off"
          spellCheck={false}
          placeholder="(blank for local Chatterbox)"
        />
      </Field>

      <Field
        label="Narrator voice"
        hint={
          hasCatalog
            ? 'Pick from the server\'s predefined and reference voices.'
            : voicesProbed
              ? 'This server doesn\'t publish a voice list. Type the basename of a voice sample file on the server.'
              : 'Hit Test connection to populate the voice list.'
        }
      >
        {hasCatalog ? (
          <select
            value={value.narratorVoice || ''}
            onChange={(e) => onChange({ narratorVoice: e.target.value })}
            className="w-full text-xs"
          >
            <option value="">(server default)</option>
            {groupVoices(voices).map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name || v.id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={value.narratorVoice || ''}
            onChange={(e) => onChange({ narratorVoice: e.target.value })}
            className="w-full mono text-xs"
            placeholder="(server default)"
            spellCheck={false}
          />
        )}
      </Field>

      <Field label="Audio format" hint="devnen: wav, opus. travisvn: wav, mp3, flac, opus. wav is the safest default.">
        <select
          value={value.format}
          onChange={(e) => onChange({ format: e.target.value as any })}
          className="text-xs"
        >
          <option value="wav">wav</option>
          <option value="opus">opus</option>
          <option value="mp3">mp3 (travisvn only)</option>
          <option value="flac">flac (travisvn only)</option>
        </select>
      </Field>

      <SliderField
        label="Volume"
        min={0}
        max={1}
        step={0.05}
        value={value.volume}
        onChange={(v) => onChange({ volume: v })}
      />

      <SliderField
        label="Speed"
        min={0.5}
        max={2}
        step={0.05}
        value={value.speed}
        onChange={(v) => onChange({ speed: v })}
        hint="Playback speed. 1.0 is natural."
      />

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={value.autoPlay}
          onChange={(e) => onChange({ autoPlay: e.target.checked })}
        />
        <span className="text-sm">Auto-play new storyteller messages</span>
      </label>

      <div className="flex items-center gap-2 pt-2">
        <button className="btn btn-sm" onClick={runTest} disabled={testing || saving || !value.url}>
          {testing ? <LoadingSpinner size={12} label="Testing" /> : 'Test connection'}
        </button>
        {testResult && (
          <span className={`text-xs ${testResult.ok ? 'text-success' : 'text-error'}`}>
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

/** Group voices by source (predefined / cloned reference / OpenAI-shape). */
function groupVoices(voices: api.TTSVoice[]): Array<{ label: string; voices: api.TTSVoice[] }> {
  const buckets: Record<string, api.TTSVoice[]> = {
    Predefined: [],
    'Cloned (reference)': [],
    Other: [],
  };
  for (const v of voices) {
    if (v.source === 'predefined') buckets.Predefined.push(v);
    else if (v.source === 'reference') buckets['Cloned (reference)'].push(v);
    else buckets.Other.push(v);
  }
  const out: Array<{ label: string; voices: api.TTSVoice[] }> = [];
  for (const [label, list] of Object.entries(buckets)) {
    if (list.length) out.push({ label, voices: list });
  }
  return out;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text-muted mb-1 block">{label}</span>
        {hint && <span className="text-[10px] text-text-muted">{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function SliderField({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
  hint,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-text-muted">{label}</span>
        <span className="mono text-text-primary">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <div className="text-[10px] text-text-muted mt-1">{hint}</div>}
    </div>
  );
}
