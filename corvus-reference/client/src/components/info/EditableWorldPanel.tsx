import React, { useState } from 'react';
import type { WorldInfo } from '../../types';

export interface EditableWorldPanelProps {
  world: WorldInfo;
  onUpdateWorld?: (patch: Partial<WorldInfo>) => Promise<any>;
}

export function EditableWorldPanel({ world, onUpdateWorld }: EditableWorldPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<WorldInfo>({ ...world });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = () => {
    setDraft({ ...world });
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
  };

  const save = async () => {
    if (!onUpdateWorld) return;
    setSaving(true);
    setError(null);
    try {
      await onUpdateWorld(draft);
      setEditing(false);
    } catch (e: any) {
      setError(e?.message || 'Failed to save world info');
    } finally {
      setSaving(false);
    }
  };

  const set = (field: keyof WorldInfo) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setDraft((d) => ({ ...d, [field]: e.target.value }));
  };

  // Existing games may not have narratorEnabled set — treat undefined as true.
  const narratorOn = world.narratorEnabled !== false;
  const [togglingNarrator, setTogglingNarrator] = useState(false);
  const [narratorError, setNarratorError] = useState<string | null>(null);
  const toggleNarrator = async () => {
    if (!onUpdateWorld || togglingNarrator) return;
    setTogglingNarrator(true);
    setNarratorError(null);
    try {
      await onUpdateWorld({ narratorEnabled: !narratorOn });
    } catch (e: any) {
      setNarratorError(e?.message || 'Failed to toggle narrator');
    } finally {
      setTogglingNarrator(false);
    }
  };

  if (!editing) {
    return (
      <div className="text-sm space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-text-muted text-xs">World details</span>
          {onUpdateWorld && (
            <button
              className="btn btn-ghost !py-0.5 !px-1.5 !text-[11px] flex items-center gap-1"
              onClick={startEdit}
              title="Edit world info"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              Edit
            </button>
          )}
        </div>

        {onUpdateWorld && (
          <NarratorToggle
            on={narratorOn}
            disabled={togglingNarrator}
            onChange={toggleNarrator}
            error={narratorError}
          />
        )}

        <WorldField label="Setting" value={world.setting} />
        <WorldField label="Era" value={world.era} />
        <WorldField label="Tone" value={world.tone} />
        <WorldField label="Currency" value={world.currencyName} />
        {world.rules && <WorldField label="Rules" value={world.rules} />}
        {world.customInstructions && (
          <WorldField label="Notes" value={world.customInstructions} />
        )}
      </div>
    );
  }

  return (
    <div className="text-sm space-y-3">
      <div className="text-xs text-text-muted font-semibold">Editing world info</div>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Setting</span>
        <textarea
          className="w-full text-xs min-h-[60px]"
          value={draft.setting}
          onChange={set('setting')}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Era</span>
        <input className="w-full text-xs" type="text" value={draft.era} onChange={set('era')} />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Tone</span>
        <input className="w-full text-xs" type="text" value={draft.tone} onChange={set('tone')} />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Currency name</span>
        <input
          className="w-full text-xs"
          type="text"
          value={draft.currencyName}
          onChange={set('currencyName')}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Rules</span>
        <textarea
          className="w-full text-xs min-h-[60px]"
          value={draft.rules}
          onChange={set('rules')}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs text-text-muted">Custom instructions</span>
        <textarea
          className="w-full text-xs min-h-[60px]"
          value={draft.customInstructions}
          onChange={set('customInstructions')}
        />
      </label>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={draft.narratorEnabled !== false}
          onChange={(e) => setDraft((d) => ({ ...d, narratorEnabled: e.target.checked }))}
        />
        <span className="flex-1">
          <span className="text-xs text-text-primary block">Narrator enabled</span>
          <span className="text-[11px] text-text-muted">
            When off, the storyteller speaks only through characters — no [Narrator] blocks.
            Requires at least one character in the scene.
          </span>
        </span>
      </label>

      {error && <div className="text-xs text-error">{error}</div>}

      <div className="flex gap-2">
        <button className="btn btn-ghost text-xs" onClick={cancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary text-xs" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

function WorldField({ label, value }: { label: string; value: string | undefined }) {
  if (!value) return null;
  return (
    <div>
      <span className="text-text-muted">{label}: </span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}

interface NarratorToggleProps {
  on: boolean;
  disabled: boolean;
  onChange: () => void;
  error: string | null;
}

function NarratorToggle({ on, disabled, onChange, error }: NarratorToggleProps) {
  return (
    <div className="flex items-start gap-2 py-1">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={onChange}
        disabled={disabled}
        title={on ? 'Click to disable narrator' : 'Click to enable narrator'}
        className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
          on ? 'bg-accent' : 'bg-surface-2 border border-border'
        } ${disabled ? 'opacity-60 cursor-wait' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform ${
            on ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
      <div className="flex-1 leading-tight">
        <div className="text-xs text-text-primary">
          Narrator {on ? 'on' : 'off'}
        </div>
        <div className="text-[11px] text-text-muted">
          {on
            ? 'Storyteller may narrate scenes between character dialogue.'
            : 'Storyteller speaks only as characters — no narrator blocks.'}
        </div>
        {error && <div className="text-[11px] text-error mt-0.5">{error}</div>}
      </div>
    </div>
  );
}
