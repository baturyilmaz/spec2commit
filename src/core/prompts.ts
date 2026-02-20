export const SYSTEM = `You are the tech lead in spec2commit — a tool where you shape tasks with the user, then a separate agent implements the code.
Your role in this conversation: understand the project, discuss ideas, ask clarifying questions, and help define what to build. You do NOT implement anything.
Read files, search code, and browse the codebase to give informed, code-grounded answers — but NEVER write files, run install/remove/build commands, or modify the project in any way.
When reviewing, start with APPROVE|REVISE|ASK_USER on the first line and cite exact files.
Prefer the simplest working solution; avoid over-engineering.`;

export const CHAT_REMINDER = `[You are the tech lead — discuss, explore, and help shape the task. Do NOT write files, run modifying commands, or make any changes. A separate agent implements later when the user runs /go.]`;

export const spec = (history: string) =>
  `Convert conversation into an implementation-ready spec in Jira format so an engineer can execute without extra clarification. Use the codebase to ground file paths and verify claims.

<conversation>
${history}
</conversation>

Use this exact format:

Title: <clear outcome-focused title>
Type: <Bug|Task|Refactor>
Priority: <P1/P2/P3>

Context
- <current behavior>
- <why this is a problem>

Goal
- <target behavior after change>

Scope
- In: <items>
- Out: <items>

Implementation Plan
1. <step>
2. <step>

Impacted Files
- <path>: <change summary>

Verification
1. <command + expected result>

Acceptance Criteria
- <measurable condition>

Risks / Migration
- <compatibility or rollback note, or "None" if trivial>`;

export function plan(spec: string, feedback?: string | null) {
  let p = `Plan the implementation for this spec. Output your COMPLETE plan as your final response.

Rules:
- Do NOT implement anything. Do NOT write, edit, or modify any files. A separate step handles implementation.
- Your final response MUST contain the full plan — not a summary or reference to earlier messages. Include every detail: file paths, function names, exact changes, and reasoning.

<spec>
${spec}
</spec>`;

  if (feedback) {
    p += `\n\n<feedback>\n${feedback}\n</feedback>\n\nAddress every feedback item.`;
  }
  return p;
}

export const planReview = (spec: string, plan: string) =>
  `Review plan against spec. Verify files/patterns with tools.

<spec>
${spec}
</spec>

<plan>
${plan}
</plan>

Check completeness, correctness, simplicity, over-engineering risk.

Output:
- VERDICT: APPROVE | REVISE | ASK_USER
- Reasoning: brief
- Changes: concrete what+why (only if REVISE)
- Question: one blocking question (only if ASK_USER)`;

export function implement(spec: string, plan: string, feedback?: string | null) {
  let p = `Implement spec per plan.

<spec>
${spec}
</spec>

<plan>
${plan}
</plan>

Read before edit. Match existing style.
Keep diff minimal; no gold-plating.
Use existing libraries/patterns.
Run relevant checks (build/typecheck/lint/tests) and report results.`;

  if (feedback) {
    p += `\n\n<feedback>\n${feedback}\n</feedback>\n\nFeedback takes priority over plan.`;
  }
  return p;
}

export const implReview = (spec: string, plan: string, diff: string) =>
  `Review this diff against spec and plan.

<spec>
${spec}
</spec>

<plan>
${plan}
</plan>

<diff>
${diff}
</diff>

Check spec/plan coverage, correctness, regressions, unnecessary complexity.

Output:
- VERDICT: APPROVE | REVISE | ASK_USER
- Reasoning: brief
- Changes: file + fix list (only if REVISE)
- Question: one blocking question (only if ASK_USER)`;

export const gate = (review: string) =>
  `Convert this review to JSON only. No markdown or extra text.

<review>
${review}
</review>

{"approved": boolean, "action": "approve"|"revise"|"ask_user", "feedback": "short summary", "specificChanges": ["change 1", "change 2"]}

Rules:
- approved = (action === "approve")
- keep feedback concise
- specificChanges optional
- ambiguous => "revise"`;

const MERGE_PREFIX = (file: string) =>
  `Read the existing ${file} first. Update and improve it with any new findings from the codebase, preserving useful existing content. Do not start from scratch.\n\n`;

export function initClaude(exists: boolean): string {
  const prefix = exists ? MERGE_PREFIX('CLAUDE.md') : '';
  return `${prefix}Generate a file named CLAUDE.md that provides project-specific context for Claude Code sessions.
Your goal is to produce a clear, concise, and well-structured document with descriptive headings and actionable explanations for each section.
Follow the outline below, but adapt as needed — add sections if relevant, and omit those that do not apply to this project.

Document Requirements

- Title the document with the project name.
- Use Markdown headings (#, ##, etc.) for structure.
- Keep explanations short, direct, and specific to this repository.
- Provide examples where helpful (commands, directory paths, naming patterns).
- Maintain a professional, instructional tone.

Recommended Sections

Project Overview
- Brief description of what this project does and its purpose.

Architecture & Key Files
- Outline the project structure, including where the source code, tests, and assets are located.
- List the most important files and their roles.

Build, Test, and Lint Commands
- List key commands for building, testing, linting, and running locally.
- Briefly explain what each command does.

Coding Conventions
- Specify indentation rules, language-specific style preferences, and naming patterns.
- Include any formatting or linting tools used.

Important Patterns & Gotchas
- Document non-obvious patterns, footguns, or constraints that are easy to miss.

(Optional) Add other sections if relevant, such as Security & Configuration Tips, Dependencies, or Deployment.

Write the file to the project root using your Write tool.`;
}

export function initCodex(exists: boolean): string {
  const prefix = exists ? MERGE_PREFIX('AGENTS.md') : '';
  return `${prefix}Generate a file named AGENTS.md that serves as a contributor guide for this repository.
Your goal is to produce a clear, concise, and well-structured document with descriptive headings and actionable explanations for each section.
Follow the outline below, but adapt as needed — add sections if relevant, and omit those that do not apply to this project.

Document Requirements

- Title the document "Repository Guidelines".
- Use Markdown headings (#, ##, etc.) for structure.
- Keep explanations short, direct, and specific to this repository.
- Provide examples where helpful (commands, directory paths, naming patterns).
- Maintain a professional, instructional tone.

Recommended Sections

Project Structure & Module Organization
- Outline the project structure, including where the source code, tests, and assets are located.

Build, Test, and Development Commands
- List key commands for building, testing, and running locally (e.g., npm test, make build).
- Briefly explain what each command does.

Coding Style & Naming Conventions
- Specify indentation rules, language-specific style preferences, and naming patterns.
- Include any formatting or linting tools used.

Testing Guidelines
- Identify testing frameworks and coverage requirements.
- State test naming conventions and how to run tests.

Commit & Pull Request Guidelines
- Summarize commit message conventions found in the project's Git history.
- Outline pull request requirements (descriptions, linked issues, screenshots, etc.).

(Optional) Add other sections if relevant, such as Security & Configuration Tips, Architecture Overview, or Agent-Specific Instructions.`;
}
