import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import type { GlobalConfig } from '../types';

export function useSettings() {
  const [settings, setSettings] = useState<GlobalConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await api.getSettings();
      setSettings(cfg);
    } catch (e: any) {
      setError(e?.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const update = useCallback(async (patch: Partial<GlobalConfig>) => {
    setSaving(true);
    setError(null);
    try {
      const cfg = await api.updateSettings(patch);
      setSettings(cfg);
      return cfg;
    } catch (e: any) {
      setError(e?.message || 'Failed to save settings');
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  // Test functions accept an optional override URL so the settings modal can
  // test the *draft* URL the user has typed in, not the last-saved one.
  const testLMStudio = useCallback(
    async (override?: { url?: string; apiKey?: string; model?: string }) => {
      return api.testLMStudio(override);
    },
    [],
  );

  const testComfyUI = useCallback(async (override?: { url?: string }) => {
    return api.testComfyUI(override);
  }, []);

  return { settings, loading, saving, error, refresh, update, testLMStudio, testComfyUI };
}
