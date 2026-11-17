import React, { useRef } from 'react';

export interface ColorPickerProps {
  /** Current value as hex (e.g. "#7c5cbf"), or null/undefined for "use default". */
  value: string | null | undefined;
  /** Called whenever the user picks a new color. */
  onChange: (next: string) => void;
  /** Called when the user clicks "reset" — sets value to null. */
  onReset?: () => void;
  /** Optional label rendered above the row. */
  label?: string;
  /** Optional helper text rendered below the row. */
  hint?: string;
  /** Hex color displayed as the "default" preview when value is null. */
  defaultColor?: string;
  /** Quick-pick swatches. Defaults to a curated 10-color palette. */
  swatches?: string[];
}

// A curated palette covering common dialogue/narrator hues, all reasonably
// readable on the app's dark surface (#22222e).
const DEFAULT_SWATCHES = [
  '#60a5fa', // sky blue
  '#a78bfa', // light purple
  '#c4b5fd', // soft lavender
  '#7c5cbf', // raven purple (app accent)
  '#f472b6', // pink
  '#fb7185', // rose
  '#fbbf24', // amber
  '#fde047', // yellow
  '#4ade80', // green
  '#22d3ee', // cyan
];

/**
 * Compact color picker: row of preset swatches + native color input + reset.
 * Designed to live inside settings panels and edit forms.
 */
export function ColorPicker({
  value,
  onChange,
  onReset,
  label,
  hint,
  defaultColor = '#888888',
  swatches = DEFAULT_SWATCHES,
}: ColorPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const isDefault = !value;
  // Native <input type="color"> can't display "no value", so when we're in
  // default mode we feed it the defaultColor preview but visually mark the
  // chip as muted/dashed so the user knows it isn't applied.
  const effective = value || defaultColor;

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs text-text-muted">{label}</label>}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Swatch row */}
        <div className="flex items-center gap-1.5">
          {swatches.map((sw) => {
            const selected = !isDefault && value!.toLowerCase() === sw.toLowerCase();
            return (
              <button
                key={sw}
                type="button"
                aria-label={`Use ${sw}`}
                title={sw}
                className={`w-5 h-5 rounded border transition-transform ${
                  selected
                    ? 'border-text-primary scale-110 ring-2 ring-accent ring-offset-1 ring-offset-surface'
                    : 'border-border hover:scale-110'
                }`}
                style={{ backgroundColor: sw }}
                onClick={() => onChange(sw)}
              />
            );
          })}
        </div>

        {/* Custom picker chip — clicking opens the native picker */}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={`relative w-7 h-7 rounded border ${
            isDefault
              ? 'border-dashed border-border'
              : 'border-text-primary'
          }`}
          style={{ backgroundColor: effective, opacity: isDefault ? 0.4 : 1 }}
          title={isDefault ? 'Pick a custom color' : `Custom: ${value}`}
        >
          {/* Tiny pencil overlay so the chip reads as "custom" */}
          <svg
            viewBox="0 0 16 16"
            className="absolute inset-0 w-full h-full p-1 text-white mix-blend-difference pointer-events-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M11 2l3 3-9 9H2v-3l9-9z" />
          </svg>
        </button>
        <input
          ref={inputRef}
          type="color"
          value={effective}
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />

        {/* Reset button (only when a value is set and onReset is provided) */}
        {onReset && !isDefault && (
          <button
            type="button"
            className="btn btn-ghost !text-xs !py-1 !px-2"
            onClick={onReset}
            title="Use default color"
          >
            reset
          </button>
        )}

        {/* Status text */}
        <span className="text-xs text-text-muted ml-auto">
          {isDefault ? 'default' : value}
        </span>
      </div>
      {hint && <div className="text-xs text-text-muted">{hint}</div>}
    </div>
  );
}
