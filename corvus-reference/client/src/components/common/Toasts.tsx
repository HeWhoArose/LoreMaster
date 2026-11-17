import React from 'react';
import { useAppContext } from '../../context/AppContext';

export function Toasts() {
  const { toasts, dismissToast } = useAppContext();
  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`card p-3 pr-8 text-sm shadow-lg relative animate-fade-in ${
            t.kind === 'error'
              ? 'border-error text-error'
              : t.kind === 'success'
                ? 'border-success text-success'
                : t.kind === 'warning'
                  ? 'border-warning text-warning'
                  : 'text-text-primary'
          }`}
        >
          <button
            className="absolute top-1 right-1 text-text-muted hover:text-text-primary"
            onClick={() => dismissToast(t.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
          <div className="whitespace-pre-wrap">{t.message}</div>
        </div>
      ))}
    </div>
  );
}
