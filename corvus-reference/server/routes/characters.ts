import { Router, Request, Response } from 'express';
import { parseCharacterCard, extractGreetings } from '../services/characterCardImport.js';
import { logger } from '../services/logger.js';

/**
 * Standalone character-card parser. Mirrors POST /api/games/:gameId/characters/import
 * but doesn't require an existing game — used by the "New Character Chat" flow,
 * which needs to parse a card BEFORE the game is created so the user can review
 * the imported fields and decide whether to commit.
 *
 * Mounted at `/api/character-card`. Returns the parsed draft only — saving is
 * the client's responsibility once the game is created.
 */
const router = Router();
const MOD = 'routes/characters';

router.post('/parse', (req: Request, res: Response) => {
  try {
    const { fileBase64, filename } = req.body || {};
    if (typeof fileBase64 !== 'string' || !fileBase64) {
      return res.status(400).json({ error: 'Field "fileBase64" is required.' });
    }

    const commaIdx = fileBase64.indexOf(',');
    const b64 =
      commaIdx >= 0 && fileBase64.startsWith('data:')
        ? fileBase64.slice(commaIdx + 1)
        : fileBase64;

    let buffer: Buffer;
    try {
      buffer = Buffer.from(b64, 'base64');
    } catch {
      return res.status(400).json({ error: 'fileBase64 is not valid base64.' });
    }

    let parsed;
    try {
      parsed = parseCharacterCard(buffer, typeof filename === 'string' ? filename : undefined);
    } catch (err) {
      logger.warn(MOD, `Standalone card parse failed: ${(err as Error).message}`);
      return res.status(400).json({ error: (err as Error).message });
    }

    const greetings = extractGreetings(parsed.raw);
    logger.info(
      MOD,
      `Parsed character card (source=${parsed.raw.source}, name=${parsed.raw.name || 'unnamed'}, greetings=${greetings.length}) [standalone]`,
    );
    return res.json({
      source: parsed.raw.source,
      draft: parsed.npc,
      greetings,
    });
  } catch (err) {
    logger.error(MOD, 'Failed to parse character card', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
