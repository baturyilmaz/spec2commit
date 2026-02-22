import { z } from 'zod';
import { MAX_REVIEWS } from './config.js';

export type ModelType = 'codex' | 'claude';

export interface ModelConfig {
  planner: ModelType;
  reviewer: ModelType;
}

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  planner: 'claude',
  reviewer: 'codex',
};

export type PipeMsg =
  | { kind: 'banner'; stage: string; agent: string; detail?: string }
  | { kind: 'progress'; activeIdx: number }
  | { kind: 'ok'; text: string }
  | { kind: 'warn'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'sep' }
  | { kind: 'text'; agent: string; text: string }
  | { kind: 'status'; text: string }
  | { kind: 'tool'; agent: string; tool: string; detail?: string }
  | { kind: 'agent_switch'; agent: ModelType }
  | { kind: 'duration'; session: string; codex: string; claude: string }
  | { kind: 'stage_summary'; stage: string; verdict?: string; attempt?: string; elapsed?: string; detail?: string };

export const Stage = {
  IDLE: 'IDLE',
  SPEC: 'SPEC',
  PLAN: 'PLAN',
  PLAN_REVIEW: 'PLAN_REVIEW',
  IMPLEMENT: 'IMPLEMENT',
  IMPL_REVIEW: 'IMPL_REVIEW',
  COMMIT: 'COMMIT',
  DONE: 'DONE',
  PAUSED: 'PAUSED',
} as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

const VALID_TRANSITIONS: Record<Stage, readonly Stage[]> = {
  IDLE: [Stage.SPEC],
  SPEC: [Stage.PLAN],
  PLAN: [Stage.PLAN_REVIEW],
  PLAN_REVIEW: [Stage.PLAN, Stage.IMPLEMENT, Stage.PAUSED],
  IMPLEMENT: [Stage.IMPL_REVIEW],
  IMPL_REVIEW: [Stage.IMPLEMENT, Stage.COMMIT, Stage.PAUSED],
  COMMIT: [Stage.DONE],
  PAUSED: [Stage.PLAN, Stage.IMPLEMENT, Stage.COMMIT, Stage.IDLE],
  DONE: [Stage.IDLE],
};

export function transitionTo(s: State, next: Stage): boolean {
  const allowed = VALID_TRANSITIONS[s.stage];
  if (!allowed?.includes(next)) {
    console.error(`Invalid stage transition: ${s.stage} → ${next}`);
    return false;
  }
  s.stage = next;
  return true;
}

export interface Evt {
  type: 'text' | 'tool_use' | 'tool_result' | 'status' | 'error';
  agent: ModelType;
  content: string;
  detail?: string;
}

export interface State {
  id: string;
  name: string | null;
  createdAt: number;
  modifiedAt: number;
  projectPath: string;
  codexThreadId: string | null;
  claudeSessionId: string | null;
  stage: Stage;
  pausedAt: Stage | null;
  spec: string | null;
  plan: string | null;
  feedback: string | null;
  planReviews: number;
  implReviews: number;
  log: { role: 'user' | 'codex' | 'claude'; content: string; ts: string }[];
  startedAt: number | null;
  codexMs: number;
  claudeMs: number;
  cancelled: boolean;
  autoApprove: boolean;
  models: ModelConfig;
}

export interface SessionStore {
  version: number;
  activeSessionId: string | null;
  sessions: State[];
}

export interface CodexResult {
  threadId: string;
  message: string;
}

export interface ClaudeResult {
  result: string;
  fullText: string;
  sessionId: string;
}

export const GateSchema = z.object({
  approved: z.boolean(),
  action: z.enum(['approve', 'revise', 'ask_user']),
  feedback: z.string(),
  specificChanges: z.array(z.string()).optional(),
});
export type Gate = z.infer<typeof GateSchema>;

export type ItemData =
  | { kind: 'user'; content: string }
  | { kind: 'agent'; agent: ModelType; content: string }
  | { kind: 'system'; variant: 'ok' | 'warn' | 'error'; text: string }
  | { kind: 'info'; text: string }
  | { kind: 'tools'; tools: Array<{ tool: string; detail?: string }> }
  | { kind: 'pipe'; msg: PipeMsg };

export type Item = ItemData & { id: number };

export { MAX_REVIEWS };
