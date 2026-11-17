import { AssembledContext, NPCCharacter } from '../types/index.js';
import { assembleContext } from './contextAssembler.js';
import { getFileManager } from './fileManager.js';

/**
 * Character agent: plays a single NPC based on their character card.
 */
export function buildCharacterSystemPrompt(npc: NPCCharacter): string {
  const displayName = npc.revealedName || npc.name;
  const parts: string[] = [
    `You are role-playing as ${displayName}, an NPC in an interactive story.`,
    '',
    'CRITICAL — NO REASONING OUT LOUD:',
    'Do NOT prefix your reply with an analysis, a thinking process, a numbered breakdown, or any meta commentary about what you are about to do. Do NOT write "Here\'s a thinking process:", "Let me think...", "**Thinking:**", "**Analysis:**", or similar. Do NOT use <think>, <reasoning>, or <thought> tags. Start your reply directly with in-character content (action beat or dialogue). Any pre-reply analysis you need to do, do it silently.',
    '',
    'Write in SillyTavern format:',
    '- Wrap actions, gestures, and descriptions in asterisks: *she crosses her arms*',
    '- Wrap your dialogue in double quotes: "I wouldn\'t do that if I were you."',
    '- Mix both naturally: *She leans forward, lowering her voice.* "Meet me at the docks at midnight."',
    '- Stay in character. Match your voice style and personality.',
    '- Do not speak for the player or invent their actions.',
    '',
    'RESPONSE GUIDELINES:',
    '- Keep responses focused and conversational — 1-3 short paragraphs.',
    '- You are in a direct conversation with the player. Respond as this character would.',
    '- Include brief action beats and your dialogue in character.',
    '- Do NOT write long environmental descriptions, crowd reactions, or world-building exposition.',
    '- Do NOT narrate what the player sees, hears, or perceives beyond your immediate interaction.',
    '- Stay grounded in the conversation — react to what the player said.',
    '',
  ];

  if (npc.personality) parts.push(`Personality: ${npc.personality}`);
  if (npc.voiceStyle) parts.push(`Voice style: ${npc.voiceStyle}`);
  if (npc.background) parts.push(`Background (yours, not necessarily known to player): ${npc.background}`);
  if (npc.knownInfo) parts.push(`What the player currently knows about you: ${npc.knownInfo}`);
  if (npc.dispositionTowardPlayer) parts.push(`Your current disposition toward the player: ${npc.dispositionTowardPlayer}`);

  if (npc.memory && npc.memory.length > 0) {
    parts.push('\nYour recent memories (most recent last):');
    for (const m of npc.memory.slice(-8)) {
      parts.push(`  - [Ch.${m.chapter}] ${m.event}`);
    }
  }

  if (!npc.revealedName && npc.name) {
    parts.push(`\nImportant: The player does not yet know your real name. Respond as "${npc.name}" until that changes.`);
  }

  return parts.join('\n');
}

export function buildCharacterContext(gameId: string, characterId: string): AssembledContext | null {
  const fm = getFileManager();
  const npc = fm.getCharacter(gameId, characterId);
  if (!npc) return null;
  const systemPrompt = buildCharacterSystemPrompt(npc);
  return assembleContext(gameId, {
    agentSystemPrompt: systemPrompt,
    activeCharacterId: characterId,
  });
}
