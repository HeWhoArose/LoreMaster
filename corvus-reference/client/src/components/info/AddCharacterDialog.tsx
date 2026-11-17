import React, { useState } from 'react';
import * as api from '../../api';
import type { CharacterDraft } from '../../api';
import type { NPCCharacter } from '../../types';
import { FromImagePanel } from '../common/FromImagePanel';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { Modal } from '../common/Modal';

export interface AddCharacterDialogProps {
  open: boolean;
  onClose: () => void;
  /** Current game id — needed for character-card import. */
  gameId?: string | null;
  /** Submit the new character. Should resolve when persisted. */
  onAdd: (patch: Partial<NPCCharacter>) => Promise<any>;
}

interface CharacterFormState {
  name: string;
  appearance: string;
  personality: string;
  background: string;
  knownInfo: string;
  dispositionTowardPlayer: string;
  voiceStyle: string;
  basePrompt: string;
  baseNegative: string;
}

const EMPTY: CharacterFormState = {
  name: '',
  appearance: '',
  personality: '',
  background: '',
  knownInfo: '',
  dispositionTowardPlayer: 'neutral',
  voiceStyle: '',
  basePrompt: '',
  baseNegative: '',
};

export function AddCharacterDialog({ open, onClose, gameId, onAdd }: AddCharacterDialogProps) {
  const [tab, setTab] = useState<'manual' | 'image' | 'card'>('manual');
  const [form, setForm] = useState<CharacterFormState>({ ...EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setForm({ ...EMPTY });
    setError(null);
    setSubmitting(false);
    setTab('manual');
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  // Apply an imported character-card draft into the manual form.
  const applyCardDraft = (draft: Partial<NPCCharacter>) => {
    setForm({
      name: draft.name || '',
      appearance: draft.appearance || '',
      personality: draft.personality || '',
      background: draft.background || '',
      knownInfo: draft.knownInfo || '',
      dispositionTowardPlayer: draft.dispositionTowardPlayer || 'neutral',
      voiceStyle: draft.voiceStyle || '',
      basePrompt: draft.image?.basePrompt || '',
      baseNegative: draft.image?.baseNegative || '',
    });
    setTab('manual');
    setError(null);
  };

  // Apply a vision draft into the manual form so the user can review/edit before saving.
  const applyDraft = (draft: CharacterDraft) => {
    setForm({
      name: draft.name || '',
      appearance: draft.appearance || '',
      personality: draft.personality || '',
      background: draft.background || '',
      knownInfo: draft.knownInfo || '',
      dispositionTowardPlayer: draft.dispositionTowardPlayer || 'neutral',
      voiceStyle: draft.voiceStyle || '',
      basePrompt: draft.image?.basePrompt || '',
      baseNegative: draft.image?.baseNegative || '',
    });
    setTab('manual');
    setError(null);
  };

  const submit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({
        name: form.name.trim(),
        revealedName: null,
        appearance: form.appearance.trim(),
        personality: form.personality.trim(),
        background: form.background.trim(),
        knownInfo: form.knownInfo.trim(),
        dispositionTowardPlayer: form.dispositionTowardPlayer.trim() || 'neutral',
        voiceStyle: form.voiceStyle.trim(),
        memory: [],
        image: {
          basePrompt: form.basePrompt.trim(),
          coreAppearance: '',
          baseNegative: form.baseNegative.trim(),
          lastPrompt: null,
          lastSeed: null,
          identitySeed: null,
          portraitPath: null,
        },
      });
      reset();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to add character');
    } finally {
      setSubmitting(false);
    }
  };

  const setField = <K extends keyof CharacterFormState>(k: K, v: CharacterFormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
  };

  const footer = (
    <div className="flex items-center gap-2 w-full">
      <div className="ml-auto flex gap-2">
        <button className="btn" onClick={close} disabled={submitting}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={submitting || tab !== 'manual'}
          title={tab !== 'manual' ? 'Switch to Manual to review and add the character' : undefined}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner size={14} label="Adding" /> Adding…
            </span>
          ) : (
            'Add Character'
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={close} title="Add Character" size="xl" footer={footer}>
      <div className="flex border-b border-border mb-3">
        <TabButton active={tab === 'manual'} onClick={() => setTab('manual')}>
          Manual
        </TabButton>
        <TabButton active={tab === 'image'} onClick={() => setTab('image')}>
          📷 From Image
        </TabButton>
        <TabButton active={tab === 'card'} onClick={() => setTab('card')}>
          Import Card
        </TabButton>
      </div>

      {tab === 'manual' ? (
        <div className="space-y-3">
          {error && (
            <div className="p-2 rounded border border-error text-error text-xs bg-error/10">
              {error}
            </div>
          )}

          <Field label="Name" required>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              className="w-full"
              placeholder="e.g. Rook, Elara, the Stranger"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Disposition toward player">
              <input
                type="text"
                value={form.dispositionTowardPlayer}
                onChange={(e) => setField('dispositionTowardPlayer', e.target.value)}
                className="w-full"
                placeholder="neutral / friendly / wary / hostile"
              />
            </Field>
            <Field label="Voice style">
              <input
                type="text"
                value={form.voiceStyle}
                onChange={(e) => setField('voiceStyle', e.target.value)}
                className="w-full"
                placeholder="how they speak — cadence, vocabulary, accent"
              />
            </Field>
          </div>

          <Field label="Appearance">
            <textarea
              rows={2}
              value={form.appearance}
              onChange={(e) => setField('appearance', e.target.value)}
              className="w-full resize-none"
              placeholder="physical description (also used for portraits)"
            />
          </Field>

          <Field label="Personality">
            <textarea
              rows={2}
              value={form.personality}
              onChange={(e) => setField('personality', e.target.value)}
              className="w-full resize-none"
            />
          </Field>

          <Field label="Background">
            <textarea
              rows={3}
              value={form.background}
              onChange={(e) => setField('background', e.target.value)}
              className="w-full resize-none"
            />
          </Field>

          <Field label="Known info" hint="What the player would know about this character on first meeting.">
            <textarea
              rows={2}
              value={form.knownInfo}
              onChange={(e) => setField('knownInfo', e.target.value)}
              className="w-full resize-none"
            />
          </Field>

          <details className="rounded border border-border p-2">
            <summary className="text-xs uppercase tracking-wider text-text-muted font-semibold cursor-pointer">
              Image prompts (optional)
            </summary>
            <div className="space-y-3 mt-3">
              <Field label="Base prompt" hint="Stable-diffusion-friendly prompt for portraits.">
                <textarea
                  rows={2}
                  value={form.basePrompt}
                  onChange={(e) => setField('basePrompt', e.target.value)}
                  className="w-full resize-none"
                />
              </Field>
              <Field label="Negative prompt">
                <textarea
                  rows={2}
                  value={form.baseNegative}
                  onChange={(e) => setField('baseNegative', e.target.value)}
                  className="w-full resize-none"
                />
              </Field>
            </div>
          </details>
        </div>
      ) : tab === 'image' ? (
        <FromImagePanel
          mode="character"
          applyLabel="Apply to form"
          onApply={(d) => applyDraft(d as CharacterDraft)}
        />
      ) : (
        <ImportCardPanel gameId={gameId || null} onApply={applyCardDraft} />
      )}
    </Modal>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? 'border-accent text-accent font-semibold'
          : 'border-transparent text-text-muted hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-text-muted font-semibold">
        {label}
        {required && <span className="text-error ml-1">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {hint && <div className="text-[10px] text-text-muted mt-1">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Import Card panel — SillyTavern / chub.ai character cards (PNG or JSON)
// ---------------------------------------------------------------------------
function ImportCardPanel({
  gameId,
  onApply,
}: {
  gameId: string | null;
  onApply: (draft: Partial<NPCCharacter>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Failed to read file.'));
          return;
        }
        // result is a data URI like "data:image/png;base64,AAAA..." — the server
        // strips the prefix itself, but we send only the base64 portion.
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(new Error('FileReader failed.'));
      reader.readAsDataURL(file);
    });

  const handleFile = async (file: File) => {
    if (!gameId) {
      setErr('No active game — select or create a game first.');
      return;
    }
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const result = await api.importCharacterCard(gameId, {
        fileBase64,
        filename: file.name,
        save: false,
      });
      if ('draft' in result) {
        setInfo(`Loaded ${result.source} card. Review fields below before saving.`);
        onApply(result.draft);
      } else {
        setInfo(`Loaded ${result.source} card.`);
        onApply(result.character);
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to import card.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-sm text-text-secondary leading-relaxed">
        Import a character card from{' '}
        <a
          href="https://chub.ai"
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent hover:text-accent-light underline"
        >
          chub.ai
        </a>
        , SillyTavern, or any tool that produces V1/V2/V3 character cards. PNG cards with embedded
        metadata and raw JSON files are both supported.
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) await handleFile(file);
        }}
        className={`block rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-accent bg-accent/10'
            : 'border-border bg-surface hover:border-accent/60 hover:bg-surface-2'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}
      >
        <input
          type="file"
          accept=".png,.json,image/png,application/json"
          className="hidden"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await handleFile(file);
            // Reset so the same file can be re-picked.
            e.target.value = '';
          }}
        />
        {busy ? (
          <span className="inline-flex items-center gap-2 text-text-secondary">
            <LoadingSpinner size={16} label="Parsing card" /> Parsing card…
          </span>
        ) : (
          <>
            <div className="text-sm text-text-primary font-medium">Drop a card here</div>
            <div className="text-xs text-text-muted mt-1">
              or click to pick a .png / .json file
            </div>
          </>
        )}
      </label>

      {info && (
        <div className="p-2 rounded border border-border bg-surface-2 text-xs text-text-secondary">
          {info} Switch to the <span className="text-accent font-medium">Manual</span> tab to
          review and click <span className="text-accent font-medium">Add Character</span>.
        </div>
      )}
      {err && (
        <div className="p-2 rounded border border-error bg-error/10 text-xs text-error">
          {err}
        </div>
      )}

      <details className="text-xs text-text-muted">
        <summary className="cursor-pointer hover:text-text-secondary">How field mapping works</summary>
        <ul className="mt-2 space-y-1 pl-4 list-disc">
          <li><span className="text-text-secondary">name</span> → Name</li>
          <li><span className="text-text-secondary">description</span> → Appearance</li>
          <li><span className="text-text-secondary">personality</span> → Personality</li>
          <li><span className="text-text-secondary">scenario + first_mes</span> → Known info</li>
          <li><span className="text-text-secondary">mes_example</span> → Voice style</li>
          <li><span className="text-text-secondary">creator_notes</span> → Background</li>
          <li>Other fields (tags, system_prompt, character_book) are not imported.</li>
        </ul>
      </details>
    </div>
  );
}
