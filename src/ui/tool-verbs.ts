const TOOL_VERBS: Record<string, [string, string]> = {
  Read: ['Reading', 'Read'],
  Write: ['Writing', 'Wrote'],
  Edit: ['Editing', 'Edited'],
  Grep: ['Searching', 'Searched'],
  Glob: ['Finding', 'Found'],
  Bash: ['Running', 'Ran'],
  exec: ['Running', 'Ran'],
  MultiEdit: ['Editing', 'Edited'],
  WebSearch: ['Searching', 'Searched'],
  file: ['Changing', 'Changed'],
  mcp: ['Calling', 'Called'],
  search: ['Searching', 'Searched'],
};

export function verbFor(tool: string, done: boolean): string {
  const pair = TOOL_VERBS[tool];
  if (pair) return done ? pair[1] : pair[0];
  return done ? tool : `${tool}...`;
}
