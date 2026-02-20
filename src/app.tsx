import React, { useState, useEffect, useCallback, useRef, useReducer } from 'react';
import { Box, Text, Static, useApp, useInput, useStdout } from 'ink';
import figures from 'figures';
import { execCodex, killAllRunners } from './core/runners.js';
import { runPipeline } from './core/pipeline.js';
import { save } from './core/store.js';
import { type State, type Evt, type PipeMsg, type ItemData, type Item } from './types.js';
import { T } from './ui/theme.js';
import { fmtMs, setWidth } from './ui/format.js';
import { SYSTEM, CHAT_REMINDER } from './core/prompts.js';
import { MAX_WIDTH } from './config.js';
import { handleCommand, type CommandCtx } from './core/commands.js';
import { UserMessage } from './ui/components/user-message.js';
import { AgentMessage } from './ui/components/agent-message.js';
import { SystemMessage } from './ui/components/system-message.js';
import { PipelineMessage } from './ui/components/pipeline-message.js';
import { ToolResult } from './ui/components/tool-result.js';
import { ToolCallLive } from './ui/components/tool-call-live.js';
import { ThinkingIndicator } from './ui/components/thinking-indicator.js';
import { PromptInput } from './ui/components/prompt-input.js';
import { StageProgress } from './ui/components/stage-progress.js';
import { StatusLine } from './ui/components/status-line.js';

function useStateManager(initial: State) {
  const [state, dispatch] = useReducer((prev: State, fn: (draft: State) => void) => {
    const next = { ...prev, log: [...prev.log] };
    fn(next);
    return next;
  }, initial);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    saveTimer.current = setTimeout(() => save(state), 0);
    return () => clearTimeout(saveTimer.current);
  }, [state]);

  return [state, dispatch] as const;
}

export function App({ state: initial }: { state: State }) {
  const { exit } = useApp();
  const { stdout } = useStdout();

  useEffect(() => {
    const cols = stdout?.columns || 80;
    setWidth(Math.min(cols, MAX_WIDTH));
  }, [stdout?.columns]);

  const [s, mutate] = useStateManager(
    (() => {
      if (!initial.startedAt) initial.startedAt = Date.now();
      return initial;
    })(),
  );

  const shortPath = s.projectPath.split('/').filter(Boolean).slice(-2).join('/');
  const nextIdRef = useRef(0);
  const genId = useCallback(() => nextIdRef.current++, []);

  const [items, setItems] = useState<Item[]>(() => {
    const seed: Item[] = [];
    seed.push({ id: nextIdRef.current++, kind: 'info', text: `spec2commit ${figures.pointerSmall} ${shortPath}` });
    const recent = s.log.slice(-10);
    if (recent.length < s.log.length) {
      seed.push({
        id: nextIdRef.current++,
        kind: 'info',
        text: `... ${s.log.length - recent.length} earlier messages`,
      });
    }
    for (const msg of recent) {
      if (msg.role === 'user') seed.push({ id: nextIdRef.current++, kind: 'user', content: msg.content });
      else seed.push({ id: nextIdRef.current++, kind: 'agent', agent: 'codex', content: msg.content });
    }
    return seed;
  });

  const [busy, setBusy] = useState(false);
  const [thinkStartedAt, setThinkStartedAt] = useState(0);
  const [activeAgent, setActiveAgent] = useState<'codex' | 'claude'>('codex');
  const [liveTools, setLiveTools] = useState<Array<{ id: number; tool: string; detail?: string }>>([]);
  const [currentStage, setCurrentStage] = useState<string>(s.stage);
  const streamRef = useRef('');

  const addItem = useCallback(
    (item: ItemData) => {
      setItems((prev) => [...prev, { ...item, id: genId() }]);
    },
    [genId],
  );

  const pipeCallback = useCallback(
    (msg: PipeMsg) => {
      if (msg.kind === 'progress') return;
      if (msg.kind === 'tool') {
        setLiveTools((prev) => [...prev.slice(-4), { id: genId(), tool: msg.tool, detail: msg.detail }]);
        return;
      }
      if (msg.kind === 'agent_switch') {
        setActiveAgent(msg.agent);
        setLiveTools([]);
        return;
      }
      if (msg.kind === 'banner' || msg.kind === 'stage_summary') {
        setCurrentStage(msg.stage);
        if (msg.kind === 'banner') {
          setActiveAgent(msg.agent === 'claude' ? 'claude' : 'codex');
        }
      }
      addItem({ kind: 'pipe', msg });
    },
    [addItem, genId],
  );

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      killAllRunners();
      exit();
    }
    if (key.ctrl && input === 'l') {
      setItems([]);
    }
  });

  const syncPipelineState = useCallback(() => {
    mutate((st) => {
      st.stage = s.stage;
      st.pausedAt = s.pausedAt;
      st.spec = s.spec;
      st.plan = s.plan;
      st.feedback = s.feedback;
      st.planReviews = s.planReviews;
      st.implReviews = s.implReviews;
      st.codexThreadId = s.codexThreadId;
      st.claudeSessionId = s.claudeSessionId;
      st.codexMs = s.codexMs;
      st.claudeMs = s.claudeMs;
      st.cancelled = s.cancelled;
    });
  }, [s, mutate]);

  const runPipe = useCallback(async () => {
    setBusy(true);
    setThinkStartedAt(Date.now());
    setActiveAgent('codex');
    try {
      const ev = await runPipeline(s, pipeCallback);
      syncPipelineState();
      if (ev.type === 'done') {
        addItem({ kind: 'system', variant: 'ok', text: 'Code committed successfully.' });
        addItem({
          kind: 'info',
          text: `${s.startedAt ? fmtMs(Date.now() - s.startedAt) : ''} ${figures.pointerSmall} codex ${fmtMs(s.codexMs)} ${figures.pointerSmall} claude ${fmtMs(s.claudeMs)}`,
        });
        setCurrentStage('DONE');
      } else if (ev.type === 'paused') {
        addItem({ kind: 'system', variant: 'warn', text: ev.question ?? 'Pipeline paused.' });
        addItem({ kind: 'info', text: '/resume  /accept  /cancel' });
        setCurrentStage('PAUSED');
      } else {
        addItem({ kind: 'system', variant: 'error', text: ev.message ?? 'Unknown error' });
        setCurrentStage('IDLE');
      }
    } catch (e) {
      syncPipelineState();
      addItem({ kind: 'system', variant: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
      setThinkStartedAt(0);
      setLiveTools([]);
      streamRef.current = '';
    }
  }, [s, addItem, pipeCallback, syncPipelineState]);

  const handleSubmit = useCallback(
    async (input: string) => {
      if (input.startsWith('/')) {
        const cmdCtx: CommandCtx = {
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
          setLiveTools: (fn) => setLiveTools(fn),
          genId,
          exit,
        };
        await handleCommand(input, cmdCtx);
        return;
      }
      if (busy) {
        addItem({ kind: 'system', variant: 'warn', text: 'Pipeline running. /cancel to abort.' });
        return;
      }

      addItem({ kind: 'user', content: input });
      mutate((st) => {
        st.log.push({ role: 'user', content: input, ts: new Date().toISOString() });
      });

      setThinkStartedAt(Date.now());
      setActiveAgent('codex');
      setLiveTools([]);
      streamRef.current = '';

      const collectedTools: Array<{ tool: string; detail?: string }> = [];

      const onEvent = (evt: Evt) => {
        if (evt.type === 'tool_use') {
          collectedTools.push({ tool: evt.content, detail: evt.detail });
          setLiveTools((prev) => [...prev.slice(-4), { id: genId(), tool: evt.content, detail: evt.detail }]);
        }
      };

      try {
        const prompt = !s.codexThreadId ? `${SYSTEM}\n\n---\n\nUser: ${input}` : `${CHAT_REMINDER}\n\nUser: ${input}`;
        const r = await execCodex(prompt, {
          threadId: s.codexThreadId ?? undefined,
          cwd: s.projectPath,
          onEvent,
          readOnly: true,
        });
        mutate((st) => {
          st.codexThreadId = r.threadId;
          st.log.push({ role: 'codex', content: r.message, ts: new Date().toISOString() });
        });
        if (collectedTools.length > 0) addItem({ kind: 'tools', tools: collectedTools });
        addItem({ kind: 'agent', agent: 'codex', content: r.message });
      } catch (e) {
        addItem({ kind: 'system', variant: 'error', text: e instanceof Error ? e.message : String(e) });
      } finally {
        setThinkStartedAt(0);
        setLiveTools([]);
        streamRef.current = '';
      }
    },
    [
      busy,
      s,
      addItem,
      mutate,
      runPipe,
      genId,
      setThinkStartedAt,
      setActiveAgent,
      setBusy,
      setCurrentStage,
      setItems,
      exit,
    ],
  );

  return (
    <Box flexDirection="column" width="100%">
      <Static items={items}>
        {(item) => {
          switch (item.kind) {
            case 'user':
              return <UserMessage key={item.id} content={item.content} />;
            case 'agent':
              return <AgentMessage key={item.id} agent={item.agent} content={item.content} />;
            case 'tools':
              return <ToolResult key={item.id} tools={item.tools} />;
            case 'pipe':
              return <PipelineMessage key={item.id} msg={item.msg} />;
            case 'system':
              return <SystemMessage key={item.id} variant={item.variant} text={item.text} />;
            case 'info':
              return (
                <Box key={item.id} paddingLeft={2}>
                  <Text color={T.dim}>{item.text}</Text>
                </Box>
              );
          }
        }}
      </Static>

      {thinkStartedAt > 0 && (
        <Box flexDirection="column" width="100%">
          <ThinkingIndicator startedAt={thinkStartedAt} agent={activeAgent} />
          {liveTools.slice(-3).map((t) => (
            <ToolCallLive key={t.id} tool={t.tool} detail={t.detail} />
          ))}
        </Box>
      )}

      <Box flexDirection="column" width="100%" marginTop={1}>
        <StageProgress stage={busy ? currentStage : s.stage} startedAt={s.startedAt} />
        <StatusLine project={shortPath} codexId={s.codexThreadId} autoApprove={s.autoApprove} />
        <PromptInput onSubmit={handleSubmit} isActive={thinkStartedAt === 0 && !busy} />
      </Box>
    </Box>
  );
}
