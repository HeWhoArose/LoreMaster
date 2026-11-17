import { useCallback, useEffect, useRef, useState } from 'react';
import * as api from '../api';
import type { ChatMessage, NPCCharacter, PlayerCharacter, WorldState } from '../types';

export interface ChatStreamStatus {
  streaming: boolean;
  processing: boolean; // streaming finished, GM is post-processing
  error: string | null;
}

export interface GameStateUpdate {
  player?: PlayerCharacter;
  characters?: NPCCharacter[];
  worldState?: WorldState;
}

export function useChat(gameId: string | null, onGmUpdate?: (u: GameStateUpdate) => void) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ChatStreamStatus>({
    streaming: false,
    processing: false,
    error: null,
  });
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onGmUpdateRef = useRef(onGmUpdate);
  onGmUpdateRef.current = onGmUpdate;

  const refresh = useCallback(async () => {
    if (!gameId) {
      setMessages([]);
      return;
    }
    setLoading(true);
    try {
      const history = await api.getHistory(gameId);
      setMessages(history);
    } catch (e: any) {
      setStatus((s) => ({ ...s, error: e?.message || 'Failed to load history' }));
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Cancel any ongoing stream when game changes or on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, [gameId]);

  const appendOrReplace = useCallback((msg: ChatMessage) => {
    if (!msg || !msg.id) {
      // eslint-disable-next-line no-console
      console.warn('[useChat] appendOrReplace called with invalid message — ignoring', msg);
      return;
    }
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = msg;
        return copy;
      }
      return [...prev, msg];
    });
  }, []);

  const streamWith = useCallback(
    async (invoker: (handlers: api.StreamHandlers, signal: AbortSignal) => Promise<void>) => {
      if (!gameId) return;
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setStatus({ streaming: true, processing: false, error: null });
      setStreamingContent('');
      setStreamingId(null);
      let streamingBuf = '';
      let captured = false;

      try {
        await invoker(
          {
            onMessage: (m) => {
              // Server sends the shell of the assistant message (id, role) before tokens
              setStreamingId(m.id);
              captured = true;
              appendOrReplace({ ...m, content: '' });
            },
            onToken: (content) => {
              streamingBuf += content;
              setStreamingContent(streamingBuf);
            },
            onDone: (m) => {
              appendOrReplace(m);
              setStreamingContent('');
              setStreamingId(null);
              setStatus((s) => ({ ...s, streaming: false, processing: true }));
            },
            onGmUpdate: (data) => {
              onGmUpdateRef.current?.(data);
              setStatus((s) => ({ ...s, processing: false }));
            },
            onError: (err) => {
              setStatus({ streaming: false, processing: false, error: err });
            },
          },
          ctrl.signal,
        );
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('[useChat] streamWith error:', err);
        setStreamingContent('');
        setStreamingId(null);
        setStatus({ streaming: false, processing: false, error: err?.message || 'Stream failed' });
      }

      // Ensure status resets even if no gm_update event was emitted
      setStatus((s) =>
        s.streaming || s.processing ? { streaming: false, processing: false, error: s.error } : s,
      );
      if (!captured) {
        // Fall back to refreshing history in case the server emitted only a final message
        await refresh();
      }
    },
    [gameId, appendOrReplace, refresh],
  );

  const sendMessage = useCallback(
    async (content: string, opts?: api.SendMessageOpts) => {
      if (!gameId) return;
      // v1.1.30: empty content = continuation / auto-reply / prompt-to-speak.
      // Don't push a local user bubble in that case — the server doesn't save
      // one either, so the optimistic echo would get reconciled away anyway.
      const hasContent = content.trim().length > 0;
      if (hasContent) {
        const userMsg: ChatMessage = {
          id: `local-${Date.now()}`,
          role: 'user',
          type: 'user',
          content,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, userMsg]);
      }
      await streamWith((handlers, signal) => api.sendMessage(gameId, content, handlers, signal, opts));
      await refresh();
    },
    [gameId, streamWith, refresh],
  );

  const regenerate = useCallback(
    async (messageId: string) => {
      if (!gameId) return;
      await streamWith((handlers, signal) =>
        api.regenerateMessage(gameId, messageId, handlers, signal),
      );
      await refresh();
    },
    [gameId, streamWith, refresh],
  );

  const editMessage = useCallback(
    async (messageId: string, content: string, regenerateFollowing = false) => {
      if (!gameId) return;
      const updated = await api.editMessage(gameId, messageId, content, { regenerateFollowing });
      appendOrReplace(updated);
      if (regenerateFollowing) {
        // Find the following assistant message and regenerate it
        const idx = messages.findIndex((m) => m.id === messageId);
        const next = messages[idx + 1];
        if (next && next.role === 'assistant') {
          await regenerate(next.id);
        } else {
          await refresh();
        }
      }
    },
    [gameId, messages, appendOrReplace, regenerate, refresh],
  );

  const deleteMessage = useCallback(
    async (messageId: string) => {
      if (!gameId) return;
      await api.deleteMessage(gameId, messageId);
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    },
    [gameId],
  );

  const selectAlternative = useCallback(
    async (messageId: string, index: number) => {
      if (!gameId) return;
      const updated = await api.selectAlternative(gameId, messageId, index);
      appendOrReplace(updated);
    },
    [gameId, appendOrReplace],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setStatus({ streaming: false, processing: false, error: null });
  }, []);

  return {
    messages,
    loading,
    status,
    streamingContent,
    streamingId,
    sendMessage,
    regenerate,
    editMessage,
    deleteMessage,
    selectAlternative,
    stopStream,
    refresh,
  };
}
