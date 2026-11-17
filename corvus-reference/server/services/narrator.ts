import { AssembledContext, NPCCharacter, WorldInfo, WorldState } from '../types/index.js';
import { assembleContext } from './contextAssembler.js';
import { getFileManager } from './fileManager.js';

export interface NarratorPromptOptions {
  /**
   * When provided, restricts the storyteller to ONLY voice these named NPCs.
   * Used by group chat mode to lock the scene to a fixed participant list.
   */
  groupParticipants?: { name: string; revealedName: string | null }[];
  /**
   * Optional explicit hint that a particular character should speak next.
   * Used by the group "next speaker" control.
   */
  nextSpeakerName?: string;
  /**
   * v1.1.30: single-speaker mode. When set, the storyteller is locked to
   * ONE [Character: <name>] block voicing this specific NPC. Used by the
   * auto-reply chain in group mode (each character takes its own turn one
   * at a time, SillyTavern-style) and by the per-character "prompt to speak"
   * button on the sidebar profile.
   */
  singleSpeakerName?: string;
  /**
   * v1.1.30: continuation mode. When true, the prompt frames this turn as
   * "advance the scene from where it left off" — the player did NOT type
   * anything, so the storyteller should NOT solicit a player decision or
   * acknowledge a player message. Used by the empty-Enter continue button
   * and by every step of the group auto-reply chain after the first.
   */
  continuation?: boolean;
}

/**
 * Narrator agent: scene-setting, atmosphere, and world description.
 * Not tied to any single NPC — it describes the world around the player.
 */
export function buildNarratorSystemPrompt(
  world: WorldInfo | null,
  _state: WorldState | null,
  npcs: { name: string; revealedName: string | null; status?: 'active' | 'pending' | 'disabled' }[] = [],
  options: NarratorPromptOptions = {}
): string {
  const group = options.groupParticipants;
  const inGroupMode = !!group && group.length > 0;
  // Split for the prompt: ACTIVE npcs are voiceable; DISABLED ones the model
  // should know exist (so dialogue can reference them) but never voice; PENDING
  // never reaches this function (filtered upstream in the context assembler).
  const activeNpcs = npcs.filter((n) => (n.status ?? 'active') === 'active');
  const disabledNpcs = npcs.filter((n) => n.status === 'disabled');
  const fmt = (arr: typeof npcs) => arr.map((n) => n.revealedName || n.name).join(', ');
  let knownNpcLine: string;
  if (inGroupMode) {
    knownNpcLine = `GROUP SCENE — the ONLY characters present in this scene are: ${group!
      .map((n) => n.revealedName || n.name)
      .join(', ')}. Do NOT introduce, voice, or reference any other named character. If the player addresses someone not in this list, narrate that they are absent or unreachable.`;
  } else if (activeNpcs.length) {
    const parts = [`Currently present / known NPCs you can voice: ${fmt(activeNpcs)}.`];
    if (disabledNpcs.length) {
      parts.push(
        `INACTIVE NPCs (you may reference them by name in dialogue or narration if relevant, but DO NOT voice them or act as them this turn — they are off-screen): ${fmt(disabledNpcs)}.`
      );
    }
    knownNpcLine = parts.join(' ');
  } else if (disabledNpcs.length) {
    knownNpcLine = `No active NPCs are present — narrate scene only. (Inactive / off-screen, may be referenced but not voiced: ${fmt(disabledNpcs)}.)`;
  } else {
    knownNpcLine = 'No named NPCs are present yet — narrate scene only until characters appear.';
  }

  const nextSpeakerLine = options.nextSpeakerName
    ? `\nNEXT SPEAKER: ${options.nextSpeakerName} should be the one to respond this turn. Give them the primary [Character: ${options.nextSpeakerName}] block. Other present characters may follow only if it serves the scene.`
    : '';

  // v1.1.30: continuation framing for empty-Enter and auto-reply chain turns.
  const continuationLine = options.continuation
    ? '\nCONTINUATION TURN: The player did NOT type a new message. Continue the scene from exactly where it left off — do not greet the player, do not ask "what do you do?", and do not acknowledge a player action that didn\'t happen. Just let the scene breathe forward: an NPC reacts, the silence stretches, someone fills the gap, the world keeps moving.'
    : '';

  // v1.1.30: single-speaker lockdown. Used by the SillyTavern-style auto-reply
  // chain and the per-NPC "prompt to speak" button. Overrides block budget.
  const singleSpeakerLockdown = options.singleSpeakerName
    ? [
        '',
        'SINGLE-SPEAKER LOCKDOWN — strict rules (override everything else above):',
        `- Your ENTIRE reply must be exactly ONE [Character: ${options.singleSpeakerName}] block. No narrator. No other characters. No multi-block output.`,
        `- Voice ONLY ${options.singleSpeakerName} this turn. The other present characters are listening / reacting silently, but you do NOT write their dialogue or thoughts.`,
        `- ${options.singleSpeakerName} should react to whatever was just said or done in the most recent assistant turn — if another character just spoke, ${options.singleSpeakerName} responds to them directly. This is a real conversation, not a monologue.`,
        '- Keep it focused: one substantial paragraph or two short ones. Dialogue + their own physical beats + their viewpoint. Do not summarize what other characters did — react to it.',
        '- Do NOT speak for the player. Do NOT invent player dialogue or decisions.',
      ].join('\n')
    : '';

  // Narrator can only be turned off if there's at least one NPC to speak.
  // Otherwise we'd have nobody able to talk.
  const narratorOff = world?.narratorEnabled === false && npcs.length > 0;

  if (narratorOff) {
    const parts: string[] = [
      'You are the STORYTELLER of an interactive story. You voice individual NPCs as separate, clearly-tagged blocks — like Discord messages from different speakers. The narrator is DISABLED for this story; everything must come from a character\'s point of view.',
      '',
      'CRITICAL — NO REASONING OUT LOUD:',
      'Do NOT prefix your reply with an analysis, a thinking process, a numbered breakdown, or any meta commentary about what you are about to do. Do NOT write "Here\'s a thinking process:", "Let me think...", "**Thinking:**", "**Analysis:**", or similar. Do NOT use <think>, <reasoning>, or <thought> tags. Your reply MUST start with a [Character: <Name>] tag line. Any pre-reply analysis you need to do, do it silently.',
      '',
      'CRITICAL OUTPUT FORMAT — read carefully:',
      'Your reply is a sequence of [Character: <Name>] blocks. Each block starts on its own line with a tag and is followed by that character\'s text. Use a blank line between blocks. Do NOT mix speakers within one block.',
      '',
      'NARRATOR IS DISABLED — strict rules:',
      '- NEVER emit a [Narrator] block. The [Narrator] tag is forbidden.',
      '- ALL output must be inside [Character: <Name>] blocks.',
      '- Scene description, atmosphere, and actions of OTHER characters must be folded into a present character\'s observations / dialogue / inner perspective. Use their voice and viewpoint.',
      '- If multiple things happen, attribute them through whichever character would naturally observe or react.',
      '',
      'BLOCK BUDGET — follow this strictly:',
      '- Aim for 1–3 blocks total per reply. Only use more if multiple NPCs actually speak.',
      '- Each block should be SUBSTANTIAL — a paragraph or more. Do not emit one-sentence bubbles.',
      '- Each NPC\'s dialogue goes in their OWN block — never combine two characters in one block.',
      '',
      'Tags:',
      '  [Character: <Name>]   — REQUIRED for every block. Use the EXACT name as listed below.',
      '',
      'Example (no narrator allowed):',
      '[Character: Jin]',
      '*She watches the tavern door swing open as a hooded figure stomps the rain off her boots, then leans against the counter and folds her arms.* "You\'re not from around here, are you?" *Her eyes narrow.*',
      '',
      '[Character: Jin]',
      '"Well? Cat got your tongue, stranger?"',
      '',
      'INSIDE EACH BLOCK:',
      '- Wrap actions and descriptions in asterisks: *She glances at you.*',
      '- Wrap dialogue in double quotes: "I don\'t think that\'s wise."',
      '- The block belongs to that named character — their dialogue, their physical beats, and whatever they observe in the scene.',
      '- Do NOT speak for the player or invent the player\'s dialogue/decisions.',
      '',
      'ROLE GUIDELINES:',
      '- Voice NPCs in character — use their personality, voice style, and disposition.',
      '- NPCs should feel alive: they react, speak, emote, and have agency.',
      '- Keep total response focused and in-scene.',
      '- End with something that invites the player to act.',
      '- Respect the tone and rules of the world.',
      '',
      knownNpcLine,
    ];

    if (nextSpeakerLine) parts.push(nextSpeakerLine);
    if (continuationLine) parts.push(continuationLine);
    if (singleSpeakerLockdown) parts.push(singleSpeakerLockdown);

    if (world) {
      if (world.tone) parts.push(`\nTone guidance: ${world.tone}`);
      if (world.rules) parts.push(`World rules: ${world.rules}`);
    }

    return parts.join('\n');
  }

  const parts: string[] = [
    'You are the STORYTELLER of an interactive story. You alternate between narrating the scene and voicing individual NPCs as separate, clearly-tagged blocks — like Discord messages from different speakers.',
    '',
    'CRITICAL — NO REASONING OUT LOUD:',
    'Do NOT prefix your reply with an analysis, a thinking process, a numbered breakdown, or any meta commentary about what you are about to do. Do NOT write "Here\'s a thinking process:", "Let me think...", "**Thinking:**", "**Analysis:**", or similar. Do NOT use <think>, <reasoning>, or <thought> tags. Your reply MUST start with a [Narrator] or [Character: <Name>] tag line. Any pre-reply analysis you need to do, do it silently.',
    '',
    'CRITICAL OUTPUT FORMAT — read carefully:',
    'Your reply is a sequence of speaker BLOCKS. Each block starts on its own line with a tag and is followed by that speaker\'s text. Use a blank line between blocks. Do NOT mix speakers within one block.',
    '',
    'BLOCK BUDGET — follow this strictly:',
    '- Aim for 1–3 blocks total per reply. Only use more if multiple NPCs actually speak.',
    '- If only the narrator is speaking this turn, output exactly ONE [Narrator] block. Do NOT split a single description across multiple [Narrator] blocks.',
    '- Each block should be SUBSTANTIAL — a paragraph or more. Do not emit one-sentence bubbles.',
    '- NEVER emit two [Narrator] blocks in a row. Combine them into one.',
    '',
    'Tags:',
    '  [Narrator]            — for scene description, action, atmosphere, and any character\'s physical actions / non-verbal beats.',
    '  [Character: <Name>]   — for an NPC speaking. Use the EXACT name as listed below.',
    '',
    'Example:',
    '[Narrator]',
    '*The tavern door creaks open. A gust of cold rain sweeps in behind a hooded figure who shakes off her cloak.*',
    '',
    '[Character: Jin]',
    '*She leans against the counter, arms folded.* "You\'re not from around here, are you?" *Her eyes narrow.*',
    '',
    '[Narrator]',
    '*The barkeep glances up briefly, then returns to polishing a glass.*',
    '',
    '[Character: Jin]',
    '"Well? Cat got your tongue, stranger?"',
    '',
    'INSIDE EACH BLOCK:',
    '- Wrap actions and descriptions in asterisks: *She glances at you.*',
    '- Wrap dialogue in double quotes: "I don\'t think that\'s wise."',
    '- A [Character: …] block is THAT character\'s on-screen turn — their dialogue plus their own immediate physical beats. Other characters\' actions go in [Narrator].',
    '- Do NOT speak for the player or invent the player\'s dialogue/decisions.',
    '',
    'WHEN TO SWITCH:',
    '- Switch to [Narrator] for scene-setting, environmental description, or non-verbal moments.',
    '- Switch to a [Character: …] block whenever an NPC speaks. Each NPC\'s dialogue goes in their OWN block — never combine two characters\' dialogue in one block.',
    '- Use back-and-forth blocks ONLY when there is a real conversation rhythm. A single reply should rarely exceed 3 blocks.',
    '',
    'CHARACTERS REACT TO EACH OTHER:',
    '- When more than one NPC is present, write them as people in the same room. They have their own opinions of each other (allies, rivals, friends, strangers) and they hear what the other says.',
    '- If Character A says something, Character B should react to A — not just deliver their own monologue. Eye contact, contradiction, agreement, side-eye, interruption, a quiet aside — these are what make a group scene feel alive.',
    '- Different speakers have different opinions and voices. Don\'t homogenize them; lean into disagreement and personality contrast.',
    '',
    'ROLE GUIDELINES:',
    '- Voice NPCs in character — use their personality, voice style, and disposition.',
    '- NPCs should feel alive: they react, speak, emote, and have agency.',
    '- Keep total response focused and in-scene.',
    '- End with something that invites the player to act.',
    '- Respect the tone and rules of the world.',
    '',
    knownNpcLine,
  ];

  if (nextSpeakerLine) parts.push(nextSpeakerLine);
  if (continuationLine) parts.push(continuationLine);
  if (singleSpeakerLockdown) parts.push(singleSpeakerLockdown);

  if (world) {
    if (world.tone) parts.push(`\nTone guidance: ${world.tone}`);
    if (world.rules) parts.push(`World rules: ${world.rules}`);
  }

  return parts.join('\n');
}

export function buildNarratorContext(
  gameId: string,
  options: { continuation?: boolean } = {}
): AssembledContext {
  const fm = getFileManager();
  const world = fm.getWorld(gameId);
  const state = fm.getWorldState(gameId);
  // (v1.1.28) Drop pending NPCs entirely, carry status forward for active and
  // disabled so the prompt can render the "INACTIVE NPCs" line correctly.
  const npcs = fm
    .listCharacters(gameId)
    .filter((n) => (n.status ?? 'active') !== 'pending')
    .map((n) => ({ name: n.name, revealedName: n.revealedName, status: n.status }));
  const systemPrompt = buildNarratorSystemPrompt(world, state, npcs, {
    continuation: options.continuation,
  });
  return assembleContext(gameId, { agentSystemPrompt: systemPrompt });
}

/**
 * Group-chat context: like narrator mode but the system prompt locks the scene
 * to a fixed list of participating NPCs. Optionally hints at the next speaker.
 */
export interface GroupContextOptions {
  nextSpeakerId?: string;
  /** v1.1.30: lock the storyteller to one specific NPC for this turn. */
  singleSpeakerId?: string;
  /** v1.1.30: frame the turn as a continuation (no player message). */
  continuation?: boolean;
}

export function buildGroupContext(
  gameId: string,
  participantIds: string[],
  options: GroupContextOptions = {}
): AssembledContext {
  const fm = getFileManager();
  const world = fm.getWorld(gameId);
  const state = fm.getWorldState(gameId);
  // (v1.1.28) Pending NPCs cannot be group participants. Disabled NPCs technically
  // can't either (the user took them off-screen), so filter both out of the
  // participant list. If the caller passed an id for a hidden NPC, it silently
  // drops — the LLM never gets to voice them.
  const allNpcs = fm.listCharacters(gameId).filter((n) => (n.status ?? 'active') === 'active');
  const participants = allNpcs.filter((n) => participantIds.includes(n.id));
  // Fall back to plain narrator behavior if none of the ids match a known NPC.
  if (participants.length === 0) {
    return buildNarratorContext(gameId, { continuation: options.continuation });
  }
  const participantSummaries = participants.map((n: NPCCharacter) => ({
    name: n.name,
    revealedName: n.revealedName,
  }));
  const nextSpeaker = options.nextSpeakerId
    ? allNpcs.find((n) => n.id === options.nextSpeakerId)
    : undefined;
  const singleSpeaker = options.singleSpeakerId
    ? allNpcs.find((n) => n.id === options.singleSpeakerId)
    : undefined;
  const systemPrompt = buildNarratorSystemPrompt(world, state, participantSummaries, {
    groupParticipants: participantSummaries,
    nextSpeakerName: nextSpeaker ? nextSpeaker.revealedName || nextSpeaker.name : undefined,
    singleSpeakerName: singleSpeaker
      ? singleSpeaker.revealedName || singleSpeaker.name
      : undefined,
    continuation: options.continuation,
  });
  return assembleContext(gameId, { agentSystemPrompt: systemPrompt });
}
