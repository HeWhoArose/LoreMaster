import {
  AssembledContext,
  ChatCompletionMessage,
  ChatMessage,
  NPCCharacter,
  PlayerCharacter,
  Summary,
  WorldInfo,
  WorldState,
} from '../types/index.js';
import { getFileManager } from './fileManager.js';

/**
 * Estimate token count: ~4 chars ≈ 1 token (rough approximation used widely).
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(msg: ChatCompletionMessage): number {
  // +4 token overhead per message (matches OpenAI's counting heuristic)
  if (typeof msg.content === 'string') {
    return estimateTokens(msg.content) + 4;
  }
  // Vision content array — count text parts; image parts are roughly 85+ tokens.
  let total = 4;
  for (const part of msg.content) {
    if (part.type === 'text') total += estimateTokens(part.text);
    else if (part.type === 'image_url') total += 130; // rough average for a 'high' detail image
  }
  return total;
}

export interface AssembleOptions {
  agentSystemPrompt: string;
  mentionedNpcIds?: string[];
  activeCharacterId?: string;
  // Reserve tokens for the model's generated response so we don't blow through the budget.
  reservedResponseTokens?: number;
}

/**
 * Build a context window for the LLM within the configured token budget.
 *
 * Order of inclusion (highest priority first — dropped last if over budget):
 *   1. Agent system prompt
 *   2. World info block
 *   3. Player card
 *   4. Relevant NPC cards (active + mentioned + recently-seen)
 *   5. World state (recent events)
 *   6. Chapter summaries
 *   7. Recent chat messages (newest first, walked backwards until budget exhausted)
 */
export function assembleContext(gameId: string, opts: AssembleOptions): AssembledContext {
  const fm = getFileManager();
  const cfg = fm.getConfig();
  const budget = cfg.engine.contextWindowBudget;
  const reserved = opts.reservedResponseTokens ?? cfg.lmStudio.maxTokens ?? 1024;
  const availableForPrompt = Math.max(512, budget - reserved);

  const world = fm.getWorld(gameId);
  const player = fm.getPlayer(gameId);
  // (v1.1.28) Filter out 'pending' NPCs entirely — they haven't been approved
  // by the user yet, so the storyteller must not see, voice, or reference them.
  // 'disabled' NPCs stay in the pool here and get a LEAN block downstream so
  // the model knows they exist (other characters can mention them) without
  // wasting context tokens on their full profile.
  const allNpcsRaw = fm.listCharacters(gameId);
  const allNpcs = allNpcsRaw.filter((n) => (n.status ?? 'active') !== 'pending');
  const worldState = fm.getWorldState(gameId);
  const summaries = fm.listSummaries(gameId);
  const allMessages = fm.getAllMessages(gameId);

  // ---- 1. System prompt ----
  const systemSections: string[] = [opts.agentSystemPrompt];

  // ---- 2. World block ----
  if (world) {
    systemSections.push(buildWorldBlock(world));
  }

  // ---- 3. Player card ----
  if (player) {
    systemSections.push(buildPlayerBlock(player));
  }

  // ---- 4. Relevant NPC cards ----
  const includedNpcIds: string[] = [];
  const relevantNpcs = pickRelevantNpcs(
    allNpcs,
    allMessages,
    opts.activeCharacterId,
    opts.mentionedNpcIds || []
  );
  for (const npc of relevantNpcs) {
    // Disabled NPCs get a one-line reference so the model knows they exist
    // but won't try to voice them or burn tokens on their full profile. Full
    // profile only for active NPCs. (v1.1.28)
    if ((npc.status ?? 'active') === 'disabled') {
      systemSections.push(buildNpcLeanBlock(npc));
    } else {
      systemSections.push(buildNpcBlock(npc));
    }
    includedNpcIds.push(npc.id);
  }

  // ---- 5. Recent world state ----
  if (worldState && worldState.events.length > 0) {
    systemSections.push(buildWorldStateBlock(worldState));
  }

  // ---- 6. Summaries ----
  const includedSummaryIds: string[] = [];
  for (const s of summaries) {
    systemSections.push(buildSummaryBlock(s));
    includedSummaryIds.push(s.id);
  }

  let systemPrompt = systemSections.join('\n\n');
  let systemTokens = estimateTokens(systemPrompt);

  // If system prompt alone exceeds budget, drop summaries first, then world state, then extra NPCs.
  if (systemTokens > availableForPrompt) {
    // Drop summaries from the oldest until under budget
    while (includedSummaryIds.length > 0 && systemTokens > availableForPrompt) {
      includedSummaryIds.shift();
      systemPrompt = rebuildSystemPrompt(opts.agentSystemPrompt, world, player, relevantNpcs, worldState, summaries.filter(s => includedSummaryIds.includes(s.id)));
      systemTokens = estimateTokens(systemPrompt);
    }
    // Drop NPCs from the end (least relevant) if still over
    while (includedNpcIds.length > 1 && systemTokens > availableForPrompt) {
      includedNpcIds.pop();
      const keptNpcs = relevantNpcs.filter((n) => includedNpcIds.includes(n.id));
      systemPrompt = rebuildSystemPrompt(
        opts.agentSystemPrompt,
        world,
        player,
        keptNpcs,
        worldState,
        summaries.filter((s) => includedSummaryIds.includes(s.id))
      );
      systemTokens = estimateTokens(systemPrompt);
    }
  }

  // ---- 7. Recent messages ----
  const messages: ChatCompletionMessage[] = [{ role: 'system', content: systemPrompt }];
  let running = systemTokens + 4;

  // Walk backwards through messages, pushing onto a temporary stack, stopping when we hit the budget
  const includedMessageIds: string[] = [];
  const recent: ChatCompletionMessage[] = [];
  const unsummarized = allMessages.filter((m) => !m.summarized);

  // Group consecutive assistant messages that came from the same generation
  // (same timestamp) into a single tagged turn so the model sees its own past
  // output in the [Narrator] / [Character: Name] format that the system prompt
  // demands. Otherwise the assistant history is a stream of untagged blobs and
  // the model stops emitting tags after a few turns.
  const grouped: { msgs: ChatMessage[]; ids: string[] }[] = [];
  for (const m of unsummarized) {
    const last = grouped[grouped.length - 1];
    const canMerge =
      last &&
      m.role === 'assistant' &&
      last.msgs[0].role === 'assistant' &&
      last.msgs[0].timestamp === m.timestamp;
    if (canMerge) {
      last.msgs.push(m);
      last.ids.push(m.id);
    } else {
      grouped.push({ msgs: [m], ids: [m.id] });
    }
  }

  for (let i = grouped.length - 1; i >= 0; i--) {
    const g = grouped[i];
    const asCompletionMsg = groupToCompletionMessage(g.msgs, allNpcs);
    if (!asCompletionMsg) continue;
    const cost = estimateMessageTokens(asCompletionMsg);
    if (running + cost > availableForPrompt) break;
    recent.unshift(asCompletionMsg);
    for (let j = g.ids.length - 1; j >= 0; j--) includedMessageIds.unshift(g.ids[j]);
    running += cost;
  }

  messages.push(...recent);

  return {
    systemPrompt,
    messages,
    estimatedTokens: running,
    includedNpcIds,
    includedSummaryIds,
    includedMessageIds,
  };
}

function rebuildSystemPrompt(
  agentPrompt: string,
  world: WorldInfo | null,
  player: PlayerCharacter | null,
  npcs: NPCCharacter[],
  worldState: WorldState | null,
  summaries: Summary[]
): string {
  const sections: string[] = [agentPrompt];
  if (world) sections.push(buildWorldBlock(world));
  if (player) sections.push(buildPlayerBlock(player));
  for (const n of npcs) sections.push(buildNpcBlock(n));
  if (worldState && worldState.events.length > 0) sections.push(buildWorldStateBlock(worldState));
  for (const s of summaries) sections.push(buildSummaryBlock(s));
  return sections.join('\n\n');
}

// ----------------------------------------------------------------------------
// Block builders
// ----------------------------------------------------------------------------

export function buildWorldBlock(w: WorldInfo): string {
  const lines: string[] = ['# WORLD'];
  if (w.setting) lines.push(`Setting: ${w.setting}`);
  if (w.era) lines.push(`Era: ${w.era}`);
  if (w.tone) lines.push(`Tone: ${w.tone}`);
  if (w.currencyName) lines.push(`Currency: ${w.currencyName}`);
  if (w.rules) lines.push(`Rules:\n${w.rules}`);
  if (w.customInstructions) lines.push(`Additional instructions:\n${w.customInstructions}`);
  return lines.join('\n');
}

export function buildPlayerBlock(p: PlayerCharacter): string {
  const lines: string[] = ['# PLAYER CHARACTER', `Name: ${p.name}`];
  if (p.appearance) lines.push(`Appearance: ${p.appearance}`);
  if (p.backstory) lines.push(`Backstory: ${p.backstory}`);

  if (p.stats && Object.keys(p.stats).length > 0) {
    const statLine = Object.entries(p.stats)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    lines.push(`Stats: ${statLine}`);
  }
  if (p.money) {
    lines.push(`Money: ${p.money.amount} ${p.money.currencyName}`);
  }
  // v1.1.38: surface secondary currencies so the storyteller knows what
  // denominations are in play. Skipped silently when the map is empty so the
  // block doesn't get noisier for games with a single currency.
  if (p.extraCurrencies && Object.keys(p.extraCurrencies).length > 0) {
    const parts = Object.entries(p.extraCurrencies)
      .map(([name, amt]) => `${amt} ${name}`)
      .join(', ');
    lines.push(`Other currencies: ${parts}`);
  }
  if (p.abilities && p.abilities.length > 0) {
    lines.push('Abilities:');
    for (const a of p.abilities) {
      lines.push(`  - ${a.name} (${a.type}, level ${a.level}): ${a.description}`);
    }
  }
  if (p.inventory && p.inventory.length > 0) {
    lines.push('Inventory:');
    for (const i of p.inventory) {
      lines.push(`  - ${i.name} x${i.quantity}: ${i.description}`);
    }
  }
  if (p.relationships && Object.keys(p.relationships).length > 0) {
    lines.push('Relationships:');
    for (const [id, r] of Object.entries(p.relationships)) {
      lines.push(`  - ${r.name} (${id}): ${r.disposition} — ${r.notes}`);
    }
  }
  return lines.join('\n');
}

/**
 * Compact one-line NPC reference for disabled (user-archived) characters.
 * The storyteller learns they exist (so dialogue from other characters can
 * mention them naturally) but isn't given enough profile to be tempted to
 * voice them, and we don't waste tokens on memories / appearance / etc.
 * (v1.1.28)
 */
export function buildNpcLeanBlock(n: NPCCharacter): string {
  const displayName = n.revealedName || n.name;
  const aka = n.revealedName && n.revealedName !== n.name ? ` (also: ${n.name})` : '';
  // Keep it to ONE sentence — the model only needs enough to reference them.
  const oneLine = n.personality
    ? n.personality.split(/[.\n]/)[0].trim()
    : n.appearance
      ? n.appearance.split(/[.\n]/)[0].trim()
      : '';
  const desc = oneLine ? ` — ${oneLine}` : '';
  return `# NPC (INACTIVE — do not voice or act as them; they may be referenced in dialogue but cannot speak this turn): ${displayName}${aka}${desc} (id: ${n.id})`;
}

export function buildNpcBlock(n: NPCCharacter): string {
  const lines: string[] = [`# NPC: ${n.revealedName || n.name} (id: ${n.id})`];
  if (n.revealedName && n.revealedName !== n.name) lines.push(`Display name: ${n.name}`);
  if (n.appearance) lines.push(`Appearance: ${n.appearance}`);
  if (n.personality) lines.push(`Personality: ${n.personality}`);
  if (n.background) lines.push(`Background: ${n.background}`);
  if (n.knownInfo) lines.push(`What the player knows: ${n.knownInfo}`);
  if (n.dispositionTowardPlayer) lines.push(`Disposition toward player: ${n.dispositionTowardPlayer}`);
  if (n.voiceStyle) lines.push(`Voice style: ${n.voiceStyle}`);
  if (n.memory && n.memory.length > 0) {
    lines.push('Memories:');
    for (const m of n.memory.slice(-5)) {
      lines.push(`  - [Ch.${m.chapter}] ${m.event}`);
    }
  }
  return lines.join('\n');
}

export function buildWorldStateBlock(state: WorldState): string {
  const lines: string[] = ['# WORLD STATE (recent events)'];
  // v1.1.37: pick the 10 most recent events by (chapter desc, createdAt desc)
  // then render them oldest-first so the model reads the timeline forwards.
  // Was: state.events.slice(-10), which assumed array-append-order matches
  // chronological order — fine when only the GM wrote to this file, but the
  // v1.1.36 editor lets the user add events at any moment, so the append tail
  // no longer corresponds to "recent in timeline". Sorting on createdAt fixes
  // the editor case and matches what the editor / InfoPanel display.
  const recent = [...state.events]
    .sort((a, b) => {
      if (a.chapter !== b.chapter) return b.chapter - a.chapter;
      const ka = a.createdAt || a.timestamp || '';
      const kb = b.createdAt || b.timestamp || '';
      if (ka !== kb) return kb.localeCompare(ka);
      return b.id.localeCompare(a.id);
    })
    .slice(0, 10)
    .reverse(); // oldest-first for the model so it reads the timeline forwards
  for (const e of recent) {
    // v1.1.35: prefix stale events with a UNRELIABLE marker so the storyteller
    // deprioritizes them. They stay in the prompt because the user hasn't
    // resolved them yet, but the model is told they may not reflect the
    // current story. Once the user edits or deletes the event, the marker
    // goes away (or the line disappears entirely).
    const marker = e.stale ? ' [UNRELIABLE — source message was edited]' : '';
    lines.push(`- [${e.location} @ ${e.timestamp}]${marker} ${e.event}`);
  }
  if (state.locationStates && Object.keys(state.locationStates).length > 0) {
    lines.push('Location states:');
    for (const [loc, desc] of Object.entries(state.locationStates)) {
      lines.push(`  - ${loc}: ${desc}`);
    }
  }
  return lines.join('\n');
}

export function buildSummaryBlock(s: Summary): string {
  return `# CHAPTER ${s.chapter} SUMMARY\n${s.content}`;
}

// ----------------------------------------------------------------------------
// NPC relevance selection
// ----------------------------------------------------------------------------

function pickRelevantNpcs(
  allNpcs: NPCCharacter[],
  recentMessages: ChatMessage[],
  activeCharacterId?: string,
  mentionedIds: string[] = []
): NPCCharacter[] {
  if (allNpcs.length === 0) return [];

  const scores = new Map<string, number>();
  for (const n of allNpcs) scores.set(n.id, 0);

  if (activeCharacterId && scores.has(activeCharacterId)) {
    scores.set(activeCharacterId, (scores.get(activeCharacterId) || 0) + 100);
  }

  for (const mid of mentionedIds) {
    if (scores.has(mid)) scores.set(mid, (scores.get(mid) || 0) + 50);
  }

  // Score by recent appearance in chat
  const tail = recentMessages.slice(-30);
  for (let i = 0; i < tail.length; i++) {
    const msg = tail[i];
    const proximity = i; // newer messages score higher
    if (msg.characterId && scores.has(msg.characterId)) {
      scores.set(msg.characterId, (scores.get(msg.characterId) || 0) + 10 + proximity);
    }
    // Name mentions in the body
    for (const n of allNpcs) {
      const candidates = [n.name, n.revealedName].filter(Boolean) as string[];
      for (const c of candidates) {
        if (msg.content && msg.content.toLowerCase().includes(c.toLowerCase())) {
          scores.set(n.id, (scores.get(n.id) || 0) + 2 + Math.floor(proximity / 5));
          break;
        }
      }
    }
  }

  const ranked = [...allNpcs]
    .map((n) => ({ npc: n, score: scores.get(n.id) || 0 }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((r) => r.npc);

  return ranked;
}

// ----------------------------------------------------------------------------
// Message conversion
// ----------------------------------------------------------------------------

/**
 * Format a single ChatMessage as a tagged block matching the narrator system
 * prompt's expected output format ([Narrator] / [Character: Name]). This is
 * what the model uses to learn the format from its own past output.
 */
function formatAssistantBlock(msg: ChatMessage, npcs: NPCCharacter[]): string {
  if (msg.type === 'character') {
    let label = 'Character';
    if (msg.characterId) {
      const npc = npcs.find((n) => n.id === msg.characterId);
      const name = npc ? npc.revealedName || npc.name : msg.characterId;
      label = `Character: ${name}`;
    }
    return `[${label}]\n${msg.content}`;
  }
  if (msg.type === 'narrator') {
    return `[Narrator]\n${msg.content}`;
  }
  // 'mixed' (legacy single-block storyteller) or unknown — pass through unchanged.
  return msg.content;
}

export function chatToCompletionMessage(
  msg: ChatMessage,
  npcs: NPCCharacter[] = [],
): ChatCompletionMessage | null {
  if (msg.role === 'system') return { role: 'system', content: msg.content };
  if (msg.role === 'user') return { role: 'user', content: msg.content };
  if (msg.role === 'assistant') {
    return { role: 'assistant', content: formatAssistantBlock(msg, npcs) };
  }
  return null;
}

/**
 * Merge a group of ChatMessages (typically all blocks from one generation)
 * into a single ChatCompletionMessage. For assistant groups, blocks are joined
 * with their speaker tags so the model sees the full tagged turn it produced.
 */
export function groupToCompletionMessage(
  msgs: ChatMessage[],
  npcs: NPCCharacter[] = [],
): ChatCompletionMessage | null {
  if (msgs.length === 0) return null;
  if (msgs.length === 1) return chatToCompletionMessage(msgs[0], npcs);
  const first = msgs[0];
  if (first.role !== 'assistant') {
    // Non-assistant groups shouldn't occur in practice — fall back to single.
    return chatToCompletionMessage(first, npcs);
  }
  const parts = msgs.map((m) => formatAssistantBlock(m, npcs));
  return { role: 'assistant', content: parts.join('\n\n') };
}
