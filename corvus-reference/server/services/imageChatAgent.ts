import { ChatCompletionMessage, ChatMessage, ComfyUIExamplePrompt, NPCCharacter } from '../types/index.js';
import { getFileManager } from './fileManager.js';
import { chatCompletion, chatCompletionStream } from './lmStudio.js';
import { logger } from './logger.js';

const MOD = 'imageChatAgent';

export interface ImageChatRequest {
  gameId: string;
  userMessage: string;
  recentStoryContextCount?: number;
  targetSize?: { width: number; height: number };
}

export interface ImageChatResult {
  /** Final assembled prompt: identity anchors + scene delta. Ready for ComfyUI. */
  prompt: string;
  negativePrompt: string;
  source: 'npc-with-image' | 'npc-card' | 'story-context' | 'clarification-needed' | 'freeform';
  /**
   * Resolved subject NPCs (zero, one, or many). For single-subject scenes the
   * UI can offer identity-seed locking. For multi-subject scenes the UI warns
   * that diffusion models struggle and seed-lock is disabled.
   * `resolvedNpcId` is kept as an alias for the first subject (back-compat).
   */
  subjectNpcIds: string[];
  resolvedNpcId?: string;
  /**
   * Just the scene-delta portion of the prompt (outfit/pose/action/setting/
   * lighting/mood) BEFORE the server prepended identity anchors. Useful for
   * UI display so users can see what the LLM contributed vs. what was auto-
   * locked from the character cards.
   */
  sceneDelta: string;
  /**
   * The identity anchor segment the server prepended (per-subject coreAppearance
   * joined with BREAK separators + count tokens). Empty for pure environment shots.
   */
  identityAnchor: string;
  reasoning: string;
  suggestedLabel?: string;
  clarificationQuestion?: string;
  rawResponse?: string;
  /** Per-subject identity-token repair report (empty if nothing was repaired). */
  repairedTokens?: Array<{ npcId: string; added: string[] }>;
}

const IMAGE_CHAT_SYSTEM_PROMPT = `You are an expert IMAGE PROMPT ENGINEER for **Illustrious SDXL** (arXiv 2409.19946) and its derivatives (NoobAI, Anima, DivingIllustrious, etc) embedded in an interactive story system. Your job: figure out WHO and WHAT belongs in the requested image, then emit structured scene tags. The server deterministically prepends each known subject's identity anchor (coreAppearance) and the canonical Illustrious quality tail, so identity tags and quality words from you are wasted tokens.

=== MENTAL MODEL — how Illustrious reads a prompt ===
Illustrious was trained on danbooru-style tags plus partial natural-language captions. It recognises *tokens* and *tag clusters*, not English. Three consequences:
  • Tags > prose for character/scene anatomy.  "1girl, long hair, blue eyes, red dress, standing" beats "a girl with long hair in a red dress".
  • Prose > tags for relationships and spatial logic.  "leaning on his shoulder, both looking up at the moon" carries relationship semantics tags cannot.
  • Multi-character position binding is the model's weakest area — BREAK blocks + position-as-tag exist to fix this.
  ➡ Use a hybrid "tag-skeleton + prose-glue" style: tags for what IS in the scene, short prose phrases for HOW it relates.

=== CONTEXT YOU GET ===
  • Recent story context (chat history) — MOST AUTHORITATIVE for current outfit, pose, location, lighting.
  • Visual details remembered from earlier (older than the recent window) — use when something was established long ago. Prefer recent if it contradicts.
  • NPC character cards (id, name, appearance, image.coreAppearance, image.defaultOutfit, image.basePrompt) — use to identify WHICH npcs are subjects. Do NOT copy their identity tags into your output.
  • World setting info.
  • Example prompts showing the user's preferred vocabulary / style.

=== RESOLUTION RULES — figure out who/what is in the image ===
  • "show me the current scene" / "draw the scene" / "picture this" → depict what is happening RIGHT NOW in the most recent story messages. subjectNpcIds = every NPC actively present (typically 0–3). source = "story-context".
  • "show me her / him / them" / "show <name>" → portrait of that character. Resolve pronouns from the LAST character mentioned. subjectNpcIds = [that npc's id]. source = "npc-with-image" if they have coreAppearance, otherwise "npc-card".
  • "show <name> doing X" → character + action. subjectNpcIds = [that npc's id]. source = "npc-with-image".
  • "show <A> and <B> <doing X>" / "show them together" → subjectNpcIds = [A.id, B.id] in narrative order. source = "npc-with-image".
  • "show the <place / object>" → environment shot. subjectNpcIds = []. source = "story-context".

ONLY ask for clarification when there is literally NO usable signal. Otherwise pick the most likely interpretation and proceed.

=== WHAT YOU OWN vs. WHAT THE SERVER OWNS ===
The server owns:
  • Count token: "1girl" / "1boy" / "2girls, 1boy" / etc. (do not emit)
  • Identity tokens per subject: ethnicity, hair, eyes, body, marks (from coreAppearance — do not repeat)
  • BREAK separators between per-subject blocks
  • The canonical Illustrious quality tail at the END of the final prompt
      (masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres, ultra-detailed, sharp focus, intricate details, professional illustration)
You own:
  • viewTag — the framing (cowboy shot, full body, upper body, portrait, from above, from behind, dutch angle, pov, close-up, etc). Comes EARLY in Illustrious prompts — put it here, not in the scene delta.
  • rating — booru rating tag. Use "general" for safe/SFW, "sensitive" for suggestive but not explicit, "questionable" for borderline/lewd, "explicit" for NSFW/hentai. CRITICAL: for any NSFW/hentai/explicit/sexual/nude/lewd request, set rating="explicit" — do NOT leave it as "general". The rating tag unlocks the model's full training distribution.
  • globalScene — shared scene tags (setting, location, time of day, weather, lighting, atmosphere, multi-subject interaction concepts like "yuri", "hetero", "hugging", "kissing", "fighting"). Tags + short prose-glue allowed here.
  • perSubjectScenes[] — one entry per subject in the SAME ORDER as subjectNpcIds. Each entry holds that subject's per-character tags: position-as-tag ("standing on the left", "sitting on the right", "in front", "behind", "center"), OUTFIT, action, pose, expression, held items. NO identity tags (hair, eyes, body). NO setting / lighting (those are global).
  • sceneDelta — used for single-subject or environment-only shots. For single subject, put outfit + action + setting + lighting tags here (still no identity). For environment shots, just describe the scene. Leave empty when you populate perSubjectScenes.

=== RATING / NSFW HANDLING (critical for output quality) ===
  • If the request involves ANY hentai, NSFW, explicit, sexual, nude, lewd, erotic, porn, sex, masturbation, penetration, ahegao, fluids, kink, or adult-themed content → rating = "explicit". Freely use direct danbooru tags (ahegao, spread legs, pussy, nipples, cum, fluids, sweat, blush, naked, topless, etc) in perSubjectScenes / globalScene. Be specific and direct — euphemism produces worse output.
  • Suggestive but clothed (lingerie shoot, swimsuit pinup, cleavage focus) → rating = "sensitive".
  • Borderline / partial nudity / heavy innuendo → rating = "questionable".
  • Clean / safe content → rating = "general".
  • Multi-char NSFW: interaction tag goes in globalScene (e.g. "hetero, sex, missionary" or "yuri, scissoring"), per-character contributions go in their perSubjectScenes.

=== TAG BUILDING RULES ===
  1. Tags are comma-separated, 1–5 words each, lowercase booru-style. Prose-glue is allowed for relationships and spatial logic ("leaning on her shoulder", "both looking up at the sky") — keep prose short and embed it as a comma-clause.
  2. NEVER include character NAMES — use subjectNpcIds.
  3. NEVER include identity tags for known NPCs (hair, eyes, body, marks). The server prepends from coreAppearance.
  4. NEVER include count tokens ("1girl", "1boy", "2girls"). The server emits these.
  5. NEVER include quality words ("masterpiece", "best quality", "absurdres", "highres", "very aesthetic", "newest", "score_9", etc) — the server appends the Illustrious quality tail at the end.
  6. ONE pose tag per subject, not five. ("sitting, kneeling, standing" together confuses the model — pick one.)
  7. For OUTFIT: priority order is (a) what the user explicitly requested in THIS message ("wearing a red dress" → red dress), (b) what RECENT STORY says they're wearing, (c) the NPC's defaultOutfit field (use verbatim), (d) visual memory, (e) appearance / basePrompt last resort. Outfit always goes in perSubjectScenes (or sceneDelta for single subject) — server does not prepend outfit.
  8. POSE / LOCATION / LIGHTING: pull from RECENT STORY first, then visual memory, then sensible defaults.
  9. Match the SCENE STYLE vocabulary of the user's example prompts (atmosphere words, lighting terms, ordering). Strip identity tags / quality tags / count tokens from examples — those are the server's job.
 10. img2img / inpaint mode: focus on what should CHANGE (action, pose, lighting) rather than redescribing every detail.

=== MULTI-CHARACTER SCENES (2+ subjects) ===
Illustrious has weak position binding, so structure matters. The Illustrious-canonical multi-char layout the server will produce from your output:

   <total count>, <viewTag>, <globalScene incl. interaction tags + rating>,
   BREAK
   1girl, <position-as-tag>, <identity>, <perSubject[0]: outfit/action/pose/expression>,
   BREAK
   1boy, <position-as-tag>, <identity>, <perSubject[1]: outfit/action/pose/expression>,
   <quality tail>

Rules you must follow when building perSubjectScenes for multi-char:
  • EVERY entry must start with a position-as-tag ("standing on the left side", "sitting on the right", "behind her", "in front", "center", "facing viewer", "facing each other", etc). Position-as-tag is the strongest spatial anchor the model has.
  • Pure tags inside per-subject entries — no prose-glue, no setting words.
  • Interaction tags (hugging, kissing, holding hands, fighting, hetero, yuri, sex, fellatio, etc) go in globalScene, NOT in per-subject entries. Per-character entries only describe how each character contributes ("arms around her partner", "head buried in her shoulder").
  • Length matches the user's example style — typically 4–10 tags per subject.
  • Differentiate outfits strongly. If both would wear similar items, push contrast ("red ballgown with puffy sleeves" vs "blue track suit with hoodie"). Overlapping outfits bleed between characters.

=== NEGATIVE PROMPT ===
Default to the user's configured DEFAULT NEGATIVE. Add 1–3 extra negatives only if the request specifically calls for it (e.g. user wants daytime → add "night"; user wants clean → add "nsfw, nude"; user wants clean hands → add "bad hands, extra fingers, missing fingers"). Don't rewrite from scratch.

=== OUTPUT FORMAT ===
Return a single JSON object, NO code fences, NO extra prose:
{
  "viewTag": "<view/framing tag, e.g. 'cowboy shot' | 'full body' | 'upper body' | 'portrait' | 'from above'; empty string if not relevant>",
  "rating": "<'general' | 'sensitive' | 'questionable' | 'explicit'>",
  "globalScene": "<comma-separated shared tags: setting, location, time of day, lighting, weather, atmosphere, multi-char interaction tags. Prose-glue allowed for relationships.>",
  "perSubjectScenes": [
    "<subject 1: position-as-tag, outfit, action, pose, expression — no identity, no setting>",
    "<subject 2: position-as-tag, outfit, action, pose, expression — no identity, no setting>"
  ],
  "sceneDelta": "<used only for single-subject or environment shots; leave empty when perSubjectScenes has entries>",
  "subjectNpcIds": ["<npc id>", "..."],
  "negativePrompt": "<negative prompt, leave empty to use the default>",
  "source": "npc-with-image" | "npc-card" | "story-context" | "clarification-needed" | "freeform",
  "reasoning": "<one short sentence: what you depicted, who's in it, how you resolved it>",
  "suggestedLabel": "<2–5 word label for the gallery>",
  "clarificationQuestion": "<ONLY when source is clarification-needed and you truly cannot proceed>"
}

For back-compat you MAY emit only "sceneDelta" + "subjectNpcIds" (legacy contract) or only "prompt" — but the structured fields above produce noticeably better Illustrious output and the server will assemble them in correct order.`;

export async function runImageChatAgent(req: ImageChatRequest): Promise<ImageChatResult> {
  const fm = getFileManager();
  const world = fm.getWorld(req.gameId);
  const player = fm.getPlayer(req.gameId);
  const npcs = fm.listCharacters(req.gameId);
  const config = fm.getConfig();
  const examples = config.comfyui.examplePrompts || [];
  // Pull a bigger recent window than before. The image agent was losing
  // outfits / locations as the story progressed because key descriptive
  // moments scrolled out of a 20-message window.
  const recentCount = req.recentStoryContextCount ?? 40;
  const recent = fm.getRecentMessages(req.gameId, recentCount);
  // Also grab the full history so we can mine older visual details that
  // would otherwise be lost (current outfit, location, mood established
  // dozens of messages ago).
  const allMessages = fm.getAllMessages(req.gameId);

  const contextParts: string[] = [];

  if (world) {
    contextParts.push(`WORLD SETTING: ${world.setting} (${world.era || ''})`);
    if (world.tone) contextParts.push(`TONE: ${world.tone}`);
  }
  if (player) {
    contextParts.push(`PLAYER: ${player.name} — ${player.appearance || ''}`);
  }

  if (npcs.length > 0) {
    contextParts.push('\nKNOWN NPCs:');
    for (const n of npcs) {
      contextParts.push(formatNpcForImageChat(n));
    }
  }

  // Visual memory: scan messages OUTSIDE the recent window for clothing /
  // location / appearance mentions per known NPC. This surfaces older details
  // (e.g. "she's wearing the leather jacket" 80 messages back) that would
  // otherwise scroll out of the recent window entirely.
  if (allMessages.length > recent.length) {
    const olderMessages = allMessages.slice(0, Math.max(0, allMessages.length - recent.length));
    const visualMemory = buildVisualMemory(olderMessages, npcs);
    if (visualMemory.length > 0) {
      contextParts.push('\nVISUAL DETAILS REMEMBERED (from earlier in the story — may be stale, prefer RECENT STORY if it contradicts):');
      contextParts.push(visualMemory);
    }
  }

  if (recent.length > 0) {
    contextParts.push('\nRECENT STORY (most authoritative source for current outfit, pose, location):');
    for (const m of recent) {
      const who =
        m.role === 'user'
          ? 'PLAYER'
          : m.characterId
            ? `[${m.characterId}]`
            : m.type === 'narrator'
              ? 'NARRATOR'
              : 'ASSISTANT';
      // Bumped from 400 to 800 chars — visual descriptions often run long
      // and getting chopped mid-sentence is what was causing detail loss.
      const text = m.content.length > 800 ? m.content.slice(0, 800) + '...' : m.content;
      contextParts.push(`${who}: ${text}`);
    }
  }

  if (examples.length > 0) {
    // Smart example prioritization: if the user's request looks multi-character
    // ("and", "them", "together", "both", or 2+ NPC names referenced), make
    // sure at least one multi-character example surfaces in the slice.
    const surfaced = pickExamplesForRequest(examples, req.userMessage, npcs, 6);
    contextParts.push('\nUSER\'S PREFERRED PROMPT STYLE (match this structure):');
    for (const ex of surfaced) {
      contextParts.push(formatExamplePrompt(ex));
    }
  }

  contextParts.push(`\nDEFAULT NEGATIVE: ${config.comfyui.negativePromptDefault}`);
  contextParts.push(`\nUSER REQUEST: ${req.userMessage}`);

  const messages: ChatCompletionMessage[] = [
    { role: 'system', content: IMAGE_CHAT_SYSTEM_PROMPT },
    { role: 'user', content: contextParts.join('\n') },
  ];

  logger.info(MOD, `runImageChatAgent: gameId=${req.gameId} message="${req.userMessage.slice(0, 80)}"`);

  let content: string;
  try {
    // Use streaming endpoint — some LM Studio models return empty content
    // on non-streaming requests but work fine when streaming.
    logger.info(MOD, 'Using streaming chatCompletion for image chat agent');
    content = await chatCompletionStream(
      messages,
      async () => { /* discard individual chunks — we only need the final content */ },
      // Use a generous token limit — thinking models burn through tokens on
      // reasoning before they ever emit the actual JSON response.
      // Fall back to the user's configured maxTokens if it's higher.
      { temperature: 0.5, maxTokens: Math.max(4096, config.lmStudio.maxTokens) },
    );
    logger.info(MOD, `chatCompletionStream returned content length=${content.length}`);
    if (!content || content.trim().length === 0) {
      logger.warn(MOD, 'chatCompletionStream returned empty content — trying non-streaming fallback');
      // Try non-streaming as a fallback
      try {
        const result = await chatCompletion(messages, { temperature: 0.5, maxTokens: Math.max(4096, config.lmStudio.maxTokens) });
        content = result.content;
        logger.info(MOD, `chatCompletion fallback returned content length=${content.length}`);
      } catch (fallbackErr) {
        logger.warn(MOD, 'Non-streaming fallback also failed', fallbackErr);
      }
      if (!content || content.trim().length === 0) {
        logger.warn(MOD, 'Both streaming and non-streaming returned empty — using user message as prompt');
        return {
          prompt: req.userMessage,
          negativePrompt: config.comfyui.negativePromptDefault,
          source: 'freeform',
          subjectNpcIds: [],
          sceneDelta: req.userMessage,
          identityAnchor: '',
          reasoning: 'LLM returned an empty response via both streaming and non-streaming.',
          rawResponse: '',
        };
      }
    }
  } catch (err) {
    logger.error(MOD, 'chatCompletionStream threw an error — trying non-streaming fallback', err);
    try {
      const result = await chatCompletion(messages, { temperature: 0.5, maxTokens: Math.max(4096, config.lmStudio.maxTokens) });
      content = result.content;
      logger.info(MOD, `chatCompletion fallback returned content length=${content.length}`);
      if (!content || content.trim().length === 0) {
        return {
          prompt: req.userMessage,
          negativePrompt: config.comfyui.negativePromptDefault,
          source: 'freeform',
          subjectNpcIds: [],
          sceneDelta: req.userMessage,
          identityAnchor: '',
          reasoning: 'LLM returned empty responses from both endpoints.',
          rawResponse: '',
        };
      }
    } catch (fallbackErr) {
      logger.error(MOD, 'Both streaming and non-streaming failed', fallbackErr);
      throw err;
    }
  }

  // Strip thinking tags if the model embeds them inline (e.g. <think>...</think>)
  const cleanedContent = stripThinkingTags(content);
  if (cleanedContent !== content) {
    logger.info(MOD, `Stripped thinking tags from response (${content.length} → ${cleanedContent.length} chars)`);
  }
  logger.info(MOD, `raw LLM response (first 800 chars): ${cleanedContent.slice(0, 800)}`);

  // Parse raw fields from the LLM response — sceneDelta + subjectNpcIds in the
  // new contract, or legacy `prompt` field for older models that didn't read
  // the system prompt carefully.
  const parsed = parseImageChatResponse(cleanedContent);

  // Resolve subject npc ids to actual NPCCharacter objects (dropping unknowns).
  const subjectIds = parsed.subjectNpcIds || [];
  const resolvedSubjects: NPCCharacter[] = [];
  for (const id of subjectIds) {
    const npc = fm.getCharacter(req.gameId, id);
    if (npc) {
      resolvedSubjects.push(npc);
    } else {
      logger.warn(MOD, `subjectNpcId "${id}" did not resolve to a known character — dropped`);
    }
  }

  // Deterministic prompt assembly: server prepends identity, LLM provides delta.
  const assembled = assembleFinalPrompt(parsed, resolvedSubjects, config.comfyui.negativePromptDefault);

  // Negative prompt: prefer LLM-supplied, fall back to configured default.
  const negativePrompt =
    (parsed.negativePrompt && parsed.negativePrompt.trim().length > 0)
      ? parsed.negativePrompt.trim()
      : config.comfyui.negativePromptDefault;

  // Final subject id list — the resolved subset (matches resolvedSubjects).
  const finalSubjectIds = resolvedSubjects.map((n) => n.id);

  const result: ImageChatResult = {
    prompt: assembled.finalPrompt,
    negativePrompt,
    source: parsed.source || (finalSubjectIds.length > 0 ? 'npc-with-image' : 'freeform'),
    subjectNpcIds: finalSubjectIds,
    resolvedNpcId: finalSubjectIds[0],
    sceneDelta: assembled.sceneDelta,
    identityAnchor: assembled.identityAnchor,
    reasoning: parsed.reasoning || '',
    suggestedLabel: parsed.suggestedLabel,
    clarificationQuestion: parsed.clarificationQuestion,
    rawResponse: content,
    repairedTokens: assembled.repairedTokens.length > 0 ? assembled.repairedTokens : undefined,
  };

  logger.info(
    MOD,
    `assembled: subjects=[${finalSubjectIds.join(',')}] identityAnchor="${assembled.identityAnchor.slice(0, 160)}" sceneDelta="${assembled.sceneDelta.slice(0, 200)}" finalPrompt.len=${assembled.finalPrompt.length} source=${result.source}`,
  );
  if (!result.prompt || result.prompt.trim().length === 0) {
    logger.warn(MOD, `assembled prompt is EMPTY — full raw response: ${content}`);
  }
  return result;
}

function formatNpcForImageChat(n: NPCCharacter): string {
  const parts: string[] = [
    `  - id: ${n.id}`,
    `    name: ${n.revealedName || n.name}`,
  ];
  if (n.appearance) parts.push(`    appearance: ${n.appearance}`);
  if (n.image?.coreAppearance) parts.push(`    coreAppearance (USE AS ANCHOR — identity only, no outfits/settings): ${n.image.coreAppearance}`);
  // v1.1.25: defaultOutfit is the user-curated canonical outfit. When the
  // user does NOT request a specific outfit/change, use this verbatim as the
  // outfit portion of the per-subject sceneDelta. The server prepends identity
  // but does NOT prepend outfit — you (the LLM) are responsible for adding
  // outfit tags in your sceneDelta, so honor this anchor.
  if (n.image?.defaultOutfit) parts.push(`    defaultOutfit (USE for outfit tags unless the user requested a different outfit): ${n.image.defaultOutfit}`);
  if (n.image?.basePrompt) parts.push(`    basePrompt (full default portrait, fallback if no coreAppearance): ${n.image.basePrompt}`);
  if (n.image?.baseNegative) parts.push(`    baseNegative: ${n.image.baseNegative}`);
  return parts.join('\n');
}

function formatExamplePrompt(ex: ComfyUIExamplePrompt): string {
  return `  - "${ex.label}": ${ex.prompt}${ex.negative ? `\n    negative: ${ex.negative}` : ''}`;
}

// Booru count tokens / multi-subject markers that, if present in an example,
// strongly indicate the example is a multi-character prompt.
const MULTI_CHAR_TAG_RE = /\b(2girls|3girls|4girls|2boys|3boys|multiple\s*(girls|boys|characters)|1boy\s*1girl|hetero|group|BREAK)\b/i;

function isMultiCharacterExample(ex: ComfyUIExamplePrompt): boolean {
  const haystack = `${ex.label || ''} ${ex.prompt || ''}`;
  return MULTI_CHAR_TAG_RE.test(haystack);
}

// Cheap heuristic: does the user's request describe a multi-character scene?
// Triggers if (a) the request uses obvious multi-subject English markers, or
// (b) two or more known NPC names appear in the request (case-insensitive).
function isMultiCharacterRequest(userMessage: string, npcs: Array<{ name?: string }>): boolean {
  const lower = userMessage.toLowerCase();
  if (/\b(and|together|both|them|with each other|group|threesome|trio|duo|pair|everyone|all of them)\b/.test(lower)) {
    // "and" alone is weak — also require either an explicit multi-word marker
    // OR 2+ NPC names. We handle that below.
    if (/\b(together|both|them|group|threesome|trio|duo|pair|everyone|all of them|with each other)\b/.test(lower)) {
      return true;
    }
  }
  let nameHits = 0;
  for (const n of npcs) {
    const name = (n.name || '').trim();
    if (!name) continue;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(userMessage)) nameHits += 1;
    if (nameHits >= 2) return true;
  }
  // Final fallback: "X and Y" pattern where both look like proper nouns.
  if (/\b[A-Z][a-z]+\s+and\s+[A-Z][a-z]+\b/.test(userMessage)) return true;
  return false;
}

/**
 * Pick which example prompts to surface for this request.
 *
 * - For multi-character requests: ensure at least one multi-character example
 *   appears in the slice (interleave: first one or two multi-char examples,
 *   then fill with the rest in original order, capped at `limit`).
 * - For single-subject requests: prefer single-subject examples first, then
 *   pad with multi-char if there's room.
 *
 * Preserves original ordering within each bucket so the user's hand-curated
 * list still feels stable. Never duplicates entries.
 */
function pickExamplesForRequest(
  examples: ComfyUIExamplePrompt[],
  userMessage: string,
  npcs: Array<{ name?: string }>,
  limit: number,
): ComfyUIExamplePrompt[] {
  if (examples.length <= limit) return examples.slice(0, limit);
  const multi = examples.filter(isMultiCharacterExample);
  const single = examples.filter((e) => !isMultiCharacterExample(e));
  const multiChar = isMultiCharacterRequest(userMessage, npcs);
  const picked: ComfyUIExamplePrompt[] = [];
  if (multiChar) {
    // Up to 2 multi-char examples first, then fill with single-subject.
    for (const ex of multi.slice(0, 2)) picked.push(ex);
    for (const ex of single) {
      if (picked.length >= limit) break;
      picked.push(ex);
    }
    // If we still have room and more multi-char remain, keep filling.
    for (const ex of multi.slice(2)) {
      if (picked.length >= limit) break;
      picked.push(ex);
    }
  } else {
    // Single-subject first, then pad with one multi-char example so the LLM
    // still has a multi-char pattern reference if it turns out to need one.
    for (const ex of single) {
      if (picked.length >= limit - 1) break;
      picked.push(ex);
    }
    for (const ex of multi.slice(0, 1)) {
      if (picked.length >= limit) break;
      picked.push(ex);
    }
    for (const ex of examples) {
      if (picked.length >= limit) break;
      if (!picked.includes(ex)) picked.push(ex);
    }
  }
  return picked.slice(0, limit);
}

// Words / patterns that strongly suggest a sentence is describing something
// visual (an outfit, a setting, a physical state). Used to mine older messages
// for details that may matter for image generation but have scrolled out of
// the recent window.
const VISUAL_KEYWORDS = [
  // Clothing / outfit
  'wear', 'wearing', 'wore', 'dressed', 'outfit', 'clothes', 'clothing',
  'jacket', 'coat', 'shirt', 'blouse', 'dress', 'gown', 'skirt', 'pants',
  'trousers', 'jeans', 'shorts', 'boots', 'shoes', 'heels', 'sneakers',
  'hat', 'cap', 'hood', 'cloak', 'robe', 'armor', 'uniform', 'suit',
  'tie', 'scarf', 'gloves', 'belt', 'collar', 'leather', 'silk', 'velvet',
  'lingerie', 'bra', 'panties', 'underwear', 'bikini', 'swimsuit',
  'stockings', 'tights', 'corset',
  // Body / appearance state
  'naked', 'nude', 'topless', 'bare', 'shirtless', 'barefoot',
  'tattoo', 'scar', 'piercing', 'makeup', 'lipstick',
  // Hair (style may change)
  'hair', 'ponytail', 'braid', 'bun', 'pigtails',
  // Location / setting markers
  'bedroom', 'kitchen', 'bathroom', 'living room', 'hallway', 'office',
  'street', 'alley', 'forest', 'beach', 'park', 'cafe', 'bar', 'tavern',
  'castle', 'dungeon', 'rooftop', 'balcony', 'garden',
  // Lighting / time
  'sunset', 'sunrise', 'dusk', 'dawn', 'midnight', 'twilight',
  'candlelight', 'firelight', 'moonlight', 'lamplight',
];

const VISUAL_KEYWORD_REGEX = new RegExp(
  `\\b(${VISUAL_KEYWORDS.join('|')})\\b`,
  'i',
);

/**
 * Mine older story messages (outside the recent window) for sentences that
 * mention visual details — outfits, locations, body state, lighting. Surfaces
 * the most recent N hits per known NPC so the image agent doesn't lose track
 * of what a character is wearing 80 messages into a story.
 *
 * Strategy:
 *  - Walk messages newest-first (older-window slice).
 *  - For each message, split into sentences and keep ones with visual keywords.
 *  - Attribute each sentence to an NPC by name match, or to a general bucket.
 *  - Keep up to 3 sentences per NPC and 4 general sentences.
 */
function buildVisualMemory(olderMessages: ChatMessage[], npcs: NPCCharacter[]): string {
  const PER_NPC_LIMIT = 3;
  const GENERAL_LIMIT = 4;
  const SENTENCE_MAX_CHARS = 240;

  // Build NPC name lookup. Match against revealedName + name + any obvious
  // first-name variant (split on space, take first token).
  type NpcKey = { id: string; displayName: string; aliases: string[] };
  const npcKeys: NpcKey[] = npcs.map((n) => {
    const displayName = n.revealedName || n.name || n.id;
    const aliases = new Set<string>();
    if (n.name) aliases.add(n.name);
    if (n.revealedName) aliases.add(n.revealedName);
    [n.name, n.revealedName].forEach((nm) => {
      if (!nm) return;
      const first = nm.split(/\s+/)[0];
      if (first && first.length >= 2) aliases.add(first);
    });
    return {
      id: n.id,
      displayName,
      aliases: Array.from(aliases).filter((a) => a.length >= 2),
    };
  });

  // Newest-first traversal
  const traversal = [...olderMessages].reverse();

  const npcHits = new Map<string, string[]>();
  const generalHits: string[] = [];

  for (const msg of traversal) {
    // Only mine narrator / assistant / character messages — these are where
    // the GM describes things. Player messages can also describe things they
    // wear, so include those too.
    const sentences = splitSentences(msg.content || '');
    for (const raw of sentences) {
      const s = raw.trim();
      if (s.length < 10) continue;
      if (!VISUAL_KEYWORD_REGEX.test(s)) continue;
      const truncated = s.length > SENTENCE_MAX_CHARS ? s.slice(0, SENTENCE_MAX_CHARS) + '...' : s;

      // Try to attribute to an NPC by name match
      let attributed = false;
      for (const key of npcKeys) {
        const arr = npcHits.get(key.id);
        if (arr && arr.length >= PER_NPC_LIMIT) continue;
        const matches = key.aliases.some((alias) => {
          const aliasRegex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
          return aliasRegex.test(s);
        });
        if (matches) {
          const existing = arr || [];
          if (existing.length < PER_NPC_LIMIT) {
            existing.push(truncated);
            npcHits.set(key.id, existing);
            attributed = true;
          }
        }
      }

      if (!attributed && generalHits.length < GENERAL_LIMIT) {
        generalHits.push(truncated);
      }

      // Early exit if everything is full
      const allNpcFull = npcKeys.every((k) => (npcHits.get(k.id)?.length || 0) >= PER_NPC_LIMIT);
      if (allNpcFull && generalHits.length >= GENERAL_LIMIT) break;
    }

    const allNpcFull = npcKeys.every((k) => (npcHits.get(k.id)?.length || 0) >= PER_NPC_LIMIT);
    if (allNpcFull && generalHits.length >= GENERAL_LIMIT) break;
  }

  const lines: string[] = [];
  for (const key of npcKeys) {
    const hits = npcHits.get(key.id);
    if (!hits || hits.length === 0) continue;
    lines.push(`  ${key.displayName}:`);
    // Reverse so the OLDEST visual detail is listed first — the most recent
    // detail (still older than the recent window) sits at the bottom, closest
    // to the recent-story block, which makes it most authoritative.
    for (const h of hits.reverse()) {
      lines.push(`    - ${h}`);
    }
  }
  if (generalHits.length > 0) {
    lines.push('  Scene / setting:');
    for (const h of generalHits.reverse()) {
      lines.push(`    - ${h}`);
    }
  }
  return lines.join('\n');
}

function splitSentences(text: string): string[] {
  if (!text) return [];
  // Split on sentence-ending punctuation. Keep it simple — false splits are
  // fine, this is just a heuristic for keyword scanning.
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Raw structured fields the LLM is expected to emit. Used as an intermediate
 * representation BEFORE the server deterministically assembles the final
 * prompt by prepending identity anchors. All fields are optional — callers
 * fall through assembly even with partial data.
 */
interface RawParsedResponse {
  /**
   * v1.1.29 structured contract: view/framing tag (cowboy shot, full body, etc).
   * Server inserts this immediately after the count token.
   */
  viewTag?: string;
  /**
   * v1.1.29 structured contract: booru rating tag.
   * 'general' | 'sensitive' | 'questionable' | 'explicit'.
   * Inserted into the global block. 'explicit' unlocks the NSFW distribution.
   */
  rating?: string;
  /**
   * v1.1.29 structured contract: shared scene tags for the whole image —
   * setting, lighting, weather, time of day, atmosphere, multi-subject
   * interaction tags ("hugging", "hetero", "yuri", "fighting"). Goes in the
   * global block before the first BREAK.
   */
  globalScene?: string;
  /**
   * v1.1.29 structured contract: per-subject scene tags. One entry per
   * subject in the same order as subjectNpcIds. Each holds position-as-tag,
   * outfit, action, pose, expression — NO identity, NO setting. Server
   * weaves these between identity-anchor BREAK blocks for multi-char output.
   */
  perSubjectScenes?: string[];
  /**
   * Legacy / single-subject contract: scene-only tags. Server uses this when
   * perSubjectScenes is empty (single-subject or environment shots) and as a
   * fallback for older models that haven't picked up the structured contract.
   */
  sceneDelta?: string;
  /** New contract: array of NPC ids whose identity should be prepended. */
  subjectNpcIds?: string[];
  /** Legacy / fallback: full prompt including identity. */
  prompt?: string;
  negativePrompt?: string;
  source?: ImageChatResult['source'];
  /** Legacy single-subject alias — promoted into subjectNpcIds if present. */
  resolvedNpcId?: string;
  reasoning?: string;
  suggestedLabel?: string;
  clarificationQuestion?: string;
}

/**
 * Parse the LLM response into a RawParsedResponse. Tolerant of broken JSON,
 * markdown fences, and the old single-field "prompt" contract. Returns the
 * fields needed for downstream assembly.
 */
export function parseImageChatResponse(raw: string): RawParsedResponse {
  let cleaned = (raw || '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last > first) {
    const jsonCandidate = cleaned.slice(first, last + 1);
    let parsed: any = null;
    try {
      parsed = JSON.parse(jsonCandidate);
    } catch {
      try {
        const fixed = jsonCandidate
          .replace(/,\s*}/g, '}')
          .replace(/,\s*]/g, ']')
          .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
        parsed = JSON.parse(fixed);
      } catch {
        parsed = null;
      }
    }
    if (parsed && typeof parsed === 'object') {
      const sceneDelta = extractStringField(parsed, ['sceneDelta', 'scene_delta', 'delta']);
      const prompt = extractStringField(parsed, ['prompt', 'image_prompt', 'imagePrompt', 'positive_prompt', 'positivePrompt', 'positive']);
      const negative = extractStringField(parsed, ['negativePrompt', 'negative_prompt', 'negative', 'neg']);
      const viewTag = extractStringField(parsed, ['viewTag', 'view_tag', 'view', 'framing']);
      const rating = extractStringField(parsed, ['rating', 'rating_tag', 'ratingTag']);
      const globalScene = extractStringField(parsed, ['globalScene', 'global_scene', 'global']);
      // perSubjectScenes: array of strings, one per subject, in order.
      const perSubjectRaw =
        (Array.isArray(parsed.perSubjectScenes) && parsed.perSubjectScenes) ||
        (Array.isArray(parsed.per_subject_scenes) && parsed.per_subject_scenes) ||
        (Array.isArray(parsed.subjectScenes) && parsed.subjectScenes) ||
        null;
      const perSubjectScenes: string[] = perSubjectRaw
        ? perSubjectRaw
            .filter((x: unknown) => typeof x === 'string')
            .map((x: string) => x.trim())
            .filter((x: string) => x.length > 0)
        : [];
      // subjectNpcIds: prefer array, fall back to legacy single resolvedNpcId.
      const subjectArrayRaw =
        (Array.isArray(parsed.subjectNpcIds) && parsed.subjectNpcIds) ||
        (Array.isArray(parsed.subject_npc_ids) && parsed.subject_npc_ids) ||
        (Array.isArray(parsed.subjects) && parsed.subjects) ||
        null;
      const subjectArray: string[] = subjectArrayRaw
        ? subjectArrayRaw.filter((x: unknown) => typeof x === 'string' && x.trim().length > 0)
        : [];
      const legacySingle = (typeof parsed.resolvedNpcId === 'string' && parsed.resolvedNpcId.trim())
        || (typeof parsed.resolved_npc_id === 'string' && parsed.resolved_npc_id.trim())
        || '';
      if (subjectArray.length === 0 && legacySingle) subjectArray.push(legacySingle);

      if (sceneDelta || prompt || subjectArray.length > 0 || globalScene || perSubjectScenes.length > 0) {
        logger.info(MOD, `parseImageChatResponse: ok sceneDelta=${sceneDelta?.length || 0}c prompt=${prompt?.length || 0}c subjects=${subjectArray.length} view="${viewTag}" rating="${rating}" global=${globalScene?.length || 0}c perSubject=${perSubjectScenes.length}`);
        return {
          viewTag: viewTag || undefined,
          rating: rating || undefined,
          globalScene: globalScene || undefined,
          perSubjectScenes: perSubjectScenes.length > 0 ? perSubjectScenes : undefined,
          sceneDelta: sceneDelta || undefined,
          subjectNpcIds: subjectArray,
          prompt: prompt || undefined,
          negativePrompt: negative || undefined,
          source: (parsed.source as ImageChatResult['source']) || undefined,
          resolvedNpcId: legacySingle || undefined,
          reasoning: parsed.reasoning || '',
          suggestedLabel: parsed.suggestedLabel || parsed.suggested_label,
          clarificationQuestion: parsed.clarificationQuestion || parsed.clarification_question,
        };
      }
      logger.warn(MOD, `parseImageChatResponse: JSON parsed but no usable prompt/sceneDelta. Keys: ${Object.keys(parsed).join(', ')}`);
    }
  }

  // Regex fallback: pull sceneDelta or prompt field out of malformed JSON.
  const sceneDeltaRegex = /["']sceneDelta["']\s*:\s*["']((?:[^"'\\]|\\.)*)\s*["']/i;
  const sceneMatch = raw.match(sceneDeltaRegex);
  const promptRegex = /["']prompt["']\s*:\s*["']((?:[^"'\\]|\\.)*)\s*["']/i;
  const promptMatch = raw.match(promptRegex);
  if (sceneMatch?.[1]?.trim() || promptMatch?.[1]?.trim()) {
    logger.info(MOD, 'parseImageChatResponse: regex fallback');
    const negRegex = /["'](?:negativePrompt|negative_prompt|negative)["']\s*:\s*["']((?:[^"'\\]|\\.)*)\s*["']/i;
    const negMatch = raw.match(negRegex);
    return {
      sceneDelta: sceneMatch?.[1]?.trim() || undefined,
      prompt: promptMatch?.[1]?.trim() || undefined,
      negativePrompt: negMatch?.[1]?.trim() || undefined,
      source: 'freeform',
      reasoning: 'Regex fallback — extracted from malformed JSON.',
    };
  }

  // Last resort: use the whole raw text as a prompt.
  const stripped = raw.replace(/[{}"]/g, '').trim();
  logger.warn(MOD, `parseImageChatResponse: all parsing failed, using raw text as prompt (${stripped.length} chars)`);
  return {
    prompt: stripped || raw.trim() || undefined,
    source: 'freeform',
    reasoning: 'All parsers failed — used raw text as prompt.',
  };
}

// =============================================================================
// Deterministic prompt assembly
// =============================================================================

/**
 * Identity tokens are extracted from coreAppearance (or basePrompt fallback)
 * by splitting on commas and trimming. Used to:
 *   - prepend to the final prompt with BREAK separators between subjects
 *   - run the tag-presence safety net if the LLM returned a full "prompt"
 *     field with paraphrased identity instead of the new sceneDelta contract
 */
function extractIdentityTokens(npc: NPCCharacter): string[] {
  const source = npc.image?.coreAppearance || npc.image?.basePrompt || '';
  if (!source.trim()) return [];
  return source
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    // Drop common quality-style tags that sometimes sneak into coreAppearance
    // — they're not identity and shouldn't be locked.
    .filter((t) => !/^(masterpiece|best quality|ultra detailed|highres|absurdres|score_\d|cinematic lighting|volumetric light|8k|4k)$/i.test(t))
    // v1.1.25: drop count / subject tokens — those are owned by
    // buildSceneCountTokens which emits them once for the whole scene.
    // Keeping them here would produce "1girl, 1girl, ..." duplications in
    // the final prompt when coreAppearance happens to start with a count token
    // (which the regen-image-prompt agent is explicitly told to do).
    .filter((t) => !/^(\d+\s*(girl|girls|boy|boys|woman|women|man|men|other|others|people|person)|solo|duo|trio|hetero|yuri|yaoi|multiple\s+girls|multiple\s+boys)$/i.test(t));
}

/**
 * Heuristic "count token" for a subject — 1girl / 1boy / 1other. Inferred from
 * coreAppearance / appearance for gender hints. Defaults to "1other" if unsure.
 * Booru-style diffusion models attend strongly to count tokens, so even a
 * rough guess helps reduce face-count drift.
 */
function inferCountToken(npc: NPCCharacter): string {
  const corpus = `${npc.image?.coreAppearance || ''} ${npc.appearance || ''}`.toLowerCase();
  // Order matters — check the more specific tokens first.
  if (/\b(1girl|woman|girl|female|she\/her|hers|breasts|long hair|feminine)\b/.test(corpus)) return '1girl';
  if (/\b(1boy|man|boy|male|he\/him|his|masculine|beard|stubble)\b/.test(corpus)) return '1boy';
  return '1other';
}

/**
 * Build a combined count token for the scene. For one subject: "1girl".
 * For multiple: "2girls" / "1boy 1girl" / "2boys" / "3 people" etc.
 */
function buildSceneCountTokens(subjects: NPCCharacter[]): string {
  if (subjects.length === 0) return '';
  if (subjects.length === 1) return inferCountToken(subjects[0]);
  let girls = 0;
  let boys = 0;
  let others = 0;
  for (const s of subjects) {
    const t = inferCountToken(s);
    if (t === '1girl') girls++;
    else if (t === '1boy') boys++;
    else others++;
  }
  const parts: string[] = [];
  if (girls === 1) parts.push('1girl');
  else if (girls > 1) parts.push(`${girls}girls`);
  if (boys === 1) parts.push('1boy');
  else if (boys > 1) parts.push(`${boys}boys`);
  if (others > 0) parts.push(`${others} other`);
  // Always include a "N people" token alongside so non-booru models still get the signal.
  parts.push(`${subjects.length} people`);
  return parts.join(', ');
}

/**
 * Lowercase token-set comparison for the safety net. Returns true if `tag`
 * already appears (loosely) in the existing tag list. "long_hair" matches
 * "long hair"; trailing punctuation is ignored.
 */
function tagAlreadyPresent(tag: string, existing: string[]): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[_\-]/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
  const target = norm(tag);
  if (!target) return true;
  for (const e of existing) {
    if (norm(e) === target) return true;
  }
  return false;
}

// =============================================================================
// Illustrious-canonical quality tail.
// Per arXiv 2409.19946 + community testing, Illustrious wants the quality tail
// at the END of the prompt, not the front (this is the opposite of Pony XL).
// We append it deterministically so the LLM can't get the ordering wrong.
// Skipped if the assembled prompt already contains a recognizable quality
// signature ("masterpiece", "score_\d", "best quality", "very aesthetic") —
// in those cases the user's example style probably overrides our default.
// =============================================================================
const ILLUSTRIOUS_QUALITY_TAIL =
  'masterpiece, best quality, amazing quality, very aesthetic, newest, absurdres, highres, ultra-detailed, sharp focus, intricate details, professional illustration';

const QUALITY_TAIL_DETECT_RE = /\b(masterpiece|score_\d|best\s*quality|amazing\s*quality|very\s*aesthetic|very\s*awa|absurdres|professional\s*illustration)\b/i;

/**
 * Normalize a rating field into a canonical booru rating tag.
 * Accepts: 'general', 'sensitive', 'questionable', 'explicit' (case-insensitive)
 * plus common aliases. Returns empty string if it can't be normalized — the
 * caller then omits the rating tag entirely.
 */
function normalizeRating(raw: string | undefined): string {
  if (!raw) return '';
  const r = raw.trim().toLowerCase().replace(/["'`]/g, '');
  if (/(explicit|nsfw|hentai|porn|adult|xxx|r18)/.test(r)) return 'explicit';
  if (/(question|borderline|lewd|suggestive\+|nudity)/.test(r)) return 'questionable';
  if (/(sensitive|suggestive|spicy|ecchi)/.test(r)) return 'sensitive';
  if (/(general|safe|sfw|clean)/.test(r)) return 'general';
  return '';
}

/** Strip any quality / count / identity-looking tags from a free-form tag string.
 *  Used to clean LLM outputs that ignored our "don't emit these" rules so they
 *  don't double-appear in the final prompt. */
function stripServerOwnedTags(s: string): string {
  if (!s) return '';
  return s
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => !QUALITY_TAIL_DETECT_RE.test(t))
    .filter((t) => !/^(\d+\s*(girl|girls|boy|boys|woman|women|man|men|other|others|people|person)|solo|duo|trio|multiple\s+(girls|boys))$/i.test(t))
    .filter((t) => !/^(score_\d(_up)?|sharp focus|intricate details|highres|absurdres|ultra[- ]detailed|newest|oldest|early|old)$/i.test(t))
    .join(', ');
}

/**
 * Assemble the final prompt from a RawParsedResponse + the resolved subject
 * NPC objects. v1.1.29 — Illustrious-canonical layout.
 *
 * Single-subject layout:
 *   <count>, <viewTag?>, <identity>, <sceneDelta or perSubjectScenes[0]>,
 *   <globalScene?>, <rating?>, <quality tail>
 *
 * Multi-subject layout (Illustrious-canonical, see arXiv 2409.19946 §4):
 *   <total count>, <viewTag?>, <globalScene>, <rating?>,
 *   BREAK
 *   1girl, <identity_1>, <perSubject[0]>,
 *   BREAK
 *   1boy, <identity_2>, <perSubject[1]>,
 *   ...
 *   <quality tail>
 *
 * Zero-subject (environment) layout:
 *   <viewTag?>, <sceneDelta or globalScene>, <rating?>, <quality tail>
 */
export function assembleFinalPrompt(
  parsed: RawParsedResponse,
  resolvedSubjects: NPCCharacter[],
  defaultNegative: string,
): {
  finalPrompt: string;
  identityAnchor: string;
  sceneDelta: string;
  repairedTokens: Array<{ npcId: string; added: string[] }>;
} {
  const repairedTokens: Array<{ npcId: string; added: string[] }> = [];
  void defaultNegative; // negative handled outside this function

  const countToken = buildSceneCountTokens(resolvedSubjects);
  const viewTag = stripServerOwnedTags((parsed.viewTag || '').trim());
  const ratingTag = normalizeRating(parsed.rating);
  const globalScene = stripServerOwnedTags((parsed.globalScene || '').trim());
  const perSubjectScenes = (parsed.perSubjectScenes || []).map((s) => stripServerOwnedTags(s.trim()));
  let legacySceneDelta = stripServerOwnedTags((parsed.sceneDelta || '').trim());

  // Legacy "prompt" fallback for older models that didn't pick up the new contract.
  if (!legacySceneDelta && !globalScene && perSubjectScenes.length === 0 && parsed.prompt) {
    legacySceneDelta = stripServerOwnedTags(parsed.prompt.trim());
  }

  // Per-subject identity tokens (from coreAppearance / basePrompt).
  const identitySegments: string[] = resolvedSubjects.map((npc) => {
    const tokens = extractIdentityTokens(npc);
    return tokens.join(', ');
  });

  // Per-subject count token (1girl / 1boy / 1other) used INSIDE each BREAK block.
  const perSubjectCountTokens: string[] = resolvedSubjects.map((npc) => inferCountToken(npc));

  // ---- Multi-subject (Illustrious-canonical BREAK format) ----
  if (resolvedSubjects.length >= 2) {
    // Global block: count, viewTag, globalScene, rating.
    const globalParts: string[] = [];
    if (countToken) globalParts.push(countToken);
    if (viewTag) globalParts.push(viewTag);
    if (globalScene) globalParts.push(globalScene);
    if (ratingTag) globalParts.push(ratingTag);
    const globalBlock = globalParts.filter((p) => p.length > 0).join(', ');

    // Per-subject blocks: "1girl, <identity>, <perSubject[i]>" or pad from legacy delta.
    const subjectBlocks: string[] = [];
    for (let i = 0; i < resolvedSubjects.length; i++) {
      const parts: string[] = [];
      parts.push(perSubjectCountTokens[i]);
      if (identitySegments[i]) parts.push(identitySegments[i]);
      const sub = perSubjectScenes[i] || (i === 0 ? legacySceneDelta : '');
      if (sub) parts.push(sub);
      subjectBlocks.push(parts.filter((p) => p.trim().length > 0).join(', '));
    }

    // Splice everything together with literal "BREAK" separators (comma-bordered
    // for A1111/Forge native parsing; harmless on parsers that don't recognise it).
    const segments: string[] = [];
    if (globalBlock) segments.push(globalBlock);
    for (const sb of subjectBlocks) {
      if (sb.trim().length > 0) segments.push('BREAK', sb);
    }
    // Append Illustrious quality tail at the END if not already present.
    let assembled = segments.join(', ');
    if (!QUALITY_TAIL_DETECT_RE.test(assembled)) {
      assembled = assembled + ', ' + ILLUSTRIOUS_QUALITY_TAIL;
    }

    const identityAnchor = [
      countToken,
      ...identitySegments.filter((s) => s.length > 0),
    ].filter(Boolean).join(' BREAK ');
    const sceneDeltaOut = [
      globalScene,
      ...perSubjectScenes,
      legacySceneDelta,
    ].filter((s) => s.length > 0).join(' | ');

    return {
      finalPrompt: assembled,
      identityAnchor,
      sceneDelta: sceneDeltaOut,
      repairedTokens,
    };
  }

  // ---- Single-subject ----
  if (resolvedSubjects.length === 1) {
    const subjectScene = perSubjectScenes[0] || legacySceneDelta;
    const parts: string[] = [];
    if (countToken) parts.push(countToken);
    if (viewTag) parts.push(viewTag);
    if (identitySegments[0]) parts.push(identitySegments[0]);
    if (subjectScene) parts.push(subjectScene);
    if (globalScene) parts.push(globalScene);
    if (ratingTag) parts.push(ratingTag);
    let assembled = parts.filter((p) => p.trim().length > 0).join(', ');
    if (!QUALITY_TAIL_DETECT_RE.test(assembled)) {
      assembled = assembled + ', ' + ILLUSTRIOUS_QUALITY_TAIL;
    }

    const identityAnchor = [countToken, identitySegments[0]].filter(Boolean).join(', ');
    const sceneDeltaOut = [subjectScene, globalScene].filter((s) => s && s.length > 0).join(', ');

    return {
      finalPrompt: assembled,
      identityAnchor,
      sceneDelta: sceneDeltaOut,
      repairedTokens,
    };
  }

  // ---- Zero-subject (environment / object shot) ----
  const parts: string[] = [];
  if (viewTag) parts.push(viewTag);
  const envBody = globalScene || legacySceneDelta;
  if (envBody) parts.push(envBody);
  if (ratingTag) parts.push(ratingTag);
  let assembled = parts.filter((p) => p.trim().length > 0).join(', ');
  if (!QUALITY_TAIL_DETECT_RE.test(assembled) && assembled.length > 0) {
    assembled = assembled + ', ' + ILLUSTRIOUS_QUALITY_TAIL;
  }
  return {
    finalPrompt: assembled,
    identityAnchor: '',
    sceneDelta: envBody,
    repairedTokens,
  };
}

/**
 * Strip inline thinking tags that some models wrap around their reasoning.
 * Examples: <think>...</think>, <reasoning>...</reasoning>, <thought>...</thought>
 * After stripping, return whatever remains (the actual response).
 */
function stripThinkingTags(text: string): string {
  if (!text) return text;
  // Remove <think>...</think> blocks (case-insensitive, dotAll)
  let cleaned = text.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '');
  // Remove <reasoning>...</reasoning>
  cleaned = cleaned.replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, '');
  // Remove <thought>...</thought>
  cleaned = cleaned.replace(/<thought[^>]*>[\s\S]*?<\/thought>/gi, '');
  cleaned = cleaned.trim();
  // If stripping removed everything, return the original (the JSON might be inside the tags)
  if (!cleaned) {
    // Try extracting JSON from inside the thinking tags
    const insideThink = text.match(/<think[^>]*>([\s\S]*?)<\/think>/i)?.[1] ?? '';
    const jsonInside = insideThink.match(/\{[\s\S]*\}/)?.[0];
    if (jsonInside) {
      logger.info(MOD, 'stripThinkingTags: found JSON inside think tags, using that');
      return jsonInside;
    }
    return text;
  }
  return cleaned;
}

/** Try multiple field names, return first non-empty string found */
function extractStringField(obj: any, fields: string[]): string {
  for (const f of fields) {
    if (typeof obj[f] === 'string' && obj[f].trim().length > 0) {
      return obj[f].trim();
    }
  }
  return '';
}
