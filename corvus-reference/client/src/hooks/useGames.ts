import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import type { GameConfig, GameSnapshot } from '../types';

export function useGames() {
  const [games, setGames] = useState<GameConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await api.listGames();
      // Sort by last played descending
      list.sort((a, b) => (b.lastPlayedAt || '').localeCompare(a.lastPlayedAt || ''));
      setGames(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to load games');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createGame = useCallback(
    async (payload: Parameters<typeof api.createGame>[0]) => {
      const game = await api.createGame(payload);
      await refresh();
      return game;
    },
    [refresh],
  );

  const deleteGame = useCallback(
    async (id: string) => {
      await api.deleteGame(id);
      await refresh();
    },
    [refresh],
  );

  const updateGame = useCallback(
    async (id: string, patch: Parameters<typeof api.updateGame>[1]) => {
      const game = await api.updateGame(id, patch);
      await refresh();
      return game;
    },
    [refresh],
  );

  return { games, loading, error, refresh, createGame, deleteGame, updateGame };
}

export function useGame(gameId: string | null) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!gameId) {
      setSnapshot(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const snap = await api.getGame(gameId);
      setSnapshot(snap);
    } catch (e: any) {
      setError(e?.message || 'Failed to load game');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { snapshot, setSnapshot, loading, error, refresh };
}
