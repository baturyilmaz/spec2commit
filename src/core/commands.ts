import { existsSync } from 'node:fs';
import { join } from 'node:path';
import figures from 'figures';
import { execClaude, execCodex, killAllRunners } from './runners.js';
import { Stage, MAX_REVIEWS, type State, type ItemData, type Item } from '../types.js';
import { fmtMs } from '../ui/format.js';
import { initClaude, initCodex } from './prompts.js';

export interface CommandCtx {
  s: State;
  busy: boolean;
  addItem: (item: ItemData) => void;
  mutate: (fn: (s: State) => void) => void;
  runPipe: () => void;
  setThinkStartedAt: (v: number) => void;
  setActiveAgent: (a: 'codex' | 'claude') => void;
  setBusy: (b: boolean) => void;
  setCurrentStage: (s: string) => void;
  setItems: (items: Item[]) => void;
  setLiveTools: (fn: (prev: Array<{ id: number; tool: string; detail?: string }>) => typeof prev) => void;
  genId: () => number;
  exit: () => void;
}

export async function handleCommand(input: string, ctx: CommandCtx) {
  const {
    s,
    busy,
    addItem,
    mutate,
    runPipe,
    setThinkStartedAt,
    setActiveAgent,
    setBusy,
    setCurrentStage,
    setItems,
    setLiveTools,
    genId,
    exit,
  } = ctx;
  const parts = input.split(' ');
  const c = parts[0];
  switch (c) {
    case '/init': {
      if (busy) {
        addItem({ kind: 'system', variant: 'warn', text: 'Already running.' });
        break;
      }
      const claudeMdExists = existsSync(join(s.projectPath, 'CLAUDE.md'));
      const agentsMdExists = existsSync(join(s.projectPath, 'AGENTS.md'));
      const verb = (exists: boolean) => (exists ? 'Updating' : 'Generating');
      addItem({
        kind: 'system',
        variant: 'ok',
        text: `${verb(claudeMdExists)} CLAUDE.md + ${verb(agentsMdExists)} AGENTS.md...`,
      });
      setThinkStartedAt(Date.now());
      setActiveAgent('claude');
      setBusy(true);

      Promise.allSettled([
        execClaude(initClaude(claudeMdExists), { cwd: s.projectPath, sessionId: s.claudeSessionId ?? undefined }),
        execCodex(initCodex(agentsMdExists), { cwd: s.projectPath }),
      ]).then(([claudeRes, codexRes]) => {
        if (claudeRes.status === 'fulfilled') {
          mutate((st) => {
            st.claudeSessionId = claudeRes.value.sessionId;
          });
          addItem({ kind: 'system', variant: 'ok', text: `${claudeMdExists ? 'Updated' : 'Generated'} CLAUDE.md` });
        } else {
          addItem({ kind: 'system', variant: 'error', text: `CLAUDE.md failed: ${claudeRes.reason}` });
        }
        if (codexRes.status === 'fulfilled') {
          mutate((st) => {
            st.codexThreadId = codexRes.value.threadId;
          });
          addItem({ kind: 'system', variant: 'ok', text: `${agentsMdExists ? 'Updated' : 'Generated'} AGENTS.md` });
        } else {
          addItem({ kind: 'system', variant: 'error', text: `AGENTS.md failed: ${codexRes.reason}` });
        }
        setThinkStartedAt(0);
        setBusy(false);
      });
      break;
    }
    case '/go':
      if (busy) {
        addItem({ kind: 'system', variant: 'warn', text: 'Already running.' });
        break;
      }
      if (!s.log.length) {
        addItem({ kind: 'system', variant: 'warn', text: 'Chat first to shape the task.' });
        break;
      }
      runPipe();
      break;
    case '/pause':
      if (!busy) {
        addItem({ kind: 'system', variant: 'warn', text: 'Nothing running.' });
        break;
      }
      mutate((st) => {
        st.pausedAt = st.stage;
        st.stage = Stage.PAUSED;
      });
      addItem({ kind: 'system', variant: 'warn', text: 'Pausing after current step...' });
      break;
    case '/cancel':
      if (!busy) {
        addItem({ kind: 'system', variant: 'warn', text: 'Nothing running.' });
        break;
      }
      mutate((st) => {
        st.cancelled = true;
        st.stage = Stage.PAUSED;
        st.pausedAt = st.stage;
      });
      killAllRunners();
      addItem({ kind: 'system', variant: 'warn', text: 'Cancelling...' });
      break;
    case '/resume': {
      if (s.stage !== Stage.PAUSED || !s.pausedAt) {
        addItem({ kind: 'system', variant: 'warn', text: 'Nothing to resume.' });
        break;
      }
      const resumeStage = s.pausedAt;
      s.stage = resumeStage;
      s.pausedAt = null;
      s.cancelled = false;
      mutate((st) => {
        st.stage = resumeStage;
        st.pausedAt = null;
        st.cancelled = false;
      });
      addItem({ kind: 'system', variant: 'ok', text: `Resuming from ${resumeStage}...` });
      runPipe();
      break;
    }
    case '/accept': {
      if (s.stage !== Stage.PAUSED || !s.pausedAt) {
        addItem({ kind: 'system', variant: 'warn', text: 'Nothing to accept.' });
        break;
      }
      let nextStage: Stage;
      if (s.pausedAt === Stage.IMPLEMENT) {
        nextStage = Stage.IMPLEMENT;
        addItem({ kind: 'system', variant: 'ok', text: 'Plan accepted. Starting implementation...' });
      } else if (s.pausedAt === Stage.COMMIT) {
        nextStage = Stage.COMMIT;
        addItem({ kind: 'system', variant: 'ok', text: 'Implementation accepted. Committing...' });
      } else if (s.pausedAt === Stage.PLAN) {
        if (!s.plan) {
          addItem({ kind: 'system', variant: 'warn', text: 'No plan.' });
          break;
        }
        nextStage = Stage.IMPLEMENT;
        addItem({ kind: 'system', variant: 'ok', text: 'Plan force-accepted.' });
      } else {
        nextStage = s.pausedAt;
        addItem({ kind: 'system', variant: 'ok', text: 'Accepted. Resuming...' });
      }
      // Mutate s directly so runPipe (which closes over this same object) sees
      // the updated stage immediately, before React's async reducer runs.
      s.stage = nextStage;
      s.pausedAt = null;
      s.feedback = null;
      s.cancelled = false;
      mutate((st) => {
        st.stage = nextStage;
        st.pausedAt = null;
        st.feedback = null;
        st.cancelled = false;
      });
      runPipe();
      break;
    }
    case '/claude': {
      const msg = parts.slice(1).join(' ').trim();
      if (!msg) {
        addItem({ kind: 'system', variant: 'warn', text: 'Usage: /claude <message>' });
        break;
      }
      if (busy) {
        addItem({ kind: 'system', variant: 'warn', text: 'Already running.' });
        break;
      }
      addItem({ kind: 'user', content: msg });
      setThinkStartedAt(Date.now());
      setActiveAgent('claude');
      setBusy(true);
      setLiveTools(() => []);

      const collectedTools: Array<{ tool: string; detail?: string }> = [];
      const onEvent = (evt: import('../types.js').Evt) => {
        if (evt.type === 'tool_use') {
          collectedTools.push({ tool: evt.content, detail: evt.detail });
          setLiveTools((prev) => [...prev.slice(-4), { id: genId(), tool: evt.content, detail: evt.detail }]);
        }
      };

      try {
        const r = await execClaude(msg, {
          cwd: s.projectPath,
          sessionId: s.claudeSessionId ?? undefined,
          onEvent,
        });
        mutate((st) => {
          st.claudeSessionId = r.sessionId;
        });
        if (collectedTools.length > 0) addItem({ kind: 'tools', tools: collectedTools });
        addItem({ kind: 'agent', agent: 'claude', content: r.result });
      } catch (e) {
        addItem({ kind: 'system', variant: 'error', text: e instanceof Error ? e.message : String(e) });
      } finally {
        setThinkStartedAt(0);
        setBusy(false);
        setLiveTools(() => []);
      }
      break;
    }
    case '/spec':
      if (!s.spec) {
        addItem({ kind: 'system', variant: 'warn', text: 'No spec yet.' });
        break;
      }
      addItem({ kind: 'agent', agent: 'codex', content: s.spec });
      break;
    case '/plan':
      if (!s.plan) {
        addItem({ kind: 'system', variant: 'warn', text: 'No plan yet.' });
        break;
      }
      addItem({ kind: 'agent', agent: 'claude', content: s.plan });
      break;
    case '/session':
      addItem({
        kind: 'info',
        text: `Codex: ${s.codexThreadId ?? 'none'} ${figures.pointerSmall} Claude: ${s.claudeSessionId ?? 'none'}`,
      });
      break;
    case '/status':
      addItem({
        kind: 'info',
        text: `${s.stage} ${figures.pointerSmall} plan:${s.planReviews}/${MAX_REVIEWS} impl:${s.implReviews}/${MAX_REVIEWS} ${figures.pointerSmall} msgs:${s.log.length}`,
      });
      if (s.feedback) addItem({ kind: 'system', variant: 'warn', text: s.feedback });
      addItem({
        kind: 'info',
        text: `${s.startedAt ? fmtMs(Date.now() - s.startedAt) : ''} ${figures.pointerSmall} codex ${fmtMs(s.codexMs)} ${figures.pointerSmall} claude ${fmtMs(s.claudeMs)}`,
      });
      break;
    case '/reset':
      mutate((st) => {
        Object.assign(st, {
          stage: Stage.IDLE,
          pausedAt: null,
          spec: null,
          plan: null,
          feedback: null,
          planReviews: 0,
          implReviews: 0,
          log: [],
          codexThreadId: null,
          claudeSessionId: null,
          startedAt: Date.now(),
          codexMs: 0,
          claudeMs: 0,
          cancelled: false,
        });
      });
      setCurrentStage('IDLE');
      setItems([]);
      addItem({ kind: 'system', variant: 'ok', text: 'State reset.' });
      break;
    case '/clear':
      setItems([]);
      addItem({ kind: 'system', variant: 'ok', text: 'Display cleared.' });
      break;
    case '/help':
      addItem({
        kind: 'info',
        text: '/go  /claude  /init  /pause  /cancel  /resume  /accept  /spec  /plan  /session  /status  /reset  /clear  /quit',
      });
      break;
    case '/quit':
      killAllRunners();
      exit();
      break;
    default:
      addItem({ kind: 'system', variant: 'warn', text: `Unknown: ${c}` });
  }
}
