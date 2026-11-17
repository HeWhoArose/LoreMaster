import { ComfyUISettings, ImageSettings } from '../types/index.js';
import { getFileManager } from './fileManager.js';
import { logger } from './logger.js';
import { randomUUID } from 'crypto';

const MOD = 'comfyui';

/**
 * ComfyUI API client.
 *
 * ComfyUI's HTTP API:
 *   POST /prompt                      — queue a workflow (body: { prompt, client_id })
 *   GET  /history/{prompt_id}         — check job status & retrieve output filenames
 *   GET  /view?filename=...&subfolder=...&type=output  — fetch a generated image
 *   POST /upload/image                — upload source image (multipart/form-data)
 */

function resolveSettings(override?: Partial<ComfyUISettings>): ComfyUISettings {
  const fm = getFileManager();
  const cfg = fm.getConfig();
  return { ...cfg.comfyui, ...(override || {}) } as ComfyUISettings;
}

function baseUrl(settings?: Partial<ComfyUISettings>): string {
  return resolveSettings(settings).url.replace(/\/+$/, '');
}

const CLIENT_ID = randomUUID();

// ----------------------------------------------------------------------------
// Workflow builders
// ----------------------------------------------------------------------------

export interface Txt2ImgParams {
  prompt: string;
  negativePrompt: string;
  model: string;
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  seed: number;
  batchSize?: number;
  filenamePrefix?: string;
}

export interface Img2ImgParams extends Txt2ImgParams {
  sourceImageName: string; // already uploaded via /upload/image
  denoiseStrength: number;
}

export interface InpaintParams extends Img2ImgParams {
  maskImageName: string;
}

/**
 * Build a minimal txt2img workflow using ComfyUI's API format.
 * Node IDs are strings. Inputs reference other nodes as [nodeId, outputIndex].
 */
export function buildTxt2ImgWorkflow(p: Txt2ImgParams): Record<string, any> {
  const prefix = p.filenamePrefix || 'corvus';
  return {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: p.model },
    },
    '5': {
      class_type: 'EmptyLatentImage',
      inputs: {
        width: p.width,
        height: p.height,
        batch_size: p.batchSize || 1,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.negativePrompt, clip: ['4', 1] },
    },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        sampler_name: p.sampler,
        scheduler: p.scheduler,
        denoise: 1.0,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: prefix, images: ['8', 0] },
    },
  };
}

export function buildImg2ImgWorkflow(p: Img2ImgParams): Record<string, any> {
  const prefix = p.filenamePrefix || 'corvus';
  return {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: p.model },
    },
    '10': {
      class_type: 'LoadImage',
      inputs: { image: p.sourceImageName, upload: 'image' },
    },
    '11': {
      class_type: 'VAEEncode',
      inputs: { pixels: ['10', 0], vae: ['4', 2] },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.negativePrompt, clip: ['4', 1] },
    },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        sampler_name: p.sampler,
        scheduler: p.scheduler,
        denoise: p.denoiseStrength,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['11', 0],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: prefix, images: ['8', 0] },
    },
  };
}

export function buildInpaintWorkflow(p: InpaintParams): Record<string, any> {
  const prefix = p.filenamePrefix || 'corvus';
  return {
    '4': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: p.model },
    },
    '10': {
      class_type: 'LoadImage',
      inputs: { image: p.sourceImageName, upload: 'image' },
    },
    '12': {
      class_type: 'LoadImage',
      inputs: { image: p.maskImageName, upload: 'image' },
    },
    // Convert mask image to an actual mask channel
    '13': {
      class_type: 'ImageToMask',
      inputs: { image: ['12', 0], channel: 'red' },
    },
    '14': {
      class_type: 'VAEEncodeForInpaint',
      inputs: {
        pixels: ['10', 0],
        vae: ['4', 2],
        mask: ['13', 0],
        grow_mask_by: 6,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.prompt, clip: ['4', 1] },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: { text: p.negativePrompt, clip: ['4', 1] },
    },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: p.seed,
        steps: p.steps,
        cfg: p.cfg,
        sampler_name: p.sampler,
        scheduler: p.scheduler,
        denoise: p.denoiseStrength,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['14', 0],
      },
    },
    '8': {
      class_type: 'VAEDecode',
      inputs: { samples: ['3', 0], vae: ['4', 2] },
    },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: prefix, images: ['8', 0] },
    },
  };
}

// ----------------------------------------------------------------------------
// API calls
// ----------------------------------------------------------------------------

export interface QueuePromptResult {
  prompt_id: string;
  number?: number;
  node_errors?: any;
}

export async function queuePrompt(
  workflow: Record<string, any>,
  settings?: Partial<ComfyUISettings>
): Promise<QueuePromptResult> {
  const url = `${baseUrl(settings)}/prompt`;
  logger.info(MOD, `queuePrompt → ${url} (${Object.keys(workflow).length} nodes)`);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: CLIENT_ID }),
    });
  } catch (err) {
    logger.error(MOD, `queuePrompt network failure to ${url}`, err);
    throw err;
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(MOD, `queuePrompt HTTP ${res.status}: ${text.slice(0, 200)}`);
    throw new Error(`ComfyUI /prompt error ${res.status}: ${text}`);
  }
  const result = (await res.json()) as QueuePromptResult;
  logger.success(MOD, `queuePrompt accepted: prompt_id=${result.prompt_id}`);
  return result;
}

export interface HistoryEntry {
  status?: { completed?: boolean; status_str?: string; messages?: any[] };
  outputs?: Record<string, any>;
}

export async function getHistory(
  promptId: string,
  settings?: Partial<ComfyUISettings>
): Promise<HistoryEntry | null> {
  const url = `${baseUrl(settings)}/history/${encodeURIComponent(promptId)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) return null;
  const data: any = await res.json();
  const entry = data?.[promptId];
  return entry || null;
}

export interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

export function extractImagesFromHistory(entry: HistoryEntry | null): ComfyImageRef[] {
  if (!entry || !entry.outputs) return [];
  const out: ComfyImageRef[] = [];
  for (const nodeId of Object.keys(entry.outputs)) {
    const node = entry.outputs[nodeId];
    if (node?.images && Array.isArray(node.images)) {
      for (const img of node.images) {
        if (img?.filename) {
          out.push({
            filename: img.filename,
            subfolder: img.subfolder || '',
            type: img.type || 'output',
          });
        }
      }
    }
  }
  return out;
}

export async function fetchImage(
  ref: ComfyImageRef,
  settings?: Partial<ComfyUISettings>
): Promise<Buffer> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder || '',
    type: ref.type || 'output',
  });
  const url = `${baseUrl(settings)}/view?${params.toString()}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`ComfyUI /view error ${res.status}`);
  }
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

/**
 * Upload a source image for img2img / inpaint.
 * Uses multipart/form-data — built via native FormData + Blob.
 */
export async function uploadImage(
  filename: string,
  data: Buffer,
  type: 'input' | 'mask' = 'input',
  settings?: Partial<ComfyUISettings>
): Promise<{ name: string; subfolder: string; type: string }> {
  const url = `${baseUrl(settings)}/upload/image`;
  logger.info(MOD, `uploadImage → ${url} name=${filename} type=${type} size=${data.length}B`);
  const form = new FormData();
  // Convert Buffer to a Uint8Array for Blob compatibility
  const bytes = new Uint8Array(data);
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  form.append('image', blob, filename);
  form.append('type', type);
  form.append('overwrite', 'true');

  const res = await fetch(url, { method: 'POST', body: form as any });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ComfyUI /upload/image error ${res.status}: ${text}`);
  }
  const json: any = await res.json();
  return {
    name: json?.name || filename,
    subfolder: json?.subfolder || '',
    type: json?.type || type,
  };
}

/**
 * Poll /history/{promptId} until the job is complete, then return image refs.
 */
export async function waitForCompletion(
  promptId: string,
  opts: { pollIntervalMs?: number; timeoutMs?: number } = {},
  settings?: Partial<ComfyUISettings>
): Promise<ComfyImageRef[]> {
  const pollInterval = opts.pollIntervalMs ?? 1000;
  const timeout = opts.timeoutMs ?? 5 * 60 * 1000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const entry = await getHistory(promptId, settings);
    if (entry && entry.outputs && Object.keys(entry.outputs).length > 0) {
      return extractImagesFromHistory(entry);
    }
    // Some ComfyUI versions only populate `status.completed` — check that too.
    if (entry?.status?.completed) {
      return extractImagesFromHistory(entry);
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
  throw new Error(`ComfyUI job ${promptId} timed out`);
}

/**
 * Convenience: run a workflow end-to-end.
 */
export async function runWorkflow(
  workflow: Record<string, any>,
  settings?: Partial<ComfyUISettings>
): Promise<{ promptId: string; images: ComfyImageRef[] }> {
  const started = Date.now();
  const result = await queuePrompt(workflow, settings);
  const images = await waitForCompletion(result.prompt_id, {}, settings);
  logger.success(
    MOD,
    `runWorkflow done prompt_id=${result.prompt_id} images=${images.length} (${Date.now() - started}ms)`
  );
  return { promptId: result.prompt_id, images };
}

/**
 * Fetch available models, samplers, and schedulers from ComfyUI's /object_info endpoint.
 */
export async function fetchComfyUIOptions(
  settings?: Partial<ComfyUISettings>
): Promise<{ models: string[]; samplers: string[]; schedulers: string[] }> {
  const url = `${baseUrl(settings)}/object_info`;
  logger.info(MOD, `fetchComfyUIOptions → ${url}`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', signal: controller.signal });
  } catch (err: any) {
    clearTimeout(timeout);
    const msg = err?.name === 'AbortError' ? 'Timed out fetching ComfyUI options' : (err?.message || 'Network error');
    logger.error(MOD, `fetchComfyUIOptions failed: ${msg}`);
    throw new Error(msg);
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    throw new Error(`ComfyUI /object_info returned HTTP ${res.status}`);
  }
  const data: any = await res.json();

  // Extract checkpoint models from CheckpointLoaderSimple node
  let models: string[] = [];
  const ckptNode = data?.CheckpointLoaderSimple;
  if (ckptNode?.input?.required?.ckpt_name) {
    const ckptInput = ckptNode.input.required.ckpt_name;
    if (Array.isArray(ckptInput) && Array.isArray(ckptInput[0])) {
      models = ckptInput[0];
    }
  }

  // Extract samplers from KSampler node
  let samplers: string[] = [];
  const ksamplerNode = data?.KSampler;
  if (ksamplerNode?.input?.required?.sampler_name) {
    const samplerInput = ksamplerNode.input.required.sampler_name;
    if (Array.isArray(samplerInput) && Array.isArray(samplerInput[0])) {
      samplers = samplerInput[0];
    }
  }

  // Extract schedulers from KSampler node
  let schedulers: string[] = [];
  if (ksamplerNode?.input?.required?.scheduler) {
    const schedulerInput = ksamplerNode.input.required.scheduler;
    if (Array.isArray(schedulerInput) && Array.isArray(schedulerInput[0])) {
      schedulers = schedulerInput[0];
    }
  }

  logger.info(MOD, `fetchComfyUIOptions found ${models.length} models, ${samplers.length} samplers, ${schedulers.length} schedulers`);
  return { models, samplers, schedulers };
}

/**
 * Connection test — hit the base URL (ComfyUI serves HTML on root) or /system_stats.
 */
export async function testConnection(
  settings?: Partial<ComfyUISettings>
): Promise<{ ok: boolean; error?: string; stats?: any }> {
  try {
    const url = `${baseUrl(settings)}/system_stats`;
    logger.info(MOD, `testConnection → ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(url, { method: 'GET', signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const stats = await res.json().catch(() => ({}));
    logger.success(MOD, 'testConnection OK');
    return { ok: true, stats };
  } catch (err: any) {
    const message = err?.name === 'AbortError'
      ? 'Connection timed out (10s). Check that ComfyUI is running and the URL is correct.'
      : err?.cause?.code === 'ECONNREFUSED'
      ? 'Connection refused. Is ComfyUI running?'
      : err?.message || 'Unknown error';
    logger.warn(MOD, `testConnection error: ${message}`);
    return { ok: false, error: message };
  }
}

/**
 * Helper to produce a random seed when caller wants one.
 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/**
 * Convert `ImageSettings`-style + prompt into params for a workflow builder.
 */
export function settingsToTxt2ImgParams(
  prompt: string,
  negativePrompt: string,
  settings: ImageSettings,
  filenamePrefix?: string
): Txt2ImgParams {
  return {
    prompt,
    negativePrompt,
    model: settings.model,
    sampler: settings.sampler,
    scheduler: settings.scheduler,
    steps: settings.steps,
    cfg: settings.cfg,
    width: settings.width,
    height: settings.height,
    seed: settings.seed,
    filenamePrefix,
  };
}
