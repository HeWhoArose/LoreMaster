// Helpers for deriving stable, distinct chat colors for characters who
// haven't picked a custom one yet.
//
// We use a fixed palette and hash the character id into the palette so the
// "default" color is deterministic per-NPC and stays consistent across
// sessions, edits, and reloads.

import type { GlobalConfig, NPCCharacter } from '../types';

/**
 * Palette used to assign default colors to NPCs with no explicit chatColor.
 * Chosen to read well on the dark surface (#22222e) and to feel visually
 * distinct from each other and from the narrator color.
 */
export const DEFAULT_CHARACTER_PALETTE: ReadonlyArray<string> = [
  '#60a5fa', // sky blue
  '#a78bfa', // light purple
  '#f472b6', // pink
  '#fbbf24', // amber
  '#4ade80', // green
  '#22d3ee', // cyan
  '#fb7185', // rose
  '#fde047', // yellow
  '#c084fc', // bright lavender
  '#34d399', // teal
];

/** Fallback color when a character ID is missing entirely. */
export const FALLBACK_CHARACTER_COLOR = '#60a5fa';

/** Deterministic 32-bit FNV-1a hash → palette index. */
function hashToIndex(input: string, modulo: number): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h % modulo;
}

/**
 * Returns the color to use for a character's speaker label / dialogue.
 *   - If the character has chatColor set, use it.
 *   - Otherwise, deterministically pick from the default palette by id.
 */
export function colorForCharacter(char: Pick<NPCCharacter, 'id' | 'chatColor'> | null | undefined): string {
  if (!char) return FALLBACK_CHARACTER_COLOR;
  if (char.chatColor) return char.chatColor;
  if (!char.id) return FALLBACK_CHARACTER_COLOR;
  const idx = hashToIndex(char.id, DEFAULT_CHARACTER_PALETTE.length);
  return DEFAULT_CHARACTER_PALETTE[idx];
}

/**
 * Returns the color to use for narrator-tagged text. Reads the global
 * appearance config; if unset, returns null so the consumer can fall back
 * to its CSS class.
 */
export function colorForNarrator(config: GlobalConfig | null | undefined): string | null {
  return config?.appearance?.narratorColor || null;
}

/**
 * Returns the color to use for italicized *action* text. Returns null
 * when no override is configured.
 */
export function colorForAction(config: GlobalConfig | null | undefined): string | null {
  return config?.appearance?.actionColor || null;
}
