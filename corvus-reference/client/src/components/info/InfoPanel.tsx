import React, { useState } from 'react';
import type { Ability, InventoryItem, Money, NPCCharacter, PlayerCharacter, WorldInfo, WorldState } from '../../types';
import { AbilitiesPanel } from './AbilitiesPanel';
import { EditableWorldPanel } from './EditableWorldPanel';
import { InventoryPanel } from './InventoryPanel';
import { MoneyDisplay } from './MoneyDisplay';
import { NPCList } from './NPCList';
import { PlayerStats } from './PlayerStats';
import { WorldStateEditor } from './WorldStateEditor';

export interface InfoPanelProps {
  gameId: string | null;
  player: PlayerCharacter | null;
  characters: NPCCharacter[];
  world: WorldInfo | null;
  worldState: WorldState | null;
  onSendNpcToStudio?: (npc: NPCCharacter) => void;
  onUpdatePlayer?: (patch: Partial<PlayerCharacter>) => Promise<any>;
  onUpdateWorld?: (patch: Partial<WorldInfo>) => Promise<any>;
  onUpdateCharacter?: (charId: string, patch: Partial<NPCCharacter>) => Promise<any>;
  onDeleteCharacter?: (charId: string) => Promise<any>;
  onAddCharacter?: (patch: Partial<NPCCharacter>) => Promise<any>;
  onCharacterUpdated?: (character: NPCCharacter) => void;
  /** v1.1.31: Called when a character is hard-deleted from the NPCCard modal
   *  (Deny on a pending NPC). Parent drops the id from its state. */
  onCharacterDeleted?: (charId: string) => void;
  /**
   * v1.1.30: Prompt the given NPC to speak in the active chat. Hover the
   * portrait card and click the chat-bubble button to fire this.
   */
  onPromptToSpeak?: (character: NPCCharacter) => void;
  /**
   * v1.1.36: Replace the entire world state in parent app state after a
   * manual edit from the WorldStateEditor modal. The editor calls this on
   * every successful CRUD mutation so the panel summary updates without a
   * full refetch.
   */
  onUpdateWorldState?: (next: WorldState) => void;
}

interface SectionProps {
  id: string;
  title: string;
  count?: number | null;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ id, title, count, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-b border-border last:border-b-0">
      <button
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-surface-2/60"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`section-${id}`}
      >
        <div className="flex items-center gap-2">
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform text-text-muted ${open ? 'rotate-90' : ''}`}
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-xs uppercase tracking-wider text-text-muted font-semibold">
            {title}
          </span>
          {typeof count === 'number' && (
            <span className="text-[10px] text-text-muted mono">{count}</span>
          )}
        </div>
      </button>
      {open && (
        <div id={`section-${id}`} className="px-3 pb-3">
          {children}
        </div>
      )}
    </section>
  );
}

/* Inline editable text area for backstory / appearance */
function EditableTextField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave?: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    onSave?.(draft);
    setEditing(false);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
        {onSave && !editing && (
          <button className="btn btn-ghost !py-0 !px-1 !text-[10px]" onClick={() => { setDraft(value); setEditing(true); }}>
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-1">
          <textarea
            className="w-full text-xs min-h-[60px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="flex gap-1">
            <button className="btn btn-ghost text-xs" onClick={() => setEditing(false)}>Cancel</button>
            <button className="btn btn-primary text-xs" onClick={commit}>Save</button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-text-primary whitespace-pre-wrap">{value || <span className="text-text-muted italic">None.</span>}</div>
      )}
    </div>
  );
}

export function InfoPanel({
  gameId,
  player,
  characters,
  world,
  worldState,
  onSendNpcToStudio,
  onUpdatePlayer,
  onUpdateWorld,
  onUpdateCharacter,
  onDeleteCharacter,
  onAddCharacter,
  onCharacterUpdated,
  onCharacterDeleted,
  onPromptToSpeak,
  onUpdateWorldState,
}: InfoPanelProps) {
  const [worldStateEditorOpen, setWorldStateEditorOpen] = useState(false);

  return (
    <aside className="w-80 bg-surface border-l border-border flex flex-col h-full flex-shrink-0 overflow-hidden">
      <div className="p-3 border-b border-border flex-shrink-0">
        <div className="text-xs uppercase tracking-wider text-text-muted font-semibold">
          Character
        </div>
        {player && (
          <div className="mt-1 text-sm font-semibold text-text-primary truncate">{player.name}</div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {!player && (
          <div className="p-4 text-sm text-text-muted text-center">
            Select a game to view character details.
          </div>
        )}

        {player && (
          <>
            <Section
              id="money"
              title="Currency"
              // v1.1.38: show a count when the player carries more than one
              // denomination so the header reflects the multi-currency state
              // at a glance.
              count={
                (player.money ? 1 : 0) +
                Object.keys(player.extraCurrencies || {}).length || null
              }
            >
              <MoneyDisplay
                money={player.money}
                extraCurrencies={player.extraCurrencies}
                onUpdateMoney={
                  onUpdatePlayer
                    ? (newMoney: Money) => onUpdatePlayer({ money: newMoney })
                    : undefined
                }
                onUpdateExtraCurrencies={
                  onUpdatePlayer
                    ? (next: Record<string, number>) =>
                        onUpdatePlayer({ extraCurrencies: next })
                    : undefined
                }
              />
            </Section>

            <Section id="stats" title="Stats" count={Object.keys(player.stats || {}).length}>
              <PlayerStats
                stats={player.stats || {}}
                onUpdateStats={
                  onUpdatePlayer
                    ? (newStats: Record<string, number>) => onUpdatePlayer({ stats: newStats })
                    : undefined
                }
              />
            </Section>

            <Section
              id="abilities"
              title="Abilities"
              count={(player.abilities || []).length}
              defaultOpen={false}
            >
              <AbilitiesPanel
                abilities={player.abilities || []}
                onUpdateAbilities={
                  onUpdatePlayer
                    ? (newAbilities: Ability[]) => onUpdatePlayer({ abilities: newAbilities })
                    : undefined
                }
              />
            </Section>

            <Section id="inventory" title="Inventory" count={(player.inventory || []).length}>
              <InventoryPanel
                inventory={player.inventory || []}
                onUpdateInventory={
                  onUpdatePlayer
                    ? (newInventory: InventoryItem[]) => onUpdatePlayer({ inventory: newInventory })
                    : undefined
                }
              />
            </Section>

            {(player.backstory || player.appearance) && (
              <Section id="bio" title="Bio" defaultOpen={false}>
                <div className="space-y-3">
                  {player.backstory !== undefined && (
                    <EditableTextField
                      label="Backstory"
                      value={player.backstory}
                      onSave={
                        onUpdatePlayer
                          ? (v) => onUpdatePlayer({ backstory: v })
                          : undefined
                      }
                    />
                  )}
                  {player.appearance !== undefined && (
                    <EditableTextField
                      label="Appearance"
                      value={player.appearance}
                      onSave={
                        onUpdatePlayer
                          ? (v) => onUpdatePlayer({ appearance: v })
                          : undefined
                      }
                    />
                  )}
                </div>
              </Section>
            )}

            <Section
              id="npcs"
              title="Characters met"
              count={characters.length}
              defaultOpen
            >
              <NPCList
                gameId={gameId}
                characters={characters}
                onSendToImageStudio={onSendNpcToStudio}
                onDeleteCharacter={onDeleteCharacter}
                onAddCharacter={onAddCharacter}
                onCharacterUpdated={onCharacterUpdated}
                onCharacterDeleted={onCharacterDeleted}
                onPromptToSpeak={onPromptToSpeak}
              />
            </Section>

            {world && (
              <Section id="world-info" title="World Info" defaultOpen={false}>
                <EditableWorldPanel world={world} onUpdateWorld={onUpdateWorld} />
              </Section>
            )}

            {worldState && (
              <Section
                id="world"
                title="World State"
                defaultOpen={false}
                count={worldState.events?.length ?? null}
              >
                <div className="text-sm space-y-2">
                  {/* v1.1.36: manual editor button — opens a modal with full
                      Events / Location states CRUD. The cascade from v1.1.35
                      still handles automatic invalidation; this is the escape
                      hatch for events the cascade can't reach (legacy events
                      with no source message, or events from turns whose source
                      message still exists but the user wants gone). */}
                  {gameId && onUpdateWorldState && (
                    <div className="flex justify-end">
                      <button
                        className="btn btn-ghost !py-0 !px-2 !text-[11px]"
                        onClick={() => setWorldStateEditorOpen(true)}
                        title="Manually edit world-state events and location states"
                      >
                        Edit
                      </button>
                    </div>
                  )}
                  {worldState.events && worldState.events.length > 0 && (
                    <div>
                      <div className="text-xs text-text-muted uppercase tracking-wider mb-1">
                        Recent events
                      </div>
                      <ul className="space-y-1">
                        {/* v1.1.37: sort newest-first by (chapter desc,
                            createdAt desc) so the summary matches the
                            editor's timeline view. Was previously
                            slice(-5).reverse() which assumed append order =
                            chronological — fine pre-editor, but after the
                            user adds/edits events the array index no longer
                            corresponds to recency. */}
                        {[...worldState.events]
                          .sort((a, b) => {
                            if (a.chapter !== b.chapter) return b.chapter - a.chapter;
                            const ka = a.createdAt || a.timestamp || '';
                            const kb = b.createdAt || b.timestamp || '';
                            if (ka !== kb) return kb.localeCompare(ka);
                            return b.id.localeCompare(a.id);
                          })
                          .slice(0, 5)
                          .map((e) => (
                          <li
                            key={e.id}
                            className={`card px-2 py-1 text-xs${e.stale ? ' opacity-60' : ''}`}
                          >
                            <div className="text-text-primary">
                              {e.event}
                              {e.stale && (
                                <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-500">
                                  stale
                                </span>
                              )}
                            </div>
                            <div className="text-text-muted">
                              {e.location}
                              {(() => {
                                // v1.1.37: prefer server-stamped createdAt; the
                                // GM-written `timestamp` may be a narrative
                                // string and produce Invalid Date.
                                const iso = e.createdAt || e.timestamp;
                                if (!iso) return null;
                                const ms = Date.parse(iso);
                                if (!Number.isFinite(ms)) return null;
                                return ` · ${new Date(ms).toLocaleString()}`;
                              })()}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Section>
            )}
          </>
        )}
      </div>

      {/* v1.1.36: world-state editor modal — only mounted when we have a
          gameId and the parent provided an update callback. Kept outside the
          scrollable section so the modal layers correctly above the panel. */}
      {gameId && worldState && onUpdateWorldState && (
        <WorldStateEditor
          open={worldStateEditorOpen}
          onClose={() => setWorldStateEditorOpen(false)}
          gameId={gameId}
          worldState={worldState}
          onChanged={onUpdateWorldState}
        />
      )}
    </aside>
  );
}
