# 排错

## 先做三件事

1. `exameow status`（或包内全路径）—— 软件在不在、MCP 是否可达。
2. `exameow call app_status --json '{}'` —— 平台、版本、AI 是否配置、题库数、bridge 是否连着。
3. 看配置目录的 `mcp-url` 与 `cli-path`：
   - macOS `~/Library/Application Support/Exameow/`
   - Linux `~/.config/Exameow/`
   - Windows `%APPDATA%\Exameow\`

## 常见错误

### `app_not_connected`

- App 没开 → `exameow start` 或让用户打开。
- App 开着但窗口没有 bridge → 打开主窗口，别让页面停在后台标签。
- 自托管 / Docker：需要浏览器标签页打开 Web 版，state 工具才能读到 `localStorage`。

### `app_suspended`

窗口被最小化、隐藏、切到别的桌面，或手机后台挂起。把 Exameow 带到前台，重试一次。
Stateless 工具（出题 / 解析 / 判分 / 搜索）不受影响。

### 401 `unauthorized`

- 本机回环（`127.0.0.1` / `localhost` / `[::1]`）**不需要** token；带了错的 token 反而可能被拒，
  先去掉 `Authorization` 头。
- LAN / 反向代理：token 从 `mcp.json` 或设置页复制；注意不要带多余空格。
- 用户刚点过「重新生成令牌」→ 旧 token 立即失效。

### 连接不上 / 端口不对

- 读 `mcp-url`，不要硬编码端口（用户可能改过）。
- 默认端口 `5274`；被占用时 App 会在设置里报错。
- 检查设置页的 MCP 开关是否打开。

### `command not found: exameow`

- 设置里打开「在终端使用 exameow」；或直接用 `cli-path` 里的全路径。
- AppImage / 开发构建不支持自动挂载，用全路径。
- Windows 的 shim 在 `%LOCALAPPDATA%\Exameow\bin\exameow.cmd`；重新打开终端让 PATH 生效。

### 工具超时

- `generate_exam` 是同步的：降低 `count`、缩短材料、分批。
- `fetch_page` 目标站点慢：加 `max_chars` 限制或换来源。
- MCP 客户端自身的 tool timeout 可能比 App 短；小步调用。

### 中文 / 乱码

- `language` 用 `zh-CN`；题干语言由它决定。
- 文件解析乱码：确认编码（UTF-8 / GBK）或先转文本。

## 各客户端配置

### 支持 HTTP MCP 的客户端

用 Streamable HTTP 添加名为 `exameow` 的服务器，地址
`http://127.0.0.1:5274/mcp`；本机不要加鉴权头，端口以 `mcp-url` 为准。

### JSON 配置的客户端

```json
{
  "mcpServers": {
    "exameow": { "url": "http://127.0.0.1:5274/mcp" }
  }
}
```

### 只支持 stdio 的客户端

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

### 只能跑 shell 的 Harness

不需要 MCP：直接 `exameow call <tool> --json '{…}'`。

## 自托管 / Docker

- MCP 默认开启，地址 `http://<host>:3000/mcp`。
- token 来自 `MCP_TOKEN` 或 `MCP_TOKEN_FILE`（默认 `./mcp_token.txt`，Docker 挂在 `/app/data`）。
- 非回环请求**必须**带 token；局域网也一样。
- 在线考试 relay 用 SQLite（`EXAM_DB_PATH`），Docker 版自包含。

## 仍然不行

让用户提供：

- 系统与 App 版本（`app_status` 里有）；
- `exameow status` 的输出；
- 出错工具名与完整返回；
- 是否开了 MCP、端口、是否 LAN。

然后到 <https://github.com/heshengtao/exameow/issues> 提 Issue。
