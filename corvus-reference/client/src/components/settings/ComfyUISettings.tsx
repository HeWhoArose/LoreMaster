import React, { useCallback, useEffect, useState } from 'react';
import type { ExamplePrompt, GlobalConfig } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';

export interface ComfyUISettingsProps {
  value: GlobalConfig['comfyui'];
  onChange: (patch: Partial<GlobalConfig['comfyui']>) => void;
  onTest: () => Promise<{ ok: boolean; version?: string; error?: string }>;
  saving: boolean;
}

interface ComfyUIOptions {
  models: string[];
  samplers: string[];
  schedulers: string[];
}

export function ComfyUISettings({ value, onChange, onTest, saving }: ComfyUISettingsProps) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [options, setOptions] = useState<ComfyUIOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  const fetchOptions = useCallback(async () => {
    if (!value.enabled) return;
    setOptionsLoading(true);
    setOptionsError(null);
    try {
      const res = await fetch('/api/settings/comfyui/options');
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data: ComfyUIOptions = await res.json();
      setOptions(data);
    } catch (e: any) {
      setOptionsError(e?.message || 'Failed to fetch ComfyUI options');
    } finally {
      setOptionsLoading(false);
    }
  }, [value.enabled]);

  // Auto-fetch options when enabled
  useEffect(() => {
    if (value.enabled && !options && !optionsLoading) {
      fetchOptions();
    }
  }, [value.enabled, options, optionsLoading, fetchOptions]);

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await onTest();
      setTestResult({
        ok: r.ok,
        message: r.ok ? `Connected${r.version ? ' · v' + r.version : ''}` : r.error || 'Failed',
      });
      // If test succeeds, refresh options
      if (r.ok) fetchOptions();
    } catch (e: any) {
      setTestResult({ ok: false, message: e?.message || 'Failed' });
    } finally {
      setTesting(false);
    }
  };

  const updateDefaults = (patch: Partial<GlobalConfig['comfyui']['defaults']>) => {
    onChange({ defaults: { ...value.defaults, ...patch } });
  };

  const setExamples = (examples: ExamplePrompt[]) => onChange({ examplePrompts: examples });

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
        />
        <span className="text-sm">Enable ComfyUI image generation</span>
      </label>

      <div>
        <span className="text-xs text-text-muted mb-1 block">API URL</span>
        <input
          type="text"
          value={value.url}
          onChange={(e) => onChange({ url: e.target.value })}
          className="w-full mono text-xs"
          placeholder="http://localhost:8188"
        />
      </div>

      {value.enabled && (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wider text-text-muted font-semibold">
                Defaults
              </h4>
              <button
                className="btn !py-1 !px-2 !text-xs"
                onClick={fetchOptions}
                disabled={optionsLoading}
              >
                {optionsLoading ? <LoadingSpinner size={12} label="Loading" /> : 'Refresh options'}
              </button>
            </div>

            {optionsError && (
              <div className="text-xs text-error mb-2 p-2 rounded border border-error bg-error/5">
                Could not load options from ComfyUI: {optionsError}
                <br />
                <span className="text-text-muted">
                  Make sure ComfyUI is running, then click "Refresh options" or test the connection.
                </span>
              </div>
            )}

            <div className="space-y-3">
              <LabelField label="Model">
                {options && options.models.length > 0 ? (
                  <select
                    value={value.defaults.model}
                    onChange={(e) => updateDefaults({ model: e.target.value })}
                    className="w-full"
                  >
                    {!value.defaults.model && <option value="">Select a model...</option>}
                    {options.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={value.defaults.model}
                    onChange={(e) => updateDefaults({ model: e.target.value })}
                    className="w-full mono text-xs"
                    placeholder={optionsLoading ? 'Loading models...' : 'Connect to ComfyUI to load models'}
                  />
                )}
              </LabelField>
              <div className="grid grid-cols-2 gap-3">
                <LabelField label="Sampler">
                  {options && options.samplers.length > 0 ? (
                    <select
                      value={value.defaults.sampler}
                      onChange={(e) => updateDefaults({ sampler: e.target.value })}
                      className="w-full"
                    >
                      {options.samplers.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={value.defaults.sampler}
                      onChange={(e) => updateDefaults({ sampler: e.target.value })}
                      className="w-full mono text-xs"
                      placeholder={optionsLoading ? 'Loading...' : 'Connect to load samplers'}
                    />
                  )}
                </LabelField>
                <LabelField label="Scheduler">
                  {options && options.schedulers.length > 0 ? (
                    <select
                      value={value.defaults.scheduler}
                      onChange={(e) => updateDefaults({ scheduler: e.target.value })}
                      className="w-full"
                    >
                      {options.schedulers.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={value.defaults.scheduler}
                      onChange={(e) => updateDefaults({ scheduler: e.target.value })}
                      className="w-full mono text-xs"
                      placeholder={optionsLoading ? 'Loading...' : 'Connect to load schedulers'}
                    />
                  )}
                </LabelField>
                <LabelField label="Steps">
                  <input
                    type="number"
                    value={value.defaults.steps}
                    onChange={(e) => updateDefaults({ steps: Number(e.target.value) })}
                    className="w-full mono"
                  />
                </LabelField>
                <LabelField label="CFG">
                  <input
                    type="number"
                    step="0.5"
                    value={value.defaults.cfg}
                    onChange={(e) => updateDefaults({ cfg: Number(e.target.value) })}
                    className="w-full mono"
                  />
                </LabelField>
                <LabelField label="Width">
                  <input
                    type="number"
                    value={value.defaults.width}
                    onChange={(e) => updateDefaults({ width: Number(e.target.value) })}
                    className="w-full mono"
                  />
                </LabelField>
                <LabelField label="Height">
                  <input
                    type="number"
                    value={value.defaults.height}
                    onChange={(e) => updateDefaults({ height: Number(e.target.value) })}
                    className="w-full mono"
                  />
                </LabelField>
                <LabelField label="Batch count">
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={value.defaults.batchCount}
                    onChange={(e) => updateDefaults({ batchCount: Number(e.target.value) })}
                    className="w-full mono"
                  />
                </LabelField>
              </div>

              <div className="mt-3">
                <h4 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
                  Img2Img / Inpaint defaults
                </h4>
                <LabelField label="Denoise strength">
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={1}
                    value={value.defaults.denoiseStrength}
                    onChange={(e) => updateDefaults({ denoiseStrength: Number(e.target.value) })}
                    className="w-full mono"
                  />
                </LabelField>
                <div className="text-[10px] text-text-muted mt-1">
                  Only applies to img2img and inpaint modes, not txt2img.
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-2">
              Default negative prompt
            </h4>
            <textarea
              rows={3}
              value={value.negativePromptDefault}
              onChange={(e) => onChange({ negativePromptDefault: e.target.value })}
              className="w-full mono text-xs"
              placeholder="blurry, low quality, watermark, text, ..."
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs uppercase tracking-wider text-text-muted font-semibold">
                Example prompts
              </h4>
              <button
                className="btn !py-1 !px-2 !text-xs"
                onClick={() =>
                  setExamples([
                    ...value.examplePrompts,
                    { label: 'New example', prompt: '', negative: '' },
                  ])
                }
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {value.examplePrompts.length === 0 && (
                <div className="text-xs text-text-muted italic">No examples yet.</div>
              )}
              {value.examplePrompts.map((ex, i) => (
                <div key={i} className="card p-2 space-y-2">
                  <div className="flex gap-2">
                    <input
                      value={ex.label}
                      onChange={(e) => {
                        const next = value.examplePrompts.slice();
                        next[i] = { ...next[i], label: e.target.value };
                        setExamples(next);
                      }}
                      className="flex-1"
                      placeholder="Label"
                    />
                    <button
                      className="btn btn-ghost !px-2"
                      onClick={() => {
                        const next = value.examplePrompts.filter((_, j) => j !== i);
                        setExamples(next);
                      }}
                      aria-label="Remove"
                    >
                      ✕
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={ex.prompt}
                    onChange={(e) => {
                      const next = value.examplePrompts.slice();
                      next[i] = { ...next[i], prompt: e.target.value };
                      setExamples(next);
                    }}
                    placeholder="Prompt"
                    className="w-full mono text-xs"
                  />
                  <textarea
                    rows={1}
                    value={ex.negative}
                    onChange={(e) => {
                      const next = value.examplePrompts.slice();
                      next[i] = { ...next[i], negative: e.target.value };
                      setExamples(next);
                    }}
                    placeholder="Negative prompt"
                    className="w-full mono text-xs"
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 pt-2">
        <button className="btn" onClick={runTest} disabled={testing || saving}>
          {testing ? <LoadingSpinner size={14} label="Testing" /> : 'Test connection'}
        </button>
        {testResult && (
          <span
            className={`text-xs ${testResult.ok ? 'text-success' : 'text-error'}`}
            role="status"
          >
            {testResult.message}
          </span>
        )}
      </div>
    </div>
  );
}

function LabelField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}
