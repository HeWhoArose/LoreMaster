import { Router, Request, Response } from 'express';
import { testConnection as testComfyUI, fetchComfyUIOptions } from '../services/comfyui.js';
import { getFileManager } from '../services/fileManager.js';
import { listModels, testConnection as testLMStudio } from '../services/lmStudio.js';
import { logger } from '../services/logger.js';
import { GlobalConfig } from '../types/index.js';

const router = Router();
const MOD = 'routes/settings';

/**
 * GET /api/settings
 * Returns the GlobalConfig directly (no wrapper) so the frontend can treat the
 * response as a `GlobalConfig`.
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const config = fm.getConfig();
    return res.json(config);
  } catch (err) {
    logger.error(MOD, 'Failed to read settings', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * PATCH /api/settings
 * Accepts a partial GlobalConfig and deep-merges it with the existing one.
 * Returns the merged GlobalConfig directly (no wrapper).
 */
router.patch('/', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const current = fm.getConfig();
    const patch = (req.body || {}) as Partial<GlobalConfig>;
    const merged: GlobalConfig = {
      ...current,
      ...patch,
      lmStudio: { ...current.lmStudio, ...(patch.lmStudio || {}) },
      comfyui: {
        ...current.comfyui,
        ...(patch.comfyui || {}),
        defaults: {
          ...current.comfyui.defaults,
          ...((patch.comfyui && patch.comfyui.defaults) || {}),
        },
        examplePrompts:
          (patch.comfyui && patch.comfyui.examplePrompts) || current.comfyui.examplePrompts,
      },
      engine: { ...current.engine, ...(patch.engine || {}) },
      appearance: { ...current.appearance, ...(patch.appearance || {}) },
      dataDirectory: patch.dataDirectory || current.dataDirectory,
    };
    fm.saveConfig(merged);
    logger.success(MOD, 'Settings updated');
    return res.json(merged);
  } catch (err) {
    logger.error(MOD, 'Failed to update settings', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/settings/test/lm-studio
 * Optional body: { url, defaultModel } — tests a specific configuration instead of saved one.
 */
router.post('/test/lm-studio', async (req: Request, res: Response) => {
  try {
    const override = req.body || {};
    logger.info(MOD, 'Testing LM Studio connection', {
      url: override.url || '(saved)',
      defaultModel: override.defaultModel || '(saved)',
    });
    const result = await testLMStudio(override);
    if (result.ok) logger.success(MOD, 'LM Studio reachable');
    else logger.warn(MOD, `LM Studio unreachable: ${result.error}`);
    // The frontend expects { ok, model?, error? }. Map `models[0]` to `model` for convenience
    // while still returning the full models list.
    const model = Array.isArray(result.models) && result.models.length > 0 ? result.models[0] : undefined;
    return res.json({ ...result, model });
  } catch (err) {
    logger.error(MOD, 'LM Studio test failed', err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * POST /api/settings/test/comfyui
 */
router.post('/test/comfyui', async (req: Request, res: Response) => {
  try {
    const override = req.body || {};
    logger.info(MOD, 'Testing ComfyUI connection', { url: override.url || '(saved)' });
    const result = await testComfyUI(override);
    if (result.ok) logger.success(MOD, 'ComfyUI reachable');
    else logger.warn(MOD, `ComfyUI unreachable: ${result.error}`);
    const version =
      result.stats && typeof result.stats === 'object'
        ? (result.stats as any).system?.comfyui_version ||
          (result.stats as any).comfyui_version ||
          undefined
        : undefined;
    return res.json({ ...result, version });
  } catch (err) {
    logger.error(MOD, 'ComfyUI test failed', err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

/**
 * GET /api/settings/lmstudio/models
 */
router.get('/lmstudio/models', async (_req: Request, res: Response) => {
  try {
    const models = await listModels();
    return res.json({ models });
  } catch (err) {
    logger.error(MOD, 'Failed to list LM Studio models', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * GET /api/settings/comfyui/options
 * Returns available models, samplers, and schedulers from the ComfyUI API.
 */
router.get('/comfyui/options', async (_req: Request, res: Response) => {
  try {
    logger.info(MOD, 'Fetching ComfyUI options (models/samplers/schedulers)');
    const options = await fetchComfyUIOptions();
    logger.success(MOD, `ComfyUI options: ${options.models.length} models, ${options.samplers.length} samplers, ${options.schedulers.length} schedulers`);
    return res.json(options);
  } catch (err) {
    logger.error(MOD, 'Failed to fetch ComfyUI options', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
