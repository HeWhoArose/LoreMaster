import React, { useMemo, useState } from 'react';
import * as api from '../../api';
import type { ImageMetadata } from '../../types';
import { Modal } from '../common/Modal';
import { ImageLightbox } from './ImageLightbox';

export interface ImageGalleryProps {
  gameId: string | null;
  images: ImageMetadata[];
  loading: boolean;
  open: boolean;
  onClose: () => void;
  onSendToImg2Img: (img: ImageMetadata) => void;
  onSendToInpaint: (img: ImageMetadata) => void;
  onSaveToChat?: (img: ImageMetadata) => void;
  onDelete: (imageId: string) => Promise<void> | void;
}

type Filter = 'all' | ImageMetadata['category'];
type Sort = 'newest' | 'oldest';

export function ImageGallery({
  gameId,
  images,
  loading,
  open,
  onClose,
  onSendToImg2Img,
  onSendToInpaint,
  onSaveToChat,
  onDelete,
}: ImageGalleryProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('newest');
  const [selected, setSelected] = useState<ImageMetadata | null>(null);

  const filtered = useMemo(() => {
    let list = images.slice();
    if (filter !== 'all') list = list.filter((i) => i.category === filter);
    list.sort((a, b) => {
      const cmp = (a.created || '').localeCompare(b.created || '');
      return sort === 'newest' ? -cmp : cmp;
    });
    return list;
  }, [images, filter, sort]);

  return (
    <>
      <Modal open={open} onClose={onClose} title="Image Gallery" size="xl">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <div className="flex gap-1">
            {(['all', 'character', 'scene', 'item', 'other'] as Filter[]).map((f) => (
              <button
                key={f}
                className={`btn !py-1 !px-2 !text-xs capitalize ${
                  filter === f ? 'btn-primary' : ''
                }`}
                onClick={() => setFilter(f)}
              >
                {f === 'all' ? 'All' : `${f}s`}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="text-text-muted">Sort:</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>

        {loading && <div className="text-center text-sm text-text-muted py-8">Loading…</div>}

        {!loading && filtered.length === 0 && (
          <div className="text-center text-sm text-text-muted py-8">
            No images yet. Generate one in the image studio.
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
          {gameId &&
            filtered.map((img) => (
              <button
                key={img.id}
                className="card overflow-hidden text-left hover:border-accent transition-colors"
                onClick={() => setSelected(img)}
              >
                <div className="aspect-square bg-surface">
                  <img
                    src={api.getImageURL(gameId, img.filename)}
                    alt={img.label || img.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
                <div className="p-1.5">
                  <div className="text-[11px] text-text-primary truncate">
                    {img.label || img.prompt.slice(0, 30)}
                  </div>
                  <div className="text-[10px] text-text-muted flex items-center justify-between">
                    <span>{img.sourceMode}</span>
                    <span>{new Date(img.created).toLocaleDateString()}</span>
                  </div>
                </div>
              </button>
            ))}
        </div>
      </Modal>

      <ImageLightbox
        gameId={gameId}
        image={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onSendToImg2Img={(i) => {
          onSendToImg2Img(i);
          setSelected(null);
          onClose();
        }}
        onSendToInpaint={(i) => {
          onSendToInpaint(i);
          setSelected(null);
          onClose();
        }}
        onSaveToChat={onSaveToChat}
        onDelete={async (i) => {
          await onDelete(i.id);
          setSelected(null);
        }}
      />
    </>
  );
}
