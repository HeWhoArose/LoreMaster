import React from 'react';
import type { ImageMode } from '../../types';

export function ImageModeSelector({
  mode,
  onChange,
}: {
  mode: ImageMode;
  onChange: (m: ImageMode) => void;
}) {
  const modes: { id: ImageMode; label: string }[] = [
    { id: 'txt2img', label: 'txt2img' },
    { id: 'img2img', label: 'img2img' },
    { id: 'inpaint', label: 'inpaint' },
  ];
  return (
    <div className="flex gap-1 p-1 bg-surface-2 rounded border border-border">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`flex-1 px-3 py-1.5 text-xs rounded transition-colors ${
            mode === m.id
              ? 'bg-accent text-white'
              : 'text-text-muted hover:text-text-primary hover:bg-surface'
          }`}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
