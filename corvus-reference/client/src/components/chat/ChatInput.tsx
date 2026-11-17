import React, { useEffect, useRef, useState } from 'react';

export interface ChatInputProps {
  disabled?: boolean;
  onSubmit: (content: string) => void;
  onStop?: () => void;
  streaming?: boolean;
  placeholder?: string;
  /**
   * Allow submitting with empty content as a "continue / advance scene" turn.
   * Default true. When the textarea is empty, Enter / the send button fires
   * onSubmit('') and the backend treats it as a continuation turn.
   */
  allowEmptySubmit?: boolean;
}

export function ChatInput({
  disabled,
  onSubmit,
  onStop,
  streaming,
  placeholder = 'Describe your action, or speak to someone…',
  allowEmptySubmit = true,
}: ChatInputProps) {
  const [value, setValue] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const autoGrow = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lineHeight = 22; // ~14px font * 1.5 line height
    const maxHeight = lineHeight * 6 + 16;
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + 'px';
  };

  useEffect(() => {
    autoGrow();
  }, [value]);

  const isEmpty = value.trim().length === 0;

  const submit = () => {
    if (disabled) return;
    if (isEmpty) {
      if (!allowEmptySubmit) return;
      onSubmit('');
      // leave value as-is (already empty)
      return;
    }
    onSubmit(value.trim());
    setValue('');
  };

  const sendDisabled = disabled || (isEmpty && !allowEmptySubmit);
  const showContinue = isEmpty && allowEmptySubmit;

  return (
    <div className="p-3 border-t border-border bg-surface flex-shrink-0">
      <div className="flex items-end gap-2 max-w-4xl mx-auto">
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none min-h-[44px] max-h-[160px]"
        />
        {streaming && onStop ? (
          <button className="btn btn-danger !px-3 !py-2" onClick={onStop} title="Stop streaming">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </button>
        ) : (
          <button
            className={showContinue ? 'btn btn-secondary !px-3 !py-2' : 'btn btn-primary !px-3 !py-2'}
            onClick={submit}
            disabled={sendDisabled}
            title={showContinue ? 'Continue the story (Enter)' : 'Send (Enter)'}
          >
            {showContinue ? (
              // chevron-right "continue" icon
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            ) : (
              // paper-plane "send" icon
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        )}
      </div>
      <div className="text-xs text-text-muted text-center mt-1">
        {showContinue ? (
          <>
            Press{' '}
            <kbd className="mono text-[10px] bg-surface-2 px-1 rounded border border-border">Enter</kbd>{' '}
            to continue the story · type to respond
          </>
        ) : (
          <>
            Press{' '}
            <kbd className="mono text-[10px] bg-surface-2 px-1 rounded border border-border">Enter</kbd>{' '}
            to send ·{' '}
            <kbd className="mono text-[10px] bg-surface-2 px-1 rounded border border-border">Shift+Enter</kbd>{' '}
            for newline
          </>
        )}
      </div>
    </div>
  );
}
