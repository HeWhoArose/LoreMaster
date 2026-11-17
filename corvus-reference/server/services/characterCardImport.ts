/**
 * SillyTavern / chub.ai character card import.
 *
 * Supports:
 *   - PNG character cards (V1, V2, V3) with metadata embedded as a tEXt chunk
 *     (keyword 'chara' for V1/V2 with base64-encoded JSON, 'ccv3' for V3).
 *   - Raw .json card files (both bare V1 shape and V2 spec wrapper).
 *
 * Does NOT yet support .charx (zipped V3) — chub.ai PNGs cover the vast majority
 * of cards in the wild.
 *
 * The output is a partial NPCCharacter shape ready to merge into our manual form.
 */
import { NPCCharacter } from '../types/index.js';

/** Raw fields from a parsed card, before mapping into our NPC shape. */
export interface RawCharacterCard {
  /** Where the card came from (for logging / debugging). */
  source: 'png-v1' | 'png-v2' | 'png-v3' | 'json-v1' | 'json-v2' | 'json-v3';
  name?: string;
  description?: string;
  personality?: string;
  scenario?: string;
  first_mes?: string;
  mes_example?: string;
  creator_notes?: string;
  tags?: string[];
  system_prompt?: string;
  alternate_greetings?: string[];
}

/** Result of parsing a card file. */
export interface ParsedCharacterCard {
  raw: RawCharacterCard;
  npc: Partial<NPCCharacter>;
}

/** PNG signature: 137 80 78 71 13 10 26 10 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Read all tEXt chunks from a PNG. Returns a map of keyword → text.
 *
 * PNG chunk format:
 *   [4 bytes length][4 bytes type][length bytes data][4 bytes CRC]
 *
 * For tEXt:
 *   data = keyword (Latin-1, null-terminated) + text (Latin-1)
 */
function readPngTextChunks(png: Buffer): Record<string, string> {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a PNG file (missing PNG signature).');
  }

  const chunks: Record<string, string> = {};
  let offset = 8;

  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd + 4 > png.length) break; // malformed; stop gracefully

    if (type === 'tEXt') {
      const data = png.subarray(dataStart, dataEnd);
      // Keyword is null-terminated Latin-1 (we read as latin1).
      const nullByte = data.indexOf(0);
      if (nullByte > 0) {
        const keyword = data.toString('latin1', 0, nullByte);
        const text = data.toString('latin1', nullByte + 1);
        chunks[keyword] = text;
      }
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4; // skip CRC
  }

  return chunks;
}

/** Decode a base64-encoded card payload as UTF-8 JSON. */
function decodeBase64Json(b64: string): unknown {
  // The text we read from tEXt was Latin-1; base64 chars are 7-bit so this is safe.
  const cleaned = b64.replace(/\s+/g, '');
  const json = Buffer.from(cleaned, 'base64').toString('utf-8');
  return JSON.parse(json);
}

/**
 * Normalize any of the known card shapes (V1 flat, V2 wrapper, V3 wrapper)
 * into a flat RawCharacterCard.
 */
function normalizeCardJson(parsed: unknown, hint: 'png' | 'json'): RawCharacterCard {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Card JSON is not an object.');
  }
  const obj = parsed as Record<string, any>;

  // V3 spec: { spec: "chara_card_v3", data: {...} }
  if (obj.spec === 'chara_card_v3' && obj.data && typeof obj.data === 'object') {
    const d = obj.data as Record<string, any>;
    return {
      source: hint === 'png' ? 'png-v3' : 'json-v3',
      name: stringOrUndef(d.name),
      description: stringOrUndef(d.description),
      personality: stringOrUndef(d.personality),
      scenario: stringOrUndef(d.scenario),
      first_mes: stringOrUndef(d.first_mes),
      mes_example: stringOrUndef(d.mes_example),
      creator_notes: stringOrUndef(d.creator_notes),
      tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : undefined,
      system_prompt: stringOrUndef(d.system_prompt),
      alternate_greetings: Array.isArray(d.alternate_greetings)
        ? d.alternate_greetings.filter((g) => typeof g === 'string')
        : undefined,
    };
  }

  // V2 spec: { spec: "chara_card_v2", data: {...} }
  if (obj.spec === 'chara_card_v2' && obj.data && typeof obj.data === 'object') {
    const d = obj.data as Record<string, any>;
    return {
      source: hint === 'png' ? 'png-v2' : 'json-v2',
      name: stringOrUndef(d.name),
      description: stringOrUndef(d.description),
      personality: stringOrUndef(d.personality),
      scenario: stringOrUndef(d.scenario),
      first_mes: stringOrUndef(d.first_mes),
      mes_example: stringOrUndef(d.mes_example),
      creator_notes: stringOrUndef(d.creator_notes),
      tags: Array.isArray(d.tags) ? d.tags.filter((t) => typeof t === 'string') : undefined,
      system_prompt: stringOrUndef(d.system_prompt),
      alternate_greetings: Array.isArray(d.alternate_greetings)
        ? d.alternate_greetings.filter((g) => typeof g === 'string')
        : undefined,
    };
  }

  // V1 flat shape — fields live at top level.
  return {
    source: hint === 'png' ? 'png-v1' : 'json-v1',
    name: stringOrUndef(obj.name),
    description: stringOrUndef(obj.description),
    personality: stringOrUndef(obj.personality),
    scenario: stringOrUndef(obj.scenario),
    first_mes: stringOrUndef(obj.first_mes),
    mes_example: stringOrUndef(obj.mes_example),
    creator_notes: stringOrUndef(obj.creator_notes),
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t: unknown) => typeof t === 'string') : undefined,
    system_prompt: stringOrUndef(obj.system_prompt),
    alternate_greetings: Array.isArray(obj.alternate_greetings)
      ? obj.alternate_greetings.filter((g: unknown) => typeof g === 'string')
      : undefined,
  };
}

function stringOrUndef(x: unknown): string | undefined {
  if (typeof x !== 'string') return undefined;
  const trimmed = x.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Heuristically split a chub.ai-style `description` blob into a short visual
 * appearance line and a longer background blob. Most chub cards shove
 * EVERYTHING (personality, history, lore, kinks, etc.) into `description`, so
 * naively mapping `description → appearance` produces the bug where the
 * appearance section is a wall of text.
 *
 * Strategy: look for a leading "Appearance:" / "Looks:" / "Physical:" section.
 * If found, that section goes to appearance and the rest goes to background.
 * Otherwise, if the blob is short (≤ ~400 chars and no newlines), treat the
 * whole thing as appearance. Otherwise, everything goes to background and
 * appearance is left empty for the user to fill in.
 */
function splitDescription(
  description: string
): { appearance: string; background: string } {
  const text = description.trim();
  if (!text) return { appearance: '', background: '' };

  // Look for a labeled appearance block.
  const labelRegex =
    /^(?:\*\*|__)?\s*(?:appearance|looks?|physical(?:\s+description)?|description)\s*[:\-]?\s*(?:\*\*|__)?\s*$/im;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (labelRegex.test(lines[i].trim())) {
      // Take lines until next blank-line-separated section header or end.
      const after: string[] = [];
      for (let j = i + 1; j < lines.length; j++) {
        const t = lines[j].trim();
        // Stop at next labeled section: a short line ending with ':' or **header**.
        const isNextHeader =
          /^(?:\*\*|__).+(?:\*\*|__)\s*[:\-]?\s*$/.test(t) ||
          (/^[A-Z][a-zA-Z /]{2,30}\s*:\s*$/.test(t) && t.length < 40);
        if (isNextHeader && after.length > 0) break;
        after.push(lines[j]);
      }
      const appearance = after.join('\n').trim();
      const beforeAndOther = [
        ...lines.slice(0, i),
        ...lines.slice(i + 1 + after.length),
      ]
        .join('\n')
        .trim();
      if (appearance) {
        return { appearance, background: beforeAndOther };
      }
    }
  }

  // No labeled appearance block. If the blob is short + single-paragraph,
  // treat it as a literal appearance line. Otherwise dump to background.
  if (text.length <= 400 && !/\n\s*\n/.test(text)) {
    return { appearance: text, background: '' };
  }
  return { appearance: '', background: text };
}

/**
 * Map a raw card to a partial NPCCharacter, keeping the field semantics aligned
 * with how corvus uses them:
 *
 *   name        → name
 *   description → split heuristically into appearance + background
 *                 (chub cards shove everything into description, so a naive
 *                  map produces a wall of "appearance" text)
 *   personality → personality
 *   scenario    → knownInfo (the meeting context / what the player knows)
 *   mes_example → voiceStyle (example dialogue is the best signal for voice)
 *   creator_notes → appended to background (flavor / OOC notes)
 *   system_prompt → appended to background as a "creator notes" tail
 *
 * `first_mes` and `alternate_greetings` are NOT mapped into the NPC — they
 * surface separately on the parsed result so the client can offer the user a
 * starting-message picker.
 */
export function mapCardToNpc(raw: RawCharacterCard): Partial<NPCCharacter> {
  const { appearance, background } = splitDescription(raw.description || '');

  // Compose background: heuristic split tail + scenario + creator_notes.
  const backgroundParts: string[] = [];
  if (background) backgroundParts.push(background);
  if (raw.scenario && raw.scenario !== background) {
    backgroundParts.push(`Scenario:\n${raw.scenario}`);
  }
  if (raw.creator_notes) backgroundParts.push(`Creator notes:\n${raw.creator_notes}`);

  const npc: Partial<NPCCharacter> = {
    name: raw.name || 'Imported Character',
    revealedName: null,
    appearance,
    personality: raw.personality || '',
    background: backgroundParts.join('\n\n').trim(),
    // knownInfo intentionally left empty — scenario already lives in background,
    // and the old behavior of stuffing first_mes here was redundant with the
    // new starting-message picker.
    knownInfo: '',
    dispositionTowardPlayer: 'neutral',
    memory: [],
    voiceStyle: raw.mes_example || '',
    image: {
      basePrompt: '',
      coreAppearance: '',
      baseNegative: '',
      lastPrompt: null,
      lastSeed: null,
      identitySeed: null,
      portraitPath: null,
    },
  };

  return npc;
}

/** Combine first_mes + alternate_greetings into an ordered list of choices. */
export function extractGreetings(raw: RawCharacterCard): string[] {
  const list: string[] = [];
  if (raw.first_mes) list.push(raw.first_mes);
  if (raw.alternate_greetings) {
    for (const g of raw.alternate_greetings) {
      const t = g.trim();
      if (t && !list.includes(t)) list.push(t);
    }
  }
  return list;
}

/**
 * Parse a character card from a Buffer. Detects PNG vs JSON automatically.
 */
export function parseCharacterCard(file: Buffer, filename?: string): ParsedCharacterCard {
  // PNG?
  if (file.length >= 8 && file.subarray(0, 8).equals(PNG_SIGNATURE)) {
    const chunks = readPngTextChunks(file);
    // V3 takes precedence if both keys are present.
    const v3 = chunks['ccv3'];
    const v12 = chunks['chara'];
    const payload = v3 || v12;
    if (!payload) {
      throw new Error(
        'PNG does not contain a character card (no "chara" or "ccv3" tEXt chunk). ' +
          'Make sure this is a SillyTavern / chub.ai character card.'
      );
    }
    const parsed = decodeBase64Json(payload);
    const raw = normalizeCardJson(parsed, 'png');
    return { raw, npc: mapCardToNpc(raw) };
  }

  // JSON? Try to parse as text.
  const text = file.toString('utf-8').trim();
  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      const raw = normalizeCardJson(parsed, 'json');
      return { raw, npc: mapCardToNpc(raw) };
    } catch (err) {
      throw new Error(`Failed to parse JSON card: ${(err as Error).message}`);
    }
  }

  // Unknown — give a helpful hint.
  const hint = filename ? ` (filename: ${filename})` : '';
  throw new Error(
    `Unrecognized character card format${hint}. Supported: PNG with embedded metadata, or JSON.`
  );
}
