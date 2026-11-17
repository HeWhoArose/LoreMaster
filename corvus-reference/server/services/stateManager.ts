import { v4 as uuidv4 } from 'uuid';
import {
  GameMasterOutput,
  NPCCharacter,
  PlayerCharacter,
  StateChangeSummary,
  WorldState,
} from '../types/index.js';
import { getFileManager } from './fileManager.js';
import { logger } from './logger.js';

const MOD = 'stateManager';

/**
 * Apply a GameMasterOutput to the game's persistent files.
 * Returns a human-readable summary of what changed (used by the info panel).
 */
export function applyGameMasterOutput(
  gameId: string,
  chapter: number,
  gmo: GameMasterOutput,
  /**
   * Chat message ids the GM was reasoning over when it produced `gmo`.
   * Typically `[userMessageId, assistantMessageId]` (and any extra block ids
   * from a multi-block turn). Stamped onto any memory entries we append so
   * we can cascade-invalidate them when the user later edits / deletes those
   * messages. v1.1.22.
   */
  sourceMessageIds?: string[]
): StateChangeSummary {
  const fm = getFileManager();
  const summary: StateChangeSummary = {
    statChanges: [],
    inventoryChanges: [],
    relationshipChanges: [],
    newCharacters: [],
    worldEvents: [],
  };

  // Load current state
  const player = fm.getPlayer(gameId);
  const worldState = fm.getWorldState(gameId);

  // ---- Stat changes ----
  if (player && gmo.statChanges) {
    for (const change of gmo.statChanges) {
      applyStatChange(player, change);
      summary.statChanges.push(
        `${change.field} ${change.operation} ${change.value}${change.reason ? ` (${change.reason})` : ''}`
      );
    }
  }

  // ---- Currency changes (v1.1.38) ----
  // Named currencies live in `money` (the primary) or in `extraCurrencies`
  // (everything else). applyCurrencyChange resolves the name case-insensitively
  // against both; an unrecognized name creates a new extraCurrencies entry.
  if (player && Array.isArray(gmo.currencyChanges)) {
    for (const change of gmo.currencyChanges) {
      const resolved = applyCurrencyChange(player, change);
      if (resolved) {
        summary.statChanges.push(
          `${resolved} ${change.operation} ${change.value}${change.reason ? ` (${change.reason})` : ''}`
        );
      }
    }
  }

  // ---- New items ----
  if (player && gmo.newItems) {
    for (const item of gmo.newItems) {
      const existing = player.inventory.find((i) => i.name.toLowerCase() === item.name.toLowerCase());
      if (existing) {
        existing.quantity += item.quantity;
      } else {
        player.inventory.push({ ...item });
      }
      summary.inventoryChanges.push(`+ ${item.name} x${item.quantity}`);
    }
  }

  // ---- Removed items ----
  if (player && gmo.removedItems) {
    for (const rem of gmo.removedItems) {
      const idx = player.inventory.findIndex((i) => i.name.toLowerCase() === rem.name.toLowerCase());
      if (idx !== -1) {
        player.inventory[idx].quantity -= rem.quantity;
        if (player.inventory[idx].quantity <= 0) player.inventory.splice(idx, 1);
        summary.inventoryChanges.push(`- ${rem.name} x${rem.quantity}`);
      }
    }
  }

  // ---- Relationship updates (player-side) ----
  if (player && gmo.relationshipUpdates) {
    for (const upd of gmo.relationshipUpdates) {
      const prior = player.relationships[upd.id];
      const npc = fm.getCharacter(gameId, upd.id);
      const name = upd.revealedName || prior?.name || npc?.revealedName || npc?.name || upd.id;
      player.relationships[upd.id] = {
        name,
        disposition: upd.disposition ?? prior?.disposition ?? 'neutral',
        notes: upd.notes ?? prior?.notes ?? '',
      };
      summary.relationshipChanges.push(`${name}: ${upd.disposition}`);

      // Mirror onto the NPC card if it exists — but never touch pending or
      // disabled NPCs. The model shouldn't be referencing them; if it does,
      // we ignore the patch rather than silently mutate something the user
      // hasn't approved or has explicitly archived. (v1.1.28)
      if (npc && npc.status !== 'pending' && npc.status !== 'disabled') {
        const patched: NPCCharacter = {
          ...npc,
          dispositionTowardPlayer: upd.disposition ?? npc.dispositionTowardPlayer,
          revealedName: upd.revealedName ?? npc.revealedName,
        };
        if (upd.notes) {
          patched.memory = [
            ...(npc.memory || []),
            {
              id: uuidv4(),
              chapter,
              event: upd.notes,
              sourceMessageIds: sourceMessageIds && sourceMessageIds.length > 0
                ? [...sourceMessageIds]
                : [],
              stale: false,
              createdAt: new Date().toISOString(),
            },
          ];
        }
        fm.saveCharacter(gameId, patched);
      }
    }
  }

  // ---- New characters ----
  //
  // v1.1.31: Guard against the GM re-proposing an existing NPC. The GM sees
  // active NPCs in its context and is instructed to use slug ids, so it can
  // (and does, occasionally) emit a `newCharacters` entry whose id or name
  // collides with one we already have. Without this guard, `saveCharacter`
  // blindly overwrites the existing card with a blank `pending` duplicate —
  // the user experiences this as a character "randomly disappearing" (the
  // existing NPC got demoted to pending, blanked out, and hidden from the
  // active-only views in NPCList, group mode, and the GM's own context).
  //
  // We check by id AND by case-insensitive name. If either collides, drop
  // the proposal and warn. If the model wanted to update the existing NPC,
  // it should use characterUpdates; if it wanted to introduce a genuinely
  // new person, it needs to pick a different name.
  if (gmo.newCharacters) {
    const existingAll = fm.listCharacters(gameId);
    for (const partial of gmo.newCharacters) {
      // id collision check
      if (partial.id) {
        const byId = fm.getCharacter(gameId, partial.id);
        if (byId) {
          logger.warn(
            MOD,
            `GM tried to recreate existing NPC id=${partial.id} (${byId.revealedName || byId.name}); ignoring newCharacters entry.`
          );
          continue;
        }
      }
      // name collision check (case-insensitive) against all known NPCs,
      // regardless of status — even a pending or disabled NPC with the same
      // name shouldn't be silently re-introduced.
      const proposedName = (partial.revealedName || partial.name || '').trim().toLowerCase();
      if (proposedName) {
        const nameCollision = existingAll.find((c) => {
          const a = (c.revealedName || '').trim().toLowerCase();
          const b = (c.name || '').trim().toLowerCase();
          return a === proposedName || b === proposedName;
        });
        if (nameCollision) {
          logger.warn(
            MOD,
            `GM tried to recreate NPC by name "${proposedName}" (existing id=${nameCollision.id}, status=${nameCollision.status}); ignoring newCharacters entry.`
          );
          continue;
        }
      }
      const npc = normalizeNewNpc(partial);
      fm.saveCharacter(gameId, npc);
      summary.newCharacters.push(npc.revealedName || npc.name);
    }
  }

  // ---- Character updates (generic patch) ----
  if (gmo.characterUpdates) {
    for (const upd of gmo.characterUpdates) {
      const existing = fm.getCharacter(gameId, upd.id);
      if (!existing) continue;
      // Guard: never patch pending (not yet approved) or disabled (user-archived)
      // NPCs. If the model emits an update for one, ignore it silently. (v1.1.28)
      if (existing.status === 'pending' || existing.status === 'disabled') continue;
      const { id, ...rest } = upd;
      const merged = deepMerge(existing, rest) as NPCCharacter;
      merged.id = existing.id;
      // Don't let GM patches sneak a status change in — status is user-only.
      merged.status = existing.status;
      fm.saveCharacter(gameId, merged);
    }
  }

  // ---- World state updates ----
  if (gmo.worldStateUpdates && gmo.worldStateUpdates.length > 0) {
    const updatedState: WorldState = worldState || { events: [], locationStates: {} };
    // v1.1.37: snapshot a base wall-clock time for this GM call and offset each
    // event by its index in the worldStateUpdates array. A single GM call can
    // emit several events that would otherwise share a millisecond (or the GM's
    // free-form `timestamp` could be a narrative string like "Day 3, evening"
    // that doesn't sort) — we want the editor's timeline to preserve emit order
    // within a GM call. Offsetting by index in ms guarantees strict ordering
    // without ever appearing in the wrong second of wall-clock time.
    const baseMs = Date.now();
    gmo.worldStateUpdates.forEach((upd, idx) => {
      updatedState.events.push({
        // v1.1.35: stamp a stable id and the source message ids so this event
        // can be cascade-invalidated if the user later deletes/edits/regens
        // the chat message that produced it. Mirrors NPC memory plumbing.
        id: uuidv4(),
        event: upd.event,
        location: upd.location,
        timestamp: upd.timestamp || new Date(baseMs + idx).toISOString(),
        chapter,
        // v1.1.37: authoritative server-stamped ISO time, never mutated after
        // creation. The editor sorts on this.
        createdAt: new Date(baseMs + idx).toISOString(),
        sourceMessageIds: sourceMessageIds && sourceMessageIds.length > 0
          ? [...sourceMessageIds]
          : [],
      });
      summary.worldEvents.push(`${upd.location}: ${upd.event}`);
    });
    fm.saveWorldState(gameId, updatedState);
  }

  // Persist player
  if (player) fm.savePlayer(gameId, player);

  return summary;
}

function applyStatChange(
  player: PlayerCharacter,
  change: { field: string; operation: 'set' | 'add' | 'subtract'; value: number }
): void {
  const field = change.field;
  const v = Number(change.value) || 0;

  // Special-case "money" — a legacy GM emitting statChanges with field="money"
  // / "gold" / "credits" still mutates the primary currency. v1.1.38: prefer
  // `currencyChanges` for new behavior but keep this path so old prompts and
  // old replay logs still apply correctly.
  if (field.toLowerCase() === 'money' || field.toLowerCase() === 'gold' || field.toLowerCase() === 'credits') {
    if (!player.money) player.money = { currencyName: 'credits', amount: 0 };
    if (change.operation === 'set') player.money.amount = v;
    else if (change.operation === 'add') player.money.amount += v;
    else if (change.operation === 'subtract') player.money.amount = Math.max(0, player.money.amount - v);
    return;
  }

  const current = Number(player.stats[field] ?? 0);
  let next = current;
  if (change.operation === 'set') next = v;
  else if (change.operation === 'add') next = current + v;
  else if (change.operation === 'subtract') next = current - v;
  player.stats[field] = next;
}

/**
 * v1.1.38: apply a named-currency change. Resolves `name` case-insensitively
 * against `player.money.currencyName` (the primary currency) first, then
 * against the keys in `player.extraCurrencies`. If neither matches, a new
 * extraCurrencies entry is created with `name` preserved verbatim (the GM
 * casing wins for first sighting) and the operation applied to a base of 0.
 *
 * Returns the resolved display name actually mutated, or null if nothing
 * was changed (which currently can't happen but the signature reserves the
 * option for future validation).
 *
 * Math semantics match `applyStatChange`'s money branch: `subtract` floors at
 * zero, `set` overwrites, `add` increments. Negative amounts as the operand
 * (e.g. `add -5`) are honored verbatim — the model occasionally does this
 * and there's no benefit to rejecting it.
 */
export function applyCurrencyChange(
  player: PlayerCharacter,
  change: { name: string; operation: 'set' | 'add' | 'subtract'; value: number }
): string | null {
  const v = Number(change.value) || 0;
  const wanted = (change.name || '').trim();
  if (!wanted) return null;

  // Case-insensitive match against the primary currency.
  if (player.money && player.money.currencyName &&
      player.money.currencyName.toLowerCase() === wanted.toLowerCase()) {
    if (change.operation === 'set') player.money.amount = v;
    else if (change.operation === 'add') player.money.amount += v;
    else if (change.operation === 'subtract')
      player.money.amount = Math.max(0, player.money.amount - v);
    return player.money.currencyName;
  }

  // Case-insensitive match against extraCurrencies keys. We preserve the
  // existing key casing on match so the UI doesn't churn between "Silver"
  // and "silver" depending on how the GM phrased it this turn.
  if (!player.extraCurrencies) player.extraCurrencies = {};
  const existingKey = Object.keys(player.extraCurrencies)
    .find((k) => k.toLowerCase() === wanted.toLowerCase());
  const key = existingKey || wanted;
  const current = Number(player.extraCurrencies[key] ?? 0);
  let next = current;
  if (change.operation === 'set') next = v;
  else if (change.operation === 'add') next = current + v;
  else if (change.operation === 'subtract') next = Math.max(0, current - v);
  player.extraCurrencies[key] = next;
  return key;
}

function normalizeNewNpc(partial: Partial<NPCCharacter>): NPCCharacter {
  return {
    // v1.1.31: Always mint a fresh uuid for GM-introduced NPCs. The model's
    // slug-id was the original sin that let same-name proposals overwrite
    // existing character files — we ignore it entirely now and rely on the
    // collision guard above + this fresh uuid for defense in depth. Internal
    // ids are not user-visible; they don't need to be readable slugs.
    id: uuidv4(),
    name: partial.name || 'Unnamed',
    revealedName: partial.revealedName ?? null,
    // GM-introduced characters land as 'pending' so the user can approve or
    // deny them before they participate. The storyteller doesn't see them
    // until status is flipped to 'active'. (v1.1.28)
    status: 'pending',
    appearance: partial.appearance || '',
    personality: partial.personality || '',
    background: partial.background || '',
    knownInfo: partial.knownInfo || '',
    dispositionTowardPlayer: partial.dispositionTowardPlayer || 'neutral',
    // GM-supplied memories need ids stamped on if missing so CRUD still works.
    memory: (partial.memory || []).map((m) => ({
      id: (m as any).id || uuidv4(),
      chapter: typeof m.chapter === 'number' ? m.chapter : 0,
      event: typeof m.event === 'string' ? m.event : '',
      sourceMessageIds: Array.isArray((m as any).sourceMessageIds)
        ? ((m as any).sourceMessageIds as string[])
        : [],
      stale: (m as any).stale === true,
      createdAt: (m as any).createdAt || new Date().toISOString(),
    })),
    voiceStyle: partial.voiceStyle || '',
    image: {
      basePrompt: partial.image?.basePrompt || '',
      coreAppearance: partial.image?.coreAppearance || '',
      baseNegative: partial.image?.baseNegative || '',
      lastPrompt: partial.image?.lastPrompt ?? null,
      lastSeed: partial.image?.lastSeed ?? null,
      identitySeed: partial.image?.identitySeed ?? null,
      portraitPath: partial.image?.portraitPath ?? null,
    },
  };
}

function deepMerge(target: any, source: any): any {
  if (source === null || source === undefined) return target;
  if (typeof source !== 'object' || Array.isArray(source)) return source;
  const out: any = { ...target };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const tv = target?.[key];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && tv && typeof tv === 'object' && !Array.isArray(tv)) {
      out[key] = deepMerge(tv, sv);
    } else {
      out[key] = sv;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Memory cascade-invalidation (v1.1.22)
// ---------------------------------------------------------------------------

/**
 * When a chat message is DELETED, drop any NPC memory entries whose ENTIRE
 * source-message set was that one (or more) deleted messages — i.e. every
 * source id is gone. Memories that had multiple sources and only LOST some of
 * them are left in place: the rest of the turn still happened.
 *
 * Memories with no `sourceMessageIds` (user-added or legacy GM memories from
 * before v1.1.22) are never touched.
 *
 * Returns a per-NPC summary of how many memories were dropped, for logging.
 */
export function invalidateMemoriesForDeletedMessages(
  gameId: string,
  deletedMessageIds: string[],
): Array<{ npcId: string; npcName: string; dropped: number }> {
  if (!deletedMessageIds || deletedMessageIds.length === 0) return [];
  const fm = getFileManager();
  const deletedSet = new Set(deletedMessageIds);
  const summary: Array<{ npcId: string; npcName: string; dropped: number }> = [];
  const characters = fm.listCharacters(gameId);
  for (const npc of characters) {
    if (!npc.memory || npc.memory.length === 0) continue;
    const next = npc.memory.filter((m) => {
      const src = m.sourceMessageIds || [];
      if (src.length === 0) return true; // user-added / legacy — keep
      // After removing deleted ids, are any source messages still around?
      const remaining = src.filter((id) => !deletedSet.has(id));
      // Drop only if EVERY source was deleted.
      return remaining.length > 0;
    }).map((m) => {
      // For survivors that lost SOME sources, prune the dead ids so future
      // edits don't keep flagging them as stale via vanished message ids.
      const src = m.sourceMessageIds || [];
      if (src.length === 0) return m;
      const remaining = src.filter((id) => !deletedSet.has(id));
      if (remaining.length === src.length) return m;
      return { ...m, sourceMessageIds: remaining };
    });
    const dropped = npc.memory.length - next.length;
    if (dropped > 0 || next.some((m, i) => m !== npc.memory[i])) {
      fm.saveCharacter(gameId, { ...npc, memory: next });
    }
    if (dropped > 0) {
      summary.push({ npcId: npc.id, npcName: npc.revealedName || npc.name, dropped });
    }
  }
  return summary;
}

/**
 * v1.1.35: world-state counterpart to invalidateMemoriesForDeletedMessages.
 *
 * When chat messages are DELETED (which includes the implicit delete in a
 * regenerate or continuation rewind), drop any WorldStateEvent whose ENTIRE
 * sourceMessageIds set was that one (or more) deleted messages — i.e. every
 * source id is gone. Events with multiple sources that only LOST some are
 * left in place: the rest of the turn still happened.
 *
 * Events with empty/undefined sourceMessageIds (user-added or pre-v1.1.35
 * legacy) are never touched.
 *
 * Returns the number of events that were dropped, for logging.
 */
export function invalidateWorldStateForDeletedMessages(
  gameId: string,
  deletedMessageIds: string[],
): { dropped: number; staleCleared: number } {
  if (!deletedMessageIds || deletedMessageIds.length === 0) return { dropped: 0, staleCleared: 0 };
  const fm = getFileManager();
  const deletedSet = new Set(deletedMessageIds);
  const ws = fm.getWorldState(gameId);
  if (!ws.events || ws.events.length === 0) return { dropped: 0, staleCleared: 0 };
  let dropped = 0;
  let staleCleared = 0;
  const nextEvents = ws.events
    .filter((e) => {
      const src = e.sourceMessageIds || [];
      if (src.length === 0) return true; // user-added / legacy — keep
      const remaining = src.filter((id) => !deletedSet.has(id));
      if (remaining.length === 0) {
        dropped += 1;
        return false;
      }
      return true;
    })
    .map((e) => {
      const src = e.sourceMessageIds || [];
      if (src.length === 0) return e;
      const remaining = src.filter((id) => !deletedSet.has(id));
      if (remaining.length === src.length) return e;
      // Prune dead source ids from survivors so they don't keep re-triggering
      // stale flags on later edits to messages that no longer exist. If the
      // event was previously stale because its only live source was the one
      // we just deleted, clear the stale flag — the editing user input that
      // had marked it is gone now.
      const next = { ...e, sourceMessageIds: remaining };
      if (next.stale && remaining.length > 0) {
        // Recompute: an event should still be stale if any LIVE source is
        // currently being tracked as edited. We don't track per-source stale
        // state, so the safe default is to clear the flag here — future edits
        // will re-flag it if needed.
        next.stale = false;
        staleCleared += 1;
      }
      return next;
    });
  if (dropped > 0 || nextEvents.some((e, i) => e !== ws.events[i])) {
    fm.saveWorldState(gameId, { ...ws, events: nextEvents });
  }
  if (dropped > 0) {
    logger.info(MOD, `world-state cascade: dropped ${dropped} event(s) tied to ${deletedMessageIds.length} deleted message(s)`);
  }
  return { dropped, staleCleared };
}

/**
 * v1.1.35: world-state counterpart to markMemoriesStaleForEditedMessage.
 *
 * When a chat message is EDITED, mark every WorldStateEvent whose source set
 * INCLUDES that message id as `stale = true`. The event stays in the file so
 * the user can review and either edit it themselves (which clears stale) or
 * delete it. The context-block renderer surfaces stale events visibly to
 * deprioritize them with the model.
 *
 * Returns the count of events marked stale.
 */
export function markWorldStateStaleForEditedMessage(
  gameId: string,
  editedMessageId: string,
): { markedStale: number } {
  if (!editedMessageId) return { markedStale: 0 };
  const fm = getFileManager();
  const ws = fm.getWorldState(gameId);
  if (!ws.events || ws.events.length === 0) return { markedStale: 0 };
  let touched = 0;
  const nextEvents = ws.events.map((e) => {
    const src = e.sourceMessageIds || [];
    if (!src.includes(editedMessageId)) return e;
    if (e.stale) return e;
    touched += 1;
    return { ...e, stale: true };
  });
  if (touched > 0) {
    fm.saveWorldState(gameId, { ...ws, events: nextEvents });
    logger.info(MOD, `world-state cascade: marked ${touched} event(s) stale from edit of ${editedMessageId}`);
  }
  return { markedStale: touched };
}

/**
 * When a chat message is EDITED, mark every NPC memory whose source set
 * INCLUDES that message id as `stale = true`. The user can then review and
 * either fix the memory text (editing clears stale) or delete it.
 *
 * Returns a per-NPC summary of how many memories were marked stale.
 */
export function markMemoriesStaleForEditedMessage(
  gameId: string,
  editedMessageId: string,
): Array<{ npcId: string; npcName: string; markedStale: number }> {
  if (!editedMessageId) return [];
  const fm = getFileManager();
  const summary: Array<{ npcId: string; npcName: string; markedStale: number }> = [];
  const characters = fm.listCharacters(gameId);
  for (const npc of characters) {
    if (!npc.memory || npc.memory.length === 0) continue;
    let touched = 0;
    const next = npc.memory.map((m) => {
      const src = m.sourceMessageIds || [];
      if (!src.includes(editedMessageId)) return m;
      if (m.stale) return m; // already flagged
      touched += 1;
      return { ...m, stale: true };
    });
    if (touched > 0) {
      fm.saveCharacter(gameId, { ...npc, memory: next });
      summary.push({ npcId: npc.id, npcName: npc.revealedName || npc.name, markedStale: touched });
    }
  }
  return summary;
}
