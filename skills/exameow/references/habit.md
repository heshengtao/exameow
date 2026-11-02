# 每日学习、连续记录与 DSH 提醒

这个文件解决三件事：

1. 怎么把「每天学一点」变成用户看得见的连续记录；
2. 在 DeepSeek Harness 里怎么设置真正会到点的提醒；
3. 用户还没装 Exameow 时，怎么帮用户打开下载页或下载安装包。

## 1. 先判断环境

| 信号 | 含义 | 做法 |
| --- | --- | --- |
| 有 `study_habit` 工具 | DSH + 已装 Exameow 学习提醒插件 | 直接用工具，见第 2 节 |
| 没有 `study_habit`，但有 `plugin_manager` / DSH 插件页 | DSH 还没装插件 | 见第 3 节，征得同意后装 |
| 没有 DSH 工具，但有 `exameow` / MCP | 其他 Harness | 用宿主 cron / 日历 / 提醒；练完只记账，不假装有 DSH 提醒 |
| `app_status` 不存在 / 连接失败 | App 可能没装或没开 | 先看第 4 节，别硬编码端口 |

不要在没有 `study_habit` 的环境里调用它；也不要对用户说「已经设好 DSH 提醒」而没有真正
创建成功。

## 2. DSH 里已有 `study_habit`

### 看状态

```text
study_habit {"action":"status"}
```

返回里有：`todayCount` / `goal` / `remaining` / `done` / `streak` / `bestStreak` /
`level` / `xp` / `reminder` / `app.installed`。

### 记录练习

用户做完题、或你陪练结束：

```text
study_habit {"action":"log","count":5}
```

用户说「今天完成了 / 打卡」：

```text
study_habit {"action":"checkin"}
```

`log` 会按题数加 XP；达到每日目标时完成当天、连续天数 +1，并给一次额外 XP。
`checkin` 直接把今天标记完成。不要替用户虚报题量；用户没做就说没做。

### 设 / 改 / 关提醒

```text
study_habit {"action":"set_reminder","time":"20:00","time_zone":"Asia/Shanghai"}
study_habit {"action":"set_reminder","time":"07:30","time_zone":"Asia/Shanghai"}
study_habit {"action":"clear_reminder"}
```

- 时间是 **24 小时制本地时间** `HH:mm`。
- 时区用 IANA 名称，例如 `Asia/Shanghai`、`America/Los_Angeles`；不要用 `GMT+8`。
- 提醒绑定**当前会话**。换会话后要重新设；旧提醒仍会投递到旧会话。
- DSH 必须处于运行状态，到点才会投递。DSH 关闭期间不会补发多次；重启后按 schedule
  的规则处理最近一次。
- 用户改时间：再调用一次 `set_reminder`，插件会替换旧任务。

### 打开 App

```text
study_habit {"action":"open_app"}
```

返回 `app.opened`。如果是 `false`，把 `app.releaseUrl` 给用户，或按第 4 节下载。
不要循环重试打开。

### 提醒到点后怎么接

提醒会以一条用户消息进入会话。看到后：

1. `app_status` 看 App 是否在运行、AI 是否配置、有没有未完成练习。
2. 用 `references/tutor.md` 的闭环开始或继续练。
3. 练完 `study_habit log` / `checkin`，再决定是否继续。

不要一看到提醒就把整套题和答案倒出来。

## 3. DSH 还没装插件

插件仓库：<https://github.com/heshengtao/exameow-dsh-habit>（Apache-2.0）。

它提供：

- 左侧栏「自动化任务」下方的「每日学习」页面：连续天数、每日目标、XP 等级、今日进度和本周记录；
- 每日提醒：通过 DSH 的 `schedule` 服务创建真正的定时任务，可选择接收提醒的会话；
- `study_habit` 工具；
- 「去学习」按钮：优先打开 Exameow，找不到就打开 Releases。

### 安装（先问用户）

1. 选一个用户可接受的目录（不要写 DSH profile 目录）：

   ```bash
   git clone https://github.com/heshengtao/exameow-dsh-habit.git \
     "$HOME/.local/share/exameow-dsh-habit"
   ```

2. 用 DSH 的插件管理器安装本地 bundle（需要用户确认）：

   ```json
   { "action": "install_bundle", "target": "/Users/<user>/.local/share/exameow-dsh-habit" }
   ```

   或者在 DSH 的「设置 → 插件」里从本地目录安装。

3. 安装后确认 `study_habit` 工具出现；没有就刷新页面 / 重启 DSH。
4. 不需要时，在插件管理器里禁用或移除。

不要用 `npm install` 改 profile 的 `package.json`，也不要手写 `cordis.patch.yml`；
交给 `plugin_manager`。

## 4. 用户还没装 Exameow

### 4.1 先确认

```bash
command -v exameow || true

# macOS
ls -d /Applications/Exameow.app "$HOME/Applications/Exameow.app" 2>/dev/null || true

# 配置目录
# macOS:   ~/Library/Application Support/Exameow/
# Linux:   ~/.config/Exameow/
# Windows: %APPDATA%\Exameow\
```

配置目录里有 `cli-path` / `mcp-url` / `mcp.json` 就说明 App 至少启动过。
`exameow status` 返回 0 也说明可用。

### 4.2 打开下载页（最稳）

- macOS：`open https://github.com/heshengtao/exameow/releases/latest`
- Windows：`start "" https://github.com/heshengtao/exameow/releases/latest`
- Linux：`xdg-open https://github.com/heshengtao/exameow/releases/latest`

也可以直接把链接贴给用户：
<https://github.com/heshengtao/exameow/releases/latest>

### 4.3 直接下载（用户同意后）

先判断系统和架构：

```bash
uname -s
uname -m
```

资产命名（版本号会变，以 Releases 页面为准）：

| 平台 | 资产 |
| --- | --- |
| macOS Apple Silicon | `Exameow-v*-macos_arm64.dmg` |
| macOS Intel | `Exameow-v*-macos_amd64.dmg` |
| Windows | `Exameow-v*-windows_amd64-setup.exe`（或 `.msi` / portable `.zip`） |
| Linux x64 | `Exameow-v*-linux_amd64.AppImage` 或 `.deb` |
| Linux arm64 | `Exameow-v*-linux_arm64.AppImage` 或 `.deb` |
| Android arm64 | `Exameow-v*-android_arm64.apk` |

有 GitHub CLI：

```bash
mkdir -p "$HOME/Downloads"
gh release download --repo heshengtao/exameow \
  --pattern 'Exameow-*-macos_arm64.dmg' \
  --dir "$HOME/Downloads"
```

没有 `gh`：先查最新版本，再用 `curl`：

```bash
curl -fL -o "$HOME/Downloads/Exameow.dmg" \
  "https://github.com/heshengtao/exameow/releases/latest/download/<资产名>"
```

下载后：

- 把绝对路径告诉用户；
- macOS 提醒用户打开 dmg 拖进 Applications；
- Windows 提醒用户运行 setup.exe；
- Linux AppImage 需要 `chmod +x`；
- **不要**替用户运行安装器，不要静默写入 `/Applications` 或系统目录。

### 4.4 下载安装后

1. 让用户启动一次 App（macOS 可 `open -b com.exameow.app`）。
2. 回到本 Skill 的「先找到 App / CLI / MCP 地址」，重新发现 `cli-path` / `mcp-url`。
3. `exameow status` 确认 MCP 可达。
4. 再继续出题 / 练习 / 设提醒。

## 5. 非 DSH 的每日提醒

如果用户不在 DSH：

- macOS：`launchd` / 日历 / `osascript display notification`；
- Linux：`cron` + `notify-send`；
- Windows：任务计划程序 / PowerShell toast；
- 或者直接用宿主 Harness 自带的定时任务功能。

提醒内容不要只写「该学习了」，最好带上今天的目标和未完成题数；但不要为了提醒去读用户
的整个题库。到点后由用户决定练什么。

## 6. 边界

- 不要替用户伪造打卡或 XP；`log` 的 `count` 必须来自真实完成的题数。
- 不要承诺 DSH 关闭时还能推送提醒。
- 不要把提醒设到过去的时间；`set_reminder` 是「每天这个时间」，不是「几分钟后」。
- 用户说「别提醒了」→ `clear_reminder`，并在 DSH 的定时任务列表里确认没有残留。
- 用户删除插件后，提醒任务可能仍在；提醒用户到 DSH 的定时任务里删除，或重新安装插件后
  用 `clear_reminder` 清理。
