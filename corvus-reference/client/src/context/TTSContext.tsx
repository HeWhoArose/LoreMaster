import React, { createContext, useContext, useEffect } from 'react';
import { useTTSEngine, type TTSControls } from '../hooks/useTTS';
import { useSettings } from '../hooks/useSettings';

/**
 * TTSContext — single shared engine for the whole app.
 *
 * Wraps `useTTSEngine` and feeds it the persisted settings (enabled
 * + volume) on first mount, then mirrors local changes back when
 * the user toggles things in the dock. The settings panel writes
 * straight through the existing `updateSettings` patch path, so the
 * round-trip is: settings tab → server → useSettings.refresh → this
 * useEffect → engine. Dock controls bypass that to stay snappy.
 */

const TTSContext = createContext<TTSControls | undefined>(undefined);

export function TTSProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  // Seed with conservative defaults until settings load.
  const engine = useTTSEngine({
    enabled: settings?.tts?.enabled ?? false,
    volume: typeof settings?.tts?.volume === 'number' ? settings.tts.volume : 1.0,
  });

  // When settings load or change on the server, mirror enabled + volume
  // into the engine. We don't write back from here — the settings tab
  // is the source of truth for persistence.
  useEffect(() => {
    if (!settings?.tts) return;
    if (settings.tts.enabled !== engine.enabled) engine.setEnabled(settings.tts.enabled);
    if (typeof settings.tts.volume === 'number' && settings.tts.volume !== engine.volume) {
      engine.setVolume(settings.tts.volume);
    }
    // We deliberately depend on the *primitives* below, not the engine
    // object, to avoid resyncing on every dock interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.tts?.enabled, settings?.tts?.volume]);

  return <TTSContext.Provider value={engine}>{children}</TTSContext.Provider>;
}

export function useTTS(): TTSControls {
  const ctx = useContext(TTSContext);
  if (!ctx) throw new Error('useTTS must be used inside <TTSProvider>');
  return ctx;
}
