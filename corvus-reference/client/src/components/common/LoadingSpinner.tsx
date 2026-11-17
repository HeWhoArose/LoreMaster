import React from 'react';

export interface LoadingSpinnerProps {
  size?: number;
  className?: string;
  label?: string;
}

export function LoadingSpinner({ size = 20, className = '', label }: LoadingSpinnerProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status">
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-spin"
        style={{ animationDuration: '1s' }}
      >
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
      {label && <span className="text-sm text-text-muted">{label}</span>}
    </span>
  );
}

export function TypingIndicator({ label = 'Thinking' }: { label?: string }) {
  return (
    <div className="inline-flex items-center gap-2 text-text-muted text-sm">
      <span>{label}</span>
      <span className="inline-flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 bg-text-muted rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </span>
    </div>
  );
}
