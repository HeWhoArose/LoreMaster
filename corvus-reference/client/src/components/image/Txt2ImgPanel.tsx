import React, { useState } from 'react';
import * as api from '../../api';
import type { ImageMetadata } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';

export interface Txt2ImgPanelProps {
  gameId: string | null;
  prompt: string;
  negativePrompt: string;
  generating: boolean;
  error: string | null;
  results: ImageMetadata[];
  batchCount: number;
  onChangePrompt: (v: string) => void;
  onChangeNegative: (v: string) => void;
  onGenerate: () => void;
  onNewSeed: () => void;
  onSendToImg2Img: (img: ImageMetadata) => void;
  onSendToInpaint: (img: ImageMetadata) => void;
  onSaveToChat?: (img: ImageMetadata) => void;
  onEditPromptFromResult: (img: ImageMetadata) => void;
  onOpenLightbox?: (img: ImageMetadata) => void;
}

export function Txt2ImgPanel({
  gameId,
  prompt,
  negativePrompt,
  generating,
  error,
  results,
  batchCount,
  onChangePrompt,
  onChangeNegative,
  onGenerate,
  onNewSeed,
  onSendToImg2Img,
  onSendToInpaint,
  onSaveToChat,
  onEditPromptFromResult,
  onOpenLightbox,
}: Txt2ImgPanelProps) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-xs text-text-muted mb-1 block">Prompt</span>
        <textarea
          value={prompt}
          rows={3}
          onChange={(e) => onChangePrompt(e.target.value)}
          className="w-full mono text-xs"
          placeholder="A detailed description of the image to generate…"
        />
      </label>
      <label className="block">
        <span className="text-xs text-text-muted mb-1 block">Negative prompt</span>
        <textarea
          value={negativePrompt}
          rows={2}
          onChange={(e) => onChangeNegative(e.target.value)}
          className="w-full mono text-xs"
          placeholder="Things to avoid (blurry, low quality, watermark…)"
        />
      </label>

      <div className="flex gap-2">
        <button
          className="btn btn-primary flex-1"
          onClick={onGenerate}
          disabled={generating || !prompt.trim() || !gameId}
        >
          {generating ? <LoadingSpinner size={16} label="Generating" /> : 'Generate'}
        </button>
        <button className="btn" onClick={onNewSeed} disabled={generating} title="Randomize seed">
          🎲 New seed
        </button>
      </div>

      {batchCount > 1 && (
        <div className="text-xs text-text-muted">Batch of {batchCount} images per generation</div>
      )}

      {error && (
        <div className="rounded border border-error text-error bg-error/10 px-3 py-2 text-xs">
          {error}
        </div>
      )}

      {results.length > 0 && gameId && (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-text-muted font-semibold">
            Latest results
          </div>
          <div className="grid grid-cols-2 gap-2">
            {results.map((img) => (
              <ResultCard
                key={img.id}
                gameId={gameId}
                img={img}
                onSendToImg2Img={onSendToImg2Img}
                onSendToInpaint={onSendToInpaint}
                onSaveToChat={onSaveToChat}
                onEditPrompt={onEditPromptFromResult}
                onOpenLightbox={onOpenLightbox}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export interface ResultCardProps {
  gameId: string;
  img: ImageMetadata;
  onSendToImg2Img: (img: ImageMetadata) => void;
  onSendToInpaint: (img: ImageMetadata) => void;
  onSaveToChat?: (img: ImageMetadata) => void;
  onEditPrompt: (img: ImageMetadata) => void;
  onOpenLightbox?: (img: ImageMetadata) => void;
}

export function ResultCard({
  gameId,
  img,
  onSendToImg2Img,
  onSendToInpaint,
  onSaveToChat,
  onEditPrompt,
  onOpenLightbox,
}: ResultCardProps) {
  const [showActions, setShowActions] = useState(false);
  const src = api.getImageURL(gameId, img.filename);

  return (
    <div
      className="card overflow-hidden"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <button
        className="block w-full aspect-square bg-surface"
        onClick={() => onOpenLightbox?.(img)}
      >
        <img src={src} alt={img.label || img.prompt} className="w-full h-full object-cover" />
      </button>
      <div className="p-1.5 space-y-1">
        <div className="flex flex-wrap gap-1">
          <button
            className="btn !py-1 !px-2 !text-[10px] flex-1"
            onClick={() => onSendToImg2Img(img)}
            title="Send to img2img"
          >
            → i2i
          </button>
          <button
            className="btn !py-1 !px-2 !text-[10px] flex-1"
            onClick={() => onSendToInpaint(img)}
            title="Send to inpaint"
          >
            → inpaint
          </button>
          <button
            className="btn !py-1 !px-2 !text-[10px] flex-1"
            onClick={() => onEditPrompt(img)}
            title="Copy prompt/settings"
          >
            ✏️
          </button>
          {onSaveToChat && (
            <button
              className="btn !py-1 !px-2 !text-[10px] flex-1"
              onClick={() => onSaveToChat(img)}
              title="Save reference to chat"
            >
              💬
            </button>
          )}
        </div>
        <div className="text-[10px] mono text-text-muted truncate" title={img.prompt}>
          seed {img.settings.seed}
        </div>
      </div>
    </div>
  );
}
