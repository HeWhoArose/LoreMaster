import React, { useEffect, useRef, useState } from 'react';
import {
  fromImage,
  getVisionStatus,
  type CharacterDraft,
  type DesignDraft,
  type FromImageMode,
  type VisionStatus,
} from '../../api';
import { LoadingSpinner } from './LoadingSpinner';

export interface FromImagePanelProps {
  mode: FromImageMode;
  /** Called with the produced draft when the user clicks Apply. */
  onApply: (draft: DesignDraft | CharacterDraft) => void;
  /** Optional label override for the apply button. */
  applyLabel?: string;
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB raw — base64 inflates ~33%

export function FromImagePanel({ mode, onApply, applyLabel }: FromImagePanelProps) {
  // We don't pre-detect vision support — capability flags and name heuristics
  // are unreliable. We just check that the LLM endpoint is reachable so we can
  // warn the user before they bother uploading an image, and surface any
  // "no vision" error from the model when they actually try.
  const [vision, setVision] = useState<VisionStatus | null>(null);
  const [probing, setProbing] = useState(true);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>('');
  const [hint, setHint] = useState<string>('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noVision, setNoVision] = useState(false);
  const [draft, setDraft] = useState<DesignDraft | CharacterDraft | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Light reachability check on mount.
  useEffect(() => {
    let cancelled = false;
    setProbing(true);
    getVisionStatus()
      .then((s) => {
        if (!cancelled) setVision(s);
      })
      .catch((e: any) => {
        if (!cancelled)
          setVision({ ok: false, reachable: false, error: e?.message || 'Failed to reach the LLM endpoint.' });
      })
      .finally(() => {
        if (!cancelled) setProbing(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const recheck = () => {
    setProbing(true);
    setNoVision(false);
    setError(null);
    getVisionStatus()
      .then((s) => setVision(s))
      .catch((e: any) =>
        setVision({ ok: false, reachable: false, error: e?.message || 'Failed to reach the LLM endpoint.' }),
      )
      .finally(() => setProbing(false));
  };

  const handleFile = (file: File) => {
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 8 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        setImageDataUrl(result);
        setImageName(file.name);
      }
    };
    reader.onerror = () => setError('Failed to read the image file.');
    reader.readAsDataURL(file);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const generate = async () => {
    if (!imageDataUrl || generating) return;
    setError(null);
    setNoVision(false);
    setDraft(null);
    setGenerating(true);
    try {
      const res = await fromImage(mode, imageDataUrl, hint.trim() || undefined);
      setDraft(res.suggestion);
    } catch (e: any) {
      const msg = e?.message || 'Failed to generate from image.';
      // The backend uses this exact friendly sentence when the model is text-only.
      if (/only for LLMs with vision/i.test(msg)) {
        setNoVision(true);
      } else {
        setError(msg);
      }
    } finally {
      setGenerating(false);
    }
  };

  const apply = () => {
    if (draft) onApply(draft);
  };

  const clearImage = () => {
    setImageDataUrl(null);
    setImageName('');
    setDraft(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ---------------- Render ----------------

  if (probing) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-text-muted">
        <LoadingSpinner size={20} label="Connecting" />
        <div className="text-xs mt-2">Connecting to the LLM endpoint…</div>
      </div>
    );
  }

  if (!vision || !vision.ok || !vision.reachable) {
    return (
      <div className="space-y-3">
        <div className="p-3 rounded border border-error text-error text-sm bg-error/10">
          <div className="font-semibold mb-1">LLM endpoint not reachable</div>
          <div className="text-xs">{vision?.error || 'Could not reach the LLM endpoint.'}</div>
        </div>
        <button type="button" className="btn" onClick={recheck}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[10px] text-text-muted">
        Loaded model:{' '}
        <span className="mono text-text-secondary">{vision.model || 'unknown'}</span>
      </div>

      {!imageDataUrl ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-accent bg-accent/5' : 'border-border bg-surface-2/40 hover:border-accent/50'
          }`}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
        >
          <div className="text-sm text-text-primary font-medium">Drop an image here</div>
          <div className="text-xs text-text-muted mt-1">or click to choose a file</div>
          <div className="text-[10px] text-text-muted mt-2">PNG / JPG / WebP · up to 8 MB</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-surface-2/40 p-3 space-y-2">
          <div className="flex items-start gap-3">
            <img
              src={imageDataUrl}
              alt={imageName || 'uploaded image'}
              className="w-32 h-32 object-cover rounded border border-border flex-shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="text-xs text-text-primary truncate font-medium">
                {imageName || 'image'}
              </div>
              <button
                type="button"
                className="btn btn-ghost !py-1 !px-2 !text-xs mt-1"
                onClick={clearImage}
                disabled={generating}
              >
                Choose different image
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="text-xs uppercase tracking-wider text-text-muted font-semibold">
          Hint <span className="normal-case text-text-muted/70">(optional)</span>
        </label>
        <textarea
          rows={2}
          value={hint}
          onChange={(e) => setHint(e.target.value)}
          placeholder={
            mode === 'game'
              ? "e.g. 'noir detective vibe' or 'make it a heist game'"
              : "e.g. 'shopkeeper, friendly' or 'this is the player's rival'"
          }
          className="w-full resize-none mt-1"
          disabled={generating}
        />
      </div>

      {noVision && (
        <div className="p-3 rounded border border-warning bg-warning/10 text-sm">
          <div className="font-semibold mb-1 text-warning">Vision model required</div>
          <div className="text-xs text-text-secondary">
            This feature is only for LLMs with vision. Please load a vision-capable model in LM
            Studio (e.g. LLaVA, Qwen2-VL, MiniCPM-V, Gemma 3, Pixtral) and try again.
          </div>
          {vision.model && (
            <div className="text-[10px] text-text-muted mt-2">
              Currently loaded:{' '}
              <span className="mono">{vision.model}</span>
            </div>
          )}
          <div className="mt-2">
            <button type="button" className="btn !py-1 !px-2 !text-xs" onClick={recheck}>
              I switched models — re-check
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-2 rounded border border-error text-error text-xs bg-error/10">
          {error}
        </div>
      )}

      {draft && <DraftPreview mode={mode} draft={draft} onApply={apply} applyLabel={applyLabel} />}

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          className="btn btn-primary"
          onClick={generate}
          disabled={!imageDataUrl || generating}
        >
          {generating ? (
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner size={14} label="Generating" /> Generating…
            </span>
          ) : draft ? (
            'Regenerate'
          ) : (
            mode === 'game' ? 'Generate game' : 'Generate character'
          )}
        </button>
      </div>
    </div>
  );
}

function DraftPreview({
  mode,
  draft,
  onApply,
  applyLabel,
}: {
  mode: FromImageMode;
  draft: DesignDraft | CharacterDraft;
  onApply: () => void;
  applyLabel?: string;
}) {
  if (mode === 'game') {
    const d = draft as DesignDraft;
    return (
      <div className="rounded-lg border border-accent/60 bg-accent/5 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-wider text-accent font-semibold">
            Draft ready
          </div>
          <button type="button" className="btn btn-primary !py-1 !px-3 !text-xs" onClick={onApply}>
            {applyLabel || 'Apply to form'}
          </button>
        </div>
        <div className="text-sm text-text-primary">
          <div className="font-semibold">{d.name || 'Untitled game'}</div>
          {d.genre && <div className="text-xs text-text-muted">{d.genre}</div>}
          {d.description && (
            <div className="text-xs mt-1 text-text-secondary">{d.description}</div>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-text-secondary">
          {d.world?.setting && <Row label="Setting" value={d.world.setting} />}
          {d.world?.tone && <Row label="Tone" value={d.world.tone} />}
          {d.player?.name && <Row label="Player" value={d.player.name} />}
          {d.player?.appearance && <Row label="Appearance" value={d.player.appearance} />}
        </div>
        <div className="text-[10px] text-text-muted">
          You'll be able to edit every field before creating the game.
        </div>
      </div>
    );
  }

  const c = draft as CharacterDraft;
  return (
    <div className="rounded-lg border border-accent/60 bg-accent/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-accent font-semibold">
          Draft ready
        </div>
        <button type="button" className="btn btn-primary !py-1 !px-3 !text-xs" onClick={onApply}>
          {applyLabel || 'Apply'}
        </button>
      </div>
      <div className="text-sm text-text-primary">
        <div className="font-semibold">{c.name || 'Unnamed character'}</div>
        {c.dispositionTowardPlayer && (
          <div className="text-xs text-text-muted">{c.dispositionTowardPlayer}</div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-text-secondary">
        {c.appearance && <Row label="Appearance" value={c.appearance} />}
        {c.personality && <Row label="Personality" value={c.personality} />}
        {c.voiceStyle && <Row label="Voice" value={c.voiceStyle} />}
        {c.background && <Row label="Background" value={c.background} />}
      </div>
      <div className="text-[10px] text-text-muted">
        You'll be able to review and edit before adding.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-text-muted">{label}: </span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
