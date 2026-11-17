import React, { useEffect, useState } from 'react';
import type { DesignDraft } from '../../api';
import type { GameConfig, GameSnapshot } from '../../types';
import { Modal } from '../common/Modal';
import { FromImagePanel } from '../common/FromImagePanel';
import { DesignGameChat } from './DesignGameChat';

const GENRES = [
  'Cyberpunk',
  'Fantasy',
  'Sci-Fi',
  'Post-Apocalyptic',
  'Modern',
  'Historical',
  'Horror',
  'Custom',
];

interface StatRow {
  id: string;
  key: string;
  value: number;
}
interface AbilityRow {
  id: string;
  name: string;
  description: string;
  type: string;
  level: number;
}
interface InventoryRow {
  id: string;
  name: string;
  description: string;
  quantity: number;
}

const rid = () => Math.random().toString(36).slice(2);

export interface NewGameDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (
    payload: Parameters<typeof import('../../api').createGame>[0],
  ) => Promise<GameConfig>;
  /** When provided, the dialog opens with all fields prefilled from this game snapshot. */
  prefillFromGame?: GameSnapshot | null;
}

export function NewGameDialog({ open, onClose, onCreate, prefillFromGame }: NewGameDialogProps) {
  const [name, setName] = useState('');
  const [genre, setGenre] = useState('Cyberpunk');
  const [description, setDescription] = useState('');
  const [setting, setSetting] = useState('');
  const [tone, setTone] = useState('');
  const [rules, setRules] = useState('');
  const [era, setEra] = useState('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [currencyName, setCurrencyName] = useState('credits');
  const [narratorEnabled, setNarratorEnabled] = useState(true);
  const [playerName, setPlayerName] = useState('');
  const [playerBackstory, setPlayerBackstory] = useState('');
  const [playerAppearance, setPlayerAppearance] = useState('');
  const [money, setMoney] = useState(100);
  const [stats, setStats] = useState<StatRow[]>([
    { id: rid(), key: 'Health', value: 100 },
    { id: rid(), key: 'Stamina', value: 100 },
  ]);
  const [abilities, setAbilities] = useState<AbilityRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'form' | 'chat' | 'image'>('form');

  const reset = () => {
    setName('');
    setGenre('Cyberpunk');
    setDescription('');
    setSetting('');
    setTone('');
    setRules('');
    setEra('');
    setCustomInstructions('');
    setCurrencyName('credits');
    setNarratorEnabled(true);
    setPlayerName('');
    setPlayerBackstory('');
    setPlayerAppearance('');
    setMoney(100);
    setStats([
      { id: rid(), key: 'Health', value: 100 },
      { id: rid(), key: 'Stamina', value: 100 },
    ]);
    setAbilities([]);
    setInventory([]);
    setError(null);
    setSubmitting(false);
    setView('form');
  };

  // Prefill the form from a full game snapshot (used by the Copy / Duplicate game button).
  const applyGameSnapshot = (snap: GameSnapshot) => {
    const cfg = snap.config;
    if (cfg?.name) setName(`${cfg.name} (copy)`);
    if (cfg?.genre) {
      if (GENRES.includes(cfg.genre)) setGenre(cfg.genre);
      else setGenre('Custom');
    }
    if (typeof cfg?.description === 'string') setDescription(cfg.description);

    const w = snap.world || ({} as any);
    if (typeof w.setting === 'string') setSetting(w.setting);
    if (typeof w.tone === 'string') setTone(w.tone);
    if (typeof w.rules === 'string') setRules(w.rules);
    if (typeof w.era === 'string') setEra(w.era);
    if (typeof w.customInstructions === 'string') setCustomInstructions(w.customInstructions);
    if (typeof w.currencyName === 'string' && w.currencyName.trim()) setCurrencyName(w.currencyName);
    if (typeof w.narratorEnabled === 'boolean') setNarratorEnabled(w.narratorEnabled);

    const p = snap.player || ({} as any);
    if (typeof p.name === 'string') setPlayerName(p.name);
    if (typeof p.backstory === 'string') setPlayerBackstory(p.backstory);
    if (typeof p.appearance === 'string') setPlayerAppearance(p.appearance);
    if (p.money && typeof p.money.amount === 'number') setMoney(p.money.amount);

    if (p.stats && typeof p.stats === 'object') {
      const rows: StatRow[] = Object.entries(p.stats as Record<string, number>)
        .filter(([k]) => typeof k === 'string' && k.trim().length > 0)
        .map(([k, v]) => ({ id: rid(), key: k, value: Number(v) || 0 }));
      if (rows.length > 0) setStats(rows);
    }
    if (Array.isArray(p.abilities)) {
      setAbilities(
        p.abilities
          .filter((a: any) => a && typeof a.name === 'string')
          .map((a: any) => ({
            id: rid(),
            name: a.name,
            description: a.description || '',
            type: a.type || 'skill',
            level: Number(a.level) || 1,
          })),
      );
    }
    if (Array.isArray(p.inventory)) {
      setInventory(
        p.inventory
          .filter((i: any) => i && typeof i.name === 'string')
          .map((i: any) => ({
            id: rid(),
            name: i.name,
            description: i.description || '',
            quantity: Number(i.quantity) || 1,
          })),
      );
    }

    setError(null);
    setView('form');
  };

  // Apply prefill whenever the dialog opens with a snapshot.
  // We track the snapshot id so we don't re-apply on every render.
  const [appliedPrefillId, setAppliedPrefillId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) {
      // Reset the applied marker when the dialog closes so reopening with the
      // same source game still triggers a fresh prefill.
      if (appliedPrefillId !== null) setAppliedPrefillId(null);
      return;
    }
    if (prefillFromGame && prefillFromGame.config?.id !== appliedPrefillId) {
      applyGameSnapshot(prefillFromGame);
      setAppliedPrefillId(prefillFromGame.config?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefillFromGame]);

  // Prefill the form from a draft produced by the design chat agent.
  const applyDraft = (d: DesignDraft) => {
    if (d.name) setName(d.name);
    if (d.genre && GENRES.includes(d.genre)) setGenre(d.genre);
    else if (d.genre) setGenre('Custom');
    if (typeof d.description === 'string') setDescription(d.description);

    const w = d.world || {};
    if (typeof w.setting === 'string') setSetting(w.setting);
    if (typeof w.tone === 'string') setTone(w.tone);
    if (typeof w.rules === 'string') setRules(w.rules);
    if (typeof w.era === 'string') setEra(w.era);
    if (typeof w.customInstructions === 'string') setCustomInstructions(w.customInstructions);
    const currency = (w.currencyName || '').trim();
    if (currency) setCurrencyName(currency);

    const p = d.player || {};
    if (typeof p.name === 'string') setPlayerName(p.name);
    if (typeof p.backstory === 'string') setPlayerBackstory(p.backstory);
    if (typeof p.appearance === 'string') setPlayerAppearance(p.appearance);
    if (p.money && typeof p.money.amount === 'number') setMoney(p.money.amount);

    if (p.stats && typeof p.stats === 'object') {
      const rows: StatRow[] = Object.entries(p.stats)
        .filter(([k]) => typeof k === 'string' && k.trim().length > 0)
        .map(([k, v]) => ({ id: rid(), key: k, value: Number(v) || 0 }));
      if (rows.length > 0) setStats(rows);
    }
    if (Array.isArray(p.abilities)) {
      setAbilities(
        p.abilities
          .filter((a) => a && typeof a.name === 'string')
          .map((a) => ({
            id: rid(),
            name: a.name,
            description: a.description || '',
            type: a.type || 'skill',
            level: Number(a.level) || 1,
          })),
      );
    }
    if (Array.isArray(p.inventory)) {
      setInventory(
        p.inventory
          .filter((i) => i && typeof i.name === 'string')
          .map((i) => ({
            id: rid(),
            name: i.name,
            description: i.description || '',
            quantity: Number(i.quantity) || 1,
          })),
      );
    }

    setError(null);
    setView('form');
  };

  const close = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const submit = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Game name is required');
      return;
    }
    if (!playerName.trim()) {
      setError('Player name is required');
      return;
    }
    setSubmitting(true);
    try {
      const statsMap: Record<string, number> = {};
      for (const s of stats) {
        if (s.key.trim()) statsMap[s.key.trim()] = Number(s.value) || 0;
      }
      await onCreate({
        name: name.trim(),
        genre,
        description: description.trim(),
        world: {
          setting: setting.trim(),
          tone: tone.trim(),
          rules: rules.trim(),
          currencyName: currencyName.trim() || 'credits',
          era: era.trim(),
          customInstructions: customInstructions.trim(),
          narratorEnabled,
        },
        player: {
          name: playerName.trim(),
          backstory: playerBackstory.trim(),
          appearance: playerAppearance.trim(),
          stats: statsMap,
          money: { currencyName: currencyName.trim() || 'credits', amount: Number(money) || 0 },
          abilities: abilities.map((a) => ({
            name: a.name,
            description: a.description,
            type: a.type,
            level: Number(a.level) || 1,
          })),
          inventory: inventory.map((i) => ({
            name: i.name,
            description: i.description,
            quantity: Number(i.quantity) || 1,
          })),
        },
      });
      reset();
    } catch (e: any) {
      setError(e?.message || 'Failed to create game');
    } finally {
      setSubmitting(false);
    }
  };

  const footer = (
    <div className="flex items-center gap-2 w-full">
      {view === 'form' ? (
        <>
          <button
            type="button"
            className="btn"
            onClick={() => setView('chat')}
            disabled={submitting}
            title="Chat with an AI to design this game for you"
          >
            ✨ Design with AI
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setView('image')}
            disabled={submitting}
            title="Upload an image and have a vision model design the game from it"
          >
            📷 From Image
          </button>
        </>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => setView('form')}
          disabled={submitting}
        >
          ← Back to form
        </button>
      )}
      <div className="ml-auto flex gap-2">
        <button className="btn" onClick={close} disabled={submitting}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={submit}
          disabled={submitting || view !== 'form'}
          title={view !== 'form' ? 'Switch back to the form to create the game' : undefined}
        >
          {submitting ? 'Creating…' : 'Create Game'}
        </button>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={
        view === 'chat'
          ? 'Design with AI'
          : view === 'image'
          ? 'Design from Image'
          : 'Create New Game'
      }
      size="xl"
      footer={footer}
    >
      {view === 'chat' ? (
        <DesignGameChat onApplyDraft={applyDraft} />
      ) : view === 'image' ? (
        <FromImagePanel
          mode="game"
          applyLabel="Apply to form"
          onApply={(d) => applyDraft(d as DesignDraft)}
        />
      ) : (
        <FormView
          error={error}
          name={name}
          setName={setName}
          genre={genre}
          setGenre={setGenre}
          description={description}
          setDescription={setDescription}
          setting={setting}
          setSetting={setSetting}
          tone={tone}
          setTone={setTone}
          rules={rules}
          setRules={setRules}
          era={era}
          setEra={setEra}
          customInstructions={customInstructions}
          setCustomInstructions={setCustomInstructions}
          currencyName={currencyName}
          setCurrencyName={setCurrencyName}
          narratorEnabled={narratorEnabled}
          setNarratorEnabled={setNarratorEnabled}
          playerName={playerName}
          setPlayerName={setPlayerName}
          playerBackstory={playerBackstory}
          setPlayerBackstory={setPlayerBackstory}
          playerAppearance={playerAppearance}
          setPlayerAppearance={setPlayerAppearance}
          money={money}
          setMoney={setMoney}
          stats={stats}
          setStats={setStats}
          abilities={abilities}
          setAbilities={setAbilities}
          inventory={inventory}
          setInventory={setInventory}
        />
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Form view (extracted so the chat view can replace it cleanly)
// ---------------------------------------------------------------------------

interface FormViewProps {
  error: string | null;
  name: string;
  setName: (v: string) => void;
  genre: string;
  setGenre: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  setting: string;
  setSetting: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  rules: string;
  setRules: (v: string) => void;
  era: string;
  setEra: (v: string) => void;
  customInstructions: string;
  setCustomInstructions: (v: string) => void;
  currencyName: string;
  setCurrencyName: (v: string) => void;
  narratorEnabled: boolean;
  setNarratorEnabled: (v: boolean) => void;
  playerName: string;
  setPlayerName: (v: string) => void;
  playerBackstory: string;
  setPlayerBackstory: (v: string) => void;
  playerAppearance: string;
  setPlayerAppearance: (v: string) => void;
  money: number;
  setMoney: (v: number) => void;
  stats: StatRow[];
  setStats: React.Dispatch<React.SetStateAction<StatRow[]>>;
  abilities: AbilityRow[];
  setAbilities: React.Dispatch<React.SetStateAction<AbilityRow[]>>;
  inventory: InventoryRow[];
  setInventory: React.Dispatch<React.SetStateAction<InventoryRow[]>>;
}

function FormView({
  error,
  name,
  setName,
  genre,
  setGenre,
  description,
  setDescription,
  setting,
  setSetting,
  tone,
  setTone,
  rules,
  setRules,
  era,
  setEra,
  customInstructions,
  setCustomInstructions,
  currencyName,
  setCurrencyName,
  narratorEnabled,
  setNarratorEnabled,
  playerName,
  setPlayerName,
  playerBackstory,
  setPlayerBackstory,
  playerAppearance,
  setPlayerAppearance,
  money,
  setMoney,
  stats,
  setStats,
  abilities,
  setAbilities,
  inventory,
  setInventory,
}: FormViewProps) {
  return (
    <>
      {error && (
        <div className="mb-4 p-3 rounded border border-error text-error text-sm bg-error/10">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Game Basics */}
        <section>
          <h3 className="text-sm font-semibold text-text-primary mb-2 uppercase tracking-wider">
            Game
          </h3>
          <div className="space-y-3">
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full" />
            </Field>
            <Field label="Genre">
              <select value={genre} onChange={(e) => setGenre(e.target.value)} className="w-full">
                {GENRES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <textarea
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full"
                placeholder="A short description of what this game is about"
              />
            </Field>
          </div>
        </section>

        {/* World */}
        <section>
          <h3 className="text-sm font-semibold text-text-primary mb-2 uppercase tracking-wider">
            World
          </h3>
          <div className="space-y-3">
            <Field label="Setting">
              <textarea
                rows={3}
                value={setting}
                onChange={(e) => setSetting(e.target.value)}
                className="w-full"
                placeholder="The world, location, environment..."
              />
            </Field>
            <Field label="Tone">
              <input
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full"
                placeholder="e.g. gritty noir, hopeful adventure, cosmic horror"
              />
            </Field>
            <Field label="Era">
              <input
                value={era}
                onChange={(e) => setEra(e.target.value)}
                className="w-full"
                placeholder="e.g. 2087, Third Age"
              />
            </Field>
            <Field label="Rules / constraints">
              <textarea
                rows={2}
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                className="w-full"
                placeholder="Magic systems, technology limits, etc."
              />
            </Field>
            <Field label="Custom GM instructions">
              <textarea
                rows={2}
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                className="w-full"
                placeholder="Extra instructions for the game master LLM"
              />
            </Field>
            <Field label="Currency name">
              <input
                value={currencyName}
                onChange={(e) => setCurrencyName(e.target.value)}
                className="w-full"
              />
            </Field>
            <label className="flex items-start gap-2 cursor-pointer pt-1">
              <input
                type="checkbox"
                className="mt-1"
                checked={narratorEnabled}
                onChange={(e) => setNarratorEnabled(e.target.checked)}
              />
              <span className="flex-1">
                <span className="text-sm text-text-primary block">Narrator enabled</span>
                <span className="text-xs text-text-muted">
                  When off, the storyteller speaks only through characters — no [Narrator]
                  blocks. You can change this any time from the World Info panel.
                </span>
              </span>
            </label>
          </div>
        </section>

        {/* Player */}
        <section className="md:col-span-2">
          <h3 className="text-sm font-semibold text-text-primary mb-2 uppercase tracking-wider">
            Player Character
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Name">
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full"
              />
            </Field>
            <Field label={`Starting ${currencyName || 'currency'}`}>
              <input
                type="number"
                value={money}
                onChange={(e) => setMoney(Number(e.target.value))}
                className="w-full"
              />
            </Field>
            <Field label="Backstory" span={2}>
              <textarea
                rows={3}
                value={playerBackstory}
                onChange={(e) => setPlayerBackstory(e.target.value)}
                className="w-full"
              />
            </Field>
            <Field label="Appearance" span={2}>
              <textarea
                rows={2}
                value={playerAppearance}
                onChange={(e) => setPlayerAppearance(e.target.value)}
                className="w-full"
                placeholder="Physical description used for image generation"
              />
            </Field>
          </div>
        </section>

        {/* Stats */}
        <section className="md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Starting Stats
            </h3>
            <button
              className="btn btn-ghost text-sm"
              onClick={() => setStats((s) => [...s, { id: rid(), key: '', value: 0 }])}
              type="button"
            >
              + Add stat
            </button>
          </div>
          <div className="space-y-2">
            {stats.length === 0 && (
              <div className="text-xs text-text-muted">No stats defined.</div>
            )}
            {stats.map((s) => (
              <div key={s.id} className="flex gap-2">
                <input
                  placeholder="Stat name"
                  value={s.key}
                  onChange={(e) =>
                    setStats((prev) => prev.map((r) => (r.id === s.id ? { ...r, key: e.target.value } : r)))
                  }
                  className="flex-1"
                />
                <input
                  type="number"
                  value={s.value}
                  onChange={(e) =>
                    setStats((prev) =>
                      prev.map((r) => (r.id === s.id ? { ...r, value: Number(e.target.value) } : r)),
                    )
                  }
                  className="w-32"
                />
                <button
                  className="btn btn-ghost !px-2"
                  onClick={() => setStats((prev) => prev.filter((r) => r.id !== s.id))}
                  type="button"
                  aria-label="Remove stat"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Abilities */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Starting Abilities
            </h3>
            <button
              className="btn btn-ghost text-sm"
              onClick={() =>
                setAbilities((a) => [
                  ...a,
                  { id: rid(), name: '', description: '', type: 'skill', level: 1 },
                ])
              }
              type="button"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {abilities.length === 0 && (
              <div className="text-xs text-text-muted">No abilities.</div>
            )}
            {abilities.map((a) => (
              <div key={a.id} className="card p-2 space-y-1">
                <div className="flex gap-2">
                  <input
                    placeholder="Ability name"
                    value={a.name}
                    onChange={(e) =>
                      setAbilities((prev) =>
                        prev.map((r) => (r.id === a.id ? { ...r, name: e.target.value } : r)),
                      )
                    }
                    className="flex-1"
                  />
                  <input
                    placeholder="type"
                    value={a.type}
                    onChange={(e) =>
                      setAbilities((prev) =>
                        prev.map((r) => (r.id === a.id ? { ...r, type: e.target.value } : r)),
                      )
                    }
                    className="w-24"
                  />
                  <input
                    type="number"
                    value={a.level}
                    onChange={(e) =>
                      setAbilities((prev) =>
                        prev.map((r) =>
                          r.id === a.id ? { ...r, level: Number(e.target.value) } : r,
                        ),
                      )
                    }
                    className="w-20"
                  />
                  <button
                    className="btn btn-ghost !px-2"
                    onClick={() => setAbilities((prev) => prev.filter((r) => r.id !== a.id))}
                    type="button"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  rows={1}
                  placeholder="Description"
                  value={a.description}
                  onChange={(e) =>
                    setAbilities((prev) =>
                      prev.map((r) => (r.id === a.id ? { ...r, description: e.target.value } : r)),
                    )
                  }
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Inventory */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
              Starting Inventory
            </h3>
            <button
              className="btn btn-ghost text-sm"
              onClick={() =>
                setInventory((a) => [
                  ...a,
                  { id: rid(), name: '', description: '', quantity: 1 },
                ])
              }
              type="button"
            >
              + Add
            </button>
          </div>
          <div className="space-y-2">
            {inventory.length === 0 && (
              <div className="text-xs text-text-muted">No items.</div>
            )}
            {inventory.map((i) => (
              <div key={i.id} className="card p-2 space-y-1">
                <div className="flex gap-2">
                  <input
                    placeholder="Item name"
                    value={i.name}
                    onChange={(e) =>
                      setInventory((prev) =>
                        prev.map((r) => (r.id === i.id ? { ...r, name: e.target.value } : r)),
                      )
                    }
                    className="flex-1"
                  />
                  <input
                    type="number"
                    value={i.quantity}
                    onChange={(e) =>
                      setInventory((prev) =>
                        prev.map((r) =>
                          r.id === i.id ? { ...r, quantity: Number(e.target.value) } : r,
                        ),
                      )
                    }
                    className="w-20"
                  />
                  <button
                    className="btn btn-ghost !px-2"
                    onClick={() => setInventory((prev) => prev.filter((r) => r.id !== i.id))}
                    type="button"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  rows={1}
                  placeholder="Description"
                  value={i.description}
                  onChange={(e) =>
                    setInventory((prev) =>
                      prev.map((r) => (r.id === i.id ? { ...r, description: e.target.value } : r)),
                    )
                  }
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function Field({
  label,
  children,
  span = 1,
}: {
  label: string;
  children: React.ReactNode;
  span?: 1 | 2;
}) {
  return (
    <label className={`block ${span === 2 ? 'md:col-span-2' : ''}`}>
      <span className="text-xs text-text-muted mb-1 block">{label}</span>
      {children}
    </label>
  );
}
