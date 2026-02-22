# spec2commit

Codex reviews. Claude builds. You ship.

Chat with Codex to shape your idea, type `/go`, and watch the pipeline turn conversation into committed code.

https://github.com/user-attachments/assets/d703db0b-87c0-483c-9347-960483d5a831

## Pipeline

```
SPEC → PLAN → REVIEW → IMPLEMENT → REVIEW → COMMIT
```

Codex distills your chat into a spec. The planner creates the plan, the reviewer reviews it. The planner implements, the reviewer reviews the code. Review loops retry up to 10 times each for plan and code. Human gates pause for your approval by default (`--auto-approve` to skip).

## Install

```bash
git clone https://github.com/baturyilmaz/spec2commit.git
cd spec2commit && npm install && npm run build && npm link
```

Requires [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and/or [OpenAI Codex](https://github.com/openai/codex) installed and authenticated (depending on your model configuration).

## Usage

```bash
spec2commit                              # current directory
spec2commit ~/my-app                     # specific project
spec2commit --resume                     # resume last modified session
spec2commit --session <id>               # resume specific session by ID
spec2commit --list                       # list all sessions and exit
spec2commit --auto-approve               # skip human review gates
spec2commit --planner codex              # set planner model (codex|claude)
spec2commit --reviewer claude            # set reviewer model (codex|claude)
```

## Commands

| Command | Description |
|---------|-------------|
| `/go` | Start the pipeline |
| `/init` | Generate or update AGENTS.md |
| `/pause` | Pause after current step |
| `/cancel` | Cancel the running pipeline |
| `/resume` | Resume paused pipeline |
| `/accept` | Accept and continue from pause |
| `/spec` | Show current spec |
| `/plan` | Show current plan |
| `/status` | Show pipeline status and timing |
| `/config` | View/set model configuration |
| `/session` | Manage sessions (list, switch, new, delete, rename) |
| `/reset` | Reset current session state |
| `/clear` | Clear display |
| `/help` | Show available commands |
| `/quit` | Exit spec2commit |

## Session Management

Sessions persist across runs. Use `/session` commands or CLI flags:

```bash
/session                    # show current session info
/session list               # list all sessions
/session switch <id>        # switch to another session
/session new                # create new session
/session delete <id>        # delete a session
/session rename <name>      # rename current session
```

## Config

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `S2C_MAX_REVIEWS` | `10` | Max review loops per phase |
| `S2C_CLAUDE_TIMEOUT` | `600000` | Claude timeout (ms) |
| `S2C_CODEX_TIMEOUT` | `600000` | Codex timeout (ms) |
| `S2C_MAX_DIFF_KB` | `50` | Max diff size (KB) |
| `S2C_MAX_LOG_ENTRIES` | `200` | Max log entries per session |
| `S2C_MAX_STREAM_LINES` | `24` | Max streaming output lines |
| `S2C_INPUT_HISTORY` | `50` | Input history size |

### Runtime Configuration

Use `/config` to change models during a session:

```bash
/config                     # show current model config
/config planner codex       # set planner to codex
/config reviewer claude     # set reviewer to claude
```

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
