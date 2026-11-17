import React, { useState } from 'react';
import type { ExamplePrompt, ImageMetadata } from '../../types';
import type { useImageStudio } from '../../hooks/useImageStudio';
import { ImageLightbox } from './ImageLightbox';
import { ImageModeSelector } from './ImageModeSelector';
import { ImageQuickChat } from './ImageQuickChat';
import { ImageSettingsPanel } from './ImageSettings';
import { Img2ImgPanel } from './Img2ImgPanel';
import { InpaintPanel } from './InpaintPanel';
import { Txt2ImgPanel } from './Txt2ImgPanel';

export interface ImageStudioProps {
  open: boolean;
  onClose: () => void;
  gameId: string | null;
  studio: ReturnType<typeof useImageStudio>;
  examplePrompts?: ExamplePrompt[];
  onSaveToChat?: (img: ImageMetadata) => void;
  /** v1.1.22: notified after an image was promoted to an NPC portrait. */
  onPortraitSet?: (npcId: string) => void;
}

export function ImageStudio({
  open,
  onClose,
  gameId,
  studio,
  examplePrompts,
  onSaveToChat,
  onPortraitSet,
}: ImageStudioProps) {
  const [lightboxImg, setLightboxImg] = useState<ImageMetadata | null>(null);

  if (!open) return null;

  const {
    state,
    setMode,
    setPrompt,
    setNegativePrompt,
    setSettings,
    setBatchCount,
    setSource,
    setMask,
    newSeed,
    generate,
    sendToImg2Img,
    sendToInpaint,
    editPromptFromResult,
    deleteImage,
    imageChatHistory,
    appendImageChat,
    clearImageChat,
    setIdentityContext,
    setLockIdentitySeed,
  } = studio;

  const handleGenerate = async () => {
    try {
      await generate();
    } catch {
      /* error already recorded on state */
    }
  };

  const handleApplyPrompt = (
    p: string,
    n: string,
    identity?: { subjectNpcIds?: string[]; identityAnchor?: string },
  ) => {
    setPrompt(p);
    setNegativePrompt(n);
    if (identity) {
      setIdentityContext({
        subjectNpcIds: identity.subjectNpcIds || [],
        identityAnchor: identity.identityAnchor || '',
      });
    }
  };

  const handleApplyAndGenerate = async (
    p: string,
    n: string,
    identity?: { subjectNpcIds?: string[]; identityAnchor?: string },
  ) => {
    // Pass the new prompt directly into generate() instead of relying on
    // setState propagating before the call — the hook's generate() captures
    // its closure at render time and would otherwise use the stale prompt.
    setPrompt(p);
    setNegativePrompt(n);
    if (identity) {
      setIdentityContext({
        subjectNpcIds: identity.subjectNpcIds || [],
        identityAnchor: identity.identityAnchor || '',
      });
    }
    try {
      await generate({ prompt: p, negativePrompt: n });
    } catch {
      /* error already recorded on state */
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 pointer-events-none">
        <div
          className="absolute inset-0 bg-black/40 pointer-events-auto"
          onClick={onClose}
        />
        <aside
          className="absolute right-0 top-0 bottom-0 w-full max-w-md bg-surface border-l border-border shadow-2xl pointer-events-auto flex flex-col animate-slide-in-right"
        >
          <div className="flex items-center justify-between p-3 border-b border-border">
            <div>
              <div className="text-sm font-semibold text-text-primary">Image Studio</div>
              <div className="text-[11px] text-text-muted">
                Generate and iterate on visuals for your story
              </div>
            </div>
            <button className="btn btn-ghost !p-1.5" onClick={onClose} aria-label="Close">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            <ImageModeSelector mode={state.mode} onChange={setMode} />

            <ImageSettingsPanel
              settings={state.settings}
              batchCount={state.batchCount}
              onChangeSettings={setSettings}
              onChangeBatch={setBatchCount}
              showDenoise={state.mode !== 'txt2img'}
              examples={examplePrompts}
              onPickExample={(ex) => {
                setPrompt(ex.prompt);
                setNegativePrompt(ex.negative);
              }}
            />

            {state.mode === 'txt2img' && (
              <Txt2ImgPanel
                gameId={gameId}
                prompt={state.prompt}
                negativePrompt={state.negativePrompt}
                generating={state.generating}
                error={state.error}
                results={state.lastResults}
                batchCount={state.batchCount}
                onChangePrompt={setPrompt}
                onChangeNegative={setNegativePrompt}
                onGenerate={handleGenerate}
                onNewSeed={newSeed}
                onSendToImg2Img={sendToImg2Img}
                onSendToInpaint={sendToInpaint}
                onSaveToChat={onSaveToChat}
                onEditPromptFromResult={editPromptFromResult}
                onOpenLightbox={setLightboxImg}
              />
            )}

            {state.mode === 'img2img' && (
              <Img2ImgPanel
                gameId={gameId}
                prompt={state.prompt}
                negativePrompt={state.negativePrompt}
                settings={state.settings}
                sourceImageURL={state.sourceImageURL}
                sourceImageData={state.sourceImageData}
                generating={state.generating}
                error={state.error}
                results={state.lastResults}
                onChangePrompt={setPrompt}
                onChangeNegative={setNegativePrompt}
                onChangeSettings={setSettings}
                onChangeSource={setSource}
                onGenerate={handleGenerate}
                onNewSeed={newSeed}
                onSendToImg2Img={sendToImg2Img}
                onSendToInpaint={sendToInpaint}
                onSaveToChat={onSaveToChat}
                onEditPromptFromResult={editPromptFromResult}
                onOpenLightbox={setLightboxImg}
              />
            )}

            {state.mode === 'inpaint' && (
              <InpaintPanel
                gameId={gameId}
                prompt={state.prompt}
                negativePrompt={state.negativePrompt}
                settings={state.settings}
                sourceImageURL={state.sourceImageURL}
                sourceImageData={state.sourceImageData}
                maskData={state.maskData}
                generating={state.generating}
                error={state.error}
                results={state.lastResults}
                onChangePrompt={setPrompt}
                onChangeNegative={setNegativePrompt}
                onChangeSettings={setSettings}
                onChangeSource={setSource}
                onChangeMask={setMask}
                onGenerate={handleGenerate}
                onNewSeed={newSeed}
                onSendToImg2Img={sendToImg2Img}
                onSendToInpaint={sendToInpaint}
                onSaveToChat={onSaveToChat}
                onEditPromptFromResult={editPromptFromResult}
                onOpenLightbox={setLightboxImg}
              />
            )}

            <ImageQuickChat
              gameId={gameId}
              currentMode={state.mode}
              lastPrompt={state.prompt}
              onApplyPrompt={handleApplyPrompt}
              onApplyAndGenerate={handleApplyAndGenerate}
              history={imageChatHistory}
              appendHistory={appendImageChat}
              clearHistory={clearImageChat}
              subjectNpcIds={state.subjectNpcIds}
              identityAnchor={state.identityAnchor}
              lockIdentitySeed={state.lockIdentitySeed}
              onToggleLockIdentitySeed={setLockIdentitySeed}
            />
          </div>
        </aside>
      </div>

      <ImageLightbox
        gameId={gameId}
        image={lightboxImg}
        open={lightboxImg !== null}
        onClose={() => setLightboxImg(null)}
        onPortraitSet={onPortraitSet}
        siblings={state.lastResults}
        onSendToImg2Img={(i) => {
          sendToImg2Img(i);
          setLightboxImg(null);
        }}
        onSendToInpaint={(i) => {
          sendToInpaint(i);
          setLightboxImg(null);
        }}
        onSaveToChat={onSaveToChat}
        onDelete={async (i) => {
          await deleteImage(i.id);
          setLightboxImg(null);
        }}
      />
    </>
  );
}
