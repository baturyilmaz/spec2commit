export const T = {
  text: '#D4D4D4',
  dim: '#666666',
  muted: '#888888',
  bright: '#FFFFFF',

  success: '#4EC9B0',
  warning: '#CCA700',
  error: '#F14C4C',

  codex: '#10A37F',
  claude: '#D97757',

  separator: '#333333',
  prompt: '#D97757',
} as const;

export type Agent = 'codex' | 'claude';
