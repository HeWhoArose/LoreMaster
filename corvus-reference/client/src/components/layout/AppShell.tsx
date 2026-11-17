import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useChat } from '../../hooks/useChat';
import { useGames, useGame } from '../../hooks/useGames';
import { useGameState } from '../../hooks/useGameState';
import { useImageStudio } from '../../hooks/useImageStudio';
import { useSettings } from '../../hooks/useSettings';
import type { ImageMetadata, NPCCharacter } from '../../types';
import { ChatPanel } from '../chat/ChatPanel';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { Toasts } from '../common/Toasts';
import { TTSDock } from '../common/TTSDock';
import { ImageGallery } from '../image/ImageGallery';
import { ImageLightbox } from '../image/ImageLightbox';
import { ImageStudio } from '../image/ImageStudio';
import { RecentImagesStrip } from '../image/RecentImagesStrip';
import { InfoPanel } from '../info/InfoPanel';
import { SettingsPage } from '../settings/SettingsPage';
import { GameLibrary } from '../sidebar/GameLibrary';
import { Header } from './Header';

export function AppShell() {
  const {
    selectedGameId,
    setSelectedGameId,
    sidebarOpen,
    infoPanelOpen,
    imageStudioOpen,
    setImageStudioOpen,
    settingsOpen,
    setSettingsOpen,
    galleryOpen,
    setGalleryOpen,
    pushToast,
  } = useAppContext();

  const { games, loading: gamesLoading, createGame, deleteGame, refresh: refreshGames } = useGames();
  const { snapshot } = useGame(selectedGameId);

  const gameState = useGameState(selectedGameId);
  const {
    player,
    characters,
    worldState,
    world,
    applyGmUpdate,
    refresh: refreshGameState,
    updatePlayer,
    updateWorld,
    updateCharacter,
    deleteCharacter,
    addCharacter,
    setCharacters,
    setWorldState,
  } = gameState;

  const chat = useChat(selectedGameId, applyGmUpdate);
  const studio = useImageStudio(selectedGameId);
  const settings = useSettings();
  const [recentLightbox, setRecentLightbox] = useState<ImageMetadata | null>(null);

  // After streaming finishes without gm_update, refresh the state ourselves
  useEffect(() => {
    if (!chat.status.streaming && !chat.status.processing) {
      // Nothing to do; gm_update should have applied. But as a safety net,
      // if we just finished, refresh silently after a short delay.
    }
  }, [chat.status.streaming, chat.status.processing]);

  // On fresh game selection, refresh state
  useEffect(() => {
    if (selectedGameId) {
      void refreshGameState();
    }
  }, [selectedGameId, refreshGameState]);

  // Toasts for chat errors
  useEffect(() => {
    if (chat.status.error) {
      pushToast('error', chat.status.error);
    }
  }, [chat.status.error, pushToast]);

  const onSendNpcToStudio = useCallback(
    (npc: NPCCharacter) => {
      studio.setMode('txt2img');
      studio.setPrompt(npc.image?.basePrompt || npc.appearance || '');
      studio.setNegativePrompt(npc.image?.baseNegative || '');
      setImageStudioOpen(true);
    },
    [studio, setImageStudioOpen],
  );

  const gameTitle = snapshot?.config.name;

  const examplePrompts = useMemo(
    () => settings.settings?.comfyui?.examplePrompts ?? [],
    [settings.settings],
  );

  return (
    <div className="h-full w-full flex flex-col bg-bg text-text-primary">
      <Header gameTitle={gameTitle} />

      <div className="flex flex-1 min-h-0">
        {sidebarOpen && (
          <GameLibrary
            games={games}
            loading={gamesLoading}
            selectedId={selectedGameId}
            onSelect={(id) => setSelectedGameId(id)}
            onCreate={createGame}
            onRefresh={refreshGames}
            onDelete={async (id) => {
              await deleteGame(id);
              if (selectedGameId === id) {
                setSelectedGameId(null);
              }
            }}
          />
        )}

        <div className="relative flex-1 min-w-0 flex">
          <ErrorBoundary resetKey={selectedGameId}>
            <ChatPanel
              gameId={selectedGameId}
              gameTitle={gameTitle}
              messages={chat.messages}
              characters={characters}
              appearance={settings.settings?.appearance ?? null}
              streamingId={chat.streamingId}
              streamingContent={chat.streamingContent}
              streaming={chat.status.streaming}
              processing={chat.status.processing}
              error={chat.status.error}
              onSend={(content, opts) => chat.sendMessage(content, opts)}
              onStop={chat.stopStream}
              onEdit={(id, newContent, regen) => chat.editMessage(id, newContent, regen)}
              onDelete={(id) => chat.deleteMessage(id)}
              onRegenerate={(id) => chat.regenerate(id)}
              onSwipe={(id, idx) => chat.selectAlternative(id, idx)}
            />
          </ErrorBoundary>

          {selectedGameId && (
            <RecentImagesStrip
              gameId={selectedGameId}
              images={studio.gallery}
              onOpen={setRecentLightbox}
            />
          )}
        </div>

        {infoPanelOpen && (
          <ErrorBoundary resetKey={selectedGameId}>
            <InfoPanel
              gameId={selectedGameId}
              player={player}
              characters={characters}
              world={world}
              worldState={worldState}
              onSendNpcToStudio={onSendNpcToStudio}
              onUpdatePlayer={updatePlayer}
              onUpdateWorld={updateWorld}
              onUpdateCharacter={updateCharacter}
              onDeleteCharacter={deleteCharacter}
              onAddCharacter={addCharacter}
              onCharacterUpdated={(updated) =>
                setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
              }
              onCharacterDeleted={(charId) =>
                // v1.1.31: NPCCard's Deny action already hit the server's
                // /deny route (which hard-deletes). We just drop the id from
                // local state so the sidebar updates immediately.
                setCharacters((prev) => prev.filter((c) => c.id !== charId))
              }
              onPromptToSpeak={(npc) => {
                // v1.1.30: Prompt-to-speak. Empty user content + singleSpeakerId
                // tells the orchestrator: "continuation turn, only NPC X speaks."
                // We use mode 'character' here so the server scopes context to
                // that NPC; if the active chat mode is group, the ChatPanel's
                // own group-mode plumbing keeps running independently.
                void chat.sendMessage('', {
                  mode: 'character',
                  activeCharacterId: npc.id,
                  singleSpeakerId: npc.id,
                });
              }}
              // v1.1.36: manual world-state editor. The editor calls this on
              // every successful CRUD mutation with the fresh full WorldState
              // returned by the server, so we just replace local state.
              onUpdateWorldState={setWorldState}
            />
          </ErrorBoundary>
        )}
      </div>

      <ImageStudio
        open={imageStudioOpen}
        onClose={() => setImageStudioOpen(false)}
        gameId={selectedGameId}
        studio={studio}
        examplePrompts={examplePrompts}
        onPortraitSet={() => {
          // v1.1.22: refresh NPC list so the new portrait shows everywhere.
          void refreshGameState();
        }}
      />

      <ImageLightbox
        gameId={selectedGameId}
        image={recentLightbox}
        open={recentLightbox !== null}
        onClose={() => setRecentLightbox(null)}
        siblings={studio.gallery}
        onSendToImg2Img={(i) => {
          studio.sendToImg2Img(i);
          setRecentLightbox(null);
          setImageStudioOpen(true);
        }}
        onSendToInpaint={(i) => {
          studio.sendToInpaint(i);
          setRecentLightbox(null);
          setImageStudioOpen(true);
        }}
        onDelete={async (i) => {
          await studio.deleteImage(i.id);
          setRecentLightbox(null);
        }}
        onPortraitSet={() => {
          // v1.1.22: refresh the NPC list so the new portrait shows up everywhere.
          void refreshGameState();
        }}
      />

      <ImageGallery
        gameId={selectedGameId}
        images={studio.gallery}
        loading={studio.galleryLoading}
        open={galleryOpen}
        onClose={() => setGalleryOpen(false)}
        onSendToImg2Img={(img) => {
          studio.sendToImg2Img(img);
          setGalleryOpen(false);
          setImageStudioOpen(true);
        }}
        onSendToInpaint={(img) => {
          studio.sendToInpaint(img);
          setGalleryOpen(false);
          setImageStudioOpen(true);
        }}
        onDelete={(id) => studio.deleteImage(id)}
      />

      <SettingsPage
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings.settings}
        loading={settings.loading}
        saving={settings.saving}
        error={settings.error}
        onUpdate={settings.update}
        onTestLMStudio={settings.testLMStudio}
        onTestComfyUI={settings.testComfyUI}
      />

      <Toasts />
      <TTSDock />
    </div>
  );
}
