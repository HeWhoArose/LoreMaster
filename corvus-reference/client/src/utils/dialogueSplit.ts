/**
 * Dialogue splitter for TTS routing.
 *
 * Given a block of storyteller prose plus the list of NPCs currently on
 * stage, produce an ordered list of `{ voice, text, speaker? }` segments.
 *
 * Heuristics, in order:
 *   1. Speaker-tag lines like `Aria: "Get down!"` or `Aria — "Get down!"`
 *      → emit the tag-stripped quote with that NPC's voice.
 *   2. Sentences with `<Name> said/whispered/yelled/...` (any verb) AND a
 *      quoted span in the same sentence → split into [narration before
 *      quote, quote, narration after quote] with the NPC voice on the
 *      quote and narrator voice on the rest.
 *   3. Bare quoted spans without an attributable speaker → fall back to
 *      narrator voice (we don't try to guess from prior context).
 *   4. Everything else → narrator voice.
 *
 * The matching is case-insensitive on NPC names and accepts the first
 * whitespace-separated token of a name as a nickname (e.g. "Aria Vex" can
 * be referenced as "Aria").
 *
 * This is intentionally a pure function — no DOM, no audio, no state — so
 * it's trivially testable from a Node script.
 */

export interface DialogueNPC {
  id: string;
  name: string;
  /** Optional voice id; if absent the segment falls back to narrator. */
  voice?: string;
  /** If false, NPC dialogue is read with the narrator voice instead. */
  enabled?: boolean;
}

export interface DialogueSegment {
  /** Voice id to use; may be empty → consumer should substitute narrator default. */
  voice: string;
  text: string;
  /** NPC id when this segment came from an attributed dialogue match. */
  speaker?: string;
}

export interface SplitOptions {
  npcs: DialogueNPC[];
  narratorVoice: string;
}

/** Strip surrounding double/single/smart quotes and trim. */
function stripQuotes(s: string): string {
  return s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '').trim();
}

/** Quote-aware regex: matches "…", '…', “…”, ‘…’. */
const QUOTE_RE = /(["“][^"”]+["”]|['‘][^'’]+['’])/g;

/** Verbs that strongly imply the noun before them is the speaker. */
const SAY_VERBS = [
  'said', 'says', 'asked', 'asks', 'whispered', 'whispers', 'yelled', 'yells',
  'shouted', 'shouts', 'muttered', 'mutters', 'replied', 'replies',
  'answered', 'answers', 'growled', 'growls', 'snapped', 'snaps',
  'breathed', 'breathes', 'called', 'calls', 'cried', 'cries',
];

function npcByName(name: string, npcs: DialogueNPC[]): DialogueNPC | undefined {
  const want = name.toLowerCase().trim();
  if (!want) return undefined;
  // Exact name first.
  let hit = npcs.find((n) => n.name.toLowerCase() === want);
  if (hit) return hit;
  // First-token (nickname) match.
  hit = npcs.find((n) => n.name.split(/\s+/)[0]?.toLowerCase() === want);
  return hit;
}

/** Resolve the voice for an NPC, honoring the enabled flag. */
function voiceForNpc(n: DialogueNPC | undefined, narratorVoice: string): string {
  if (!n) return narratorVoice;
  if (n.enabled === false) return narratorVoice;
  return n.voice?.trim() || narratorVoice;
}

/**
 * Split a single line. Returns one or more segments.
 *
 * Order of attempts:
 *   - speaker tag at the start ("Name: ..." or "Name — ...")
 *   - say-verb attribution within the line
 *   - fallback: whole line at narrator voice
 */
function splitLine(line: string, opts: SplitOptions): DialogueSegment[] {
  const trimmed = line.trim();
  if (!trimmed) return [];

  // 1. Leading speaker tag: "Name:" or "Name —" / "Name -"
  const tagMatch = trimmed.match(/^([A-Z][\w''-]*(?:\s+[A-Z][\w''-]*)?)\s*[:—\-]\s+(.*)$/);
  if (tagMatch) {
    const npc = npcByName(tagMatch[1], opts.npcs);
    if (npc) {
      return [{
        voice: voiceForNpc(npc, opts.narratorVoice),
        text: stripQuotes(tagMatch[2]) || tagMatch[2].trim(),
        speaker: npc.id,
      }];
    }
  }

  // 2. Say-verb attribution. Walk every quote in the line; for each,
  //    inspect a 60-char window on either side for "<Name> <verb>" or
  //    "<verb> <Name>".
  const quotes: Array<{ start: number; end: number; text: string; speaker?: DialogueNPC }> = [];
  let m: RegExpExecArray | null;
  QUOTE_RE.lastIndex = 0;
  while ((m = QUOTE_RE.exec(trimmed)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    const windowBefore = trimmed.slice(Math.max(0, start - 80), start);
    const windowAfter = trimmed.slice(end, Math.min(trimmed.length, end + 80));
    let speaker: DialogueNPC | undefined;
    for (const npc of opts.npcs) {
      const first = npc.name.split(/\s+/)[0];
      const nameRe = new RegExp(`\\b(${escapeRe(npc.name)}|${escapeRe(first)})\\b`, 'i');
      const verbRe = new RegExp(`\\b(${SAY_VERBS.join('|')})\\b`, 'i');
      if (
        (nameRe.test(windowBefore) && verbRe.test(windowBefore)) ||
        (nameRe.test(windowAfter) && verbRe.test(windowAfter))
      ) {
        speaker = npc;
        break;
      }
    }
    quotes.push({ start, end, text: stripQuotes(m[0]), speaker });
  }

  if (quotes.length === 0) {
    return [{ voice: opts.narratorVoice, text: trimmed }];
  }

  // Interleave narration and quotes.
  const out: DialogueSegment[] = [];
  let cursor = 0;
  for (const q of quotes) {
    const narration = trimmed.slice(cursor, q.start).trim();
    if (narration) out.push({ voice: opts.narratorVoice, text: narration });
    if (q.text) {
      const npc = q.speaker;
      out.push({
        voice: voiceForNpc(npc, opts.narratorVoice),
        text: q.text,
        speaker: npc?.id,
      });
    }
    cursor = q.end;
  }
  const tail = trimmed.slice(cursor).trim();
  if (tail) out.push({ voice: opts.narratorVoice, text: tail });

  return out;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Top-level entry point. Splits prose into paragraphs (blank-line
 * separated), then each paragraph into lines, then each line via
 * `splitLine`. Coalesces adjacent same-voice segments so the queue
 * doesn't fragment narrator runs into dozens of tiny clips.
 */
export function splitDialogue(text: string, opts: SplitOptions): DialogueSegment[] {
  const segments: DialogueSegment[] = [];
  const paragraphs = (text || '').split(/\n{2,}/);
  for (const para of paragraphs) {
    for (const line of para.split(/\n/)) {
      for (const seg of splitLine(line, opts)) {
        segments.push(seg);
      }
    }
  }
  return coalesce(segments);
}

/** Merge adjacent segments that share the same voice + speaker. */
function coalesce(segments: DialogueSegment[]): DialogueSegment[] {
  const out: DialogueSegment[] = [];
  for (const s of segments) {
    const last = out[out.length - 1];
    if (last && last.voice === s.voice && last.speaker === s.speaker) {
      last.text = `${last.text} ${s.text}`.trim();
    } else {
      out.push({ ...s });
    }
  }
  // Drop any empty fragments produced by stripQuotes on a bare quote-only line.
  return out.filter((s) => s.text.trim().length > 0);
}
