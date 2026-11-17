import React, { useState } from 'react';
import * as api from '../../api';
import type { ImageMode } from '../../types';
import type { QuickChatEntry } from '../../hooks/useImageStudio';
import { LoadingSpinner } from '../common/LoadingSpinner';

export interface ImageQuickChatProps {
  gameId: string | null;
  currentMode: ImageMode;
  lastPrompt?: string;
  onApplyPrompt: (
    prompt: string,
    negativePrompt: string,
    identity?: { subjectNpcIds?: string[]; identityAnchor?: string },
  ) => void;
  onApplyAndGenerate: (
    prompt: string,
    negativePrompt: string,
    identity?: { subjectNpcIds?: string[]; identityAnchor?: string },
  ) => void;
  /** Persisted across studio close/reopen — lives in useImageStudio hook. */
  history: QuickChatEntry[];
  appendHistory: (entry: QuickChatEntry) => void;
  clearHistory: () => void;
  // v1.1.20 identity continuity props ------------------------------------
  /** Subjects currently locked into the studio state from the last applied chat entry. */
  subjectNpcIds: string[];
  /** Server-prepended identity anchor for the active subjects (display only). */
  identityAnchor: string;
  /** Whether identity-seed lock is currently armed. Only meaningful for single-subject. */
  lockIdentitySeed: boolean;
  onToggleLockIdentitySeed: (lock: boolean) => void;
}

export function ImageQuickChat({
  gameId,
  currentMode,
  lastPrompt,
  onApplyPrompt,
  onApplyAndGenerate,
  history,
  appendHistory,
  clearHistory,
  subjectNpcIds,
  identityAnchor,
  lockIdentitySeed,
  onToggleLockIdentitySeed,
}: ImageQuickChatProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRaw, setExpandedRaw] = useState<string | null>(null);

  const submit = async () => {
    if (!gameId || !value.trim() || loading) return;
    setLoading(true);
    setError(null);
    const userText = value.trim();
    setValue('');
    try {
      const resp = await api.imageChat(gameId, userText, { mode: currentMode, lastPrompt });
      // eslint-disable-next-line no-console
      console.log('[ImageQuickChat] API response:', JSON.stringify(resp));
      appendHistory({
        id: Math.random().toString(36).slice(2),
        user: userText,
        prompt: resp.prompt ?? '',
        negativePrompt: resp.negativePrompt ?? '',
        mode: resp.mode,
        reasoning: resp.reasoning,
        source: resp.source,
        rawResponse: resp.rawResponse,
        subjectNpcIds: resp.subjectNpcIds,
        identityAnchor: resp.identityAnchor,
        sceneDelta: resp.sceneDelta,
        repairedTokens: resp.repairedTokens,
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to get prompt');
    } finally {
      setLoading(false);
    }
  };

  // v1.1.20: derived display values for the active-identity panel
  const subjectCount = subjectNpcIds.length;
  const showIdentityPanel = subjectCount > 0 || identityAnchor.length > 0;
  const multiSubject = subjectCount > 1;
  const lockSupported = subjectCount === 1;

  return (
    <div className="border-t border-border pt-3 mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-wider text-text-muted font-semibold">
          Quick chat
        </div>
        {history.length > 0 && (
          <button
            className="btn btn-ghost !py-0.5 !px-1.5 !text-[10px]"
            onClick={clearHistory}
            title="Clear chat history"
          >
            Clear
          </button>
        )}
      </div>
      <div className="text-[11px] text-text-muted">
        Describe what you want and the model will produce a prompt you can apply.
      </div>

      {/* v1.1.20: active identity / multi-character panel ----------------- */}
      {showIdentityPanel && (
        <div className="rounded border border-border bg-black/20 p-2 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] uppercase tracking-wider text-accent font-semibold">
              {multiSubject ? `Identity locked · ${subjectCount} subjects` : 'Identity locked'}
            </div>
            <label
              className={`flex items-center gap-1 text-[10px] ${
                lockSupported ? 'text-text-primary cursor-pointer' : 'text-text-muted cursor-not-allowed'
              }`}
              title={
                lockSupported
                  ? 'Reuse the saved identity seed for every batch entry'
                  : 'Seed lock is single-subject only — multi-character scenes over-constrain composition'
              }
            >
              <input
                type="checkbox"
                checked={lockSupported && lockIdentitySeed}
                disabled={!lockSupported}
                onChange={(e) => onToggleLockIdentitySeed(e.target.checked)}
                className="w-3 h-3"
              />
              Lock seed
            </label>
          </div>
          {identityAnchor && (
            <div className="mono text-[10px] text-text-muted whitespace-pre-wrap break-words">
              {identityAnchor}
            </div>
          )}
          {multiSubject && (
            <div className="text-[10px] text-warning bg-warning/10 border border-warning/40 rounded px-1.5 py-1">
              Diffusion models struggle with multi-character scenes. Consider generating subjects
              separately for best identity continuity, then composite or use img2img.
            </div>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {history.map((h) => {
            const hSubjects = h.subjectNpcIds || [];
            const hMulti = hSubjects.length > 1;
            const identityForApply = {
              subjectNpcIds: hSubjects,
              identityAnchor: h.identityAnchor || '',
            };
            return (
              <div key={h.id} className="card p-2 space-y-1">
                <div className="text-xs text-text-muted">
                  <span className="text-text-primary">You:</span> {h.user}
                </div>
                {h.prompt ? (
                  <div className="mono text-[11px] text-text-primary whitespace-pre-wrap">
                    {h.prompt}
                  </div>
                ) : (
                  <div className="text-[11px] text-error italic">
                    No prompt generated. {h.reasoning || 'Check console for details.'}
                  </div>
                )}
                {h.negativePrompt && (
                  <div className="mono text-[10px] text-text-muted whitespace-pre-wrap">
                    neg: {h.negativePrompt}
                  </div>
                )}
                {h.reasoning && h.prompt && (
                  <div className="text-[10px] text-text-muted italic">{h.reasoning}</div>
                )}
                {hSubjects.length > 0 && (
                  <div className="text-[10px] text-accent">
                    {hMulti ? `${hSubjects.length} subjects` : '1 subject'}
                    {hMulti && (
                      <span className="text-warning ml-1">
                        · multi-character — diffusion may struggle
                      </span>
                    )}
                  </div>
                )}

                <div className="flex gap-1 pt-1 flex-wrap">
                  {h.prompt && (
                    <>
                      <button
                        className="btn !py-1 !px-2 !text-[10px]"
                        onClick={() => onApplyPrompt(h.prompt, h.negativePrompt, identityForApply)}
                      >
                        Edit prompt
                      </button>
                      <button
                        className="btn btn-primary !py-1 !px-2 !text-[10px]"
                        onClick={() =>
                          onApplyAndGenerate(h.prompt, h.negativePrompt, identityForApply)
                        }
                      >
                        Generate
                      </button>
                    </>
                  )}
                  <button
                    className="btn !py-1 !px-2 !text-[10px] ml-auto"
                    onClick={() => setExpandedRaw(expandedRaw === h.id ? null : h.id)}
                    title="Show raw LLM response for debugging"
                  >
                    {expandedRaw === h.id ? 'Hide raw' : 'Show raw'}
                  </button>
                </div>

                {expandedRaw === h.id && (
                  <div className="mt-1 rounded bg-black/40 border border-border p-2 max-h-48 overflow-y-auto space-y-1">
                    {h.identityAnchor && (
                      <>
                        <div className="text-[10px] text-accent font-semibold">
                          Identity anchor (server-prepended):
                        </div>
                        <pre className="mono text-[10px] text-text-primary whitespace-pre-wrap break-all">
                          {h.identityAnchor}
                        </pre>
                      </>
                    )}
                    {h.sceneDelta && (
                      <>
                        <div className="text-[10px] text-accent font-semibold mt-1">
                          Scene delta (LLM-supplied):
                        </div>
                        <pre className="mono text-[10px] text-text-primary whitespace-pre-wrap break-all">
                          {h.sceneDelta}
                        </pre>
                      </>
                    )}
                    {h.repairedTokens && h.repairedTokens.length > 0 && (
                      <div className="text-[10px] text-warning">
                        Safety-net repaired{' '}
                        {h.repairedTokens.reduce((n, r) => n + r.added.length, 0)} missing identity
                        token(s)
                      </div>
                    )}
                    <div className="text-[10px] text-text-muted font-semibold mt-1">
                      Raw LLM response:
                    </div>
                    <pre className="mono text-[10px] text-text-primary whitespace-pre-wrap break-all">
                      {h.rawResponse || '(empty — LLM returned no content)'}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="rounded border border-error text-error bg-error/10 px-2 py-1 text-[11px]">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="e.g. Raven standing on a rooftop at dusk"
          className="flex-1 text-xs"
          disabled={!gameId || loading}
        />
        <button
          className="btn btn-primary !px-3"
          onClick={() => void submit()}
          disabled={!gameId || !value.trim() || loading}
        >
          {loading ? <LoadingSpinner size={14} /> : 'Ask'}
        </button>
      </div>
    </div>
  );
}
