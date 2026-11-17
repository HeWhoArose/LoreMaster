import React, { useEffect, useRef, useState } from 'react';
import { designChat, type DesignChatMessage, type DesignDraft } from '../../api';
import { LoadingSpinner } from '../common/LoadingSpinner';

export interface DesignGameChatProps {
  /** Called when the model has produced a draft and the user clicks "Apply to form". */
  onApplyDraft: (draft: DesignDraft) => void;
}

const INTRO_MESSAGE: DesignChatMessage = {
  role: 'assistant',
  content:
    "Hey — let's design your game together. Give me whatever you've got: a vibe, a one-liner, a genre, a character idea — and I'll help fill in the rest. When you're happy with where it's at, just say something like \"make it\" and I'll hand it off to the form for you to review.",
};

export function DesignGameChat({ onApplyDraft }: DesignGameChatProps) {
  const [history, setHistory] = useState<DesignChatMessage[]>([INTRO_MESSAGE]);
  const [draft, setDraft] = useState<DesignDraft | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, sending, draft]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setError(null);
    const nextHistory: DesignChatMessage[] = [...history, { role: 'user', content: text }];
    setHistory(nextHistory);
    setInput('');
    setSending(true);
    try {
      // Skip the synthetic intro message when sending to the server — the system
      // prompt already covers the assistant's framing.
      const toSend = nextHistory.filter((m) => m !== INTRO_MESSAGE);
      const res = await designChat(toSend);
      const assistantContent = res.reply.trim() || (res.suggestion ? 'Draft ready below.' : '…');
      setHistory((h) => [...h, { role: 'assistant', content: assistantContent }]);
      if (res.suggestion) setDraft(res.suggestion);
    } catch (e: any) {
      setError(e?.message || 'Failed to chat with the design agent');
    } finally {
      setSending(false);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const apply = () => {
    if (draft) onApplyDraft(draft);
  };

  const discardDraft = () => setDraft(null);

  return (
    <div className="flex flex-col h-full min-h-[60vh]">
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto pr-1 space-y-3"
        aria-live="polite"
      >
        {history.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.content}
          </Bubble>
        ))}
        {sending && (
          <Bubble role="assistant">
            <span className="inline-flex items-center gap-2 text-text-muted">
              <LoadingSpinner size={14} label="Thinking" />
              <span className="text-xs">thinking…</span>
            </span>
          </Bubble>
        )}
        {draft && <DraftPreview draft={draft} onApply={apply} onDiscard={discardDraft} />}
      </div>

      {error && (
        <div className="mt-2 p-2 rounded border border-error text-error text-xs bg-error/10">
          {error}
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <div className="flex gap-2 items-end">
          <textarea
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Describe what you want, ask questions, or say 'make it' when you're ready…"
            className="flex-1 resize-none"
            disabled={sending}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={send}
            disabled={sending || !input.trim()}
          >
            {sending ? <LoadingSpinner size={14} label="Sending" /> : 'Send'}
          </button>
        </div>
        <div className="text-[10px] text-text-muted mt-1">
          Enter to send · Shift+Enter for newline
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: 'user' | 'assistant'; children: React.ReactNode }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? 'bg-accent/20 border border-accent/40 text-text-primary'
            : 'bg-surface-2 border border-border text-text-primary'
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function DraftPreview({
  draft,
  onApply,
  onDiscard,
}: {
  draft: DesignDraft;
  onApply: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="rounded-lg border border-accent/60 bg-accent/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-accent font-semibold">
          Draft ready
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost !py-1 !px-2 !text-xs" onClick={onDiscard}>
            Discard
          </button>
          <button type="button" className="btn btn-primary !py-1 !px-3 !text-xs" onClick={onApply}>
            Apply to form
          </button>
        </div>
      </div>
      <div className="text-sm text-text-primary">
        <div className="font-semibold">{draft.name || 'Untitled game'}</div>
        {draft.genre && (
          <div className="text-xs text-text-muted">{draft.genre}</div>
        )}
        {draft.description && (
          <div className="text-xs mt-1 text-text-secondary">{draft.description}</div>
        )}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-text-secondary">
        {draft.world?.setting && <Row label="Setting" value={draft.world.setting} />}
        {draft.world?.tone && <Row label="Tone" value={draft.world.tone} />}
        {draft.world?.era && <Row label="Era" value={draft.world.era} />}
        {draft.world?.currencyName && <Row label="Currency" value={draft.world.currencyName} />}
        {draft.player?.name && <Row label="Player" value={draft.player.name} />}
        {draft.player?.stats && Object.keys(draft.player.stats).length > 0 && (
          <Row
            label="Stats"
            value={Object.entries(draft.player.stats)
              .map(([k, v]) => `${k} ${v}`)
              .join(' · ')}
          />
        )}
      </div>
      <div className="text-[10px] text-text-muted">
        You'll be able to edit every field before creating the game.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-text-muted">{label}: </span>
      <span className="text-text-primary">{value}</span>
    </div>
  );
}
