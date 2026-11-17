import React, { useEffect, useMemo, useState } from 'react';
import * as api from '../../api';
import type { ImageMetadata, NPCCharacter } from '../../types';
import { Modal } from '../common/Modal';

/**
 * v1.1.31 — Pick an existing gallery image and set it as an NPC's portrait.
 *
 * Opened by clicking the portrait in the NPC card. Distinct from the image
 * studio: this is a read-only chooser. It calls `api.setImageAsPortrait`
 * (which hits POST /images/:imageId/send-to with target=npc), then asks the
 * parent to refresh the character via onPortraitSet.
 *
 * Image filtering: by default we show images linked to this NPC plus any
 * character-category images with no linked NPC (so the user can pick a freshly
 * generated portrait that hasn't been wired up yet). A "Show all" toggle lifts
 * the filter for cases where a scene image or other-category image is the one
 * the user wants.
 */
export interface PortraitPickerDialogProps {
  gameId: string | null;
  character: NPCCharacter | null;
  open: boolean;
  onClose: () => void;
  /** Called with the updated character after the portrait has been set. */
  onPortraitSet?: (character: NPCCharacter) => void;
}

export function PortraitPickerDialog({
  gameId,
  character,
  open,
  onClose,
  onPortraitSet,
}: PortraitPickerDialogProps) {
  const [images, setImages] = useState<ImageMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Load the gallery whenever the dialog opens for a specific game.
  useEffect(() => {
    if (!open || !gameId) {
      setImages([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .listImages(gameId)
      .then((imgs) => {
        if (!cancelled) setImages(imgs);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load images.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gameId]);

  // Default filter: this NPC's images + unlinked character images. Toggle
  // "Show all" to widen to literally every image in the game.
  const filtered = useMemo(() => {
    if (!character) return [];
    const list = images.slice();
    list.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
    if (showAll) return list;
    return list.filter((img) => {
      if (img.linkedNpc === character.id) return true;
      if (!img.linkedNpc && img.category === 'character') return true;
      return false;
    });
  }, [images, character, showAll]);

  if (!character) return null;

  const handlePick = async (img: ImageMetadata) => {
    if (!gameId || applyingId) return;
    setApplyingId(img.id);
    setError(null);
    try {
      await api.setImageAsPortrait(gameId, img.id, character.id);
      // Re-fetch the character so we get the canonical state from the server
      // (setImageAsPortrait does not return the updated NPC).
      const updated = await api.getCharacter(gameId, character.id);
      if (updated && onPortraitSet) onPortraitSet(updated);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to set portrait.');
    } finally {
      setApplyingId(null);
    }
  };

  const displayName = character.revealedName || character.name || 'Character';

  return (
    <Modal open={open} onClose={onClose} title={`Pick portrait \u2014 ${displayName}`} size="xl">
      <div className="flex items-center gap-2 mb-3">
        <div className="text-xs text-text-muted">
          {showAll
            ? 'Showing every image in this game.'
            : 'Showing this character\u2019s images and unassigned character images.'}
        </div>
        <button
          type="button"
          className="btn btn-ghost !text-xs ml-auto"
          onClick={() => setShowAll((s) => !s)}
        >
          {showAll ? 'Show character only' : 'Show all images'}
        </button>
      </div>

      {error && (
        <div className="text-xs text-error mb-2 p-2 bg-error/10 rounded border border-error/30">
          {error}
        </div>
      )}

      {loading && (
        <div className="text-center text-sm text-text-muted py-8">Loading\u2026</div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center text-sm text-text-muted py-8">
          No matching images yet. Generate a portrait in the image studio, then come back.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {gameId &&
          filtered.map((img) => {
            const isCurrent = character.image?.portraitPath === img.filename;
            const isApplying = applyingId === img.id;
            return (
              <button
                key={img.id}
                type="button"
                disabled={!!applyingId}
                onClick={() => handlePick(img)}
                title={img.label || img.prompt}
                className={`card overflow-hidden text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isCurrent
                    ? 'ring-2 ring-accent border-accent'
                    : 'hover:border-accent'
                }`}
              >
                <div className="aspect-square bg-surface relative">
                  <img
                    src={api.getImageURL(gameId, img.filename)}
                    alt={img.label || img.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {isCurrent && (
                    <div className="absolute top-1 left-1 bg-accent text-accent-foreground text-[10px] px-1.5 py-0.5 rounded">
                      current
                    </div>
                  )}
                  {isApplying && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white">
                      Setting\u2026
                    </div>
                  )}
                </div>
                <div className="p-1.5">
                  <div className="text-[11px] text-text-primary truncate">
                    {img.label || img.prompt.slice(0, 30)}
                  </div>
                  <div className="text-[10px] text-text-muted flex items-center justify-between">
                    <span>{img.category}</span>
                    <span>{new Date(img.created).toLocaleDateString()}</span>
                  </div>
                </div>
              </button>
            );
          })}
      </div>
    </Modal>
  );
}
