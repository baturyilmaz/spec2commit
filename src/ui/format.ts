import prettyMs from 'pretty-ms';
import { marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import wrapAnsi from 'wrap-ansi';
import stripAnsi from 'strip-ansi';
import { MAX_WIDTH } from '../config.js';

let configuredWidth = Math.min((process.stdout.columns || 80) - 4, MAX_WIDTH);

marked.use(markedTerminal({ reflowText: true, width: configuredWidth }));

export const fmtMs = (ms: number) => prettyMs(ms, { compact: true });

export function renderMarkdown(text: string, width?: number): string {
  const w = width ?? configuredWidth;
  try {
    const raw = (marked.parse(text) as string).trimEnd();
    return wrapAnsi(raw, w, { hard: true, trim: false });
  } catch {
    return text;
  }
}

export function wrap(text: string, width?: number): string {
  return wrapAnsi(text, width ?? configuredWidth, { hard: true, trim: false });
}

const mdCache = new Map<string, string>();
export function cachedMarkdown(text: string): string {
  let r = mdCache.get(text);
  if (!r) {
    r = renderMarkdown(text);
    if (mdCache.size > 200) mdCache.clear();
    mdCache.set(text, r);
  }
  return r;
}

export function textWidth(text: string): number {
  return stripAnsi(text).length;
}

export function setWidth(cols: number) {
  configuredWidth = Math.min(cols - 4, MAX_WIDTH);
  marked.use(markedTerminal({ reflowText: true, width: configuredWidth }));
  mdCache.clear();
}
