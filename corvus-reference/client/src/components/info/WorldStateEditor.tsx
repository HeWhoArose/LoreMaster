import React, { useEffect, useMemo, useState } from 'react';
import type { WorldState, WorldStateEvent } from '../../types';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import * as api from '../../api';

/**
 * v1.1.36: Manual world-state editor.
 *
 * The cascade in v1.1.35 covers automatic invalidation on message edit /
 * delete / regenerate. This component lets the user manually scrub events the
 * cascade can't reach — events from many turns back whose source messages
 * still exist, or legacy events from before v1.1.35 that have no traceable
 * source at all.
 *
 * Bubbles each successful mutation back to the parent via `onChanged(next)`
 * so the InfoPanel summary reflects edits without a full refetch.
 */
export interface WorldStateEditorProps {
  open: boolean;
  onClose: () => void;
  gameId: string;
  worldState: WorldState;
  onChanged: (next: WorldState) => void;
}

export function WorldStateEditor({
  open,
  onClose,
  gameId,
  worldState,
  onChanged,
}: WorldStateEditorProps) {
  // Tab: 'events' | 'locations'. Events is the common case; locations is
  // tucked behind a tab since most games never populate locationStates.
  const [tab, setTab] = useState<'events' | 'locations'>('events');

  // Compose-new-event form state. Kept local so it doesn't dirty parent state
  // until Add is clicked.
  const [newEvent, setNewEvent] = useState('');
  const [newLocation, setNewLocation] = useState('');
  const [newChapter, setNewChapter] = useState<number>(1);
  const [adding, setAdding] = useState(false);

  // In-place edit state — eventId being edited + draft fields.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    event: string;
    location: string;
    chapter: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  // Confirmations for destructive ops.
  const [deleteTarget, setDeleteTarget] = useState<WorldStateEvent | null>(null);
  const [bulkDeleteChapter, setBulkDeleteChapter] = useState<number | null>(null);

  // Inline form for locationStates entries — only used when on the locations tab.
  const [newLocKey, setNewLocKey] = useState('');
  const [newLocText, setNewLocText] = useState('');

  // Error banner — shows the last server error inline so we don't depend on
  // toast plumbing.
  const [error, setError] = useState<string | null>(null);

  // Reset transient state every time the modal opens. Keeps stale drafts from
  // a previous session out of the form.
  useEffect(() => {
    if (!open) return;
    setTab('events');
    setNewEvent('');
    setNewLocation('');
    setNewChapter(maxChapter(worldState) || 1);
    setEditingId(null);
    setEditDraft(null);
    setDeleteTarget(null);
    setBulkDeleteChapter(null);
    setNewLocKey('');
    setNewLocText('');
    setError(null);
  }, [open]);

  // Newest-first ordering for the events list. Timeline sort key is
  // `createdAt` (v1.1.37) — the GM-written `timestamp` field is unreliable
  // because the model is free to write narrative time like "Day 3, evening".
  // `createdAt` is stamped server-side with real wall-clock ISO time on every
  // event (and migrated for legacy events). The on-disk array is also
  // append-order, but the editor view ignores that — we want a true timeline
  // regardless of how events got into the file.
  const sortedEvents = useMemo(() => {
    return [...worldState.events].sort((a, b) => {
      // Primary key: chapter desc — latest chapter first.
      if (a.chapter !== b.chapter) return b.chapter - a.chapter;
      // Secondary: createdAt desc. Falls back to timestamp for the brief
      // window where data on disk hasn't been migrated yet (shouldn't
      // happen — getWorldState migrates on read — but cheap to be safe).
      const ka = a.createdAt || a.timestamp || '';
      const kb = b.createdAt || b.timestamp || '';
      if (ka !== kb) return kb.localeCompare(ka);
      // Final stable tiebreaker: id. Guarantees deterministic order across
      // re-renders even when two events share createdAt to the millisecond
      // (e.g. legacy events backfilled with the same synthetic timestamp).
      return b.id.localeCompare(a.id);
    });
  }, [worldState.events]);

  const chapters = useMemo(() => {
    const set = new Set<number>();
    for (const e of worldState.events) set.add(e.chapter);
    return [...set].sort((a, b) => b - a);
  }, [worldState.events]);

  async function handleAdd() {
    const text = newEvent.trim();
    if (!text) return;
    setAdding(true);
    setError(null);
    try {
      const created = await api.addWorldStateEvent(gameId, {
        event: text,
        location: newLocation.trim(),
        chapter: newChapter,
      });
      onChanged({ ...worldState, events: [...worldState.events, created] });
      setNewEvent('');
      setNewLocation('');
    } catch (err) {
      setError((err as Error).message || 'Failed to add event.');
    } finally {
      setAdding(false);
    }
  }

  function startEdit(e: WorldStateEvent) {
    setEditingId(e.id);
    setEditDraft({
      event: e.event,
      location: e.location,
      chapter: e.chapter,
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  async function saveEdit() {
    if (!editingId || !editDraft) return;
    const trimmed = editDraft.event.trim();
    if (!trimmed) {
      setError('Event text cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await api.updateWorldStateEvent(gameId, editingId, {
        event: trimmed,
        location: editDraft.location.trim(),
        chapter: editDraft.chapter,
      });
      onChanged({
        ...worldState,
        events: worldState.events.map((e) => (e.id === editingId ? updated : e)),
      });
      cancelEdit();
    } catch (err) {
      setError((err as Error).message || 'Failed to save event.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    setError(null);
    try {
      await api.deleteWorldStateEvent(gameId, target.id);
      onChanged({
        ...worldState,
        events: worldState.events.filter((e) => e.id !== target.id),
      });
    } catch (err) {
      setError((err as Error).message || 'Failed to delete event.');
    }
  }

  async function confirmBulkDelete() {
    if (bulkDeleteChapter === null) return;
    const ch = bulkDeleteChapter;
    setBulkDeleteChapter(null);
    setError(null);
    try {
      await api.bulkDeleteWorldStateEvents(gameId, { chapter: ch });
      onChanged({
        ...worldState,
        events: worldState.events.filter((e) => e.chapter !== ch),
      });
    } catch (err) {
      setError((err as Error).message || 'Failed to bulk-delete events.');
    }
  }

  async function saveLocation() {
    const loc = newLocKey.trim();
    if (!loc) return;
    setError(null);
    try {
      await api.setLocationState(gameId, loc, newLocText);
      onChanged({
        ...worldState,
        locationStates: { ...worldState.locationStates, [loc]: newLocText },
      });
      setNewLocKey('');
      setNewLocText('');
    } catch (err) {
      setError((err as Error).message || 'Failed to save location state.');
    }
  }

  async function deleteLocation(loc: string) {
    setError(null);
    try {
      await api.deleteLocationState(gameId, loc);
      const next = { ...worldState.locationStates };
      delete next[loc];
      onChanged({ ...worldState, locationStates: next });
    } catch (err) {
      setError((err as Error).message || 'Failed to delete location state.');
    }
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="World State Editor" size="xl">
        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b border-border -mx-4 px-4">
          <TabButton active={tab === 'events'} onClick={() => setTab('events')}>
            Events ({worldState.events.length})
          </TabButton>
          <TabButton active={tab === 'locations'} onClick={() => setTab('locations')}>
            Location states ({Object.keys(worldState.locationStates).length})
          </TabButton>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded border border-red-500/40 bg-red-500/10 text-sm text-red-300">
            {error}
          </div>
        )}

        {tab === 'events' && (
          <div className="space-y-4">
            {/* Add-new form */}
            <div className="card p-3">
              <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
                Add a manual event
              </div>
              <div className="space-y-2">
                <textarea
                  className="input w-full text-sm"
                  rows={2}
                  placeholder="What happened? (e.g. 'The party agreed to escort the merchant to Bridgeport.')"
                  value={newEvent}
                  onChange={(e) => setNewEvent(e.target.value)}
                />
                <div className="flex gap-2">
                  <input
                    className="input flex-1 text-sm"
                    placeholder="Location (optional)"
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                  />
                  <input
                    type="number"
                    min={1}
                    className="input w-24 text-sm"
                    placeholder="Chapter"
                    value={newChapter}
                    onChange={(e) =>
                      setNewChapter(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                  />
                  <button
                    className="btn btn-primary text-sm"
                    onClick={handleAdd}
                    disabled={adding || !newEvent.trim()}
                  >
                    {adding ? 'Adding…' : 'Add'}
                  </button>
                </div>
                <div className="text-xs text-text-muted">
                  User-added events are never auto-removed by the message cascade
                  — they survive edit / delete / regenerate.
                </div>
              </div>
            </div>

            {/* Bulk-delete by chapter */}
            {chapters.length > 0 && (
              <div className="card p-3">
                <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
                  Bulk-delete events from one chapter
                </div>
                <div className="flex flex-wrap gap-2">
                  {chapters.map((ch) => {
                    const count = worldState.events.filter((e) => e.chapter === ch).length;
                    return (
                      <button
                        key={ch}
                        className="btn btn-ghost text-xs"
                        onClick={() => setBulkDeleteChapter(ch)}
                      >
                        Chapter {ch} ({count})
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Events list */}
            {sortedEvents.length === 0 ? (
              <div className="text-center text-text-muted text-sm py-8">
                No world-state events yet. The GM will append events as the story
                progresses, or you can add one manually above.
              </div>
            ) : (
              <ul className="space-y-2">
                {sortedEvents.map((e) => {
                  const isEditing = editingId === e.id;
                  const sourceCount = e.sourceMessageIds?.length ?? 0;
                  return (
                    <li
                      key={e.id}
                      className={`card p-3 ${e.stale ? 'border-amber-500/50' : ''}`}
                    >
                      {isEditing && editDraft ? (
                        <div className="space-y-2">
                          <textarea
                            className="input w-full text-sm"
                            rows={3}
                            value={editDraft.event}
                            onChange={(ev) =>
                              setEditDraft({ ...editDraft, event: ev.target.value })
                            }
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <input
                              className="input flex-1 text-sm"
                              placeholder="Location"
                              value={editDraft.location}
                              onChange={(ev) =>
                                setEditDraft({ ...editDraft, location: ev.target.value })
                              }
                            />
                            <input
                              type="number"
                              min={1}
                              className="input w-24 text-sm"
                              value={editDraft.chapter}
                              onChange={(ev) =>
                                setEditDraft({
                                  ...editDraft,
                                  chapter: Math.max(1, parseInt(ev.target.value, 10) || 1),
                                })
                              }
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              className="btn btn-ghost text-sm"
                              onClick={cancelEdit}
                              disabled={saving}
                            >
                              Cancel
                            </button>
                            <button
                              className="btn btn-primary text-sm"
                              onClick={saveEdit}
                              disabled={saving || !editDraft.event.trim()}
                            >
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                          </div>
                          {e.stale && (
                            <div className="text-xs text-amber-400">
                              Saving will clear the stale flag.
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-sm text-text-primary">
                                {e.event}
                                {e.stale && (
                                  <span className="ml-2 inline-block text-[10px] uppercase tracking-wider text-amber-400 border border-amber-400/40 rounded px-1.5 py-0.5">
                                    stale
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-text-muted mt-1">
                                {e.location && <>{e.location} · </>}
                                Chapter {e.chapter}
                                {/* v1.1.37: prefer the server-stamped
                                    createdAt for display — e.timestamp may be
                                    a narrative string like "Day 3, evening"
                                    that produces Invalid Date. Fall back to
                                    parsing timestamp if createdAt is missing
                                    (legacy events the migration didn't reach
                                    for some reason), and only render if the
                                    result is a real date. */}
                                {(() => {
                                  const iso = e.createdAt || e.timestamp;
                                  if (!iso) return null;
                                  const ms = Date.parse(iso);
                                  if (!Number.isFinite(ms)) return null;
                                  return <> · {new Date(ms).toLocaleString()}</>;
                                })()}
                                {sourceCount === 0 && <> · user-added</>}
                                {sourceCount > 0 && (
                                  <>
                                    {' '}
                                    · tied to {sourceCount} message
                                    {sourceCount === 1 ? '' : 's'}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                className="btn btn-ghost text-xs"
                                onClick={() => startEdit(e)}
                                title="Edit event"
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-ghost text-xs text-red-400 hover:text-red-300"
                                onClick={() => setDeleteTarget(e)}
                                title="Delete event"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab === 'locations' && (
          <div className="space-y-4">
            <div className="card p-3">
              <div className="text-xs uppercase tracking-wider text-text-muted mb-2">
                Add or replace a location state
              </div>
              <div className="space-y-2">
                <input
                  className="input w-full text-sm"
                  placeholder="Location name (e.g. 'The Drowned Tavern')"
                  value={newLocKey}
                  onChange={(e) => setNewLocKey(e.target.value)}
                />
                <textarea
                  className="input w-full text-sm"
                  rows={3}
                  placeholder="Current state (e.g. 'Burned down after the riot; only the cellar survived.')"
                  value={newLocText}
                  onChange={(e) => setNewLocText(e.target.value)}
                />
                <div className="flex justify-end">
                  <button
                    className="btn btn-primary text-sm"
                    onClick={saveLocation}
                    disabled={!newLocKey.trim()}
                  >
                    Save
                  </button>
                </div>
                <div className="text-xs text-text-muted">
                  Location states are user-managed only — the GM doesn't write
                  to them in this version. Use them for persistent facts about
                  places (damage, ownership, hidden details).
                </div>
              </div>
            </div>

            {Object.keys(worldState.locationStates).length === 0 ? (
              <div className="text-center text-text-muted text-sm py-8">
                No location states yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {Object.entries(worldState.locationStates).map(([loc, text]) => (
                  <li key={loc} className="card p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-text-primary">{loc}</div>
                        <div className="text-sm text-text-muted mt-1 whitespace-pre-wrap">
                          {text}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          className="btn btn-ghost text-xs"
                          onClick={() => {
                            setNewLocKey(loc);
                            setNewLocText(text);
                          }}
                          title="Load into editor"
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-ghost text-xs text-red-400 hover:text-red-300"
                          onClick={() => deleteLocation(loc)}
                          title="Delete location state"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this event?"
        message={
          deleteTarget
            ? `"${truncate(deleteTarget.event, 140)}" will be removed from the world state. The storyteller will stop seeing it on the next turn.`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={bulkDeleteChapter !== null}
        title={`Delete all chapter ${bulkDeleteChapter ?? ''} events?`}
        message={`Removes every event tagged with chapter ${bulkDeleteChapter ?? ''} from the world state. This cannot be undone, but the v1.1.34 snapshot system keeps the previous file in .backups/.`}
        confirmLabel="Delete all"
        variant="danger"
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDeleteChapter(null)}
      />
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
        active
          ? 'border-accent text-text-primary'
          : 'border-transparent text-text-muted hover:text-text-primary'
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function maxChapter(ws: WorldState): number {
  let m = 0;
  for (const e of ws.events) if (e.chapter > m) m = e.chapter;
  return m;
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
