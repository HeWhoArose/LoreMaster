import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getFileManager } from '../services/fileManager.js';
import { logger } from '../services/logger.js';
import {
  runOrchestration,
  runRegeneration,
  OrchestrationEvent,
  OrchestratorMode,
} from '../services/orchestrator.js';
import { ChatMessage } from '../types/index.js';
import {
  invalidateMemoriesForDeletedMessages,
  invalidateWorldStateForDeletedMessages,
  markMemoriesStaleForEditedMessage,
  markWorldStateStaleForEditedMessage,
} from '../services/stateManager.js';

const router = Router();

const MOD = 'routes/chat';

/**
 * Map an internal OrchestrationEvent to the shape the frontend expects:
 *   { type: 'token' | 'done' | 'gm_update' | 'error' | ... , ...payload }
 * The frontend consumes ONLY the `data:` line of each SSE chunk.
 */
function writeSseEvent(res: Response, event: OrchestrationEvent): void {
  let sseData: any;
  switch (event.type) {
    case 'assistant-delta': {
      // Orchestrator emits `delta`; older plan said `content`. Accept both.
      const token = event.data?.delta ?? event.data?.content ?? '';
      sseData = { type: 'token', content: token };
      break;
    }
    case 'assistant-complete':
      sseData = { type: 'done', message: event.data };
      break;
    case 'done':
      // Signal end-of-stream. Distinct from 'done' (which carries the message).
      // The frontend ignores unknown event types, so this gracefully signals
      // that the SSE connection will close without risking a second onDone call
      // with an undefined message.
      sseData = { type: 'stream_end' };
      break;
    case 'gm-complete':
    case 'state-changed': {
      // Re-read fresh player / characters / worldState so the frontend can replace
      // these in its store in one shot.
      const gameId = (res.locals && res.locals.gameId) as string | undefined;
      let player: any, characters: any, worldState: any;
      if (gameId) {
        try {
          const fm = getFileManager();
          player = fm.getPlayer(gameId);
          characters = fm.listCharacters(gameId);
          worldState = fm.getWorldState(gameId);
        } catch (err) {
          logger.error(MOD, 'Failed to refresh state for gm_update SSE event', err);
        }
      }
      sseData = {
        type: 'gm_update',
        player,
        characters,
        worldState,
        summary: event.type === 'state-changed' ? event.data : undefined,
      };
      break;
    }
    case 'error':
      sseData = { type: 'error', error: event.data?.message || 'Unknown error' };
      break;
    default:
      // user-message-saved, context-assembled, gm-start — info-only for the frontend.
      sseData = { type: event.type, ...(event.data || {}) };
      break;
  }

  res.write(`data: ${JSON.stringify(sseData)}\n\n`);
  logger.sse(MOD, sseData.type);

  if (typeof (res as any).flush === 'function') {
    try {
      (res as any).flush();
    } catch {
      /* ignore */
    }
  }
}

function openSseStream(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function summarizeText(input: string, max = 80): string {
  if (!input) return '';
  const s = String(input).replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/messages  — send a message; streams SSE
// ---------------------------------------------------------------------------
router.post('/:gameId/messages', async (req: Request, res: Response) => {
  const { gameId } = req.params;
  res.locals.gameId = gameId;
  const fm = getFileManager();

  try {
    const game = fm.getGame(gameId);
    if (!game) {
      logger.warn(MOD, `POST messages — game not found: ${gameId}`);
      return res.status(404).json({ error: 'Game not found.' });
    }

    const body = req.body || {};
    // v1.1.30: empty content is allowed — it means "advance the story without
    // a player message". The orchestrator detects this and skips saving a
    // user bubble + frames the LLM prompt as a continuation.
    const content = typeof body.content === 'string' ? body.content : '';

    const mode: OrchestratorMode =
      body.mode === 'character' || body.mode === 'narrator' || body.mode === 'group'
        ? body.mode
        : 'auto';
    const activeCharacterId =
      typeof body.activeCharacterId === 'string' ? body.activeCharacterId : undefined;
    const mentionedNpcIds = Array.isArray(body.mentionedNpcIds) ? body.mentionedNpcIds : [];
    const groupParticipantIds: string[] | undefined = Array.isArray(body.groupParticipantIds)
      ? body.groupParticipantIds.filter((x: unknown) => typeof x === 'string')
      : undefined;
    const nextSpeakerId =
      typeof body.nextSpeakerId === 'string' ? body.nextSpeakerId : undefined;
    const singleSpeakerId =
      typeof body.singleSpeakerId === 'string' ? body.singleSpeakerId : undefined;
    const seed = typeof body.seed === 'number' ? body.seed : undefined;
    const chapter = typeof body.chapter === 'number' ? body.chapter : 1;

    // Refuse if BOTH content is empty AND there's no instruction about who
    // should speak — we'd just be asking the model to generate from nothing.
    // (A continuation in group/narrator mode without typed content is fine
    // because the system prompt + history give it plenty to react to.)
    if (!content.trim() && !groupParticipantIds?.length && !singleSpeakerId && !activeCharacterId) {
      // Allow it anyway — narrator-style continuation is valid. The guard
      // above is just documentation. Falling through.
    }

    logger.info(
      MOD,
      `POST /${gameId}/messages mode=${mode} chapter=${chapter} content="${summarizeText(content)}"`
    );

    openSseStream(res);
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      await runOrchestration(
        gameId,
        content,
        {
          mode,
          activeCharacterId,
          mentionedNpcIds,
          groupParticipantIds,
          nextSpeakerId,
          singleSpeakerId,
          seed,
          chapter,
        },
        async (event) => writeSseEvent(res, event),
        controller.signal
      );

      const updated = { ...game, lastPlayedAt: new Date().toISOString() };
      fm.saveGame(updated);
    } catch (err) {
      logger.error(MOD, `Orchestration failed for game ${gameId}`, err);
      writeSseEvent(res, { type: 'error', data: { message: (err as Error).message } });
    } finally {
      res.end();
    }
  } catch (err) {
    logger.error(MOD, `Unhandled error in POST /${gameId}/messages`, err);
    if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/games/:gameId/messages  — paginated history
// Frontend expects a plain ChatMessage[] array.
// ---------------------------------------------------------------------------
router.get('/:gameId/messages', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const game = fm.getGame(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });

    const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10) || 0);
    const limit = Math.max(1, Math.min(500, parseInt(String(req.query.limit ?? '500'), 10) || 500));
    const { messages } = fm.getPagedMessages(gameId, offset, limit);
    logger.info(MOD, `GET /${gameId}/messages → ${messages.length} messages`);
    return res.json(messages);
  } catch (err) {
    logger.error(MOD, 'Failed to read message history', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/games/:gameId/messages/:messageId  — edit a message
// Returns the updated ChatMessage directly (no wrapper).
// ---------------------------------------------------------------------------
router.patch('/:gameId/messages/:messageId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, messageId } = req.params;
    const { content } = req.body || {};
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Field "content" is required.' });
    }
    const updated = fm.updateMessage(gameId, messageId, {
      content,
      timestamp: new Date().toISOString(),
    });
    if (!updated) {
      logger.warn(MOD, `PATCH message not found: ${gameId}/${messageId}`);
      return res.status(404).json({ error: 'Message not found.' });
    }
    // v1.1.22: flag any NPC memories sourced from this message as stale so
    // the user can review them in the character card.
    // v1.1.35: same treatment for world-state events sourced from this message.
    try {
      const flagged = markMemoriesStaleForEditedMessage(gameId, messageId);
      if (flagged.length > 0) {
        logger.info(
          MOD,
          `edit cascade: flagged ${flagged.reduce((a, b) => a + b.markedStale, 0)} memories as stale across ${flagged.length} NPCs`,
        );
      }
      const wsFlagged = markWorldStateStaleForEditedMessage(gameId, messageId);
      if (wsFlagged.markedStale > 0) {
        logger.info(MOD, `edit cascade: flagged ${wsFlagged.markedStale} world-state event(s) as stale`);
      }
    } catch (cascadeErr) {
      logger.warn(MOD, 'stale-flag cascade failed (non-fatal)', cascadeErr);
    }
    logger.info(MOD, `PATCH /${gameId}/messages/${messageId} ok`);
    return res.json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to edit message', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/messages/seed  — inject a pre-baked message into the
// chat log without going through the LLM. Used by the New Character Chat flow
// to drop a card's `first_mes` / chosen greeting in as the very first reply.
// Body: { content: string, characterId?: string, type?: 'character' | 'narrator' }
// ---------------------------------------------------------------------------
router.post('/:gameId/messages/seed', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const { content, characterId, type } = req.body || {};
    if (typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ error: 'Field "content" is required.' });
    }
    const game = fm.getGame(gameId);
    if (!game) {
      logger.warn(MOD, `seed — game not found: ${gameId}`);
      return res.status(404).json({ error: 'Game not found.' });
    }
    const msgType: 'character' | 'narrator' =
      type === 'narrator' ? 'narrator' : 'character';
    const message: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      type: msgType,
      content: content.trim(),
      timestamp: new Date().toISOString(),
      characterId:
        msgType === 'character' && typeof characterId === 'string' && characterId
          ? characterId
          : undefined,
    };
    fm.appendMessage(gameId, message);
    logger.info(
      MOD,
      `seed /${gameId} type=${msgType} characterId=${characterId || 'none'} len=${content.length}`,
    );
    return res.status(201).json(message);
  } catch (err) {
    logger.error(MOD, 'Failed to seed message', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/games/:gameId/messages/:messageId
// ---------------------------------------------------------------------------
router.delete('/:gameId/messages/:messageId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, messageId } = req.params;
    const ok = fm.deleteMessage(gameId, messageId);
    if (!ok) {
      logger.warn(MOD, `DELETE message not found: ${gameId}/${messageId}`);
      return res.status(404).json({ error: 'Message not found.' });
    }
    // v1.1.22: drop NPC memories whose ENTIRE source set was this message.
    // v1.1.35: same for world-state events.
    try {
      const dropped = invalidateMemoriesForDeletedMessages(gameId, [messageId]);
      if (dropped.length > 0) {
        const total = dropped.reduce((a, b) => a + b.dropped, 0);
        logger.info(
          MOD,
          `delete cascade: dropped ${total} orphaned memories across ${dropped.length} NPCs`,
        );
      }
      const wsRes = invalidateWorldStateForDeletedMessages(gameId, [messageId]);
      if (wsRes.dropped > 0) {
        logger.info(MOD, `delete cascade: dropped ${wsRes.dropped} orphaned world-state event(s)`);
      }
    } catch (cascadeErr) {
      logger.warn(MOD, 'delete cascade failed (non-fatal)', cascadeErr);
    }
    logger.info(MOD, `DELETE /${gameId}/messages/${messageId} ok`);
    return res.json({ ok });
  } catch (err) {
    logger.error(MOD, 'Failed to delete message', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/messages/:messageId/regenerate  — SSE stream
// ---------------------------------------------------------------------------
router.post('/:gameId/messages/:messageId/regenerate', async (req: Request, res: Response) => {
  const { gameId, messageId } = req.params;
  res.locals.gameId = gameId;
  const fm = getFileManager();

  try {
    const game = fm.getGame(gameId);
    if (!game) return res.status(404).json({ error: 'Game not found.' });

    const body = req.body || {};
    const mode: OrchestratorMode =
      body.mode === 'character' || body.mode === 'narrator' || body.mode === 'group'
        ? body.mode
        : 'auto';
    const activeCharacterId =
      typeof body.activeCharacterId === 'string' ? body.activeCharacterId : undefined;
    const groupParticipantIds: string[] | undefined = Array.isArray(body.groupParticipantIds)
      ? body.groupParticipantIds.filter((x: unknown) => typeof x === 'string')
      : undefined;
    const nextSpeakerId =
      typeof body.nextSpeakerId === 'string' ? body.nextSpeakerId : undefined;
    const singleSpeakerId =
      typeof body.singleSpeakerId === 'string' ? body.singleSpeakerId : undefined;
    const seed = typeof body.seed === 'number' ? body.seed : undefined;

    logger.info(MOD, `POST regenerate /${gameId}/messages/${messageId} mode=${mode}`);

    openSseStream(res);
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      const result = await runRegeneration(
        gameId,
        messageId,
        { mode, activeCharacterId, groupParticipantIds, nextSpeakerId, singleSpeakerId, seed },
        async (event) => writeSseEvent(res, event),
        controller.signal
      );
      if (!result) {
        writeSseEvent(res, {
          type: 'error',
          data: { message: 'Message not found or not regeneratable.' },
        });
      }
    } catch (err) {
      logger.error(MOD, `Regeneration failed for ${gameId}/${messageId}`, err);
      writeSseEvent(res, { type: 'error', data: { message: (err as Error).message } });
    } finally {
      res.end();
    }
  } catch (err) {
    logger.error(MOD, 'Unhandled error in regenerate route', err);
    if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/messages/:messageId/alternative
// Body: { index: number }
// Swaps the current content with the alternative at `index` and keeps the old
// content in the alternatives list.
// ---------------------------------------------------------------------------
router.post('/:gameId/messages/:messageId/alternative', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, messageId } = req.params;
    const index = Number(req.body?.index);
    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({ error: 'Field "index" must be a non-negative integer.' });
    }

    const all = fm.getAllMessages(gameId);
    const target = all.find((m) => m.id === messageId);
    if (!target) {
      logger.warn(MOD, `alternative: message not found: ${gameId}/${messageId}`);
      return res.status(404).json({ error: 'Message not found.' });
    }

    const alternatives = target.alternatives || [];
    if (index >= alternatives.length) {
      return res.status(400).json({ error: `Alternative index ${index} out of range.` });
    }

    const chosen = alternatives[index];
    const previousAsAlt = {
      content: target.content,
      timestamp: target.timestamp,
      characterId: target.characterId,
    };
    const newAlternatives = alternatives.slice();
    newAlternatives.splice(index, 1);
    newAlternatives.unshift(previousAsAlt);

    const updated = fm.updateMessage(gameId, messageId, {
      content: chosen.content,
      timestamp: new Date().toISOString(),
      characterId: chosen.characterId,
      alternatives: newAlternatives,
    });
    if (!updated) return res.status(404).json({ error: 'Message not found after update.' });

    // v1.1.22: swapping to an alternative changes message content — flag any
    // memories sourced from this message as stale for review.
    // v1.1.35: same for world-state events.
    try {
      markMemoriesStaleForEditedMessage(gameId, messageId);
      markWorldStateStaleForEditedMessage(gameId, messageId);
    } catch (cascadeErr) {
      logger.warn(MOD, 'stale-flag cascade failed on alt-swap (non-fatal)', cascadeErr);
    }

    logger.info(MOD, `selectAlternative /${gameId}/messages/${messageId} index=${index} ok`);
    return res.json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to select alternative', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
