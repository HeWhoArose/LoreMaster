import { TTSSettings } from '../types/index.js';
import { getFileManager } from './fileManager.js';
import { logger } from './logger.js';

const MOD = 'chatterbox';

/**
 * Chatterbox TTS client.
 *
 * The Chatterbox ecosystem has at least two popular HTTP wrappers and
 * they disagree on almost every endpoint *except* `/v1/audio/speech`.
 * This client probes both shapes so the same settings flow works for
 * either fork:
 *
 *   - **devnen/Chatterbox-TTS-Server** (port 8000 by default):
 *       voices  → `GET /get_predefined_voices` (and `GET /get_reference_files`)
 *       health  → no dedicated endpoint, but `/get_predefined_voices`
 *                 itself returns 200 when alive
 *       TTS     → `POST /v1/audio/speech` (voice = filename incl. extension)
 *       formats → wav, opus
 *
 *   - **travisvn/chatterbox-tts-api** (port 4123 by default):
 *       voices  → none (uses a single voice-sample file)
 *       health  → `GET /health`
 *       TTS     → `POST /v1/audio/speech` (voice field largely ignored)
 *       formats → wav, mp3, flac, opus
 *
 * Sensible probe order: devnen voices first (most common when a list is
 * present), then `/v1/voices` (for forks that add it), then `/health`
 * (travisvn), then `/docs` (any FastAPI server) as a last-resort liveness
 * check. Each probe is cheap and short-timeout-bounded.
 */

export interface ChatterboxVoice {
  id: string;
  name: string;
  /** Where this voice came from, surfaced in the UI as a chip. */
  source?: 'predefined' | 'reference' | 'openai';
}

function resolveSettings(override?: Partial<TTSSettings>): TTSSettings {
  const fm = getFileManager();
  const cfg = fm.getConfig();
  return { ...cfg.tts, ...(override || {}) };
}

function buildHeaders(
  settings: TTSSettings,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const key = settings.apiKey?.trim();
  if (key) headers.Authorization = `Bearer ${key}`;
  return headers;
}

function buildUrl(base: string, path: string): string {
  const b = (base || '').replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${b}${p}`;
}

function explainFetchError(err: any): string {
  if (err?.name === 'AbortError') return 'Connection timed out (8s).';
  const code = err?.cause?.code || err?.code;
  if (code === 'ECONNREFUSED') return 'Connection refused. Is the Chatterbox server running on that URL?';
  if (code === 'ENOTFOUND') return 'Could not resolve hostname.';
  if (code === 'EHOSTUNREACH') return 'Host unreachable. Check the IP / firewall.';
  if (code === 'ETIMEDOUT') return 'Connection timed out at the OS level.';
  return err?.message || 'Unknown network error';
}

/**
 * Coerce one of devnen's payload shapes into our `ChatterboxVoice[]`.
 *
 * devnen's `/get_predefined_voices` returns either:
 *   - `["female_01.wav", "male_03.wav"]`  (array of filenames), or
 *   - `[{ filename, display_name }, ...]` (in newer builds).
 *
 * `/get_reference_files` returns an array of reference clone filenames.
 *
 * `/v1/voices` (other forks) returns the OpenAI shape: `{ data: [{id, ...}] }`
 * or `{ voices: [...] }`. We accept all of them.
 */
function normalizeVoices(
  data: any,
  source: ChatterboxVoice['source'],
): ChatterboxVoice[] {
  let arr: any[] = [];
  if (Array.isArray(data)) arr = data;
  else if (Array.isArray(data?.voices)) arr = data.voices;
  else if (Array.isArray(data?.data)) arr = data.data;
  else if (Array.isArray(data?.files)) arr = data.files;
  else return [];

  const out: ChatterboxVoice[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      const id = item.trim();
      if (!id) continue;
      out.push({ id, name: prettifyVoiceId(id), source });
    } else if (item && typeof item === 'object') {
      const id = String(
        item.filename ?? item.id ?? item.voice_id ?? item.name ?? '',
      ).trim();
      if (!id) continue;
      const name = String(
        item.display_name ?? item.name ?? item.label ?? prettifyVoiceId(id),
      ).trim();
      out.push({ id, name, source });
    }
  }
  const seen = new Set<string>();
  return out.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
}

/** Turn `female_01.wav` into `female 01` for the UI label. */
function prettifyVoiceId(id: string): string {
  return id.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
}

/**
 * Optimistic, multi-endpoint voice probe. Combines devnen's predefined +
 * reference lists, then falls back to `/v1/voices` for forks that ship
 * the OpenAI catalog endpoint. Returns `{ ok: true, voices: [] }` when
 * the server is reachable but doesn't publish a list (travisvn shape).
 *
 * Any actual network failure surfaces as `{ ok: false, error }` with a
 * specific message (ECONNREFUSED vs timeout vs DNS).
 */
export async function listVoices(
  override?: Partial<TTSSettings>,
): Promise<{ ok: boolean; voices: ChatterboxVoice[]; error?: string }> {
  const s = resolveSettings(override);
  if (!s.url?.trim()) {
    return { ok: false, voices: [], error: 'TTS URL is not configured.' };
  }

  // Hit the two devnen endpoints in parallel. They're cheap and harmless
  // on servers that don't implement them (we just get null back).
  let networkFailed = false;
  let networkError = '';
  const tryFetch = async (path: string): Promise<any | null> => {
    const url = buildUrl(s.url, path);
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 6000);
    try {
      const res = await fetch(url, { signal: c.signal, headers: buildHeaders(s) });
      if (res.status === 404 || res.status === 405) return null;
      if (!res.ok) return null;
      return await res.json().catch(() => ({}));
    } catch (err: any) {
      // Distinguish "endpoint missing" from "server down". A network-level
      // failure on the FIRST probe means the server is unreachable, so we
      // record it; subsequent probes won't recover.
      networkFailed = true;
      networkError = explainFetchError(err);
      return null;
    } finally {
      clearTimeout(t);
    }
  };

  const [predefined, reference, openai] = await Promise.all([
    tryFetch('/get_predefined_voices'),
    tryFetch('/get_reference_files'),
    tryFetch('/v1/voices'),
  ]);

  if (networkFailed && !predefined && !reference && !openai) {
    logger.warn(MOD, `listVoices: all probes failed: ${networkError}`);
    return { ok: false, voices: [], error: networkError };
  }

  const voices: ChatterboxVoice[] = [
    ...normalizeVoices(predefined, 'predefined'),
    ...normalizeVoices(reference, 'reference'),
    ...normalizeVoices(openai, 'openai'),
  ];
  // De-dup across sources by id.
  const seen = new Set<string>();
  const deduped = voices.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
  logger.info(
    MOD,
    `listVoices → ${deduped.length} voice(s) (predefined=${normalizeVoices(predefined, 'predefined').length} reference=${normalizeVoices(reference, 'reference').length} openai=${normalizeVoices(openai, 'openai').length})`,
  );
  return { ok: true, voices: deduped };
}

/**
 * Definitive reachability probe. Hits, in order:
 *   1. `/get_predefined_voices` (devnen)
 *   2. `/health` (travisvn)
 *   3. `/docs` (any FastAPI)
 *   4. `/` (last resort)
 *
 * The first to return any 2xx wins. The voice list is pulled in as a
 * side-effect so the UI can populate its dropdown.
 */
export async function testConnection(
  override?: Partial<TTSSettings>,
): Promise<{ ok: boolean; info?: any; voices?: ChatterboxVoice[]; error?: string }> {
  const s = resolveSettings(override);
  if (!s.url?.trim()) return { ok: false, error: 'TTS URL is not configured.' };

  const candidates: Array<{ path: string; label: string }> = [
    { path: '/get_predefined_voices', label: 'devnen' },
    { path: '/health', label: 'health' },
    { path: '/docs', label: 'docs' },
    { path: '/', label: 'root' },
  ];

  let lastError = '';
  for (const c of candidates) {
    const url = buildUrl(s.url, c.path);
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: ctrl.signal,
        headers: buildHeaders(s),
      });
      if (res.status === 404 || res.status === 405) {
        clearTimeout(timeout);
        continue; // try next candidate
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        lastError = `HTTP ${res.status}${t ? `: ${t.slice(0, 200)}` : ''}`;
        clearTimeout(timeout);
        continue;
      }
      // Got a hit — pull the voice list separately so the UI dropdown can
      // populate even if we matched on /health or /docs.
      const v = await listVoices(override);
      logger.success(MOD, `testConnection ok via ${c.label} (${url})`);
      clearTimeout(timeout);
      return { ok: true, info: { probe: c.label }, voices: v.voices };
    } catch (err: any) {
      lastError = explainFetchError(err);
      clearTimeout(timeout);
      // ECONNREFUSED / ENOTFOUND / EHOSTUNREACH won't recover by changing
      // the path — abort the loop and surface the network error now.
      if (/refused|resolve|unreachable|timed out/i.test(lastError)) {
        return { ok: false, error: lastError };
      }
    }
  }
  return { ok: false, error: lastError || 'No known endpoint responded.' };
}

export interface SynthesizeArgs {
  text: string;
  voice?: string;
  override?: Partial<TTSSettings>;
  signal?: AbortSignal;
}

export interface SynthesizeResult {
  audio: ArrayBuffer;
  contentType: string;
  format: string;
}

/**
 * POST /v1/audio/speech. Works on both devnen and travisvn forks.
 *
 * devnen accepts `voice` as a filename (`female_01.wav`) and dispatches
 * to either its predefined-voice or reference-audio path based on which
 * directory the file lives in. travisvn largely ignores `voice` and
 * uses its server-side `voice-sample.mp3`.
 *
 * Output: streaming binary in `wav` / `opus` (devnen) or
 * `wav/mp3/flac/opus` (travisvn). We pass through the Content-Type the
 * server returned so the browser <audio> element gets the right hint.
 */
export async function synthesize({
  text,
  voice,
  override,
  signal,
}: SynthesizeArgs): Promise<SynthesizeResult> {
  const s = resolveSettings(override);
  if (!s.url?.trim()) throw new Error('TTS URL is not configured.');
  const trimmedText = (text || '').trim();
  if (!trimmedText) throw new Error('synthesize: empty text');

  const url = buildUrl(s.url, '/v1/audio/speech');
  const body: any = {
    model: 'chatterbox',
    input: trimmedText,
    response_format: s.format,
    speed: Math.max(0.5, Math.min(2.0, s.speed || 1.0)),
  };
  const v = (voice || '').trim() || s.narratorVoice?.trim();
  if (v) body.voice = v;

  const started = Date.now();
  logger.info(
    MOD,
    `synthesize → ${url} voice=${v || '<default>'} format=${s.format} chars=${trimmedText.length}`,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(s, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
    });
  } catch (err: any) {
    throw new Error(explainFetchError(err));
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    logger.error(MOD, `synthesize HTTP ${res.status}: ${t.slice(0, 200)}`);
    throw new Error(`Chatterbox error ${res.status}: ${t}`);
  }

  const contentType = res.headers.get('content-type') || `audio/${s.format}`;
  const audio = await res.arrayBuffer();
  logger.success(
    MOD,
    `synthesize OK ${audio.byteLength} bytes in ${Date.now() - started}ms`,
  );
  return { audio, contentType, format: s.format };
}
