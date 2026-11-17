import { v4 as uuidv4 } from 'uuid';
import { ChatMessage, Summary } from '../types/index.js';
import { getFileManager, withGameLock } from './fileManager.js';
import { chatCompletion } from './lmStudio.js';
import { logger } from './logger.js';

const MOD = 'summarizer';

const SUMMARY_SYSTEM_PROMPT = `You are a concise summarizer for an interactive story.
Take the following chat messages and compress them into a dense summary that preserves:
- Key events that happened
- Characters introduced or interacted with, and how
- Player decisions and their consequences
- New items, locations, or knowledge acquired
- Shifts in relationships or emotional state

Write in past tense, 3-6 paragraphs max. Do not invent details. Do not include meta commentary.
Return ONLY the summary text.`;

/**
 * If total unsummarized messages exceed the threshold, summarize the oldest half
 * and mark them as summarized. Appends a new Summary file.
 */
export async function maybeSummarize(gameId: string): Promise<Summary | null> {
  // v1.1.34: this runs fire-and-forget from the orchestrator after the
  // per-game lock has released, but it does a read-modify-write of the
  // chapter files (mark messages summarized). Take the lock so it can't
  // race with a new turn that's appending fresh messages.
  return withGameLock(gameId, async () => {
    const fm = getFileManager();
    const cfg = fm.getConfig();
    const threshold = cfg.engine.summaryThreshold;

    const all = fm.getAllMessages(gameId);
    const unsummarized = all.filter((m) => !m.summarized);
    if (unsummarized.length < threshold) return null;

    // Summarize the oldest half of unsummarized messages
    const halfCount = Math.floor(unsummarized.length / 2);
    const toSummarize = unsummarized.slice(0, halfCount);
    if (toSummarize.length === 0) return null;

    return summarizeMessages(gameId, toSummarize);
  });
}

export async function summarizeMessages(
  gameId: string,
  messages: ChatMessage[]
): Promise<Summary | null> {
  if (messages.length === 0) return null;

  const fm = getFileManager();
  const text = messages
    .map((m) => {
      const who = m.role === 'user' ? 'Player' : (m.characterId ? `[${m.characterId}]` : m.type === 'narrator' ? 'Narrator' : 'Assistant');
      return `${who}: ${m.content}`;
    })
    .join('\n\n');

  const config = fm.getConfig();
  // Give thinking models enough headroom — they burn tokens on reasoning
  // before emitting the summary text. Use at least 4096 or the user's configured max.
  const sumMaxTokens = Math.max(4096, config.lmStudio.maxTokens);
  logger.info(MOD, `summarizeMessages: using maxTokens=${sumMaxTokens} (config=${config.lmStudio.maxTokens})`);
  const { content } = await chatCompletion(
    [
      { role: 'system', content: SUMMARY_SYSTEM_PROMPT },
      { role: 'user', content: `Summarize the following story segment:\n\n${text}` },
    ],
    { temperature: 0.4, maxTokens: sumMaxTokens }
  );

  // Strip thinking tags if the model wraps its reasoning in <think>...</think>
  const cleanedContent = stripThinkingTags(content);
  if (cleanedContent !== content) {
    logger.info(MOD, `Stripped thinking tags from summary (${content.length} → ${cleanedContent.length} chars)`);
  }

  const chapter = messages[0]?.chapter ?? 1;
  const summary: Summary = {
    id: uuidv4(),
    chapter,
    fromMessageId: messages[0].id,
    toMessageId: messages[messages.length - 1].id,
    content: cleanedContent.trim(),
    createdAt: new Date().toISOString(),
  };
  fm.saveSummary(gameId, summary);

  // Mark messages as summarized in history
  const summarizedIds = new Set(messages.map((m) => m.id));
  const updated = fm.getAllMessages(gameId).map((m) =>
    summarizedIds.has(m.id) ? { ...m, summarized: true } : m
  );
  fm.rewriteAllMessages(gameId, updated);

  return summary;
}

/**
 * Strip inline thinking tags that some models wrap around their reasoning.
 */
function stripThinkingTags(text: string): string {
  if (!text) return text;
  let cleaned = text.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, '');
  cleaned = cleaned.replace(/<thought[^>]*>[\s\S]*?<\/thought>/gi, '');
  cleaned = cleaned.trim();
  if (!cleaned) return text; // If everything was in thinking tags, keep the original
  return cleaned;
}
