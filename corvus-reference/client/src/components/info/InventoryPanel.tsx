import React, { useEffect, useRef, useState } from 'react';
import type { InventoryItem } from '../../types';

export interface InventoryPanelProps {
  inventory: InventoryItem[];
  onUpdateInventory?: (newInventory: InventoryItem[]) => void;
}

export function InventoryPanel({ inventory, onUpdateInventory }: InventoryPanelProps) {
  const prev = useRef<string[]>([]);
  const [flashNew, setFlashNew] = useState<string[]>([]);
  const [fadingOut, setFadingOut] = useState<InventoryItem[]>([]);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [draft, setDraft] = useState<InventoryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState<InventoryItem>({ name: '', description: '', quantity: 1 });

  useEffect(() => {
    const currentNames = inventory.map((i) => i.name);
    const added = currentNames.filter((n) => !prev.current.includes(n));
    const removed = prev.current.filter((n) => !currentNames.includes(n));
    if (added.length) {
      setFlashNew(added);
      const t = setTimeout(() => setFlashNew([]), 1500);
      setTimeout(() => clearTimeout(t), 0);
    }
    if (removed.length) {
      setFadingOut([]);
    }
    prev.current = currentNames;
  }, [inventory]);

  const commitEdit = (idx: number) => {
    if (!onUpdateInventory || !draft) return;
    const updated = [...inventory];
    updated[idx] = draft;
    onUpdateInventory(updated);
    setEditingIdx(null);
    setDraft(null);
  };

  const removeItem = (idx: number) => {
    if (!onUpdateInventory) return;
    onUpdateInventory(inventory.filter((_, i) => i !== idx));
  };

  if (!inventory || inventory.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-text-muted italic">Inventory empty.</div>
        {onUpdateInventory && (
          <AddItemRow
            adding={adding}
            newItem={newItem}
            setNewItem={setNewItem}
            onStart={() => setAdding(true)}
            onConfirm={() => {
              if (newItem.name.trim()) {
                onUpdateInventory([...inventory, { ...newItem }]);
                setNewItem({ name: '', description: '', quantity: 1 });
                setAdding(false);
              }
            }}
            onCancel={() => setAdding(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-1.5">
        {inventory.map((item, idx) => (
          <li key={`${item.name}-${idx}`}>
            {editingIdx === idx && draft ? (
              <div className="card px-3 py-2 space-y-1.5">
                <input
                  className="w-full text-xs"
                  placeholder="Item name"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  autoFocus
                />
                <input
                  className="w-full text-xs"
                  placeholder="Description"
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-text-muted flex-shrink-0">Qty</label>
                  <input
                    className="w-20 text-xs"
                    type="number"
                    min={0}
                    value={draft.quantity}
                    onChange={(e) => setDraft({ ...draft, quantity: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost text-xs" onClick={() => { setEditingIdx(null); setDraft(null); }}>Cancel</button>
                  <button className="btn btn-primary text-xs" onClick={() => commitEdit(idx)}>Save</button>
                </div>
              </div>
            ) : (
              <div
                className={`card px-3 py-2 flex items-start justify-between gap-2 ${
                  flashNew.includes(item.name) ? 'animate-flash-green' : ''
                }`}
                title={item.description}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text-primary truncate">{item.name}</div>
                  {item.description && (
                    <div className="text-xs text-text-muted truncate">{item.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="mono text-sm text-text-muted">×{item.quantity}</span>
                  {onUpdateInventory && (
                    <>
                      <button
                        className="btn btn-ghost !p-1"
                        title="Edit"
                        onClick={() => { setEditingIdx(idx); setDraft({ ...item }); }}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>
                      <button
                        className="btn btn-ghost !p-1 text-error hover:text-error"
                        title="Remove"
                        onClick={() => removeItem(idx)}
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {fadingOut.map((item) => (
          <li key={`gone-${item.name}`} className="card px-3 py-2 opacity-0 transition-opacity">
            {item.name}
          </li>
        ))}
      </ul>
      {onUpdateInventory && (
        <AddItemRow
          adding={adding}
          newItem={newItem}
          setNewItem={setNewItem}
          onStart={() => setAdding(true)}
          onConfirm={() => {
            if (newItem.name.trim()) {
              onUpdateInventory([...inventory, { ...newItem }]);
              setNewItem({ name: '', description: '', quantity: 1 });
              setAdding(false);
            }
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}

function AddItemRow({
  adding,
  newItem,
  setNewItem,
  onStart,
  onConfirm,
  onCancel,
}: {
  adding: boolean;
  newItem: InventoryItem;
  setNewItem: (i: InventoryItem) => void;
  onStart: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!adding) {
    return (
      <button className="btn btn-ghost text-xs w-full" onClick={onStart}>
        + Add item
      </button>
    );
  }
  return (
    <div className="card px-3 py-2 space-y-1.5">
      <input
        className="w-full text-xs"
        placeholder="Item name"
        value={newItem.name}
        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
        autoFocus
      />
      <input
        className="w-full text-xs"
        placeholder="Description"
        value={newItem.description}
        onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <label className="text-xs text-text-muted flex-shrink-0">Qty</label>
        <input
          className="w-20 text-xs"
          type="number"
          min={1}
          value={newItem.quantity}
          onChange={(e) => setNewItem({ ...newItem, quantity: parseInt(e.target.value) || 1 })}
        />
      </div>
      <div className="flex gap-2">
        <button className="btn btn-ghost text-xs" onClick={onCancel}>Cancel</button>
        <button className="btn btn-primary text-xs" onClick={onConfirm}>Add</button>
      </div>
    </div>
  );
}
