import React, { useEffect, useRef, useState } from 'react';

export interface PlayerStatsProps {
  stats: Record<string, number>;
  onUpdateStats?: (newStats: Record<string, number>) => void;
}

interface FlashState {
  key: string;
  delta: number;
}

export function PlayerStats({ stats, onUpdateStats }: PlayerStatsProps) {
  const prev = useRef<Record<string, number>>({});
  const [flash, setFlash] = useState<FlashState[]>([]);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  useEffect(() => {
    const p = prev.current;
    const changes: FlashState[] = [];
    for (const k of Object.keys(stats)) {
      if (p[k] !== undefined && p[k] !== stats[k]) {
        changes.push({ key: k, delta: stats[k] - p[k] });
      }
    }
    if (changes.length) {
      setFlash(changes);
      const t = setTimeout(() => setFlash([]), 1500);
      prev.current = { ...stats };
      return () => clearTimeout(t);
    }
    prev.current = { ...stats };
  }, [stats]);

  const startEdit = (key: string, value: number) => {
    if (!onUpdateStats) return;
    setEditingKey(key);
    setEditValue(String(value));
  };

  const commitEdit = (key: string) => {
    if (!onUpdateStats) return;
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onUpdateStats({ ...stats, [key]: parsed });
    }
    setEditingKey(null);
  };

  const entries = Object.entries(stats || {});
  if (!entries.length) {
    return <div className="text-xs text-text-muted italic">No stats.</div>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => {
        const change = flash.find((f) => f.key === key);
        const max = guessMax(key, value);
        const isEditing = editingKey === key;
        return (
          <div
            key={key}
            className={`card px-3 py-2 transition-colors ${
              change ? (change.delta > 0 ? 'animate-flash-green' : 'animate-flash-red') : ''
            }`}
          >
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-text-muted">{key}</span>
              {isEditing ? (
                <input
                  className="mono font-semibold text-text-primary w-20 text-right text-sm py-0 px-1 h-6"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onBlur={() => commitEdit(key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(key);
                    if (e.key === 'Escape') setEditingKey(null);
                  }}
                  autoFocus
                />
              ) : (
                <span
                  className={`mono font-semibold text-text-primary ${onUpdateStats ? 'cursor-pointer hover:text-accent' : ''}`}
                  onClick={() => startEdit(key, value)}
                  title={onUpdateStats ? 'Click to edit' : undefined}
                >
                  {value}
                  {max ? <span className="text-text-muted"> / {max}</span> : null}
                  {change && (
                    <span
                      className={`ml-2 text-xs ${change.delta > 0 ? 'text-success' : 'text-error'}`}
                    >
                      {change.delta > 0 ? '+' : ''}
                      {change.delta}
                    </span>
                  )}
                </span>
              )}
            </div>
            {max && (
              <div className="mt-1 h-1.5 bg-surface rounded overflow-hidden">
                <div
                  className="h-full bg-accent transition-all duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function guessMax(key: string, value: number): number | null {
  const k = key.toLowerCase();
  if (k.includes('health') || k.includes('hp')) return Math.max(100, value);
  if (k.includes('mana') || k.includes('mp') || k.includes('energy')) return Math.max(100, value);
  if (k.includes('stamina')) return Math.max(100, value);
  return null;
}
