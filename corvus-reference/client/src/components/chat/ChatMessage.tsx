import React, { useEffect, useRef, useState } from 'react';
import * as api from '../../api';
import type { ChatMessage as ChatMessageType, GlobalConfig, NPCCharacter } from '../../types';
import { colorForCharacter } from '../../utils/chatColors';
import { MessageControls } from './MessageControls';
import { useTTS } from '../../context/TTSContext';
import { splitDialogue } from '../../utils/dialogueSplit';
import { useSettings } from '../../hooks/useSettings';

export interface ChatMessageProps {
  /** v1.1.31: Needed to compose the portrait URL via api.getImageURL when a
   *  speaking character has an `image.portraitPath` set. Optional so the
   *  component still renders if a parent forgets to wire it. */
  gameId?: string | null;
  message: ChatMessageType;
  characters: NPCCharacter[];
  appearance?: GlobalConfig['appearance'] | null;
  isStreaming?: boolean;
  streamingContent?: string;
  disabled?: boolean;
  onEdit: (id: string, newContent: string, regenerateFollowing: boolean) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onRegenerate: (id: string) => void | Promise<void>;
  onSwipe: (id: string, newIndex: number) => void | Promise<void>;
}

/**
 * Per-message resolved colors, computed once and threaded into the inline
 * renderer. Each value is either a hex color override, or null meaning
 * "fall through to the CSS class".
 */
interface ResolvedColors {
  /** Color for the speaker name + base text of this message's speaker. */
  speakerColor: string | null;
  /** Color for narrator-tagged text (italic _..._). */
  narratorColor: string | null;
  /** Color for *action* / italic text. */
  actionColor: string | null;
  /** Color for "dialogue" inside double quotes. */
  dialogueColor: string | null;
}

/**
 * Render chat content. For mixed messages we use a simple heuristic:
 *  - Lines wrapped in double quotes "..." are styled as dialogue.
 *  - Lines wrapped in asterisks *like this* are styled as action.
 *  - Lines wrapped in underscores _..._ are treated as narration.
 *  - Otherwise, the default text uses the speaker's color.
 */
function renderContent(
  content: string,
  type: ChatMessageType['type'],
  colors: ResolvedColors,
): React.ReactNode {
  if (!content) return null;
  const safeContent = typeof content === 'string' ? content : String(content ?? '');
  if (!safeContent) return null;

  const paragraphs = safeContent.split(/\n\n+/);
  return paragraphs.map((para, i) => (
    <p key={i} className="mb-2 last:mb-0">
      {renderInline(para, type, colors)}
    </p>
  ));
}

function renderInline(
  text: string,
  type: ChatMessageType['type'],
  colors: ResolvedColors,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /("[^"]+"|\*[^*]+\*|_[^_]+_)/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  // Base color for un-styled spans. For 'narrator' messages, that's the
  // narrator color; for 'character' messages, that's the speaker color;
  // for 'mixed' / 'user', we leave the color alone (inherited).
  const baseHexColor =
    type === 'narrator'
      ? colors.narratorColor
      : type === 'character'
        ? colors.speakerColor
        : null;
  const baseCssClass =
    type === 'narrator' && !colors.narratorColor
      ? 'narrator-text'
      : type === 'character' && !colors.speakerColor
        ? 'character-text'
        : '';

  const baseStyle: React.CSSProperties | undefined = baseHexColor
    ? { color: baseHexColor }
    : undefined;

  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(
        <span key={key++} className={baseCssClass} style={baseStyle}>
          {text.slice(lastIndex, m.index)}
        </span>,
      );
    }
    const tok = m[0];
    if (tok.startsWith('"')) {
      // Dialogue — use character/dialogue color when available
      const dialogueStyle = colors.dialogueColor
        ? { color: colors.dialogueColor }
        : undefined;
      parts.push(
        <span
          key={key++}
          className={colors.dialogueColor ? '' : 'character-text'}
          style={dialogueStyle}
        >
          {tok}
        </span>,
      );
    } else if (tok.startsWith('*')) {
      // Action — italic
      const actionStyle = colors.actionColor
        ? { color: colors.actionColor, fontStyle: 'italic' as const }
        : undefined;
      parts.push(
        <em
          key={key++}
          className={colors.actionColor ? '' : 'action-text'}
          style={actionStyle}
        >
          {tok.slice(1, -1)}
        </em>,
      );
    } else if (tok.startsWith('_')) {
      // Narrator-tagged inline
      const narrStyle = colors.narratorColor
        ? { color: colors.narratorColor, fontStyle: 'italic' as const }
        : undefined;
      parts.push(
        <em
          key={key++}
          className={colors.narratorColor ? '' : 'narrator-text'}
          style={narrStyle}
        >
          {tok.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    parts.push(
      <span key={key++} className={baseCssClass} style={baseStyle}>
        {text.slice(lastIndex)}
      </span>,
    );
  }
  return parts;
}

export function ChatMessage({
  gameId,
  message,
  characters,
  appearance,
  isStreaming,
  streamingContent,
  disabled,
  onEdit,
  onDelete,
  onRegenerate,
  onSwipe,
}: ChatMessageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [hovered, setHovered] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const content = isStreaming ? streamingContent || '' : message.content;

  const character = message.characterId ? characters.find((c) => c.id === message.characterId) : null;

  // Resolve all colors for this message in one place.
  // Per-character override > global appearance setting > default CSS class.
  const narratorColor = appearance?.narratorColor || null;
  const actionColor = (character?.actionColor ?? null) || appearance?.actionColor || null;
  const speakerColor = character ? colorForCharacter(character) : null;
  // Dialogue ("...") inside a character message picks up that character's color,
  // otherwise falls back to the default character-text CSS variable.
  const dialogueColor = speakerColor;

  const resolvedColors: ResolvedColors = {
    speakerColor,
    narratorColor,
    actionColor,
    dialogueColor,
  };

  // Discord-style speaker label
  let speakerLabel: string | null = null;
  let speakerLabelColor: string | null = null;
  let speakerLabelClass = '';
  if (character) {
    speakerLabel = character.revealedName || character.name || 'Unknown';
    speakerLabelColor = speakerColor;
  } else if (message.type === 'narrator' && message.role === 'assistant') {
    speakerLabel = 'Narrator';
    speakerLabelColor = narratorColor;
    if (!narratorColor) speakerLabelClass = 'narrator-text';
  } else if (message.type === 'character' && message.role === 'assistant' && !character) {
    speakerLabel = 'Character';
    speakerLabelClass = 'character-text';
  }

  const altTotal = message.alternatives ? message.alternatives.length + 1 : 1;
  const altIndex = message.currentAlternative ?? 0;

  // v1.1.42 — manual Play button for any storyteller/character message.
  const tts = useTTS();
  const ttsCfg = useSettings().settings?.tts;
  const canTTS = !isUser && !isSystem && !isStreaming && !!content;
  const playMessage = () => {
    if (!canTTS) return;
    const narratorVoice = ttsCfg?.narratorVoice || '';
    const speaker = character;
    if (speaker) {
      // Single-speaker message — enqueue the whole thing with their voice.
      const voice = speaker.tts?.enabled === false ? narratorVoice : (speaker.tts?.voice || narratorVoice);
      tts.playNow([{ voice, text: content, label: speakerLabel || speaker.name, speaker: speaker.id }]);
      return;
    }
    // Storyteller / narrator message — run the dialogue splitter.
    const segments = splitDialogue(content, {
      npcs: characters.map((c) => ({
        id: c.id,
        name: c.revealedName || c.name,
        voice: c.tts?.voice,
        enabled: c.tts?.enabled,
      })),
      narratorVoice,
    });
    if (!segments.length) return;
    const labelFor = (speakerId?: string) => {
      if (!speakerId) return 'Narrator';
      const c = characters.find((x) => x.id === speakerId);
      return c ? (c.revealedName || c.name) : 'Narrator';
    };
    tts.playNow(segments.map((s) => ({
      voice: s.voice,
      text: s.text,
      label: labelFor(s.speaker),
      speaker: s.speaker,
    })));
  };

  useEffect(() => {
    if (editing) {
      setDraft(message.content);
      setTimeout(() => {
        const ta = textareaRef.current;
        if (ta) {
          ta.focus();
          ta.setSelectionRange(ta.value.length, ta.value.length);
          autoGrow(ta);
        }
      }, 0);
    }
  }, [editing, message.content]);

  const autoGrow = (ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 400) + 'px';
  };

  const saveEdit = async () => {
    if (draft.trim() === message.content.trim()) {
      setEditing(false);
      return;
    }
    await onEdit(message.id, draft, isUser /* regenerate following if user edit */);
    setEditing(false);
  };

  // v1.1.31: When a character has a portrait, show a small avatar next to
  // their text block (left side, same row as the bubble). The bubble keeps
  // its existing 85% max-width; the avatar is a separate 32px element.
  const portraitUrl =
    gameId && character?.image?.portraitPath
      ? api.getImageURL(gameId, character.image.portraitPath)
      : null;

  const alignment = isUser ? 'items-end' : 'items-start';
  const bubbleBase = 'rounded-lg px-4 py-3 max-w-[85%] prose-chat';
  const bubbleClass = isUser
    ? `${bubbleBase} bg-accent/20 border border-accent/30 text-text-primary`
    : isSystem
      ? `${bubbleBase} bg-surface-2 border border-border text-text-muted text-sm italic`
      : `${bubbleBase} bg-surface-2 border border-border`;

  const isStreamingThis = isStreaming;

  return (
    <div
      className={`flex flex-col ${alignment} gap-1 animate-fade-in group`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {speakerLabel && !isUser && !isSystem && (
        <div
          className={`text-xs ${speakerLabelClass} font-semibold ml-1`}
          style={speakerLabelColor ? { color: speakerLabelColor } : undefined}
        >
          {speakerLabel}
        </div>
      )}

      {/* v1.1.31: Portrait + bubble live on the same row for assistant
          messages with a character portrait. For everything else (user
          messages, system messages, or character messages without a
          portrait), we keep the original single-bubble layout to avoid
          shifting historical messages around. */}
      <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start max-w-full`}>
        {portraitUrl && !isUser && !isSystem && (
          <img
            src={portraitUrl}
            alt={speakerLabel || 'speaker'}
            className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0 mt-0.5"
            title={speakerLabel || undefined}
            loading="lazy"
          />
        )}
        <div className={`${bubbleClass}${editing ? ' w-full' : ''}`}>
        {editing ? (
          <div className="flex flex-col gap-2">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                autoGrow(e.target);
              }}
              className="w-full mono text-sm min-h-[80px]"
            />
            <div className="flex justify-end gap-2">
              <button className="btn btn-ghost text-xs" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button className="btn btn-primary text-xs" onClick={saveEdit}>
                Save{isUser && ' & Regenerate'}
              </button>
            </div>
          </div>
        ) : (
          <div>
            {renderContent(content, message.type, resolvedColors)}
            {isStreamingThis && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-accent animate-pulse align-middle" />
            )}
          </div>
        )}
        </div>
      </div>

      {!editing && !isStreamingThis && (
        <div
          className={`transition-opacity ${hovered ? 'opacity-100' : 'opacity-0'} ${isUser ? 'self-end' : 'self-start'} flex items-center gap-1`}
        >
          {canTTS && tts.enabled && (
            <button
              className="btn btn-ghost !p-1 text-text-muted"
              onClick={playMessage}
              disabled={disabled}
              title="Read aloud"
              aria-label="Read aloud"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            </button>
          )}
          <MessageControls
            message={message}
            isUser={isUser}
            disabled={disabled}
            onEdit={() => setEditing(true)}
            onDelete={() => onDelete(message.id)}
            onRegenerate={!isUser ? () => onRegenerate(message.id) : undefined}
            onSwipeLeft={() => onSwipe(message.id, Math.max(0, altIndex - 1))}
            onSwipeRight={() => onSwipe(message.id, Math.min(altTotal - 1, altIndex + 1))}
            alternativeIndex={altIndex}
            alternativeTotal={altTotal}
          />
        </div>
      )}
    </div>
  );
}
