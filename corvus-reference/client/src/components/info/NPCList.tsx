import React, { useState } from 'react';
import * as api from '../../api';
import type { NPCCharacter } from '../../types';
import { AddCharacterDialog } from './AddCharacterDialog';
import { NPCCard } from './NPCCard';

export interface NPCListProps {
  gameId: string | null;
  characters: NPCCharacter[];
  onSendToImageStudio?: (character: NPCCharacter) => void;
  onDeleteCharacter?: (charId: string) => Promise<any>;
  onAddCharacter?: (patch: Partial<NPCCharacter>) => Promise<any>;
  /** Called when a character is mutated in-place (e.g. image prompt regen) */
  onCharacterUpdated?: (character: NPCCharacter) => void;
  /** v1.1.31: Called when a character is hard-deleted from inside the modal
   *  (e.g. via the Deny action on a pending NPC). The parent should drop the
   *  id from its `characters` state. */
  onCharacterDeleted?: (charId: string) => void;
  /**
   * v1.1.30: Prompt this NPC to speak in the active chat. Wired through to
   * the chat hook with an empty user content + singleSpeakerId so the
   * orchestrator forces exactly this character to deliver the next turn.
   * When undefined, the chat-bubble button is hidden.
   */
  onPromptToSpeak?: (character: NPCCharacter) => void;
}

function dispositionColor(d: string): string {
  const k = (d || '').toLowerCase();
  if (k.includes('friend') || k.includes('ally') || k.includes('love') || k.includes('loyal'))
    return 'text-success';
  if (k.includes('hostile') || k.includes('enemy') || k.includes('hate')) return 'text-error';
  if (k.includes('wary') || k.includes('suspicious') || k.includes('cautious'))
    return 'text-warning';
  return 'text-text-muted';
}

export function NPCList({
  gameId,
  characters,
  onSendToImageStudio,
  onDeleteCharacter,
  onAddCharacter,
  onCharacterUpdated,
  onCharacterDeleted,
  onPromptToSpeak,
}: NPCListProps) {
  const [selected, setSelected] = useState<NPCCharacter | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const empty = !characters || characters.length === 0;

  return (
    <>
      {onAddCharacter && gameId && (
        <div className="mb-2">
          <button
            type="button"
            className="btn btn-ghost !py-1 !px-2 !text-xs w-full justify-center"
            onClick={() => setAddOpen(true)}
          >
            + Add Character
          </button>
        </div>
      )}

      {empty ? (
        <div className="text-xs text-text-muted italic">No characters met yet.</div>
      ) : (
        (() => {
          // (v1.1.28) Group by lifecycle status. Pending NPCs sit at the top so
          // the user notices them and can approve / deny without hunting.
          // Disabled NPCs are demoted to a separate dimmed section at the
          // bottom so they don't clutter the active roster.
          const pending = characters.filter((c) => c.status === 'pending');
          const active = characters.filter((c) => (c.status ?? 'active') === 'active');
          const disabled = characters.filter((c) => c.status === 'disabled');

          const renderCard = (c: NPCCharacter) => {
            const name = c.revealedName || c.name || 'Unknown';
            const portraitUrl =
              gameId && c.image?.portraitPath
                ? api.getImageURL(gameId, c.image.portraitPath)
                : null;
            const isPending = c.status === 'pending';
            const isDisabled = c.status === 'disabled';
            // Cards visually communicate status: pending pulses with accent
            // border to draw the eye, disabled cards are dimmed.
            const cardClass = [
              // v1.1.30: `group` lets the hover chat-bubble button fade in on hover.
              // `relative` anchors the absolute-positioned bubble icon.
              'card group relative w-full p-2 flex items-center gap-2 text-left transition-colors cursor-pointer',
              isPending
                ? 'border-accent hover:border-accent-strong ring-1 ring-accent/40'
                : 'hover:border-accent',
              isDisabled ? 'opacity-60' : '',
            ]
              .filter(Boolean)
              .join(' ');
            // v1.1.30: Only active NPCs are prompt-to-speak-able. Pending NPCs
            // haven't been approved yet and disabled NPCs are off-screen.
            const canPromptToSpeak =
              !!onPromptToSpeak && (c.status ?? 'active') === 'active';
            return (
              <li key={c.id}>
                <div
                  className={cardClass}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelected(c);
                    }
                  }}
                >
                  {canPromptToSpeak && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPromptToSpeak!(c);
                      }}
                      title={`Prompt ${name} to speak`}
                      aria-label={`Prompt ${name} to speak`}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-surface-2 border border-border text-text-muted hover:text-accent hover:border-accent flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity z-10"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    </button>
                  )}
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-surface flex-shrink-0 flex items-center justify-center border border-border">
                    {portraitUrl ? (
                      <img
                        src={portraitUrl}
                        alt={name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        className="text-text-muted"
                      >
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-text-primary truncate flex items-center gap-1">
                      <span className="truncate">{name}</span>
                      {isPending && (
                        <span className="text-[9px] uppercase tracking-wide px-1 py-px rounded bg-accent/20 text-accent border border-accent/40 flex-shrink-0">
                          new
                        </span>
                      )}
                      {isDisabled && (
                        <span className="text-[9px] uppercase tracking-wide px-1 py-px rounded bg-surface-2 text-text-muted border border-border flex-shrink-0">
                          off
                        </span>
                      )}
                    </div>
                    <div
                      className={`text-[10px] truncate ${dispositionColor(
                        c.dispositionTowardPlayer,
                      )}`}
                    >
                      {isPending ? 'awaiting approval' : c.dispositionTowardPlayer || 'neutral'}
                    </div>
                  </div>
                </div>
              </li>
            );
          };

          return (
            <div className="space-y-3">
              {pending.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-accent mb-1">
                    Pending approval ({pending.length})
                  </div>
                  <ul className="grid grid-cols-2 gap-2">{pending.map(renderCard)}</ul>
                </div>
              )}
              {active.length > 0 && (
                <div>
                  {(pending.length > 0 || disabled.length > 0) && (
                    <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
                      Active ({active.length})
                    </div>
                  )}
                  <ul className="grid grid-cols-2 gap-2">{active.map(renderCard)}</ul>
                </div>
              )}
              {disabled.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-text-muted mb-1">
                    Inactive / off-screen ({disabled.length})
                  </div>
                  <ul className="grid grid-cols-2 gap-2">{disabled.map(renderCard)}</ul>
                </div>
              )}
            </div>
          );
        })()
      )}

      <NPCCard
        gameId={gameId}
        character={selected}
        open={selected !== null}
        onClose={() => setSelected(null)}
        onSendToImageStudio={onSendToImageStudio}
        onDeleteCharacter={onDeleteCharacter ? async (charId) => {
          await onDeleteCharacter(charId);
          setSelected(null);
        } : undefined}
        onCharacterUpdated={(updated) => {
          setSelected(updated);
          onCharacterUpdated?.(updated);
        }}
        onCharacterDeleted={(charId) => {
          // v1.1.31: Deny flow. NPCCard already closed itself, but make sure
          // we drop the selection here too so a stale reference isn't held.
          setSelected(null);
          onCharacterDeleted?.(charId);
        }}
      />

      {onAddCharacter && (
        <AddCharacterDialog
          open={addOpen}
          onClose={() => setAddOpen(false)}
          gameId={gameId}
          onAdd={onAddCharacter}
        />
      )}
    </>
  );
}
