import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import type { NPCCharacter, PlayerCharacter, WorldInfo, WorldState } from '../types';

export function useGameState(gameId: string | null) {
  const [player, setPlayer] = useState<PlayerCharacter | null>(null);
  const [characters, setCharacters] = useState<NPCCharacter[]>([]);
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [world, setWorld] = useState<WorldInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gameId) {
      setPlayer(null);
      setCharacters([]);
      setWorldState(null);
      setWorld(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [p, c, w, wi] = await Promise.all([
        api.getPlayer(gameId),
        api.listCharacters(gameId),
        api.getWorldState(gameId).catch(() => null),
        api.getWorld(gameId).catch(() => null),
      ]);
      setPlayer(p);
      setCharacters(c);
      setWorldState(w);
      setWorld(wi);
    } catch (e: any) {
      setError(e?.message || 'Failed to load game state');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyGmUpdate = useCallback(
    (u: { player?: PlayerCharacter; characters?: NPCCharacter[]; worldState?: WorldState }) => {
      if (u.player && typeof u.player === 'object' && u.player.name) setPlayer(u.player);
      if (u.characters && Array.isArray(u.characters)) setCharacters(u.characters);
      if (u.worldState && typeof u.worldState === 'object') setWorldState(u.worldState);
    },
    [],
  );

  const updatePlayer = useCallback(
    async (patch: Partial<PlayerCharacter>) => {
      if (!gameId) return;
      const updated = await api.updatePlayer(gameId, patch);
      setPlayer(updated);
      return updated;
    },
    [gameId],
  );

  const updateCharacter = useCallback(
    async (charId: string, patch: Partial<NPCCharacter>) => {
      if (!gameId) return;
      const updated = await api.updateCharacter(gameId, charId, patch);
      setCharacters((prev) => prev.map((c) => (c.id === charId ? updated : c)));
      return updated;
    },
    [gameId],
  );

  const updateWorld = useCallback(
    async (patch: Partial<WorldInfo>) => {
      if (!gameId) return;
      const updated = await api.updateWorld(gameId, patch);
      setWorld(updated);
      return updated;
    },
    [gameId],
  );

  const deleteCharacter = useCallback(
    async (charId: string) => {
      if (!gameId) return;
      await api.deleteCharacter(gameId, charId);
      setCharacters((prev) => prev.filter((c) => c.id !== charId));
    },
    [gameId],
  );

  const addCharacter = useCallback(
    async (patch: Partial<NPCCharacter>) => {
      if (!gameId) return;
      const created = await api.createCharacter(gameId, patch);
      setCharacters((prev) => [...prev, created]);
      return created;
    },
    [gameId],
  );

  return {
    player,
    characters,
    worldState,
    world,
    loading,
    error,
    refresh,
    applyGmUpdate,
    updatePlayer,
    updateCharacter,
    updateWorld,
    deleteCharacter,
    addCharacter,
    setPlayer,
    setCharacters,
    setWorldState,
  };
}
