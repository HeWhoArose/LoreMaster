// The shell's artwork presentation layer (docs/phase1-design-specification.md §5.4 and §11). A picture has a slot —
// what it is for — and this file decides how that slot is framed: its aspect at the wide layout, its aspect once
// cards stack, and which edge its copy sits on. Pictures are cinematic illustrations authored for the shell; the
// game's pixel art is a different family and is never referenced from here.
//
// The records are plain data so a content pack can point a slot at an authored file without touching the shell, and
// so a slot with no file still has a defined frame: the shell's own fallback treatment, never a broken picture.

/** The kinds of picture the shell shows. */
export type ArtworkKind = 'world-cover' | 'story-cover' | 'library-thumb' | 'act-cover'

/** A picture the shell may show, and what a reader needs to know about it. */
export interface ArtworkRef {
  /** Path from the client's public root. */
  src: string
  /** Who made it, in the form the project records assets. */
  credit: string
  /** What it may be used for. */
  license: string
  /** The point a crop keeps in frame, in per cent of width and height. */
  focal?: [number, number]
}

/** How one slot is framed. */
export interface ArtworkSlot {
  kind: ArtworkKind
  /** The frame at the wide layout. */
  aspect: string
  /** The frame once cards stack (narrower than 860px): wider, because the picture takes the full width. */
  narrowAspect: string
  /** Which edge the copy sits on, so the overlay darkens toward it. */
  overlay: 'bottom' | 'inline-end' | 'none'
}

export const ARTWORK_SLOTS: Record<ArtworkKind, ArtworkSlot> = {
  // World covers are the shelf's own portrait: a place, not a moment.
  'world-cover': { kind: 'world-cover', aspect: '4 / 3', narrowAspect: '16 / 9', overlay: 'inline-end' },
  // The featured story's cover: a moment of the story the save is in.
  'story-cover': { kind: 'story-cover', aspect: '16 / 10', narrowAspect: '16 / 9', overlay: 'bottom' },
  // A library row's thumbnail: the same picture, cropped square and small.
  'library-thumb': { kind: 'library-thumb', aspect: '1 / 1', narrowAspect: '16 / 9', overlay: 'bottom' },
  // An act's illustration (contracts.ts ACT_COVER): the act being played, never a recap.
  'act-cover': { kind: 'act-cover', aspect: '16 / 9', narrowAspect: '16 / 9', overlay: 'bottom' },
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/**
 * One picture in its frame. The frame is always rendered: with a file it holds the image over its fallback, and
 * without one (or if the file fails to load) the fallback alone carries the card. Decorative by design — every
 * card names what it shows in its own text — so the picture is hidden from assistive reading.
 */
export function artMarkup(ref: ArtworkRef | undefined, kind: ArtworkKind): string {
  const slot = ARTWORK_SLOTS[kind]
  const focus = ref?.focal ? `${ref.focal[0]}% ${ref.focal[1]}%` : '50% 50%'
  const style = `--lm-art-aspect:${slot.aspect};--lm-art-narrow:${slot.narrowAspect};--lm-art-focus:${focus}`
  // Eager and async-decoded: a card's cover is above the fold, and a lazy frame can paint empty while it decodes.
  const img = ref ? `<img class="lm-art-img" src="${esc(ref.src)}" alt="" decoding="async" />` : ''
  return `<div class="lm-art${ref ? '' : ' missing'}" data-kind="${esc(kind)}" data-overlay="${esc(slot.overlay)}" style="${esc(style)}" aria-hidden="true">${img}<span class="lm-art-fallback"><span class="lm-card-glyph"></span></span></div>`
}
