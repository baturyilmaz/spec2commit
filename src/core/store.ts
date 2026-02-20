import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { Stage, type State } from '../types.js';
import { MAX_LOG_ENTRIES } from '../config.js';

let dir = '.spec2commit';

export function initStore(path: string) {
  dir = join(path, '.spec2commit');
  mkdirSync(dir, { recursive: true });
}

export function newState(projectPath: string): State {
  return {
    projectPath,
    codexThreadId: null,
    claudeSessionId: null,
    stage: Stage.IDLE,
    pausedAt: null,
    spec: null,
    plan: null,
    feedback: null,
    planReviews: 0,
    implReviews: 0,
    log: [],
    startedAt: Date.now(),
    codexMs: 0,
    claudeMs: 0,
    cancelled: false,
    autoApprove: false,
  };
}

export function save(s: State) {
  if (s.log.length > MAX_LOG_ENTRIES) s.log = s.log.slice(-MAX_LOG_ENTRIES);
  const tmp = join(dir, 'state.json.tmp');
  const target = join(dir, 'state.json');
  try {
    writeFileSync(tmp, JSON.stringify(s, null, 2));
    renameSync(tmp, target);
  } catch (e) {
    console.error(`[store] save failed: ${e}`);
  }
}

export function load(): State | null {
  const p = join(dir, 'state.json');
  if (!existsSync(p)) return null;
  try {
    const data = JSON.parse(readFileSync(p, 'utf-8'));
    if (data && typeof data === 'object' && data.projectPath) return data as State;
    return null;
  } catch (e) {
    console.error(`[store] load failed: ${e}`);
    const backup = join(dir, 'state.json.bak');
    if (existsSync(backup)) {
      try {
        const data = JSON.parse(readFileSync(backup, 'utf-8'));
        if (data?.projectPath) return data as State;
      } catch {}
    }
    return null;
  }
}

export const storeDir = () => dir;
