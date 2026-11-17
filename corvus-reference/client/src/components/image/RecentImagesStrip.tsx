import React, { useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import type { ImageMetadata } from '../../types';

export interface RecentImagesStripProps {
  gameId: string | null;
  images: ImageMetadata[];
  onOpen?: (image: ImageMetadata) => void;
  /** how many to show, default 4 */
  count?: number;
}

const MIN_WIDTH = 80;
const MAX_WIDTH = 320;
const DEFAULT_WIDTH = 140;
const STORAGE_KEY = 'corvus.recentImagesStrip.width';

/**
 * Floating strip of recent images. Hovers over the chat (doesn't push layout)
 * and only takes up as much vertical space as needed for the thumbnails.
 * The user can drag the left edge to resize.
 */
export function RecentImagesStrip({ gameId, images, onOpen, count = 4 }: RecentImagesStripProps) {
  const [width, setWidth] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_WIDTH;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const n = stored ? parseInt(stored, 10) : NaN;
    return Number.isFinite(n) && n >= MIN_WIDTH && n <= MAX_WIDTH ? n : DEFAULT_WIDTH;
  });
  const [collapsed, setCollapsed] = useState(false);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Persist width
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return;
      // Drag handle is on the LEFT edge — dragging left grows the strip
      const delta = startXRef.current - e.clientX;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + delta));
      setWidth(next);
    };
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
  };

  const recent = (images || []).slice(0, count);
  if (recent.length === 0 || !gameId) return null;

  if (collapsed) {
    return (
      <button
        className="absolute top-3 right-3 z-10 btn btn-ghost !py-1 !px-2 !text-[10px] bg-surface/80 backdrop-blur border border-border"
        onClick={() => setCollapsed(false)}
        title="Show recent images"
      >
        Recent ({recent.length})
      </button>
    );
  }

  return (
    <div
      className="absolute top-3 right-3 z-10 rounded-lg bg-surface/85 backdrop-blur border border-border shadow-lg flex flex-col"
      style={{ width }}
    >
      {/* Drag handle on left edge */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-ew-resize hover:bg-accent/30 transition-colors rounded-l-lg"
        onMouseDown={startDrag}
        title="Drag to resize"
      />

      <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
        <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold">
          Recent
        </div>
        <button
          className="text-text-muted hover:text-text-primary text-[14px] leading-none px-1"
          onClick={() => setCollapsed(true)}
          title="Hide"
        >
          ×
        </button>
      </div>

      <div className="p-2 space-y-2">
        {recent.map((img) => (
          <button
            key={img.id}
            className="block w-full aspect-[3/4] bg-surface-2 border border-border rounded overflow-hidden hover:border-accent transition-colors"
            onClick={() => onOpen?.(img)}
            title={img.prompt}
          >
            <img
              src={api.getImageURL(gameId, img.filename)}
              alt={img.prompt?.slice(0, 40) || 'recent image'}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
