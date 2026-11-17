import { Router, Request, Response } from 'express';
import { listVoices, synthesize, testConnection } from '../services/chatterbox.js';
import { logger } from '../services/logger.js';
import { TTSSettings } from '../types/index.js';

const router = Router();
const MOD = 'routes/tts';

/**
 * GET /api/tts/voices
 * Returns `{ ok, voices, error? }`. Proxies the Chatterbox `/v1/voices`
 * endpoint so the browser doesn't have to hit it directly (avoids CORS).
 */
router.get('/voices', async (req: Request, res: Response) => {
  try {
    // Accept optional ?url= and ?apiKey= so the settings panel can probe
    // a server before saving. Empty / absent → use the saved config.
    const override: Partial<TTSSettings> = {};
    if (typeof req.query.url === 'string' && req.query.url.trim()) override.url = req.query.url.trim();
    if (typeof req.query.apiKey === 'string') override.apiKey = req.query.apiKey;
    const result = await listVoices(Object.keys(override).length ? override : undefined);
    return res.json(result);
  } catch (err) {
    logger.error(MOD, 'listVoices failed', err);
    return res.status(500).json({ ok: false, voices: [], error: (err as Error).message });
  }
});

/**
 * POST /api/tts/synthesize
 * Body: { text: string, voice?: string }
 * Returns raw audio bytes with the Content-Type the Chatterbox server gave us.
 * The client picks this up as a Blob and feeds it to an <audio> element.
 */
router.post('/synthesize', async (req: Request, res: Response) => {
  try {
    const { text, voice } = (req.body || {}) as { text?: string; voice?: string };
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required' });
    }
    const result = await synthesize({ text, voice });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-TTS-Format', result.format);
    return res.send(Buffer.from(result.audio));
  } catch (err) {
    const msg = (err as Error).message || 'synthesis failed';
    logger.error(MOD, `synthesize failed: ${msg}`);
    // Match LM Studio's pattern: stable wire error code for the client to
    // distinguish "server unreachable" from "server returned an error".
    const code = /Chatterbox error/i.test(msg) ? 'tts_error' : 'tts_unreachable';
    return res.status(502).json({ error: msg, code });
  }
});

/**
 * POST /api/tts/test
 * Optional body: `Partial<TTSSettings>` so the user can hit Test without
 * saving first. Returns `{ ok, voices?, error? }`.
 */
router.post('/test', async (req: Request, res: Response) => {
  try {
    const override = (req.body || {}) as Partial<TTSSettings>;
    const result = await testConnection(Object.keys(override).length ? override : undefined);
    return res.json(result);
  } catch (err) {
    logger.error(MOD, 'testConnection failed', err);
    return res.status(500).json({ ok: false, error: (err as Error).message });
  }
});

export default router;
