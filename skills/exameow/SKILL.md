---
name: exameow
description: 通过内嵌 MCP 工具或 exameow 命令行操作正在运行的 Exameow——AI 出题（文档 / 文本）、题库管理、连续练习与讲解、错题、在线考试发布与成绩；本机调用无需密钥。支持每日学习目标、连续打卡与 DeepSeek Harness 定时提醒。凡用户想生成或导入题目、刷题、被连续提问并讨论、批改答案、讲解题目、导出题目、发布在线考试、设置每日学习提醒时使用。
license: Apache-2.0
---

# Exameow：用 MCP / `exameow` 驱动桌面版

这是**能力包入口**。本文件只给公共约定 + 索引；细节在 `references/` 下按需加载。
**按需加载**：只读你要动手的那一两个域，不要把整包灌进上下文。

## 前提

- 桌面版 Exameow 需要在运行。走 CLI 时先 `exameow status` 确认，没开就 `exameow start`。
- **如果本机没有 Exameow**：不要假设它一定存在。先看下文「没装 App：帮用户下载」，
  可以帮用户打开 GitHub Releases，或在用户同意后把对应平台的安装包下到 `~/Downloads`。
- **本机回环调用不需要密钥**。MCP 地址是 `127.0.0.1` / `localhost` / `[::1]` 时，直接请求，
  不要 `Authorization` 头。只有 LAN（手机 / 另一台机器）才需要 `mcp.json` 里的 token。
- 状态类工具（题库、练习、发布）需要 App 窗口或浏览器标签页**连着 bridge**：窗口被最小化、
  隐藏或切到别的桌面时，会返回 `app_not_connected` / `app_suspended`。把窗口带到前台再试。
- AI 模型（OpenAI 兼容端点）是**另一件事**：在 App 的「设置 → AI 配置」里配好；
  MCP 访问权限与模型 Key 无关。

## 先找到 App / CLI / MCP 地址（不要瞎猜）

配置目录由应用名推导，路径固定：

| 平台 | 配置目录 |
| --- | --- |
| macOS | `~/Library/Application Support/Exameow/` |
| Linux | `~/.config/Exameow/` |
| Windows | `%APPDATA%\Exameow\` |

目录里有三个运行时文件：

- **`cli-path`** —— 包内 CLI 的**绝对路径**（每次启动重写）。读到就直接用全路径调用，
  不需要搜索、不依赖 PATH；用户也可以在设置里把 `exameow` 挂到 PATH。
- `mcp-url` —— MCP 的 HTTP 端点（App 正在运行时才有）。
- `mcp.json` —— 端口与 token（token 只用于 LAN）。

**按这个顺序找 CLI：**

1. `command -v exameow` —— 用户开了「命令行」开关就用短命令。
2. 否则读 `<配置目录>/cli-path` → 用 `"<那个路径>" status` 这样调。
3. 都没有 → App 从没启动过：macOS `open -b com.exameow.app`，Windows / Linux 让用户手动打开，
   再回到第 2 步。
4. 还不行 → 退回常见位置（macOS `…/Exameow.app/Contents/MacOS/exameow-cli`、
   Windows `%LOCALAPPDATA%\Programs\Exameow\exameow-cli.exe`）。

## 三条入口

1. **逐个 MCP 工具**（`generate_exam` / `start_practice` / …）：工具名即能力。
2. **命令行**：`exameow` 是这些工具的**薄客户端**，命令面 = 工具面。
   **加一个 MCP 工具 = 自动多一条可调用的 CLI 命令**（按名转发，CLI 侧零改动）。
3. **直接 HTTP**：把 JSON-RPC POST 到 `mcp-url`。本机不需要 token。

### 用 CLI 执行

拿到可执行文件（短命令或全路径）之后，子命令完全一样：

1. `<exameow> status` —— 软件在不在、MCP 是否可达（在 → 退出码 0，不在 → 1）。
2. `<exameow> start` —— 没开就启动它，等到 MCP 就绪再返回。
3. `<exameow> tools` —— 列出全部工具。
4. `<exameow> call <工具> --json '{…}'` —— 执行，例如：

```bash
exameow call app_status --json '{}'
exameow call start_practice --json '{"bank_id":"bank-xxx","mode":"random"}'
```

工具结果是一段 JSON 文本；`isError:true` 时退出码为 1。

### 接到 AI Harness

- **Claude Code / 支持 HTTP MCP 的客户端**：

  ```bash
  claude mcp add --transport http exameow http://127.0.0.1:5274/mcp
  ```

  端口以 `mcp-url` 为准；本机**不要**加 `--header`。

- **JSON 配置的客户端**：

  ```json
  { "mcpServers": { "exameow": { "url": "http://127.0.0.1:5274/mcp" } } }
  ```

- **只支持 stdio 的客户端**（如 Claude Desktop）：用 `npx mcp-remote http://127.0.0.1:5274/mcp`
  做转发；或者让它通过 shell 调 `exameow call`。

- **只能跑 shell 的 Harness**：直接用 `exameow`，不需要 MCP 配置。

## 能力域（按需加载）

| 域 | 加载 | 覆盖 |
| --- | --- | --- |
| 出题 | `references/generate.md` | 从 PDF/DOCX/XLSX/PPTX/EPUB/TXT 或纯文本生成题目、题型/数量/难度/语言、自动章节、存题库、导出 |
| 题库与练习 | `references/practice.md` | 题库增删查、顺序/随机/模拟/错题模式、提交与判分、`next_question`、错题记录、进度 |
| 连续辅导 | `references/tutor.md` | **一题一题陪学**：出题 → 不剧透 → 等回答 → 判分 → 讲解/讨论 → 下一题 → 总结 |
| 每日学习 | `references/habit.md` | DSH 学习提醒插件、每日目标、连续天数、定时提醒、没装 App 时下载/打开 Releases |
| 在线考试 | `references/exam.md` | 发布考试、管理链接、查成绩、删除；限流与 token 规则 |
| 配置与检索 | `references/config.md` | AI 端点/模型、联网搜索、抓网页、无 Key 时的处理 |
| 排错 | `references/troubleshoot.md` | `app_not_connected` / `app_suspended` / 401、端口、发现文件、各 Harness 配置 |

## 接到「陪我刷题 / 连续提问」：标准闭环

**不要一次把所有题和答案倒给用户。** 一题一题来，答完再讲，讲完再下一题：

1. `app_status` 看 `ai_configured`、题库和是否有进行中的 session。
2. 没有合适题库 → `generate_exam`（`save_to_bank:true`）或 `create_bank`。
3. `start_practice {bank_id, mode:"random"|"sequential"|"wrong"}`。
4. 只把 `current_question` 的 **stem + options** 给用户；**绝不提前给答案**。
5. 等用户回答。用户提问时先解释概念，不要用「正确答案是 X」来替代思考。
6. `submit_answer {answer}`（简答题可加 `use_ai_judge:true`）。
7. 用返回的 `correct_answer` / `analysis` 判分、讲解、回答追问；需要更细可 `explain_question`。
8. 用户说「下一题 / 懂了 / 继续」→ `next_question`。**不要**在讨论前就切题。
9. 最后一题讨论完 → `finish_practice`，给正确率总结；可再开一轮 `mode:"wrong"`。

细节、话术和边界情况见 `references/tutor.md`。

## 每日学习提醒（可选，优先在 DeepSeek Harness 里做）

用户想「每天提醒我学」「保持连续打卡」「定个每日目标」时，先判断当前 Harness 有没有
`study_habit` 工具，或能不能调用 `plugin_manager`：

- **有 `study_habit`**：说明已经装了 Exameow 的 DSH 学习提醒插件。直接用它：
  - `{"action":"status"}`：看今日进度、连续天数、目标、提醒状态。
  - 练完 N 题：`{"action":"log","count":N}`；用户说今天完成了：`{"action":"checkin"}`。
  - 设提醒：`{"action":"set_reminder","time":"20:00","time_zone":"Asia/Shanghai"}`；
    关闭：`{"action":"clear_reminder"}`。
  - 打开 App：`{"action":"open_app"}`（打不开会返回 Releases 链接）。
- **没有 `study_habit` 但用户在用 DeepSeek Harness**：告诉用户可以安装开源的
  [`exameow-dsh-habit`](https://github.com/heshengtao/exameow-dsh-habit)。它会在左侧栏
  「自动化任务」下方新增一个「每日学习」页面，显示连续天数、XP、每日目标和本周记录，
  并通过 DSH 的 `schedule` 服务每天定时把提醒发到选中的会话。征得同意后可以帮忙
  `git clone`，再用 DSH 的插件管理器从本地目录安装。
- **不是 DeepSeek Harness**：用宿主自带的定时任务 / 日历 / cron 做每日提醒；到点后按
  `references/tutor.md` 的闭环陪用户练。不要声称已经创建 DSH 提醒。

DSH 提醒是绑定到**创建它的那个会话**的；用户换会话后，要在新会话里重新设一次。
提醒只在 DSH 运行时投递。

## 没装 App：帮用户下载

先检查 App 是否真的不存在（不要只凭印象）：

```bash
command -v exameow || true
# macOS
ls -d /Applications/Exameow.app "$HOME/Applications/Exameow.app" 2>/dev/null || true
# 配置目录（见下表）里的 cli-path / mcp-url
```

如果确实没有，先问用户想「打开下载页自己选」还是「直接下载对应安装包」：

- **打开浏览器**（推荐先给这个）：
  - macOS：`open https://github.com/heshengtao/exameow/releases/latest`
  - Windows：`start "" https://github.com/heshengtao/exameow/releases/latest`
  - Linux：`xdg-open https://github.com/heshengtao/exameow/releases/latest`
- **直接下载**：先确认系统 / 架构，再选资产名（版本号会变，用 `gh release view` 或
  Releases 页面确认）：
  - macOS Apple Silicon：`Exameow-v*-macos_arm64.dmg`
  - macOS Intel：`Exameow-v*-macos_amd64.dmg`
  - Windows：`Exameow-v*-windows_amd64-setup.exe`（或 `.msi` / portable `.zip`）
  - Linux：`Exameow-v*-linux_amd64.AppImage` 或 `.deb`
  - Android：`Exameow-v*-android_arm64.apk`

  例：

  ```bash
  mkdir -p "$HOME/Downloads"
  gh release download --repo heshengtao/exameow --pattern 'Exameow-*-macos_arm64.dmg' --dir "$HOME/Downloads"
  ```

  没有 `gh` 时用 `curl -fL -o ...` 从 Releases 页面拿直链。下载完把**绝对路径**告诉用户，
  让用户自己双击安装；不要替用户运行安装器、不要静默改系统设置。

详细话术和平台判断见 `references/habit.md`。

## 典型需求怎么接

- **「把这份 PDF 出 20 道题」** → 直接 `generate_exam`（`source.path` + `count:20` +
  `save_to_bank:true`）；文档在 App 本地解析，**不要把全文先 parse 进 Harness 上下文**。
  只有需要检查材料内容或分批时才 `parse_document`。
- **「陪我刷这套题」** → 选已有 `bank_id` → `start_practice` → 进入上面的闭环。
- **「这道题为什么错」** → `explain_question`（可 `use_search:true`），结合 `analysis` 讲。
- **「把这些题发成在线考试」** → 先展示题量/时长/截止时间，确认后 `publish_exam`，
  把 `code` 和 `manage_url` 给用户；`admin_token` 只私下保存。
- **「把错题再练一遍」** → `list_wrong_questions` → `start_practice {mode:"wrong"}`。
- **「每天提醒我学」** → 先看 `study_habit` 是否可用；可用就直接设提醒，否则给出
  `exameow-dsh-habit` 的安装方式，或按宿主能力设 cron / 日历。

## 约定与坑

- **答案不剧透**：`get_practice_state` / `start_practice` 返回的 `current_question` 不含答案；
  `get_bank` 含答案，是给你备课用的，不要在用户作答前贴出来。
- **`submit_answer` 不会自动跳题**：讨论完必须显式调用 `next_question`。
- **出题默认用 App 的算力**：`generate_exam` 由 App 里配置的 AI 端点执行，文档也在 App
  本地解析；直接把 `source.path` / `source.text` 传给它，**默认不要先 `parse_document`**
  （那会把全文返回给 Harness，白耗上下文）。不要默认让 Harness 自己写题。只有 App 未配置
  模型且用户同意时，才由 Harness 生成题目后 `create_bank` 存回 App。`answer_question` /
  `judge_answer` / `explain_question` 同样走 App 的 AI 配置。
- **生成是同步的**：`generate_exam` 一次别超过 ~15–20 题；需要分批时再 `parse_document`
  看长度/切分（注意全文会进入上下文）。客户端 MCP 超时可降低 `count`。
- **存题库才看得见**：`generate_exam` 默认只返回题目；要出现在 App 里必须 `save_to_bank:true`
  或显式 `create_bank` / `add_questions_to_bank`。
- **删除 / 发布有确认**：`delete_bank` / `delete_exam` 必须 `confirm:true`；发布前先问用户。
- **图片题**：在线考试暂不支持图片；要保留图片用 XLSX 导出。
- **凭据**：MCP token 只用于 LAN，等同完整控制权，别写进聊天记录或仓库。
- **能力面 = MCP 工具面**：没暴露成 MCP 工具的动作，在 CLI 里也不可用；需要就先加工具。

## 仓库与反馈

- 仓库：<https://github.com/heshengtao/exameow>（Apache-2.0）。
- **DSH 学习提醒插件**：<https://github.com/heshengtao/exameow-dsh-habit>（Apache-2.0）。
- **安装本 Skill**：`npx skills add heshengtao/exameow`；或让 Agent 执行
  `Install this Skill: https://github.com/heshengtao/exameow`。
- 遇到 Bug / 缺能力，欢迎让用户到 <https://github.com/heshengtao/exameow/issues> 提 Issue，
  附上复现步骤、系统与版本。
