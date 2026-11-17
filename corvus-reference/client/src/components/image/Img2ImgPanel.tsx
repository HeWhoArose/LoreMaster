import React, { useRef } from 'react';
import type { ImageMetadata, ImageSettings } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ResultCard } from './Txt2ImgPanel';

export interface Img2ImgPanelProps {
  gameId: string | null;
  prompt: string;
  negativePrompt: string;
  settings: ImageSettings;
  sourceImageURL: string | null;
  sourceImageData: string | null;
  generating: boolean;
  error: string | null;
  results: ImageMetadata[];
  onChangePrompt: (v: string) => void;
  onChangeNegative: (v: string) => void;
  onChangeSettings: (patch: Partial<ImageSettings>) => void;
  onChangeSource: (data: { data?: string | null; url?: string | null; id?: string | null }) => void;
  onGenerate: () => void;
  onNewSeed: () => void;
  onSendToImg2Img: (img: ImageMetadata) => void;
  onSendToInpaint: (img: ImageMetadata) => void;
  onSaveToChat?: (img: ImageMetadata) => void;
  onEditPromptFromResult: (img: ImageMetadata) => void;
  onOpenLightbox?: (img: ImageMetadata) => void;
}

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function Img2ImgPanel(props: Img2ImgPanelProps) {
  const {
    gameId,
    prompt,
    negativePrompt,
    settings,
    sourceImageURL,
    sourceImageData,
    generating,
    error,
    results,
    onChangePrompt,
    onChangeNegative,
    onChangeSettings,
    onChangeSource,
    onGenerate,
    onNewSeed,
    onSendToImg2Img,
    onSendToInpaint,
    onSaveToChat,
    onEditPromptFromResult,
    onOpenLightbox,
  } = props;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const displayURL = sourceImageData || sourceImageURL;

  const handleFile = async (file: File) => {
    const data = await fileToDataURL(file);
    onChangeSource({ data, url: null, id: null });
  };

  return (
    <div className="space-y-3">
      <div
        className="card p-0 overflow-hidden aspect-video bg-surface flex items-center justify-center relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) await handleFile(file);
        }}
      >
        {displayURL ? (
          <img
            src={displayURL}
            alt="Source"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <button
            className="btn btn-ghost flex flex-col items-center gap-2 text-text-muted !py-6 !px-6"
            onClick={() => fileInputRef.current?.click()}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <div className="text-sm">Click or drop an image</div>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) await handleFile(file);
            e.target.value = '';
          }}
        />
        {displayURL && (
          <div className="absolute top-1 right-1 flex gap-1">
            <button
              className="btn !py-1 !px-2 !text-xs"
              onClick={() => fileInputRef.current?.click()}
              title="Replace"
            >
              Replace
            </button>
            <button
              className="btn !py-1 !px-2 !text-xs"
              onClick={() => onChangeSource({ data: null, url: null, id: null })}
              title="Clear"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between text-xs text-text-muted mb-1">
          <span>Denoise strength</span>
          <span className="mono text-text-primary">{settings.denoiseStrength?.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={settings.denoiseStrength ?? 0.65}
          onChange={(e) => onChangeSettings({ denoiseStrength: Number(e.target.value) })}
        />
        <div className="text-[10px] text-text-muted">
          Lower = closer to source, higher = more creative
        </div>
      </div>

      <label className="block">
        <span className="text-xs text-text-muted mb-1 block">Prompt</span>
        <textarea
          value={prompt}
          rows={3}
          onChange={(e) => onChangePrompt(e.target.value)}
          className="w-full mono text-xs"
        />
      </label>
      <label className="block">
        <span className="text-xs text-text-muted mb-1 block">Negative prompt</span>
        <textarea
          value={negativePrompt}
          rows={2}
          onChange={(e) => onChangeNegative(e.target.value)}
          className="w-full mono text-xs"
        />
      </label>

      <div className="flex gap-2">
        <button
          className="btn btn-primary flex-1"
          onClick={onGenerate}
          disabled={generating || !prompt.trim() || !gameId || !displayURL}
        >
          {generating ? <LoadingSpinner size={16} label="Generating" /> : 'Generate'}
        </button>
        <button className="btn" onClick={onNewSeed} disabled={generating}>
          🎲 New seed
        </button>
      </div>

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
