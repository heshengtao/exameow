# MCP integration (desktop / mobile / self-hosted)

Exameow ships a built-in **Model Context Protocol (MCP)** server, so external AI
harnesses — Claude Code, Claude Desktop, Cursor, Codex, or anything else that
speaks MCP — can drive the app's main features.

The server implements the `2025-06-18` revision (with `2024-11-05` /
`2025-03-26` clients negotiated down automatically) over **Streamable HTTP**.
Only the `tools` capability is advertised; there is no SSE stream, no resources,
no prompts and no sampling.

## Endpoints

| Build | MCP URL | Bridge (app state) |
| --- | --- | --- |
| Desktop app | `http://127.0.0.1:5274/mcp` (LAN opt-in) | `ws://127.0.0.1:5274/api/mcp/session` |
| Android / iOS app | `http://<phone-ip>:5274/mcp` (LAN on by default) | `ws://127.0.0.1:5274/api/mcp/session` |
| Self-hosted / Docker | `http://<host>:3000/mcp` | `ws(s)://<host>/api/mcp/session` (opened by the browser tab) |

The Cloudflare Worker build does **not** expose MCP: Workers are billed per
request and have no persistent process, so state tools could not work there.

## Enabling

### Desktop / mobile app

1. Open **Mine → Settings → MCP / AI client access**.
2. Turn the switch on. Desktop starts with loopback MCP **on**; mobile starts off.
   The port defaults to `5274`.
3. On mobile (and optionally on desktop) enable **Allow LAN access** so other
   machines can reach the phone/laptop.
4. Copy the endpoint and the access token shown in the card. The
   "Copy Claude Code command" button produces a ready-to-paste command.

Settings live in `<app config dir>/Exameow/mcp.json`
(macOS `~/Library/Application Support/Exameow/`, Linux `~/.config/Exameow/`,
Windows `%APPDATA%\Exameow/`).

The app also writes two discovery files there on every launch / while running:

| File | Content |
| --- | --- |
| `mcp-url` | The URL actually being served (removed when MCP stops) |
| `cli-path` | Absolute path to the bundled `exameow-cli` binary |

External harnesses should read these instead of guessing a port or searching PATH.

When building the Android APK yourself, run `pnpm tauri android init` and then
`pnpm android:patch` once — release builds block cleartext traffic, and the
patch allows loopback only so the in-app bridge can reach `ws://127.0.0.1`.
The release workflow applies it automatically.

### Self-hosted server / Docker

MCP is enabled by default. Control it with environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `MCP_ENABLED` | `true` | Set to `false`/`0` to turn the endpoint off |
| `MCP_TOKEN` | — | Explicit bearer token |
| `MCP_TOKEN_FILE` | `./mcp_token.txt` | Generated on first boot when `MCP_TOKEN` is empty |

Docker Compose mounts the token file under `/app/data` (dev) so it survives
restarts. Read it with:

```bash
docker exec exameow-server cat /app/data/mcp_token.txt
```

Open the web app in a browser tab so the state tools can reach `localStorage`;
without a tab, state tools return `app_not_connected`.

## Local access needs no token

Requests whose **TCP peer is loopback** (`127.0.0.1`, `::1`) are accepted without
an `Authorization` header, provided the `Host` is a loopback name and any browser
`Origin` is loopback or Tauri. This is what makes the CLI and local AI harnesses
keyless:

```bash
curl -s http://127.0.0.1:5274/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

LAN clients connecting to `http://<lan-ip>:5274/mcp` still need the bearer token
— the peer address is not loopback, so the token remains the gate. A remote
attacker cannot spoof loopback by sending `Host: 127.0.0.1`; the check uses the
socket address, not headers.

## `exameow` command line (thin MCP client)

Desktop installers bundle `exameow-cli`, a thin MCP client. Enable
**Settings → Command line (exameow)** to put the
`exameow` command on PATH (macOS uses `/usr/local/bin`, Windows uses a small
`exameow.cmd` shim; Linux/AppImage show a manual command).

```bash
exameow status                  # is the app running and MCP reachable?
exameow start                   # launch the app and wait for MCP
exameow tools                   # list MCP tools
exameow call app_status --json '{}'
exameow call generate_exam --json '{
  "source": {"path": "/abs/notes.pdf"},
  "params": {"count": 10, "language": "zh-CN"},
  "save_to_bank": true
}'
```

The command surface is the MCP tool surface: adding a tool automatically adds a
callable subcommand (forwarded by name). The CLI discovers the endpoint via
`EXAMEOW_MCP_URL` → `mcp-url` → `mcp.json` port, and reads a token only for LAN
usage (`EXAMEOW_MCP_TOKEN` or `mcp.json`). `exameow start` accepts
`EXAMEOW_APP_PATH` for custom installs.

Desktop packaging lives in `src-tauri/tauri.desktop.conf.json` (sidecar +
skill resources). Build a desktop installer with:

```bash
pnpm tauri build --config src-tauri/tauri.desktop.conf.json
```

Mobile builds deliberately use the base `tauri.conf.json` (no sidecar).

## AI skills (any harness)

The desktop app bundles `skills/exameow/` — an Agent Skill with `SKILL.md` plus
on-demand `references/` for generation, practice, tutoring, exams, config and
troubleshooting. Enable **Settings → AI skills** to copy
it to the two common discovery directories:

- `~/.claude/skills/exameow/` (Claude Code)
- `~/.agents/skills/exameow/` (generic Agent Skills)

A `.exameow-skill.json` marker records the app version; the settings card shows
an update hint after an app upgrade (toggle off/on to refresh). Uninstall only
removes directories whose marker / `SKILL.md` identifies them as Exameow's.
Restart the harness after installing so it picks up the skill.

Prefer not to use the in-app installer? Install from the repository:

```bash
# Option 1: skills CLI
npx skills add heshengtao/exameow
```

```
# Option 2: ask your agent
Install this Skill: https://github.com/heshengtao/exameow
```

Direct source: <https://github.com/heshengtao/exameow/tree/main/skills/exameow>.

For **DeepSeek Harness**, the optional
[`exameow-dsh-habit`](https://github.com/heshengtao/exameow-dsh-habit) bundle adds
a native **Daily Study** page below **Automation tasks** in the sidebar (daily
goal, streak, XP, seven-day view) and creates durable DSH reminders through the
Host `schedule` service. When it is installed, the skill detects the
`study_habit` tool and records practice/check-ins automatically; when it is
absent, the skill tells the user how to install it.

With the skill loaded, an agent can:

- generate questions from a document or text and save them to a bank;
- start a practice session and quiz the learner **one question at a time**;
- grade answers, explain, discuss follow-ups, then advance with `next_question`;
- finish with a summary, retry wrong questions, export, or publish an online exam.

The skill teaches the same flow for MCP-native clients, CLI-only harnesses, and
stdio-only clients (via `mcp-remote`).

## Client configuration

### Claude Code

```bash
# Local desktop: no token needed
claude mcp add --transport http exameow http://127.0.0.1:5274/mcp

# LAN / remote only: add the bearer token
claude mcp add --transport http exameow http://<lan-ip>:5274/mcp \
  --header "Authorization: Bearer <token>"
```

### Cursor / other JSON-config clients

Local desktop:

```json
{
  "mcpServers": {
    "exameow": { "url": "http://127.0.0.1:5274/mcp" }
  }
}
```

LAN / remote:

```json
{
  "mcpServers": {
    "exameow": {
      "url": "http://<lan-ip>:5274/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

### Claude Desktop

Claude Desktop only launches stdio servers directly. Point a small proxy at the
HTTP endpoint (for example `mcp-remote`); local desktop needs no header:

```json
{
  "mcpServers": {
    "exameow": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:5274/mcp"]
    }
  }
}
```

## Tools

### Stateless (implemented in Rust, works without a UI)

| Tool | Description |
| --- | --- |
| `get_config` | Read endpoint/model/flags (never the API key) |
| `set_config` | Save endpoint, API key, model, max tokens, temperature, reasoning effort |
| `list_models` | List models from the OpenAI-compatible endpoint |
| `parse_document` | Extract text from PDF/DOCX/XLSX/PPTX/ODT/EPUB/CSV/HTML/TXT (path or base64) |
| `generate_exam` | Generate questions from a file, base64 document or raw text; `save_to_bank` stores them |
| `answer_question` | Answer one question with reasoning |
| `judge_answer` | Grade a free-text answer against a reference |
| `explain_question` | Tutor-style explanation, optionally grounded in web search |
| `export_questions` | CSV/XLSX to a path or as base64 |
| `web_search` | Search through the configured provider |
| `fetch_page` | Extract readable text from a public URL |

### Stateful (forwarded to the running app)

| Tool | Description |
| --- | --- |
| `app_status` | Platform, version, AI status, bank count, active session, MCP sessions |
| `list_banks` / `get_bank` | Browse stored banks (answers and analysis included) |
| `create_bank` / `add_questions_to_bank` | Store questions the app shows immediately |
| `delete_bank` | Delete a bank (`confirm: true` required) |
| `search_bank_questions` | Substring search over stems |
| `start_practice` | Start sequential / random / mock / wrong-only practice |
| `get_practice_state` | Progress plus the current question (no answer) |
| `next_question` | Advance to the next question after discussion |
| `submit_answer` | Grade the current question (optional AI grading) |
| `finish_practice` | Finish and get the score summary |
| `list_wrong_questions` | Wrong-question records |
| `publish_exam` | Publish an online exam from questions or banks |
| `get_exam_results` | Read submissions (per-exam admin token) |
| `delete_exam` | Delete an exam and its results (`confirm: true`) |
| `navigate` | Bring the UI to a route |

## Security

- Loopback peers are trusted for `/mcp` and the bridge WebSocket; **LAN and
  remote requests still require the bearer token**. Regenerating the token
  invalidates the old one immediately.
- Desktop binds `127.0.0.1` unless LAN access is enabled; mobile binds the LAN
  address by default because loopback-only would be unreachable.
- Cross-origin browser requests are rejected (`Origin` must be absent, be a
  Tauri origin, be loopback, or match `Host`). This blocks DNS-rebinding and
  drive-by requests from websites. The keyless loopback rule uses the TCP peer
  address, not client-controlled headers.
- `get_config` never returns the API key.
- Destructive tools require an explicit `confirm: true`.
- Request bodies are capped at 8 MiB; `fetch_page` reuses the core SSRF guard.
- The CLI only connects to the configured endpoint; it does not open a port. The
  installed `exameow` command is a symlink/shim to the bundled binary, never a
  copy, so it follows app updates.
- If a self-hosted instance is exposed to the internet, the token is the only
  gate — put it behind a reverse proxy/firewall or set `MCP_ENABLED=false`.

## Limitations

- Mobile OSes suspend background apps, and desktop WebViews can be paused when
  the window is hidden, minimized or on another desktop. State tools then return
  `app_suspended` (the bridge checks a 20-second heartbeat) — bring the window
  to the foreground and retry. Stateless tools keep working regardless.
- State tools need an open app window (desktop/mobile) or browser tab (web).
- No MCP resources, prompts, sampling, elicitation or server-initiated
  notifications.
- `generate_exam` is synchronous; long generations can hit client-side MCP tool
  timeouts. Lower `params.count` or split the work into batches.

## Verifying by hand

Local desktop (keyless):

```bash
curl -s http://127.0.0.1:5274/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

curl -s http://127.0.0.1:5274/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl -s http://127.0.0.1:5274/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"app_status","arguments":{}}}'
```

Self-hosted / Docker / LAN (token required):

```bash
TOKEN=$(cat mcp_token.txt)

curl -s localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'
```

Or use the bundled client:

```bash
exameow status
exameow tools
exameow call app_status --json '{}'
```
