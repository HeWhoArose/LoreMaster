import { v4 as uuidv4 } from 'uuid';
import {
  AssembledContext,
  ChatMessage,
  StateChangeSummary,
} from '../types/index.js';
import { buildCharacterContext } from './character.js';
import { getFileManager, withGameLock } from './fileManager.js';
import { runGameMaster } from './gameMaster.js';
import { chatCompletionStream } from './lmStudio.js';
import { logger } from './logger.js';
import { buildGroupContext, buildNarratorContext } from './narrator.js';
import { splitIntoSpeakerBlocks } from './speakerSplitter.js';
import {
  applyGameMasterOutput,
  invalidateMemoriesForDeletedMessages,
  invalidateWorldStateForDeletedMessages,
} from './stateManager.js';
import { maybeSummarize } from './summarizer.js';
import {
  ThinkStreamStripper,
  stripThinkingTags,
  stripProseReasoning,
} from './thinkStripper.js';

const MOD = 'orchestrator';

export type OrchestratorMode = 'narrator' | 'character' | 'group' | 'auto';

export interface OrchestratorOptions {
  mode?: OrchestratorMode;
  activeCharacterId?: string;
  mentionedNpcIds?: string[];
  /**
   * When `mode === 'group'` (or auto resolves to group), restrict the storyteller
   * to ONLY voice these NPC ids. Empty array or undefined means "no restriction"
   * (effectively narrator mode).
   */
  groupParticipantIds?: string[];
  /** Optional explicit next-speaker hint for group mode. */
  nextSpeakerId?: string;
  /**
   * v1.1.30: lock the storyteller to ONE specific NPC for this turn (single
   * [Character: <name>] block, no other speakers). Used by the SillyTavern-
   * style group auto-reply chain and by the per-character "prompt to speak"
   * sidebar button. Implies `continuation: true` if no user content provided.
   */
  singleSpeakerId?: string;
  seed?: number;
  chapter?: number;
}

export interface OrchestrationEvent {
  type:
    | 'user-message-saved'
    | 'context-assembled'
    | 'assistant-delta'
    | 'assistant-complete'
    | 'gm-start'
    | 'gm-complete'
    | 'state-changed'
    | 'error'
    | 'done';
  data?: any;
}

export type OrchestrationEmit = (ev: OrchestrationEvent) => void | Promise<void>;

/**
 * Choose between narrator / character / group mode based on the message and active state.
 */
export function resolveMode(
  requested: OrchestratorMode,
  activeCharacterId?: string,
  groupParticipantIds?: string[]
): 'narrator' | 'character' | 'group' {
  if (requested === 'narrator') return 'narrator';
  if (requested === 'character') return 'character';
  if (requested === 'group') {
    return groupParticipantIds && groupParticipantIds.length > 0 ? 'group' : 'narrator';
  }
  // auto: explicit single-character pick wins, then group if participants set, otherwise narrator.
  if (activeCharacterId) return 'character';
  if (groupParticipantIds && groupParticipantIds.length > 0) return 'group';
  return 'narrator';
}

/**
 * Main orchestration cycle for a new user message.
 *
 * Flow:
 *   1. Persist user message
 *   2. Assemble context for the chosen agent
 *   3. Stream assistant response from LM Studio
 *   4. Persist assistant message
 *   5. Run Game Master (non-streaming) to extract state changes
 *   6. Apply state changes
 *   7. Optionally run summarizer if history is long
 *
 * Events are emitted via `emit` so the route can stream them to the frontend as SSE.
 */
export async function runOrchestration(
  gameId: string,
  userContent: string,
  opts: OrchestratorOptions,
  emit: OrchestrationEmit,
  abortSignal?: AbortSignal
): Promise<{
  userMessage: ChatMessage | null;
  assistantMessage: ChatMessage;
  stateSummary: StateChangeSummary | null;
}> {
  // v1.1.34: serialize all multi-step writes for this game id. Prevents two
  // concurrent turns (e.g. user hits Send twice, or a continuation fires
  // while a regen is mid-flight) from interleaving message appends, GM
  // state writes, and history rewrites. Same-game-id calls queue; different
  // games still run in parallel.
  return withGameLock(gameId, () =>
    runOrchestrationLocked(gameId, userContent, opts, emit, abortSignal),
  );
}

async function runOrchestrationLocked(
  gameId: string,
  userContent: string,
  opts: OrchestratorOptions,
  emit: OrchestrationEmit,
  abortSignal?: AbortSignal
): Promise<{
  userMessage: ChatMessage | null;
  assistantMessage: ChatMessage;
  stateSummary: StateChangeSummary | null;
}> {
  const fm = getFileManager();
  const cfg = fm.getConfig();
  const chapter = opts.chapter ?? 1;
  const mode = resolveMode(opts.mode || 'auto', opts.activeCharacterId, opts.groupParticipantIds);

  // v1.1.30: empty content = continuation. We do NOT save a user message in
  // that case (otherwise the chat fills up with empty user bubbles every time
  // the player presses Enter to advance the scene). The orchestrator instead
  // builds the context as a continuation — the system prompt frames this as
  // "advance the scene from where it left off".
  const isContinuation = !userContent || !userContent.trim();

  // ---- 1. Save user message (skipped for continuation turns) ----
  let userMessage: ChatMessage | null = null;
  if (!isContinuation) {
    userMessage = {
      id: uuidv4(),
      role: 'user',
      type: 'user',
      content: userContent,
      timestamp: new Date().toISOString(),
      chapter,
    };
    fm.appendMessage(gameId, userMessage);
    await emit({ type: 'user-message-saved', data: userMessage });
  }

  // ---- 2. Assemble context ----
  let context: AssembledContext | null;
  if (mode === 'character' && opts.activeCharacterId) {
    context = buildCharacterContext(gameId, opts.activeCharacterId);
    if (!context) {
      // Fall back to narrator if character not found
      context = buildNarratorContext(gameId, { continuation: isContinuation });
    }
  } else if (mode === 'group' && opts.groupParticipantIds && opts.groupParticipantIds.length > 0) {
    context = buildGroupContext(gameId, opts.groupParticipantIds, {
      nextSpeakerId: opts.nextSpeakerId,
      singleSpeakerId: opts.singleSpeakerId,
      continuation: isContinuation,
    });
  } else if (opts.singleSpeakerId) {
    // v1.1.30: single-speaker without an explicit group — treat that NPC as
    // the only participant. Common path: "prompt to speak" button on the
    // sidebar when not already in group mode.
    context = buildGroupContext(gameId, [opts.singleSpeakerId], {
      singleSpeakerId: opts.singleSpeakerId,
      continuation: isContinuation,
    });
  } else {
    context = buildNarratorContext(gameId, { continuation: isContinuation });
  }
  await emit({
    type: 'context-assembled',
    data: {
      estimatedTokens: context.estimatedTokens,
      includedNpcIds: context.includedNpcIds,
      includedSummaryIds: context.includedSummaryIds,
      mode,
    },
  });

  // ---- 3. Stream assistant response ----
  // Some local thinking models (Qwen3, DeepSeek-R1) emit <think>...</think>
  // inline inside the content channel. Filter them out of the live token stream
  // so the chat bubble shows only the actual reply, and also strip the final
  // string before persisting / speaker-splitting.
  const assistantId = uuidv4();
  let fullContent = '';
  const stripper = new ThinkStreamStripper();
  try {
    fullContent = await chatCompletionStream(
      context.messages,
      async (chunk) => {
        if (chunk.delta) {
          const visible = stripper.push(chunk.delta);
          if (visible) {
            await emit({
              type: 'assistant-delta',
              data: { id: assistantId, delta: visible },
            });
          }
        }
      },
      {
        seed: opts.seed,
        ...(cfg.lmStudio),
      },
      abortSignal
    );
    const tail = stripper.flush();
    if (tail) {
      await emit({ type: 'assistant-delta', data: { id: assistantId, delta: tail } });
    }
    // Final pass — handles any residue (orphan opens, fallback recovery).
    fullContent = stripThinkingTags(fullContent);
    // Prose-style reasoning fallback — some thinking models (mis-templated qwen3,
    // r1-distill, etc.) emit reasoning as plain markdown ("Here's a thinking
    // process:", numbered analysis lists, etc.) instead of inside <think> tags.
    // Detect & strip the preamble so it doesn't land in the chat bubble.
    fullContent = stripProseReasoning(fullContent);
  } catch (err) {
    await emit({ type: 'error', data: { message: (err as Error).message, stage: 'llm-stream' } });
    throw err;
  }

  // ---- 4. Save assistant message(s) ----
  // In narrator mode the model emits speaker-tagged blocks (e.g. [Narrator] / [Character: Jin]).
  // Split them into one ChatMessage per block so the UI renders Discord-style messages
  // with names attached. Character mode always produces a single character message.
  const modelParams = {
    temperature: cfg.lmStudio.temperature,
    topP: cfg.lmStudio.topP,
    seed: opts.seed,
  };
  const baseTimestamp = new Date().toISOString();
  const savedMessages: ChatMessage[] = [];

  // Narrator-style (multi-block) handling is used for both narrator AND group mode
  // since both produce speaker-tagged output split by speakerSplitter.
  const useMultiBlock = mode === 'narrator' || mode === 'group';

  if (mode === 'character') {
    const msg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      type: 'character',
      content: fullContent,
      timestamp: baseTimestamp,
      characterId: opts.activeCharacterId,
      modelParams,
      chapter,
    };
    fm.appendMessage(gameId, msg);
    savedMessages.push(msg);
    await emit({ type: 'assistant-complete', data: msg });
  } else if (useMultiBlock) {
    const allNpcs = fm.listCharacters(gameId);
    const world = fm.getWorld(gameId);
    // In group mode, restrict speaker matching to participants so an off-list
    // name typed by the model can't get attributed to an NPC outside the group.
    const npcsForSplit =
      mode === 'group' && opts.groupParticipantIds && opts.groupParticipantIds.length > 0
        ? allNpcs.filter((n) => opts.groupParticipantIds!.includes(n.id))
        : allNpcs;
    const narratorDisabled = world?.narratorEnabled === false && npcsForSplit.length > 0;
    const blocks = splitIntoSpeakerBlocks(fullContent, npcsForSplit, { narratorDisabled });
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      const id = i === 0 ? assistantId : uuidv4();
      const msg: ChatMessage = {
        id,
        role: 'assistant',
        type: b.type === 'character' ? 'character' : 'narrator',
        content: b.content,
        timestamp: baseTimestamp,
        characterId: b.type === 'character' ? b.characterId : undefined,
        modelParams,
        chapter,
      };
      fm.appendMessage(gameId, msg);
      savedMessages.push(msg);
      await emit({ type: 'assistant-complete', data: msg });
    }
  }
  // Use the last emitted message as the orchestration return value (legacy callers).
  const assistantMessage = savedMessages[savedMessages.length - 1];

  // ---- 5. Run Game Master ----
  // Feed the GM the full raw assistant turn (all blocks combined) so it sees the
  // complete scene, not just the trailing block.
  let stateSummary: StateChangeSummary | null = null;
  try {
    await emit({ type: 'gm-start' });
    const combinedAssistant: ChatMessage = {
      ...assistantMessage,
      content: fullContent,
    };
    // For continuation turns the user never typed anything, but the GM still
    // needs a non-null exchange object. Pass a synthetic stub describing what
    // kind of continuation triggered the turn so the GM understands context.
    const gmUserMessage: ChatMessage = userMessage ?? {
      id: 'continuation',
      role: 'user',
      type: 'user',
      content: opts.singleSpeakerId
        ? '(player prompted a specific character to speak; no typed message)'
        : '(player advanced the scene without typing; no typed message)',
      timestamp: new Date().toISOString(),
      chapter,
    };
    const gmo = await runGameMaster(gameId, gmUserMessage, combinedAssistant);
    await emit({ type: 'gm-complete', data: gmo });

    // ---- 6. Apply state changes ----
    // Stamp source-message ids onto any GM-emitted memories so we can
    // cascade-invalidate them later when the user edits/deletes the turn.
    const sourceMsgIds = [
      userMessage?.id,
      ...savedMessages.map((m) => m.id),
    ].filter((x): x is string => typeof x === 'string' && !!x);
    stateSummary = applyGameMasterOutput(gameId, chapter, gmo, sourceMsgIds);
    await emit({ type: 'state-changed', data: stateSummary });
  } catch (err) {
    // GM failure should not kill the main flow
    logger.error(MOD, `Game Master error for game ${gameId}`, err);
    await emit({ type: 'error', data: { message: (err as Error).message, stage: 'game-master' } });
  }

  // ---- 7. Summarize if needed (fire-and-forget; failure is non-fatal) ----
  maybeSummarize(gameId).catch((err) => {
    logger.error(MOD, `Summarizer error for game ${gameId}`, err);
  });

  await emit({ type: 'done' });
  return { userMessage, assistantMessage, stateSummary };
}

/**
 * Regenerate: uses the previous user message, preserves the old response as an alternative.
 */
export async function runRegeneration(
  gameId: string,
  messageId: string,
  opts: OrchestratorOptions,
  emit: OrchestrationEmit,
  abortSignal?: AbortSignal
): Promise<{ assistantMessage: ChatMessage } | null> {
  // v1.1.34: see runOrchestration for rationale. Regen does several reads
  // and rewrites of the chapter files; absolutely must not interleave with
  // another turn for the same game.
  return withGameLock(gameId, () =>
    runRegenerationLocked(gameId, messageId, opts, emit, abortSignal),
  );
}

async function runRegenerationLocked(
  gameId: string,
  messageId: string,
  opts: OrchestratorOptions,
  emit: OrchestrationEmit,
  abortSignal?: AbortSignal
): Promise<{ assistantMessage: ChatMessage } | null> {
  const fm = getFileManager();
  const cfg = fm.getConfig();
  const allMessages = fm.getAllMessages(gameId);
  const idx = allMessages.findIndex((m) => m.id === messageId);
  if (idx === -1) return null;
  const target = allMessages[idx];
  if (target.role !== 'assistant') return null;

  // Find the preceding user message (context will already include history)
  let priorUser: ChatMessage | null = null;
  for (let i = idx - 1; i >= 0; i--) {
    if (allMessages[i].role === 'user') {
      priorUser = allMessages[i];
      break;
    }
  }

  const chapter = target.chapter ?? 1;
  const mode = resolveMode(
    opts.mode || 'auto',
    opts.activeCharacterId || target.characterId,
    opts.groupParticipantIds
  );

  // Re-assemble context (exclude the message being regenerated by temporarily marking it summarized)
  const tempMessages = allMessages.map((m) => (m.id === messageId ? { ...m, summarized: true } : m));
  fm.rewriteAllMessages(gameId, tempMessages);

  let context: AssembledContext | null;
  if (mode === 'character' && (opts.activeCharacterId || target.characterId)) {
    context = buildCharacterContext(gameId, (opts.activeCharacterId || target.characterId)!);
    if (!context) context = buildNarratorContext(gameId);
  } else if (mode === 'group' && opts.groupParticipantIds && opts.groupParticipantIds.length > 0) {
    context = buildGroupContext(gameId, opts.groupParticipantIds, {
      nextSpeakerId: opts.nextSpeakerId,
      singleSpeakerId: opts.singleSpeakerId,
    });
  } else {
    context = buildNarratorContext(gameId);
  }

  await emit({ type: 'context-assembled', data: { estimatedTokens: context.estimatedTokens, mode } });

  let fullContent = '';
  const stripper = new ThinkStreamStripper();
  try {
    fullContent = await chatCompletionStream(
      context.messages,
      async (chunk) => {
        if (chunk.delta) {
          const visible = stripper.push(chunk.delta);
          if (visible) {
            await emit({
              type: 'assistant-delta',
              data: { id: messageId, delta: visible },
            });
          }
        }
      },
      { seed: opts.seed, ...cfg.lmStudio },
      abortSignal
    );
    const tail = stripper.flush();
    if (tail) {
      await emit({ type: 'assistant-delta', data: { id: messageId, delta: tail } });
    }
    fullContent = stripThinkingTags(fullContent);
    fullContent = stripProseReasoning(fullContent);
  } catch (err) {
    // Restore original state (unmark summarized) before throwing
    fm.rewriteAllMessages(gameId, allMessages);
    await emit({ type: 'error', data: { message: (err as Error).message, stage: 'llm-stream' } });
    throw err;
  }

  // Restore all messages (un-mark the regen target), then update that message in place
  fm.rewriteAllMessages(gameId, allMessages);

  const prevAlternatives = target.alternatives || [];
  const newAlternative = {
    content: target.content,
    timestamp: target.timestamp,
    characterId: target.characterId,
  };

  // For narrator regenerations, the model emits speaker-tagged blocks.
  // We can't split into multiple messages in regen (alternatives are per-message),
  // so we strip the tag lines so the single regenerated bubble looks clean. The
  // GM still sees the original text via the assistantMessage object below.
  let regenContent = fullContent;
  if (mode !== 'character') {
    regenContent = fullContent
      .split(/\r?\n/)
      .filter((l) => !/^\s*\[\s*(Narrator|Character\s*:[^\]]+)\s*\]\s*$/i.test(l))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  const updated = fm.updateMessage(gameId, messageId, {
    content: regenContent,
    timestamp: new Date().toISOString(),
    alternatives: [newAlternative, ...prevAlternatives],
    modelParams: {
      temperature: cfg.lmStudio.temperature,
      topP: cfg.lmStudio.topP,
      seed: opts.seed,
    },
  });

  if (!updated) return null;

  await emit({ type: 'assistant-complete', data: updated });

  // v1.1.35: regen replaces the assistant message's content in place but
  // keeps the same messageId, which means any world-state events and NPC
  // memories the old GM run produced are now describing content that no
  // longer exists. Treat the in-place replacement as a delete-of-the-old
  // before the new GM runs: drop world events and NPC memories whose only
  // source was this messageId. The new GM run below will then stamp fresh
  // events/memories under the same messageId for the new content. Surviving
  // multi-source events get their dead source pruned (no-op here since the
  // id is still live, but keeps the cascade idempotent).
  try {
    const wsRes = invalidateWorldStateForDeletedMessages(gameId, [messageId]);
    const memRes = invalidateMemoriesForDeletedMessages(gameId, [messageId]);
    if (wsRes.dropped > 0 || memRes.length > 0) {
      const memTotal = memRes.reduce((a, b) => a + b.dropped, 0);
      logger.info(
        MOD,
        `regen cascade for ${messageId}: dropped ${wsRes.dropped} world event(s), ${memTotal} memor(ies) across ${memRes.length} NPC(s)`,
      );
    }
  } catch (err) {
    logger.warn(MOD, `regen pre-GM cascade failed (non-fatal): ${(err as Error).message}`);
  }

  // Run GM on the new response if we have a prior user turn
  if (priorUser) {
    try {
      await emit({ type: 'gm-start' });
      const gmo = await runGameMaster(gameId, priorUser, updated);
      await emit({ type: 'gm-complete', data: gmo });
      const sourceMsgIds = [priorUser?.id, updated?.id].filter(
        (x): x is string => typeof x === 'string' && !!x,
      );
      const stateSummary = applyGameMasterOutput(gameId, chapter, gmo, sourceMsgIds);
      await emit({ type: 'state-changed', data: stateSummary });
    } catch (err) {
      logger.error(MOD, `GM error on regen for game ${gameId}`, err);
    }
  }

  await emit({ type: 'done' });
  return { assistantMessage: updated };
}
