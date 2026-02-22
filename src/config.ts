function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  return v ? parseInt(v, 10) || fallback : fallback;
}

export const MAX_REVIEWS = envInt('S2C_MAX_REVIEWS', 10);
export const MAX_DIFF_SIZE = envInt('S2C_MAX_DIFF_KB', 50) * 1024;
export const CODEX_TIMEOUT_MS = envInt('S2C_CODEX_TIMEOUT', 10 * 60 * 1000);
export const CLAUDE_TIMEOUT_MS = envInt('S2C_CLAUDE_TIMEOUT', 10 * 60 * 1000);
export const MAX_LOG_ENTRIES = envInt('S2C_MAX_LOG_ENTRIES', 200);
export const MAX_STREAM_LINES = envInt('S2C_MAX_STREAM_LINES', 24);
export const INPUT_HISTORY_SIZE = envInt('S2C_INPUT_HISTORY', 50);
export const MIN_WIDTH = 40;
export const MAX_WIDTH = 120;
