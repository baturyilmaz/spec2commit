import { execSync } from 'node:child_process';
import { execCodex, execClaude } from './runners.js';
import { save } from './store.js';
import notifier from 'node-notifier';
import * as P from './prompts.js';
import { fmtMs } from '../ui/format.js';
import { Stage, GateSchema, MAX_REVIEWS, type State, type PipeMsg } from '../types.js';
import { MAX_DIFF_SIZE } from '../config.js';

const notify = (body: string) => {
  notifier.notify({ title: 'spec2commit', message: body });
  process.stdout.write('\x07');
};

export type PipeEvent = { type: 'done' } | { type: 'paused'; question: string } | { type: 'error'; message: string };

type Emit = (m: PipeMsg) => void;

function createUI(emit: Emit) {
  return {
    stageSummary: (stage: string, opts?: { verdict?: string; attempt?: string; elapsed?: string; detail?: string }) =>
      emit({ kind: 'stage_summary', stage, ...opts }),
    banner: (stage: string, agent: string, detail?: string) => emit({ kind: 'banner', stage, agent, detail }),
    ok: (text: string) => emit({ kind: 'ok', text }),
    warn: (text: string) => emit({ kind: 'warn', text }),
    err: (text: string) => emit({ kind: 'error', text }),
    sep: () => emit({ kind: 'sep' }),
    text: (agent: string, text: string) => emit({ kind: 'text', agent, text }),
    status: (text: string) => emit({ kind: 'status', text }),
    agentSwitch: (agent: 'codex' | 'claude') => emit({ kind: 'agent_switch', agent }),
    duration: (s: State) => {
      const session = s.startedAt ? fmtMs(Date.now() - s.startedAt) : '—';
      emit({ kind: 'duration', session, codex: fmtMs(s.codexMs), claude: fmtMs(s.claudeMs) });
    },
    onEvent(agent: 'codex' | 'claude'): (e: import('../types.js').Evt) => void {
      return (e) => {
        if (e.type === 'tool_use') emit({ kind: 'tool', agent, tool: e.content, detail: e.detail });
      };
    },
  };
}

async function timed<T>(fn: () => Promise<T>, s: State, agent: 'codex' | 'claude'): Promise<T> {
  const t = Date.now();
  const r = await fn();
  s[agent === 'codex' ? 'codexMs' : 'claudeMs'] += Date.now() - t;
  return r;
}

function extractJson(text: string): string | null {
  let depth = 0,
    start = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0 && start >= 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

async function parseGate(
  text: string,
  ui: ReturnType<typeof createUI>,
): Promise<{ action: string; feedback: string; specificChanges?: string[] }> {
  for (let i = 0; i < 3; i++) {
    const attempt = `Gate parse attempt ${i + 1}/3`;
    ui.status(attempt);
    try {
      const { result } = await execClaude(P.gate(text), {});
      const jsonStr = extractJson(result);
      if (!jsonStr) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonStr);
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON');
      return GateSchema.parse(parsed);
    } catch {
      if (i < 2) ui.warn('Retrying...');
    }
  }
  return { action: 'ask_user', feedback: `Could not parse review verdict. Raw review:\n${text.slice(0, 500)}` };
}

function checkCancelled(s: State): boolean {
  return s.cancelled === true || s.stage === Stage.PAUSED;
}

async function reviewLoop(
  s: State,
  phase: 'plan' | 'impl',
  ui: ReturnType<typeof createUI>,
): Promise<PipeEvent | null> {
  const counter = phase === 'plan' ? 'planReviews' : 'implReviews';
  const genStage = phase === 'plan' ? 'PLAN' : 'IMPLEMENT';
  const revStage = phase === 'plan' ? 'PLAN REVIEW' : 'CODE REVIEW';

  while (s[counter] < MAX_REVIEWS) {
    if (checkCancelled(s)) return { type: 'paused', question: 'Pipeline cancelled.' };

    ui.stageSummary(genStage, { detail: s.feedback ? 'Revising...' : undefined });
    ui.agentSwitch('claude');

    const stageStart = Date.now();
    if (phase === 'plan') {
      const r = await timed(
        () =>
          execClaude(P.plan(s.spec!, s.feedback), {
            cwd: s.projectPath,
            sessionId: s.claudeSessionId ?? undefined,
            onEvent: ui.onEvent('claude'),
          }),
        s,
        'claude',
      );
      s.plan = r.fullText || r.result;
      if (r.sessionId) s.claudeSessionId = r.sessionId;
      ui.text('claude', s.plan);
    } else {
      const r = await timed(
        () =>
          execClaude(P.implement(s.spec!, s.plan!, s.feedback), {
            cwd: s.projectPath,
            sessionId: s.claudeSessionId ?? undefined,
            onEvent: ui.onEvent('claude'),
          }),
        s,
        'claude',
      );
      if (r.sessionId) s.claudeSessionId = r.sessionId;
      ui.text('claude', r.result);
    }

    s.feedback = null;
    s.stage = phase === 'plan' ? Stage.PLAN : Stage.IMPLEMENT;
    save(s);

    const stageTime = fmtMs(Date.now() - stageStart);

    if (checkCancelled(s)) return { type: 'paused', question: 'Pipeline cancelled.' };

    s[counter]++;
    ui.agentSwitch('codex');

    const reviewInput =
      phase === 'plan' ? P.planReview(s.spec!, s.plan!) : P.implReview(s.spec!, s.plan!, gitDiff(s.projectPath));

    const rev = await timed(
      () =>
        execCodex(reviewInput, {
          threadId: s.codexThreadId ?? undefined,
          cwd: s.projectPath,
          onEvent: ui.onEvent('codex'),
        }),
      s,
      'codex',
    );
    s.codexThreadId = rev.threadId;

    ui.status('Parsing verdict...');
    const d = await parseGate(rev.message, ui);

    const attemptStr = `${s[counter]}/${MAX_REVIEWS}`;

    if (d.action === 'approve') {
      if (!s.autoApprove) {
        s.stage = Stage.PAUSED;
        s.pausedAt = phase === 'plan' ? Stage.IMPLEMENT : Stage.COMMIT;
        save(s);
        const msg = `${genStage} approved by Codex. Review and /accept to continue.`;
        ui.stageSummary(revStage, {
          verdict: 'APPROVE',
          attempt: attemptStr,
          elapsed: stageTime,
          detail: 'Waiting for human confirmation',
        });
        notify(msg);
        return { type: 'paused', question: msg };
      }
      ui.stageSummary(revStage, { verdict: 'APPROVE', attempt: attemptStr, elapsed: stageTime, detail: d.feedback });
      return null;
    }

    if (d.action === 'ask_user') {
      s.stage = Stage.PAUSED;
      s.pausedAt = phase === 'plan' ? Stage.PLAN : Stage.IMPLEMENT;
      save(s);
      ui.stageSummary(revStage, { verdict: 'ASK_USER', attempt: attemptStr, detail: d.feedback });
      notify(`Pipeline paused: ${d.feedback.slice(0, 100)}`);
      return { type: 'paused', question: d.feedback };
    }

    ui.stageSummary(revStage, { verdict: 'REVISE', attempt: attemptStr, elapsed: stageTime, detail: d.feedback });
    s.feedback =
      d.feedback + (d.specificChanges?.length ? '\n' + d.specificChanges.map((c) => `- ${c}`).join('\n') : '');
  }

  s.stage = Stage.PAUSED;
  s.pausedAt = phase === 'plan' ? Stage.PLAN : Stage.IMPLEMENT;
  save(s);
  notify(`Max reviews reached (${MAX_REVIEWS})`);
  return { type: 'paused', question: `Max reviews (${MAX_REVIEWS}). /resume or /accept.` };
}

export async function runPipeline(s: State, onMessage: Emit): Promise<PipeEvent> {
  const ui = createUI(onMessage);
  try {
    s.cancelled = false;
    s.planReviews = 0;
    s.implReviews = 0;
    ui.sep();

    if (s.stage === Stage.IMPLEMENT) return (await reviewLoop(s, 'impl', ui)) ?? (await runCommit(s, ui));
    if (s.stage === Stage.COMMIT) return await runCommit(s, ui);

    ui.stageSummary('SPEC', { detail: 'Distilling conversation...' });
    ui.agentSwitch('codex');

    const history = s.log.map((e) => `${e.role}: ${e.content}`).join('\n');
    const spec = await timed(
      () =>
        execCodex(P.spec(history), {
          threadId: s.codexThreadId ?? undefined,
          cwd: s.projectPath,
          onEvent: ui.onEvent('codex'),
        }),
      s,
      'codex',
    );
    s.codexThreadId = spec.threadId;
    s.spec = spec.message;
    s.stage = Stage.SPEC;
    save(s);
    ui.text('codex', s.spec);
    ui.ok('Spec created');

    if (checkCancelled(s)) return { type: 'paused', question: 'Pipeline cancelled.' };

    const planResult = await reviewLoop(s, 'plan', ui);
    if (planResult) return planResult;

    const implResult = await reviewLoop(s, 'impl', ui);
    if (implResult) return implResult;

    return await runCommit(s, ui);
  } catch (e) {
    return fail(e, s, ui);
  }
}

async function runCommit(s: State, ui: ReturnType<typeof createUI>): Promise<PipeEvent> {
  try {
    ui.stageSummary('COMMIT', { detail: 'Claude committing...' });
    ui.agentSwitch('claude');

    if (!isGitRepo(s.projectPath)) return fail(new Error('Not a git repository'), s, ui);
    if (!hasChanges(s.projectPath)) {
      ui.warn('No changes to commit');
      s.stage = Stage.DONE;
      save(s);
      ui.duration(s);
      return { type: 'done' };
    }

    const title =
      s.spec
        ?.split('\n')[0]
        ?.replace(/^[#*\s]+/, '')
        .slice(0, 72) ?? 'spec2commit';

    await timed(
      () =>
        execClaude(
          `Stage and commit all changes from this task. Use a clear commit message based on this title: "${title}". Run \`git add -A\` then \`git commit\`. Do not push.`,
          { cwd: s.projectPath, sessionId: s.claudeSessionId ?? undefined, onEvent: ui.onEvent('claude') },
        ),
      s,
      'claude',
    );

    s.stage = Stage.DONE;
    save(s);
    ui.ok('Committed!');
    ui.duration(s);
    notify('Pipeline complete! Code committed.');
    return { type: 'done' };
  } catch (e) {
    return fail(e, s, ui);
  }
}

function fail(e: unknown, s: State, ui: ReturnType<typeof createUI>): PipeEvent {
  const m = e instanceof Error ? e.message : String(e);
  s.stage = Stage.IDLE;
  save(s);
  ui.err(m);
  notify(`Error: ${m.slice(0, 100)}`);
  return { type: 'error', message: m };
}

function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function hasChanges(cwd: string): boolean {
  try {
    return execSync('git status --porcelain', { cwd, encoding: 'utf-8' }).trim().length > 0;
  } catch {
    return false;
  }
}

function gitDiff(cwd: string): string {
  let diff = '';
  try {
    diff = execSync('git diff HEAD', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  } catch {
    try {
      diff = execSync('git diff', { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    } catch {
      return '';
    }
  }
  if (diff.length > MAX_DIFF_SIZE) {
    return diff.slice(0, MAX_DIFF_SIZE) + '\n\n... [TRUNCATED] ...';
  }
  return diff;
}
