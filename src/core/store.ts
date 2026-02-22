import { mkdirSync, writeFileSync, readFileSync, existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Stage, DEFAULT_MODEL_CONFIG, type State, type ModelConfig, type SessionStore } from '../types.js';
import { MAX_LOG_ENTRIES } from '../config.js';

let dir = '.spec2commit';
let store: SessionStore | null = null;

const STORE_VERSION = 1;
const MAX_SESSIONS = 50;

function generateId(): string {
  return randomBytes(4).toString('hex');
}

export function initStore(path: string) {
  dir = join(path, '.spec2commit');
  mkdirSync(dir, { recursive: true });
  store = loadStore();
}

function loadStore(): SessionStore {
  const p = join(dir, 'sessions.json');
  
  if (existsSync(p)) {
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8'));
      if (data && data.version === STORE_VERSION && Array.isArray(data.sessions)) {
        return data as SessionStore;
      }
    } catch (e) {
      console.error(`[store] load failed: ${e}`);
    }
  }
  
  const oldStatePath = join(dir, 'state.json');
  if (existsSync(oldStatePath)) {
    try {
      const oldState = JSON.parse(readFileSync(oldStatePath, 'utf-8'));
      if (oldState && oldState.projectPath) {
        const migratedState = migrateOldState(oldState);
        return {
          version: STORE_VERSION,
          activeSessionId: migratedState.id,
          sessions: [migratedState],
        };
      }
    } catch {}
  }
  
  return {
    version: STORE_VERSION,
    activeSessionId: null,
    sessions: [],
  };
}

function migrateOldState(old: any): State {
  const now = Date.now();
  return {
    id: generateId(),
    name: null,
    createdAt: old.startedAt ?? now,
    modifiedAt: now,
    projectPath: old.projectPath,
    codexThreadId: old.codexThreadId ?? null,
    claudeSessionId: old.claudeSessionId ?? null,
    stage: old.stage ?? Stage.IDLE,
    pausedAt: old.pausedAt ?? null,
    spec: old.spec ?? null,
    plan: old.plan ?? null,
    feedback: old.feedback ?? null,
    planReviews: old.planReviews ?? 0,
    implReviews: old.implReviews ?? 0,
    log: old.log ?? [],
    startedAt: old.startedAt ?? now,
    codexMs: old.codexMs ?? 0,
    claudeMs: old.claudeMs ?? 0,
    cancelled: old.cancelled ?? false,
    autoApprove: old.autoApprove ?? false,
    models: old.models ?? { ...DEFAULT_MODEL_CONFIG },
  };
}

function isSessionEmpty(s: State): boolean {
  return (
    s.stage === Stage.IDLE &&
    s.log.length === 0 &&
    !s.spec &&
    !s.plan &&
    !s.codexThreadId &&
    !s.claudeSessionId
  );
}

function isSessionModified(s: State): boolean {
  return s.log.length > 0 || s.spec !== null || s.plan !== null || s.stage !== Stage.IDLE;
}

export function newState(projectPath: string, models?: Partial<ModelConfig>): State {
  const now = Date.now();
  return {
    id: generateId(),
    name: null,
    createdAt: now,
    modifiedAt: now,
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
    startedAt: now,
    codexMs: 0,
    claudeMs: 0,
    cancelled: false,
    autoApprove: false,
    models: { ...DEFAULT_MODEL_CONFIG, ...models },
  };
}

export function getOrCreateSession(projectPath: string, models?: Partial<ModelConfig>): State {
  if (!store) store = loadStore();
  
  if (store.sessions.length > 0) {
    const lastSession = store.sessions[store.sessions.length - 1];
    if (isSessionEmpty(lastSession)) {
      if (models) {
        lastSession.models = { ...lastSession.models, ...models };
      }
      store.activeSessionId = lastSession.id;
      saveStore();
      return lastSession;
    }
  }
  
  const session = newState(projectPath, models);
  store.sessions.push(session);
  store.activeSessionId = session.id;
  
  if (store.sessions.length > MAX_SESSIONS) {
    store.sessions = store.sessions.slice(-MAX_SESSIONS);
  }
  
  saveStore();
  return session;
}

export function getActiveSession(): State | null {
  if (!store) return null;
  if (!store.activeSessionId) return null;
  return store.sessions.find((s) => s.id === store!.activeSessionId) ?? null;
}

export function getSessionById(id: string): State | null {
  if (!store) return null;
  return store.sessions.find((s) => s.id === id) ?? null;
}

export function listSessions(): State[] {
  if (!store) return [];
  return [...store.sessions].reverse();
}

export function switchSession(id: string): State | null {
  if (!store) return null;
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return null;
  store.activeSessionId = id;
  saveStore();
  return session;
}

export function deleteSession(id: string): boolean {
  if (!store) return false;
  const idx = store.sessions.findIndex((s) => s.id === id);
  if (idx === -1) return false;
  
  store.sessions.splice(idx, 1);
  
  if (store.activeSessionId === id) {
    store.activeSessionId = store.sessions.length > 0 ? store.sessions[store.sessions.length - 1].id : null;
  }
  
  saveStore();
  return true;
}

export function renameSession(id: string, name: string): boolean {
  if (!store) return false;
  const session = store.sessions.find((s) => s.id === id);
  if (!session) return false;
  session.name = name || null;
  session.modifiedAt = Date.now();
  saveStore();
  return true;
}

function saveStore() {
  if (!store) return;
  const tmp = join(dir, 'sessions.json.tmp');
  const target = join(dir, 'sessions.json');
  try {
    writeFileSync(tmp, JSON.stringify(store, null, 2));
    renameSync(tmp, target);
  } catch (e) {
    console.error(`[store] save failed: ${e}`);
  }
}

export function save(s: State) {
  if (!store) return;
  
  if (s.log.length > MAX_LOG_ENTRIES) s.log = s.log.slice(-MAX_LOG_ENTRIES);
  s.modifiedAt = Date.now();
  
  const idx = store.sessions.findIndex((sess) => sess.id === s.id);
  if (idx !== -1) {
    store.sessions[idx] = s;
  } else {
    store.sessions.push(s);
    store.activeSessionId = s.id;
  }
  
  saveStore();
}

export function load(): State | null {
  if (!store) store = loadStore();
  return getActiveSession();
}

export function loadLastModified(): State | null {
  if (!store) store = loadStore();
  if (store.sessions.length === 0) return null;
  
  const sorted = [...store.sessions].sort((a, b) => b.modifiedAt - a.modifiedAt);
  const last = sorted[0];
  
  if (last && isSessionModified(last)) {
    store.activeSessionId = last.id;
    saveStore();
    return last;
  }
  
  return null;
}

export const storeDir = () => dir;
