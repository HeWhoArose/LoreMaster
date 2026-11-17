// ============================================================================
// Corvus Story Core — Type Definitions
// ============================================================================

export interface GameConfig {
  id: string;
  name: string;
  genre: string;
  description: string;
  createdAt: string;
  lastPlayedAt: string;
  settingsOverrides?: Partial<LMStudioSettings>;
}

export interface WorldInfo {
  setting: string;
  tone: string;
  rules: string;
  customInstructions: string;
  currencyName: string;
  era: string;
  /**
   * When false, the storyteller is forbidden from emitting [Narrator] blocks —
   * the response must come entirely from [Character: …] blocks. Defaults to true
   * (or undefined) for backward compatibility with existing games.
   */
  narratorEnabled?: boolean;
}

export interface PlayerAbility {
  name: string;
  description: string;
  type: string;
  level: number;
}

export interface PlayerInventoryItem {
  name: string;
  description: string;
  quantity: number;
}

export interface PlayerRelationship {
  name: string;
  disposition: string;
  notes: string;
}

export interface PlayerCharacter {
  name: string;
  backstory: string;
  appearance: string;
  stats: Record<string, number>;
  /**
   * The world's primary/default currency. Kept as a singular field for
   * backward compatibility — every save file since v1.0 has it. New games
   * and the GM still treat this as the default "money" target when no
   * specific currency name is named.
   */
  money: { currencyName: string; amount: number };
  /**
   * Additional currencies. v1.1.38 — settings like wuxia / cultivation stories
   * need multiple denominations (silver / gold / copper coins, low / mid /
   * high grade spirit stones, faction tokens, etc.) that the single `money`
   * field couldn't express. Keys are the human-readable currency name as the
   * user or the GM wrote it (case-preserving, but case-insensitive for
   * matching — see `findCurrencyKey` in stateManager). Values are integer or
   * decimal amounts. Empty object on a fresh game; populated lazily as the
   * user or GM introduces non-primary currencies.
   */
  extraCurrencies?: Record<string, number>;
  abilities: PlayerAbility[];
  inventory: PlayerInventoryItem[];
  relationships: Record<string, PlayerRelationship>;
}

export interface NPCMemoryEntry {
  /**
   * Stable id used to target individual entries for edit / delete and for
   * cascade-invalidation when source messages change. Auto-generated for any
   * legacy entry that doesn't have one on first read.
   */
  id: string;
  chapter: number;
  event: string;
  /**
   * Optional list of ChatMessage ids that produced this memory. Populated when
   * the Game Master emits the memory as part of a turn (we tag it with the
   * user+assistant message ids from that turn). Memories the user adds by
   * hand have an empty array — they aren't auto-invalidated by chat edits.
   */
  sourceMessageIds?: string[];
  /**
   * Set true when a source message has been edited since the memory was
   * created — the memory may no longer reflect what actually happened in the
   * story. UI surfaces this with a badge so the user can review / fix / drop.
   * Manual user edits clear the flag.
   */
  stale?: boolean;
  /** ISO timestamp the memory was created. Optional for back-compat. */
  createdAt?: string;
}

export interface NPCImageData {
  /**
   * Full default portrait prompt (booru tags). Used directly as the prompt
   * when generating a fresh portrait. May include outfit + setting + lighting
   * since it's the "canonical" rendering of the character.
   */
  basePrompt: string;
  /**
   * Distilled core-identity tags only — hair, eyes, body, ethnicity,
   * distinguishing marks. NO outfit, NO setting, NO lighting, NO quality tags.
   * Used by the image assistant when generating new scenes so it can carry
   * the character's identity without bleeding outfit / pose / setting from the
   * default portrait prompt.
   */
  coreAppearance: string;
  /**
   * Canonical outfit tags (booru-style, comma separated). Used by the image
   * assistant to anchor what the character is wearing in new scenes when the
   * user doesn't specify an alternative outfit. NO identity tags, NO setting,
   * NO lighting — outfit + accessories only. e.g.
   *   "dark green hooded cloak, leather harness, brown gloves, silver pendant"
   * Optional — missing/empty means the image assistant falls back to whatever
   * appearance/basePrompt details it can mine. (v1.1.25)
   */
  defaultOutfit?: string;
  baseNegative: string;
  lastPrompt: string | null;
  lastSeed: number | null;
  /**
   * Stable seed used to lock this character's identity across generations.
   * Set to the seed of a portrait the user likes (typically the first good
   * one); future single-subject generations of this NPC can re-use it to
   * keep face/body recognizable. Distinct from `lastSeed` (which always
   * reflects the most recent generation, even if it was bad).
   * `null` = unlocked, generator picks random seed.
   */
  identitySeed: number | null;
  portraitPath: string | null;
}

/**
 * Lifecycle state of an NPC in the game world.
 *   - 'active'   : full participant. Storyteller can voice them; full profile in
 *                  context. Default for legacy data and characters the user creates
 *                  by hand.
 *   - 'pending'  : awaiting user approval. Created by the Game Master mid-turn but
 *                  the user hasn't confirmed they want this NPC in the world yet.
 *                  Filtered out of storyteller context entirely (model can't voice
 *                  or reference them). UI shows an Approve/Deny prompt.
 *   - 'disabled' : user-archived. The model still knows they exist (lean one-line
 *                  reference: name + revealedName + short description) so other
 *                  characters can mention them, but the storyteller WILL NOT voice
 *                  them. Used when a character is geographically/narratively far
 *                  from the current scene and shouldn't keep popping up.
 * Optional on the type for back-compat with saves from before v1.1.28; normalizer
 * backfills to 'active' on first read.
 */
export type NPCStatus = 'active' | 'pending' | 'disabled';

export interface NPCCharacter {
  id: string;
  name: string;
  revealedName: string | null;
  /**
   * Lifecycle status. See `NPCStatus`. Defaults to 'active' for legacy data
   * via the normalizer (so existing saves don't suddenly hide all NPCs).
   */
  status?: NPCStatus;
  appearance: string;
  personality: string;
  background: string;
  knownInfo: string;
  dispositionTowardPlayer: string;
  memory: NPCMemoryEntry[];
  voiceStyle: string;
  /**
   * Per-NPC text-to-speech config. When undefined, the NPC's lines play in the
   * narrator voice (if TTS is on at all). Setting `enabled: false` silences
   * this NPC even when narrator TTS is otherwise playing their tagged lines.
   */
  tts?: {
    enabled: boolean;
    /** Chatterbox voice id. Blank → narrator voice. */
    voice: string;
  };
  /**
   * Optional hex color (e.g. "#60a5fa") used to tint this character's speaker
   * label and dialogue in the chat UI. When null/undefined, the UI derives a
   * stable per-character color from the NPC id so every character looks
   * visually distinct out of the box.
   */
  chatColor?: string | null;
  /**
   * Optional hex color used to tint this character's *action* / italic text.
   * When null/undefined, falls back to the global `appearance.actionColor`,
   * then to the default `.action-text` CSS class.
   */
  actionColor?: string | null;
  image: NPCImageData;
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
  modelParams?: { temperature: number; topP: number; seed?: number };
  contextSnapshotId?: string;
  alternatives?: ChatMessageAlternative[];
  chapter?: number;
  summarized?: boolean;
}

export interface GameMasterStatChange {
  field: string;
  operation: 'set' | 'add' | 'subtract';
  value: number;
  reason: string;
}

export interface GameMasterNewItem {
  name: string;
  description: string;
  quantity: number;
}

export interface GameMasterRemovedItem {
  name: string;
  quantity: number;
}

export interface GameMasterRelationshipUpdate {
  id: string;
  disposition: string;
  notes: string;
  revealedName?: string;
}

export interface GameMasterWorldStateUpdate {
  event: string;
  location: string;
  timestamp: string;
}

export interface GameMasterCharacterUpdate {
  id: string;
  [key: string]: any;
}

/**
 * v1.1.38: GM output for changing a specific named currency. Allows the
 * storyteller to emit changes like `{name: "silver", operation: "add",
 * value: 30}` rather than overloading the single `money` field. Matched
 * against the primary `money.currencyName` and `extraCurrencies` keys
 * case-insensitively in `applyCurrencyChange`. A currency name the GM
 * uses for the first time gets a new `extraCurrencies` entry.
 */
export interface GameMasterCurrencyChange {
  name: string;
  operation: 'set' | 'add' | 'subtract';
  value: number;
  reason?: string;
}

export interface GameMasterOutput {
  statChanges: GameMasterStatChange[];
  newItems: GameMasterNewItem[];
  removedItems: GameMasterRemovedItem[];
  relationshipUpdates: GameMasterRelationshipUpdate[];
  newCharacters: Array<Partial<NPCCharacter>>;
  worldStateUpdates: GameMasterWorldStateUpdate[];
  characterUpdates: GameMasterCharacterUpdate[];
  /**
   * v1.1.38: optional list of named currency changes. Old GM outputs that
   * predate this field simply don't include it; stateManager treats missing
   * / non-array as empty. Use this in preference to `statChanges` with
   * field="money" when the story involves more than one currency type.
   */
  currencyChanges?: GameMasterCurrencyChange[];
}

export interface WorldStateEvent {
  /**
   * Stable uuid. Added in v1.1.35 so events become individually addressable
   * for cascade-invalidation and (in v1.1.36) for the world-state editor UI.
   * Migration: events loaded from disk without an id get one stamped on read
   * by fileManager.getWorldState.
   */
  id: string;
  event: string;
  location: string;
  /**
   * In-fiction timestamp string as the GM wrote it. Free-form — the model is
   * allowed to write narrative time like "Day 3, evening" here, which is why
   * this field is unreliable as a sort key. Use `createdAt` for ordering.
   */
  timestamp: string;
  chapter: number;
  /**
   * Authoritative wall-clock ISO timestamp stamped server-side at event
   * creation time. v1.1.37. Unlike `timestamp` (which the LLM may overwrite
   * with narrative-time strings like "Day 3, evening"), this is forged by the
   * server and never modified. Used as the timeline sort key in the editor and
   * anywhere else ordering matters.
   *
   * Migration: events loaded from disk without `createdAt` get one minted by
   * `fileManager.getWorldState` — preferring a parseable `timestamp` if the
   * GM happened to write a real ISO date, otherwise falling back to a
   * synthetic value derived from the event's index in the on-disk array so
   * the original append order is preserved within a chapter.
   */
  createdAt?: string;
  /**
   * Chat message ids that produced this event. Added in v1.1.35; mirrors the
   * NPC-memory cascade plumbing from v1.1.22. Empty array = user-added or
   * legacy (pre-v1.1.35) event — never auto-touched by message edit/delete.
   */
  sourceMessageIds?: string[];
  /**
   * Set when a source message has been edited (but not deleted) since this
   * event was recorded. The event stays in the file so the user can review
   * and either edit it themselves (which clears stale) or delete it. The
   * context-block renderer marks stale events visibly so the storyteller
   * deprioritizes them. v1.1.35.
   */
  stale?: boolean;
}

export interface WorldState {
  events: WorldStateEvent[];
  locationStates: Record<string, string>;
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

export interface LMStudioSettings {
  url: string;
  defaultModel: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  /**
   * Optional bearer token sent as `Authorization: Bearer <apiKey>`.
   * Required for OpenAI proper and most hosted vLLM deployments; left blank
   * for plain local LM Studio (which doesn't enforce auth).
   */
  apiKey?: string;
  /**
   * Optional explicit model name to send in the request body. LM Studio
   * ignores `model` and just uses whatever is currently loaded, but vLLM and
   * OpenAI require a specific model id. Left blank → omit the field (LM
   * Studio behavior preserved).
   */
  model?: string;
  /**
   * Optional prompt prepended as an additional system message at index 0 of
   * EVERY chat completion request — storytelling, game-master extraction,
   * summarization, design-with-AI flows, image-chat, etc. Used to override
   * default model behavior ("jailbreak") or stamp a global persona across
   * the whole app. Blank → no extra message is prepended.
   */
  jailbreakPrompt?: string;
}

export interface ComfyUIExamplePrompt {
  label: string;
  prompt: string;
  negative: string;
}

export interface ComfyUIDefaults {
  model: string;
  sampler: string;
  scheduler: string;
  steps: number;
  cfg: number;
  width: number;
  height: number;
  batchCount: number;
  denoiseStrength: number;
}

export interface ComfyUISettings {
  url: string;
  enabled: boolean;
  defaults: ComfyUIDefaults;
  examplePrompts: ComfyUIExamplePrompt[];
  negativePromptDefault: string;
}

export interface EngineSettings {
  autoGenerateNpcCards: boolean;
  summaryThreshold: number;
  contextWindowBudget: number;
}

/**
 * Visual customization for chat rendering. All colors are hex strings.
 * When a value is null, the UI falls back to its default CSS class.
 */
export interface AppearanceSettings {
  /** Color used for the Narrator speaker label and narrator-tagged text. */
  narratorColor: string | null;
  /** Color used for italicized *action* text inside any message. */
  actionColor: string | null;
}

/**
 * Text-to-speech configuration. Targets any HTTP server exposing the
 * chatterbox-tts-api shape (OpenAI-compatible /v1/audio/speech + /v1/voices).
 * Disabled by default — the client UI never makes audio requests until the
 * user flips `enabled` on.
 */
export interface TTSSettings {
  /** Master switch. When false, the client never calls the TTS server. */
  enabled: boolean;
  /** Base URL of the Chatterbox server, e.g. "http://localhost:4123". */
  url: string;
  /**
   * Optional bearer token sent as `Authorization: Bearer <apiKey>`. Most
   * local Chatterbox setups don't enforce auth.
   */
  apiKey?: string;
  /**
   * Voice name used for narration and any speaker the client can't match to
   * an NPC. Must be one of the voices the server reports via /v1/voices.
   * Blank → the server's default voice.
   */
  narratorVoice: string;
  /** Audio response format — chatterbox-tts-api supports wav, mp3, flac, opus. */
  format: 'wav' | 'mp3' | 'flac' | 'opus';
  /** Master volume 0.0 – 1.0. Applied client-side via HTMLAudioElement.volume. */
  volume: number;
  /**
   * When true, the client auto-enqueues TTS for each new storyteller turn as
   * soon as the stream finishes. When false, the user manually clicks Play
   * on individual messages.
   */
  autoPlay: boolean;
  /** Playback speed (0.5 – 2.0). Forwarded as the `speed` field in the request body. */
  speed: number;
}

export interface GlobalConfig {
  lmStudio: LMStudioSettings;
  comfyui: ComfyUISettings;
  engine: EngineSettings;
  appearance: AppearanceSettings;
  tts: TTSSettings;
  dataDirectory: string;
}

// ============================================================================
// Runtime request/response shapes
// ============================================================================

// OpenAI vision-style content parts. Used when sending images alongside text.
export type ChatCompletionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface ChatCompletionMessage {
  role: 'system' | 'user' | 'assistant';
  /**
   * Either a plain string (standard chat) or an array of content parts
   * (multimodal — used when sending an image to a vision-capable model).
   */
  content: string | ChatCompletionContentPart[];
}

export interface ChatCompletionRequest {
  model?: string;
  messages: ChatCompletionMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  seed?: number;
  stream?: boolean;
}

export interface AssembledContext {
  systemPrompt: string;
  messages: ChatCompletionMessage[];
  estimatedTokens: number;
  includedNpcIds: string[];
  includedSummaryIds: string[];
  includedMessageIds: string[];
}

export interface StateChangeSummary {
  statChanges: string[];
  inventoryChanges: string[];
  relationshipChanges: string[];
  newCharacters: string[];
  worldEvents: string[];
}

export interface Summary {
  id: string;
  chapter: number;
  fromMessageId: string;
  toMessageId: string;
  content: string;
  createdAt: string;
}
