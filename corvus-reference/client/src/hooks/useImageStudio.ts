import { useCallback, useEffect, useState } from 'react';
import * as api from '../api';
import type { ImageMetadata, ImageMode, ImageSettings } from '../types';

export interface QuickChatEntry {
  id: string;
  user: string;
  prompt: string;
  negativePrompt: string;
  mode?: ImageMode;
  reasoning?: string;
  source?: string;
  rawResponse?: string;
  /** v1.1.20: subject NPCs resolved by the image-chat agent. */
  subjectNpcIds?: string[];
  /** v1.1.20: server-prepended identity anchor (for transparency in the UI). */
  identityAnchor?: string;
  /** v1.1.20: scene-delta portion (what the LLM contributed). */
  sceneDelta?: string;
  /** v1.1.20: tag-presence safety-net repairs. */
  repairedTokens?: Array<{ npcId: string; added: string[] }>;
}

export const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  model: '',
  sampler: 'dpmpp_2m',
  scheduler: 'karras',
  steps: 30,
  cfg: 7,
  width: 512,
  height: 768,
  seed: -1,
  denoiseStrength: 0.65,
};

export interface StudioState {
  mode: ImageMode;
  prompt: string;
  negativePrompt: string;
  settings: ImageSettings;
  batchCount: number;
  // Source image for img2img / inpaint (either by id reference or raw dataURL)
  sourceImageId: string | null;
  sourceImageData: string | null;
  sourceImageURL: string | null;
  // Mask for inpaint (dataURL of black/white image)
  maskData: string | null;
  // Results of current generation
  lastResults: ImageMetadata[];
  generating: boolean;
  error: string | null;
  // v1.1.20: identity-continuity state forwarded from the image-chat agent.
  subjectNpcIds: string[];
  identityAnchor: string;
  /** When true, server reuses the resolved NPC's saved identitySeed for every batch entry. Single-subject only. */
  lockIdentitySeed: boolean;
}

const INITIAL_STATE: StudioState = {
  mode: 'txt2img',
  prompt: '',
  negativePrompt: '',
  settings: { ...DEFAULT_IMAGE_SETTINGS },
  batchCount: 1,
  sourceImageId: null,
  sourceImageData: null,
  sourceImageURL: null,
  maskData: null,
  lastResults: [],
  generating: false,
  error: null,
  subjectNpcIds: [],
  identityAnchor: '',
  lockIdentitySeed: false,
};

export function useImageStudio(gameId: string | null) {
  const [state, setState] = useState<StudioState>(INITIAL_STATE);
  const [gallery, setGallery] = useState<ImageMetadata[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [defaultsLoaded, setDefaultsLoaded] = useState(false);
  // Quick-chat history lives at the hook level so it survives the studio
  // panel being closed/reopened (the panel unmounts ImageQuickChat each time).
  const [imageChatHistory, setImageChatHistory] = useState<QuickChatEntry[]>([]);

  // Reset chat history when switching games
  useEffect(() => {
    setImageChatHistory([]);
  }, [gameId]);

  const appendImageChat = useCallback((entry: QuickChatEntry) => {
    setImageChatHistory((h) => [...h, entry]);
  }, []);

  const clearImageChat = useCallback(() => {
    setImageChatHistory([]);
  }, []);

  // Load ComfyUI defaults from server settings on first mount
  useEffect(() => {
    if (defaultsLoaded) return;
    (async () => {
      try {
        const cfg = await api.getSettings();
        if (cfg?.comfyui?.defaults) {
          const d = cfg.comfyui.defaults;
          setState((s) => ({
            ...s,
            settings: {
              model: d.model || s.settings.model,
              sampler: d.sampler || s.settings.sampler,
              scheduler: d.scheduler || s.settings.scheduler,
              steps: d.steps || s.settings.steps,
              cfg: d.cfg || s.settings.cfg,
              width: d.width || s.settings.width,
              height: d.height || s.settings.height,
              seed: s.settings.seed,
              denoiseStrength: d.denoiseStrength ?? s.settings.denoiseStrength,
            },
            batchCount: d.batchCount || s.batchCount,
            negativePrompt: s.negativePrompt || cfg.comfyui.negativePromptDefault || '',
          }));
        }
        setDefaultsLoaded(true);
      } catch {
        // Silently ignore — will use hardcoded defaults
        setDefaultsLoaded(true);
      }
    })();
  }, [defaultsLoaded]);

  const refreshGallery = useCallback(async () => {
    if (!gameId) {
      setGallery([]);
      return;
    }
    setGalleryLoading(true);
    try {
      const list = await api.listImages(gameId);
      list.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      setGallery(list);
    } catch {
      // ignore
    } finally {
      setGalleryLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void refreshGallery();
  }, [refreshGallery]);

  const setMode = useCallback((mode: ImageMode) => {
    setState((s) => ({ ...s, mode }));
  }, []);

  const setPrompt = useCallback((prompt: string) => setState((s) => ({ ...s, prompt })), []);
  const setNegativePrompt = useCallback(
    (negativePrompt: string) => setState((s) => ({ ...s, negativePrompt })),
    [],
  );
  const setSettings = useCallback(
    (patch: Partial<ImageSettings>) =>
      setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    [],
  );
  const setBatchCount = useCallback(
    (batchCount: number) => setState((s) => ({ ...s, batchCount })),
    [],
  );
  const setSource = useCallback(
    (src: { id?: string | null; data?: string | null; url?: string | null }) => {
      setState((s) => ({
        ...s,
        sourceImageId: src.id ?? null,
        sourceImageData: src.data ?? null,
        sourceImageURL: src.url ?? null,
      }));
    },
    [],
  );
  const setMask = useCallback((maskData: string | null) => setState((s) => ({ ...s, maskData })), []);

  const newSeed = useCallback(() => {
    setState((s) => ({
      ...s,
      settings: { ...s.settings, seed: Math.floor(Math.random() * 2_147_483_647) },
    }));
  }, []);

  /**
   * Generate images. Accepts optional overrides so callers that want to
   * "set prompt + immediately generate" don't have to wait for React state
   * to flush — they can pass the new prompt directly. Any field omitted
   * falls back to the current state.
   */
  const generate = useCallback(
    async (overrides?: { prompt?: string; negativePrompt?: string }) => {
      if (!gameId) return;
      // If overrides are provided, also push them into state so the UI inputs
      // reflect what was actually generated (single source of truth).
      if (overrides) {
        setState((s) => ({
          ...s,
          prompt: overrides.prompt ?? s.prompt,
          negativePrompt: overrides.negativePrompt ?? s.negativePrompt,
        }));
      }
      setState((s) => ({ ...s, generating: true, error: null }));
      const effectivePrompt = overrides?.prompt ?? state.prompt;
      const effectiveNegative = overrides?.negativePrompt ?? state.negativePrompt;
      // v1.1.20: only honor lockIdentitySeed when exactly one subject was resolved.
      // Multi-character seed-lock over-constrains composition.
      const lockIdentitySeed = state.lockIdentitySeed && state.subjectNpcIds.length === 1;
      const subjectNpcIds = state.subjectNpcIds;
      // Set linkedNpc on the resulting image when a single subject is locked in,
      // so the gallery filter "linked NPC" works without further plumbing.
      const linkedNpc = subjectNpcIds.length === 1 ? subjectNpcIds[0] : undefined;
      try {
        let results: ImageMetadata[] = [];
        if (state.mode === 'txt2img') {
          results = await api.generateTxt2Img(gameId, {
            prompt: effectivePrompt,
            negativePrompt: effectiveNegative,
            settings: state.settings,
            batchCount: state.batchCount,
            subjectNpcIds,
            lockIdentitySeed,
            linkedNpc,
          });
        } else if (state.mode === 'img2img') {
          results = await api.generateImg2Img(gameId, {
            prompt: effectivePrompt,
            negativePrompt: effectiveNegative,
            settings: state.settings,
            batchCount: state.batchCount,
            sourceImageId: state.sourceImageId || undefined,
            sourceImageData: state.sourceImageData || undefined,
            denoiseStrength: state.settings.denoiseStrength ?? 0.65,
            subjectNpcIds,
            lockIdentitySeed,
            linkedNpc,
          });
        } else if (state.mode === 'inpaint') {
          if (!state.maskData) {
            throw new Error('Please paint a mask before generating');
          }
          results = await api.generateInpaint(gameId, {
            prompt: effectivePrompt,
            negativePrompt: effectiveNegative,
            settings: state.settings,
            batchCount: state.batchCount,
            sourceImageId: state.sourceImageId || undefined,
            sourceImageData: state.sourceImageData || undefined,
            denoiseStrength: state.settings.denoiseStrength ?? 0.65,
            maskData: state.maskData,
            subjectNpcIds,
            lockIdentitySeed,
            linkedNpc,
          });
        }
        setState((s) => ({ ...s, lastResults: results, generating: false }));
        await refreshGallery();
        return results;
      } catch (e: any) {
        setState((s) => ({ ...s, generating: false, error: e?.message || 'Generation failed' }));
        throw e;
      }
    },
    [gameId, state, refreshGallery],
  );

  const sendToImg2Img = useCallback(
    (image: ImageMetadata) => {
      if (!gameId) return;
      setState((s) => ({
        ...s,
        mode: 'img2img',
        prompt: image.prompt,
        negativePrompt: image.negativePrompt,
        settings: { ...s.settings, ...image.settings, seed: -1 },
        sourceImageId: image.id,
        sourceImageData: null,
        sourceImageURL: api.getImageURL(gameId, image.filename),
        maskData: null,
      }));
    },
    [gameId],
  );

  const sendToInpaint = useCallback(
    (image: ImageMetadata) => {
      if (!gameId) return;
      setState((s) => ({
        ...s,
        mode: 'inpaint',
        prompt: image.prompt,
        negativePrompt: image.negativePrompt,
        settings: { ...s.settings, ...image.settings, seed: -1 },
        sourceImageId: image.id,
        sourceImageData: null,
        sourceImageURL: api.getImageURL(gameId, image.filename),
        maskData: null,
      }));
    },
    [gameId],
  );

  const editPromptFromResult = useCallback((image: ImageMetadata) => {
    setState((s) => ({
      ...s,
      prompt: image.prompt,
      negativePrompt: image.negativePrompt,
      settings: { ...s.settings, ...image.settings },
    }));
  }, []);

  const deleteImage = useCallback(
    async (imageId: string) => {
      if (!gameId) return;
      await api.deleteImage(gameId, imageId);
      setGallery((g) => g.filter((i) => i.id !== imageId));
      setState((s) => ({
        ...s,
        lastResults: s.lastResults.filter((i) => i.id !== imageId),
      }));
    },
    [gameId],
  );

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  /**
   * v1.1.20: when the image-chat agent resolves subjects + identity anchor,
   * push them into state so the next generate() call can forward them and
   * the UI can render the anchor / seed-lock toggle / multi-character warning.
   */
  const setIdentityContext = useCallback(
    (ctx: { subjectNpcIds: string[]; identityAnchor: string }) => {
      setState((s) => ({
        ...s,
        subjectNpcIds: ctx.subjectNpcIds || [],
        identityAnchor: ctx.identityAnchor || '',
        // Auto-disable lock if the new subject count isn't 1 — user has to re-arm it.
        lockIdentitySeed: s.lockIdentitySeed && (ctx.subjectNpcIds || []).length === 1,
      }));
    },
    [],
  );

  const setLockIdentitySeed = useCallback((lock: boolean) => {
    setState((s) => ({ ...s, lockIdentitySeed: lock }));
  }, []);

  return {
    state,
    gallery,
    galleryLoading,
    refreshGallery,
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
    reset,
    imageChatHistory,
    appendImageChat,
    clearImageChat,
    setIdentityContext,
    setLockIdentitySeed,
  };
}
