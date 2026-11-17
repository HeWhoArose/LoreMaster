import { ChatCompletionMessage, ChatMessage, GameMasterOutput } from '../types/index.js';
import { getFileManager } from './fileManager.js';
import { chatCompletion } from './lmStudio.js';
import { logger } from './logger.js';

const MOD = 'gameMaster';

const GM_SYSTEM_PROMPT = `You are the hidden GAME MASTER of an interactive story. You never speak to the player.
Your ONLY job is to read the most recent exchange between the player and the story response, and emit a structured JSON object describing any state changes that should happen.

You MUST respond with a single JSON object and NOTHING ELSE. No prose, no markdown, no code fences.

The JSON schema is:
{
  "statChanges": [{ "field": string, "operation": "set" | "add" | "subtract", "value": number, "reason": string }],
  "newItems": [{ "name": string, "description": string, "quantity": number }],
  "removedItems": [{ "name": string, "quantity": number }],
  "relationshipUpdates": [{ "id": string, "disposition": string, "notes": string, "revealedName": string | null }],
  "newCharacters": [ {
    "id": string,
    "name": string,
    "revealedName": string | null,
    "appearance": string,
    "personality": string,
    "background": string,
    "knownInfo": string,
    "dispositionTowardPlayer": string,
    "voiceStyle": string,
    "image": {
      "basePrompt": "comma-separated stable-diffusion tags — see IMAGE PROMPT RULES below",
      "baseNegative": "comma-separated negative tags — start from the default negative and add anything wrong-looking for THIS character"
    }
  } ],
  "worldStateUpdates": [{ "event": string, "location": string, "timestamp": string }],
  "characterUpdates": [{ "id": string, "knownInfo": string, "dispositionTowardPlayer": string }],
  "currencyChanges": [{ "name": string, "operation": "set" | "add" | "subtract", "value": number, "reason": string }]
}

IMAGE PROMPT RULES (for image.basePrompt on each new character — critical, get this right):
- Comma-separated tags / short phrases, NOT prose. Each clause should be 1–5 words.
- Aim for 25–60 tags. Front-load the most important features. Suggested order:
   1. Quality / style anchors (mirror the user's example prompts shown in context, e.g. "masterpiece, best quality, highly detailed")
   2. Subject anchor (e.g. "1girl, portrait of a young woman", "upper body shot of a grizzled man")
   3. Face: ethnicity, age, eye color, eye shape, eyebrows, distinguishing marks
   4. Hair: color, length, style, texture
   5. Body / build (if implied by the scene)
   6. Clothing top-down: each garment as its own tag with color + material (e.g. "black leather jacket", "white linen shirt", "silver pendant necklace")
   7. Accessories: "round wire-rim glasses", "gold hoop earrings"
   8. Pose / expression: "slight smile", "looking at viewer", "three-quarter view"
   9. Lighting / atmosphere: "warm rim light", "cinematic lighting"
  10. Background: a short scene tag matching the world (e.g. "dungeon background", "forest clearing")
- Be SPECIFIC about colors and materials. "red shirt" is bad; "crimson silk button-up shirt" is good.
- Mirror the user's EXAMPLE PROMPTS (shown in context) for tag style, length, and quality keywords.
- Never include the character's name in basePrompt — the prompt should reproduce the look, not the identity.
- Do not put quality, NSFW, or anatomy-error tags in basePrompt — those belong in baseNegative.
- For baseNegative: start from the DEFAULT NEGATIVE shown in context and append anything specifically wrong-looking for this character.

General guidelines:
- Use "stats" field names exactly as they appear on the player card (e.g. "health", "stamina"). Stats are for HP / stamina / mana / etc. — NOT for currency.
- For ANY currency change (gold, silver, copper, spirit stones, credits, etc.), use "currencyChanges" — NOT statChanges. Match the 'name' exactly as the currency appears on the player card (case-insensitive). If the player gains a currency they don't currently hold (e.g. their first silver coin), use the new currency name and a new entry will be created automatically. Do NOT lump several denominations into the primary "money" balance — emit one currencyChanges entry per denomination.
- Only emit changes that are CLEARLY implied by what happened. If nothing changed, return all empty arrays.
- For new NPCs: only create one if they are a NEW, named (or nicknamed) individual the player actually encountered. Give them a stable id (slug of their name, lowercase, hyphens).
- CRITICAL — DO NOT RE-PROPOSE EXISTING NPCs. If a character whose id OR name already appears in KNOWN NPCs walks back into the scene, that is NOT a newCharacters entry — they already exist. To update them (new info revealed, disposition shifted), use characterUpdates with their existing id. Re-proposing an existing NPC will be silently dropped by the server.
- If you are unsure whether someone is new, check KNOWN NPCs first. Match by name case-insensitively as well as by id — the same person should never have two cards.
- ALWAYS fill in image.basePrompt and image.baseNegative for new NPCs — they are required.
- For relationship updates: the id MUST match an existing or newly-created NPC's id.
- Keep reasons short.
- Never include dialogue, narration, or commentary in this JSON.`;

/**
 * Call LM Studio (non-streaming) to extract state changes from the most recent exchange.
 */
export async function runGameMaster(
  gameId: string,
  userMessage: ChatMessage,
  assistantMessage: ChatMessage
): Promise<GameMasterOutput> {
  const fm = getFileManager();
  const player = fm.getPlayer(gameId);
  const world = fm.getWorld(gameId);
  // (v1.1.28) The Game Master only emits memory/disposition/state updates
  // for ACTIVE NPCs. Pending NPCs aren't real yet (awaiting user approval),
  // and disabled NPCs are off-screen — we don't want the GM proposing patches
  // for them. (v1.1.31) But the GM DOES need to know they exist by name, so
  // it doesn't re-propose them as a `newCharacters` entry and trigger the
  // collision guard. We list pending/disabled in a separate "NAMES IN USE"
  // line below.
  const allNpcs = fm.listCharacters(gameId);
  const npcs = allNpcs.filter((n) => (n.status ?? 'active') === 'active');
  const inactiveNpcs = allNpcs.filter((n) => (n.status ?? 'active') !== 'active');

  const contextLines: string[] = [];
  if (world) {
    contextLines.push(`WORLD: ${world.setting} | Tone: ${world.tone} | Currency: ${world.currencyName}`);
  }
  if (player) {
    contextLines.push(`PLAYER: ${player.name}`);
    contextLines.push(`Stats: ${JSON.stringify(player.stats)}`);
    // v1.1.38: show every currency the player holds so the GM knows which
    // name to use in currencyChanges (and doesn't accidentally invent a new
    // denomination when they meant an existing one). Format: primary first,
    // then extras as `name: amount` pairs.
    const currencyParts: string[] = [];
    if (player.money) {
      currencyParts.push(`${player.money.currencyName}: ${player.money.amount}`);
    }
    if (player.extraCurrencies) {
      for (const [name, amt] of Object.entries(player.extraCurrencies)) {
        currencyParts.push(`${name}: ${amt}`);
      }
    }
    contextLines.push(`Currencies: ${currencyParts.join(', ') || '(none)'}`);
    contextLines.push(`Inventory: ${player.inventory.map((i) => `${i.name} x${i.quantity}`).join(', ') || '(empty)'}`);
  }
  if (npcs.length > 0) {
    contextLines.push('KNOWN NPCs (id — name — disposition):');
    for (const n of npcs) {
      contextLines.push(`  ${n.id} — ${n.revealedName || n.name} — ${n.dispositionTowardPlayer}`);
    }
  }
  // v1.1.31: Names already taken by pending/disabled NPCs — don't propose new
  // NPCs with these names; they already exist (just not currently active).
  if (inactiveNpcs.length > 0) {
    contextLines.push('NAMES IN USE (do not propose new NPCs with these names):');
    for (const n of inactiveNpcs) {
      contextLines.push(`  ${n.revealedName || n.name} (status: ${n.status})`);
    }
  }

  // Inject user's preferred prompt style so any new NPCs get image prompts
  // that match the rest of their gallery.
  const cfg = fm.getConfig();
  const examples = (cfg.comfyui?.examplePrompts || []).slice(0, 3);
  if (examples.length > 0) {
    const exampleBlock = examples
      .map((ex, i) => {
        const label = ex.label ? ` (${ex.label})` : '';
        return `  ${i + 1}.${label}: ${ex.prompt}`;
      })
      .join('\n');
    contextLines.push(`\nEXAMPLE PROMPTS (mirror tag style/length/quality keywords for new NPC image.basePrompt):\n${exampleBlock}`);
  }
  const defaultNeg = (cfg.comfyui?.negativePromptDefault || '').trim();
  if (defaultNeg) {
    contextLines.push(`\nDEFAULT NEGATIVE (use as base for image.baseNegative):\n${defaultNeg}`);
  }

  const exchange = `PLAYER: ${userMessage.content}\n\nRESPONSE: ${assistantMessage.content}`;

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: GM_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `${contextLines.join('\n')}\n\nMost recent exchange:\n\n${exchange}\n\nEmit the JSON now.`,
    },
  ];

  // Give thinking models enough headroom — they burn tokens on reasoning
  // before emitting the JSON. Use at least 4096 or the user's configured max.
  const gmMaxTokens = Math.max(4096, cfg.lmStudio.maxTokens);
  logger.info(MOD, `runGameMaster: using maxTokens=${gmMaxTokens} (config=${cfg.lmStudio.maxTokens})`);
  const { content } = await chatCompletion(messages, {
    temperature: 0.2,
    maxTokens: gmMaxTokens,
  });

  return parseGameMasterOutput(content);
}

/**
 * Strip inline thinking tags that some models wrap around their reasoning.
 * Examples: <think>...</think>, <reasoning>...</reasoning>
 */
function stripThinkingTags(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, '');
  cleaned = cleaned.replace(/<thought[^>]*>[\s\S]*?<\/thought>/gi, '');
  cleaned = cleaned.trim();
  // If stripping removed everything, the JSON might be inside the tags
  if (!cleaned) {
    const insideThink = text.match(/<think[^>]*>([\s\S]*?)<\/think>/i)?.[1] ?? '';
    const jsonInside = insideThink.match(/\{[\s\S]*\}/)?.[0];
    if (jsonInside) return jsonInside;
    return text;
  }
  return cleaned;
}

/**
 * Lenient JSON parsing: strip code fences, hunt for a JSON object, fall back to empty.
 */
export function parseGameMasterOutput(raw: string): GameMasterOutput {
  const empty: GameMasterOutput = {
    statChanges: [],
    newItems: [],
    removedItems: [],
    relationshipUpdates: [],
    newCharacters: [],
    worldStateUpdates: [],
    characterUpdates: [],
  };
  if (!raw) return empty;

  let cleaned = stripThinkingTags(raw).trim();
  // Strip ```json ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  // Find the first { and last }
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return empty;
  cleaned = cleaned.slice(first, last + 1);

  try {
    const parsed = JSON.parse(cleaned);
    return {
      statChanges: Array.isArray(parsed.statChanges) ? parsed.statChanges : [],
      newItems: Array.isArray(parsed.newItems) ? parsed.newItems : [],
      removedItems: Array.isArray(parsed.removedItems) ? parsed.removedItems : [],
      relationshipUpdates: Array.isArray(parsed.relationshipUpdates) ? parsed.relationshipUpdates : [],
      newCharacters: Array.isArray(parsed.newCharacters) ? parsed.newCharacters : [],
      worldStateUpdates: Array.isArray(parsed.worldStateUpdates) ? parsed.worldStateUpdates : [],
      characterUpdates: Array.isArray(parsed.characterUpdates) ? parsed.characterUpdates : [],
    };
  } catch (err) {
    logger.warn(MOD, `Failed to parse GM output: ${(err as Error).message}`);
    return empty;
  }
}
