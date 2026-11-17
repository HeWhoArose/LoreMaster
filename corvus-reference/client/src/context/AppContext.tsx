import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'dark' | 'light';

interface ToastMessage {
  id: string;
  kind: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

interface AppContextValue {
  // Current game
  selectedGameId: string | null;
  setSelectedGameId: (id: string | null) => void;

  // Theme
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;

  // Layout toggles
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  infoPanelOpen: boolean;
  toggleInfoPanel: () => void;
  imageStudioOpen: boolean;
  setImageStudioOpen: (open: boolean) => void;
  toggleImageStudio: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  galleryOpen: boolean;
  setGalleryOpen: (open: boolean) => void;

  // Toasts
  toasts: ToastMessage[];
  pushToast: (kind: ToastMessage['kind'], message: string) => void;
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>('dark');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [infoPanelOpen, setInfoPanelOpen] = useState(true);
  const [imageStudioOpen, setImageStudioOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setThemeState((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);
  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);
  const toggleInfoPanel = useCallback(() => setInfoPanelOpen((v) => !v), []);
  const toggleImageStudio = useCallback(() => setImageStudioOpen((v) => !v), []);

  const pushToast = useCallback((kind: ToastMessage['kind'], message: string) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      selectedGameId,
      setSelectedGameId,
      theme,
      toggleTheme,
      setTheme,
      sidebarOpen,
      toggleSidebar,
      infoPanelOpen,
      toggleInfoPanel,
      imageStudioOpen,
      setImageStudioOpen,
      toggleImageStudio,
      settingsOpen,
      setSettingsOpen,
      galleryOpen,
      setGalleryOpen,
      toasts,
      pushToast,
      dismissToast,
    }),
    [
      selectedGameId,
      theme,
      sidebarOpen,
      infoPanelOpen,
      imageStudioOpen,
      settingsOpen,
      galleryOpen,
      toasts,
      toggleTheme,
      setTheme,
      toggleSidebar,
      toggleInfoPanel,
      toggleImageStudio,
      pushToast,
      dismissToast,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppProvider');
  return ctx;
}
