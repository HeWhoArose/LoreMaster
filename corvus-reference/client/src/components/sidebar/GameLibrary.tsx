import React, { useState } from 'react';
import { getGame } from '../../api';
import type { GameConfig, GameSnapshot } from '../../types';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { NewCharacterChatDialog } from './NewCharacterChatDialog';
import { NewGameDialog } from './NewGameDialog';

function formatRelativeDate(iso: string | undefined | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const delta = (now.getTime() - d.getTime()) / 1000;
    if (delta < 60) return 'just now';
    if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
    if (delta < 86_400) return `${Math.floor(delta / 3600)}h ago`;
    if (delta < 86_400 * 7) return `${Math.floor(delta / 86_400)}d ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

export interface GameLibraryProps {
  games: GameConfig[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: (payload: Parameters<typeof import('../../api').createGame>[0]) => Promise<GameConfig>;
  /** Re-fetch the games list from the server. Used after side-effects that
   * create or modify games without going through `onCreate` (e.g. the
   * character-chat dialog, which creates a game AND a character in one flow). */
  onRefresh?: () => Promise<void> | void;
  onDelete: (id: string) => Promise<void>;
}

export function GameLibrary({
  games,
  loading,
  selectedId,
  onSelect,
  onCreate,
  onRefresh,
  onDelete,
}: GameLibraryProps) {
  const [creating, setCreating] = useState(false);
  const [creatingCharChat, setCreatingCharChat] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<GameConfig | null>(null);
  const [copySource, setCopySource] = useState<GameSnapshot | null>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const startCopy = async (g: GameConfig) => {
    setCopyError(null);
    setCopyingId(g.id);
    try {
      const snap = await getGame(g.id);
      setCopySource(snap);
      setCreating(true);
    } catch (e: any) {
      setCopyError(e?.message || 'Failed to load game for copying');
    } finally {
      setCopyingId(null);
    }
  };

  return (
    <aside className="w-64 bg-surface border-r border-border flex flex-col h-full flex-shrink-0">
      <div className="p-3 border-b border-border">
        <div className="text-xs uppercase tracking-wider text-text-muted font-semibold">
          Game Library
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 flex justify-center">
            <LoadingSpinner label="Loading games" />
          </div>
        )}

        {!loading && games.length === 0 && (
          <div className="p-4 text-sm text-text-muted text-center">
            No games yet. Create one below to begin.
          </div>
        )}

        <ul className="py-1">
          {games.map((g) => {
            const active = g.id === selectedId;
            return (
              <li key={g.id}>
                <div
                  className={`group relative cursor-pointer px-3 py-2 border-l-2 ${
                    active
                      ? 'bg-surface-2 border-accent'
                      : 'border-transparent hover:bg-surface-2/60'
                  }`}
                  onClick={() => onSelect(g.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-text-primary truncate">{g.name}</div>
                      <div className="text-xs text-text-muted truncate">
                        {g.genre}
                        {g.lastPlayedAt && (
                          <>
                            <span className="mx-1">·</span>
                            {formatRelativeDate(g.lastPlayedAt)}
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        className="btn btn-ghost !p-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          void startCopy(g);
                        }}
                        disabled={copyingId === g.id}
                        title="Copy game (start a new game with the same settings)"
                        aria-label="Copy game"
                      >
                        {copyingId === g.id ? (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="animate-spin"
                          >
                            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                          </svg>
                        ) : (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                        )}
                      </button>
                      <button
                        className="btn btn-ghost !p-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDelete(g);
                        }}
                        title="Delete game"
                        aria-label="Delete game"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6M14 11v6" />
                          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="p-3 border-t border-border flex flex-col gap-2">
        <button className="btn btn-primary w-full" onClick={() => setCreating(true)}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Game
        </button>
        <button
          className="btn w-full"
          onClick={() => setCreatingCharChat(true)}
          title="Create a slim 1-on-1 chat with a single character (no world setup)."
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          New Character Chat
        </button>
      </div>

      <NewGameDialog
        open={creating}
        onClose={() => {
          setCreating(false);
          setCopySource(null);
        }}
        onCreate={async (payload) => {
          const g = await onCreate(payload);
          setCreating(false);
          setCopySource(null);
          onSelect(g.id);
          return g;
        }}
        prefillFromGame={copySource}
      />

      <NewCharacterChatDialog
        open={creatingCharChat}
        onClose={() => setCreatingCharChat(false)}
        onCreated={async (game) => {
          // The dialog already persisted the game + character. Force a fresh
          // listing so the new chat appears in the sidebar immediately, then
          // select it.
          setCreatingCharChat(false);
          if (onRefresh) await onRefresh();
          onSelect(game.id);
        }}
      />

      {copyError && (
        <div className="px-3 py-2 text-xs text-error border-t border-error/30 bg-error/10">
          {copyError}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete game?"
        variant="danger"
        confirmLabel="Delete"
        message={
          pendingDelete ? (
            <>
              This will permanently delete <strong>{pendingDelete.name}</strong> along with all
              chat history, characters, and images. This cannot be undone.
            </>
          ) : (
            ''
          )
        }
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            await onDelete(pendingDelete.id);
          }
          setPendingDelete(null);
        }}
      />
    </aside>
  );
}
