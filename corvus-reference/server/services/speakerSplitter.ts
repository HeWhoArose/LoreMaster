import { NPCCharacter } from '../types/index.js';

export interface SpeakerBlock {
  /** 'narrator' or 'character' */
  type: 'narrator' | 'character';
  /** NPC id when type === 'character'; undefined for narrator */
  characterId?: string;
  /** The body text of the block (no tag line) */
  content: string;
  /** The label that was tagged (raw, used for debugging or unknown chars) */
  rawLabel?: string;
}

const TAG_LINE_RE = /^\s*\[\s*(Narrator|Character\s*:\s*[^\]]+)\s*\]\s*$/i;

/**
 * Split a tagged narrator-style response into speaker blocks.
 *
 * The expected input format (see narrator system prompt) is:
 *
 *   [Narrator]
 *   *Some scene text.*
 *
 *   [Character: Jin]
 *   "Hello there." *She tilts her head.*
 *
 *   [Narrator]
 *   *...*
 *
 * Returns an ordered list of blocks. If no tags are present at all, returns a
 * single narrator block containing the whole text (graceful fallback).
 */
export interface SplitOptions {
  /** When true, [Narrator] blocks are folded into adjacent character blocks. */
  narratorDisabled?: boolean;
}

export function splitIntoSpeakerBlocks(
  raw: string,
  npcs: NPCCharacter[],
  options: SplitOptions = {}
): SpeakerBlock[] {
  if (!raw || !raw.trim()) return [];

  const lines = raw.split(/\r?\n/);
  const blocks: SpeakerBlock[] = [];

  let current: SpeakerBlock | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (!current) return;
    const body = currentLines.join('\n').trim();
    if (body) {
      blocks.push({ ...current, content: body });
    }
    current = null;
    currentLines = [];
  };

  for (const line of lines) {
    const m = line.match(TAG_LINE_RE);
    if (m) {
      // Boundary — finish previous block
      flush();
      const tag = m[1].trim();
      if (/^narrator$/i.test(tag)) {
        current = { type: 'narrator', content: '', rawLabel: 'Narrator' };
      } else {
        // Character: <name>
        const name = tag.replace(/^character\s*:\s*/i, '').trim();
        const matched = matchNpc(name, npcs);
        current = matched
          ? { type: 'character', characterId: matched.id, content: '', rawLabel: matched.revealedName || matched.name }
          : { type: 'character', content: '', rawLabel: name };
      }
      currentLines = [];
    } else {
      if (!current) {
        // Untagged content before any tag — treat as narrator preamble
        current = { type: 'narrator', content: '', rawLabel: 'Narrator' };
        currentLines = [];
      }
      currentLines.push(line);
    }
  }
  flush();

  // If the model produced zero tags, fall back to one narrator block.
  if (blocks.length === 0) {
    return [{ type: 'narrator', content: raw.trim(), rawLabel: 'Narrator' }];
  }

  // Coalesce consecutive blocks from the SAME speaker so the chat doesn't spam
  // 5× narrator bubbles in a row when the model splits a single description
  // across multiple [Narrator] tags.
  const merged: SpeakerBlock[] = [];
  for (const b of blocks) {
    const prev = merged[merged.length - 1];
    const sameSpeaker =
      prev &&
      prev.type === b.type &&
      (prev.type === 'narrator' || prev.characterId === b.characterId);
    if (sameSpeaker) {
      prev.content = `${prev.content}\n\n${b.content}`.trim();
    } else {
      merged.push({ ...b });
    }
  }

  // Narrator-disabled mode: if the model still snuck in [Narrator] blocks,
  // either fold them into an adjacent character block or, if no NPC has
  // spoken at all and we have a known NPC, reassign the first narrator block
  // to that NPC. If there are absolutely no NPCs to attribute to, leave
  // narrator blocks alone (graceful fallback so the user still sees text).
  if (options.narratorDisabled && npcs.length > 0) {
    const folded: SpeakerBlock[] = [];
    let lastCharacter: NPCCharacter | null = null;
    for (const b of merged) {
      if (b.type === 'narrator') {
        const lastFolded = folded[folded.length - 1];
        if (lastFolded && lastFolded.type === 'character') {
          // Fold into the previous character block.
          lastFolded.content = `${lastFolded.content}\n\n${b.content}`.trim();
          continue;
        }
        // No prior character to fold into — attribute to the most-recent
        // known character if any, otherwise the first NPC in the list.
        const target: NPCCharacter | undefined = lastCharacter || npcs[0];
        if (target) {
          folded.push({
            type: 'character',
            characterId: target.id,
            content: b.content,
            rawLabel: target.revealedName || target.name,
          });
          lastCharacter = target;
          continue;
        }
        // Fallback: keep it (shouldn't happen since npcs.length > 0).
        folded.push(b);
      } else {
        folded.push(b);
        if (b.characterId) {
          lastCharacter = npcs.find((n) => n.id === b.characterId) || lastCharacter;
        }
      }
    }
    // Re-coalesce consecutive same-speaker blocks after folding.
    const reCoalesced: SpeakerBlock[] = [];
    for (const b of folded) {
      const prev = reCoalesced[reCoalesced.length - 1];
      const sameSpeaker =
        prev &&
        prev.type === b.type &&
        (prev.type === 'narrator' || prev.characterId === b.characterId);
      if (sameSpeaker) {
        prev.content = `${prev.content}\n\n${b.content}`.trim();
      } else {
        reCoalesced.push({ ...b });
      }
    }
    return reCoalesced;
  }

  return merged;
}

/**
 * Match an NPC name (case-insensitive, fuzzy on whitespace) to a known NPC.
 * Tries revealedName first, then name. Returns the NPC or null.
 */
function matchNpc(name: string, npcs: NPCCharacter[]): NPCCharacter | null {
  if (!name) return null;
  const norm = (s: string | null | undefined) =>
    (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const target = norm(name);
  if (!target) return null;

  // Exact (revealedName or name)
  for (const npc of npcs) {
    if (norm(npc.revealedName) === target || norm(npc.name) === target) {
      return npc;
    }
  }
  // First-name / contains match (e.g. "Jin Kasai" tagged as "Jin")
  for (const npc of npcs) {
    const a = norm(npc.revealedName);
    const b = norm(npc.name);
    if (
      (a && (a.startsWith(target + ' ') || a.split(' ').includes(target))) ||
      (b && (b.startsWith(target + ' ') || b.split(' ').includes(target)))
    ) {
      return npc;
    }
  }
  return null;
}

/** Strip leading / trailing speaker tag lines from a chunk, used for live preview. */
export function stripSpeakerTagsForPreview(buffer: string): string {
  // Remove every line that is purely a [Narrator] / [Character: …] tag,
  // collapsing consecutive blank lines.
  const lines = buffer.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    if (TAG_LINE_RE.test(line)) continue;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
