import React, { useEffect, useState } from 'react';
import { getComfyUIOptions, type ComfyUIOptions } from '../../api';
import type { ExamplePrompt, ImageSettings as ImageSettingsType } from '../../types';

// Fallback lists used when ComfyUI is unreachable. These match the lists
// previously hardcoded in this file.
const FALLBACK_SAMPLERS = [
  'euler',
  'euler_a',
  'heun',
  'dpm_2',
  'dpm_2_a',
  'lms',
  'dpmpp_2s_a',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'dpmpp_sde',
  'ddim',
  'uni_pc',
  'uni_pc_bh2',
];
const FALLBACK_SCHEDULERS = [
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
];
const SIZE_PRESETS = [
  { label: '512 × 512', w: 512, h: 512 },
  { label: '768 × 512', w: 768, h: 512 },
  { label: '512 × 768', w: 512, h: 768 },
  { label: '1024 × 1024', w: 1024, h: 1024 },
  { label: '1024 × 576', w: 1024, h: 576 },
  { label: '576 × 1024', w: 576, h: 1024 },
];

export interface ImageSettingsProps {
  settings: ImageSettingsType;
  batchCount: number;
  onChangeSettings: (patch: Partial<ImageSettingsType>) => void;
  onChangeBatch: (n: number) => void;
  showDenoise?: boolean;
  examples?: ExamplePrompt[];
  onPickExample?: (ex: ExamplePrompt) => void;
  compact?: boolean;
  /** Optional pre-fetched ComfyUI options. If omitted, this panel fetches them once on mount. */
  comfyOptions?: ComfyUIOptions | null;
}

export function ImageSettingsPanel({
  settings,
  batchCount,
  onChangeSettings,
  onChangeBatch,
  showDenoise,
  examples,
  onPickExample,
  compact = true,
  comfyOptions,
}: ImageSettingsProps) {
  const [open, setOpen] = useState(!compact);
  const [fetchedOptions, setFetchedOptions] = useState<ComfyUIOptions | null>(null);

  useEffect(() => {
    if (comfyOptions || fetchedOptions) return;
    let cancelled = false;
    getComfyUIOptions()
      .then((opts) => {
        if (!cancelled) setFetchedOptions(opts);
      })
      .catch(() => {
        // Silent fall back to defaults / current value
      });
    return () => {
      cancelled = true;
    };
  }, [comfyOptions, fetchedOptions]);

  const options = comfyOptions || fetchedOptions;
  const models = options?.models ?? [];
  const samplers = options && options.samplers.length > 0 ? options.samplers : FALLBACK_SAMPLERS;
  const schedulers =
    options && options.schedulers.length > 0 ? options.schedulers : FALLBACK_SCHEDULERS;

  return (
    <div className="card">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-xs uppercase tracking-wider text-text-muted font-semibold">
          Generation settings
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform text-text-muted ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="p-3 pt-0 space-y-3">
          <Field label="Model">
            {models.length > 0 ? (
              <select
                value={settings.model}
                onChange={(e) => onChangeSettings({ model: e.target.value })}
                className="w-full"
              >
                {/* If the current value isn't in the fetched list, surface it so the user can see it */}
                {settings.model && !models.includes(settings.model) && (
                  <option value={settings.model}>{settings.model} (unavailable)</option>
                )}
                {!settings.model && <option value="">Select a model…</option>}
                {models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={settings.model}
                onChange={(e) => onChangeSettings({ model: e.target.value })}
                className="w-full mono text-xs"
                placeholder="Connect to ComfyUI to load models"
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Sampler">
              <select
                value={settings.sampler}
                onChange={(e) => onChangeSettings({ sampler: e.target.value })}
                className="w-full"
              >
                {settings.sampler && !samplers.includes(settings.sampler) && (
                  <option value={settings.sampler}>{settings.sampler}</option>
                )}
                {samplers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Scheduler">
              <select
                value={settings.scheduler}
                onChange={(e) => onChangeSettings({ scheduler: e.target.value })}
                className="w-full"
              >
                {settings.scheduler && !schedulers.includes(settings.scheduler) && (
                  <option value={settings.scheduler}>{settings.scheduler}</option>
                )}
                {schedulers.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Slider
            label="Steps"
            min={1}
            max={150}
            value={settings.steps}
            onChange={(v) => onChangeSettings({ steps: v })}
          />

          <Slider
            label="CFG"
            min={1}
            max={30}
            step={0.5}
            value={settings.cfg}
            onChange={(v) => onChangeSettings({ cfg: v })}
          />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Width">
              <input
                type="number"
                value={settings.width}
                onChange={(e) => onChangeSettings({ width: Number(e.target.value) })}
                className="w-full mono"
              />
            </Field>
            <Field label="Height">
              <input
                type="number"
                value={settings.height}
                onChange={(e) => onChangeSettings({ height: Number(e.target.value) })}
                className="w-full mono"
              />
            </Field>
          </div>
          <div className="flex flex-wrap gap-1">
            {SIZE_PRESETS.map((p) => (
              <button
                type="button"
                key={p.label}
                className={`btn !py-1 !px-2 !text-xs ${
                  settings.width === p.w && settings.height === p.h ? 'btn-primary' : ''
                }`}
                onClick={() => onChangeSettings({ width: p.w, height: p.h })}
              >
                {p.label}
              </button>
            ))}
          </div>

          <Slider
            label="Batch count"
            min={1}
            max={8}
            value={batchCount}
            onChange={(v) => onChangeBatch(v)}
          />

          {showDenoise && (
            <Slider
              label="Denoise strength"
              min={0}
              max={1}
              step={0.01}
              value={settings.denoiseStrength ?? 0.65}
              onChange={(v) => onChangeSettings({ denoiseStrength: v })}
            />
          )}

          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <Field label="Seed (-1 = random)">
              <input
                type="number"
                value={settings.seed}
                onChange={(e) => onChangeSettings({ seed: Number(e.target.value) })}
                className="w-full mono"
              />
            </Field>
            <button
              type="button"
              className="btn"
              onClick={() =>
                onChangeSettings({ seed: Math.floor(Math.random() * 2_147_483_647) })
              }
              title="Random seed"
            >
              🎲
            </button>
          </div>

          {examples && examples.length > 0 && onPickExample && (
            <div>
              <div className="text-xs text-text-muted mb-1">Example prompts</div>
              <div className="flex flex-wrap gap-1">
                {examples.map((ex, i) => (
                  <button
                    type="button"
                    key={i}
                    className="btn !py-1 !px-2 !text-xs"
                    onClick={() => onPickExample(ex)}
                    title={ex.prompt}
                  >
                    {ex.label || `Example ${i + 1}`}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  label,
  min,
  max,
  step = 1,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-text-muted mb-1">
        <span>{label}</span>
        <span className="mono text-text-primary">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
