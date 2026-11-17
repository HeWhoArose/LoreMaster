import { Router, Request, Response } from 'express';
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
  testConnection,
  uploadImage,
} from '../services/comfyui.js';
import { getFileManager } from '../services/fileManager.js';
import { runImageChatAgent } from '../services/imageChatAgent.js';
import { logger } from '../services/logger.js';
import { ImageMetadata, ImageSettings } from '../types/index.js';

const router = Router();
const MOD = 'routes/comfyui';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function resolveDefaults() {
  const fm = getFileManager();
  const cfg = fm.getConfig();
  return cfg.comfyui.defaults;
}

function extensionFromFilename(filename: string): string {
  const ext = path.extname(filename);
  return ext || '.png';
}

function buildSettings(body: any, opts: { includeDenoise: boolean }): ImageSettings {
  const defaults = resolveDefaults();
  return {
    model: body.model || defaults.model,
    sampler: body.sampler || defaults.sampler,
    scheduler: body.scheduler || defaults.scheduler,
    steps: body.steps ?? defaults.steps,
    cfg: body.cfg ?? defaults.cfg,
    width: body.width ?? defaults.width,
    height: body.height ?? defaults.height,
    seed: typeof body.seed === 'number' && body.seed >= 0 ? body.seed : randomSeed(),
    denoiseStrength: opts.includeDenoise ? body.denoiseStrength ?? defaults.denoiseStrength : null,
  };
}

/**
 * POST /api/comfyui/status
 */
router.get('/status', async (_req: Request, res: Response) => {
  const result = await testConnection();
  return res.json(result);
});

/**
 * POST /api/comfyui/upload
 * Multipart or base64. Returns the uploaded file name on the ComfyUI server.
 */
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    let buffer: Buffer;
    let filename: string;

    if (req.file) {
      buffer = req.file.buffer;
      filename = req.file.originalname || `upload-${uuidv4()}.png`;
    } else if (req.body && typeof req.body.base64 === 'string') {
      const match = req.body.base64.match(/^data:(?:[^;]+);base64,(.*)$/);
      const base64 = match ? match[1] : req.body.base64;
      buffer = Buffer.from(base64, 'base64');
      filename = req.body.filename || `upload-${uuidv4()}.png`;
    } else {
      return res.status(400).json({ error: 'Provide a multipart "file" or JSON { base64, filename }.' });
    }

    const type = req.body?.type === 'mask' ? 'mask' : 'input';
    const result = await uploadImage(filename, buffer, type);
    return res.json({ upload: result });
  } catch (err) {
    logger.error(MOD, 'comfyui/upload failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/comfyui/txt2img
 * Body: { gameId?, prompt, negativePrompt?, label?, category?, linkedNpc?, ...settings }
 */
router.post('/txt2img', async (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const cfg = fm.getConfig();
    const body = req.body || {};
    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (!prompt.trim()) return res.status(400).json({ error: 'Field "prompt" is required.' });

    const settings = buildSettings(body, { includeDenoise: false });
    const negative = body.negativePrompt || cfg.comfyui.negativePromptDefault;
    const gameId = typeof body.gameId === 'string' ? body.gameId : null;

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
      seed: settings.seed,
      filenamePrefix: gameId ? `corvus/${gameId}` : 'corvus',
    });

    const { images } = await runWorkflow(workflow);
    if (images.length === 0) throw new Error('ComfyUI returned no images.');

    const stored = await storeGeneratedImages(gameId, images, {
      prompt,
      negativePrompt: negative,
      settings,
      sourceMode: 'txt2img',
      parentImage: null,
      label: body.label,
      category: body.category,
      linkedNpc: body.linkedNpc,
    });

    return res.json({ images: stored });
  } catch (err) {
    logger.error(MOD, 'comfyui/txt2img failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/comfyui/img2img
 * Body: { gameId?, sourceImageName, prompt, negativePrompt?, ...settings }
 */
router.post('/img2img', async (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const cfg = fm.getConfig();
    const body = req.body || {};
    const { prompt, sourceImageName } = body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required.' });
    if (!sourceImageName) return res.status(400).json({ error: 'sourceImageName is required (upload first).' });

    const settings = buildSettings(body, { includeDenoise: true });
    const negative = body.negativePrompt || cfg.comfyui.negativePromptDefault;
    const gameId = typeof body.gameId === 'string' ? body.gameId : null;

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
      seed: settings.seed,
      denoiseStrength: settings.denoiseStrength || 0.75,
      sourceImageName,
      filenamePrefix: gameId ? `corvus/${gameId}` : 'corvus',
    });

    const { images } = await runWorkflow(workflow);
    if (images.length === 0) throw new Error('ComfyUI returned no images.');

    const stored = await storeGeneratedImages(gameId, images, {
      prompt,
      negativePrompt: negative,
      settings,
      sourceMode: 'img2img',
      parentImage: body.parentImageId || null,
      label: body.label,
      category: body.category,
      linkedNpc: body.linkedNpc,
    });

    return res.json({ images: stored });
  } catch (err) {
    logger.error(MOD, 'comfyui/img2img failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/comfyui/inpaint
 * Body: { gameId?, sourceImageName, maskImageName, prompt, ...settings }
 */
router.post('/inpaint', async (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const cfg = fm.getConfig();
    const body = req.body || {};
    const { prompt, sourceImageName, maskImageName } = body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required.' });
    if (!sourceImageName || !maskImageName) {
      return res.status(400).json({ error: 'sourceImageName and maskImageName are required.' });
    }

    const settings = buildSettings(body, { includeDenoise: true });
    const negative = body.negativePrompt || cfg.comfyui.negativePromptDefault;
    const gameId = typeof body.gameId === 'string' ? body.gameId : null;

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
      seed: settings.seed,
      denoiseStrength: settings.denoiseStrength || 0.75,
      sourceImageName,
      maskImageName,
      filenamePrefix: gameId ? `corvus/${gameId}` : 'corvus',
    });

    const { images } = await runWorkflow(workflow);
    if (images.length === 0) throw new Error('ComfyUI returned no images.');

    const stored = await storeGeneratedImages(gameId, images, {
      prompt,
      negativePrompt: negative,
      settings,
      sourceMode: 'inpaint',
      parentImage: body.parentImageId || null,
      label: body.label,
      category: body.category,
      linkedNpc: body.linkedNpc,
    });

    return res.json({ images: stored });
  } catch (err) {
    logger.error(MOD, 'comfyui/inpaint failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/comfyui/image-chat
 * Body: { gameId, message }
 * Runs the image chat agent and returns a prompt suggestion for approval.
 */
router.post('/image-chat', async (req: Request, res: Response) => {
  try {
    const { gameId, message } = req.body || {};
    if (!gameId || typeof message !== 'string') {
      return res.status(400).json({ error: 'gameId and message are required.' });
    }
    const fm = getFileManager();
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    const result = await runImageChatAgent({ gameId, userMessage: message });
    return res.json({ result });
  } catch (err) {
    logger.error(MOD, 'comfyui/image-chat failed', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Helper: download ComfyUI-generated images, store locally, write metadata.
// ---------------------------------------------------------------------------

async function storeGeneratedImages(
  gameId: string | null,
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

    if (gameId) {
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

      // If linked to an NPC, update the portraitPath + lastPrompt/seed on their card
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
    } else {
      // No game — return transient metadata with base64 data URL
      const dataUrl = `data:image/${ext.slice(1) || 'png'};base64,${imageData.toString('base64')}`;
      const metadata: ImageMetadata = {
        id,
        filename: storedFilename,
        label: ctx.label || ref.filename,
        category: ctx.category || 'other',
        linkedNpc: null,
        created: new Date().toISOString(),
        sourceMode: ctx.sourceMode,
        parentImage: ctx.parentImage,
        prompt: ctx.prompt,
        negativePrompt: ctx.negativePrompt,
        settings: ctx.settings,
      };
      stored.push({ ...metadata, ...({ dataUrl } as any) });
    }
  }

  return stored;
}

export default router;
