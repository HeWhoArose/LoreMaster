import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import {
  ComfyUIExamplePrompt,
  GameConfig,
  WorldInfo,
  PlayerCharacter,
  NPCCharacter,
  ChatMessage,
  WorldState,
  ImageMetadata,
  GlobalConfig,
  Summary,
} from '../types/index.js';
import { logger } from './logger.js';

const MOD = 'fileManager';

// ----------------------------------------------------------------------------
// Paths & defaults
// ----------------------------------------------------------------------------

export const DEFAULT_DATA_DIR = path.join(os.homedir(), 'corvus-data');
export const CONFIG_FILENAME = 'config.json';

/**
 * Seed example prompts shown to first-time users. These are booru-style tag
 * prompts that work well with most SD/SDXL/Pony/Illustrious checkpoints.
 * Users can replace or extend them in Settings.
 */
export function getDefaultExamplePrompts(): ComfyUIExamplePrompt[] {
  return [
    {
      label: 'Booru portrait — anime woman',
      prompt:
        'masterpiece, best quality, highly detailed, sharp focus, 1girl, solo, upper body, looking at viewer, slight smile, long black hair, side braid, violet eyes, fair skin, slim build, dark green hooded cloak, leather harness, brown leather gloves, silver pendant necklace, ornate dagger at hip, dim torchlit tavern background, warm rim light, cinematic lighting, shallow depth of field, intricate details, painterly',
      negative:
        'low quality, worst quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, extra fingers, missing fingers, deformed, mutated, watermark, signature, text, cropped, out of frame, multiple views',
    },
    {
      label: 'Booru portrait — anime man',
      prompt:
        'masterpiece, best quality, highly detailed, sharp focus, 1boy, solo, upper body shot, three-quarter view, looking to the side, short messy auburn hair, hazel eyes, light stubble, sharp jawline, athletic build, weathered brown leather jacket, dark grey henley shirt, black fingerless gloves, silver ring, faint scar across left cheek, neon-lit alley background, cinematic lighting, soft rim light, atmospheric haze, intricate details',
      negative:
        'low quality, worst quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, extra fingers, missing fingers, deformed, mutated, watermark, signature, text, cropped, out of frame, multiple views',
    },
    {
      label: 'Cinematic semi-realistic portrait',
      prompt:
        'cinematic photograph, highly detailed, sharp focus, professional color grading, 35mm film, portrait of a young woman, three-quarter view, copper red wavy hair shoulder length, freckled fair skin, green eyes, soft natural makeup, ivory linen blouse, brass locket necklace, sun-warmed wheat field background, golden hour, soft rim light, shallow depth of field, bokeh, photorealistic, intricate details',
      negative:
        'low quality, blurry, jpeg artifacts, deformed, bad anatomy, bad hands, extra fingers, missing fingers, plastic skin, oversaturated, watermark, signature, text, cropped, out of frame',
    },
    {
      label: 'Fantasy painting — hero portrait',
      prompt:
        'masterpiece, oil painting, highly detailed, dramatic lighting, portrait of a grizzled warrior, upper body, three-quarter view, weather-worn face, grey-flecked dark beard, deep blue eyes, broad shoulders, dented steel breastplate, crimson tabard, fur-lined cloak, leather gauntlets, sword pommel visible at shoulder, stormy battlefield background, golden lantern light, painterly brushstrokes, intricate details, fantasy art',
      negative:
        'low quality, blurry, deformed, bad anatomy, bad hands, extra fingers, missing fingers, watermark, signature, text, cropped, out of frame, modern clothes, cartoon',
    },
    // -----------------------------------------------------------------
    // Multi-character examples (v1.1.21). These demonstrate the booru
    // patterns the image-chat agent should mimic when a scene has 2+
    // subjects: leading count token ("2girls" / "1boy 1girl"), per-subject
    // outfit/pose clusters in narrative order separated by " BREAK ", then
    // shared scene tags (setting, lighting, camera, art style). The server
    // prepends identity from each NPC's coreAppearance — these examples are
    // for SCENE STYLE only, not identity.
    // -----------------------------------------------------------------
    {
      label: 'Booru — two women, intimate conversation',
      prompt:
        'masterpiece, best quality, highly detailed, sharp focus, 2girls, multiple girls, looking at each other, close-up, upper body, long black hair, side braid, violet eyes, fair skin, dark green hooded cloak, leather harness, leaning forward, hands clasped on table BREAK 2girls, multiple girls, copper red wavy hair shoulder length, freckled fair skin, green eyes, ivory linen blouse, brass locket, slight smile, head tilted, hands wrapped around mug, dim torchlit tavern interior, wooden booth, warm rim light, candle flame, shallow depth of field, cinematic lighting, intricate details, painterly',
      negative:
        'low quality, worst quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, extra fingers, missing fingers, deformed, mutated, fused faces, conjoined, watermark, signature, text, cropped, out of frame, multiple views, 3girls, 4girls, solo',
    },
    {
      label: 'Booru — man and woman, action / confrontation',
      prompt:
        'masterpiece, best quality, highly detailed, sharp focus, 1boy 1girl, hetero, facing each other, full body, dynamic pose, short messy auburn hair, hazel eyes, light stubble, athletic build, weathered brown leather jacket, dark grey henley, black fingerless gloves, drawing pistol from holster, intense expression BREAK 1boy 1girl, long black hair tied back, violet eyes, fair skin, dark green hooded cloak thrown open, leather harness, ornate dagger raised in defensive stance, snarling, neon-lit rain-slick alley background, puddle reflections, fog, cinematic lighting, low angle shot, motion blur on rain, intricate details, atmospheric, painterly',
      negative:
        'low quality, worst quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, extra fingers, missing fingers, deformed, mutated, fused faces, attribute leak, watermark, signature, text, cropped, out of frame, multiple views, 2boys, 2girls, solo',
    },
    {
      label: 'Booru — three subjects, group scene',
      prompt:
        'masterpiece, best quality, highly detailed, sharp focus, 3people, 2girls 1boy, multiple characters, group shot, sitting around campfire, three-quarter view, long black hair side braid, violet eyes, dark green hooded cloak pulled back, leather harness, knees drawn up, staring into flames BREAK 2girls 1boy, copper red wavy hair, green eyes, freckled fair skin, ivory linen blouse, brass locket, leaning back on hands, laughing softly BREAK 2girls 1boy, short auburn hair, hazel eyes, weathered brown leather jacket, dark grey henley, sharpening dagger on whetstone, head down focused, forest clearing at night, dark pine trees silhouetted, orange firelight on faces, cool blue moonlight rim, embers floating, wide establishing shot, cinematic lighting, atmospheric haze, intricate details, painterly',
      negative:
        'low quality, worst quality, lowres, blurry, jpeg artifacts, bad anatomy, bad hands, extra fingers, missing fingers, deformed, mutated, fused faces, attribute leak, watermark, signature, text, cropped, out of frame, multiple views, 4people, solo',
    },
  ];
}

export function getDefaultConfig(dataDir: string = DEFAULT_DATA_DIR): GlobalConfig {
  return {
    lmStudio: {
      url: 'http://localhost:1234/v1',
      defaultModel: 'local-model',
      temperature: 0.8,
      topP: 0.95,
      maxTokens: 1024,
    },
    comfyui: {
      url: 'http://localhost:8188',
      enabled: true,
      defaults: {
        model: '',
        sampler: 'euler',
        scheduler: 'normal',
        steps: 25,
        cfg: 7.0,
        width: 1024,
        height: 1024,
        batchCount: 1,
        denoiseStrength: 0.75,
      },
      examplePrompts: getDefaultExamplePrompts(),
      negativePromptDefault:
        'low quality, worst quality, lowres, blurry, jpeg artifacts, deformed, bad anatomy, bad hands, extra fingers, missing fingers, mutated hands, malformed limbs, extra limbs, fused fingers, watermark, signature, text, logo, cropped, out of frame',
    },
    engine: {
      autoGenerateNpcCards: true,
      summaryThreshold: 50,
      contextWindowBudget: 8000,
    },
    appearance: {
      // null = use the default CSS variable from the theme
      narratorColor: null,
      actionColor: null,
    },
    tts: {
      // wav + port 8000 = devnen/Chatterbox-TTS-Server defaults. Works for
      // travisvn/chatterbox-tts-api too (just change the port to 4123).
      enabled: false,
      url: 'http://localhost:8000',
      apiKey: '',
      narratorVoice: '',
      format: 'wav',
      volume: 1.0,
      autoPlay: true,
      speed: 1.0,
    },
    dataDirectory: dataDir,
  };
}

// ----------------------------------------------------------------------------
// Filesystem helpers
// ----------------------------------------------------------------------------

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function readJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return null;
    return JSON.parse(raw) as T;
  } catch (err) {
    logger.error(MOD, `Failed to read JSON at ${filePath}`, err);
    return null;
  }
}

/**
 * Atomic JSON write: serialize, write to a sibling temp file, fsync the
 * temp file's contents, then rename over the target. `rename` within the
 * same filesystem is atomic on POSIX, so readers either see the old file
 * or the new file — never a half-written one. If the process is killed
 * between any two of these steps, the original file is still intact and
 * the temp file is left behind to be garbage-collected on next start.
 *
 * This replaced the old `fs.writeFileSync` direct-write which could leave
 * an empty/truncated file on crash. (v1.1.34)
 */
export function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  const payload = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, 'w');
    fs.writeSync(fd, payload, 0, 'utf-8');
    // Best-effort fsync so the data hits the platter before the rename. If
    // the filesystem doesn't support fsync (rare), swallow the error — the
    // rename itself is still atomic.
    try {
      fs.fsyncSync(fd);
    } catch {
      /* not all filesystems support fsync */
    }
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    // Best-effort cleanup of the temp file if anything went wrong.
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Atomic binary file write (for image data, etc). Same pattern as
 * writeJson: write to tmp, fsync, rename. (v1.1.34)
 */
export function writeFileAtomic(filePath: string, data: Buffer | Uint8Array | string): void {
  ensureDir(path.dirname(filePath));
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  let fd: number | null = null;
  try {
    fd = fs.openSync(tmpPath, 'w');
    if (typeof data === 'string') {
      fs.writeSync(fd, data, 0, 'utf-8');
    } else {
      fs.writeSync(fd, data, 0, data.byteLength, 0);
    }
    try {
      fs.fsyncSync(fd);
    } catch {
      /* not all filesystems support fsync */
    }
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        /* ignore */
      }
    }
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

/**
 * Sweep up any orphaned `.tmp-*` files in a directory (left behind by a
 * crash during an atomic write). Safe to call at startup or before a
 * destructive op. Skips files newer than `minAgeMs` to avoid racing with
 * in-flight writes.
 */
export function cleanupTempFiles(dirPath: string, minAgeMs: number = 60_000): number {
  if (!fs.existsSync(dirPath)) return 0;
  let cleaned = 0;
  const now = Date.now();
  try {
    for (const name of fs.readdirSync(dirPath)) {
      // Match `<filename>.tmp-<pid>-<timestamp>-<random>`
      if (!/\.tmp-\d+-\d+-[a-z0-9]+$/.test(name)) continue;
      const fullPath = path.join(dirPath, name);
      try {
        const stat = fs.statSync(fullPath);
        if (now - stat.mtimeMs < minAgeMs) continue;
        fs.unlinkSync(fullPath);
        cleaned++;
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return cleaned;
}

export function deleteFile(filePath: string): boolean {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    logger.error(MOD, `Failed to delete ${filePath}`, err);
  }
  return false;
}

export function deleteDirRecursive(dirPath: string): boolean {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return true;
    }
  } catch (err) {
    logger.error(MOD, `Failed to delete dir ${dirPath}`, err);
  }
  return false;
}

export function listJsonFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs
    .readdirSync(dirPath)
    .filter((f) => f.endsWith('.json'))
    .map((f) => path.join(dirPath, f));
}

export function listFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath).map((f) => path.join(dirPath, f));
}

// ----------------------------------------------------------------------------
// FileManager: a class that wraps all game data access
// ----------------------------------------------------------------------------

/**
 * Backfill missing fields on an NPCCharacter loaded from disk so older saves
 * stay compatible after a schema bump. Today this fills in `image.coreAppearance`
 * which was added after some characters were already persisted.
 *
 * Returns `{ npc, mutated }` so callers can detect when backfill produced new
 * values (e.g. fresh uuids for legacy memory entries) and persist the result
 * back to disk — otherwise the freshly generated ids would be different on
 * every read, breaking CRUD targeting. (v1.1.22 fix)
 */
function normalizeCharacter(npc: NPCCharacter): { npc: NPCCharacter; mutated: boolean } {
  let mutated = false;
  const image = npc.image || ({} as NPCCharacter['image']);
  // Status backfill (v1.1.28): legacy saves predate the status field. Treat any
  // pre-existing NPC as 'active' so users don't suddenly find all their old
  // characters hidden from the storyteller.
  let status: 'active' | 'pending' | 'disabled';
  const rawStatus = (npc as any).status;
  if (rawStatus === 'active' || rawStatus === 'pending' || rawStatus === 'disabled') {
    status = rawStatus;
  } else {
    status = 'active';
    mutated = true;
  }
  // Memory backfill: older saves stored entries as `{chapter, event}` with no
  // id / sourceMessageIds / stale / createdAt. Fill those in so all entries
  // have a stable id for CRUD targeting and invalidation tracking.
  const memory = Array.isArray(npc.memory)
    ? npc.memory.map((m) => {
        const hadId = m && typeof (m as any).id === 'string' && (m as any).id;
        const hadSrcIds = Array.isArray((m as any).sourceMessageIds);
        const hadStale = typeof (m as any).stale === 'boolean';
        if (!hadId || !hadSrcIds || !hadStale) mutated = true;
        return {
          id: hadId ? (m as any).id : uuidv4(),
          chapter: typeof m?.chapter === 'number' ? m.chapter : 0,
          event: typeof m?.event === 'string' ? m.event : '',
          sourceMessageIds: hadSrcIds
            ? ((m as any).sourceMessageIds as string[]).filter((x) => typeof x === 'string')
            : [],
          stale: (m as any).stale === true,
          createdAt: typeof (m as any).createdAt === 'string' ? (m as any).createdAt : undefined,
        };
      })
    : [];
  const normalized: NPCCharacter = {
    ...npc,
    status,
    memory,
    image: {
      basePrompt: image.basePrompt || '',
      coreAppearance: typeof image.coreAppearance === 'string' ? image.coreAppearance : '',
      defaultOutfit: typeof (image as any).defaultOutfit === 'string' ? (image as any).defaultOutfit : '',
      baseNegative: image.baseNegative || '',
      lastPrompt: image.lastPrompt ?? null,
      lastSeed: image.lastSeed ?? null,
      identitySeed: (image as any).identitySeed ?? null,
      portraitPath: image.portraitPath ?? null,
    },
  };
  return { npc: normalized, mutated };
}

/**
 * Per-game async mutex. We serialize multi-step operations on the same
 * game (a chat turn modifies messages, characters, state, summaries —
 * any two of those interleaving = corruption). Keyed by gameId; other
 * games proceed in parallel. (v1.1.34)
 */
const gameLocks = new Map<string, Promise<unknown>>();

/**
 * Run `fn` exclusively for `gameId`. Subsequent calls for the same
 * gameId queue behind it. Calls for *different* gameIds proceed in
 * parallel. The lock is released when `fn` resolves or rejects.
 *
 * Use this around any multi-step server operation that touches game
 * state (chat orchestrator turns, GM state apply, character bundled
 * edits, etc). Single fileManager calls don't need it — those are
 * already atomic individually.
 */
export async function withGameLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
  const prev = gameLocks.get(gameId) || Promise.resolve();
  let release!: (value: unknown) => void;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  gameLocks.set(
    gameId,
    // Chain: when prev finishes, our work runs; when our work finishes,
    // we resolve `next` so anything chained after us gets to run.
    prev.then(() => next),
  );
  try {
    await prev;
    return await fn();
  } finally {
    release(undefined);
    // If we were the last waiter, clean up the map entry so it doesn't
    // leak. (Check identity to avoid removing a newer lock chain.)
    if (gameLocks.get(gameId) === prev.then(() => next)) {
      // Note: `.then` returns a *new* promise, so the identity check
      // above won't actually match. The conservative thing is to leave
      // the entry — the Map will only ever hold one entry per gameId,
      // and games are bounded. Skipping the cleanup is correct.
    }
  }
}

export class FileManager {
  private dataDir: string;

  constructor(dataDir?: string) {
    // If constructor called without arg, use the global config's dataDirectory
    if (dataDir) {
      this.dataDir = dataDir;
    } else {
      const bootConfig = loadOrInitConfig(DEFAULT_DATA_DIR);
      this.dataDir = bootConfig.dataDirectory || DEFAULT_DATA_DIR;
    }
    this.initLayout();
  }

  initLayout(): void {
    ensureDir(this.dataDir);
    ensureDir(path.join(this.dataDir, 'games'));
    ensureDir(path.join(this.dataDir, 'templates'));
  }

  setDataDir(dataDir: string): void {
    this.dataDir = dataDir;
    this.initLayout();
  }

  getDataDir(): string {
    return this.dataDir;
  }

  // ---------- Snapshots / backups (v1.1.34) ----------

  /**
   * Path to the .backups directory for a game. We use a leading-dot name
   * so it sorts to the top in file managers and obviously distinguishes
   * itself from real game content.
   */
  backupsDir(gameId: string): string {
    return path.join(this.gameDir(gameId), '.backups');
  }

  /**
   * Snapshot the current state of a game into a new timestamped folder
   * under `.backups/`. Called automatically before destructive ops
   * (rewriteAllMessages, deleteCharacter, deleteGame); also exposed for
   * manual use.
   *
   * Only copies the structured data files — NOT image binaries (huge,
   * usually still recoverable from the source LLM/SD process anyway) and
   * NOT nested .backups (no recursion). Last `keep` snapshots are
   * retained; older ones are pruned to keep disk usage bounded.
   *
   * Returns the snapshot directory path, or null if the source game
   * doesn't exist yet.
   */
  snapshotGame(gameId: string, reason: string = 'manual', keep: number = 10): string | null {
    return this.snapshotGameInto(gameId, this.backupsDir(gameId), reason, keep);
  }

  /**
   * Same payload as snapshotGame, but written into an arbitrary parent
   * directory (e.g. the global `.deleted-games/` graveyard, for when the
   * game folder itself is about to be wiped and an in-folder snapshot
   * would die with it). When `keep` <= 0, no pruning is performed —
   * graveyard snapshots are kept forever by default since deleteGame is
   * already a rare, explicit user action.
   */
  snapshotGameInto(
    gameId: string,
    destRoot: string,
    reason: string = 'manual',
    keep: number = 10,
  ): string | null {
    const src = this.gameDir(gameId);
    if (!fs.existsSync(src)) return null;
    ensureDir(destRoot);

    // Timestamp in a filesystem-safe ISO-ish format so sorting is
    // chronological. Append a short reason tag for human readability.
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const safeReason = reason.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'snapshot';
    const snapDir = path.join(destRoot, `${ts}__${safeReason}`);
    ensureDir(snapDir);

    // Copy the structured data files. We deliberately skip:
    //   - images/ (binaries, huge, regeneratable)
    //   - .backups/ (no recursion)
    //   - any *.tmp-* sweep files
    const copyList: Array<[string, string]> = [];
    const tryPushFile = (filename: string) => {
      const srcFile = path.join(src, filename);
      if (fs.existsSync(srcFile) && fs.statSync(srcFile).isFile()) {
        copyList.push([srcFile, path.join(snapDir, filename)]);
      }
    };
    const tryPushDir = (subdir: string) => {
      const srcSub = path.join(src, subdir);
      if (!fs.existsSync(srcSub) || !fs.statSync(srcSub).isDirectory()) return;
      ensureDir(path.join(snapDir, subdir));
      for (const name of fs.readdirSync(srcSub)) {
        if (name.includes('.tmp-')) continue;
        const childSrc = path.join(srcSub, name);
        const childDst = path.join(snapDir, subdir, name);
        const st = fs.statSync(childSrc);
        if (st.isFile()) copyList.push([childSrc, childDst]);
      }
    };

    tryPushFile('game.json');
    tryPushFile('world.json');
    tryPushFile('player.json');
    tryPushDir('characters');
    tryPushDir('history');
    tryPushDir('state');
    tryPushDir('summaries');
    // Image *metadata* JSON is small and worth keeping; image binaries
    // are not. We pull the .json files only out of images/.
    const imgSrc = path.join(src, 'images');
    if (fs.existsSync(imgSrc) && fs.statSync(imgSrc).isDirectory()) {
      ensureDir(path.join(snapDir, 'images'));
      for (const name of fs.readdirSync(imgSrc)) {
        if (!name.endsWith('.json')) continue;
        if (name.includes('.tmp-')) continue;
        copyList.push([
          path.join(imgSrc, name),
          path.join(snapDir, 'images', name),
        ]);
      }
    }

    // Best-effort copy. We use copyFileSync which is atomic-enough for
    // a snapshot (worst case a single file is half-copied; the rest of
    // the snapshot still represents a consistent point-in-time view of
    // everything else).
    for (const [s, d] of copyList) {
      try {
        fs.copyFileSync(s, d);
      } catch (err) {
        logger.warn(MOD, `snapshot copy failed ${s} → ${d}: ${(err as Error).message}`);
      }
    }

    // Write a small manifest so the user knows what the snapshot is for.
    try {
      writeJson(path.join(snapDir, 'snapshot.meta.json'), {
        gameId,
        reason,
        createdAt: new Date().toISOString(),
        fileCount: copyList.length,
      });
    } catch {
      /* non-fatal */
    }

    // Prune to last `keep` snapshots (skip when keep <= 0).
    if (keep > 0) {
      try {
        const all = fs
          .readdirSync(destRoot)
          .filter((n) => {
            try { return fs.statSync(path.join(destRoot, n)).isDirectory(); }
            catch { return false; }
          })
          .sort(); // ISO timestamps sort lexically = chronologically
        const excess = all.length - keep;
        for (let i = 0; i < excess; i++) {
          const victim = path.join(destRoot, all[i]);
          try {
            fs.rmSync(victim, { recursive: true, force: true });
          } catch (err) {
            logger.warn(MOD, `snapshot prune failed ${victim}: ${(err as Error).message}`);
          }
        }
      } catch (err) {
        logger.warn(MOD, `snapshot prune scan failed: ${(err as Error).message}`);
      }
    }

    logger.info(MOD, `snapshot ${gameId} → ${path.basename(snapDir)} (${copyList.length} files, reason=${reason})`);
    return snapDir;
  }

  /** Directory used to retain pre-deletion snapshots of entire games. */
  deletedGamesDir(): string {
    return path.join(this.dataDir, '.deleted-games');
  }

  /**
   * Walk every game directory at startup and remove orphaned `.tmp-*`
   * files left behind by a crashed atomic write. Best-effort; logs but
   * never throws. Returns total files cleaned. (v1.1.34)
   */
  sweepAllTempFiles(minAgeMs: number = 0): number {
    let total = 0;
    const gamesRoot = this.gamesDir();
    if (!fs.existsSync(gamesRoot)) return 0;
    let entries: string[];
    try { entries = fs.readdirSync(gamesRoot); } catch { return 0; }
    for (const entry of entries) {
      if (entry.startsWith('.')) continue;
      const gd = path.join(gamesRoot, entry);
      try {
        if (!fs.statSync(gd).isDirectory()) continue;
      } catch { continue; }
      // Sweep the game root + every known subdir.
      const targets = [
        gd,
        path.join(gd, 'characters'),
        path.join(gd, 'history'),
        path.join(gd, 'state'),
        path.join(gd, 'summaries'),
        path.join(gd, 'images'),
      ];
      for (const t of targets) {
        try { total += cleanupTempFiles(t, minAgeMs); } catch { /* ignore */ }
      }
    }
    // Also sweep dataDir root (config.json.tmp-* could land here).
    try { total += cleanupTempFiles(this.dataDir, minAgeMs); } catch { /* ignore */ }
    if (total > 0) {
      logger.info(MOD, `startup sweep removed ${total} orphaned .tmp-* files`);
    }
    return total;
  }

  /** List available snapshots for a game, newest-first. */
  listSnapshots(gameId: string): Array<{ name: string; path: string; createdAt: string; reason: string; fileCount: number }> {
    const dir = this.backupsDir(gameId);
    if (!fs.existsSync(dir)) return [];
    const out: Array<{ name: string; path: string; createdAt: string; reason: string; fileCount: number }> = [];
    for (const name of fs.readdirSync(dir).sort().reverse()) {
      const full = path.join(dir, name);
      try {
        if (!fs.statSync(full).isDirectory()) continue;
      } catch {
        continue;
      }
      const meta = readJson<{ createdAt: string; reason: string; fileCount: number }>(
        path.join(full, 'snapshot.meta.json'),
      );
      out.push({
        name,
        path: full,
        createdAt: meta?.createdAt || '',
        reason: meta?.reason || 'unknown',
        fileCount: meta?.fileCount || 0,
      });
    }
    return out;
  }

  // ---------- Config ----------

  getConfigPath(): string {
    return path.join(this.dataDir, CONFIG_FILENAME);
  }

  getConfig(): GlobalConfig {
    const existing = readJson<GlobalConfig>(this.getConfigPath());
    if (existing) {
      // Merge defaults for any missing fields
      const defaults = getDefaultConfig(this.dataDir);
      const existingExamples =
        (existing.comfyui && Array.isArray(existing.comfyui.examplePrompts))
          ? existing.comfyui.examplePrompts
          : [];
      // Backfill seed example prompts for users who never customized them
      // (i.e. their saved list is empty). If they've added their own, leave
      // them alone.
      const examplePrompts =
        existingExamples.length > 0 ? existingExamples : defaults.comfyui.examplePrompts;
      return {
        ...defaults,
        ...existing,
        lmStudio: { ...defaults.lmStudio, ...(existing.lmStudio || {}) },
        comfyui: {
          ...defaults.comfyui,
          ...(existing.comfyui || {}),
          examplePrompts,
          defaults: {
            ...defaults.comfyui.defaults,
            ...((existing.comfyui && existing.comfyui.defaults) || {}),
          },
        },
        engine: { ...defaults.engine, ...(existing.engine || {}) },
        appearance: { ...defaults.appearance, ...(existing.appearance || {}) },
        tts: { ...defaults.tts, ...(existing.tts || {}) },
      };
    }
    const fresh = getDefaultConfig(this.dataDir);
    writeJson(this.getConfigPath(), fresh);
    return fresh;
  }

  saveConfig(config: GlobalConfig): void {
    writeJson(this.getConfigPath(), config);
    if (config.dataDirectory && config.dataDirectory !== this.dataDir) {
      this.setDataDir(config.dataDirectory);
    }
  }

  // ---------- Game paths ----------

  gamesDir(): string {
    return path.join(this.dataDir, 'games');
  }

  gameDir(gameId: string): string {
    return path.join(this.gamesDir(), gameId);
  }

  gameFile(gameId: string): string {
    return path.join(this.gameDir(gameId), 'game.json');
  }

  worldFile(gameId: string): string {
    return path.join(this.gameDir(gameId), 'world.json');
  }

  playerFile(gameId: string): string {
    return path.join(this.gameDir(gameId), 'player.json');
  }

  charactersDir(gameId: string): string {
    return path.join(this.gameDir(gameId), 'characters');
  }

  characterFile(gameId: string, charId: string): string {
    return path.join(this.charactersDir(gameId), `${charId}.json`);
  }

  historyDir(gameId: string): string {
    return path.join(this.gameDir(gameId), 'history');
  }

  chapterHistoryFile(gameId: string, chapter: number): string {
    return path.join(this.historyDir(gameId), `chapter-${chapter}.jsonl`);
  }

  summariesDir(gameId: string): string {
    return path.join(this.gameDir(gameId), 'summaries');
  }

  imagesDir(gameId: string): string {
    return path.join(this.gameDir(gameId), 'images');
  }

  imageMetadataFile(gameId: string, imageId: string): string {
    return path.join(this.imagesDir(gameId), `${imageId}.json`);
  }

  stateDir(gameId: string): string {
    return path.join(this.gameDir(gameId), 'state');
  }

  worldStateFile(gameId: string): string {
    return path.join(this.stateDir(gameId), 'world-state.json');
  }

  // ---------- Games ----------

  listGames(): GameConfig[] {
    const dir = this.gamesDir();
    if (!fs.existsSync(dir)) return [];
    const games: GameConfig[] = [];
    for (const entry of fs.readdirSync(dir)) {
      // Skip hidden / metadata directories (e.g. `.backups` siblings,
      // future `.trash`, etc.). Defensive — the json check below would
      // already reject these, but being explicit avoids stat/IO churn.
      if (entry.startsWith('.')) continue;
      const gameDir = path.join(dir, entry);
      let st: fs.Stats;
      try { st = fs.statSync(gameDir); } catch { continue; }
      if (!st.isDirectory()) continue;
      const file = path.join(gameDir, 'game.json');
      const cfg = readJson<GameConfig>(file);
      if (cfg) games.push(cfg);
    }
    return games.sort((a, b) => (b.lastPlayedAt || '').localeCompare(a.lastPlayedAt || ''));
  }

  getGame(gameId: string): GameConfig | null {
    return readJson<GameConfig>(this.gameFile(gameId));
  }

  saveGame(game: GameConfig): void {
    writeJson(this.gameFile(game.id), game);
  }

  createGameLayout(gameId: string): void {
    const root = this.gameDir(gameId);
    ensureDir(root);
    ensureDir(this.charactersDir(gameId));
    ensureDir(this.historyDir(gameId));
    ensureDir(this.summariesDir(gameId));
    ensureDir(this.imagesDir(gameId));
    ensureDir(this.stateDir(gameId));
  }

  deleteGame(gameId: string): boolean {
    // Snapshot the *entire* game into a global graveyard before wiping
    // the folder. Unlike per-game `.backups/`, this lives at the dataDir
    // root (`<dataDir>/.deleted-games/`) so it survives the recursive
    // delete below. `keep: 0` = retain all graveyard snapshots forever;
    // deleting a whole game is rare and the user almost always regrets
    // it. (v1.1.34)
    try {
      this.snapshotGameInto(
        gameId,
        path.join(this.deletedGamesDir(), gameId),
        'deleteGame',
        0,
      );
    } catch (err) {
      logger.warn(MOD, `graveyard snapshot failed before deleteGame ${gameId} (continuing): ${(err as Error).message}`);
    }
    return deleteDirRecursive(this.gameDir(gameId));
  }

  // ---------- World ----------

  getWorld(gameId: string): WorldInfo | null {
    return readJson<WorldInfo>(this.worldFile(gameId));
  }

  saveWorld(gameId: string, world: WorldInfo): void {
    writeJson(this.worldFile(gameId), world);
  }

  // ---------- Player ----------

  getPlayer(gameId: string): PlayerCharacter | null {
    return readJson<PlayerCharacter>(this.playerFile(gameId));
  }

  savePlayer(gameId: string, player: PlayerCharacter): void {
    writeJson(this.playerFile(gameId), player);
  }

  // ---------- NPCs ----------

  listCharacters(gameId: string): NPCCharacter[] {
    const files = listJsonFiles(this.charactersDir(gameId));
    const out: NPCCharacter[] = [];
    for (const f of files) {
      const npc = readJson<NPCCharacter>(f);
      if (!npc) continue;
      const { npc: normalized, mutated } = normalizeCharacter(npc);
      // v1.1.22: if backfill assigned fresh memory ids (or other new fields),
      // persist immediately so the ids stay stable across subsequent reads.
      if (mutated) {
        try {
          writeJson(this.characterFile(gameId, normalized.id), normalized);
        } catch (err) {
          // Non-fatal — caller still gets normalized data in memory.
        }
      }
      out.push(normalized);
    }
    return out;
  }

  getCharacter(gameId: string, charId: string): NPCCharacter | null {
    const npc = readJson<NPCCharacter>(this.characterFile(gameId, charId));
    if (!npc) return null;
    const { npc: normalized, mutated } = normalizeCharacter(npc);
    if (mutated) {
      try {
        writeJson(this.characterFile(gameId, normalized.id), normalized);
      } catch (err) {
        // Non-fatal.
      }
    }
    return normalized;
  }

  saveCharacter(gameId: string, character: NPCCharacter): void {
    writeJson(this.characterFile(gameId, character.id), character);
  }

  deleteCharacter(gameId: string, charId: string): boolean {
    // Snapshot before destroying the character file so an accidental
    // delete (or a bug like the runaway re-proposal we hit in v1.1.31)
    // can be recovered from `.backups/`. (v1.1.34)
    try {
      this.snapshotGame(gameId, 'deleteCharacter');
    } catch (err) {
      logger.warn(MOD, `snapshotGame failed before deleteCharacter (continuing): ${(err as Error).message}`);
    }
    return deleteFile(this.characterFile(gameId, charId));
  }

  // ---------- World State ----------

  getWorldState(gameId: string): WorldState {
    const existing = readJson<WorldState>(this.worldStateFile(gameId));
    if (existing) {
      // v1.1.35 migration: stamp uuids onto any event missing one. Legacy
      // events also get `sourceMessageIds = []` so the cascade plumbing
      // treats them as user-added / untraceable and leaves them alone on
      // message edit/delete. Only writes back when something actually
      // changed, so this is a no-op on already-migrated state.
      let dirty = false;
      if (Array.isArray(existing.events)) {
        // v1.1.37: mint createdAt for legacy events. The editor and any future
        // timeline view sort on createdAt so the order is stable even when the
        // GM-written `timestamp` field is a narrative string. We prefer a real
        // ISO date parsed from `timestamp` (the GM sometimes did write a real
        // timestamp), then fall back to a synthetic value derived from the
        // event's index in the on-disk array. The synthetic value is anchored
        // to a fixed origin (2000-01-01) and offset by index in seconds, which
        // (a) preserves the original append order within a chapter, and (b)
        // sorts strictly before any real-clock createdAt, so newly added
        // events from v1.1.37+ always show as more recent than legacy ones.
        const SYNTHETIC_ORIGIN_MS = Date.UTC(2000, 0, 1);
        existing.events.forEach((ev, idx) => {
          if (!ev.id) { ev.id = uuidv4(); dirty = true; }
          if (ev.sourceMessageIds === undefined) {
            // Explicit empty array (not undefined) so JSON serializes it and
            // downstream code can rely on `Array.isArray` checks.
            ev.sourceMessageIds = [];
            dirty = true;
          }
          if (!ev.createdAt) {
            const parsed = ev.timestamp ? Date.parse(ev.timestamp) : NaN;
            ev.createdAt = Number.isFinite(parsed)
              ? new Date(parsed).toISOString()
              : new Date(SYNTHETIC_ORIGIN_MS + idx * 1000).toISOString();
            dirty = true;
          }
        });
      } else {
        existing.events = [];
        dirty = true;
      }
      if (!existing.locationStates) {
        existing.locationStates = {};
        dirty = true;
      }
      if (dirty) writeJson(this.worldStateFile(gameId), existing);
      return existing;
    }
    const empty: WorldState = { events: [], locationStates: {} };
    writeJson(this.worldStateFile(gameId), empty);
    return empty;
  }

  saveWorldState(gameId: string, state: WorldState): void {
    writeJson(this.worldStateFile(gameId), state);
  }

  // ---------- Chat history (JSONL) ----------

  appendMessage(gameId: string, message: ChatMessage): void {
    const chapter = message.chapter ?? 1;
    const file = this.chapterHistoryFile(gameId, chapter);
    ensureDir(path.dirname(file));
    // appendFileSync is itself an atomic single-syscall write for short
    // payloads on POSIX. We could read+rewrite atomically, but for a
    // single line append the cost of rewriting the whole file every
    // turn is severe (chapter files grow to thousands of lines). The
    // worst-case failure here is a single partially-appended line at
    // the end of the file, which `readChapterMessages` already tolerates
    // by skipping unparseable lines. Acceptable tradeoff. (v1.1.34)
    fs.appendFileSync(file, JSON.stringify(message) + '\n', 'utf-8');
  }

  listChapterFiles(gameId: string): string[] {
    const dir = this.historyDir(gameId);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('chapter-') && f.endsWith('.jsonl'))
      .sort((a, b) => {
        const na = parseInt(a.replace(/[^\d]/g, ''), 10) || 0;
        const nb = parseInt(b.replace(/[^\d]/g, ''), 10) || 0;
        return na - nb;
      })
      .map((f) => path.join(dir, f));
  }

  readChapterMessages(filePath: string): ChatMessage[] {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const lines = raw.split('\n').filter((l) => l.trim().length > 0);
    const out: ChatMessage[] = [];
    for (const line of lines) {
      try {
        out.push(JSON.parse(line) as ChatMessage);
      } catch (err) {
        console.error('[fileManager] Failed to parse history line:', err);
      }
    }
    return out;
  }

  getAllMessages(gameId: string): ChatMessage[] {
    const files = this.listChapterFiles(gameId);
    const all: ChatMessage[] = [];
    for (const f of files) {
      all.push(...this.readChapterMessages(f));
    }
    return all;
  }

  getRecentMessages(gameId: string, limit: number): ChatMessage[] {
    const all = this.getAllMessages(gameId);
    return all.slice(Math.max(0, all.length - limit));
  }

  getPagedMessages(gameId: string, offset: number, limit: number): { total: number; messages: ChatMessage[] } {
    const all = this.getAllMessages(gameId);
    const total = all.length;
    const start = Math.max(0, total - offset - limit);
    const end = Math.max(0, total - offset);
    return { total, messages: all.slice(start, end) };
  }

  /**
   * Rewrites chapter files after mutating messages (edit/delete/regen).
   *
   * v1.1.34: rewritten to be crash-safe. The old version unlinked every
   * chapter file first and then wrote them back — a process kill in the
   * gap meant total history loss. The new version:
   *   1. Snapshots the history dir to `.backups/<timestamp>__messages/`
   *      (best-effort — don't fail the write if backup fails).
   *   2. Writes each chapter to a `.tmp-...` sibling, fsyncs, then
   *      renames over the existing chapter file (atomic per file).
   *   3. AFTER all renames succeed, deletes any chapter files that no
   *      longer have any messages in the new set (rare — only if every
   *      message in a chapter was deleted).
   *
   * Net effect: at every point in this function, the chapter files on
   * disk are a valid (possibly-old) snapshot of the history. A crash
   * anywhere leaves the on-disk state recoverable.
   */
  rewriteAllMessages(gameId: string, messages: ChatMessage[]): void {
    const dir = this.historyDir(gameId);
    ensureDir(dir);

    // Best-effort pre-write snapshot. Failure here doesn't block the
    // write — atomic renames below already make this operation safe;
    // the snapshot is an additional safety net for users who want to
    // recover from logical mistakes (e.g. accidental mass-delete).
    try {
      this.snapshotGame(gameId, 'messages');
    } catch (err) {
      logger.warn(MOD, `snapshotGame failed before rewriteAllMessages (continuing): ${(err as Error).message}`);
    }

    // Sweep any orphaned temp files from a previous crashed write before
    // we start a new one, so they don't accumulate.
    cleanupTempFiles(dir);

    // Group new messages by chapter, preserving order
    const byChapter = new Map<number, ChatMessage[]>();
    for (const m of messages) {
      const ch = m.chapter ?? 1;
      if (!byChapter.has(ch)) byChapter.set(ch, []);
      byChapter.get(ch)!.push(m);
    }

    // Phase 1: write every new chapter to a .tmp sibling, fsync, rename.
    // Each rename is atomic; if we crash partway through, the chapters
    // we haven't renamed yet still have their old contents.
    for (const [chapter, msgs] of byChapter.entries()) {
      const file = this.chapterHistoryFile(gameId, chapter);
      const data = msgs.map((m) => JSON.stringify(m)).join('\n') + (msgs.length ? '\n' : '');
      writeFileAtomic(file, data);
    }

    // Phase 2: delete any chapter files that no longer have messages in
    // the new set. We do this AFTER the writes succeed so a crash in
    // phase 1 doesn't lose chapters whose new content we never wrote.
    const keepChapters = new Set(byChapter.keys());
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir)) {
        if (!f.startsWith('chapter-') || !f.endsWith('.jsonl')) continue;
        const m = /^chapter-(\d+)\.jsonl$/.exec(f);
        if (!m) continue;
        const num = parseInt(m[1], 10);
        if (!keepChapters.has(num)) {
          try {
            fs.unlinkSync(path.join(dir, f));
          } catch (err) {
            logger.warn(MOD, `Failed to delete empty chapter file ${f}: ${(err as Error).message}`);
          }
        }
      }
    }
  }

  updateMessage(gameId: string, messageId: string, patch: Partial<ChatMessage>): ChatMessage | null {
    const all = this.getAllMessages(gameId);
    const idx = all.findIndex((m) => m.id === messageId);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...patch };
    this.rewriteAllMessages(gameId, all);
    return all[idx];
  }

  deleteMessage(gameId: string, messageId: string): boolean {
    const all = this.getAllMessages(gameId);
    const filtered = all.filter((m) => m.id !== messageId);
    if (filtered.length === all.length) return false;
    this.rewriteAllMessages(gameId, filtered);
    return true;
  }

  // ---------- Summaries ----------

  listSummaries(gameId: string): Summary[] {
    const files = listJsonFiles(this.summariesDir(gameId));
    const out: Summary[] = [];
    for (const f of files) {
      const s = readJson<Summary>(f);
      if (s) out.push(s);
    }
    return out.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  }

  saveSummary(gameId: string, summary: Summary): void {
    const file = path.join(this.summariesDir(gameId), `${summary.id}.json`);
    writeJson(file, summary);
  }

  // ---------- Images ----------

  listImageMetadata(gameId: string): ImageMetadata[] {
    const files = listJsonFiles(this.imagesDir(gameId));
    const out: ImageMetadata[] = [];
    for (const f of files) {
      const md = readJson<ImageMetadata>(f);
      if (md) out.push(md);
    }
    return out.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  }

  getImageMetadata(gameId: string, imageId: string): ImageMetadata | null {
    return readJson<ImageMetadata>(this.imageMetadataFile(gameId, imageId));
  }

  saveImageMetadata(gameId: string, md: ImageMetadata): void {
    writeJson(this.imageMetadataFile(gameId, md.id), md);
  }

  saveImageFile(gameId: string, filename: string, data: Buffer): string {
    const dir = this.imagesDir(gameId);
    ensureDir(dir);
    const outPath = path.join(dir, filename);
    // Atomic write so a crash mid-write doesn't leave a corrupt image
    // that breaks the gallery. (v1.1.34)
    writeFileAtomic(outPath, data);
    return outPath;
  }

  getImageFilePath(gameId: string, filename: string): string {
    return path.join(this.imagesDir(gameId), filename);
  }

  deleteImage(gameId: string, imageId: string): boolean {
    // Snapshot image *metadata* (not binaries — too big and snapshotGame
    // skips them anyway) so the user can see what they had if they
    // delete the wrong one. The binary itself is gone for good. (v1.1.34)
    try {
      this.snapshotGame(gameId, 'deleteImage');
    } catch (err) {
      logger.warn(MOD, `snapshotGame failed before deleteImage (continuing): ${(err as Error).message}`);
    }
    const md = this.getImageMetadata(gameId, imageId);
    let anyDeleted = false;
    if (md) {
      const imagePath = this.getImageFilePath(gameId, md.filename);
      if (deleteFile(imagePath)) anyDeleted = true;
    }
    if (deleteFile(this.imageMetadataFile(gameId, imageId))) anyDeleted = true;
    return anyDeleted;
  }
}

// ----------------------------------------------------------------------------
// Bootstrap helper: initialize global config file
// ----------------------------------------------------------------------------

export function loadOrInitConfig(dataDir: string = DEFAULT_DATA_DIR): GlobalConfig {
  ensureDir(dataDir);
  const configPath = path.join(dataDir, CONFIG_FILENAME);
  const existing = readJson<GlobalConfig>(configPath);
  if (existing) return existing;
  const fresh = getDefaultConfig(dataDir);
  writeJson(configPath, fresh);
  return fresh;
}

// Single shared instance used throughout the server
let sharedInstance: FileManager | null = null;

export function getFileManager(dataDir?: string): FileManager {
  if (!sharedInstance) {
    sharedInstance = new FileManager(dataDir);
  } else if (dataDir && dataDir !== sharedInstance.getDataDir()) {
    // Allow an explicit override on subsequent calls (e.g. tests, or if the
    // user changes the data directory via the settings UI).
    sharedInstance.setDataDir(dataDir);
  }
  return sharedInstance;
}
