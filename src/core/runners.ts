import { spawn, type ChildProcess } from 'node:child_process';
import type { ClaudeResult, CodexResult, Evt } from '../types.js';
import { CLAUDE_TIMEOUT_MS, CODEX_TIMEOUT_MS } from '../config.js';

interface Opts {
  cwd?: string;
  onData?: (t: string) => void;
  onEvent?: (e: Evt) => void;
}
interface ClaudeOpts extends Opts {
  sessionId?: string;
}
interface CodexOpts extends Opts {
  threadId?: string;
  readOnly?: boolean;
}

interface ParsedJson {
  [key: string]: unknown;
}

function parseJson(s: string): ParsedJson | null {
  try {
    return JSON.parse(s.trim()) as ParsedJson;
  } catch {
    return null;
  }
}

function extractResultText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => String(b?.text ?? ''))
      .join('\n');
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === 'string') return obj.text;
    if (Array.isArray(obj.content)) return extractResultText(obj.content);
  }
  return '';
}

function lines(buf: { s: string }, chunk: string, fn: (line: string) => void) {
  buf.s += chunk;
  const parts = buf.s.split('\n');
  buf.s = parts.pop() ?? '';
  for (const l of parts) if (l.trim()) fn(l);
}

const activeProcs = new Set<ChildProcess>();

export function killAllRunners() {
  for (const proc of activeProcs) {
    try {
      proc.kill('SIGTERM');
    } catch {}
  }
  activeProcs.clear();
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export function execClaude(prompt: string, opts: ClaudeOpts = {}): Promise<ClaudeResult> {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--dangerously-skip-permissions'];
  if (opts.sessionId) args.push('--resume', opts.sessionId);

  const inner = new Promise<ClaudeResult>((resolve, reject) => {
    const proc = spawn('claude', args, {
      cwd: opts.cwd,
      env: { ...process.env, CLAUDECODE: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeProcs.add(proc);

    proc.stdin.write(prompt);
    proc.stdin.end();

    let result = '',
      allText = '',
      streamText = '',
      sid = '',
      stderr = '',
      done = false;
    const buf = { s: '' };

    const emit = (type: Evt['type'], content: string, detail?: string) => {
      opts.onEvent?.({ type, agent: 'claude', content, detail });
    };

    proc.stdout.on('data', (c: Buffer) =>
      lines(buf, c.toString(), (line) => {
        const p = parseJson(line);
        if (!p) return;

        if (p.type === 'system' && p.subtype === 'init') {
          sid = String(p.session_id ?? '');
          emit('status', `Session started (${p.model ?? 'default'})`);
        }

        if (p.type === 'stream_event') {
          const ev = p.event as ParsedJson | undefined;
          if (ev?.type === 'content_block_delta') {
            const delta = ev.delta as ParsedJson | undefined;
            if (delta?.type === 'text_delta' && delta.text) {
              const chunk = String(delta.text);
              streamText += chunk;
              opts.onData?.(chunk);
            }
            if (delta?.type === 'thinking_delta' && delta.thinking) {
              emit('status', 'thinking...');
            }
          }
        }

        const blocks = ((p.message as ParsedJson)?.content ?? p.content) as ParsedJson[] | undefined;
        if (p.type === 'assistant' && Array.isArray(blocks)) {
          for (const b of blocks) {
            if (b.type === 'text') {
              const text = String(b.text ?? '');
              if (text) {
                result = text;
                allText += (allText ? '\n\n' : '') + text;
              }
            } else if (b.type === 'tool_use') {
              const d = toolSummary(String(b.name ?? ''), b.input);
              emit('tool_use', String(b.name ?? ''), d);
            }
          }
        }

        if (p.type === 'user' && Array.isArray(blocks)) {
          for (const b of blocks) {
            if (b.type === 'tool_result') {
              const d = String(b.content ?? '').slice(0, 200);
              emit('tool_result', 'result', d);
            }
          }
        }

        if (p.type === 'result') {
          done = true;
          const extracted = extractResultText(p.result);
          if (extracted) result = extracted;
          sid = String(p.session_id ?? sid);
        }
      }),
    );

    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });

    proc.on('close', (code) => {
      activeProcs.delete(proc);
      if (done) resolve({ result: result || streamText, fullText: allText || streamText, sessionId: sid });
      else reject(new Error(`claude failed: ${stderr.slice(0, 300) || `exit ${code}`}`));
    });

    proc.on('error', (e) => {
      activeProcs.delete(proc);
      reject(new Error(`spawn claude: ${e.message}`));
    });
  });

  return withTimeout(inner, CLAUDE_TIMEOUT_MS, 'claude');
}

export function execCodex(prompt: string, opts: CodexOpts = {}): Promise<CodexResult> {
  const mode = opts.readOnly ? ['--sandbox', 'read-only'] : ['--full-auto'];
  const args = opts.threadId
    ? ['exec', 'resume', '--json', '--skip-git-repo-check', '--full-auto', opts.threadId, prompt]
    : ['exec', '--json', '--skip-git-repo-check', ...mode, ...(opts.cwd ? ['-C', opts.cwd] : []), prompt];

  const inner = new Promise<CodexResult>((resolve, reject) => {
    const proc = spawn('codex', args, {
      cwd: opts.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeProcs.add(proc);

    let tid = opts.threadId ?? '',
      msg = '',
      stderr = '';
    const buf = { s: '' };

    const emit = (type: Evt['type'], content: string, detail?: string) => {
      opts.onEvent?.({ type, agent: 'codex', content, detail });
    };

    proc.stdout.on('data', (c: Buffer) =>
      lines(buf, c.toString(), (line) => {
        const p = parseJson(line);
        if (!p) return;

        if (p.type === 'thread.started') {
          tid = String(p.thread_id ?? '');
          emit('status', `Thread ${tid.slice(0, 12)}...`);
        }

        if (p.type === 'turn.started') {
          emit('status', 'Turn started');
        }

        if (p.type === 'item.started') {
          const item = p.item as ParsedJson | undefined;
          if (item?.type === 'command_execution') {
            const cmd = String(item.command ?? '').slice(0, 120);
            emit('tool_use', 'exec', cmd);
          } else if (item?.type === 'mcp_tool_call') {
            emit('tool_use', 'mcp', `${item.server}/${item.tool}`);
          }
        }

        if (p.type === 'item.completed' && p.item) {
          const i = p.item as ParsedJson;
          if (i.type === 'agent_message') {
            const t = String(i.text ?? '');
            msg += t;
          } else if (i.type === 'reasoning') {
            emit('status', `thinking: ${String(i.text).slice(0, 80)}`);
          } else if (i.type === 'command_execution') {
            const cmd = String(i.command ?? '').slice(0, 80);
            const out = String(i.aggregated_output ?? '').slice(0, 100);
            emit('tool_result', `exec (${i.exit_code ?? '?'})`, `${cmd} → ${out}`);
          } else if (i.type === 'file_change') {
            const changes = i.changes as ParsedJson[] | undefined;
            for (const c of changes ?? []) {
              emit('tool_use', 'file', `${c.kind}: ${c.path}`);
            }
          } else if (i.type === 'mcp_tool_call') {
            emit('tool_result', 'mcp', `${i.server}/${i.tool}: ${String(i.result ?? i.error ?? '').slice(0, 100)}`);
          } else if (i.type === 'web_search') {
            emit('tool_use', 'search', String(i.query));
          } else if (i.type === 'error') {
            emit('error', String(i.message).slice(0, 100));
          }
        }

        if (p.type === 'turn.completed') {
          emit('status', 'Turn done');
        }

        if (p.type === 'turn.failed') {
          const err = p.error as ParsedJson | undefined;
          emit('error', String(err?.message ?? 'Turn failed'));
        }
      }),
    );

    proc.stderr.on('data', (c: Buffer) => {
      stderr += c.toString();
    });

    proc.on('close', (code) => {
      activeProcs.delete(proc);
      if (code !== 0 && !msg) reject(new Error(`codex failed (${code}): ${stderr.slice(0, 300)}`));
      else resolve({ threadId: tid, message: msg.trim() });
    });

    proc.on('error', (e) => {
      activeProcs.delete(proc);
      reject(new Error(`spawn codex: ${e.message}`));
    });
  });

  return withTimeout(inner, CODEX_TIMEOUT_MS, 'codex');
}

const FIELDS: Record<string, string> = {
  Read: 'file_path',
  Write: 'file_path',
  Edit: 'file_path',
  Glob: 'pattern',
  Grep: 'pattern',
  Bash: 'command',
  WebFetch: 'url',
  WebSearch: 'query',
  Task: 'description',
};

function toolSummary(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const obj = input as Record<string, unknown>;
  return FIELDS[name] ? String(obj[FIELDS[name]] ?? '').slice(0, 120) : JSON.stringify(input).slice(0, 120);
}
