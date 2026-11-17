import React, { useState } from 'react';
import * as api from '../../api';
import type { DesignCharacterDraft } from '../../api';
import type { GameConfig, NPCCharacter } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { Modal } from '../common/Modal';
import { DesignCharacterChat } from './DesignCharacterChat';

export interface NewCharacterChatDialogProps {
  open: boolean;
  onClose: () => void;
  /**
   * Called after the chat is fully created (game + character persisted).
   * Receives the new GameConfig so the parent can select it in the library.
   */
  onCreated: (game: GameConfig, character: NPCCharacter) => void;
}

interface CharFormState {
  name: string;
  appearance: string;
  personality: string;
  background: string;
  knownInfo: string;
  voiceStyle: string;
  dispositionTowardPlayer: string;
  basePrompt: string;
  baseNegative: string;
}

const EMPTY_CHAR: CharFormState = {
  name: '',
  appearance: '',
  personality: '',
  background: '',
  knownInfo: '',
  voiceStyle: '',
  dispositionTowardPlayer: 'neutral',
  basePrompt: '',
  baseNegative: '',
};

/**
 * Lightweight "1-on-1 chat with a character" creation flow, modeled loosely
 * after SillyTavern. Skips the open-world setup (no setting/tone/era/rules/stats/
 * inventory/abilities) and creates a slim game whose narrator is disabled by
 * default — the assistant speaks only as the chosen character.
 *
 * The dialog itself does NOT call any orchestrator; it just creates the
 * persistence objects (Game + WorldInfo + PlayerCharacter via POST /games
 * and then POST /games/:id/characters). The first storyteller reply happens
 * when the user sends their first message, exactly like the open-world flow.
 */
export function NewCharacterChatDialog({
  open,
  onClose,
  onCreated,
}: NewCharacterChatDialogProps) {
  const [tab, setTab] = useState<'manual' | 'card' | 'design'>('manual');
  const [character, setCharacter] = useState<CharFormState>({ ...EMPTY_CHAR });
  const [playerName, setPlayerName] = useState('You');
  const [chatTitle, setChatTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Card import state (lives here, not in a child, so the dialog stays atomic).
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [cardInfo, setCardInfo] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Greetings (first_mes + alternate_greetings from imported card).
  // -1 = no starting message; 0..n-1 = index into `greetings`.
  const [greetings, setGreetings] = useState<string[]>([]);
  const [greetingIdx, setGreetingIdx] = useState<number>(-1);

  const reset = () => {
    setTab('manual');
    setCharacter({ ...EMPTY_CHAR });
    setPlayerName('You');
    setChatTitle('');
    setError(null);
    setSubmitting(false);
    setCardBusy(false);
    setCardError(null);
    setCardInfo(null);
    setGreetings([]);
    setGreetingIdx(-1);
  };

  /**
   * Prefill the form from a draft produced by the design-character-chat agent.
   * Mirrors NewGameDialog.applyDraft — only writes fields the draft actually
   * provides, and switches the view back to Manual so the user can review
   * before creating the chat.
   */
  const applyDraft = (d: DesignCharacterDraft) => {
    setCharacter((prev) => ({
      ...prev,
      name: typeof d.name === 'string' && d.name.trim() ? d.name : prev.name,
      appearance: typeof d.appearance === 'string' ? d.appearance : prev.appearance,
      personality: typeof d.personality === 'string' ? d.personality : prev.personality,
      background: typeof d.background === 'string' ? d.background : prev.background,
      knownInfo: typeof d.knownInfo === 'string' ? d.knownInfo : prev.knownInfo,
      voiceStyle: typeof d.voiceStyle === 'string' ? d.voiceStyle : prev.voiceStyle,
      dispositionTowardPlayer:
        typeof d.dispositionTowardPlayer === 'string' && d.dispositionTowardPlayer.trim()
          ? d.dispositionTowardPlayer
          : prev.dispositionTowardPlayer,
      basePrompt:
        typeof d.image?.basePrompt === 'string' ? d.image.basePrompt : prev.basePrompt,
      baseNegative:
        typeof d.image?.baseNegative === 'string' ? d.image.baseNegative : prev.baseNegative,
    }));
    if (typeof d.chatTitle === 'string' && d.chatTitle.trim()) setChatTitle(d.chatTitle);
    if (typeof d.playerName === 'string' && d.playerName.trim()) setPlayerName(d.playerName);

    // Seed the opening line into the greetings list so the user gets the same
    // "first message" UX they get when importing a card. -1 (no opening) is
    // selected by default; the dialog already shows the picker section when
    // greetings.length > 0, so the user can flip the radio to use it.
    if (typeof d.startingMessage === 'string' && d.startingMessage.trim()) {
      setGreetings([d.startingMessage]);
      setGreetingIdx(0);
    }

    setError(null);
    setTab('manual');
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const setCharField = <K extends keyof CharFormState>(k: K, v: CharFormState[K]) =>
    setCharacter((c) => ({ ...c, [k]: v }));

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result;
        if (typeof r !== 'string') {
          reject(new Error('Failed to read file.'));
          return;
        }
        const idx = r.indexOf(',');
        resolve(idx >= 0 ? r.slice(idx + 1) : r);
      };
      reader.onerror = () => reject(new Error('FileReader failed.'));
      reader.readAsDataURL(file);
    });

  const handleCardFile = async (file: File) => {
    setCardError(null);
    setCardInfo(null);
    setCardBusy(true);
    try {
      const fileBase64 = await readFileAsBase64(file);
      const { source, draft, greetings: greets } = await api.parseCharacterCard({
        fileBase64,
        filename: file.name,
      });
      // Drop the draft into the manual form so the user can review.
      setCharacter({
        name: draft.name || '',
        appearance: draft.appearance || '',
        personality: draft.personality || '',
        background: draft.background || '',
        knownInfo: draft.knownInfo || '',
        voiceStyle: draft.voiceStyle || '',
        dispositionTowardPlayer: draft.dispositionTowardPlayer || 'neutral',
        basePrompt: draft.image?.basePrompt || '',
        baseNegative: draft.image?.baseNegative || '',
      });
      if (!chatTitle.trim() && draft.name) setChatTitle(draft.name);
      // Default to the first greeting if the card brought any.
      setGreetings(greets || []);
      setGreetingIdx(greets && greets.length > 0 ? 0 : -1);
      const greetSuffix = greets && greets.length > 0
        ? ` ${greets.length} starting message${greets.length === 1 ? '' : 's'} included.`
        : '';
      setCardInfo(
        `Loaded ${source} card.${greetSuffix} Switch to Manual to review before creating the chat.`,
      );
      setTab('manual');
    } catch (e: any) {
      setCardError(e?.message || 'Failed to parse card.');
    } finally {
      setCardBusy(false);
    }
  };

  const submit = async () => {
    setError(null);
    const charName = character.name.trim();
    if (!charName) {
      setError('Character name is required.');
      return;
    }
    const player = playerName.trim() || 'You';
    const title = chatTitle.trim() || `Chat with ${charName}`;

    setSubmitting(true);
    try {
      // 1) Create the host game with a minimal, narrator-off world.
      const game = await api.createGame({
        name: title,
        genre: 'Character Chat',
        description: `1-on-1 chat with ${charName}.`,
        world: {
          setting: '',
          tone: '',
          rules: '',
          currencyName: 'credits',
          era: '',
          customInstructions: '',
          narratorEnabled: false,
        },
        player: {
          name: player,
          backstory: '',
          appearance: '',
          stats: {},
          money: { currencyName: 'credits', amount: 0 },
          abilities: [],
          inventory: [],
        },
      });

      // 2) Persist the chosen character into that game.
      const npc = await api.createCharacter(game.id, {
        name: charName,
        revealedName: null,
        appearance: character.appearance.trim(),
        personality: character.personality.trim(),
        background: character.background.trim(),
        knownInfo: character.knownInfo.trim(),
        dispositionTowardPlayer:
          character.dispositionTowardPlayer.trim() || 'neutral',
        voiceStyle: character.voiceStyle.trim(),
        memory: [],
        image: {
          basePrompt: character.basePrompt.trim(),
          coreAppearance: '',
          baseNegative: character.baseNegative.trim(),
          lastPrompt: null,
          lastSeed: null,
          identitySeed: null,
          portraitPath: null,
        },
      });

      // If the user imported a card with greetings and selected one, seed it
      // into the chat log as the first assistant message before opening.
      if (greetingIdx >= 0 && greetings[greetingIdx]) {
        try {
          await api.seedMessage(game.id, {
            content: greetings[greetingIdx],
            characterId: npc.id,
            type: 'character',
          });
        } catch (seedErr) {
          // Non-fatal — the chat still exists, just without a starting message.
          // eslint-disable-next-line no-console
          console.warn('Failed to seed starting message:', seedErr);
        }
      }

      onCreated(game, npc);
      reset();
    } catch (e: any) {
      setError(e?.message || 'Failed to create character chat.');
    } finally {
      setSubmitting(false);
    }
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
          disabled={submitting || tab !== 'manual' || !character.name.trim()}
          title={
            tab !== 'manual'
              ? 'Switch to Manual to review and create the chat'
              : undefined
          }
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner size={14} label="Creating" /> Creating…
            </span>
          ) : (
            'Create chat'
          )}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title="New Character Chat"
      size="xl"
      footer={footer}
    >
      <div className="text-xs text-text-muted mb-3 leading-relaxed">
        A slim, 1-on-1 chat with a single character — no world setup, no narrator,
        no stats. The character speaks; you reply. You can always add more
        characters, a world, or enable the narrator later from the info panel.
      </div>

      <div className="flex border-b border-border mb-3">
        <TabButton active={tab === 'manual'} onClick={() => setTab('manual')}>
          Manual
        </TabButton>
        <TabButton active={tab === 'design'} onClick={() => setTab('design')}>
          ✨ Design with AI
        </TabButton>
        <TabButton active={tab === 'card'} onClick={() => setTab('card')}>
          Import Card
        </TabButton>
      </div>

      {tab === 'design' ? (
        <DesignCharacterChat onApplyDraft={applyDraft} />
      ) : tab === 'manual' ? (
        <div className="space-y-3">
          {error && (
            <div className="p-2 rounded border border-error text-error text-xs bg-error/10">
              {error}
            </div>
          )}
          {cardInfo && (
            <div className="p-2 rounded border border-border bg-surface-2 text-xs text-text-secondary">
              {cardInfo}
            </div>
          )}

          <section>
            <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2">
              Character
            </h4>
            <div className="space-y-3">
              <Field label="Name" required>
                <input
                  type="text"
                  value={character.name}
                  onChange={(e) => setCharField('name', e.target.value)}
                  className="w-full"
                  placeholder="e.g. Rook, Elara, the Stranger"
                />
              </Field>
              <Field label="Appearance">
                <textarea
                  rows={2}
                  value={character.appearance}
                  onChange={(e) => setCharField('appearance', e.target.value)}
                  className="w-full"
                  placeholder="Physical description — used for image generation too."
                />
              </Field>
              <Field label="Personality">
                <textarea
                  rows={2}
                  value={character.personality}
                  onChange={(e) => setCharField('personality', e.target.value)}
                  className="w-full"
                  placeholder="Traits, mannerisms, quirks…"
                />
              </Field>
              <Field label="Background">
                <textarea
                  rows={2}
                  value={character.background}
                  onChange={(e) => setCharField('background', e.target.value)}
                  className="w-full"
                  placeholder="Their history, role, relationships…"
                />
              </Field>
              <Field label="Known info (visible to player)">
                <textarea
                  rows={2}
                  value={character.knownInfo}
                  onChange={(e) => setCharField('knownInfo', e.target.value)}
                  className="w-full"
                  placeholder="Things the player already knows about this character, plus the scenario / first message hook."
                />
              </Field>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Voice style">
                  <input
                    type="text"
                    value={character.voiceStyle}
                    onChange={(e) => setCharField('voiceStyle', e.target.value)}
                    className="w-full"
                    placeholder="e.g. dry, formal, lots of slang"
                  />
                </Field>
                <Field label="Disposition toward you">
                  <input
                    type="text"
                    value={character.dispositionTowardPlayer}
                    onChange={(e) =>
                      setCharField('dispositionTowardPlayer', e.target.value)
                    }
                    className="w-full"
                    placeholder="neutral / friendly / wary / hostile"
                  />
                </Field>
              </div>
            </div>
          </section>

          {greetings.length > 0 && (
            <section className="pt-2 border-t border-border">
              <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2 mt-3">
                Starting message
              </h4>
              <div className="text-xs text-text-muted mb-2 leading-relaxed">
                This card includes {greetings.length} starting message
                {greetings.length === 1 ? '' : 's'}. Pick one to drop into the
                chat as the character's first line, or skip to start blank.
              </div>
              <div className="space-y-2">
                <label className="flex items-start gap-2 cursor-pointer p-2 rounded border border-border hover:bg-surface-2">
                  <input
                    type="radio"
                    name="greeting"
                    checked={greetingIdx === -1}
                    onChange={() => setGreetingIdx(-1)}
                    className="mt-1"
                  />
                  <span className="text-sm text-text-secondary">
                    No starting message — you open the chat
                  </span>
                </label>
                {greetings.map((g, i) => (
                  <label
                    key={i}
                    className={`flex items-start gap-2 cursor-pointer p-2 rounded border ${
                      greetingIdx === i
                        ? 'border-accent bg-accent/10'
                        : 'border-border hover:bg-surface-2'
                    }`}
                  >
                    <input
                      type="radio"
                      name="greeting"
                      checked={greetingIdx === i}
                      onChange={() => setGreetingIdx(i)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-text-muted mb-1">
                        {i === 0 ? 'Default greeting' : `Alternate #${i}`}
                      </div>
                      <div className="text-sm text-text-secondary whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                        {g}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </section>
          )}

          <section className="pt-2 border-t border-border">
            <h4 className="text-xs uppercase tracking-wider text-text-muted mb-2 mt-3">
              You
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Your name">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full"
                  placeholder="You"
                />
              </Field>
              <Field label="Chat title (optional)">
                <input
                  type="text"
                  value={chatTitle}
                  onChange={(e) => setChatTitle(e.target.value)}
                  className="w-full"
                  placeholder={
                    character.name ? `Chat with ${character.name}` : 'Auto from character name'
                  }
                />
              </Field>
            </div>
          </section>
        </div>
      ) : (
        // ----- Card import tab -----
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
            , SillyTavern, or any tool that produces V1/V2/V3 character cards. PNG
            cards with embedded metadata and raw JSON files are both supported.
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
              if (file) await handleCardFile(file);
            }}
            className={`block rounded-md border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-accent bg-accent/10'
                : 'border-border bg-surface hover:border-accent/60 hover:bg-surface-2'
            } ${cardBusy ? 'pointer-events-none opacity-60' : ''}`}
          >
            <input
              type="file"
              accept=".png,.json,image/png,application/json"
              className="hidden"
              disabled={cardBusy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await handleCardFile(file);
                e.target.value = '';
              }}
            />
            {cardBusy ? (
              <span className="inline-flex items-center gap-2 text-text-secondary">
                <LoadingSpinner size={16} label="Parsing card" /> Parsing card…
              </span>
            ) : (
              <>
                <div className="text-sm text-text-primary font-medium">
                  Drop a card here
                </div>
                <div className="text-xs text-text-muted mt-1">
                  or click to pick a .png / .json file
                </div>
              </>
            )}
          </label>

          {cardError && (
            <div className="p-2 rounded border border-error bg-error/10 text-xs text-error">
              {cardError}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs text-text-muted mb-1 block">
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </span>
      {children}
    </label>
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
      className={`px-4 py-2 text-sm border-b-2 transition-colors ${
        active
          ? 'border-accent text-text-primary font-medium'
          : 'border-transparent text-text-muted hover:text-text-primary'
      }`}
    >
      {children}
    </button>
  );
}
