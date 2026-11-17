/**
 * Strip "thinking" / "reasoning" tags that some local models (Qwen3, DeepSeek-R1,
 * etc.) emit inline inside the regular `content` channel instead of in a separate
 * reasoning channel.
 *
 * Two surfaces:
 *  - `stripThinkingTags(final)` — finalized text in one shot. Idempotent.
 *  - `ThinkStreamStripper` — stateful filter for live token deltas. Holds bytes
 *    until it can decide whether they belong to a think block or to the visible
 *    response. Use `push(delta)` for each chunk and `flush()` after the stream
 *    ends to drain any held tail.
 *
 * Recognised tag families (case-insensitive):
 *   <think>...</think>
 *   <reasoning>...</reasoning>
 *   <thought>...</thought>
 *
 * Behaviour notes:
 *  - Tags may carry attributes (e.g. `<think type="planning">`). We accept anything
 *    up to the next `>` after the tag name.
 *  - Nested/unclosed tags: if the model opens but never closes a think block, the
 *    streaming stripper will hold everything from the opening tag forward — the
 *    chat bubble will be empty rather than spilled reasoning. This is the safer
 *    failure mode (better empty than leaked CoT).
 *  - If the FINAL stripped text comes out empty, `stripThinkingTags` returns
 *    whatever was inside the first think block as a fallback — some models put
 *    the entire reply inside `<think>...</think>` by mistake.
 */

const THINK_TAG_NAMES = ['think', 'reasoning', 'thought'] as const;

const OPEN_RE = new RegExp(
  `<(${THINK_TAG_NAMES.join('|')})\\b[^>]*>`,
  'i'
);

/**
 * Patterns that signal a model is dumping reasoning AS PROSE (no XML tag),
 * which happens when a thinking model's chat template isn't applied. E.g.:
 *   "Here's a thinking process:\n1. *Analyze User Input:* ..."
 *   "Let me think about this..."
 *   "**Thinking:**\n..."
 *   "<reasoning>\n..." (no closing tag ever arrives)
 *
 * Each pattern is checked at the START of the text. The match is greedy — it
 * consumes until either:
 *   - the first speaker tag line (`[Narrator]` / `[Character: ...]`)
 *   - the first line starting with `*` or `"` (SillyTavern-style story content)
 *   - end of string
 */
const PROSE_REASONING_OPENERS: RegExp[] = [
  // "Here's [a/my/the] thinking process:" / "Here is my analysis:" / etc.
  /^\s*here(?:'s| is)\s+(?:a|my|the)?\s*(?:thinking\s+process|analysis|reasoning|thought\s+process|plan|breakdown)\s*[:.\-]/i,
  // "Let me think..." / "Let me analyze..." / "Let's think..."
  /^\s*let(?:'s| me| us)\s+(?:think|analyze|reason|plan|break\s+(?:this|it)\s+down|work\s+through)/i,
  // "**Thinking:**" / "**Analysis:**" / "**Reasoning:**" / "**Plan:**"
  /^\s*\*\*(?:thinking|analysis|reasoning|thought\s*process|plan)\s*:?\s*\*\*/i,
  // "Thinking:" / "Analysis:" / "Reasoning:" at start of line
  /^\s*(?:thinking|analysis|reasoning|thought\s*process|plan)\s*:\s/i,
  // Numbered analysis preamble: "1. Analyze" / "1. *Analyze...*"
  /^\s*1\.\s+\*?(?:analyze|determine|identify|consider|review|check|assess|examine)\b/i,
  // Hash heading reasoning: "# Thinking" / "## Analysis"
  /^\s*#{1,6}\s+(?:thinking|analysis|reasoning|thought\s*process|plan)\b/i,
  // Orphan open tag with no close (e.g. "<reasoning>\n...")
  new RegExp(`^\\s*<(${THINK_TAG_NAMES.join('|')})\\b[^>]*>`, 'i'),
];

/**
 * Where does the real story content begin? Anything that looks like:
 *   - a speaker tag line: [Narrator] / [Character: Name]
 *   - SillyTavern action start: line beginning with `*`
 *   - SillyTavern dialogue start: line beginning with `"`
 *   - markdown emphasis dialogue: line beginning with `_` or `—` (em-dash narration)
 * are signals that the reasoning preamble has ended and the real reply is starting.
 */
const REAL_CONTENT_BOUNDARY_RE =
  /(?:^|\n)\s*(?:\[\s*(?:Narrator|Character\s*:[^\]]+)\s*\]|\*[^\s*]|"[^\s"]|—\s*[A-Z])/;

/**
 * Strip a leading prose-style reasoning preamble. No-op if the text doesn't
 * start with one of the recognised reasoning opener patterns. Used as a
 * fallback for thinking models that emit reasoning as markdown rather than
 * inside `<think>` tags (e.g. mis-templated qwen3, r1-distill, etc.).
 *
 * Safety: if stripping would consume the ENTIRE response, the original text
 * is returned unchanged — better to show possibly-leaked reasoning than an
 * empty bubble.
 */
export function stripProseReasoning(text: string): string {
  if (!text) return text;
  const trimmed = text.replace(/^\s+/, '');
  const opensWithReasoning = PROSE_REASONING_OPENERS.some((re) => re.test(trimmed));
  if (!opensWithReasoning) return text;

  // Find where the real content starts.
  const boundary = trimmed.search(REAL_CONTENT_BOUNDARY_RE);
  if (boundary === -1) {
    // No detectable boundary — the model didn't produce any tagged blocks or
    // SillyTavern-style content after the reasoning. Don't blow away the whole
    // message; return original so user still sees SOMETHING (even if ugly).
    return text;
  }
  const after = trimmed.slice(boundary).replace(/^\s+/, '');
  if (!after) return text;
  return after;
}

/**
 * One-shot strip for finalized strings. Safe to call on already-clean text.
 */
export function stripThinkingTags(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const tag of THINK_TAG_NAMES) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, 'gi');
    cleaned = cleaned.replace(re, '');
  }
  // Drop any orphan opening tag and everything after it (unclosed reasoning).
  const orphan = cleaned.search(OPEN_RE);
  if (orphan !== -1) cleaned = cleaned.slice(0, orphan);
  cleaned = cleaned.trim();
  // Fallback: if we wiped everything, the model likely put the whole reply
  // inside a think block. Recover the inner text rather than show nothing.
  if (!cleaned) {
    for (const tag of THINK_TAG_NAMES) {
      const inside = text.match(
        new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'i')
      )?.[1];
      if (inside && inside.trim()) return inside.trim();
    }
    return text.trim();
  }
  return cleaned;
}

/**
 * Streaming filter. Feed it raw token deltas; it emits cleaned deltas containing
 * only user-visible content. Reasoning bytes are dropped silently.
 *
 * Usage:
 *   const stripper = new ThinkStreamStripper();
 *   for each token delta from the LLM:
 *     const visible = stripper.push(delta);
 *     if (visible) emit(visible);
 *   const tail = stripper.flush();
 *   if (tail) emit(tail);
 *
 * The stripper holds a small buffer (up to ~longest tag name + attrs) when it
 * sees a `<` that *might* start a think tag, so it can decide without leaking
 * partial markup to the UI.
 */
export class ThinkStreamStripper {
  /** Bytes we're holding because they might be part of a tag. */
  private hold = '';
  /** True while we're inside an open think/reasoning/thought block. */
  private inThinkBlock = false;
  /** Which tag opened the current block, so we know what closing tag to seek. */
  private openTag: (typeof THINK_TAG_NAMES)[number] | null = null;

  /**
   * Push a delta; returns the portion that is safe to emit to the user.
   */
  push(delta: string): string {
    if (!delta) return '';
    let buf = this.hold + delta;
    this.hold = '';
    let out = '';

    while (buf.length > 0) {
      if (this.inThinkBlock) {
        // Look for the matching close tag.
        const closeRe = new RegExp(`<\\/${this.openTag}\\s*>`, 'i');
        const m = buf.match(closeRe);
        if (!m || m.index === undefined) {
          // No close in view. Drop everything except a possible partial close
          // tag at the end (e.g. "</thin").
          const lastLt = buf.lastIndexOf('<');
          if (lastLt !== -1 && lastLt > buf.length - 16) {
            // Keep the tail in case it's a partial close tag.
            this.hold = buf.slice(lastLt);
          }
          return out;
        }
        // Drop the close tag and everything before it; resume scanning after.
        buf = buf.slice(m.index + m[0].length);
        this.inThinkBlock = false;
        this.openTag = null;
        continue;
      }

      // Not in a think block. Scan for the next `<`.
      const lt = buf.indexOf('<');
      if (lt === -1) {
        // No tag in sight — safe to emit it all.
        out += buf;
        buf = '';
        break;
      }
      // Emit everything up to the `<`.
      out += buf.slice(0, lt);
      buf = buf.slice(lt);

      // Decide if `buf` starts a think tag, a non-think tag, or an incomplete tag.
      const gt = buf.indexOf('>');
      if (gt === -1) {
        // Incomplete tag — hold and wait for more bytes. Cap the hold so we
        // don't accumulate forever on a stray `<` (e.g. `*She glances at <`).
        if (buf.length > 64) {
          // Definitely not a think tag opener (too long without `>`). Flush it.
          out += buf;
          buf = '';
        } else {
          this.hold = buf;
        }
        break;
      }
      const tag = buf.slice(0, gt + 1);
      const openMatch = OPEN_RE.exec(tag);
      if (openMatch) {
        // It's a think/reasoning/thought open tag — enter block, drop tag.
        this.inThinkBlock = true;
        this.openTag = openMatch[1].toLowerCase() as (typeof THINK_TAG_NAMES)[number];
        buf = buf.slice(gt + 1);
        continue;
      }
      // Some other tag (or `<` in narrative prose). Emit and continue.
      out += tag;
      buf = buf.slice(gt + 1);
    }

    return out;
  }

  /**
   * Call after the stream ends. Returns any held tail that turned out NOT to
   * be a think tag. If we're still inside an unclosed think block, returns ''
   * (we drop unterminated reasoning rather than leak it).
   */
  flush(): string {
    if (this.inThinkBlock) {
      this.hold = '';
      this.inThinkBlock = false;
      this.openTag = null;
      return '';
    }
    const tail = this.hold;
    this.hold = '';
    // If the tail is a partial opener that never resolved (e.g. `<thi`), just
    // emit it — at end-of-stream, withholding ambiguous bytes only hides text.
    return tail;
  }
}
