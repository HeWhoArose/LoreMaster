import React, { useEffect, useState } from 'react';
import * as api from '../../api';
import type { NPCCharacter } from '../../types';
import { Modal } from '../common/Modal';
import { ColorPicker } from '../common/ColorPicker';
import { colorForCharacter } from '../../utils/chatColors';
import { PortraitPickerDialog } from './PortraitPickerDialog';

export interface NPCCardProps {
  gameId: string | null;
  character: NPCCharacter | null;
  open: boolean;
  onClose: () => void;
  onSendToImageStudio?: (character: NPCCharacter) => void;
  onDeleteCharacter?: (charId: string) => Promise<any>;
  /** Called after a successful character mutation so the parent can
   *  refresh its NPC list. Receives the updated character. */
  onCharacterUpdated?: (character: NPCCharacter) => void;
  /**
   * v1.1.31: Called when a character is removed via the Deny action (or any
   * other in-modal hard-delete). The parent should drop the id from its
   * `characters` state. This is distinct from `onDeleteCharacter` because the
   * server has already deleted the file — we just need the local state to
   * follow. Without this hook, the denied NPC would remain in the sidebar
   * until a manual refresh, and the modal would re-open it on next click.
   */
  onCharacterDeleted?: (charId: string) => void;
}

interface DraftFields {
  name: string;
  revealedName: string;
  appearance: string;
  personality: string;
  background: string;
  dispositionTowardPlayer: string;
  voiceStyle: string;
  knownInfo: string;
  basePrompt: string;
  coreAppearance: string;
  defaultOutfit: string;
  baseNegative: string;
  /** null = use deterministic default from chatColors palette. */
  chatColor: string | null;
  /** null = fall back to global appearance.actionColor. */
  actionColor: string | null;
  /** v1.1.42 — per-NPC TTS controls. */
  ttsEnabled: boolean;
  ttsVoice: string;
}

function toDraft(c: NPCCharacter): DraftFields {
  return {
    name: c.name || '',
    revealedName: c.revealedName || '',
    appearance: c.appearance || '',
    personality: c.personality || '',
    background: c.background || '',
    dispositionTowardPlayer: c.dispositionTowardPlayer || '',
    voiceStyle: c.voiceStyle || '',
    knownInfo: c.knownInfo || '',
    basePrompt: c.image?.basePrompt || '',
    coreAppearance: c.image?.coreAppearance || '',
    defaultOutfit: c.image?.defaultOutfit || '',
    baseNegative: c.image?.baseNegative || '',
    chatColor: c.chatColor || null,
    actionColor: c.actionColor ?? null,
    ttsEnabled: c.tts?.enabled ?? true,
    ttsVoice: c.tts?.voice || '',
  };
}

export function NPCCard({
  gameId,
  character,
  open,
  onClose,
  onSendToImageStudio,
  onDeleteCharacter,
  onCharacterUpdated,
  onCharacterDeleted,
}: NPCCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Status lifecycle UI (v1.1.28): approve / deny / enable / disable.
  // We keep a single 'statusBusy' flag covering all four because they're
  // mutually exclusive on any given card.
  const [statusBusy, setStatusBusy] = useState<
    null | 'approving' | 'denying' | 'enabling' | 'disabling'
  >(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [regenPromptStatus, setRegenPromptStatus] = useState<
    { state: 'idle' } | { state: 'loading' } | { state: 'error'; message: string }
  >({ state: 'idle' });
  const [seedStatus, setSeedStatus] = useState<
    { state: 'idle' } | { state: 'saving' } | { state: 'error'; message: string }
  >({ state: 'idle' });

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DraftFields | null>(null);
  // v1.1.31: Portrait picker modal. Opens when the user clicks the portrait
  // image in the card. Pulls from the game's image gallery and writes the
  // selection to character.image.portraitPath via api.setImageAsPortrait.
  const [portraitPickerOpen, setPortraitPickerOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    { state: 'idle' } | { state: 'saving' } | { state: 'error'; message: string }
  >({ state: 'idle' });

  // Reset edit state whenever the modal closes or the character changes
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setDraft(null);
      setSaveStatus({ state: 'idle' });
      setConfirmDelete(false);
    }
  }, [open]);
  useEffect(() => {
    if (character) {
      setDraft(toDraft(character));
    }
  }, [character?.id]);

  if (!character) return null;

  const onRegenPrompt = async () => {
    if (!gameId || !character) return;
    setRegenPromptStatus({ state: 'loading' });
    try {
      const { character: updated } = await api.regenImagePrompt(gameId, character.id);
      setRegenPromptStatus({ state: 'idle' });
      onCharacterUpdated?.(updated);
    } catch (err: any) {
      setRegenPromptStatus({
        state: 'error',
        message: err?.message || 'Failed to generate prompt',
      });
    }
  };

  // v1.1.20: identitySeed management. The seed locks the latent-noise starting
  // point so single-subject regenerations land on the same face / build.
  const updateIdentitySeed = async (next: number | null) => {
    if (!gameId || !character) return;
    setSeedStatus({ state: 'saving' });
    try {
      const updated = await api.updateCharacter(gameId, character.id, {
        image: { ...(character.image || {}), identitySeed: next },
      } as any);
      setSeedStatus({ state: 'idle' });
      onCharacterUpdated?.(updated);
    } catch (err: any) {
      setSeedStatus({
        state: 'error',
        message: err?.message || 'Failed to update identity seed',
      });
    }
  };

  const onSetIdentitySeed = () => {
    const current = character?.image?.identitySeed;
    const fresh = Math.floor(Math.random() * 2_147_483_647);
    void updateIdentitySeed(typeof current === 'number' ? fresh : fresh);
  };
  const onClearIdentitySeed = () => void updateIdentitySeed(null);
  const onRerollIdentitySeed = () =>
    void updateIdentitySeed(Math.floor(Math.random() * 2_147_483_647));

  const startEdit = () => {
    setDraft(toDraft(character));
    setEditing(true);
    setSaveStatus({ state: 'idle' });
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(toDraft(character));
    setSaveStatus({ state: 'idle' });
  };

  const saveEdit = async () => {
    if (!gameId || !character || !draft) return;
    setSaveStatus({ state: 'saving' });
    try {
      const trim = (s: string) => s.trim();
      const patch: Partial<NPCCharacter> = {
        name: trim(draft.name) || character.name,
        revealedName: trim(draft.revealedName) ? trim(draft.revealedName) : null,
        appearance: trim(draft.appearance),
        personality: trim(draft.personality),
        background: trim(draft.background),
        dispositionTowardPlayer: trim(draft.dispositionTowardPlayer),
        voiceStyle: trim(draft.voiceStyle),
        knownInfo: trim(draft.knownInfo),
        chatColor: draft.chatColor,
        actionColor: draft.actionColor,
        tts: {
          enabled: draft.ttsEnabled,
          voice: draft.ttsVoice.trim(),
        },
        image: {
          ...(character.image || {}),
          basePrompt: trim(draft.basePrompt),
          coreAppearance: trim(draft.coreAppearance),
          defaultOutfit: trim(draft.defaultOutfit),
          baseNegative: trim(draft.baseNegative),
        },
      };
      const updated = await api.updateCharacter(gameId, character.id, patch);
      setSaveStatus({ state: 'idle' });
      setEditing(false);
      onCharacterUpdated?.(updated);
    } catch (err: any) {
      setSaveStatus({
        state: 'error',
        message: err?.message || 'Failed to save changes',
      });
    }
  };

  const portraitUrl =
    gameId && character.image?.portraitPath
      ? api.getImageURL(gameId, character.image.portraitPath)
      : null;
  const displayName = character.revealedName || character.name || 'Unknown';
  const status = character.status ?? 'active';
  const isPending = status === 'pending';
  const isDisabled = status === 'disabled';

  // Decorate the modal title with a status badge so it's clear at a glance
  // whether this NPC is awaiting approval, off-screen, or active. (v1.1.28)
  const modalTitle = isPending
    ? `${displayName}  —  PENDING APPROVAL`
    : isDisabled
      ? `${displayName}  —  inactive`
      : displayName;

  const runStatusAction = async (
    kind: 'approving' | 'denying' | 'enabling' | 'disabling',
    fn: () => Promise<NPCCharacter | void>
  ) => {
    if (!gameId) return;
    setStatusBusy(kind);
    setStatusError(null);
    try {
      const updated = await fn();
      if (updated && onCharacterUpdated) onCharacterUpdated(updated);
      // v1.1.31: Deny hard-deletes on the server (see /deny route). Tell the
      // parent so it drops this id from its `characters` state, then close.
      // Without onCharacterDeleted the modal closes but the card lingers in
      // the sidebar until the user refreshes — that's the bug seb hit.
      if (kind === 'denying') {
        if (character && onCharacterDeleted) onCharacterDeleted(character.id);
        onClose();
      }
    } catch (err: any) {
      setStatusError(err?.message || `Failed to ${kind.slice(0, -3)} character`);
    } finally {
      setStatusBusy(null);
    }
  };

  const setDraftField = <K extends keyof DraftFields>(k: K, v: DraftFields[K]) => {
    setDraft((d) => (d ? { ...d, [k]: v } : d));
  };

  return (
    <>
    <Modal open={open} onClose={onClose} title={modalTitle} size="lg">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-1">
          {/* v1.1.31: Portrait is clickable when not in edit mode. Opens the
              PortraitPickerDialog so the user can swap the image from the
              gallery without going through the image studio. A small overlay
              hint reveals on hover so the affordance is discoverable. */}
          <button
            type="button"
            className="group relative aspect-[3/4] w-full bg-surface-2 border border-border rounded overflow-hidden flex items-center justify-center cursor-pointer hover:border-accent transition-colors"
            onClick={() => gameId && !editing && setPortraitPickerOpen(true)}
            disabled={!gameId || editing}
            title={editing ? '' : 'Click to pick a portrait from the image gallery'}
          >
            {portraitUrl ? (
              <img
                src={portraitUrl}
                alt={displayName}
                className="w-full h-full object-cover"
              />
            ) : (
              <svg
                width="60%"
                height="60%"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-text-muted"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
            {!editing && gameId && (
              <div className="absolute inset-x-0 bottom-0 bg-black/60 text-white text-[11px] py-1 px-2 text-center opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                {portraitUrl ? 'Change portrait' : 'Pick a portrait'}
              </div>
            )}
          </button>
          {onSendToImageStudio && !editing && (
            <button
              className="btn w-full mt-2"
              onClick={() => onSendToImageStudio(character)}
              title="Generate a portrait in the image studio"
            >
              Open in Studio
            </button>
          )}
          {!editing && (
            <button
              className="btn btn-ghost w-full mt-2 !text-xs"
              onClick={startEdit}
              disabled={!gameId}
            >
              Edit Character
            </button>
          )}
          {/* Status lifecycle controls (v1.1.28) */}
          {!editing && gameId && (
            <div className="mt-2 space-y-1">
              {isPending && (
                <>
                  <div className="text-xs text-text-muted mb-1">
                    The Game Master proposed this character mid-story. Approve to add them, or deny to remove.
                  </div>
                  <div className="flex gap-1">
                    <button
                      className="btn flex-1 !text-xs"
                      disabled={!!statusBusy}
                      onClick={() =>
                        runStatusAction('approving', () => api.approveCharacter(gameId, character.id))
                      }
                    >
                      {statusBusy === 'approving' ? 'Approving…' : 'Approve'}
                    </button>
                    <button
                      className="btn btn-ghost flex-1 !text-xs text-error hover:bg-error/10"
                      disabled={!!statusBusy}
                      onClick={() =>
                        runStatusAction('denying', () => api.denyCharacter(gameId, character.id))
                      }
                    >
                      {statusBusy === 'denying' ? 'Denying…' : 'Deny'}
                    </button>
                  </div>
                </>
              )}
              {!isPending && isDisabled && (
                <button
                  className="btn btn-ghost w-full !text-xs"
                  disabled={!!statusBusy}
                  onClick={() =>
                    runStatusAction('enabling', () => api.enableCharacter(gameId, character.id))
                  }
                  title="Re-activate this character. The storyteller will be able to voice them again."
                >
                  {statusBusy === 'enabling' ? 'Enabling…' : 'Enable (re-activate)'}
                </button>
              )}
              {!isPending && !isDisabled && (
                <button
                  className="btn btn-ghost w-full !text-xs"
                  disabled={!!statusBusy}
                  onClick={() =>
                    runStatusAction('disabling', () => api.disableCharacter(gameId, character.id))
                  }
                  title="Take this character off-screen. The storyteller won't voice them but they'll still be referenced."
                >
                  {statusBusy === 'disabling' ? 'Disabling…' : 'Disable (take off-screen)'}
                </button>
              )}
              {statusError && (
                <div className="text-xs text-error mt-1">{statusError}</div>
              )}
            </div>
          )}
          {onDeleteCharacter && !editing && (
            <div className="mt-2">
              {confirmDelete ? (
                <div className="flex gap-1">
                  <button
                    className="btn btn-danger flex-1 !text-xs"
                    disabled={deleting}
                    onClick={async () => {
                      setDeleting(true);
                      try {
                        await onDeleteCharacter(character.id);
                      } finally {
                        setDeleting(false);
                        setConfirmDelete(false);
                      }
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button
                    className="btn btn-ghost flex-1 !text-xs"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-ghost w-full !text-xs text-error hover:bg-error/10"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete Character
                </button>
              )}
            </div>
          )}
        </div>

        <div className="md:col-span-2 space-y-3 text-sm">
          {editing && draft ? (
            <>
              <EditField
                label="Name"
                value={draft.name}
                onChange={(v) => setDraftField('name', v)}
                hint="Internal name (always known)"
              />
              <EditField
                label="Revealed name"
                value={draft.revealedName}
                onChange={(v) => setDraftField('revealedName', v)}
                hint="Leave blank if the player hasn't learned this NPC's real name"
              />
              <EditTextarea
                label="Personality"
                value={draft.personality}
                onChange={(v) => setDraftField('personality', v)}
              />
              <EditTextarea
                label="Appearance"
                value={draft.appearance}
                onChange={(v) => setDraftField('appearance', v)}
              />
              <EditTextarea
                label="Background"
                value={draft.background}
                onChange={(v) => setDraftField('background', v)}
              />
              <EditField
                label="Disposition toward player"
                value={draft.dispositionTowardPlayer}
                onChange={(v) => setDraftField('dispositionTowardPlayer', v)}
                hint="e.g. friendly, wary, hostile, loyal, smitten"
              />
              <EditField
                label="Voice / style"
                value={draft.voiceStyle}
                onChange={(v) => setDraftField('voiceStyle', v)}
                hint="How they speak"
              />
              <TTSVoiceField
                enabled={draft.ttsEnabled}
                voice={draft.ttsVoice}
                onEnabledChange={(v) => setDraftField('ttsEnabled', v)}
                onVoiceChange={(v) => setDraftField('ttsVoice', v)}
              />
              <ColorPicker
                label="Chat color"
                value={draft.chatColor}
                onChange={(v) => setDraftField('chatColor', v)}
                onReset={() => setDraftField('chatColor', null)}
                defaultColor={colorForCharacter(character)}
                hint="Tints this character's name and dialogue in chat. Leave on default to auto-assign a unique color per character."
              />
              <ColorPicker
                label="Action color"
                value={draft.actionColor}
                onChange={(v) => setDraftField('actionColor', v)}
                onReset={() => setDraftField('actionColor', null)}
                hint="Tints this character's *action* / italic text. Leave on default to use the global Action color from Settings."
              />
              <EditTextarea
                label="What the player knows"
                value={draft.knownInfo}
                onChange={(v) => setDraftField('knownInfo', v)}
              />
              <EditTextarea
                label="Core appearance (identity only)"
                value={draft.coreAppearance}
                onChange={(v) => setDraftField('coreAppearance', v)}
                mono
                hint="core identity only — hair, eyes, body, marks. no outfits / settings / lighting. used by image assistant as the anchor for new scenes."
              />
              <EditTextarea
                label="Default outfit (canonical clothing)"
                value={draft.defaultOutfit}
                onChange={(v) => setDraftField('defaultOutfit', v)}
                mono
                hint="outfit + accessories only — each garment as its own booru-style tag with color/material. used by the image assistant when you don't specify a different outfit. update this when the character changes clothes."
              />
              <EditTextarea
                label="Portrait prompt (booru tags)"
                value={draft.basePrompt}
                onChange={(v) => setDraftField('basePrompt', v)}
                mono
                hint="full default portrait prompt — used when generating the character's main portrait"
              />
              <EditTextarea
                label="Portrait negative prompt"
                value={draft.baseNegative}
                onChange={(v) => setDraftField('baseNegative', v)}
                mono
              />
              <div className="flex items-center gap-2 pt-2">
                <button
                  className="btn btn-primary !text-xs"
                  onClick={saveEdit}
                  disabled={saveStatus.state === 'saving'}
                >
                  {saveStatus.state === 'saving' ? 'Saving…' : 'Save changes'}
                </button>
                <button
                  className="btn btn-ghost !text-xs"
                  onClick={cancelEdit}
                  disabled={saveStatus.state === 'saving'}
                >
                  Cancel
                </button>
                {saveStatus.state === 'error' && (
                  <span className="text-xs text-error">{saveStatus.message}</span>
                )}
              </div>
            </>
          ) : (
            <>
              <Section title="Personality">{character.personality || '—'}</Section>
              <Section title="Appearance">{character.appearance || '—'}</Section>
              {character.background && (
                <Section title="Background">{character.background}</Section>
              )}
              <Section title="Disposition toward player">
                {character.dispositionTowardPlayer || 'neutral'}
              </Section>
              {character.voiceStyle && (
                <Section title="Voice / style">{character.voiceStyle}</Section>
              )}
              {character.knownInfo && (
                <Section title="What the player knows">{character.knownInfo}</Section>
              )}
              <Section title="Memory of past events">
                <MemorySection
                  gameId={gameId}
                  character={character}
                  onCharacterUpdated={onCharacterUpdated}
                />
              </Section>
              {character.image?.coreAppearance && (
                <Section title="Core appearance (image-assistant anchor)">
                  <div className="mono text-xs bg-surface-2 border border-border p-2 rounded whitespace-pre-wrap">
                    {character.image.coreAppearance}
                  </div>
                </Section>
              )}
              {character.image?.defaultOutfit && (
                <Section title="Default outfit (image-assistant anchor)">
                  <div className="mono text-xs bg-surface-2 border border-border p-2 rounded whitespace-pre-wrap">
                    {character.image.defaultOutfit}
                  </div>
                </Section>
              )}
              <Section title="Identity seed">
                {typeof character.image?.identitySeed === 'number' ? (
                  <div className="mono text-xs bg-surface-2 border border-border p-2 rounded">
                    {character.image.identitySeed}
                  </div>
                ) : (
                  <div className="text-text-muted italic text-xs">
                    No identity seed saved. Without a locked seed, every generation rolls a new face.
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {typeof character.image?.identitySeed === 'number' ? (
                    <>
                      <button
                        className="btn btn-ghost !text-xs"
                        onClick={onRerollIdentitySeed}
                        disabled={seedStatus.state === 'saving' || !gameId}
                        title="Pick a new random identity seed"
                      >
                        Reroll
                      </button>
                      <button
                        className="btn btn-ghost !text-xs text-error hover:bg-error/10"
                        onClick={onClearIdentitySeed}
                        disabled={seedStatus.state === 'saving' || !gameId}
                        title="Remove the saved identity seed"
                      >
                        Clear
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-ghost !text-xs"
                      onClick={onSetIdentitySeed}
                      disabled={seedStatus.state === 'saving' || !gameId}
                      title="Save a random identity seed so single-subject generations stay consistent"
                    >
                      Set identity seed
                    </button>
                  )}
                  {seedStatus.state === 'saving' && (
                    <span className="text-[10px] text-text-muted">Saving…</span>
                  )}
                  {seedStatus.state === 'error' && (
                    <span className="text-[10px] text-error">{seedStatus.message}</span>
                  )}
                </div>
                <div className="text-[10px] text-text-muted mt-1">
                  Single-subject only. Enable “Lock seed” in the image studio when generating to
                  reuse this seed across batches.
                </div>
              </Section>
              <Section title="Portrait prompt">
                {character.image?.basePrompt ? (
                  <div className="mono text-xs bg-surface-2 border border-border p-2 rounded whitespace-pre-wrap">
                    {character.image.basePrompt}
                  </div>
                ) : (
                  <div className="text-text-muted italic text-xs">No portrait prompt yet.</div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  <button
                    className="btn btn-ghost !text-xs"
                    onClick={onRegenPrompt}
                    disabled={regenPromptStatus.state === 'loading' || !gameId}
                  >
                    {regenPromptStatus.state === 'loading'
                      ? 'Generating…'
                      : character.image?.basePrompt
                        ? 'Regenerate prompt'
                        : 'Generate prompt from appearance'}
                  </button>
                  {regenPromptStatus.state === 'error' && (
                    <span className="text-xs text-error">{regenPromptStatus.message}</span>
                  )}
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </Modal>
    {/* v1.1.31: Portrait gallery picker. Rendered as a sibling so it stacks
        on top of the NPCCard modal without nesting Modal components. */}
    <PortraitPickerDialog
      gameId={gameId}
      character={character}
      open={portraitPickerOpen}
      onClose={() => setPortraitPickerOpen(false)}
      onPortraitSet={(updated) => {
        if (onCharacterUpdated) onCharacterUpdated(updated);
      }}
    />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-1">
        {title}
      </div>
      <div className="text-text-primary">{children}</div>
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-1 block">
        {label}
      </label>
      <input
        type="text"
        className="input w-full !text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

function EditTextarea({
  label,
  value,
  onChange,
  mono,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  mono?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-1 block">
        {label}
      </label>
      <textarea
        className={`input w-full !text-sm min-h-[60px] ${mono ? 'mono !text-xs' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={mono ? 4 : 3}
      />
      {hint && <div className="text-[10px] text-text-muted mt-0.5">{hint}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memory section (v1.1.22): inline list with edit / delete / add. Memories
// flagged `stale` show a yellow review badge — these were sourced from a chat
// message that has since been edited or otherwise changed.
// ---------------------------------------------------------------------------
function MemorySection({
  gameId,
  character,
  onCharacterUpdated,
}: {
  gameId: string | null;
  character: NPCCharacter;
  onCharacterUpdated?: (c: NPCCharacter) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // v1.1.24: inline confirm state per row instead of window.confirm(). Some
  // browsers / dev tools block native dialogs so the delete looked dead.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const memories = character.memory || [];

  const startEditMemory = (m: { id: string; event: string }) => {
    setEditingId(m.id);
    setEditDraft(m.event);
    setError(null);
  };
  const cancelEditMemory = () => {
    setEditingId(null);
    setEditDraft('');
    setError(null);
  };

  const saveEdit = async () => {
    if (!gameId || !editingId) return;
    const text = editDraft.trim();
    if (!text) {
      setError('Memory text can\u2019t be empty.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateCharacterMemory(gameId, character.id, editingId, {
        event: text,
      });
      onCharacterUpdated?.(updated);
      setEditingId(null);
      setEditDraft('');
    } catch (err: any) {
      setError(err?.message || 'Failed to save memory');
    } finally {
      setBusy(false);
    }
  };

  const deleteMemory = async (memoryId: string) => {
    if (!gameId) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.deleteCharacterMemory(gameId, character.id, memoryId);
      onCharacterUpdated?.(updated);
      if (editingId === memoryId) cancelEditMemory();
      setConfirmDeleteId(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete memory');
    } finally {
      setBusy(false);
    }
  };

  const addMemory = async () => {
    if (!gameId) return;
    const text = addDraft.trim();
    if (!text) {
      setError('Memory text can\u2019t be empty.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const updated = await api.addCharacterMemory(gameId, character.id, { event: text });
      onCharacterUpdated?.(updated);
      setAdding(false);
      setAddDraft('');
    } catch (err: any) {
      setError(err?.message || 'Failed to add memory');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {memories.length > 0 ? (
        <ul className="space-y-1.5">
          {memories.map((m) => {
            const isEditing = editingId === m.id;
            return (
              <li
                key={m.id}
                className={`group rounded border p-2 ${
                  m.stale
                    ? 'border-yellow-500/40 bg-yellow-500/5'
                    : 'border-border bg-surface-2/30'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="mono text-xs text-text-muted shrink-0 pt-0.5">
                    Ch {m.chapter}
                  </span>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <textarea
                        className="input w-full !text-sm min-h-[60px]"
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        autoFocus
                      />
                    ) : (
                      <span className="text-text-primary text-sm">{m.event}</span>
                    )}
                    {m.stale && !isEditing && (
                      <div
                        className="text-[10px] mt-1 text-yellow-500"
                        title="A chat message this memory came from has been edited. Review and update or delete."
                      >
                        ⚠ needs review — source message was edited
                      </div>
                    )}
                  </div>
                  <div
                    className={`flex items-center gap-1 transition-opacity ${
                      isEditing || confirmDeleteId === m.id
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {isEditing ? (
                      <>
                        <button
                          className="text-xs px-2 py-0.5 rounded bg-accent text-bg hover:opacity-90 disabled:opacity-50"
                          onClick={saveEdit}
                          disabled={busy}
                        >
                          save
                        </button>
                        <button
                          className="text-xs px-2 py-0.5 rounded border border-border hover:bg-surface-2"
                          onClick={cancelEditMemory}
                          disabled={busy}
                        >
                          cancel
                        </button>
                      </>
                    ) : confirmDeleteId === m.id ? (
                      <>
                        <button
                          className="text-xs px-2 py-0.5 rounded bg-red-500/80 text-white hover:bg-red-500 disabled:opacity-50"
                          onClick={() => deleteMemory(m.id)}
                          disabled={busy}
                          title="Confirm delete"
                        >
                          {busy ? '...' : 'confirm'}
                        </button>
                        <button
                          className="text-xs px-2 py-0.5 rounded border border-border hover:bg-surface-2"
                          onClick={() => setConfirmDeleteId(null)}
                          disabled={busy}
                        >
                          cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="text-xs px-2 py-0.5 rounded border border-border hover:bg-surface-2"
                          onClick={() => startEditMemory(m)}
                          disabled={busy}
                        >
                          edit
                        </button>
                        <button
                          className="text-xs px-2 py-0.5 rounded border border-border hover:bg-red-500/10 hover:border-red-500/40 hover:text-red-400"
                          onClick={() => setConfirmDeleteId(m.id)}
                          disabled={busy}
                        >
                          delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="text-text-muted italic text-sm">No memories yet.</span>
      )}

      {adding ? (
        <div className="rounded border border-border bg-surface-2/30 p-2 space-y-2">
          <textarea
            className="input w-full !text-sm min-h-[60px]"
            value={addDraft}
            onChange={(e) => setAddDraft(e.target.value)}
            placeholder="e.g. Player insulted them in front of the guards in chapter 2."
            rows={3}
            autoFocus
          />
          <div className="flex items-center gap-2 justify-end">
            <button
              className="text-xs px-2 py-0.5 rounded border border-border hover:bg-surface-2"
              onClick={() => {
                setAdding(false);
                setAddDraft('');
                setError(null);
              }}
              disabled={busy}
            >
              cancel
            </button>
            <button
              className="text-xs px-2 py-0.5 rounded bg-accent text-bg hover:opacity-90 disabled:opacity-50"
              onClick={addMemory}
              disabled={busy}
            >
              add memory
            </button>
          </div>
        </div>
      ) : (
        <button
          className="text-xs px-2 py-1 rounded border border-border hover:bg-surface-2 text-text-muted hover:text-text-primary"
          onClick={() => {
            setAdding(true);
            setAddDraft('');
            setError(null);
          }}
          disabled={busy}
        >
          + add memory
        </button>
      )}

      {error && (
        <div className="text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Compact TTS controls for the NPC edit form (v1.1.42).
 * Voice list is pulled from the server on mount so the dropdown is
 * populated; failures are silent because TTS may simply be disabled.
 */
function TTSVoiceField({
  enabled,
  voice,
  onEnabledChange,
  onVoiceChange,
}: {
  enabled: boolean;
  voice: string;
  onEnabledChange: (v: boolean) => void;
  onVoiceChange: (v: string) => void;
}) {
  const [voices, setVoices] = useState<api.TTSVoice[]>([]);
  useEffect(() => {
    let alive = true;
    api.listTTSVoices()
      .then((r) => {
        if (alive && r.ok) setVoices(r.voices);
      })
      .catch(() => {/* ignore */});
    return () => { alive = false; };
  }, []);
  return (
    <div className="border border-border rounded p-2 space-y-2 bg-surface-1">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-text-muted">TTS</span>
        <span className="text-[10px] text-text-muted">Per-character text-to-speech</span>
      </div>
      <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabledChange(e.target.checked)}
        />
        <span>Read this character's dialogue aloud</span>
      </label>
      <label className="block">
        <span className="text-[10px] text-text-muted">Voice</span>
        {voices.length > 0 ? (
          <select
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value)}
            className="w-full text-xs"
            disabled={!enabled}
          >
            <option value="">(use narrator voice)</option>
            {voices.map((v) => (
              <option key={v.id} value={v.id}>{v.name || v.id}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={voice}
            onChange={(e) => onVoiceChange(e.target.value)}
            className="w-full text-xs mono"
            placeholder="(use narrator voice)"
            disabled={!enabled}
            spellCheck={false}
          />
        )}
        <div className="text-[10px] text-text-muted mt-1">
          {voices.length > 0
            ? 'Predefined and cloned voices the server published.'
            : 'Filename of a voice sample on the Chatterbox server. Leave blank to fall back to narrator.'}
        </div>
      </label>
    </div>
  );
}
