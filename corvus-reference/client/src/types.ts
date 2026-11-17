// Shared type definitions mirroring the server API types.

export interface GameConfig {
  id: string;
  name: string;
  genre: string;
  description: string;
  createdAt: string;
  lastPlayedAt: string;
}

export interface WorldInfo {
  setting: string;
  tone: string;
  rules: string;
  customInstructions: string;
  currencyName: string;
  era: string;
  /**
   * When false, the storyteller never emits [Narrator] blocks — every reply is
   * delivered through individual character voices. Defaults to true (or undefined)
   * for backward compatibility with games created before this option existed.
   */
  narratorEnabled?: boolean;
}

export interface Ability {
  name: string;
  description: string;
  type: string;
  level: number;
}

export interface InventoryItem {
  name: string;
  description: string;
  quantity: number;
}

export interface RelationshipRecord {
  name: string;
  disposition: string;
  notes: string;
}

export interface Money {
  currencyName: string;
  amount: number;
}

export interface PlayerCharacter {
  name: string;
  backstory: string;
  appearance: string;
  stats: Record<string, number>;
  money: Money;
  /**
   * v1.1.38: additional named currencies. Optional and starts empty; the UI
   * treats this as a flat list of secondary balances rendered alongside
   * `money` so the user sees one unified currency panel. Keys are
   * human-readable currency names (e.g. "silver", "high-grade spirit
   * stones"). Values are amounts.
   */
  extraCurrencies?: Record<string, number>;
  abilities: Ability[];
  inventory: InventoryItem[];
  relationships: Record<string, RelationshipRecord>;
}

export interface NPCMemoryEntry {
  id: string;
  chapter: number;
  event: string;
  /** ChatMessage ids the memory was derived from (GM-emitted memories only). */
  sourceMessageIds?: string[];
  /** True when a source message has been edited since this memory was created. */
  stale?: boolean;
  createdAt?: string;
}

/**
 * Lifecycle status mirror of `NPCStatus` on the server. See server/types/index.ts.
 *   active   → full participant
 *   pending  → awaiting user approval (filtered from storyteller context)
 *   disabled → lean reference only (model knows they exist, but won't voice them)
 */
export type NPCStatus = 'active' | 'pending' | 'disabled';

export interface NPCCharacter {
  id: string;
  name: string;
  revealedName: string | null;
  /** Lifecycle status; defaults to 'active' via the server normalizer. */
  status?: NPCStatus;
  appearance: string;
  personality: string;
  background: string;
  knownInfo: string;
  dispositionTowardPlayer: string;
  memory: NPCMemoryEntry[];
  voiceStyle: string;
  /** Per-NPC text-to-speech config. When undefined, falls back to narrator voice. */
  tts?: {
    enabled: boolean;
    /** Chatterbox voice id. Blank → narrator voice. */
    voice: string;
  };
  /**
   * Optional hex color (e.g. "#60a5fa") used to tint this character's speaker
   * label and dialogue in the chat UI. When null/undefined, the UI derives a
   * stable per-character color from the NPC id.
   */
  chatColor?: string | null;
  /**
   * Optional hex color used to tint this character's *action* / italic text.
   * When null/undefined, falls back to the global appearance.actionColor.
   */
  actionColor?: string | null;
  image: {
    basePrompt: string;
    /**
     * Distilled core-identity tags (hair, eyes, body, ethnicity, marks).
     * NO outfit, setting, lighting, or quality tags. Used by the image
     * assistant to anchor scene generation without pulling in basePrompt's
     * outfit / lighting / pose details.
     */
    coreAppearance: string;
    /**
     * Canonical outfit tags (booru-style, comma separated). Used by the image
     * assistant to anchor what the character is wearing in new scenes when no
     * alternative outfit is described. Outfit + accessories only — no identity,
     * setting, or lighting. (v1.1.25)
     */
    defaultOutfit?: string;
    baseNegative: string;
    lastPrompt: string | null;
    lastSeed: number | null;
    /**
     * Stable seed for this character's identity across generations. When set
     * and "lock identity" is enabled, single-subject generations re-use this
     * seed so face/body stays recognizable. `null` = unlocked.
     */
    identitySeed: number | null;
    portraitPath: string | null;
  };
}

export interface ChatMessageAlternative {
  content: string;
  timestamp: string;
  characterId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  type: 'narrator' | 'character' | 'mixed' | 'user' | 'system';
  content: string;
  timestamp: string;
  characterId?: string;
  alternatives?: ChatMessageAlternative[];
  currentAlternative?: number;
}

export interface ImageSettings {
  model: string;
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  seed: number;
  denoiseStrength: number | null;
}

export interface ImageMetadata {
  id: string;
  filename: string;
  label: string;
  category: 'character' | 'scene' | 'item' | 'other';
  linkedNpc: string | null;
  created: string;
  sourceMode: 'txt2img' | 'img2img' | 'inpaint' | 'upload';
  parentImage: string | null;
  prompt: string;
  negativePrompt: string;
  settings: ImageSettings;
}

export interface StatChange {
  field: string;
  operation: string;
  value: number;
  reason: string;
  previousValue?: number;
  newValue?: number;
}

export interface GameMasterOutput {
  statChanges: StatChange[];
  newItems: InventoryItem[];
  removedItems: Array<{ name: string; quantity: number }>;
  relationshipUpdates: Array<{ id: string; disposition: string; notes: string }>;
  newCharacters: Array<Partial<NPCCharacter>>;
  worldStateUpdates: Array<{ event: string; location: string; timestamp: string }>;
  characterUpdates: Array<{ id: string; [key: string]: any }>;
}

export interface ExamplePrompt {
  label: string;
  prompt: string;
  negative: string;
}

export interface GlobalConfig {
  lmStudio: {
    url: string;
    defaultModel: string;
    temperature: number;
    topP: number;
    maxTokens: number;
    /** Optional bearer token sent as `Authorization: Bearer <apiKey>`. */
    apiKey?: string;
    /** Optional explicit model id to send in the request body (vLLM/OpenAI). */
    model?: string;
    /** Optional system-prompt prefix prepended to every chat completion. */
    jailbreakPrompt?: string;
  };
  comfyui: {
    url: string;
    enabled: boolean;
    defaults: {
      model: string;
      sampler: string;
      scheduler: string;
      steps: number;
      cfg: number;
      width: number;
      height: number;
      batchCount: number;
      denoiseStrength: number;
    };
    examplePrompts: ExamplePrompt[];
    negativePromptDefault: string;
  };
  engine: {
    autoGenerateNpcCards: boolean;
    summaryThreshold: number;
    contextWindowBudget: number;
    dataDirectory?: string;
  };
  appearance: {
    /** Hex color for Narrator label + narrator text. null = use CSS default. */
    narratorColor: string | null;
    /** Hex color for italic *action* text. null = use CSS default. */
    actionColor: string | null;
  };
  tts: {
    enabled: boolean;
    url: string;
    apiKey?: string;
    narratorVoice: string;
    format: 'wav' | 'mp3' | 'flac' | 'opus';
    volume: number;
    autoPlay: boolean;
    speed: number;
  };
}

/**
 * v1.1.35: aligned with server-side shape. Each event now carries a stable
 * `id`, optional `sourceMessageIds` for cascade-invalidation when its source
 * chat message gets edited/deleted, and an optional `stale` flag set when a
 * source message was edited but not deleted.
 */
export interface WorldStateEvent {
  id: string;
  event: string;
  location: string;
  timestamp: string;
  chapter: number;
  /**
   * v1.1.37: server-stamped ISO wall-clock timestamp. Authoritative sort key
   * for the editor and any timeline view — unlike `timestamp` (which the GM
   * may overwrite with free-form narrative time), this is forged server-side
   * and never modified after creation.
   */
  createdAt?: string;
  sourceMessageIds?: string[];
  stale?: boolean;
}

export interface WorldState {
  events: WorldStateEvent[];
  locationStates: Record<string, string>;
}

export interface GameSnapshot {
  config: GameConfig;
  world: WorldInfo;
  player: PlayerCharacter;
  characters: NPCCharacter[];
  worldState: WorldState;
}

export type ImageMode = 'txt2img' | 'img2img' | 'inpaint';

export interface GenerationRequest {
  prompt: string;
  negativePrompt: string;
  settings: Partial<ImageSettings>;
  batchCount?: number;
}

export interface Img2ImgRequest extends GenerationRequest {
  sourceImageId?: string;
  sourceImageData?: string; // base64
  denoiseStrength: number;
}

export interface InpaintRequest extends Img2ImgRequest {
  maskData: string; // base64 black/white mask
}
