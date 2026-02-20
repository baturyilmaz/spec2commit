# spec2commit

Codex reviews. Claude builds. You ship.

Chat with Codex to shape your idea, type `/go`, and watch the pipeline turn conversation into committed code.

https://github.com/user-attachments/assets/d703db0b-87c0-483c-9347-960483d5a831

## Pipeline

```
SPEC → PLAN → REVIEW → IMPLEMENT → REVIEW → COMMIT
```

Codex distills your chat into a spec. Claude plans, Codex reviews the plan. Claude implements, Codex reviews the code. Review loops retry up to 10 times each for plan and code. Human gates pause for your approval by default (`--auto-approve` to skip).

## Install

```bash
git clone https://github.com/baturyilmaz/spec2commit.git
cd spec2commit && npm install && npm run build && npm link
```

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and [OpenAI Codex](https://github.com/openai/codex) installed and authenticated.

## Usage

```bash
spec2commit                    # current directory
spec2commit ~/my-app           # specific project
spec2commit --resume           # resume previous session
spec2commit --auto-approve     # skip human review gates
```

## Config

| Variable | Default | Description |
|----------|---------|-------------|
| `S2C_MAX_REVIEWS` | `10` | Max review loops per phase |
| `S2C_CLAUDE_TIMEOUT` | `600000` | Claude timeout (ms) |
| `S2C_CODEX_TIMEOUT` | `600000` | Codex timeout (ms) |

## Architecture

Single-process Ink (React) terminal app. Both agents spawn as CLI child processes:

- **Codex** — `codex exec --json`. Chat uses `--sandbox read-only`, pipeline uses `--full-auto`.
- **Claude** — `claude -p --output-format stream-json --dangerously-skip-permissions`

State persists to `.spec2commit/state.json`.

## Development

```bash
npm run dev          # tsx, no build needed
npm run build        # tsc → dist/
npm run typecheck    # type check only
npm run lint         # eslint
npm run format       # prettier
```

## License

[MIT](LICENSE)
