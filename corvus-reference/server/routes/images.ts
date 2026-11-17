import { Router, Request, Response } from 'express';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import {
  buildImg2ImgWorkflow,
  buildInpaintWorkflow,
  buildTxt2ImgWorkflow,
  fetchImage,
  randomSeed,
  runWorkflow,
  uploadImage as comfyUploadImage,
} from '../services/comfyui.js';
import { getFileManager } from '../services/fileManager.js';
import { runImageChatAgent } from '../services/imageChatAgent.js';
import { logger } from '../services/logger.js';
import { ImageMetadata, ImageSettings } from '../types/index.js';

const router = Router();
const MOD = 'routes/images';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
};

function extensionFromFilename(filename: string): string {
  const ext = path.extname(filename);
  return ext || '.png';
}

function resolveDefaults() {
  const fm = getFileManager();
  return fm.getConfig().comfyui.defaults;
}

function buildSettings(body: any, opts: { includeDenoise: boolean }): ImageSettings {
  const defaults = resolveDefaults();
  const s = body?.settings || {};
  return {
    model: s.model || body.model || defaults.model,
    sampler: s.sampler || body.sampler || defaults.sampler,
    scheduler: s.scheduler || body.scheduler || defaults.scheduler,
    steps: s.steps ?? body.steps ?? defaults.steps,
    cfg: s.cfg ?? body.cfg ?? defaults.cfg,
    width: s.width ?? body.width ?? defaults.width,
    height: s.height ?? body.height ?? defaults.height,
    seed: (typeof s.seed === 'number' && s.seed >= 0) ? s.seed : (typeof body.seed === 'number' && body.seed >= 0) ? body.seed : randomSeed(),
    denoiseStrength: opts.includeDenoise
      ? s.denoiseStrength ?? body.denoiseStrength ?? defaults.denoiseStrength
      : null,
  };
}

/**
 * v1.1.20: Resolve identity-seed override for the request. If the client asked
 * to lock the identity seed (lockIdentitySeed=true) AND the request has a single
 * linkedNpc with a saved image.identitySeed, return that seed to be used for all
 * batch entries. Otherwise return null ("use the per-iteration random seed").
 *
 * Single-subject only — the client UI disables the toggle for multi-character
 * scenes since seed-locking over-constrains composition. Defensive: we also
 * refuse to apply it if subjectNpcIds.length !== 1.
 */
function resolveIdentitySeed(
  gameId: string,
  body: any,
): { seed: number; npcId: string } | null {
  if (!body || body.lockIdentitySeed !== true) return null;
  const fm = getFileManager();

  // Prefer explicit subjectNpcIds (new contract), fall back to linkedNpc.
  const subjects: string[] = Array.isArray(body.subjectNpcIds)
    ? body.subjectNpcIds.filter((x: unknown): x is string => typeof x === 'string' && x.trim().length > 0)
    : (typeof body.linkedNpc === 'string' && body.linkedNpc.trim() ? [body.linkedNpc.trim()] : []);

  if (subjects.length !== 1) {
    logger.info(MOD, `lockIdentitySeed requested but subject count=${subjects.length} — ignored (single-subject only)`);
    return null;
  }
  const npc = fm.getCharacter(gameId, subjects[0]);
  if (!npc) return null;
  const seed = npc.image?.identitySeed;
  if (typeof seed !== 'number' || seed < 0) {
    logger.info(MOD, `lockIdentitySeed requested for ${subjects[0]} but no identitySeed saved — ignored`);
    return null;
  }
  logger.info(MOD, `lockIdentitySeed applied: npc=${subjects[0]} seed=${seed}`);
  return { seed, npcId: subjects[0] };
}

// ---------------------------------------------------------------------------
// GET /api/games/:gameId/images  — list all images, returns ImageMetadata[]
// ---------------------------------------------------------------------------
router.get('/:gameId/images', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    let images = fm.listImageMetadata(gameId);

    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const linkedNpc = typeof req.query.linkedNpc === 'string' ? req.query.linkedNpc : undefined;
    if (category) images = images.filter((i) => i.category === category);
    if (linkedNpc) images = images.filter((i) => i.linkedNpc === linkedNpc);

    logger.info(MOD, `GET /${gameId}/images → ${images.length} images`);
    return res.json(images);
  } catch (err) {
    logger.error(MOD, 'Failed to list images', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/games/:gameId/images/file/:filename — serve the actual image file
// ---------------------------------------------------------------------------
router.get('/:gameId/images/file/:filename', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, filename } = req.params;
    const safe = path.basename(filename);
    const filePath = fm.getImageFilePath(gameId, safe);
    if (!fs.existsSync(filePath)) {
      logger.warn(MOD, `Image file missing: ${filePath}`);
      return res.status(404).json({ error: 'Image file missing on disk.' });
    }
    const ext = path.extname(safe).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    logger.error(MOD, 'Failed to serve image file', err);
    if (!res.headersSent) res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/games/:gameId/images/:imageId — single metadata entry
// ---------------------------------------------------------------------------
router.get('/:gameId/images/:imageId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, imageId } = req.params;
    const md = fm.getImageMetadata(gameId, imageId);
    if (!md) return res.status(404).json({ error: 'Image not found.' });
    return res.json(md);
  } catch (err) {
    logger.error(MOD, 'Failed to get image metadata', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// PATCH/PUT /api/games/:gameId/images/:imageId — update metadata
// ---------------------------------------------------------------------------
function updateImageHandler(req: Request, res: Response) {
  try {
    const fm = getFileManager();
    const { gameId, imageId } = req.params;
    const existing = fm.getImageMetadata(gameId, imageId);
    if (!existing) return res.status(404).json({ error: 'Image not found.' });
    const patch = req.body || {};
    const merged: ImageMetadata = {
      ...existing,
      ...patch,
      id: existing.id,
      filename: existing.filename,
      settings: { ...existing.settings, ...(patch.settings || {}) },
    };
    fm.saveImageMetadata(gameId, merged);
    return res.json(merged);
  } catch (err) {
    logger.error(MOD, 'Failed to update image metadata', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
router.put('/:gameId/images/:imageId', updateImageHandler);
router.patch('/:gameId/images/:imageId', updateImageHandler);

// ---------------------------------------------------------------------------
// DELETE /api/games/:gameId/images/:imageId
// ---------------------------------------------------------------------------
router.delete('/:gameId/images/:imageId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, imageId } = req.params;
    const ok = fm.deleteImage(gameId, imageId);
    if (!ok) return res.status(404).json({ error: 'Image not found.' });
    logger.info(MOD, `Deleted image ${imageId} in game ${gameId}`);
    return res.json({ ok });
  } catch (err) {
    logger.error(MOD, 'Failed to delete image', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/images/:imageId/send-to
// Body: { target: 'img2img' | 'inpaint' | 'npc' | 'chat'; npcId?: string }
// ---------------------------------------------------------------------------
router.post('/:gameId/images/:imageId/send-to', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, imageId } = req.params;
    const { target, npcId } = req.body || {};
    const md = fm.getImageMetadata(gameId, imageId);
    if (!md) return res.status(404).json({ error: 'Image not found.' });
    const filePath = fm.getImageFilePath(gameId, md.filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Image file missing on disk.' });

    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(md.filename).toLowerCase();
    const mime = MIME_BY_EXT[ext] || 'image/png';
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mime};base64,${base64}`;

    if (target === 'npc' && npcId) {
      const npc = fm.getCharacter(gameId, npcId);
      if (!npc) return res.status(404).json({ error: 'NPC not found.' });
      fm.saveCharacter(gameId, {
        ...npc,
        image: {
          ...npc.image,
          portraitPath: md.filename,
          basePrompt: npc.image.basePrompt || md.prompt,
          baseNegative: npc.image.baseNegative || md.negativePrompt,
          lastPrompt: md.prompt,
          lastSeed: md.settings.seed,
        },
      });
    }

    return res.json({ target: target || 'unknown', image: md, dataUrl, base64, mime });
  } catch (err) {
    logger.error(MOD, 'send-to failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/images/upload  — user uploads an image from the client
// ---------------------------------------------------------------------------
router.post('/:gameId/images/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    if (!req.file) return res.status(400).json({ error: 'Missing multipart "file".' });

    const originalName = req.file.originalname || `upload-${uuidv4()}.png`;
    const ext = extensionFromFilename(originalName);
    const id = uuidv4();
    const storedFilename = `${id}${ext}`;
    fm.saveImageFile(gameId, storedFilename, req.file.buffer);

    const defaults = resolveDefaults();
    const metadata: ImageMetadata = {
      id,
      filename: storedFilename,
      label: (req.body?.label as string) || originalName,
      category: (req.body?.category as ImageMetadata['category']) || 'other',
      linkedNpc: (req.body?.linkedNpc as string) || null,
      created: new Date().toISOString(),
      sourceMode: 'upload' as ImageMetadata['sourceMode'],
      parentImage: null,
      prompt: '',
      negativePrompt: '',
      settings: {
        model: defaults.model,
        sampler: defaults.sampler,
        scheduler: defaults.scheduler,
        steps: defaults.steps,
        cfg: defaults.cfg,
        width: defaults.width,
        height: defaults.height,
        seed: 0,
        denoiseStrength: null,
      },
    };
    fm.saveImageMetadata(gameId, metadata);
    logger.success(MOD, `Uploaded image ${id} (${originalName}) into game ${gameId}`);
    return res.status(201).json(metadata);
  } catch (err) {
    logger.error(MOD, 'Upload failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/images/txt2img — generate image(s) via ComfyUI
// ---------------------------------------------------------------------------
router.post('/:gameId/images/txt2img', async (req: Request, res: Response) => {
  const started = Date.now();
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });

    const cfg = fm.getConfig();
    const body = req.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim()) return res.status(400).json({ error: 'Field "prompt" is required.' });

    const settings = buildSettings(body, { includeDenoise: false });
    const negative = body.negativePrompt || cfg.comfyui.negativePromptDefault;
    const batchCount = Math.max(1, Math.min(10, parseInt(String(body.batchCount ?? 1), 10) || 1));
    const identityLock = resolveIdentitySeed(gameId, body);

    logger.info(MOD, `txt2img game=${gameId} batch=${batchCount} seed=${settings.seed} identityLock=${identityLock ? identityLock.seed : 'off'}`);

    const allStored: ImageMetadata[] = [];
    for (let i = 0; i < batchCount; i++) {
      // Identity lock: same seed for every batch entry. Otherwise: first entry
      // uses the requested seed, the rest get fresh random seeds for variety.
      const seed = identityLock ? identityLock.seed : (i === 0 ? settings.seed : randomSeed());
      const workflow = buildTxt2ImgWorkflow({
        prompt,
        negativePrompt: negative,
        model: settings.model,
        sampler: settings.sampler,
        scheduler: settings.scheduler,
        steps: settings.steps,
        cfg: settings.cfg,
        width: settings.width,
        height: settings.height,
        seed,
        filenamePrefix: path.posix.join('corvus', gameId),
      });

      const { images } = await runWorkflow(workflow);
      if (images.length === 0) throw new Error('ComfyUI returned no images.');
      const stored = await storeGeneratedImages(gameId, images, {
        prompt,
        negativePrompt: negative,
        settings: { ...settings, seed },
        sourceMode: 'txt2img',
        parentImage: null,
        label: body.label,
        category: body.category,
        linkedNpc: body.linkedNpc,
      });
      allStored.push(...stored);
    }

    logger.success(MOD, `txt2img done in ${Date.now() - started}ms — ${allStored.length} images`);
    return res.json(allStored);
  } catch (err) {
    logger.error(MOD, 'txt2img failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/images/img2img
// Body: { prompt, negativePrompt, settings, sourceImageId?, sourceImageData?, denoiseStrength, ... }
// ---------------------------------------------------------------------------
router.post('/:gameId/images/img2img', async (req: Request, res: Response) => {
  const started = Date.now();
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });

    const cfg = fm.getConfig();
    const body = req.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim()) return res.status(400).json({ error: 'Field "prompt" is required.' });

    const sourceName = await resolveSourceImage(gameId, body.sourceImageId, body.sourceImageData, 'input');
    const settings = buildSettings(body, { includeDenoise: true });
    const negative = body.negativePrompt || cfg.comfyui.negativePromptDefault;
    const batchCount = Math.max(1, Math.min(10, parseInt(String(body.batchCount ?? 1), 10) || 1));
    const identityLock = resolveIdentitySeed(gameId, body);

    logger.info(MOD, `img2img game=${gameId} batch=${batchCount} denoise=${settings.denoiseStrength} source=${sourceName} identityLock=${identityLock ? identityLock.seed : 'off'}`);

    const allStored: ImageMetadata[] = [];
    for (let i = 0; i < batchCount; i++) {
      const seed = identityLock ? identityLock.seed : (i === 0 ? settings.seed : randomSeed());
      const workflow = buildImg2ImgWorkflow({
        prompt,
        negativePrompt: negative,
        model: settings.model,
        sampler: settings.sampler,
        scheduler: settings.scheduler,
        steps: settings.steps,
        cfg: settings.cfg,
        width: settings.width,
        height: settings.height,
        seed,
        denoiseStrength: settings.denoiseStrength || 0.75,
        sourceImageName: sourceName,
        filenamePrefix: path.posix.join('corvus', gameId),
      });

      const { images } = await runWorkflow(workflow);
      if (images.length === 0) throw new Error('ComfyUI returned no images.');

      const stored = await storeGeneratedImages(gameId, images, {
        prompt,
        negativePrompt: negative,
        settings: { ...settings, seed },
        sourceMode: 'img2img',
        parentImage: body.sourceImageId || null,
        label: body.label,
        category: body.category,
        linkedNpc: body.linkedNpc,
      });
      allStored.push(...stored);
    }

    logger.success(MOD, `img2img done in ${Date.now() - started}ms — ${allStored.length} images`);
    return res.json(allStored);
  } catch (err) {
    logger.error(MOD, 'img2img failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/images/inpaint
// Body: extends img2img with { maskData }
// ---------------------------------------------------------------------------
router.post('/:gameId/images/inpaint', async (req: Request, res: Response) => {
  const started = Date.now();
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });

    const cfg = fm.getConfig();
    const body = req.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim()) return res.status(400).json({ error: 'Field "prompt" is required.' });
    if (!body.maskData) return res.status(400).json({ error: 'Field "maskData" is required.' });

    const sourceName = await resolveSourceImage(gameId, body.sourceImageId, body.sourceImageData, 'input');
    // ComfyUI's get_dir_by_type only accepts 'input' | 'output' | 'temp'.
    // Passing 'mask' triggers UnboundLocalError on type_dir. The mask just
    // needs to live in the input dir so LoadImage can read it like any image.
    const maskName = await uploadBase64ToComfy(body.maskData, `mask-${uuidv4()}.png`, 'input');

    const settings = buildSettings(body, { includeDenoise: true });
    const negative = body.negativePrompt || cfg.comfyui.negativePromptDefault;
    const batchCount = Math.max(1, Math.min(10, parseInt(String(body.batchCount ?? 1), 10) || 1));
    const identityLock = resolveIdentitySeed(gameId, body);

    logger.info(MOD, `inpaint game=${gameId} batch=${batchCount} source=${sourceName} mask=${maskName} identityLock=${identityLock ? identityLock.seed : 'off'}`);

    const allStored: ImageMetadata[] = [];
    for (let i = 0; i < batchCount; i++) {
      const seed = identityLock ? identityLock.seed : (i === 0 ? settings.seed : randomSeed());
      const workflow = buildInpaintWorkflow({
        prompt,
        negativePrompt: negative,
        model: settings.model,
        sampler: settings.sampler,
        scheduler: settings.scheduler,
        steps: settings.steps,
        cfg: settings.cfg,
        width: settings.width,
        height: settings.height,
        seed,
        denoiseStrength: settings.denoiseStrength || 0.75,
        sourceImageName: sourceName,
        maskImageName: maskName,
        filenamePrefix: path.posix.join('corvus', gameId),
      });

      const { images } = await runWorkflow(workflow);
      if (images.length === 0) throw new Error('ComfyUI returned no images.');

      const stored = await storeGeneratedImages(gameId, images, {
        prompt,
        negativePrompt: negative,
        settings: { ...settings, seed },
        sourceMode: 'inpaint',
        parentImage: body.sourceImageId || null,
        label: body.label,
        category: body.category,
        linkedNpc: body.linkedNpc,
      });
      allStored.push(...stored);
    }

    logger.success(MOD, `inpaint done in ${Date.now() - started}ms — ${allStored.length} images`);
    return res.json(allStored);
  } catch (err) {
    logger.error(MOD, 'inpaint failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/images/chat  — image chat agent
// ---------------------------------------------------------------------------
router.post('/:gameId/images/chat', async (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });

    const { message, mode } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Field "message" is required.' });
    }

    logger.info(MOD, `image-chat game=${gameId} mode=${mode || 'unknown'} message="${message.slice(0, 80)}"`);
    const result = await runImageChatAgent({ gameId, userMessage: message });
    logger.info(MOD, `image-chat result: prompt="${(result.prompt || '').slice(0, 120)}" source=${result.source} reasoning="${result.reasoning}"`);

    if (!result.prompt || result.prompt.trim().length === 0) {
      logger.warn(MOD, 'image-chat agent returned an empty prompt — returning 422');
      return res.status(422).json({
        error: result.clarificationQuestion
          ? result.clarificationQuestion
          : 'The assistant could not generate a prompt. Please refine your request.',
      });
    }

    // Frontend expects { prompt, negativePrompt, suggestedSettings?, mode? }
    const response = {
      prompt: result.prompt,
      negativePrompt: result.negativePrompt,
      mode,
      suggestedSettings: undefined,
      source: result.source,
      // v1.1.20: scene-delta contract
      subjectNpcIds: result.subjectNpcIds,
      sceneDelta: result.sceneDelta,
      identityAnchor: result.identityAnchor,
      // Legacy alias — first resolved subject
      resolvedNpcId: result.resolvedNpcId,
      suggestedLabel: result.suggestedLabel,
      clarificationQuestion: result.clarificationQuestion,
      reasoning: result.reasoning,
      rawResponse: result.rawResponse,
      repairedTokens: result.repairedTokens,
    };
    logger.info(MOD, `image-chat response JSON prompt length=${response.prompt.length}`);
    return res.json(response);
  } catch (err) {
    logger.error(MOD, 'image-chat failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ===========================================================================
// Helpers
// ===========================================================================

async function resolveSourceImage(
  gameId: string,
  sourceImageId: string | undefined,
  sourceImageData: string | undefined,
  type: 'input' | 'mask'
): Promise<string> {
  const fm = getFileManager();
  if (sourceImageId) {
    const md = fm.getImageMetadata(gameId, sourceImageId);
    if (!md) throw new Error(`Source image not found: ${sourceImageId}`);
    const localPath = fm.getImageFilePath(gameId, md.filename);
    if (!fs.existsSync(localPath)) throw new Error('Source image file missing on disk.');
    const buffer = fs.readFileSync(localPath);
    const uploaded = await comfyUploadImage(md.filename, buffer, type);
    return uploaded.name;
  }
  if (sourceImageData) {
    return await uploadBase64ToComfy(sourceImageData, `src-${uuidv4()}.png`, type);
  }
  throw new Error('Provide either sourceImageId or sourceImageData.');
}

async function uploadBase64ToComfy(
  dataUrlOrBase64: string,
  filename: string,
  type: 'input' | 'mask'
): Promise<string> {
  const match = dataUrlOrBase64.match(/^data:(?:[^;]+);base64,(.*)$/);
  const base64 = match ? match[1] : dataUrlOrBase64;
  const buffer = Buffer.from(base64, 'base64');
  const uploaded = await comfyUploadImage(filename, buffer, type);
  return uploaded.name;
}

async function storeGeneratedImages(
  gameId: string,
  images: Array<{ filename: string; subfolder: string; type: string }>,
  ctx: {
    prompt: string;
    negativePrompt: string;
    settings: ImageSettings;
    sourceMode: ImageMetadata['sourceMode'];
    parentImage: string | null;
    label?: string;
    category?: ImageMetadata['category'];
    linkedNpc?: string | null;
  }
): Promise<ImageMetadata[]> {
  const fm = getFileManager();
  const stored: ImageMetadata[] = [];

  for (const ref of images) {
    const imageData = await fetchImage(ref);
    const id = uuidv4();
    const ext = extensionFromFilename(ref.filename);
    const storedFilename = `${id}${ext}`;
    fm.saveImageFile(gameId, storedFilename, imageData);

    const metadata: ImageMetadata = {
      id,
      filename: storedFilename,
      label: ctx.label || ref.filename,
      category: ctx.category || 'other',
      linkedNpc: ctx.linkedNpc || null,
      created: new Date().toISOString(),
      sourceMode: ctx.sourceMode,
      parentImage: ctx.parentImage,
      prompt: ctx.prompt,
      negativePrompt: ctx.negativePrompt,
      settings: ctx.settings,
    };
    fm.saveImageMetadata(gameId, metadata);

    if (ctx.linkedNpc) {
      const npc = fm.getCharacter(gameId, ctx.linkedNpc);
      if (npc) {
        fm.saveCharacter(gameId, {
          ...npc,
          image: {
            ...npc.image,
            basePrompt: npc.image.basePrompt || ctx.prompt,
            baseNegative: npc.image.baseNegative || ctx.negativePrompt,
            lastPrompt: ctx.prompt,
            lastSeed: ctx.settings.seed,
            portraitPath: storedFilename,
          },
        });
      }
    }

    stored.push(metadata);
  }

  return stored;
}

export default router;
