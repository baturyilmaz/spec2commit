import { existsSync } from 'node:fs';
import { join } from 'node:path';
import figures from 'figures';
import { execClaude, execCodex, killAllRunners } from './runners.js';
import { Stage, MAX_REVIEWS, type State, type ItemData, type Item, type ModelType } from '../types.js';
import { fmtMs } from '../ui/format.js';
import { initClaude, initCodex } from './prompts.js';
import {
  listSessions,
  switchSession,
  deleteSession,
  renameSession,
  getOrCreateSession,
  save,
} from './store.js';

export function getSessionTitle(sess: { name: string | null; spec: string | null }): string {
  if (sess.name) return sess.name;
  if (!sess.spec) return 'untitled';
  
  const firstLine = sess.spec.split('\n')[0] || '';
  const cleaned = firstLine
    .replace(/^(Title:|#|\*)+\s*/i, '')
    .trim();
  
  const words = cleaned.split(/\s+/).slice(0, 5).join(' ');
  return words.slice(0, 40) || 'untitled';
}

export interface CommandCtx {
  s: State;
  busy: boolean;
  addItem: (item: ItemData) => void;
  mutate: (fn: (s: State) => void) => void;
  runPipe: () => void;
  setThinkStartedAt: (v: number) => void;
  setActiveAgent: (a: ModelType) => void;
  setBusy: (b: boolean) => void;
  setCurrentStage: (s: string) => void;
  setItems: (items: Item[]) => void;
  setLiveTools: (fn: (prev: Array<{ id: number; tool: string; detail?: string }>) => typeof prev) => void;
  genId: () => number;
  exit: () => void;
  loadSession: (session: State) => void;
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
    loadSession,
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

      const useClaude = s.models.planner === 'claude';
      const useCodex = s.models.planner === 'codex';

      const tasks: string[] = [];
      if (useClaude) tasks.push(`${verb(claudeMdExists)} CLAUDE.md`);
      if (useCodex) tasks.push(`${verb(agentsMdExists)} AGENTS.md`);

      addItem({
        kind: 'system',
        variant: 'ok',
        text: `${tasks.join(' + ')}...`,
      });
      setThinkStartedAt(Date.now());
      setActiveAgent(s.models.planner);
      setBusy(true);

      const promises: Promise<unknown>[] = [];

      if (useClaude) {
        promises.push(
          execClaude(initClaude(claudeMdExists), { cwd: s.projectPath, sessionId: s.claudeSessionId ?? undefined })
            .then((claudeRes) => {
              mutate((st) => {
                st.claudeSessionId = claudeRes.sessionId;
              });
              addItem({ kind: 'system', variant: 'ok', text: `${claudeMdExists ? 'Updated' : 'Generated'} CLAUDE.md` });
            })
            .catch((err) => {
              addItem({ kind: 'system', variant: 'error', text: `CLAUDE.md failed: ${err}` });
            })
        );
      }

      if (useCodex) {
        promises.push(
          execCodex(initCodex(agentsMdExists), { cwd: s.projectPath })
            .then((codexRes) => {
              mutate((st) => {
                st.codexThreadId = codexRes.threadId;
              });
              addItem({ kind: 'system', variant: 'ok', text: `${agentsMdExists ? 'Updated' : 'Generated'} AGENTS.md` });
            })
            .catch((err) => {
              addItem({ kind: 'system', variant: 'error', text: `AGENTS.md failed: ${err}` });
            })
        );
      }

      Promise.allSettled(promises).finally(() => {
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
    case '/spec':
      if (!s.spec) {
        addItem({ kind: 'system', variant: 'warn', text: 'No spec yet.' });
        break;
      }
      addItem({ kind: 'agent', agent: s.models.reviewer, content: s.spec });
      break;
    case '/plan':
      if (!s.plan) {
        addItem({ kind: 'system', variant: 'warn', text: 'No plan yet.' });
        break;
      }
      addItem({ kind: 'agent', agent: s.models.planner, content: s.plan });
      break;
    case '/session': {
      const subCmd = parts[1]?.toLowerCase();
      
      if (!subCmd) {
        addItem({
          kind: 'info',
          text: `Session: ${s.id} ${s.name ? `(${s.name})` : ''}`,
        });
        addItem({
          kind: 'info',
          text: `Codex: ${s.codexThreadId ?? 'none'} ${figures.pointerSmall} Claude: ${s.claudeSessionId ?? 'none'}`,
        });
        addItem({
          kind: 'info',
          text: 'Commands: /session list | switch <id> | new | delete <id> | rename <name>',
        });
        break;
      }

      if (subCmd === 'list') {
        const sessions = listSessions();
        if (sessions.length === 0) {
          addItem({ kind: 'info', text: 'No sessions.' });
        } else {
          addItem({ kind: 'info', text: `Sessions (${sessions.length}):` });
          for (const sess of sessions.slice(0, 10)) {
            const isCurrent = sess.id === s.id;
            const title = getSessionTitle(sess);
            const status = sess.stage === 'DONE' ? '✓' : sess.stage === 'PAUSED' ? '⏸' : '○';
            const prefix = isCurrent ? '→ ' : '  ';
            addItem({
              kind: isCurrent ? 'system' : 'info',
              variant: isCurrent ? 'ok' : undefined,
              text: `${prefix}${status} ${sess.id} ${title} (${sess.log.length} msgs)`,
            } as ItemData);
          }
          if (sessions.length > 10) {
            addItem({ kind: 'info', text: `  ... and ${sessions.length - 10} more` });
          }
        }
        break;
      }

      if (subCmd === 'switch') {
        const targetId = parts[2];
        if (!targetId) {
          addItem({ kind: 'system', variant: 'warn', text: 'Usage: /session switch <id>' });
          break;
        }
        if (busy) {
          addItem({ kind: 'system', variant: 'warn', text: 'Cannot switch while running.' });
          break;
        }
        const target = switchSession(targetId);
        if (!target) {
          addItem({ kind: 'system', variant: 'error', text: `Session not found: ${targetId}` });
          break;
        }
        loadSession(target);
        addItem({ kind: 'system', variant: 'ok', text: `Switched to session ${targetId}` });
        break;
      }

      if (subCmd === 'new') {
        if (busy) {
          addItem({ kind: 'system', variant: 'warn', text: 'Cannot create while running.' });
          break;
        }
        save(s);
        const newSess = getOrCreateSession(s.projectPath, s.models);
        if (newSess.id !== s.id) {
          loadSession(newSess);
          addItem({ kind: 'system', variant: 'ok', text: `New session: ${newSess.id}` });
        } else {
          addItem({ kind: 'info', text: 'Current session is empty, reusing it.' });
        }
        break;
      }

      if (subCmd === 'delete') {
        const targetId = parts[2];
        if (!targetId) {
          addItem({ kind: 'system', variant: 'warn', text: 'Usage: /session delete <id>' });
          break;
        }
        if (targetId === s.id) {
          addItem({ kind: 'system', variant: 'warn', text: 'Cannot delete current session.' });
          break;
        }
        if (deleteSession(targetId)) {
          addItem({ kind: 'system', variant: 'ok', text: `Deleted session ${targetId}` });
        } else {
          addItem({ kind: 'system', variant: 'error', text: `Session not found: ${targetId}` });
        }
        break;
      }

      if (subCmd === 'rename') {
        const newName = parts.slice(2).join(' ').trim();
        if (!newName) {
          addItem({ kind: 'system', variant: 'warn', text: 'Usage: /session rename <name>' });
          break;
        }
        mutate((st) => {
          st.name = newName;
        });
        renameSession(s.id, newName);
        addItem({ kind: 'system', variant: 'ok', text: `Session renamed to: ${newName}` });
        break;
      }

      addItem({ kind: 'system', variant: 'warn', text: 'Unknown subcommand. Use: list | switch | new | delete | rename' });
      break;
    }
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
    case '/config': {
      const arg = parts[1]?.toLowerCase();
      const value = parts[2]?.toLowerCase() as ModelType | undefined;

      if (!arg) {
        addItem({
          kind: 'info',
          text: `Models: planner=${s.models.planner} reviewer=${s.models.reviewer}`,
        });
        addItem({
          kind: 'info',
          text: 'Usage: /config planner|reviewer codex|claude',
        });
        break;
      }

      if (arg !== 'planner' && arg !== 'reviewer') {
        addItem({ kind: 'system', variant: 'warn', text: 'Usage: /config planner|reviewer codex|claude' });
        break;
      }

      if (!value || (value !== 'codex' && value !== 'claude')) {
        addItem({ kind: 'system', variant: 'warn', text: 'Model must be codex or claude' });
        break;
      }

      mutate((st) => {
        st.models[arg] = value;
      });
      save(s);
      addItem({ kind: 'system', variant: 'ok', text: `${arg} set to ${value}` });
      break;
    }
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
        text: '/go  /init  /config  /session  /pause  /cancel  /resume  /accept  /spec  /plan  /status  /reset  /clear  /quit',
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
