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
2. Turn the switch on. The port defaults to `5274`.
3. On mobile (and optionally on desktop) enable **Allow LAN access** so other
   machines can reach the phone/laptop.
4. Copy the endpoint and the access token shown in the card. The
   "Copy Claude Code command" button produces a ready-to-paste command.

Settings live in `<app config dir>/Exameow/mcp.json`
(macOS `~/Library/Application Support/Exameow/`, Linux `~/.config/Exameow/`,
Windows `%APPDATA%\Exameow\`).

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

## Client configuration

### Claude Code

```bash
claude mcp add --transport http exameow http://127.0.0.1:5274/mcp \
  --header "Authorization: Bearer <token>"
```

### Cursor / other JSON-config clients

```json
{
  "mcpServers": {
    "exameow": {
      "url": "http://127.0.0.1:5274/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

### Claude Desktop

Claude Desktop only launches stdio servers directly. Point a small proxy at the
HTTP endpoint (for example `mcp-remote`):

```json
{
  "mcpServers": {
    "exameow": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://127.0.0.1:5274/mcp",
        "--header",
        "Authorization: Bearer <token>"
      ]
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
| `submit_answer` | Grade the current question (optional AI grading) |
| `finish_practice` | Finish and get the score summary |
| `list_wrong_questions` | Wrong-question records |
| `publish_exam` | Publish an online exam from questions or banks |
| `get_exam_results` | Read submissions (per-exam admin token) |
| `delete_exam` | Delete an exam and its results (`confirm: true`) |
| `navigate` | Bring the UI to a route |

## Security

- Every `/mcp` request and the bridge WebSocket require the bearer token.
  Regenerating the token invalidates the old one immediately.
- Desktop binds `127.0.0.1` unless LAN access is enabled; mobile binds the LAN
  address by default because loopback-only would be unreachable.
- Cross-origin browser requests are rejected (`Origin` must be absent, be a
  Tauri origin, be loopback, or match `Host`). This blocks DNS-rebinding and
  drive-by requests from websites.
- `get_config` never returns the API key.
- Destructive tools require an explicit `confirm: true`.
- Request bodies are capped at 8 MiB; `fetch_page` reuses the core SSRF guard.

If a self-hosted instance is exposed to the internet, the token is the only
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

```bash
TOKEN=$(cat mcp_token.txt)

curl -s localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"0"}}}'

curl -s localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

curl -s localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"app_status","arguments":{}}}'
```
