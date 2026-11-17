import React, { useEffect, useRef, useState } from 'react';
import type { ImageMetadata, ImageSettings } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { ResultCard } from './Txt2ImgPanel';

export interface InpaintPanelProps {
  gameId: string | null;
  prompt: string;
  negativePrompt: string;
  settings: ImageSettings;
  sourceImageURL: string | null;
  sourceImageData: string | null;
  maskData: string | null;
  generating: boolean;
  error: string | null;
  results: ImageMetadata[];
  onChangePrompt: (v: string) => void;
  onChangeNegative: (v: string) => void;
  onChangeSettings: (patch: Partial<ImageSettings>) => void;
  onChangeSource: (data: { data?: string | null; url?: string | null; id?: string | null }) => void;
  onChangeMask: (mask: string | null) => void;
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

export function InpaintPanel(props: InpaintPanelProps) {
  const {
    gameId,
    prompt,
    negativePrompt,
    settings,
    sourceImageURL,
    sourceImageData,
    maskData,
    generating,
    error,
    results,
    onChangePrompt,
    onChangeNegative,
    onChangeSettings,
    onChangeSource,
    onChangeMask,
    onGenerate,
    onNewSeed,
    onSendToImg2Img,
    onSendToInpaint,
    onSaveToChat,
    onEditPromptFromResult,
    onOpenLightbox,
  } = props;

  const displayURL = sourceImageData || sourceImageURL;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const imageCanvasRef = useRef<HTMLCanvasElement>(null); // Source image (bottom layer)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null); // Actual mask (black/white) - hidden, used for export
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null); // Visible overlay (semi-transparent)
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [brushSize, setBrushSize] = useState(24);
  const [drawing, setDrawing] = useState(false);
  const [imageSize, setImageSize] = useState<{ w: number; h: number } | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  // Track which displayURL the canvases were last initialized for. We only
  // want to clear the mask when the SOURCE changes — not on every remount
  // (e.g. switching tabs and coming back).
  const initializedFor = useRef<string | null>(null);

  // Load image onto canvases whenever source changes
  useEffect(() => {
    if (!displayURL) {
      setImageSize(null);
      setDisplaySize(null);
      initializedFor.current = null;
      return;
    }
    const sourceChanged = initializedFor.current !== displayURL;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      setImageSize({ w, h });

      // Compute display size — fit into wrapper (max width), preserve aspect
      const wrapperW = wrapperRef.current?.clientWidth || 320;
      const scale = Math.min(1, wrapperW / w);
      const dw = Math.round(w * scale);
      const dh = Math.round(h * scale);
      setDisplaySize({ w: dw, h: dh });

      // Draw source image
      const imgCanvas = imageCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (imgCanvas && maskCanvas && overlayCanvas) {
        imgCanvas.width = w;
        imgCanvas.height = h;
        maskCanvas.width = w;
        maskCanvas.height = h;
        overlayCanvas.width = w;
        overlayCanvas.height = h;
        const imgCtx = imgCanvas.getContext('2d');
        if (imgCtx) {
          imgCtx.clearRect(0, 0, w, h);
          imgCtx.drawImage(img, 0, 0);
        }

        const maskCtx = maskCanvas.getContext('2d');
        const overlayCtx = overlayCanvas.getContext('2d');

        // Always start with a black-cleared mask canvas
        if (maskCtx) {
          maskCtx.fillStyle = 'black';
          maskCtx.fillRect(0, 0, w, h);
        }
        if (overlayCtx) {
          overlayCtx.clearRect(0, 0, w, h);
        }

        // If we have a saved mask AND the source didn't change (i.e. we're
        // remounting after switching tabs), restore the painted mask.
        if (!sourceChanged && maskData && maskCtx && overlayCtx) {
          const maskImg = new Image();
          maskImg.onload = () => {
            maskCtx.drawImage(maskImg, 0, 0, w, h);
            // Rebuild the visible overlay from the white pixels of the mask.
            // Simpler: paint a translucent version of the mask onto overlay.
            overlayCtx.save();
            overlayCtx.globalAlpha = 0.5;
            overlayCtx.fillStyle = 'rgb(124, 92, 191)';
            // Use the mask as a clipping source: draw a fill over the full
            // canvas, then keep only the parts that overlap white pixels of
            // the mask. We achieve this with a temporary composite.
            // Draw the mask into overlay first as the alpha source, then
            // change composite mode to color it.
            overlayCtx.globalCompositeOperation = 'source-over';
            overlayCtx.drawImage(maskImg, 0, 0, w, h);
            // Tint white pixels purple
            overlayCtx.globalCompositeOperation = 'source-in';
            overlayCtx.fillRect(0, 0, w, h);
            overlayCtx.restore();
          };
          maskImg.src = maskData;
        } else if (sourceChanged) {
          // Source genuinely changed — wipe any stale mask state
          onChangeMask(null);
        }
      }
      initializedFor.current = displayURL;
    };
    img.src = displayURL;
    // We deliberately exclude maskData from deps — we only want to RESTORE
    // it on remount, not redraw on every paint stroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayURL]);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const drawStroke = (x: number, y: number) => {
    const maskCanvas = maskCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!maskCanvas || !overlayCanvas) return;
    const maskCtx = maskCanvas.getContext('2d');
    const overlayCtx = overlayCanvas.getContext('2d');
    if (!maskCtx || !overlayCtx) return;

    // Scale brush size from display -> natural
    const naturalScale = maskCanvas.width / (displaySize?.w || maskCanvas.width);
    const radius = brushSize * naturalScale;

    const drawOne = (cx: number, cy: number) => {
      maskCtx.fillStyle = 'white';
      maskCtx.beginPath();
      maskCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      maskCtx.fill();

      overlayCtx.fillStyle = 'rgba(124, 92, 191, 0.5)';
      overlayCtx.beginPath();
      overlayCtx.arc(cx, cy, radius, 0, Math.PI * 2);
      overlayCtx.fill();
    };

    if (lastPt.current) {
      // Draw along the line from lastPt to (x,y)
      const dx = x - lastPt.current.x;
      const dy = y - lastPt.current.y;
      const dist = Math.hypot(dx, dy);
      const steps = Math.max(1, Math.ceil(dist / (radius / 2)));
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        drawOne(lastPt.current.x + dx * t, lastPt.current.y + dy * t);
      }
    } else {
      drawOne(x, y);
    }
    lastPt.current = { x, y };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageSize) return;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    setDrawing(true);
    lastPt.current = null;
    const { x, y } = getCanvasCoords(e);
    drawStroke(x, y);
  };

  const continueDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const { x, y } = getCanvasCoords(e);
    drawStroke(x, y);
  };

  const endDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).releasePointerCapture?.(e.pointerId);
    setDrawing(false);
    lastPt.current = null;
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    try {
      const data = maskCanvas.toDataURL('image/png');
      onChangeMask(data);
    } catch {
      /* ignore */
    }
  };

  const clearMask = () => {
    const maskCanvas = maskCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!maskCanvas || !overlayCanvas) return;
    const maskCtx = maskCanvas.getContext('2d');
    const overlayCtx = overlayCanvas.getContext('2d');
    if (maskCtx) {
      maskCtx.fillStyle = 'black';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    }
    if (overlayCtx) overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    onChangeMask(null);
  };

  const handleFile = async (file: File) => {
    const data = await fileToDataURL(file);
    onChangeSource({ data, url: null, id: null });
  };

  return (
    <div className="space-y-3">
      <div
        ref={wrapperRef}
        className="card p-0 overflow-hidden bg-surface flex items-center justify-center relative"
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          const file = e.dataTransfer.files?.[0];
          if (file) await handleFile(file);
        }}
        style={displaySize ? { height: displaySize.h } : undefined}
      >
        {displayURL ? (
          <div
            className="relative"
            style={{ width: displaySize?.w, height: displaySize?.h }}
          >
            <canvas
              ref={imageCanvasRef}
              style={{
                width: displaySize?.w,
                height: displaySize?.h,
                position: 'absolute',
                inset: 0,
                imageRendering: 'auto',
              }}
            />
            <canvas
              ref={overlayCanvasRef}
              style={{
                width: displaySize?.w,
                height: displaySize?.h,
                position: 'absolute',
                inset: 0,
                cursor: 'crosshair',
                touchAction: 'none',
              }}
              onPointerDown={startDraw}
              onPointerMove={continueDraw}
              onPointerUp={endDraw}
              onPointerLeave={endDraw}
            />
            {/* Hidden mask for export only */}
            <canvas ref={maskCanvasRef} style={{ display: 'none' }} />
          </div>
        ) : (
          <button
            className="btn btn-ghost flex flex-col items-center gap-2 text-text-muted !py-8 !px-6"
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
            <div className="text-sm">Click or drop an image to inpaint</div>
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
      </div>

      {displayURL && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                <span>Brush size</span>
                <span className="mono text-text-primary">{brushSize}px</span>
              </div>
              <input
                type="range"
                min={2}
                max={120}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
              />
            </div>
            <button className="btn" onClick={clearMask} title="Clear mask">
              Clear mask
            </button>
            <button
              className="btn"
              onClick={() => onChangeSource({ data: null, url: null, id: null })}
              title="Remove image"
            >
              Remove
            </button>
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
              value={settings.denoiseStrength ?? 0.75}
              onChange={(e) => onChangeSettings({ denoiseStrength: Number(e.target.value) })}
            />
          </div>
        </>
      )}

      <label className="block">
        <span className="text-xs text-text-muted mb-1 block">Prompt (for masked region)</span>
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
