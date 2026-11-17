import cors from 'cors';
import express, { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import agentsRouter from './routes/agents.js';
import charactersRouter from './routes/characters.js';
import chatRouter from './routes/chat.js';
import comfyuiRouter from './routes/comfyui.js';
import gamesRouter from './routes/games.js';
import imagesRouter from './routes/images.js';
import settingsRouter from './routes/settings.js';
import ttsRouter from './routes/tts.js';
import { getFileManager } from './services/fileManager.js';
import { logger } from './services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const MOD = 'corvus';

// ---------------------------------------------------------------------------
// Startup banner
// ---------------------------------------------------------------------------
logger.banner([
  '',
  '  ╔══════════════════════════════════════════╗',
  '  ║          CORVUS STORY CORE               ║',
  '  ║   Interactive fiction • Local-first      ║',
  '  ╚══════════════════════════════════════════╝',
  '',
]);

// Initialize file manager early — this creates the data dir & config.json on first run.
// Allow an env-var override of the data directory (useful for docker, multi-instance setups,
// or just keeping dev data separate from real data). If unset, defaults to ~/corvus-data.
if (process.env.CORVUS_DATA_DIR) {
  process.env.CORVUS_DATA_DIR = path.resolve(process.env.CORVUS_DATA_DIR);
  logger.info(MOD, `Using CORVUS_DATA_DIR=${process.env.CORVUS_DATA_DIR}`);
}
const fm = getFileManager(process.env.CORVUS_DATA_DIR);
const cfg = fm.getConfig();
logger.info(MOD, `Data directory : ${fm.getDataDir()}`);
logger.info(MOD, `LM Studio URL  : ${cfg.lmStudio.url}`);
logger.info(MOD, `ComfyUI URL    : ${cfg.comfyui.url}`);

// v1.1.34: sweep orphaned `.tmp-*` files left behind by a previous crash
// or unclean shutdown. Safe to run at every boot because every .tmp-* file
// is an in-progress write that didn't get rename()d to its final name; if
// the server is starting fresh, nothing is currently writing.
try {
  fm.sweepAllTempFiles();
} catch (err) {
  logger.warn(MOD, `startup tmp-file sweep failed (non-fatal): ${(err as Error).message}`);
}

const app = express();

// CORS
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Body parsers — 50mb for image uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ---------------------------------------------------------------------------
// Request logger — captures method, url, status, duration
// ---------------------------------------------------------------------------
app.use((req: Request, res: Response, next: NextFunction) => {
  if (!req.url.startsWith('/api')) return next();
  const started = Date.now();
  res.on('finish', () => {
    logger.request(req.method, req.url, res.statusCode, Date.now() - started);
  });
  res.on('close', () => {
    if (!res.writableEnded) {
      logger.request(req.method, req.url + ' (closed)', res.statusCode, Date.now() - started);
    }
  });
  next();
});

// Health
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true, dataDirectory: fm.getDataDir() });
});

// ---------------------------------------------------------------------------
// Route registration — order matters: more-specific first.
// Chat and image routers live under /api/games because their paths begin with :gameId.
// ---------------------------------------------------------------------------
const registeredRoutes: Array<[string, string]> = [
  ['/api/games', 'chat'],
  ['/api/games', 'images'],
  ['/api/games', 'games'],
  ['/api/agents', 'agents'],
  ['/api/comfyui', 'comfyui'],
  ['/api/settings', 'settings'],
  ['/api/character-card', 'character-card'],
  ['/api/tts', 'tts'],
];

app.use('/api/games', chatRouter);
app.use('/api/games', imagesRouter);
app.use('/api/games', gamesRouter);
app.use('/api/agents', agentsRouter);
app.use('/api/comfyui', comfyuiRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/character-card', charactersRouter);
app.use('/api/tts', ttsRouter);

for (const [mount, name] of registeredRoutes) {
  logger.info(MOD, `mounted ${name.padEnd(10)} → ${mount}`);
}

// ---------------------------------------------------------------------------
// Serve built client (if present)
// ---------------------------------------------------------------------------
const clientDist = path.resolve(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  logger.info(MOD, `Serving static client from ${clientDist}`);
} else {
  app.get('/', (_req: Request, res: Response) => {
    res.json({
      message: 'Corvus Story Core server is running.',
      clientBuild: 'Not found. Run `npm run build:client` (or use the dev server at :5173).',
      api: '/api',
    });
  });
  logger.warn(MOD, 'No client build found. Frontend should be served from `npm run dev:client`.');
}

// ---------------------------------------------------------------------------
// 404 for API (must come before the error handler)
// ---------------------------------------------------------------------------
app.use('/api', (req: Request, res: Response) => {
  logger.warn(MOD, `404 ${req.method} ${req.originalUrl}`);
  res.status(404).json({ error: 'Not found' });
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  logger.error(MOD, `Unhandled error for ${req.method} ${req.originalUrl}`, err);
  if (res.headersSent) return;
  res.status(500).json({ error: err?.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Process-level safety nets
// ---------------------------------------------------------------------------
process.on('uncaughtException', (err) => {
  logger.error(MOD, 'UNCAUGHT EXCEPTION', err);
});
process.on('unhandledRejection', (reason: any) => {
  logger.error(MOD, 'UNHANDLED REJECTION', reason instanceof Error ? reason : new Error(String(reason)));
});

app.listen(PORT, HOST, () => {
  logger.success(MOD, `Listening on http://${HOST}:${PORT}`);
});
