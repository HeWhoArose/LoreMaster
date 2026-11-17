import {
  ChatCompletionMessage,
  ChatCompletionRequest,
  LMStudioSettings,
} from '../types/index.js';
import { getFileManager } from './fileManager.js';
import { logger } from './logger.js';

const MOD = 'lmStudio';

/**
 * OpenAI-compatible chat completion client. Originally written for LM Studio
 * (hence the module name), but works with any server that implements the
 * /v1/chat/completions surface — vLLM, OpenAI, OpenRouter, llama.cpp's HTTP
 * server, Ollama (with the OpenAI shim), TGI, LocalAI, etc. The settings type
 * keeps the historical `lmStudio` name to avoid a churny on-disk migration.
 * No external SDK. Uses native fetch.
 */

/**
 * Build the standard headers for an OpenAI-compatible request. Sends a Bearer
 * token when one is configured, otherwise omits the Authorization header so
 * plain LM Studio (which 401s on unexpected headers in some builds) still
 * works out of the box.
 */
function buildHeaders(
  settings: LMStudioSettings,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const key = settings.apiKey?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

/**
 * Prepend the configured jailbreak prompt as an additional system message
 * at index 0, so it sits in front of every existing system prompt the caller
 * provides (game master, design agent, storyteller, summarizer, image chat).
 *
 * Multiple system messages are accepted by LM Studio, vLLM, OpenAI, and every
 * other OpenAI-compatible server we target — they concatenate in order. This
 * is intentionally a non-destructive prepend, NOT a merge into the existing
 * system, so we don't have to worry about content-array shapes (vision parts)
 * on the caller's system message.
 *
 * Returns the messages array unchanged when no jailbreak is configured.
 */
function applyJailbreakPrompt(
  messages: ChatCompletionMessage[],
  settings: LMStudioSettings,
): ChatCompletionMessage[] {
  const jb = settings.jailbreakPrompt?.trim();
  if (!jb) return messages;
  return [{ role: 'system', content: jb }, ...messages];
}

/** Provider-neutral label for the configured endpoint, used only in logs/errors. */
function providerLabel(settings: LMStudioSettings): string {
  const u = (settings.url || '').toLowerCase();
  if (u.includes('api.openai.com')) return 'OpenAI';
  if (u.includes('openrouter.ai')) return 'OpenRouter';
  if (u.includes('localhost:1234') || u.includes('127.0.0.1:1234')) return 'LM Studio';
  return 'LLM endpoint';
}

function resolveSettings(override?: Partial<LMStudioSettings>): LMStudioSettings {
  const fm = getFileManager();
  const cfg = fm.getConfig();
  return { ...cfg.lmStudio, ...(override || {}) };
}

function buildUrl(baseUrl: string, pathname: string): string {
  const trimmed = baseUrl.replace(/\/+$/, '');
  // If base ends in /v1, avoid double /v1
  if (trimmed.endsWith('/v1')) {
    return trimmed + pathname.replace(/^\/v1/, '');
  }
  return trimmed + pathname;
}

export interface ChatCompletionResult {
  content: string;
  raw: any;
}

/**
 * Non-streaming chat completion. Returns full text.
 * Used for Game Master (needs full JSON) and summarizer.
 */
export async function chatCompletion(
  messages: ChatCompletionMessage[],
  opts: Partial<LMStudioSettings & { seed?: number; stream?: false }> = {}
): Promise<ChatCompletionResult> {
  const settings = resolveSettings(opts);
  const url = buildUrl(settings.url, '/v1/chat/completions');

  const finalMessages = applyJailbreakPrompt(messages, settings);
  const body: ChatCompletionRequest = {
    messages: finalMessages,
    temperature: settings.temperature,
    top_p: settings.topP,
    max_tokens: settings.maxTokens,
    stream: false,
  };
  const modelId = settings.model?.trim();
  if (modelId) body.model = modelId;
  if (typeof opts.seed === 'number') body.seed = opts.seed;

  const started = Date.now();
  const provider = providerLabel(settings);
  const jbApplied = finalMessages.length !== messages.length;
  logger.info(
    MOD,
    `chatCompletion → ${url} (${provider}, model=${modelId || '<loaded>'}) messages=${finalMessages.length}${jbApplied ? ' [jailbreak prepended]' : ''}`,
  );
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(settings),
      body: JSON.stringify(body),
    });
  } catch (err) {
    logger.error(MOD, `chatCompletion network failure to ${url}`, err);
    throw err;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    logger.error(MOD, `chatCompletion HTTP ${res.status}: ${text.slice(0, 200)}`);
    throw new Error(`${provider} error ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  const msg = data?.choices?.[0]?.message;
  // Some models (DeepSeek, Qwen, etc.) put output in reasoning_content or thinking
  // instead of content when using thinking/reasoning mode.
  const content = msg?.content ?? '';
  const reasoning = msg?.reasoning_content ?? msg?.thinking ?? '';
  const usable = content || reasoning;

  // Log the full structure so we can see what fields are present
  if (msg) {
    const fields = Object.keys(msg).filter(k => msg[k] !== null && msg[k] !== undefined && msg[k] !== '');
    logger.info(MOD, `chatCompletion response fields: ${fields.join(', ')} | content=${content.length} chars, reasoning=${reasoning.length} chars`);
  }
  if (!content && reasoning) {
    logger.warn(MOD, `chatCompletion: content was empty but reasoning_content had ${reasoning.length} chars — using reasoning as content`);
  }

  logger.success(MOD, `chatCompletion done in ${Date.now() - started}ms (${usable.length} chars)`);
  return { content: usable, raw: data };
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  raw?: any;
}

export type StreamHandler = (chunk: StreamChunk) => void | Promise<void>;

/**
 * Streaming chat completion. Parses OpenAI-compatible SSE stream.
 * Calls onChunk for each delta; returns the final assembled content.
 */
export async function chatCompletionStream(
  messages: ChatCompletionMessage[],
  onChunk: StreamHandler,
  opts: Partial<LMStudioSettings & { seed?: number }> = {},
  abortSignal?: AbortSignal
): Promise<string> {
  const settings = resolveSettings(opts);
  const url = buildUrl(settings.url, '/v1/chat/completions');

  const finalMessages = applyJailbreakPrompt(messages, settings);
  const body: ChatCompletionRequest = {
    messages: finalMessages,
    temperature: settings.temperature,
    top_p: settings.topP,
    max_tokens: settings.maxTokens,
    stream: true,
  };
  const modelId = settings.model?.trim();
  if (modelId) body.model = modelId;
  if (typeof opts.seed === 'number') body.seed = opts.seed;

  const started = Date.now();
  const provider = providerLabel(settings);
  const jbApplied = finalMessages.length !== messages.length;
  logger.info(
    MOD,
    `chatCompletionStream → ${url} (${provider}, model=${modelId || '<loaded>'}) messages=${finalMessages.length}${jbApplied ? ' [jailbreak prepended]' : ''}`,
  );

  // Check if signal is already aborted before even trying
  if (abortSignal?.aborted) {
    logger.warn(MOD, 'chatCompletionStream: abort signal already aborted before fetch, ignoring it');
    abortSignal = undefined;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(settings, { Accept: 'text/event-stream' }),
      body: JSON.stringify(body),
      // Don't pass the abort signal to the initial fetch — only use it during streaming
      // This prevents premature aborts from Vite proxy / SSE connection resets
    });
  } catch (err) {
    logger.error(MOD, `chatCompletionStream network failure to ${url}`, err);
    throw err;
  }

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '');
    logger.error(MOD, `chatCompletionStream HTTP ${res.status}: ${text.slice(0, 200)}`);
    throw new Error(`${provider} stream error ${res.status}: ${text}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  let fullReasoning = '';
  let chunkCount = 0;
  let loggedFirstChunk = false;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE messages are separated by double newlines. Each line may be:
    //   data: {json}
    //   data: [DONE]
    let sepIndex: number;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const lines = rawEvent.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          // If content is empty but we collected reasoning tokens, use those
          const finalContent = fullContent || fullReasoning;
          if (!fullContent && fullReasoning) {
            logger.warn(MOD, `chatCompletionStream: content was empty but reasoning had ${fullReasoning.length} chars — using reasoning as content`);
          }
          await onChunk({ delta: '', done: true });
          logger.success(MOD, `chatCompletionStream done in ${Date.now() - started}ms (content=${fullContent.length}, reasoning=${fullReasoning.length}, total=${finalContent.length} chars, ${chunkCount} chunks)`);
          return finalContent;
        }
        try {
          const parsed = JSON.parse(payload);
          const choiceDelta = parsed?.choices?.[0]?.delta;

          // Log the first chunk's structure so we can see what fields the model uses
          if (!loggedFirstChunk && choiceDelta) {
            const deltaKeys = Object.keys(choiceDelta).filter(k => choiceDelta[k] !== null && choiceDelta[k] !== undefined);
            logger.info(MOD, `chatCompletionStream first chunk delta keys: [${deltaKeys.join(', ')}]`);
            loggedFirstChunk = true;
          }

          // Extract content from all known fields:
          //   - content: standard OpenAI field
          //   - reasoning_content: DeepSeek thinking mode
          //   - thinking: some other models
          const contentDelta = choiceDelta?.content ?? '';
          const reasoningDelta = choiceDelta?.reasoning_content ?? choiceDelta?.thinking ?? '';

          if (contentDelta) {
            fullContent += contentDelta;
            chunkCount++;
            await onChunk({ delta: contentDelta, done: false, raw: parsed });
          }
          if (reasoningDelta) {
            fullReasoning += reasoningDelta;
            chunkCount++;
            // Don't emit reasoning chunks to the story stream handler —
            // they're thinking tokens, not user-visible content.
            // But we DO capture them so the image agent can use the text.
          }

          if (parsed?.choices?.[0]?.finish_reason) {
            const finalContent = fullContent || fullReasoning;
            if (!fullContent && fullReasoning) {
              logger.warn(MOD, `chatCompletionStream: content was empty but reasoning had ${fullReasoning.length} chars — using reasoning as content`);
            }
            await onChunk({ delta: '', done: true, raw: parsed });
            logger.success(
              MOD,
              `chatCompletionStream finished (${parsed.choices[0].finish_reason}) in ${Date.now() - started}ms (content=${fullContent.length}, reasoning=${fullReasoning.length}, total=${finalContent.length} chars, ${chunkCount} chunks)`
            );
            return finalContent;
          }
        } catch {
          // Ignore malformed chunks — servers commonly send heartbeats / keepalives.
        }
      }
    }
  }

  // Flush any tail
  const finalContent = fullContent || fullReasoning;
  if (!fullContent && fullReasoning) {
    logger.warn(MOD, `chatCompletionStream EOF: content was empty but reasoning had ${fullReasoning.length} chars — using reasoning as content`);
  }
  await onChunk({ delta: '', done: true });
  logger.success(MOD, `chatCompletionStream EOF in ${Date.now() - started}ms (content=${fullContent.length}, reasoning=${fullReasoning.length}, total=${finalContent.length} chars, ${chunkCount} chunks)`);
  return finalContent;
}

/**
 * Connection test: pings /v1/models.
 */
export async function testConnection(
  settings?: Partial<LMStudioSettings>
): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    const s = resolveSettings(settings);
    const url = buildUrl(s.url, '/v1/models');
    logger.info(MOD, `testConnection → ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: buildHeaders(s),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const msg = res.status === 401 || res.status === 403
        ? `HTTP ${res.status} — the endpoint rejected the API key. Check the API Key field in settings.`
        : `HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`;
      logger.warn(MOD, `testConnection failed: ${msg}`);
      return { ok: false, error: msg };
    }
    const data: any = await res.json();
    const models: string[] = Array.isArray(data?.data)
      ? data.data.map((m: any) => m.id).filter(Boolean)
      : [];
    logger.success(MOD, `testConnection OK — available model(s): ${models.join(', ') || '(none)'}`);
    return { ok: true, models };
  } catch (err: any) {
    const message = err?.name === 'AbortError'
      ? 'Connection timed out (10s). Check that the URL is correct and the server is reachable.'
      : err?.cause?.code === 'ECONNREFUSED'
      ? `Connection refused at the configured URL. Is the server running?`
      : err?.cause?.code === 'ENOTFOUND'
      ? `Could not resolve hostname. Check the URL.`
      : err?.message || 'Unknown error';
    logger.warn(MOD, `testConnection error: ${message}`, err);
    return { ok: false, error: message };
  }
}

/**
 * List available models.
 */
export async function listModels(settings?: Partial<LMStudioSettings>): Promise<string[]> {
  const result = await testConnection(settings);
  return result.models || [];
}

// ---------------------------------------------------------------------------
// Vision capability probe
//
// LM Studio (>= 0.3) exposes an enhanced REST endpoint at /api/v0/models that
// includes a `capabilities` array (e.g. ["chat", "tool_use", "vision"]). We
// prefer that. If it isn't reachable, we fall back to the OpenAI-compatible
// /v1/models endpoint and run a name-based heuristic so the user still gets
// reasonable behaviour with older versions.
// ---------------------------------------------------------------------------

export interface VisionStatus {
  ok: boolean;
  vision: boolean;
  model?: string;
  /** Why we believe this model does (or doesn't) support vision. */
  reason: string;
  /** True when our answer is heuristic rather than authoritative. */
  heuristic?: boolean;
  error?: string;
}

const VISION_KEYWORDS = [
  'vision',
  'vl',
  'llava',
  'bakllava',
  'moondream',
  'cogvlm',
  'minicpm-v',
  'minicpm-o',
  'qwen2-vl',
  'qwen2.5-vl',
  'qwen3-vl',
  'internvl',
  'pixtral',
  'gemma-3',
  'gemma3',
  'gpt-4o',
  'gpt-4-vision',
  'gpt-4-turbo',
  'claude-3',
  'phi-3-vision',
  'phi-4-multimodal',
];

function nameLooksLikeVision(name: string): boolean {
  const n = (name || '').toLowerCase();
  return VISION_KEYWORDS.some((kw) => n.includes(kw));
}

export async function probeVisionCapability(
  settings?: Partial<LMStudioSettings>,
): Promise<VisionStatus> {
  const s = resolveSettings(settings);

  // 1) Try LM Studio's enhanced endpoint, which reports `capabilities`.
  try {
    const url = buildUrl(s.url, '/api/v0/models');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let res: Response | null = null;
    try {
      res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
        headers: buildHeaders(s),
      });
    } finally {
      clearTimeout(timeout);
    }
    if (res && res.ok) {
      const data: any = await res.json();
      const list: any[] = Array.isArray(data?.data) ? data.data : [];
      // Prefer a model that is currently loaded.
      const loaded = list.find((m) => m && (m.state === 'loaded' || m.loaded === true)) || list[0];
      if (loaded) {
        const caps: string[] = Array.isArray(loaded.capabilities) ? loaded.capabilities : [];
        const hasVision = caps.includes('vision');
        return {
          ok: true,
          vision: hasVision,
          model: loaded.id || loaded.modelKey || loaded.path,
          reason: hasVision
            ? `Model reports vision capability (${caps.join(', ') || 'vision'}).`
            : `Model does not report vision capability${caps.length ? ` (capabilities: ${caps.join(', ')})` : ''}.`,
          heuristic: false,
        };
      }
    }
  } catch {
    // Endpoint not available — fall through to heuristic mode.
  }

  // 2) Fall back to /v1/models + name heuristic.
  const conn = await testConnection(settings);
  if (!conn.ok) {
    return {
      ok: false,
      vision: false,
      reason: 'Could not reach the LLM endpoint.',
      error: conn.error,
    };
  }
  // Prefer the explicitly configured model id when one is set (vLLM/OpenAI);
  // otherwise fall back to whatever the server lists first (LM Studio).
  const configuredModel = s.model?.trim();
  const model =
    (configuredModel && (conn.models || []).find((m) => m === configuredModel)) ||
    configuredModel ||
    (conn.models || [])[0];
  if (!model) {
    return {
      ok: true,
      vision: false,
      reason: 'No model is currently loaded / configured.',
      heuristic: true,
    };
  }
  const visionByName = nameLooksLikeVision(model);
  return {
    ok: true,
    vision: visionByName,
    model,
    reason: visionByName
      ? `Model name "${model}" looks like a vision model. (Heuristic — endpoint doesn't report capabilities.)`
      : `Model name "${model}" doesn't look like a vision model. Load a vision-capable model (e.g. LLaVA, Qwen2-VL, MiniCPM-V, Gemma 3, Pixtral) and try again.`,
    heuristic: true,
  };
}
