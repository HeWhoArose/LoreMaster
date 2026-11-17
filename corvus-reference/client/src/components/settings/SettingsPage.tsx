import React, { useEffect, useState } from 'react';
import type { GlobalConfig } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { Modal } from '../common/Modal';
import { AppearanceSettings } from './AppearanceSettings';
import { ComfyUISettings } from './ComfyUISettings';
import { EngineSettings } from './EngineSettings';
import { LMStudioSettings } from './LMStudioSettings';
import { TTSSettings } from './TTSSettings';

export interface SettingsPageProps {
  open: boolean;
  onClose: () => void;
  settings: GlobalConfig | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  onUpdate: (patch: Partial<GlobalConfig>) => Promise<GlobalConfig>;
  onTestLMStudio: (override?: { url?: string; apiKey?: string; model?: string }) => Promise<{ ok: boolean; model?: string; error?: string }>;
  onTestComfyUI: (override?: { url?: string }) => Promise<{ ok: boolean; version?: string; error?: string }>;
}

type Tab = 'lm' | 'comfy' | 'engine' | 'appearance' | 'tts';

export function SettingsPage({
  open,
  onClose,
  settings,
  loading,
  saving,
  error,
  onUpdate,
  onTestLMStudio,
  onTestComfyUI,
}: SettingsPageProps) {
  const [tab, setTab] = useState<Tab>('lm');
  const [draft, setDraft] = useState<GlobalConfig | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    if (open && settings) {
      setDraft(JSON.parse(JSON.stringify(settings)));
      setDirty(false);
      setSaveError(null);
      setSaveStatus(null);
    }
  }, [open, settings]);

  const updateSection = <K extends keyof GlobalConfig>(section: K, patch: Partial<GlobalConfig[K]>) => {
    setDraft((d) => {
      if (!d) return d;
      const next = { ...d, [section]: { ...d[section], ...patch } } as GlobalConfig;
      setDirty(true);
      return next;
    });
  };

  const save = async () => {
    if (!draft) return;
    setSaveError(null);
    setSaveStatus(null);
    try {
      await onUpdate(draft);
      setDirty(false);
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e: any) {
      setSaveError(e?.message || 'Failed to save');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      size="xl"
      footer={
        <>
          {saveError && <span className="text-xs text-error mr-auto">{saveError}</span>}
          {saveStatus && <span className="text-xs text-success mr-auto">{saveStatus}</span>}
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
            {saving ? <LoadingSpinner size={14} label="Saving" /> : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="flex border-b border-border mb-4">
        <TabBtn label="LLM Endpoint" active={tab === 'lm'} onClick={() => setTab('lm')} />
        <TabBtn label="ComfyUI" active={tab === 'comfy'} onClick={() => setTab('comfy')} />
        <TabBtn label="Engine" active={tab === 'engine'} onClick={() => setTab('engine')} />
        <TabBtn label="TTS" active={tab === 'tts'} onClick={() => setTab('tts')} />
        <TabBtn label="Appearance" active={tab === 'appearance'} onClick={() => setTab('appearance')} />
      </div>

      {loading && !draft && (
        <div className="py-8 flex justify-center">
          <LoadingSpinner label="Loading settings" />
        </div>
      )}

      {error && <div className="p-3 border border-error text-error rounded text-sm">{error}</div>}

      {draft && tab === 'lm' && (
        <LMStudioSettings
          value={draft.lmStudio}
          onChange={(patch) => updateSection('lmStudio', patch)}
          onTest={() =>
            onTestLMStudio({
              url: draft.lmStudio.url,
              apiKey: draft.lmStudio.apiKey,
              model: draft.lmStudio.model,
            })
          }
          saving={saving}
        />
      )}
      {draft && tab === 'comfy' && (
        <ComfyUISettings
          value={draft.comfyui}
          onChange={(patch) => updateSection('comfyui', patch)}
          onTest={() => onTestComfyUI({ url: draft.comfyui.url })}
          saving={saving}
        />
      )}
      {draft && tab === 'engine' && (
        <EngineSettings
          value={draft.engine}
          onChange={(patch) => updateSection('engine', patch)}
        />
      )}
      {draft && tab === 'tts' && (
        <TTSSettings
          value={draft.tts}
          onChange={(patch) => updateSection('tts', patch)}
          saving={saving}
        />
      )}
      {draft && tab === 'appearance' && (
        <AppearanceSettings
          value={draft.appearance}
          onChange={(patch) => updateSection('appearance', patch)}
        />
      )}
    </Modal>
  );
}

function TabBtn({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`px-4 py-2 text-sm border-b-2 transition-colors ${
        active
          ? 'border-accent text-text-primary font-medium'
          : 'border-transparent text-text-muted hover:text-text-primary'
      }`}
      onClick={onClick}
    >
      {label}
    </button>
  );
}
