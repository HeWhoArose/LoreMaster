/**
 * Central logger for Corvus. Adds ANSI colors, timestamps, module tags,
 * and structured helpers for HTTP + SSE events.
 */

const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '');
}

export const logger = {
  info(module: string, message: string, data?: any) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.cyan}[${module}]${COLORS.reset} ${message}`,
      data !== undefined ? data : ''
    );
  },
  success(module: string, message: string, data?: any) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.green}[${module}]${COLORS.reset} ${message}`,
      data !== undefined ? data : ''
    );
  },
  warn(module: string, message: string, data?: any) {
    console.warn(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.yellow}⚠ [${module}]${COLORS.reset} ${message}`,
      data !== undefined ? data : ''
    );
  },
  error(module: string, message: string, error?: any) {
    console.error(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.red}✖ [${module}]${COLORS.reset} ${message}`
    );
    if (error) {
      if (error instanceof Error) {
        console.error(`${COLORS.red}  → ${error.message}${COLORS.reset}`);
        if (error.stack) {
          const stackLines = error.stack
            .split('\n')
            .slice(1, 5)
            .map((l) => `${COLORS.gray}    ${l.trim()}${COLORS.reset}`);
          console.error(stackLines.join('\n'));
        }
      } else {
        try {
          console.error(`${COLORS.red}  → ${JSON.stringify(error)}${COLORS.reset}`);
        } catch {
          console.error(`${COLORS.red}  → ${String(error)}${COLORS.reset}`);
        }
      }
    }
  },
  request(method: string, url: string, status: number, durationMs: number) {
    const color = status >= 500 ? COLORS.red : status >= 400 ? COLORS.yellow : COLORS.green;
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[HTTP]${COLORS.reset} ${method} ${url} ${color}${status}${COLORS.reset} ${COLORS.gray}(${durationMs}ms)${COLORS.reset}`
    );
  },
  sse(module: string, eventType: string, summary?: string) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.magenta}[${module}/SSE]${COLORS.reset} → ${eventType}${
        summary ? ` ${COLORS.gray}(${summary})${COLORS.reset}` : ''
      }`
    );
  },
  banner(lines: string[]) {
    console.log(`${COLORS.cyan}${lines.join('\n')}${COLORS.reset}`);
  },
};

export default logger;
