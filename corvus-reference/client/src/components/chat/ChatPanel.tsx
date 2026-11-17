import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ChatMessage as ChatMessageType, GlobalConfig, NPCCharacter } from '../../types';
import { colorForCharacter } from '../../utils/chatColors';
import { TypingIndicator } from '../common/LoadingSpinner';
import { ChatInput } from './ChatInput';
import { ChatMessage } from './ChatMessage';
import { useTTS } from '../../context/TTSContext';
import { splitDialogue } from '../../utils/dialogueSplit';
import { useSettings } from '../../hooks/useSettings';

export interface ChatPanelSendOpts {
  mode?: string;
  activeCharacterId?: string;
  groupParticipantIds?: string[];
  nextSpeakerId?: string;
  /** v1.1.30: force a single character to be the only speaker this turn. */
  singleSpeakerId?: string;
}

export interface ChatPanelProps {
  gameId: string | null;
  gameTitle?: string;
  messages: ChatMessageType[];
  characters: NPCCharacter[];
  /** Optional global appearance config — when present, chat colors honor it. */
  appearance?: GlobalConfig['appearance'] | null;
  streamingId: string | null;
  streamingContent: string;
  streaming: boolean;
  processing: boolean;
  error: string | null;
  onSend: (content: string, opts?: ChatPanelSendOpts) => void | Promise<void>;
  onStop: () => void;
  onEdit: (id: string, newContent: string, regenerateFollowing: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onRegenerate: (id: string) => void | Promise<void>;
  onSwipe: (id: string, newIndex: number) => void | Promise<void>;
}

type SpeakingMode =
  | { kind: 'narrator' }
  | { kind: 'character'; id: string }
  | { kind: 'group'; ids: string[] };

export function ChatPanel({
  gameId,
  gameTitle,
  messages,
  characters,
  appearance,
  streamingId,
  streamingContent,
  streaming,
  processing,
  error,
  onSend,
  onStop,
  onEdit,
  onDelete,
  onRegenerate,
  onSwipe,
}: ChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pinnedToBottomRef = useRef(true);
  const [mode, setMode] = useState<SpeakingMode>({ kind: 'narrator' });
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  // Optional "next speaker" hint for the very next group reply only.
  const [nextSpeakerId, setNextSpeakerId] = useState<string | null>(null);
  // v1.1.30: SillyTavern-style auto-reply chain for group mode.
  // After a user turn (or empty-Enter continue), automatically prompt N other
  // characters to react one-by-one. Default 2 follow-up turns.
  const [autoReplyCount, setAutoReplyCount] = useState<number>(2);
  const [chainRunning, setChainRunning] = useState(false);
  const chainCancelRef = useRef(false);

  // Only 'active' NPCs are voiceable / selectable. Pending NPCs are awaiting
  // user approval and disabled NPCs are archived — neither should appear in
  // speaking-target selectors. We still pass the full `characters` list to
  // <ChatMessage> so historical messages from now-disabled NPCs render correctly.
  const voiceableCharacters = useMemo(
    () => characters.filter((c) => (c.status ?? 'active') === 'active'),
    [characters],
  );

  // Auto-scroll on new messages / streaming tokens, but only if user is pinned to bottom.
  useEffect(() => {
    if (pinnedToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages, streamingContent, processing]);

  // v1.1.42 — TTS auto-play. Watch `streaming` falling edge: when a stream
  // finishes, enqueue the tail assistant messages we haven't queued yet.
  // We track which message ids we've spoken so a swipe / regenerate doesn't
  // re-trigger playback on the same id.
  const tts = useTTS();
  const ttsCfg = useSettings().settings?.tts;
  const spokenRef = useRef<Set<string>>(new Set());
  const prevStreamingRef = useRef(streaming);
  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = streaming;
    if (!wasStreaming || streaming) return;
    if (!tts.enabled || !ttsCfg?.autoPlay) return;
    // Collect every assistant message after the last user turn that we
    // haven't enqueued yet — covers the orchestrator's narrator-then-NPC
    // multi-message bursts.
    let lastUserIx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIx = i; break; }
    }
    const fresh = messages.slice(lastUserIx + 1).filter(
      (m) => m.role === 'assistant' && !spokenRef.current.has(m.id) && m.content?.trim(),
    );
    if (!fresh.length) return;
    const narratorVoice = ttsCfg.narratorVoice || '';
    const labelFor = (speakerId?: string) => {
      if (!speakerId) return 'Narrator';
      const c = characters.find((x) => x.id === speakerId);
      return c ? (c.revealedName || c.name) : 'Narrator';
    };
    const queue: Array<{ voice: string; text: string; label?: string; speaker?: string }> = [];
    for (const m of fresh) {
      spokenRef.current.add(m.id);
      const speaker = m.characterId ? characters.find((c) => c.id === m.characterId) : null;
      if (speaker) {
        const voice = speaker.tts?.enabled === false ? narratorVoice : (speaker.tts?.voice || narratorVoice);
        queue.push({ voice, text: m.content, label: speaker.revealedName || speaker.name, speaker: speaker.id });
      } else {
        const segs = splitDialogue(m.content, {
          npcs: characters.map((c) => ({
            id: c.id,
            name: c.revealedName || c.name,
            voice: c.tts?.voice,
            enabled: c.tts?.enabled,
          })),
          narratorVoice,
        });
        for (const s of segs) {
          queue.push({ voice: s.voice, text: s.text, label: labelFor(s.speaker), speaker: s.speaker });
        }
      }
    }
    if (queue.length) tts.enqueueAll(queue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    pinnedToBottomRef.current = nearBottom;
  };

  // If characters change (e.g. one removed, or one moved out of 'active') and
  // our group selection contains ids that are no longer voiceable, prune.
  useEffect(() => {
    if (mode.kind === 'group') {
      const valid = mode.ids.filter((id) => voiceableCharacters.some((c) => c.id === id));
      if (valid.length !== mode.ids.length) {
        if (valid.length === 0) setMode({ kind: 'narrator' });
        else setMode({ kind: 'group', ids: valid });
      }
    }
    if (mode.kind === 'character' && !voiceableCharacters.some((c) => c.id === mode.id)) {
      // Active NPC got disabled / denied while selected — fall back to narrator.
      setMode({ kind: 'narrator' });
    }
    if (nextSpeakerId && !voiceableCharacters.some((c) => c.id === nextSpeakerId)) {
      setNextSpeakerId(null);
    }
  }, [voiceableCharacters]);

  // Character-only chat ergonomics: when there's exactly one voiceable NPC and
  // the conversation hasn't started yet, default the speaking target to that
  // NPC so the user doesn't have to click the pill first.
  useEffect(() => {
    if (
      mode.kind === 'narrator' &&
      voiceableCharacters.length === 1 &&
      messages.length === 0
    ) {
      setMode({ kind: 'character', id: voiceableCharacters[0].id });
    }
    // We only want this to fire on initial mount / when the single-NPC
    // condition first becomes true. Including `mode` would cause it to
    // re-fire and lock the user out of switching back to narrator.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceableCharacters.length, messages.length]);

  const participants = useMemo(() => {
    if (mode.kind !== 'group') return [] as NPCCharacter[];
    return mode.ids
      .map((id) => voiceableCharacters.find((c) => c.id === id))
      .filter((c): c is NPCCharacter => !!c);
  }, [mode, voiceableCharacters]);

  if (!gameId) {
    return (
      <section className="flex-1 flex items-center justify-center bg-bg">
        <div className="text-center max-w-md px-6">
          <div className="text-4xl mb-2">🜲</div>
          <h2 className="text-xl font-semibold text-text-primary mb-2">Welcome to Corvus</h2>
          <p className="text-sm text-text-muted">
            Create or select a game from the library to begin your story. Everything runs locally
            through LM Studio and, optionally, ComfyUI for visuals.
          </p>
        </div>
      </section>
    );
  }

  const placeholder = (() => {
    if (mode.kind === 'character') {
      const npc = characters.find((c) => c.id === mode.id);
      return npc ? `Say something to ${npc.revealedName || npc.name}…` : 'Describe your action…';
    }
    if (mode.kind === 'group') {
      const names = participants.map((p) => p.revealedName || p.name).join(', ');
      return names
        ? `Group scene with ${names}…`
        : 'Pick group participants to start a group scene…';
    }
    return 'Describe your action, or speak to someone…';
  })();

  const buildSendOpts = (): ChatPanelSendOpts | undefined => {
    if (mode.kind === 'character') {
      return { mode: 'character', activeCharacterId: mode.id };
    }
    if (mode.kind === 'group' && mode.ids.length > 0) {
      return {
        mode: 'group',
        groupParticipantIds: mode.ids,
        nextSpeakerId: nextSpeakerId || undefined,
      };
    }
    return undefined;
  };

  const toggleGroupMember = (id: string) => {
    setMode((prev) => {
      const ids = prev.kind === 'group' ? prev.ids : [];
      const has = ids.includes(id);
      const next = has ? ids.filter((x) => x !== id) : [...ids, id];
      return { kind: 'group', ids: next };
    });
  };

  // v1.1.30: pick the next speaker for the auto-reply chain.
  // Round-robin through the group participants, skipping whoever just spoke.
  const pickNextSpeaker = (groupIds: string[], excludeId: string | null): string | null => {
    if (groupIds.length === 0) return null;
    if (!excludeId) return groupIds[0];
    const idx = groupIds.indexOf(excludeId);
    if (idx < 0) return groupIds[0];
    return groupIds[(idx + 1) % groupIds.length];
  };

  // v1.1.30: SillyTavern-style chain.
  // After the player's turn finished, we don't know which NPC's block was
  // emitted (the response may have been narrator or any group member). We peek
  // at the most recent assistant message's `characterId` as the "last speaker".
  const runAutoReplyChain = async (groupIds: string[]) => {
    chainCancelRef.current = false;
    setChainRunning(true);
    try {
      // Read the last assistant message's characterId as the starting exclusion.
      let lastSpeakerId: string | null = (() => {
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant') return messages[i].characterId ?? null;
        }
        return null;
      })();

      for (let step = 0; step < autoReplyCount; step++) {
        if (chainCancelRef.current) break;
        const nextId = pickNextSpeaker(groupIds, lastSpeakerId);
        if (!nextId) break;
        await onSend('', {
          mode: 'group',
          groupParticipantIds: groupIds,
          singleSpeakerId: nextId,
        });
        if (chainCancelRef.current) break;
        lastSpeakerId = nextId;
      }
    } finally {
      setChainRunning(false);
      chainCancelRef.current = false;
    }
  };

  const startGroupMode = () => {
    // Seed with all voiceable characters if there are 2-3, else open empty picker.
    if (mode.kind !== 'group') {
      const seed = voiceableCharacters.length >= 2 && voiceableCharacters.length <= 3
        ? voiceableCharacters.map((c) => c.id)
        : [];
      setMode({ kind: 'group', ids: seed });
    }
    setGroupPickerOpen(true);
  };

  return (
    <section className="flex-1 flex flex-col bg-bg min-w-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="max-w-3xl mx-auto flex flex-col gap-4">
          {messages.length === 0 && !streaming && (
            <div className="text-center text-sm text-text-muted py-8">
              {gameTitle ? `Start your story in "${gameTitle}".` : 'Start your story.'} Type a
              prompt below to begin.
            </div>
          )}
          {messages.map((m) => (
            <ChatMessage
              key={m.id}
              gameId={gameId}
              message={m}
              characters={characters}
              appearance={appearance}
              isStreaming={streaming && streamingId === m.id}
              streamingContent={streaming && streamingId === m.id ? streamingContent : undefined}
              disabled={streaming}
              onEdit={onEdit}
              onDelete={onDelete}
              onRegenerate={onRegenerate}
              onSwipe={onSwipe}
            />
          ))}

          {streaming && !streamingId && (
            <div className="flex items-start">
              <div className="rounded-lg px-4 py-3 bg-surface-2 border border-border">
                <TypingIndicator label="Weaving the story" />
              </div>
            </div>
          )}

          {processing && (
            <div className="text-xs text-text-muted italic text-center py-1">
              <TypingIndicator label="Game Master processing" />
            </div>
          )}

          {error && (
            <div className="rounded border border-error text-error bg-error/10 px-3 py-2 text-sm">
              {error}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {voiceableCharacters.length > 0 && (
        <div className="px-4 py-2 border-t border-border bg-surface flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="text-xs text-text-muted">
                {mode.kind === 'group' ? 'Group scene:' : 'Speaking to:'}
              </div>
              {mode.kind === 'group' && (
                <button
                  type="button"
                  onClick={() => setGroupPickerOpen((v) => !v)}
                  className="text-[10px] uppercase tracking-wider text-accent hover:text-accent-light transition-colors"
                >
                  {groupPickerOpen ? 'Done' : 'Edit participants'}
                </button>
              )}
            </div>

            {/* Mode pills row */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <button
                onClick={() => {
                  setMode({ kind: 'narrator' });
                  setGroupPickerOpen(false);
                }}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  mode.kind === 'narrator'
                    ? 'bg-accent text-white'
                    : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3'
                }`}
              >
                Narrator
              </button>
              {voiceableCharacters.length >= 2 && (
                <button
                  onClick={startGroupMode}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                    mode.kind === 'group'
                      ? 'bg-accent text-white'
                      : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3'
                  }`}
                  title="Lock the scene to a specific set of characters"
                >
                  <GroupIcon />
                  Group
                  {mode.kind === 'group' && mode.ids.length > 0 && (
                    <span className="ml-0.5 px-1.5 rounded-full bg-white/20 text-[10px]">
                      {mode.ids.length}
                    </span>
                  )}
                </button>
              )}
              {voiceableCharacters.map((npc) => (
                <button
                  key={npc.id}
                  onClick={() => {
                    setMode({ kind: 'character', id: npc.id });
                    setGroupPickerOpen(false);
                  }}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    mode.kind === 'character' && mode.id === npc.id
                      ? 'bg-accent text-white'
                      : 'bg-surface-2 text-text-secondary hover:text-text-primary hover:bg-surface-3'
                  }`}
                >
                  {npc.revealedName || npc.name}
                </button>
              ))}
            </div>

            {/* Group participant picker (multi-select) */}
            {mode.kind === 'group' && groupPickerOpen && (
              <div className="mt-2 p-2 rounded-md border border-border bg-surface-2">
                <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                  Tap characters to add / remove from this scene
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {voiceableCharacters.map((npc) => {
                    const selected = mode.ids.includes(npc.id);
                    const color = colorForCharacter(npc);
                    return (
                      <button
                        key={npc.id}
                        onClick={() => toggleGroupMember(npc.id)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1.5 ${
                          selected
                            ? 'bg-surface-3 text-text-primary ring-1 ring-accent'
                            : 'bg-surface text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        <span
                          className="inline-block w-2 h-2 rounded-full"
                          style={{ background: color }}
                        />
                        {npc.revealedName || npc.name}
                        {selected && <span className="text-accent">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* v1.1.30: Auto-reply chain control (group mode only) */}
            {mode.kind === 'group' && participants.length >= 2 && !groupPickerOpen && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span
                  className="text-[10px] uppercase tracking-wider text-text-muted"
                  title="After your turn, this many other characters will react one by one (SillyTavern-style)."
                >
                  Auto-reply:
                </span>
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAutoReplyCount(n)}
                    disabled={chainRunning}
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                      autoReplyCount === n
                        ? 'bg-surface-3 text-text-primary ring-1 ring-accent'
                        : 'bg-surface-2 text-text-muted hover:text-text-primary'
                    } ${chainRunning ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {n === 0 ? 'off' : `${n}`}
                  </button>
                ))}
                {chainRunning && (
                  <span className="text-[10px] text-accent italic ml-1">
                    chaining replies… (Stop to cancel)
                  </span>
                )}
              </div>
            )}

            {/* Group: next speaker chooser */}
            {mode.kind === 'group' && participants.length >= 2 && !groupPickerOpen && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">
                  Next speaker:
                </span>
                <button
                  onClick={() => setNextSpeakerId(null)}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors ${
                    nextSpeakerId === null
                      ? 'bg-surface-3 text-text-primary ring-1 ring-border'
                      : 'bg-surface-2 text-text-muted hover:text-text-primary'
                  }`}
                >
                  auto
                </button>
                {participants.map((npc) => {
                  const color = colorForCharacter(npc);
                  const active = nextSpeakerId === npc.id;
                  return (
                    <button
                      key={npc.id}
                      onClick={() => setNextSpeakerId(active ? null : npc.id)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors inline-flex items-center gap-1 ${
                        active
                          ? 'bg-surface-3 text-text-primary ring-1'
                          : 'bg-surface-2 text-text-muted hover:text-text-primary'
                      }`}
                      style={active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
                    >
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full"
                        style={{ background: color }}
                      />
                      {npc.revealedName || npc.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <ChatInput
        onSubmit={async (content) => {
          const groupIds = mode.kind === 'group' ? mode.ids : null;
          await onSend(content, buildSendOpts());
          // After a group send, clear the one-shot next-speaker hint.
          if (mode.kind === 'group' && nextSpeakerId) setNextSpeakerId(null);

          // v1.1.30: kick off the auto-reply chain in group mode.
          if (
            groupIds &&
            groupIds.length >= 2 &&
            autoReplyCount > 0
          ) {
            await runAutoReplyChain(groupIds);
          }
        }}
        onStop={() => {
          // Cancel both the in-flight stream and any pending chain steps.
          chainCancelRef.current = true;
          setChainRunning(false);
          onStop();
        }}
        streaming={streaming || chainRunning}
        disabled={
          streaming ||
          processing ||
          chainRunning ||
          (mode.kind === 'group' && participants.length === 0)
        }
        placeholder={placeholder}
      />
    </section>
  );
}

function GroupIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M7 21v-2a4 4 0 0 1 3-3.87" />
      <circle cx="12" cy="7" r="3" />
      <path d="M19 8a4 4 0 0 0 0-6" />
      <path d="M5 8a4 4 0 0 1 0-6" />
    </svg>
  );
}
