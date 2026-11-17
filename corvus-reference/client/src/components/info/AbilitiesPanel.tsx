import React, { useState } from 'react';
import type { Ability } from '../../types';

export interface AbilitiesPanelProps {
  abilities: Ability[];
  onUpdateAbilities?: (newAbilities: Ability[]) => void;
}

export function AbilitiesPanel({ abilities, onUpdateAbilities }: AbilitiesPanelProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<Ability | null>(null);
  const [adding, setAdding] = useState(false);
  const [newAbility, setNewAbility] = useState<Ability>({ name: '', description: '', type: '', level: 0 });

  if (!abilities || abilities.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-text-muted italic">No abilities.</div>
        {onUpdateAbilities && (
          <AddAbilityRow
            adding={adding}
            newAbility={newAbility}
            setNewAbility={setNewAbility}
            onStart={() => setAdding(true)}
            onConfirm={() => {
              if (newAbility.name.trim()) {
                onUpdateAbilities([...abilities, { ...newAbility }]);
                setNewAbility({ name: '', description: '', type: '', level: 0 });
                setAdding(false);
              }
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    );
  }

  const commitEdit = (idx: number) => {
    if (!onUpdateAbilities || !draft) return;
    const updated = [...abilities];
    updated[idx] = draft;
    onUpdateAbilities(updated);
    setEditingIdx(null);
    setDraft(null);
  };

  const removeAbility = (idx: number) => {
    if (!onUpdateAbilities) return;
    onUpdateAbilities(abilities.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {abilities.map((ab, idx) => {
          const key = `${ab.name}-${ab.type}-${idx}`;
          const open = !!expanded[key];
          const isEditing = editingIdx === idx;
          return (
            <li key={key} className="card">
              {isEditing && draft ? (
                <div className="p-3 space-y-2">
                  <input
                    className="w-full text-xs"
                    placeholder="Name"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <input
                      className="flex-1 text-xs"
                      placeholder="Type"
                      value={draft.type}
                      onChange={(e) => setDraft({ ...draft, type: e.target.value })}
                    />
                    <input
                      className="w-16 text-xs"
                      type="number"
                      placeholder="Lv"
                      value={draft.level}
                      onChange={(e) => setDraft({ ...draft, level: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <textarea
                    className="w-full text-xs min-h-[48px]"
                    placeholder="Description"
                    value={draft.description}
                    onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <button className="btn btn-ghost text-xs" onClick={() => { setEditingIdx(null); setDraft(null); }}>Cancel</button>
                    <button className="btn btn-primary text-xs" onClick={() => commitEdit(idx)}>Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-1">
                    <button
                      className="flex-1 text-left px-3 py-2 flex items-center justify-between gap-2"
                      onClick={() => setExpanded((e) => ({ ...e, [key]: !open }))}
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-text-primary truncate">
                          {ab.name}{' '}
                          {ab.level > 0 && (
                            <span className="mono text-xs text-text-muted">Lv {ab.level}</span>
                          )}
                        </div>
                        {ab.type && (
                          <div className="text-xs text-text-muted uppercase tracking-wider">{ab.type}</div>
                        )}
                      </div>
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {onUpdateAbilities && (
                      <div className="flex gap-0.5 pr-2 flex-shrink-0">
                        <button
                          className="btn btn-ghost !p-1"
                          title="Edit"
                          onClick={() => { setEditingIdx(idx); setDraft({ ...ab }); }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          className="btn btn-ghost !p-1 text-error hover:text-error"
                          title="Remove"
                          onClick={() => removeAbility(idx)}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  {open && ab.description && (
                    <div className="px-3 pb-3 pt-1 text-xs text-text-muted border-t border-border">
                      {ab.description}
                    </div>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {onUpdateAbilities && (
        <AddAbilityRow
          adding={adding}
          newAbility={newAbility}
          setNewAbility={setNewAbility}
          onStart={() => setAdding(true)}
          onConfirm={() => {
            if (newAbility.name.trim()) {
              onUpdateAbilities([...abilities, { ...newAbility }]);
              setNewAbility({ name: '', description: '', type: '', level: 0 });
              setAdding(false);
            }
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function AddAbilityRow({
  adding,
  newAbility,
  setNewAbility,
  onStart,
  onConfirm,
  onCancel,
}: {
  adding: boolean;
  newAbility: Ability;
  setNewAbility: (a: Ability) => void;
  onStart: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!adding) {
    return (
      <button className="btn btn-ghost text-xs w-full" onClick={onStart}>
        + Add ability
      </button>
    );
  }
  return (
    <div className="card p-2 space-y-1.5">
      <input
        className="w-full text-xs"
        placeholder="Name"
        value={newAbility.name}
        onChange={(e) => setNewAbility({ ...newAbility, name: e.target.value })}
        autoFocus
      />
      <div className="flex gap-2">
        <input
          className="flex-1 text-xs"
          placeholder="Type"
          value={newAbility.type}
          onChange={(e) => setNewAbility({ ...newAbility, type: e.target.value })}
        />
        <input
          className="w-16 text-xs"
          type="number"
          placeholder="Lv"
          value={newAbility.level}
          onChange={(e) => setNewAbility({ ...newAbility, level: parseInt(e.target.value) || 0 })}
        />
      </div>
      <textarea
        className="w-full text-xs min-h-[40px]"
        placeholder="Description"
        value={newAbility.description}
        onChange={(e) => setNewAbility({ ...newAbility, description: e.target.value })}
      />
      <div className="flex gap-2">
        <button className="btn btn-ghost text-xs" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary text-xs" onClick={onConfirm}>Add</button>
      </div>
    </div>
  );
}
