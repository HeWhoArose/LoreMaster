import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  GameConfig,
  NPCCharacter,
  PlayerCharacter,
  WorldInfo,
  WorldStateEvent,
} from '../types/index.js';
import { parseCharacterCard, extractGreetings } from '../services/characterCardImport.js';
import { getFileManager } from '../services/fileManager.js';
import { logger } from '../services/logger.js';

const router = Router();
const MOD = 'routes/games';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || `game-${Date.now()}`
  );
}

// ---------------------------------------------------------------------------
// Games list — returns GameConfig[] directly
// ---------------------------------------------------------------------------
router.get('/', (_req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const games = fm.listGames();
    logger.info(MOD, `GET /games → ${games.length} games`);
    return res.json(games);
  } catch (err) {
    logger.error(MOD, 'Failed to list games', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Create a game — returns the GameConfig directly
// ---------------------------------------------------------------------------
router.post('/', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { name, genre, description, world, player, settingsOverrides } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Field "name" is required.' });
    }

    const existing = new Set(fm.listGames().map((g) => g.id));
    let baseSlug = slugify(name);
    let id = baseSlug;
    let counter = 2;
    while (existing.has(id)) {
      id = `${baseSlug}-${counter++}`;
    }

    const now = new Date().toISOString();
    const game: GameConfig = {
      id,
      name,
      genre: genre || '',
      description: description || '',
      createdAt: now,
      lastPlayedAt: now,
      settingsOverrides,
    };

    fm.createGameLayout(id);
    fm.saveGame(game);

    const worldInfo: WorldInfo = {
      setting: world?.setting || '',
      tone: world?.tone || '',
      rules: world?.rules || '',
      customInstructions: world?.customInstructions || '',
      currencyName: world?.currencyName || 'credits',
      era: world?.era || '',
      narratorEnabled: world?.narratorEnabled === false ? false : true,
    };
    fm.saveWorld(id, worldInfo);

    const playerChar: PlayerCharacter = {
      name: player?.name || 'Player',
      backstory: player?.backstory || '',
      appearance: player?.appearance || '',
      stats: player?.stats || { health: 100, stamina: 100 },
      money: player?.money || { currencyName: worldInfo.currencyName, amount: 0 },
      abilities: player?.abilities || [],
      inventory: player?.inventory || [],
      relationships: player?.relationships || {},
    };
    fm.savePlayer(id, playerChar);

    fm.saveWorldState(id, { events: [], locationStates: {} });

    logger.success(MOD, `Created game "${name}" (id=${id})`);
    return res.status(201).json(game);
  } catch (err) {
    logger.error(MOD, 'Failed to create game', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Get game details — returns GameSnapshot { config, world, player, characters, worldState }
// ---------------------------------------------------------------------------
router.get('/:gameId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const game = fm.getGame(gameId);
    if (!game) {
      logger.warn(MOD, `GET /${gameId} — not found`);
      return res.status(404).json({ error: 'Game not found.' });
    }
    const world = fm.getWorld(gameId);
    const player = fm.getPlayer(gameId);
    const characters = fm.listCharacters(gameId);
    const worldState = fm.getWorldState(gameId);
    return res.json({ config: game, world, player, characters, worldState });
  } catch (err) {
    logger.error(MOD, 'Failed to get game snapshot', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Update game — supports both PUT and PATCH. Returns GameConfig directly.
// ---------------------------------------------------------------------------
function updateGameHandler(req: Request, res: Response) {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const existing = fm.getGame(gameId);
    if (!existing) return res.status(404).json({ error: 'Game not found.' });

    const patch = req.body || {};
    const merged: GameConfig = {
      ...existing,
      ...patch,
      id: existing.id,
      createdAt: existing.createdAt,
      lastPlayedAt: patch.lastPlayedAt || new Date().toISOString(),
    };
    // Remove non-GameConfig keys that may have leaked in from the patch.
    delete (merged as any).world;
    delete (merged as any).player;
    fm.saveGame(merged);

    if (patch.world && typeof patch.world === 'object') {
      const currentWorld = fm.getWorld(gameId);
      fm.saveWorld(gameId, { ...(currentWorld || ({} as WorldInfo)), ...patch.world });
    }
    if (patch.player && typeof patch.player === 'object') {
      const currentPlayer = fm.getPlayer(gameId);
      if (currentPlayer) {
        fm.savePlayer(gameId, { ...currentPlayer, ...patch.player });
      }
    }

    logger.info(MOD, `Updated game ${gameId}`);
    return res.json(merged);
  } catch (err) {
    logger.error(MOD, 'Failed to update game', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
router.put('/:gameId', updateGameHandler);
router.patch('/:gameId', updateGameHandler);

// ---------------------------------------------------------------------------
// Delete game
// ---------------------------------------------------------------------------
router.delete('/:gameId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const existing = fm.getGame(gameId);
    if (!existing) return res.status(404).json({ error: 'Game not found.' });
    const ok = fm.deleteGame(gameId);
    logger.info(MOD, `Deleted game ${gameId} (ok=${ok})`);
    return res.json({ ok });
  } catch (err) {
    logger.error(MOD, 'Failed to delete game', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Player — returns PlayerCharacter directly
// ---------------------------------------------------------------------------
router.get('/:gameId/player', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const p = fm.getPlayer(gameId);
    if (!p) return res.status(404).json({ error: 'Player not found.' });
    return res.json(p);
  } catch (err) {
    logger.error(MOD, 'Failed to get player', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

function updatePlayerHandler(req: Request, res: Response) {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const existing = fm.getPlayer(gameId);
    if (!existing) return res.status(404).json({ error: 'Player not found.' });
    const patch = req.body || {};
    const merged: PlayerCharacter = { ...existing, ...patch };
    fm.savePlayer(gameId, merged);
    logger.info(MOD, `Updated player for game ${gameId}`);
    return res.json(merged);
  } catch (err) {
    logger.error(MOD, 'Failed to update player', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
router.put('/:gameId/player', updatePlayerHandler);
router.patch('/:gameId/player', updatePlayerHandler);

// ---------------------------------------------------------------------------
// Characters (NPCs) — return NPCCharacter / NPCCharacter[] directly
// ---------------------------------------------------------------------------
router.get('/:gameId/characters', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const characters = fm.listCharacters(gameId);
    return res.json(characters);
  } catch (err) {
    logger.error(MOD, 'Failed to list characters', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/:gameId/characters/:charId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    const npc = fm.getCharacter(gameId, charId);
    if (!npc) return res.status(404).json({ error: 'Character not found.' });
    return res.json(npc);
  } catch (err) {
    logger.error(MOD, 'Failed to get character', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

function updateCharacterHandler(req: Request, res: Response) {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    const existing = fm.getCharacter(gameId, charId);
    const patch = req.body || {};
    if (!existing) {
      const created: NPCCharacter = {
        id: charId,
        name: patch.name || charId,
        revealedName: patch.revealedName ?? null,
        appearance: patch.appearance || '',
        personality: patch.personality || '',
        background: patch.background || '',
        knownInfo: patch.knownInfo || '',
        dispositionTowardPlayer: patch.dispositionTowardPlayer || 'neutral',
        memory: patch.memory || [],
        voiceStyle: patch.voiceStyle || '',
        chatColor: patch.chatColor ?? null,
        actionColor: patch.actionColor ?? null,
        image: patch.image
          ? {
              basePrompt: patch.image.basePrompt || '',
              coreAppearance: patch.image.coreAppearance || '',
              baseNegative: patch.image.baseNegative || '',
              lastPrompt: patch.image.lastPrompt ?? null,
              lastSeed: patch.image.lastSeed ?? null,
              identitySeed: patch.image.identitySeed ?? null,
              portraitPath: patch.image.portraitPath ?? null,
            }
          : {
              basePrompt: '',
              coreAppearance: '',
              baseNegative: '',
              lastPrompt: null,
              lastSeed: null,
              identitySeed: null,
              portraitPath: null,
            },
      };
      fm.saveCharacter(gameId, created);
      logger.info(MOD, `Created NPC ${charId} in game ${gameId}`);
      return res.status(201).json(created);
    }
    const merged: NPCCharacter = {
      ...existing,
      ...patch,
      id: existing.id,
      image: { ...existing.image, ...(patch.image || {}) },
    };
    fm.saveCharacter(gameId, merged);
    logger.info(MOD, `Updated NPC ${charId} in game ${gameId}`);
    return res.json(merged);
  } catch (err) {
    logger.error(MOD, 'Failed to update character', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
router.put('/:gameId/characters/:charId', updateCharacterHandler);
router.patch('/:gameId/characters/:charId', updateCharacterHandler);

router.post('/:gameId/characters', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const patch = req.body || {};
    const id = patch.id || uuidv4();
    const npc: NPCCharacter = {
      id,
      name: patch.name || 'Unnamed',
      revealedName: patch.revealedName ?? null,
      appearance: patch.appearance || '',
      personality: patch.personality || '',
      background: patch.background || '',
      knownInfo: patch.knownInfo || '',
      dispositionTowardPlayer: patch.dispositionTowardPlayer || 'neutral',
      memory: patch.memory || [],
      voiceStyle: patch.voiceStyle || '',
      chatColor: patch.chatColor ?? null,
      actionColor: patch.actionColor ?? null,
      image: patch.image || {
        basePrompt: '',
        coreAppearance: '',
        baseNegative: '',
        lastPrompt: null,
        lastSeed: null,
        identitySeed: null,
        portraitPath: null,
      },
    };
    fm.saveCharacter(gameId, npc);
    logger.success(MOD, `Created NPC ${npc.name} (id=${id}) in game ${gameId}`);
    return res.status(201).json(npc);
  } catch (err) {
    logger.error(MOD, 'Failed to create character', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/games/:gameId/characters/import
// Body: { fileBase64: string, filename?: string, save?: boolean }
//
// Parses a SillyTavern / chub.ai character card (PNG with embedded metadata or
// raw JSON) and returns a populated NPC draft. If `save: true`, also persists
// the new NPC to the game and returns the saved record.
// ---------------------------------------------------------------------------
router.post('/:gameId/characters/import', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const { fileBase64, filename, save } = req.body || {};

    if (typeof fileBase64 !== 'string' || !fileBase64) {
      return res.status(400).json({ error: 'Field "fileBase64" is required.' });
    }

    // Strip a data URI prefix if present (e.g. data:image/png;base64,...).
    const commaIdx = fileBase64.indexOf(',');
    const b64 = commaIdx >= 0 && fileBase64.startsWith('data:') ? fileBase64.slice(commaIdx + 1) : fileBase64;

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
      logger.warn(MOD, `Card import failed for game ${gameId}: ${(err as Error).message}`);
      return res.status(400).json({ error: (err as Error).message });
    }

    logger.info(
      MOD,
      `Parsed character card (source=${parsed.raw.source}, name=${parsed.raw.name || 'unnamed'}) for game ${gameId}`
    );

    if (save) {
      const id = uuidv4();
      const npc: NPCCharacter = {
        id,
        name: parsed.npc.name || 'Imported Character',
        revealedName: parsed.npc.revealedName ?? null,
        appearance: parsed.npc.appearance || '',
        personality: parsed.npc.personality || '',
        background: parsed.npc.background || '',
        knownInfo: parsed.npc.knownInfo || '',
        dispositionTowardPlayer: parsed.npc.dispositionTowardPlayer || 'neutral',
        memory: parsed.npc.memory || [],
        voiceStyle: parsed.npc.voiceStyle || '',
        chatColor: parsed.npc.chatColor ?? null,
        actionColor: parsed.npc.actionColor ?? null,
        image: parsed.npc.image || {
          basePrompt: '',
          coreAppearance: '',
          baseNegative: '',
          lastPrompt: null,
          lastSeed: null,
          identitySeed: null,
          portraitPath: null,
        },
      };
      fm.saveCharacter(gameId, npc);
      logger.success(MOD, `Saved imported NPC ${npc.name} (id=${id}) in game ${gameId}`);
      return res.status(201).json({ source: parsed.raw.source, character: npc });
    }

    // Return draft + greetings — the client will let the user review before saving.
    return res.json({
      source: parsed.raw.source,
      draft: parsed.npc,
      greetings: extractGreetings(parsed.raw),
    });
  } catch (err) {
    logger.error(MOD, 'Failed to import character card', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:gameId/characters/:charId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    const ok = fm.deleteCharacter(gameId, charId);
    logger.info(MOD, `Deleted NPC ${charId} from game ${gameId} (ok=${ok})`);
    return res.json({ ok });
  } catch (err) {
    logger.error(MOD, 'Failed to delete character', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Status lifecycle (v1.1.28)
//
// POST /api/games/:gameId/characters/:charId/status  body: { status }
//   Flip an NPC between active / pending / disabled. The user-facing surface
//   for approve / deny / enable / disable. Returns the updated character.
//
// Convenience aliases (no body required):
//   POST .../approve  → status = active   (used to approve a pending NPC)
//   POST .../deny     → hard delete       (used to reject a pending NPC)
//   POST .../enable   → status = active
//   POST .../disable  → status = disabled
//
// We expose both shapes because the convenience routes are nice for the UI
// (no body), and the generic /status route is nice for future status types
// or admin tooling.
// ---------------------------------------------------------------------------

router.post('/:gameId/characters/:charId/status', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    const { status } = req.body || {};
    if (status !== 'active' && status !== 'pending' && status !== 'disabled') {
      return res.status(400).json({ error: 'status must be active | pending | disabled' });
    }
    const npc = fm.getCharacter(gameId, charId);
    if (!npc) return res.status(404).json({ error: 'character not found' });
    const updated: NPCCharacter = { ...npc, status };
    fm.saveCharacter(gameId, updated);
    logger.info(MOD, `NPC ${charId} status → ${status} in game ${gameId}`);
    return res.json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to set character status', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:gameId/characters/:charId/approve', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    const npc = fm.getCharacter(gameId, charId);
    if (!npc) return res.status(404).json({ error: 'character not found' });
    const updated: NPCCharacter = { ...npc, status: 'active' };
    fm.saveCharacter(gameId, updated);
    logger.info(MOD, `Approved NPC ${charId} in game ${gameId}`);
    return res.json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to approve character', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:gameId/characters/:charId/deny', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    // Deny = hard delete. The NPC was never approved, so there's no narrative
    // continuity to preserve. If the user later wants the NPC back, the model
    // will likely reintroduce them naturally; otherwise the user can hand-create.
    const ok = fm.deleteCharacter(gameId, charId);
    logger.info(MOD, `Denied (deleted) NPC ${charId} from game ${gameId} (ok=${ok})`);
    return res.json({ ok });
  } catch (err) {
    logger.error(MOD, 'Failed to deny character', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:gameId/characters/:charId/enable', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    const npc = fm.getCharacter(gameId, charId);
    if (!npc) return res.status(404).json({ error: 'character not found' });
    const updated: NPCCharacter = { ...npc, status: 'active' };
    fm.saveCharacter(gameId, updated);
    logger.info(MOD, `Enabled NPC ${charId} in game ${gameId}`);
    return res.json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to enable character', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/:gameId/characters/:charId/disable', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    const npc = fm.getCharacter(gameId, charId);
    if (!npc) return res.status(404).json({ error: 'character not found' });
    const updated: NPCCharacter = { ...npc, status: 'disabled' };
    fm.saveCharacter(gameId, updated);
    logger.info(MOD, `Disabled NPC ${charId} in game ${gameId}`);
    return res.json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to disable character', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Memory CRUD: edit / add / delete individual memory entries on a character.
// All routes return the FULL updated character so the UI can refresh in one
// hop. (v1.1.22)
// ---------------------------------------------------------------------------

// POST /api/games/:gameId/characters/:charId/memories  — add a new memory
router.post('/:gameId/characters/:charId/memories', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId } = req.params;
    const npc = fm.getCharacter(gameId, charId);
    if (!npc) return res.status(404).json({ error: 'Character not found.' });
    const body = req.body || {};
    const event = typeof body.event === 'string' ? body.event.trim() : '';
    if (!event) return res.status(400).json({ error: 'Field "event" is required.' });
    const game = fm.getGame(gameId);
    const fallbackChapter = (game as any)?.chapter ?? (game as any)?.currentChapter ?? 0;
    const entry = {
      id: uuidv4(),
      chapter: typeof body.chapter === 'number' ? body.chapter : fallbackChapter,
      event,
      sourceMessageIds: [] as string[], // user-added — never auto-invalidated
      stale: false,
      createdAt: new Date().toISOString(),
    };
    const updated: NPCCharacter = { ...npc, memory: [...(npc.memory || []), entry] };
    fm.saveCharacter(gameId, updated);
    logger.info(MOD, `Added memory ${entry.id} to NPC ${charId} in game ${gameId}`);
    return res.status(201).json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to add memory', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// PATCH /api/games/:gameId/characters/:charId/memories/:memoryId  — edit
router.patch('/:gameId/characters/:charId/memories/:memoryId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId, memoryId } = req.params;
    const npc = fm.getCharacter(gameId, charId);
    if (!npc) return res.status(404).json({ error: 'Character not found.' });
    const body = req.body || {};
    const idx = (npc.memory || []).findIndex((m) => m.id === memoryId);
    if (idx === -1) return res.status(404).json({ error: 'Memory not found.' });
    const current = npc.memory[idx];
    const next = {
      ...current,
      // Manual edits clear the stale flag — the user has reviewed it.
      stale: false,
      ...(typeof body.event === 'string' ? { event: body.event } : {}),
      ...(typeof body.chapter === 'number' ? { chapter: body.chapter } : {}),
    };
    const memory = [...npc.memory];
    memory[idx] = next;
    const updated: NPCCharacter = { ...npc, memory };
    fm.saveCharacter(gameId, updated);
    logger.info(MOD, `Edited memory ${memoryId} on NPC ${charId} in game ${gameId}`);
    return res.json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to edit memory', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// DELETE /api/games/:gameId/characters/:charId/memories/:memoryId
router.delete('/:gameId/characters/:charId/memories/:memoryId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, charId, memoryId } = req.params;
    const npc = fm.getCharacter(gameId, charId);
    if (!npc) return res.status(404).json({ error: 'Character not found.' });
    const memory = (npc.memory || []).filter((m) => m.id !== memoryId);
    if (memory.length === (npc.memory || []).length) {
      return res.status(404).json({ error: 'Memory not found.' });
    }
    const updated: NPCCharacter = { ...npc, memory };
    fm.saveCharacter(gameId, updated);
    logger.info(MOD, `Deleted memory ${memoryId} from NPC ${charId} in game ${gameId}`);
    return res.json(updated);
  } catch (err) {
    logger.error(MOD, 'Failed to delete memory', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// World state — both /state and /world-state exposed. Returns WorldState directly.
// ---------------------------------------------------------------------------
function getWorldStateHandler(req: Request, res: Response) {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const state = fm.getWorldState(gameId);
    return res.json(state);
  } catch (err) {
    logger.error(MOD, 'Failed to get world state', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
router.get('/:gameId/state', getWorldStateHandler);
router.get('/:gameId/world-state', getWorldStateHandler);

function updateWorldStateHandler(req: Request, res: Response) {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const patch = req.body || {};
    fm.saveWorldState(gameId, {
      events: Array.isArray(patch.events) ? patch.events : [],
      locationStates: patch.locationStates || {},
    });
    return res.json(fm.getWorldState(gameId));
  } catch (err) {
    logger.error(MOD, 'Failed to update world state', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
router.put('/:gameId/state', updateWorldStateHandler);
router.put('/:gameId/world-state', updateWorldStateHandler);

// ---------------------------------------------------------------------------
// World info
// ---------------------------------------------------------------------------
router.get('/:gameId/world', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const world = fm.getWorld(req.params.gameId);
    if (!world) return res.status(404).json({ error: 'World not found.' });
    return res.json(world);
  } catch (err) {
    logger.error(MOD, 'Failed to get world', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

function updateWorldHandler(req: Request, res: Response) {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    const existing = fm.getWorld(gameId) || ({} as WorldInfo);
    const merged: WorldInfo = { ...existing, ...(req.body || {}) };
    fm.saveWorld(gameId, merged);
    return res.json(merged);
  } catch (err) {
    logger.error(MOD, 'Failed to update world', err);
    return res.status(500).json({ error: (err as Error).message });
  }
}
router.put('/:gameId/world', updateWorldHandler);
router.patch('/:gameId/world', updateWorldHandler);

// ---------------------------------------------------------------------------
// World state (v1.1.36) — manual editor CRUD
//
// The cascade in v1.1.35 covers automatic invalidation on message edit / delete /
// regenerate. These routes let the user manually scrub events the cascade can't
// reach — events from many turns back whose source messages still exist, or
// legacy events from before v1.1.35 that have no traceable source at all.
// ---------------------------------------------------------------------------

/** Full world state — events list + locationStates map. */
router.get('/:gameId/world-state', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    return res.json(fm.getWorldState(gameId));
  } catch (err) {
    logger.error(MOD, 'Failed to get world state', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/** Append a brand-new user-authored event. Always lands with `sourceMessageIds: []`
 *  so the cascade will never auto-touch it. */
router.post('/:gameId/world-state/events', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    const body = req.body || {};
    const event = typeof body.event === 'string' ? body.event.trim() : '';
    if (!event) return res.status(400).json({ error: 'Field "event" is required.' });
    const location = typeof body.location === 'string' ? body.location.trim() : '';
    const timestamp =
      typeof body.timestamp === 'string' && body.timestamp ? body.timestamp : new Date().toISOString();
    const chapter = Number.isInteger(body.chapter) ? body.chapter : 1;
    const ws = fm.getWorldState(gameId);
    const newEvent: WorldStateEvent = {
      id: uuidv4(),
      event,
      location,
      timestamp,
      chapter,
      // v1.1.37: server-stamped ISO time for timeline ordering. The editor
      // sorts on this, so user-added events appear at the current moment in
      // their chapter rather than scattering by the free-form `timestamp`.
      createdAt: new Date().toISOString(),
      sourceMessageIds: [],
    };
    ws.events.push(newEvent);
    fm.saveWorldState(gameId, ws);
    logger.info(MOD, `world-state: added event ${newEvent.id} to ${gameId}`);
    return res.status(201).json(newEvent);
  } catch (err) {
    logger.error(MOD, 'Failed to add world-state event', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/** Edit an existing event. Editing clears the `stale` flag — the user has
 *  reviewed and either rewrote or accepted the event. */
router.patch('/:gameId/world-state/events/:eventId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, eventId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    const ws = fm.getWorldState(gameId);
    const idx = ws.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return res.status(404).json({ error: 'Event not found.' });
    const body = req.body || {};
    const cur = ws.events[idx];
    const next: WorldStateEvent = {
      ...cur,
      event: typeof body.event === 'string' ? body.event : cur.event,
      location: typeof body.location === 'string' ? body.location : cur.location,
      timestamp: typeof body.timestamp === 'string' ? body.timestamp : cur.timestamp,
      chapter: Number.isInteger(body.chapter) ? body.chapter : cur.chapter,
      // Edit explicitly clears stale — user has reviewed.
      stale: false,
    };
    ws.events[idx] = next;
    fm.saveWorldState(gameId, ws);
    logger.info(MOD, `world-state: edited event ${eventId} in ${gameId} (stale cleared)`);
    return res.json(next);
  } catch (err) {
    logger.error(MOD, 'Failed to edit world-state event', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/** Delete a single event. */
router.delete('/:gameId/world-state/events/:eventId', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, eventId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    const ws = fm.getWorldState(gameId);
    const before = ws.events.length;
    ws.events = ws.events.filter((e) => e.id !== eventId);
    if (ws.events.length === before) return res.status(404).json({ error: 'Event not found.' });
    fm.saveWorldState(gameId, ws);
    logger.info(MOD, `world-state: deleted event ${eventId} from ${gameId}`);
    return res.json({ ok: true });
  } catch (err) {
    logger.error(MOD, 'Failed to delete world-state event', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/** Bulk delete — by chapter, or by id list. Body: `{ chapter?: number, ids?: string[] }`. */
router.post('/:gameId/world-state/events/bulk-delete', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    const body = req.body || {};
    const chapter = Number.isInteger(body.chapter) ? body.chapter : null;
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x: unknown): x is string => typeof x === 'string')
      : [];
    if (chapter === null && ids.length === 0) {
      return res.status(400).json({ error: 'Provide "chapter" or non-empty "ids".' });
    }
    const idSet = new Set(ids);
    const ws = fm.getWorldState(gameId);
    const before = ws.events.length;
    ws.events = ws.events.filter((e) => {
      if (idSet.has(e.id)) return false;
      if (chapter !== null && e.chapter === chapter) return false;
      return true;
    });
    const removed = before - ws.events.length;
    fm.saveWorldState(gameId, ws);
    logger.info(MOD, `world-state: bulk-deleted ${removed} event(s) from ${gameId}`);
    return res.json({ removed });
  } catch (err) {
    logger.error(MOD, 'Failed to bulk-delete world-state events', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/** Set / replace one entry in `locationStates`. Body: `{ text: string }`. */
router.put('/:gameId/world-state/locations/:location', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, location } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    const text = typeof req.body?.text === 'string' ? req.body.text : '';
    const ws = fm.getWorldState(gameId);
    ws.locationStates[location] = text;
    fm.saveWorldState(gameId, ws);
    return res.json({ location, text });
  } catch (err) {
    logger.error(MOD, 'Failed to set location state', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

/** Remove an entry from `locationStates`. */
router.delete('/:gameId/world-state/locations/:location', (req: Request, res: Response) => {
  try {
    const fm = getFileManager();
    const { gameId, location } = req.params;
    if (!fm.getGame(gameId)) return res.status(404).json({ error: 'Game not found.' });
    const ws = fm.getWorldState(gameId);
    if (!(location in ws.locationStates)) return res.status(404).json({ error: 'Location not found.' });
    delete ws.locationStates[location];
    fm.saveWorldState(gameId, ws);
    return res.json({ ok: true });
  } catch (err) {
    logger.error(MOD, 'Failed to delete location state', err);
    return res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
