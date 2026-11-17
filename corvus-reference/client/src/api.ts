import type {
  ChatMessage,
  GameConfig,
  GameSnapshot,
  GlobalConfig,
  ImageMetadata,
  NPCCharacter,
  PlayerCharacter,
  WorldInfo,
  WorldState,
  WorldStateEvent,
  ImageMode,
} from './types';

// In dev, Vite proxies /api to http://localhost:3000. In production (served by the
// backend itself), /api is the same host.
const API_BASE = '/api';

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch {
      try {
        message = await res.text();
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line no-console
    console.error(`[API Error] ${res.status} ${res.url}: ${message}`);
    throw new Error(message);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (!entries.length) return '';
  const search = new URLSearchParams();
  for (const [k, v] of entries) search.set(k, String(v));
  return `?${search.toString()}`;
}

// =========================================================
// Games
// =========================================================

export async function listGames(): Promise<GameConfig[]> {
  const res = await fetch(`${API_BASE}/games`);
  return handle<GameConfig[]>(res);
}

export async function createGame(payload: {
  name: string;
  genre: string;
  description: string;
  world: {
    setting: string;
    tone: string;
    rules: string;
    currencyName: string;
    era?: string;
    customInstructions?: string;
    narratorEnabled?: boolean;
  };
  player: {
    name: string;
    backstory: string;
    appearance: string;
    stats: Record<string, number>;
    money: { currencyName: string; amount: number };
    abilities: Array<{ name: string; description: string; type: string; level: number }>;
    inventory: Array<{ name: string; description: string; quantity: number }>;
  };
}): Promise<GameConfig> {
  const res = await fetch(`${API_BASE}/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handle<GameConfig>(res);
}

export async function getGame(id: string): Promise<GameSnapshot> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(id)}`);
  return handle<GameSnapshot>(res);
}

export async function updateGame(
  id: string,
  patch: Partial<GameConfig> & { world?: any; player?: any },
): Promise<GameConfig> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handle<GameConfig>(res);
}

export async function deleteGame(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await handle(res);
}

// =========================================================
// Chat
// =========================================================

export async function getHistory(gameId: string): Promise<ChatMessage[]> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/messages`);
  return handle<ChatMessage[]>(res);
}

export type StreamEvent =
  | { type: 'token'; content: string }
  | { type: 'message'; message: ChatMessage }
  | { type: 'done'; message: ChatMessage }
  | { type: 'gm_update'; player?: PlayerCharacter; characters?: NPCCharacter[]; worldState?: WorldState }
  | { type: 'error'; error: string };

export interface StreamHandlers {
  onToken?: (content: string) => void;
  onMessage?: (message: ChatMessage) => void;
  onDone?: (message: ChatMessage) => void;
  onGmUpdate?: (data: {
    player?: PlayerCharacter;
    characters?: NPCCharacter[];
    worldState?: WorldState;
  }) => void;
  onError?: (error: string) => void;
}

/**
 * Parse a ReadableStream of SSE formatted data into discrete events.
 */
async function consumeSSE(
  response: Response,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  if (!response.body) {
    handlers.onError?.('No response body');
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushEvent = (raw: string) => {
    // parse "event: X\ndata: Y" chunks. Support data-only lines too.
    const lines = raw.split('\n');
    let dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    if (!dataLines.length) return;
    const dataStr = dataLines.join('\n');
    if (dataStr === '[DONE]') return;
    try {
      const parsed = JSON.parse(dataStr) as StreamEvent;
      switch (parsed.type) {
        case 'token':
          handlers.onToken?.(parsed.content);
          break;
        case 'message':
          handlers.onMessage?.(parsed.message);
          break;
        case 'done':
          if (parsed.message) {
            handlers.onDone?.(parsed.message);
          } else {
            // eslint-disable-next-line no-console
            console.warn('[SSE] Received done event with no message — ignoring');
          }
          break;
        case 'gm_update':
          handlers.onGmUpdate?.(parsed);
          break;
        case 'error':
          // eslint-disable-next-line no-console
          console.error('[SSE] Server error event:', parsed.error);
          handlers.onError?.(parsed.error);
          break;
        default:
          // eslint-disable-next-line no-console
          console.debug('[SSE] Ignoring event:', (parsed as any).type);
          break;
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[SSE] Failed to parse event:', dataStr, e);
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch(() => {});
        return;
      }
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const chunk = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (chunk.trim()) flushEvent(chunk);
      }
    }
    if (buffer.trim()) flushEvent(buffer);
  } catch (err: any) {
    if (err?.name !== 'AbortError') {
      // eslint-disable-next-line no-console
      console.error('[SSE] Stream error:', err);
      handlers.onError?.(err?.message || 'Stream error');
    }
  }
}

export interface SendMessageOpts {
  mode?: string;
  activeCharacterId?: string;
  groupParticipantIds?: string[];
  nextSpeakerId?: string;
  /** v1.1.30: lock the storyteller to ONE specific NPC for this turn. */
  singleSpeakerId?: string;
}

export async function sendMessage(
  gameId: string,
  content: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
  opts?: SendMessageOpts,
): Promise<void> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      content,
      mode: opts?.mode,
      activeCharacterId: opts?.activeCharacterId,
      groupParticipantIds: opts?.groupParticipantIds,
      nextSpeakerId: opts?.nextSpeakerId,
      singleSpeakerId: opts?.singleSpeakerId,
    }),
    signal,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    handlers.onError?.(err);
    return;
  }
  await consumeSSE(res, handlers, signal);
}

export async function regenerateMessage(
  gameId: string,
  messageId: string,
  handlers: StreamHandlers,
  signal?: AbortSignal,
  opts?: SendMessageOpts,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/messages/${encodeURIComponent(messageId)}/regenerate`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({
        mode: opts?.mode,
        activeCharacterId: opts?.activeCharacterId,
        groupParticipantIds: opts?.groupParticipantIds,
        nextSpeakerId: opts?.nextSpeakerId,
        singleSpeakerId: opts?.singleSpeakerId,
      }),
      signal,
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    handlers.onError?.(err);
    return;
  }
  await consumeSSE(res, handlers, signal);
}

export async function editMessage(
  gameId: string,
  messageId: string,
  content: string,
  opts: { regenerateFollowing?: boolean } = {},
): Promise<ChatMessage> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/messages/${encodeURIComponent(messageId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, regenerateFollowing: opts.regenerateFollowing ?? false }),
    },
  );
  return handle<ChatMessage>(res);
}

export async function deleteMessage(gameId: string, messageId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/messages/${encodeURIComponent(messageId)}`,
    { method: 'DELETE' },
  );
  await handle(res);
}

export async function selectAlternative(
  gameId: string,
  messageId: string,
  index: number,
): Promise<ChatMessage> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/messages/${encodeURIComponent(messageId)}/alternative`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ index }),
    },
  );
  return handle<ChatMessage>(res);
}

// =========================================================
// Player / characters / world state
// =========================================================

export async function getPlayer(gameId: string): Promise<PlayerCharacter> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/player`);
  return handle<PlayerCharacter>(res);
}

export async function updatePlayer(
  gameId: string,
  patch: Partial<PlayerCharacter>,
): Promise<PlayerCharacter> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/player`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handle<PlayerCharacter>(res);
}

export async function createCharacter(
  gameId: string,
  patch: Partial<NPCCharacter>,
): Promise<NPCCharacter> {
  const res = await fetch(`${API_BASE}/games/${gameId}/characters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handle<NPCCharacter>(res);
}

export async function listCharacters(gameId: string): Promise<NPCCharacter[]> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/characters`);
  return handle<NPCCharacter[]>(res);
}

export async function getCharacter(gameId: string, charId: string): Promise<NPCCharacter> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}`,
  );
  return handle<NPCCharacter>(res);
}

export async function updateCharacter(
  gameId: string,
  charId: string,
  patch: Partial<NPCCharacter>,
): Promise<NPCCharacter> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return handle<NPCCharacter>(res);
}

/**
 * Import a SillyTavern / chub.ai character card (PNG with embedded metadata or
 * raw JSON). When `save: true` the server persists the character immediately and
 * returns the saved record; otherwise it returns a draft for the user to review.
 */
export async function importCharacterCard(
  gameId: string,
  args: { fileBase64: string; filename?: string; save?: boolean },
): Promise<
  | { source: string; character: NPCCharacter }
  | { source: string; draft: Partial<NPCCharacter> }
> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/import`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    },
  );
  return handle(res);
}

/**
 * Standalone character-card parser — doesn't require a gameId. Used by the
 * New Character Chat dialog to preview a card BEFORE the host game exists.
 */
export async function parseCharacterCard(args: {
  fileBase64: string;
  filename?: string;
}): Promise<{
  source: string;
  draft: Partial<NPCCharacter>;
  greetings: string[];
}> {
  const res = await fetch(`${API_BASE}/character-card/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  return handle(res);
}

/**
 * Seed a pre-baked assistant message directly into a game's chat log without
 * going through the LLM. Used by the New Character Chat flow to drop a card's
 * chosen greeting in as the very first reply.
 */
export async function seedMessage(
  gameId: string,
  args: { content: string; characterId?: string; type?: 'character' | 'narrator' },
): Promise<unknown> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/messages/seed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    },
  );
  return handle(res);
}

export async function deleteCharacter(gameId: string, charId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}`,
    { method: 'DELETE' },
  );
  await handle(res);
}

// ---------------------------------------------------------------
// Status lifecycle (v1.1.28): approve / deny pending NPCs, enable
// / disable existing NPCs. Each call returns the updated character
// (except deny, which deletes and returns { ok }).
// ---------------------------------------------------------------

export async function approveCharacter(gameId: string, charId: string): Promise<NPCCharacter> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}/approve`,
    { method: 'POST' },
  );
  return handle<NPCCharacter>(res);
}

export async function denyCharacter(gameId: string, charId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}/deny`,
    { method: 'POST' },
  );
  await handle(res);
}

export async function enableCharacter(gameId: string, charId: string): Promise<NPCCharacter> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}/enable`,
    { method: 'POST' },
  );
  return handle<NPCCharacter>(res);
}

export async function disableCharacter(gameId: string, charId: string): Promise<NPCCharacter> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}/disable`,
    { method: 'POST' },
  );
  return handle<NPCCharacter>(res);
}

export async function getWorldState(gameId: string): Promise<WorldState> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/world-state`);
  return handle<WorldState>(res);
}

// v1.1.36: world-state editor CRUD ---------------------------------------

export async function addWorldStateEvent(
  gameId: string,
  body: { event: string; location?: string; timestamp?: string; chapter?: number },
): Promise<WorldStateEvent> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/world-state/events`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return handle<WorldStateEvent>(res);
}

export async function updateWorldStateEvent(
  gameId: string,
  eventId: string,
  patch: Partial<Pick<WorldStateEvent, 'event' | 'location' | 'timestamp' | 'chapter'>>,
): Promise<WorldStateEvent> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/world-state/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return handle<WorldStateEvent>(res);
}

export async function deleteWorldStateEvent(gameId: string, eventId: string): Promise<{ ok: true }> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/world-state/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE' },
  );
  return handle<{ ok: true }>(res);
}

export async function bulkDeleteWorldStateEvents(
  gameId: string,
  body: { chapter?: number; ids?: string[] },
): Promise<{ removed: number }> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/world-state/events/bulk-delete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return handle<{ removed: number }>(res);
}

export async function setLocationState(
  gameId: string,
  location: string,
  text: string,
): Promise<{ location: string; text: string }> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/world-state/locations/${encodeURIComponent(location)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    },
  );
  return handle<{ location: string; text: string }>(res);
}

export async function deleteLocationState(gameId: string, location: string): Promise<{ ok: true }> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/world-state/locations/${encodeURIComponent(location)}`,
    { method: 'DELETE' },
  );
  return handle<{ ok: true }>(res);
}

export async function getWorld(gameId: string): Promise<WorldInfo> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/world`);
  return handle<WorldInfo>(res);
}

export async function updateWorld(gameId: string, patch: Partial<WorldInfo>): Promise<WorldInfo> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/world`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handle<WorldInfo>(res);
}

// =========================================================
// Images
// =========================================================

export async function listImages(
  gameId: string,
  filter?: { category?: string; linkedNpc?: string },
): Promise<ImageMetadata[]> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/images${qs({
      category: filter?.category,
      linkedNpc: filter?.linkedNpc,
    })}`,
  );
  return handle<ImageMetadata[]>(res);
}

export async function getImageMetadata(gameId: string, imageId: string): Promise<ImageMetadata> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/images/${encodeURIComponent(imageId)}`,
  );
  return handle<ImageMetadata>(res);
}

export function getImageURL(gameId: string, filename: string): string {
  return `${API_BASE}/games/${encodeURIComponent(gameId)}/images/file/${encodeURIComponent(filename)}`;
}

export async function deleteImage(gameId: string, imageId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/images/${encodeURIComponent(imageId)}`,
    { method: 'DELETE' },
  );
  await handle(res);
}

// ---------------------------------------------------------------------------
// v1.1.22: set a generated image as an NPC's portrait. Wraps the existing
// `/images/:imageId/send-to` route with target=npc.
// ---------------------------------------------------------------------------
export async function setImageAsPortrait(
  gameId: string,
  imageId: string,
  npcId: string,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/images/${encodeURIComponent(imageId)}/send-to`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: 'npc', npcId }),
    },
  );
  await handle(res);
}

// ---------------------------------------------------------------------------
// v1.1.22: NPC memory CRUD. All three routes return the FULL updated character
// so callers can replace the local copy in one hop.
// ---------------------------------------------------------------------------
export async function addCharacterMemory(
  gameId: string,
  charId: string,
  payload: { event: string; chapter?: number },
): Promise<NPCCharacter> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}/memories`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  return handle<NPCCharacter>(res);
}

export async function updateCharacterMemory(
  gameId: string,
  charId: string,
  memoryId: string,
  patch: { event?: string; chapter?: number },
): Promise<NPCCharacter> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}/memories/${encodeURIComponent(memoryId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  return handle<NPCCharacter>(res);
}

export async function deleteCharacterMemory(
  gameId: string,
  charId: string,
  memoryId: string,
): Promise<NPCCharacter> {
  const res = await fetch(
    `${API_BASE}/games/${encodeURIComponent(gameId)}/characters/${encodeURIComponent(charId)}/memories/${encodeURIComponent(memoryId)}`,
    { method: 'DELETE' },
  );
  return handle<NPCCharacter>(res);
}

export interface Txt2ImgParams {
  prompt: string;
  negativePrompt: string;
  settings: Partial<ImageMetadata['settings']>;
  batchCount?: number;
  label?: string;
  category?: ImageMetadata['category'];
  linkedNpc?: string | null;
  /** v1.1.20: subject NPC ids from the image-chat agent. Used for identity-seed lock resolution. */
  subjectNpcIds?: string[];
  /** v1.1.20: when true and exactly one subject has a saved identitySeed, the server uses that seed for every batch entry. */
  lockIdentitySeed?: boolean;
}

export async function generateTxt2Img(
  gameId: string,
  params: Txt2ImgParams,
): Promise<ImageMetadata[]> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/images/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handle<ImageMetadata[]>(res);
}

export interface Img2ImgParams extends Txt2ImgParams {
  sourceImageId?: string;
  sourceImageData?: string; // base64 dataURL or raw base64
  denoiseStrength: number;
}

export async function generateImg2Img(
  gameId: string,
  params: Img2ImgParams,
): Promise<ImageMetadata[]> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/images/img2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handle<ImageMetadata[]>(res);
}

export interface InpaintParams extends Img2ImgParams {
  maskData: string;
}

export async function generateInpaint(
  gameId: string,
  params: InpaintParams,
): Promise<ImageMetadata[]> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/images/inpaint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return handle<ImageMetadata[]>(res);
}

export async function uploadImage(
  gameId: string,
  file: File,
  meta?: { label?: string; category?: ImageMetadata['category']; linkedNpc?: string | null },
): Promise<ImageMetadata> {
  const form = new FormData();
  form.append('file', file);
  if (meta?.label) form.append('label', meta.label);
  if (meta?.category) form.append('category', meta.category);
  if (meta?.linkedNpc) form.append('linkedNpc', meta.linkedNpc);
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/images/upload`, {
    method: 'POST',
    body: form,
  });
  return handle<ImageMetadata>(res);
}

export interface ImageChatResponse {
  prompt: string;
  negativePrompt: string;
  suggestedSettings?: Partial<ImageMetadata['settings']>;
  mode?: ImageMode;
  source?: string;
  resolvedNpcId?: string;
  /** v1.1.20: list of NPCs the image will depict. Drives identity-anchor display, seed-lock availability, and multi-character warnings. */
  subjectNpcIds?: string[];
  /** v1.1.20: scene-only tags (outfit/pose/setting). Server prepended identity. */
  sceneDelta?: string;
  /** v1.1.20: server-prepended identity segment (coreAppearance + BREAK separators + count tokens). */
  identityAnchor?: string;
  /** v1.1.20: tag-presence safety-net repairs, per subject. */
  repairedTokens?: Array<{ npcId: string; added: string[] }>;
  suggestedLabel?: string;
  clarificationQuestion?: string;
  reasoning?: string;
  rawResponse?: string;
}

export async function imageChat(
  gameId: string,
  message: string,
  context?: { mode?: ImageMode; lastPrompt?: string },
): Promise<ImageChatResponse> {
  const res = await fetch(`${API_BASE}/games/${encodeURIComponent(gameId)}/images/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, ...context }),
  });
  return handle<ImageChatResponse>(res);
}

// =========================================================
// Game-design agent
// =========================================================

export interface DesignChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Loose shape — the form will normalize whatever the model returns.
export interface DesignDraft {
  name?: string;
  genre?: string;
  description?: string;
  world?: {
    setting?: string;
    tone?: string;
    rules?: string;
    era?: string;
    customInstructions?: string;
    currencyName?: string;
  };
  player?: {
    name?: string;
    backstory?: string;
    appearance?: string;
    stats?: Record<string, number>;
    money?: { amount?: number; currencyName?: string };
    abilities?: Array<{ name: string; description?: string; type?: string; level?: number }>;
    inventory?: Array<{ name: string; description?: string; quantity?: number }>;
  };
}

export interface DesignChatResponse {
  reply: string;
  suggestion: DesignDraft | null;
}

export async function designChat(history: DesignChatMessage[]): Promise<DesignChatResponse> {
  const res = await fetch(`${API_BASE}/agents/design-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history }),
  });
  return handle<DesignChatResponse>(res);
}

// Loose shape — the NewCharacterChatDialog form will normalize whatever
// the design agent returns. Mirrors DesignDraft but for the slim character-
// chat creation flow (no world / stats / inventory).
export interface DesignCharacterDraft {
  name?: string;
  appearance?: string;
  personality?: string;
  background?: string;
  knownInfo?: string;
  voiceStyle?: string;
  dispositionTowardPlayer?: string;
  chatTitle?: string;
  playerName?: string;
  startingMessage?: string;
  image?: {
    basePrompt?: string;
    baseNegative?: string;
  };
}

export interface DesignCharacterChatResponse {
  reply: string;
  suggestion: DesignCharacterDraft | null;
}

export async function designCharacterChat(
  history: DesignChatMessage[],
): Promise<DesignCharacterChatResponse> {
  const res = await fetch(`${API_BASE}/agents/design-character-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history }),
  });
  return handle<DesignCharacterChatResponse>(res);
}

// =========================================================
// Vision (image -> game / image -> character)
// =========================================================

export interface VisionStatus {
  ok: boolean;
  reachable: boolean;
  /** Name of the currently loaded model, if any. */
  model?: string | null;
  error?: string;
}

export async function getVisionStatus(): Promise<VisionStatus> {
  const res = await fetch(`${API_BASE}/agents/vision-status`);
  return handle<VisionStatus>(res);
}

// Loose shape — matches NPCCharacter input fields, the form will normalize.
export interface CharacterDraft {
  name?: string;
  revealedName?: string | null;
  appearance?: string;
  personality?: string;
  background?: string;
  knownInfo?: string;
  dispositionTowardPlayer?: string;
  voiceStyle?: string;
  image?: {
    basePrompt?: string;
    baseNegative?: string;
  };
}

export type FromImageMode = 'game' | 'character';

export interface FromImageResponse {
  mode: FromImageMode;
  suggestion: DesignDraft | CharacterDraft;
}

/**
 * Generate a game or character draft from an uploaded image.
 * `image` is a data URL (e.g. result of FileReader.readAsDataURL).
 * Throws Error with message from server on failure; callers can detect the
 * 'no_vision' code by inspecting the message text.
 */
export async function fromImage(
  mode: FromImageMode,
  image: string,
  hint?: string,
): Promise<FromImageResponse> {
  const res = await fetch(`${API_BASE}/agents/from-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, image, hint: hint || undefined }),
  });
  return handle<FromImageResponse>(res);
}

/**
 * (Re)generate the booru-style basePrompt + baseNegative for an existing NPC,
 * using the user's example prompts as style reference. Saves the result to
 * the character file and returns the updated character.
 */
export async function regenImagePrompt(
  gameId: string,
  characterId: string,
): Promise<{ character: NPCCharacter }> {
  const res = await fetch(`${API_BASE}/agents/regen-image-prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, characterId }),
  });
  return handle<{ character: NPCCharacter }>(res);
}

// =========================================================
// ComfyUI options
// =========================================================

export interface ComfyUIOptions {
  models: string[];
  samplers: string[];
  schedulers: string[];
}

export async function getComfyUIOptions(): Promise<ComfyUIOptions> {
  const res = await fetch(`${API_BASE}/settings/comfyui/options`);
  return handle<ComfyUIOptions>(res);
}

// =========================================================
// Settings
// =========================================================

export async function getSettings(): Promise<GlobalConfig> {
  const res = await fetch(`${API_BASE}/settings`);
  return handle<GlobalConfig>(res);
}

export async function updateSettings(patch: Partial<GlobalConfig>): Promise<GlobalConfig> {
  const res = await fetch(`${API_BASE}/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return handle<GlobalConfig>(res);
}

export async function testLMStudio(
  override?: { url?: string; apiKey?: string; model?: string },
): Promise<{ ok: boolean; model?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/settings/test/lm-studio`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(override || {}),
  });
  return handle(res);
}

export async function testComfyUI(override?: { url?: string }): Promise<{ ok: boolean; version?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/settings/test/comfyui`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(override || {}),
  });
  return handle(res);
}

// =========================================================
// TTS (Chatterbox)
// =========================================================

export interface TTSVoice {
  id: string;
  name: string;
  /** Where this voice came from. Used to group the dropdown. */
  source?: 'predefined' | 'reference' | 'openai';
}

export async function listTTSVoices(
  override?: { url?: string; apiKey?: string },
): Promise<{ ok: boolean; voices: TTSVoice[]; error?: string }> {
  const qs = new URLSearchParams();
  if (override?.url) qs.set('url', override.url);
  if (override?.apiKey !== undefined) qs.set('apiKey', override.apiKey);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  const res = await fetch(`${API_BASE}/tts/voices${suffix}`);
  return handle(res);
}

/**
 * POST /api/tts/synthesize → audio bytes. Returns a Blob the caller can
 * feed straight into `URL.createObjectURL(...)` for an <audio> element.
 *
 * Throws on non-2xx so the caller can surface the error in the dock UI.
 */
export async function synthesizeTTS(text: string, voice?: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/tts/synthesize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.error || JSON.stringify(j);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`TTS ${res.status}: ${detail || 'failed'}`);
  }
  return res.blob();
}

export async function testTTS(
  override?: { url?: string; apiKey?: string },
): Promise<{ ok: boolean; voices?: TTSVoice[]; error?: string }> {
  const res = await fetch(`${API_BASE}/tts/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(override || {}),
  });
  return handle(res);
}
