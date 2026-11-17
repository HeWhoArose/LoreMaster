import React from 'react';
import type { ChatMessage } from '../../types';

export interface MessageControlsProps {
  message: ChatMessage;
  isUser: boolean;
  disabled?: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onRegenerate?: () => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  alternativeIndex?: number; // 0-based
  alternativeTotal?: number;
}

const Icon: React.FC<{ d: string; size?: number }> = ({ d, size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={d} />
  </svg>
);

export function MessageControls({
  isUser,
  disabled,
  onEdit,
  onDelete,
  onRegenerate,
  onSwipeLeft,
  onSwipeRight,
  alternativeIndex = 0,
  alternativeTotal = 1,
}: MessageControlsProps) {
  const hasAlternatives = !isUser && alternativeTotal > 1;

  return (
    <div className="flex items-center gap-1 text-text-muted">
      {hasAlternatives && (
        <div className="flex items-center gap-0.5 mr-1 text-xs">
          <button
            className="btn btn-ghost !p-1"
            onClick={onSwipeLeft}
            disabled={disabled || alternativeIndex === 0}
            title="Previous alternative"
            aria-label="Previous alternative"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <span className="mono tabular-nums">
            {alternativeIndex + 1}/{alternativeTotal}
          </span>
          <button
            className="btn btn-ghost !p-1"
            onClick={onSwipeRight}
            disabled={disabled || alternativeIndex >= alternativeTotal - 1}
            title="Next alternative"
            aria-label="Next alternative"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}

      {!isUser && onRegenerate && (
        <button
          className="btn btn-ghost !p-1"
          onClick={onRegenerate}
          disabled={disabled}
          title="Regenerate"
          aria-label="Regenerate response"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
      )}

      <button
        className="btn btn-ghost !p-1"
        onClick={onEdit}
        disabled={disabled}
        title="Edit"
        aria-label="Edit message"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
      </button>

      <button
        className="btn btn-ghost !p-1 hover:!text-error"
        onClick={onDelete}
        disabled={disabled}
        title="Delete"
        aria-label="Delete message"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
    </div>
  );
}
