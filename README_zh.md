<p align="center">
  <img src="./assets/readme/hero-zh.svg" width="100%" alt="过了喵 Exameow — AI 驱动的考试题目生成器:上传学习资料,秒级生成专业考题">
</p>

<p align="center">
  <a href="https://github.com/heshengtao/exameow/releases"><img src="https://img.shields.io/github/v/release/heshengtao/exameow?style=flat-square&color=1A6CFF" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-1A6CFF?style=flat-square" alt="License: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20/%20macOS%20/%20Linux%20/%20Android%20/%20Web-1A6CFF?style=flat-square" alt="支持平台:Windows、macOS、Linux、Android、Web">
  <a href="https://hub.docker.com/r/ailm32442/exameow"><img src="https://img.shields.io/docker/pulls/ailm32442/exameow?style=flat-square&color=1A6CFF" alt="Docker pulls"></a>
</p>

<p align="center">
  <a href="README_zh.md"><b>简体中文</b></a> ·
  <a href="README_zh_TW.md"><b>繁體中文</b></a> ·
  <a href="README.md"><b>English</b></a> ·
  <a href="README_ja.md"><b>日本語</b></a> ·
  <a href="README_ko.md"><b>한국어</b></a> ·
  <a href="README_es.md"><b>Español</b></a> ·
  <a href="README_fr.md"><b>Français</b></a> ·
  <a href="README_de.md"><b>Deutsch</b></a> ·
  <a href="README_ru.md"><b>Русский</b></a> ·
  <a href="README_ar.md"><b>العربية</b></a>
</p>

<p align="center">
  <a href="https://exam.superagentparty.com/"><b>在线演示</b></a> ·
  <a href="https://github.com/heshengtao/exameow/releases">下载客户端</a> ·
  <a href="https://hub.docker.com/r/ailm32442/exameow">Docker Hub</a>
</p>

## 什么是过了喵？

**过了喵（Exameow）** 是一款**开源的 AI 考试题目生成器**，能将你的学习资料在几秒内转化为考试级题目。上传 PDF、Word 文档、PPT 幻灯片、图片或文本——AI 自动读取内容，生成单选题、多选题、判断题、填空题和简答题，全面覆盖你的学习需求。

与其他需要注册账号、付费订阅或将数据上传到云端的 AI 出题工具不同，过了喵坚持**本地优先、隐私至上**。你的题库、练习记录和错题本都保存在你的设备上。桌面端和移动端应用可以**完全离线运行**，只需配置你自己的 OpenAI 兼容 API 密钥（支持 OpenAI、DeepSeek、通义千问、智谱 GLM 或任何自托管模型）。

对教师和培训师而言，过了喵内置了完整的**在线考试系统**——从本地题库发布考试，分享 6 位校验码，学生用任意浏览器即可参加。即时评分、教师成绩面板、反滥用保护一应俱全。一句 Docker 命令即可自托管整套系统。

<p align="center">
  <a href="https://exam.superagentparty.com/"><img src="screenshots/Cover.png" width="100%" alt="过了喵 Exameow 桌面端与移动端界面"></a>
</p>

## 在线演示

在线体验：**[exam.superagentparty.com](https://exam.superagentparty.com/)**

演示站基于 Cloudflare Workers 免费 AI 套餐运行：

- ⏳ **每日次数有限** — Cloudflare 免费 AI 额度每日重置
- 📄 **上下文窗口限制** — 过大的文档会被截断以适应模型上下文窗口

如需无限制使用，请通过 Docker 自托管，或使用桌面/移动应用并配置自己的 API Key。

## 功能

### ✨ AI 出题 — 上传文件，秒出题目

过了喵支持 **10+ 种文件格式**——PDF、DOCX、XLSX、PPTX、EPUB、ODT、TXT、CSV、HTML 以及图片（PNG/JPG/WEBP/GIF/BMP），支持多文件拖拽上传。AI 生成 **5 种题型**：单选题、多选题、判断题、填空题、简答题，可按题型分别设置数量。精细控制难度（简单/中等/困难）、出题语言和知识点/章节定向出题。大文档自动拆分分批生成并去重。支持任意 OpenAI 兼容 API——OpenAI、DeepSeek、通义千问、智谱 GLM 等，也可使用演示站内置的 Cloudflare 免费 AI。支持 XLSX/CSV 导出。

- **丰富的输入格式** — 支持 PDF、DOCX、XLSX、PPTX、EPUB、ODT、TXT、CSV、HTML、图片（PNG/JPG/WEBP/GIF/BMP）及任意文本/代码文件，支持多文件拖拽上传
- **5 种题型** — 单选题、多选题、判断题、填空题、简答题，可按题型分别设置数量
- **精细化控制** — 难度（简单/中等/困难）、出题语言、知识点/章节定向出题
- **智能分批生成** — 大文档自动拆分分批生成，题目去重
- **兼容任意 OpenAI 格式 API** — OpenAI、DeepSeek、通义千问、智谱 GLM 等；也可直接使用演示站内置的 Cloudflare 免费 AI
- **导出** — 支持 XLSX / CSV 下载

### 📚 刷题模式 — 聪明练习，高效记忆

将生成的题目转化为互动学习过程。顺序练习、随机打乱题目和选项、或参加限时模拟考试（自动组卷）。错题自动记录并专项练习——连续答对后自动移出错题本。做题模式（先答后看答案）和背题模式（直接翻看）自由切换。简答题由 AI 对照参考答案自动评判并给出评语，支持人工改判。支持 XLSX/CSV 导入导出题库，智能列映射。

- **顺序练习** — 按题库顺序逐题练习
- **随机练习** — 题目和选项顺序随机打乱，避免位置记忆
- **模拟考试** — 从题库随机抽题自动组卷，可配置各题型数量
- **错题练习** — 自动记录错题，只练做错的题，连续答对自动移出
- **做题 / 背题模式** — 先答后对答案，或直接翻看题目和答案
- **AI 判卷** — 简答题由 AI 对照参考答案自动评判并给出评语，支持人工改判
- **题库管理** — 支持 XLSX/CSV 导入（智能列映射）与导出
- **章节练习** — CSV/XLSX 填写“章节”列即可按同名章节分组，练习前可多选章节或单选“未分章”；没有章节的旧题库照常使用。
- **AI 自动分章** — 生成新题时可开启，根据资料章节或知识主题标注题目；默认关闭，沿用现有生成请求。

### 📝 在线考试 — 发布考试，邀请学生

从多个本地题库中选题组卷，可按题型分别设置抽题数量与分值，自定义考试名称、开始时间与时长。分享 **6 位校验码**或考试链接——学生无需安装任何应用，任意设备浏览器打开即可参加。本地倒计时限时作答，到时自动交卷；刷新页面不丢进度。客观题交卷即出分并展示答案解析，成绩本地留存随时查看。教师成绩面板按分数排序、逐题作答明细展开。考试数据最多保留 7 天自动删除，保护隐私。反滥用：每 IP 每日限发 20 场，学生一键举报，≥3 个独立 IP 举报自动暂停考试。**Docker 版完全自包含**——在线考试 relay 运行在 SQLite 上，完全不依赖演示站。

- **从题库发起考试** — 本地题库多选组卷，可按题型分别设置抽题数量与分值，自定义考试名称、开始时间与时长
- **6 位校验码 + 考试链接** — 学生无需安装任何应用，任意设备浏览器打开链接或输入校验码即可参加
- **限时作答** — 本地倒计时、到时自动交卷；刷新页面不丢进度（断点续考）
- **交卷即出分** — 客观题服务端自动判分并展示答案解析，成绩本地留存随时查看
- **教师成绩面板** — 按分数排序、逐题作答明细展开；成绩本地缓存，考试结束后仅需查询一次，教师可随时一键删除考试（学生立即无法进入，成绩同步清除）
- **隐私优先** — 考试数据在 Cloudflare D1 最多保留 7 天自动删除；取题阶段不下发答案
- **反滥用机制** — 每 IP 每日限发 20 场；学生可一键举报，≥3 个独立 IP 举报自动暂停考试；管理员可在 `#/admin` 页面查看举报、恢复或强制删除
- **自托管独立运行** — Docker 版内置同款考试中转（SQLite)，完全不依赖演示站；用 `ADMIN_TOKEN` 环境变量设置管理密钥（默认 `pass`，首次访问 `#/admin` 强制修改）

### 🔍 搜题模式 — 快速找到答案

输入题目文字从本地题库中搜索，可选 AI 解答。**拍照搜题**使用本地 OCR 识别题目（浏览器端运行，无需上传）。**拍屏搜题**让摄像头对准屏幕或试卷，AI 实时监听并匹配题目。**录屏搜题**框选屏幕任意区域，AI 实时识别并悬浮窗展示答案（支持 Windows/macOS/Linux/Android；iOS 因系统限制暂不支持）。

- **文字搜题** — 输入题目文字，从本地题库中查找，支持 AI 解答
- **拍照搜题** — 拍摄或上传题目照片，本地 OCR 识别（浏览器端运行，无需上传）
- **拍屏搜题** — 摄像头对准屏幕或试卷，AI 实时监听并匹配题目
- **录屏搜题** — 框选屏幕任意区域，AI 实时识别并搜索本地题库，悬浮窗展示答案（支持 Windows / macOS / Linux / Android；iOS 因系统限制暂不支持）

### 🌐 跨平台与隐私 — 你的数据，你做主

过了喵支持 **Windows、macOS、Linux、Android 和 Web**（iOS 需自行打包）。**一句 Docker 命令**即可部署网页版。所有题库、练习记录和错题本均存储在本地——不上传至任何服务器（除非你主动使用在线考试功能）。桌面端 API 密钥使用 **AES-256-GCM** 加密存储。界面自动跟随系统语言（中文/英文），一键切换。

- **桌面与移动端** — Windows、macOS、Linux、Android（iOS 需自行打包）
- **自托管网页版** — Docker 一键部署
- **本地优先** — 题库、练习记录、错题本均保存在本机；桌面端 API 密钥使用 AES-256-GCM 加密存储
- **中英双语** — 自动跟随系统语言，一键切换

## 安装

各平台的预编译安装包可在 [GitHub Releases](https://github.com/heshengtao/exameow/releases) 页面下载。

### 平台支持

| 平台 | 状态 | 下载格式 |
|------|------|----------|
| Windows | ✅ 已支持 | `.msi` 安装包 / 免安装 `.zip` |
| macOS（Apple 芯片） | ✅ 已支持 | `.dmg`（去除隔离属性见 Release 说明） |
| Linux（x86_64 / ARM64） | ✅ 已支持 | `.AppImage` / `.deb` |
| Android（ARM64） | ✅ 已支持 | `.apk` |
| iOS | ⚠️ 需自行打包 | 见下方说明 |
| Web / Docker（自托管） | ✅ 已支持 | Docker 镜像 |

> **关于 iOS：** 苹果开发者证书需要付费（$99/年），因此暂不提供预编译的 iOS 安装包，需要使用 Xcode 自行打包（`pnpm tauri ios build`）。未来如果打赏收入足够支付证书费用，会在 GitHub Releases 上提供带证书的官方打包版本。

### Docker 自托管

```bash
git clone https://github.com/heshengtao/exameow.git
cd exameow

# 构建前端
cd frontend && pnpm install && pnpm build && cd ..

# 配置 AI
export AI_ENDPOINT=https://api.openai.com/v1
export AI_API_KEY=sk-your-key-here
export AI_MODEL=gpt-4o

# 构建并启动
docker compose up -d --build
```

打开 `http://localhost:3000` 开始出题。

> **🔐 管理密钥（在线考试管理必看）:** 管理员页面 `http://localhost:3000/#/admin` 由 `ADMIN_TOKEN` 保护。**不设置时默认为 `pass`，首次登录会被强制要求修改后才能使用**。想跳过这步，启动时直接声明:
>
> ```bash
> ADMIN_TOKEN=你的强密钥 docker compose up -d --build
> ```
>
> 修改后的密钥会持久化在 `exameow-data` 数据卷(`/app/data/admin_token.txt`)中，容器重启不丢失；考试数据（SQLite）也存在同一数据卷。

### Docker 预构建镜像

```bash
docker pull ailm32442/exameow:latest
docker run -d -p 3000:3000 \
  -e AI_ENDPOINT=https://api.openai.com/v1 \
  -e AI_API_KEY=sk-your-key-here \
  -e AI_MODEL=gpt-4o \
  -e ADMIN_TOKEN=你的强密钥 \
  -v exameow-data:/app/data \
  ailm32442/exameow:latest
```

不设置 `ADMIN_TOKEN` 时默认为 `pass`，首次访问 `/#/admin` 会被强制修改。

## AI 高级设置

进入 **我的 → 算力配置 → AI 高级设置**。设置保存在当前设备，适用于原生端、Docker 和 Cloudflare 的出题、答题、批改及解析。

- **思考开关**：跟随模型（不传参数）、开启（发送所选 `reasoning_effort`）、关闭（发送 `none`）。强度可选 `minimal`、`low`、`medium`、`high`、`xhigh`、`max`，具体支持情况取决于服务商和模型。暂不发送 `enable_thinking` 等服务商专用开关。
- **最大输出**：1–1,000,000 token，默认 16,384。按接口选择 `max_tokens` 或 `max_completion_tokens` 字段，实际仍受模型上限约束；OpenAI 的 completion 上限也包含推理 token。
- **Temperature**：0–2，默认 0.7；不支持此参数的模型可勾选“不发送 temperature”。
- **补充 Prompt**：最多 20,000 字符，追加到内置系统提示词，并保留必要的 JSON 输出要求。它适用于所有 AI 任务，请兼顾出题和批改等场景。
- **超时**：每次模型请求 1–3,600 秒，默认 120 秒，包含读取响应体的时间；不包含文件解析，也不是整个多批次任务的总时限。
- **自动重试**：失败后额外尝试 0–5 次，默认 0。仅重试临时网络错误、超时、HTTP 408/429 和 5xx，间隔依次为 1–5 秒；其他 HTTP 错误和 AI 输出格式错误直接报错。每次尝试可能计费。原生端取消会停止当前调用及后续重试；网页端向服务端传递取消信号的效果取决于服务器和代理对断连的处理。

参数语义见 [OpenAI Chat Completions 文档](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)。不支持的参数会显示服务商错误，不会静默更改配置。移动端需要 **1.5.0 或更新的原生壳**，OTA 已设置对应的最低版本限制。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `AI_ENDPOINT` | `https://api.openai.com/v1` | OpenAI 兼容 API 地址 |
| `AI_API_KEY` | — | AI API 密钥 |
| `AI_MODEL` | `gpt-4o` | 默认模型 |
| `PORT` | `3000` | 服务端口 |
| `STATIC_DIR` | `/app/static` | 静态文件目录 |
| `ADMIN_TOKEN` | `pass` | 管理员页密钥;`pass` 时首次访问 `/#/admin` 强制修改 |
| `EXAM_DB_PATH` | `/app/data/exameow.db` | 在线考试 SQLite 路径 |
| `ADMIN_TOKEN_FILE` | `/app/data/admin_token.txt` | 修改后的密钥持久化文件 |
| `RUST_LOG` | `info` | 日志级别 |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/models` | 获取可用 AI 模型列表 |
| `POST` | `/api/generate` | 上传文件并生成考题 |
| `GET` | `/api/export` | 导出 CSV |
| `POST` | `/api/export/xlsx` | 导出 XLSX |
| `POST` | `/api/config/save` | 保存 AI 配置 |
| `GET` | `/api/config/load` | 读取已保存的 AI 配置 |

### 生成考题示例

```bash
curl -X POST http://localhost:3000/api/generate \
  -F "file=@学习资料.pdf" \
  -F 'params={"question_types":["single_choice","multi_choice"],"count":10,"difficulty":"medium","language":"Chinese"}'
```

## 架构

过了喵采用**三后端架构**，共用同一套 Vue 3 前端。同一个 SPA 在运行时自动检测平台并路由到对应后端：

- **Tauri（桌面/移动端）**：`src-tauri/` 中的 Rust 命令直接调用 Rust 核心库
- **Cloudflare Workers**：`workers/` 中的 TypeScript 调用 Cloudflare AI + D1 实现在线考试中转
- **Axum（自托管/Docker）**：`packages/server/` 中的 Rust HTTP 服务端 + SQLite 考试中转

核心逻辑（文件解析、AI 客户端、考题生成、导出）位于共享的 `packages/core/` Rust crate，并为 Workers 路径在 TypeScript 中做了对应实现。

## FAQ

### 如何从 PDF 生成考试题目？

将 PDF 拖拽上传到[演示站](https://exam.superagentparty.com/)或桌面端应用。选择题型（单选、多选、判断、填空、简答），设置题目数量和难度，点击生成。AI 读取你的文档内容，几秒钟内生成考题。结果可导出为 XLSX 或 CSV。

### 过了喵真的完全免费吗？

是的。过了喵基于 Apache 2.0 开源协议，100% 免费。没有付费计划、没有企业版本、没有功能限制。演示站提供免费的 AI 生成能力（受 Cloudflare 免费套餐的每日配额限制）。桌面端和移动端需要你自己的 AI API 密钥，费用直接支付给你的 AI 供应商——过了喵不会向你收费。

### 可以离线使用吗？

可以。桌面端和移动端应用支持完全离线使用。题库、练习记录和错题本都存储在本地。只有在调用 AI API 生成题目时才需要网络连接。

### 支持哪些 AI 模型？

支持所有 OpenAI 兼容的 API：OpenAI（GPT-4o、GPT-4、GPT-3.5）、DeepSeek、通义千问、智谱 GLM，以及通过 Ollama 等工具运行的自托管模型。演示站还提供内置的 Cloudflare 免费 AI。

### 在线考试功能怎么用？

教师从本地题库发布考试，获得 6 位校验码。学生通过校验码或分享链接在任意浏览器中参加。考试限时作答，到时自动交卷。客观题即时判分。考试数据最多 7 天自动删除。自托管用户通过 Docker 获得同样的考试中转功能。

### 我的数据安全吗？

是的。默认情况下，所有数据（题库、练习记录、API 密钥）都保存在你的设备上。桌面端 API 密钥使用 AES-256-GCM 加密存储。唯一的例外是在线考试数据，这些数据暂时存储在 Cloudflare D1（7 天自动删除）或你自托管的 SQLite 中。

## 开发

```bash
# Rust 服务端
cargo run -p exameow-server

# 前端开发服务器
cd frontend && pnpm dev

# Tauri 桌面端
pnpm tauri dev
```

### 项目结构

```
exameow/
├── frontend/          # Vue 3 前端
├── packages/
│   ├── core/          # Rust 核心库（AI、解析、导出、配置）
│   ├── server/        # Axum HTTP 服务端
│   └── shared/        # TypeScript 共享类型
├── src-tauri/         # Tauri 桌面 + 移动端应用
├── workers/           # Cloudflare Workers (Hono)
├── scripts/           # 构建和部署脚本
├── Dockerfile
└── docker-compose.yml
```

## 免责声明

- 本项目为**开源学习工具**,仅供个人学习、教学与内部培训等合法场景使用。
- **AI 生成内容的准确性不作保证**。题目与解析可能存在错误,请人工核对后使用;因使用生成内容造成的任何后果,项目作者不承担责任。
- **用户生成内容(UGC)与本项目无关**。通过在线考试功能发布的内容由发布者(教师)自行负责,严禁用于存储或分发违法违规、侵权或敏感信息;运营方有权在不通知的情况下删除违规内容。举报渠道:① 考试页面右上角内置**举报按钮**——当 ≥3 个不同 IP 的用户举报同一场考试时,该考试链接会**自动锁定为不可访问**,进入管理员复核队列;② 通过 GitHub Issues 举报。核实后违规内容将予以下架,误封的考试可由管理员恢复。
- 演示站(exam.superagentparty.com)为免费公共服务,**不承诺可用性与数据持久性**(考试数据最多保留 7 天)。重要数据请自行备份。
- 使用本项目即表示你同意自行承担使用风险,并遵守所在国家/地区的法律法规。

## 支持我们

### 请给我们点个 Star！
⭐ 你的支持是我们前进的动力！

### 欢迎打赏！
<div align="center" style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/agentparty)
[![爱发电](https://img.shields.io/badge/爱发电-支持我们-946ce6?style=for-the-badge&logo=affine&logoColor=white)](https://afdian.com/a/agentparty)

</div>

### 关注我们
<div align="center">
  <a href="https://space.bilibili.com/26978344">
    <img src="screenshots/B.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="bilibili"/>
  </a>
  <a href="https://www.youtube.com/@agentParty">
    <img src="screenshots/YT.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="youtube"/>
  </a>
</div>

### 加入社区
如果你在使用过程中遇到任何问题，欢迎加入我们的社区交流。

1. QQ 群：`931057213`（1群已满） `902882342`（2群）

2. Discord: [Discord 链接](https://discord.gg/f2dsAKKr2V)

## 贡献者

<a href="https://github.com/heshengtao/exameow/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=heshengtao/exameow" alt="heshengtao/exameow 的贡献者" />
</a>

## License

Apache-2.0
