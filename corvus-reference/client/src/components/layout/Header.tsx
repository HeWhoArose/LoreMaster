import React from 'react';
import { useAppContext } from '../../context/AppContext';

// Brand logo — uses the bundled raven SVG from /public so the asset stays in
// one place and renders crisply at any size.
const BrandLogo: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <img
    src="/logo.svg"
    width={size}
    height={size}
    alt="Corvus"
    className="rounded-sm"
    style={{ width: size, height: size, display: 'block' }}
  />
);

export interface HeaderProps {
  gameTitle?: string;
}

export function Header({ gameTitle }: HeaderProps) {
  const {
    theme,
    toggleTheme,
    toggleSidebar,
    toggleInfoPanel,
    toggleImageStudio,
    imageStudioOpen,
    setSettingsOpen,
    setGalleryOpen,
    sidebarOpen,
    infoPanelOpen,
  } = useAppContext();

  return (
    <header className="h-14 px-4 flex items-center justify-between bg-surface border-b border-border flex-shrink-0 z-20">
      <div className="flex items-center gap-3 min-w-0">
        <button
          className="btn btn-ghost !p-1.5"
          onClick={toggleSidebar}
          title={sidebarOpen ? 'Hide library' : 'Show library'}
          aria-label="Toggle library"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <BrandLogo />
          <div className="leading-tight">
            <div className="font-semibold text-text-primary tracking-wide">
              Corvus <span className="text-accent">Story Core</span>
            </div>
            {gameTitle && (
              <div className="text-xs text-text-muted truncate max-w-[32ch]">{gameTitle}</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="btn btn-ghost"
          onClick={() => setGalleryOpen(true)}
          title="Open gallery"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          <span className="hidden md:inline text-sm">Gallery</span>
        </button>

        <button
          className={`btn ${imageStudioOpen ? 'btn-primary' : 'btn-ghost'}`}
          onClick={toggleImageStudio}
          title="Image studio"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19l7-7 3 3-7 7-3-3z" />
            <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
            <path d="M2 2l7.586 7.586" />
            <circle cx="11" cy="11" r="2" />
          </svg>
          <span className="hidden md:inline text-sm">Studio</span>
        </button>

        <button
          className="btn btn-ghost !p-1.5"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <button
          className="btn btn-ghost !p-1.5"
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          aria-label="Settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        <button
          className="btn btn-ghost !p-1.5"
          onClick={toggleInfoPanel}
          title={infoPanelOpen ? 'Hide info panel' : 'Show info panel'}
          aria-label="Toggle info panel"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>
    </header>
  );
}
