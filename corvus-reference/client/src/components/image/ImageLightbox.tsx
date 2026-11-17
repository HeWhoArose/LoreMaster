import React, { useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import type { ImageMetadata, NPCCharacter } from '../../types';
import { Modal } from '../common/Modal';

export interface ImageLightboxProps {
  gameId: string | null;
  image: ImageMetadata | null;
  open: boolean;
  onClose: () => void;
  onSendToImg2Img?: (img: ImageMetadata) => void;
  onSendToInpaint?: (img: ImageMetadata) => void;
  onSaveToChat?: (img: ImageMetadata) => void;
  onDelete?: (img: ImageMetadata) => void;
  siblings?: ImageMetadata[];
  /**
   * v1.1.22: called after the image has been promoted to an NPC's portrait,
   * so callers can refresh their NPC list / character cache.
   */
  onPortraitSet?: (npcId: string) => void;
}

export function ImageLightbox({
  gameId,
  image,
  open,
  onClose,
  onSendToImg2Img,
  onSendToInpaint,
  onSaveToChat,
  onDelete,
  siblings,
  onPortraitSet,
}: ImageLightboxProps) {
  // Track current index within siblings
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  // v1.1.22: "Set as portrait" dropdown state.
  const [npcs, setNpcs] = useState<NPCCharacter[]>([]);
  const [npcsLoaded, setNpcsLoaded] = useState(false);
  const [portraitMenuOpen, setPortraitMenuOpen] = useState(false);
  const [settingPortraitFor, setSettingPortraitFor] = useState<string | null>(null);
  const [portraitError, setPortraitError] = useState<string | null>(null);
  const portraitMenuRef = useRef<HTMLDivElement | null>(null);

  // Lazy-load NPC list the first time the lightbox opens (in this session).
  useEffect(() => {
    if (!open || !gameId || npcsLoaded) return;
    let cancelled = false;
    api
      .listCharacters(gameId)
      .then((list) => {
        if (!cancelled) {
          setNpcs(list);
          setNpcsLoaded(true);
        }
      })
      .catch(() => {
        // non-fatal — just means the portrait menu shows empty
        if (!cancelled) setNpcsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, gameId, npcsLoaded]);

  // Close portrait menu on outside click.
  useEffect(() => {
    if (!portraitMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (portraitMenuRef.current && !portraitMenuRef.current.contains(e.target as Node)) {
        setPortraitMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [portraitMenuOpen]);

  // When the initial image or siblings change, reset the index to match the initial image
  useEffect(() => {
    if (!siblings || siblings.length === 0 || !image) {
      setCurrentIndex(0);
      return;
    }
    const idx = siblings.findIndex((s) => s.id === image.id);
    setCurrentIndex(idx >= 0 ? idx : 0);
  }, [image, siblings]);

  // Determine the currently displayed image
  const currentImage =
    siblings && siblings.length > 0 ? siblings[currentIndex] ?? image : image;

  const hasSiblings = siblings && siblings.length > 1;

  // Arrow key navigation
  useEffect(() => {
    if (!open || !hasSiblings) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((prev) => Math.min((siblings?.length ?? 1) - 1, prev + 1));
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, hasSiblings, siblings]);

  if (!currentImage || !gameId) return null;
  const src = api.getImageURL(gameId, currentImage.filename);

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  };

  const download = async () => {
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentImage.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      window.open(src, '_blank');
    }
  };

  const goToPrev = () => setCurrentIndex((prev) => Math.max(0, prev - 1));
  const goToNext = () =>
    setCurrentIndex((prev) => Math.min((siblings?.length ?? 1) - 1, prev + 1));

  return (
    <Modal open={open} onClose={onClose} title={currentImage.label || currentImage.filename} size="xl" closeOnBackdrop>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Image area with prev/next navigation */}
        <div className="lg:col-span-3 flex flex-col items-center gap-2">
          <div className="relative flex items-center justify-center bg-bg rounded overflow-hidden w-full">
            {hasSiblings && (
              <button
                className="absolute left-2 z-10 btn btn-ghost !p-1.5 bg-surface/80 hover:bg-surface"
                onClick={goToPrev}
                disabled={currentIndex === 0}
                aria-label="Previous image"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <img src={src} alt={currentImage.label} className="max-w-full max-h-[70vh] object-contain" />
            {hasSiblings && (
              <button
                className="absolute right-2 z-10 btn btn-ghost !p-1.5 bg-surface/80 hover:bg-surface"
                onClick={goToNext}
                disabled={currentIndex === (siblings?.length ?? 1) - 1}
                aria-label="Next image"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>
          {hasSiblings && (
            <div className="text-xs text-text-muted mono">
              {currentIndex + 1} / {siblings!.length}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 text-sm space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-muted mb-1">
              <span>Prompt</span>
              <button className="btn btn-ghost !py-0.5 !px-1 !text-[10px]" onClick={() => copy(currentImage.prompt)}>
                Copy
              </button>
            </div>
            <div className="mono text-xs bg-surface-2 border border-border p-2 rounded whitespace-pre-wrap">
              {currentImage.prompt || <span className="text-text-muted italic">(empty)</span>}
            </div>
          </div>

          {currentImage.negativePrompt && (
            <div>
              <div className="flex items-center justify-between text-xs uppercase tracking-wider text-text-muted mb-1">
                <span>Negative</span>
                <button
                  className="btn btn-ghost !py-0.5 !px-1 !text-[10px]"
                  onClick={() => copy(currentImage.negativePrompt)}
                >
                  Copy
                </button>
              </div>
              <div className="mono text-xs bg-surface-2 border border-border p-2 rounded whitespace-pre-wrap">
                {currentImage.negativePrompt}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wider text-text-muted mb-1">Settings</div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
              <Info label="Mode" value={currentImage.sourceMode} />
              <Info label="Model" value={currentImage.settings.model} mono />
              <Info label="Sampler" value={currentImage.settings.sampler} />
              <Info label="Scheduler" value={currentImage.settings.scheduler} />
              <Info label="Steps" value={currentImage.settings.steps} mono />
              <Info label="CFG" value={currentImage.settings.cfg} mono />
              <Info
                label="Size"
                value={`${currentImage.settings.width}×${currentImage.settings.height}`}
                mono
              />
              <Info label="Seed" value={currentImage.settings.seed} mono />
              {currentImage.settings.denoiseStrength !== null &&
                currentImage.settings.denoiseStrength !== undefined && (
                  <Info label="Denoise" value={currentImage.settings.denoiseStrength} mono />
                )}
              <Info label="Category" value={currentImage.category} />
              <Info label="Created" value={new Date(currentImage.created).toLocaleString()} />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            {onSendToImg2Img && (
              <button className="btn" onClick={() => onSendToImg2Img(currentImage)}>
                → Img2Img
              </button>
            )}
            {onSendToInpaint && (
              <button className="btn" onClick={() => onSendToInpaint(currentImage)}>
                → Inpaint
              </button>
            )}
            {onSaveToChat && (
              <button className="btn" onClick={() => onSaveToChat(currentImage)}>
                Save to chat
              </button>
            )}
            {/* v1.1.22: Set as portrait — promotes this image to an NPC's icon. */}
            <div className="relative" ref={portraitMenuRef}>
              <button
                className="btn"
                onClick={() => {
                  setPortraitError(null);
                  setPortraitMenuOpen((v) => !v);
                }}
                disabled={!!settingPortraitFor}
                title="Promote this image to a character's portrait icon"
              >
                {settingPortraitFor ? 'Saving…' : 'Set as portrait ▾'}
              </button>
              {portraitMenuOpen && (
                <div className="absolute right-0 bottom-full mb-1 z-50 w-64 max-h-64 overflow-y-auto rounded border border-border bg-surface-1 shadow-lg">
                  {npcs.length === 0 ? (
                    <div className="px-3 py-2 text-xs text-text-muted italic">
                      {npcsLoaded ? 'No characters in this game yet.' : 'Loading…'}
                    </div>
                  ) : (
                    <ul className="py-1">
                      {npcs.map((n) => (
                        <li key={n.id}>
                          <button
                            className="w-full text-left px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-50 disabled:hover:bg-transparent"
                            disabled={!!settingPortraitFor}
                            onClick={async () => {
                              if (!gameId) return;
                              setSettingPortraitFor(n.id);
                              setPortraitError(null);
                              try {
                                await api.setImageAsPortrait(gameId, currentImage.id, n.id);
                                setPortraitMenuOpen(false);
                                onPortraitSet?.(n.id);
                              } catch (err: any) {
                                setPortraitError(err?.message || 'Failed to set portrait');
                              } finally {
                                setSettingPortraitFor(null);
                              }
                            }}
                          >
                            <div className="text-text-primary">
                              {n.revealedName || n.name}
                            </div>
                            {n.image?.portraitPath && (
                              <div className="text-[10px] text-text-muted">
                                replaces current portrait
                              </div>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {portraitError && (
                    <div className="px-3 py-1.5 text-xs text-red-400 border-t border-border">
                      {portraitError}
                    </div>
                  )}
                </div>
              )}
            </div>
            <button className="btn" onClick={() => copy(currentImage.prompt)}>
              Copy prompt
            </button>
            <button className="btn" onClick={download}>
              Download
            </button>
            {onDelete && (
              <button className="btn btn-danger" onClick={() => onDelete(currentImage)}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <>
      <span className="text-text-muted">{label}</span>
      <span className={mono ? 'mono text-text-primary' : 'text-text-primary'}>{value}</span>
    </>
  );
}
