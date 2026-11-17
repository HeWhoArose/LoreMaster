import React, { useEffect, useRef, useState } from 'react';
import type { Money } from '../../types';

// v1.1.38: this component used to render the single `player.money` row. It
// now renders one row per currency (the primary `money` plus every entry in
// `extraCurrencies`) and exposes add / edit / delete for the extras. The
// primary currency stays edit-only — it can't be deleted because the on-disk
// schema reserves a slot for it, and renaming it would split history (the
// GM has been crediting / debiting that name for the whole save).

export interface MoneyDisplayProps {
  money: Money | null | undefined;
  /** v1.1.38: map of secondary currency name -> amount. Optional / may be undefined on legacy saves. */
  extraCurrencies?: Record<string, number>;
  onUpdateMoney?: (newMoney: Money) => void;
  /**
   * v1.1.38: write the full extraCurrencies map back. Editor / add / delete
   * all go through this single setter so the caller (AppShell -> useGameState)
   * can do one PATCH per change without worrying about diffing.
   */
  onUpdateExtraCurrencies?: (next: Record<string, number>) => void;
}

interface CurrencyRowProps {
  name: string;
  amount: number;
  editable: boolean;
  onChangeAmount?: (next: number) => void;
  onRename?: (nextName: string) => void;
  onDelete?: () => void;
}

function CurrencyRow({
  name,
  amount,
  editable,
  onChangeAmount,
  onRename,
  onDelete,
}: CurrencyRowProps) {
  const [delta, setDelta] = useState<number | null>(null);
  const prev = useRef<number | null>(null);
  const [editingAmount, setEditingAmount] = useState(false);
  const [amountDraft, setAmountDraft] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Flash green / red on amount change so the user notices when a GM turn
  // moved a balance. Same UX as the v1.0 MoneyDisplay.
  useEffect(() => {
    if (prev.current !== null && prev.current !== amount) {
      const d = amount - prev.current;
      setDelta(d);
      const t = setTimeout(() => setDelta(null), 1800);
      prev.current = amount;
      return () => clearTimeout(t);
    }
    prev.current = amount;
  }, [amount]);

  const commitAmount = () => {
    if (!onChangeAmount) {
      setEditingAmount(false);
      return;
    }
    const parsed = parseFloat(amountDraft);
    if (!isNaN(parsed)) onChangeAmount(parsed);
    setEditingAmount(false);
  };

  const commitName = () => {
    if (!onRename) {
      setEditingName(false);
      return;
    }
    const next = nameDraft.trim();
    if (next && next !== name) onRename(next);
    setEditingName(false);
  };

  return (
    <div
      className={`card px-3 py-2 flex items-center justify-between gap-2 ${
        delta !== null
          ? delta > 0
            ? 'animate-flash-green'
            : 'animate-flash-red'
          : ''
      }`}
    >
      {editingName ? (
        <input
          className="text-sm w-32 py-0 px-1 h-6"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitName();
            if (e.key === 'Escape') setEditingName(false);
          }}
          autoFocus
        />
      ) : (
        <span
          className={`text-sm text-text-muted capitalize truncate ${
            editable && onRename ? 'cursor-pointer hover:text-accent' : ''
          }`}
          title={editable && onRename ? 'Click to rename' : name}
          onClick={() => {
            if (!editable || !onRename) return;
            setNameDraft(name);
            setEditingName(true);
          }}
        >
          {name || 'currency'}
        </span>
      )}

      <div className="flex items-center gap-1 flex-shrink-0">
        {editingAmount ? (
          <input
            className="mono font-semibold text-text-primary w-24 text-right text-sm py-0 px-1 h-6"
            value={amountDraft}
            onChange={(e) => setAmountDraft(e.target.value)}
            onBlur={commitAmount}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitAmount();
              if (e.key === 'Escape') setEditingAmount(false);
            }}
            autoFocus
          />
        ) : (
          <span
            className={`mono font-semibold text-text-primary ${
              onChangeAmount ? 'cursor-pointer hover:text-accent' : ''
            }`}
            onClick={() => {
              if (!onChangeAmount) return;
              setAmountDraft(String(amount));
              setEditingAmount(true);
            }}
            title={onChangeAmount ? 'Click to edit' : undefined}
          >
            {amount.toLocaleString()}
            {delta !== null && (
              <span className={`ml-2 text-xs ${delta > 0 ? 'text-success' : 'text-error'}`}>
                {delta > 0 ? '+' : ''}
                {delta}
              </span>
            )}
          </span>
        )}
        {onDelete && (
          <button
            className="btn btn-ghost !py-0 !px-1 !text-[11px] text-text-muted hover:text-error"
            onClick={onDelete}
            title="Remove this currency"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

export function MoneyDisplay({
  money,
  extraCurrencies,
  onUpdateMoney,
  onUpdateExtraCurrencies,
}: MoneyDisplayProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAmount, setNewAmount] = useState('0');

  // Render nothing if there's no money AND no extras AND no way to add. Keeps
  // the section blank rather than showing a stub for fresh games with no
  // primary currency configured — vanishingly rare but well-defined.
  const extras = extraCurrencies || {};
  const extraEntries = Object.entries(extras);
  if (!money && extraEntries.length === 0 && !onUpdateExtraCurrencies) return null;

  const handleAdd = () => {
    if (!onUpdateExtraCurrencies) return;
    const name = newName.trim();
    if (!name) return;
    // Block names that collide with the primary currency or an existing extra
    // (case-insensitive). The user almost certainly meant to edit the
    // existing one rather than create a duplicate.
    const lower = name.toLowerCase();
    if (money && money.currencyName.toLowerCase() === lower) return;
    if (extraEntries.some(([k]) => k.toLowerCase() === lower)) return;
    const amt = parseFloat(newAmount);
    const next = { ...extras, [name]: isNaN(amt) ? 0 : amt };
    onUpdateExtraCurrencies(next);
    setNewName('');
    setNewAmount('0');
    setAdding(false);
  };

  const handleRenameExtra = (oldName: string, nextName: string) => {
    if (!onUpdateExtraCurrencies) return;
    const lower = nextName.toLowerCase();
    // Same collision rules as add. Silently no-op rather than throwing so the
    // input just snaps back to the old name.
    if (money && money.currencyName.toLowerCase() === lower) return;
    if (extraEntries.some(([k]) => k !== oldName && k.toLowerCase() === lower)) return;
    const next: Record<string, number> = {};
    // Preserve insertion order so the user's mental model of "the row order
    // I see" doesn't shuffle on rename.
    for (const [k, v] of extraEntries) {
      next[k === oldName ? nextName : k] = v;
    }
    onUpdateExtraCurrencies(next);
  };

  const handleEditExtra = (name: string, amount: number) => {
    if (!onUpdateExtraCurrencies) return;
    onUpdateExtraCurrencies({ ...extras, [name]: amount });
  };

  const handleDeleteExtra = (name: string) => {
    if (!onUpdateExtraCurrencies) return;
    const next = { ...extras };
    delete next[name];
    onUpdateExtraCurrencies(next);
  };

  return (
    <div className="space-y-1">
      {money && (
        <CurrencyRow
          name={money.currencyName}
          amount={money.amount}
          editable={false}
          onChangeAmount={
            onUpdateMoney
              ? (next) => onUpdateMoney({ ...money, amount: next })
              : undefined
          }
          // No rename on the primary — see comment at top of file.
        />
      )}

      {extraEntries.map(([name, amount]) => (
        <CurrencyRow
          key={name}
          name={name}
          amount={amount}
          editable={true}
          onChangeAmount={
            onUpdateExtraCurrencies
              ? (next) => handleEditExtra(name, next)
              : undefined
          }
          onRename={
            onUpdateExtraCurrencies
              ? (next) => handleRenameExtra(name, next)
              : undefined
          }
          onDelete={
            onUpdateExtraCurrencies ? () => handleDeleteExtra(name) : undefined
          }
        />
      ))}

      {onUpdateExtraCurrencies && (
        adding ? (
          <div className="card px-3 py-2 flex items-center gap-2">
            <input
              className="text-sm flex-1 py-0 px-1 h-6"
              placeholder="silver, copper, …"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') {
                  setAdding(false);
                  setNewName('');
                  setNewAmount('0');
                }
              }}
              autoFocus
            />
            <input
              className="mono text-sm w-20 text-right py-0 px-1 h-6"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
            <button
              className="btn btn-primary !py-0 !px-2 !text-[11px]"
              onClick={handleAdd}
              disabled={!newName.trim()}
            >
              Add
            </button>
            <button
              className="btn btn-ghost !py-0 !px-2 !text-[11px]"
              onClick={() => {
                setAdding(false);
                setNewName('');
                setNewAmount('0');
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            className="btn btn-ghost w-full !py-1 !text-[11px] text-text-muted"
            onClick={() => setAdding(true)}
            title="Add another currency type (silver, gold, spirit stones, etc.)"
          >
            + Add currency
          </button>
        )
      )}
    </div>
  );
}
