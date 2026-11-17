import React from 'react';
import { AppShell } from './components/layout/AppShell';
import { AppProvider } from './context/AppContext';
import { TTSProvider } from './context/TTSContext';

export default function App() {
  return (
    <AppProvider>
      <TTSProvider>
        <AppShell />
      </TTSProvider>
    </AppProvider>
  );
}
