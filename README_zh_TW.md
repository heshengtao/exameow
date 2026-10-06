<p align="center">
  <img src="./assets/readme/hero-zh.svg" width="100%" alt="過了喵 Exameow — AI 驅動的考試題目生成器：上傳學習資料，秒級生成專業考題">
</p>

<p align="center">
  <a href="https://github.com/heshengtao/exameow/releases"><img src="https://img.shields.io/github/v/release/heshengtao/exameow?style=flat-square&color=1A6CFF" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-1A6CFF?style=flat-square" alt="License: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20/%20macOS%20/%20Linux%20/%20Android%20/%20Web-1A6CFF?style=flat-square" alt="支援平台：Windows、macOS、Linux、Android、Web">
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
  <a href="https://exam.superagentparty.com/"><b>線上演示</b></a> ·
  <a href="https://github.com/heshengtao/exameow/releases">下載用戶端</a> ·
  <a href="https://hub.docker.com/r/ailm32442/exameow">Docker Hub</a>
</p>

## 什麼是過了喵？

**過了喵（Exameow）** 是一款**開源的 AI 考試題目生成器**，能將你的學習資料在幾秒內轉化為考試級題目。上傳 PDF、Word 文檔、PPT 簡報、圖片或文字——AI 自動讀取內容，生成單選題、多選題、判斷題、填空題和簡答題，全面覆蓋你的學習需求。

與其他需要註冊帳號、付費訂閱或將數據上傳到雲端的 AI 出題工具不同，過了喵堅持**本地優先、隱私至上**。你的題庫、練習記錄和錯題本都保存在你的裝置上。桌面端和行動端應用可以**完全離線執行**，只需設定你自己的 OpenAI 相容 API 金鑰（支援 OpenAI、DeepSeek、通義千問、智譜 GLM 或任何自託管模型）。

對教師和培訓師而言，過了喵內置了完整的**線上考試系統**——從本地題庫發布考試，分享 6 位校驗碼，學生用任意瀏覽器即可參加。即時評分、教師成績面板、反濫用保護一應俱全。一條 Docker 指令即可自託管整套系統。

<p align="center">
  <a href="https://exam.superagentparty.com/"><img src="screenshots/Cover.png" width="100%" alt="過了喵 Exameow 桌面端與行動端介面"></a>
</p>

## 線上演示

線上體驗：**[exam.superagentparty.com](https://exam.superagentparty.com/)**

演示站基於 Cloudflare Workers 免費 AI 套餐運行：

- ⏳ **每日次數有限** — Cloudflare 免費 AI 額度每日重置
- 📄 **上下文視窗限制** — 過大的文件會被截斷以適應模型上下文視窗

如需無限制使用，請透過 Docker 自託管，或使用桌面/行動應用並配置自己的 API Key。

## 功能

### ✨ AI 出題 — 上傳檔案，秒出題目

過了喵支援 **10+ 種檔案格式**——PDF、DOCX、XLSX、PPTX、EPUB、ODT、TXT、CSV、HTML 以及圖片（PNG/JPG/WEBP/GIF/BMP），支援多檔案拖曳上傳。AI 生成 **5 種題型**：單選題、多選題、判斷題、填空題、簡答題，可按題型分別設定數量。精細控制難度（簡單/中等/困難）、出題語言和知識點/章節定向出題。大文件自動拆分分批生成並去重。支援任意 OpenAI 相容 API——OpenAI、DeepSeek、通義千問、智譜 GLM 等，也可使用演示站內置的 Cloudflare 免費 AI。支援 XLSX/CSV 匯出。

- **豐富的輸入格式** — 支援 PDF、DOCX、XLSX、PPTX、EPUB、ODT、TXT、CSV、HTML、圖片（PNG/JPG/WEBP/GIF/BMP）及任意文字/程式碼檔案，支援多檔案拖曳上傳
- **5 種題型** — 單選題、多選題、判斷題、填空題、簡答題，可按題型分別設定數量
- **精細化控制** — 難度（簡單/中等/困難）、出題語言、知識點/章節定向出題
- **智慧分批生成** — 大文件自動拆分分批生成，題目去重
- **相容任意 OpenAI 格式 API** — OpenAI、DeepSeek、通義千問、智譜 GLM 等；也可直接使用演示站內置的 Cloudflare 免費 AI
- **匯出** — 支援 XLSX / CSV 下載

### 📚 刷題模式 — 聰明練習，高效記憶

將生成的題目轉化為互動學習過程。順序練習、隨機打亂題目和選項、或參加限時模擬考試（自動組卷）。錯題自動記錄並專項練習——連續答對後自動移出錯題本。做題模式（先答後看答案）和背題模式（直接翻看）自由切換。簡答題由 AI 對照參考答案自動評判並給出評語，支援人工改判。支援 XLSX/CSV 匯入匯出題庫，智慧欄位對齊。

- **順序練習** — 按題庫順序逐題練習
- **隨機練習** — 題目和選項順序隨機打亂，避免位置記憶
- **模擬考試** — 從題庫隨機抽題自動組卷，可配置各題型數量
- **錯題練習** — 自動記錄錯題，只練做錯的題，連續答對自動移出
- **做題 / 背題模式** — 先答後對答案，或直接翻看題目和答案
- **AI 判卷** — 簡答題由 AI 對照參考答案自動評判並給出評語，支援人工改判
- **題庫管理** — 支援 XLSX/CSV 匯入（智慧欄位對齊）與匯出

### 📝 線上考試 — 發布考試，邀請學生

從多個本地題庫中選題組卷，可按題型分別設定抽題數量與分值，自訂考試名稱、開始時間與時長。分享 **6 位校驗碼**或考試連結——學生無需安裝任何應用，任意裝置瀏覽器打開即可參加。本地倒數計時限時作答，到時自動交卷；重新整理頁面不丟進度。客觀題交卷即出分並展示答案解析，成績本地留存隨時檢視。教師成績面板按分數排序、逐題作答明細展開。考試數據最多保留 7 天自動刪除，保護隱私。反濫用：每 IP 每日限發 20 場，學生一鍵檢舉，≥3 個獨立 IP 檢舉自動暫停考試。**Docker 版完全自包含**——線上考試 relay 運行在 SQLite 上，完全不依賴演示站。

- **從題庫發起考試** — 本地題庫多選組卷，可按題型分別設定抽題數量與分值，自訂考試名稱、開始時間與時长
- **6 位校驗碼 + 考試連結** — 學生無需安裝任何應用，任意裝置瀏覽器打開連結或輸入校驗碼即可參加
- **限時作答** — 本地倒數計時、到時自動交卷；重新整理頁面不丟進度（斷點續考）
- **交卷即出分** — 客觀題伺服器端自動判分並展示答案解析，成績本地留存隨時檢視
- **教師成績面板** — 按分數排序、逐題作答明細展開；成績本地快取，考試結束後僅需查詢一次，教師可隨時一鍵刪除考試（學生立即無法進入，成績同步清除）
- **隱私優先** — 考試數據在 Cloudflare D1 最多保留 7 天自動刪除；取題階段不下發答案
- **反濫用機制** — 每 IP 每日限發 20 場；學生可一鍵檢舉，≥3 個獨立 IP 檢舉自動暫停考試；管理員可在 `#/admin` 頁面檢視檢舉、恢復或強制刪除
- **自託管獨立運行** — Docker 版內置同款考試中轉（SQLite)，完全不依賴演示站；用 `ADMIN_TOKEN` 環境變數設定管理金鑰（預設 `pass`，首次訪問 `#/admin` 強制修改）

### 🔍 搜題模式 — 快速找到答案

輸入題目文字從本地題庫中搜尋，解答可選 AI 说明。**拍照搜題**使用本地 OCR 識別題目（瀏覽器端運行，無需上傳）。**拍屏搜題**讓鏡頭對準螢幕或試卷，AI 實時監聽並匹配題目。**錄屏搜題**框選螢幕任意區域，AI 實時識別並懸浮視窗展示答案（支援 Windows/macOS/Linux/Android；iOS 因系統限制暫不支援）。

- **文字搜題** — 輸入題目文字，從本地題庫中查找，支援 AI 解答
- **拍照搜題** — 拍攝或上傳題目照片，本地 OCR 識別（瀏覽器端運行，無需上傳）
- **拍屏搜題** — 鏡頭對準螢幕或試卷，AI 實時監聽並匹配題目
- **錄屏搜題** — 框選螢幕任意區域，AI 實時識別並搜尋本地題庫，懸浮視窗展示答案（支援 Windows / macOS / Linux / Android；iOS 因系統限制暫不支援）

### 🌐 跨平台與隱私 — 你的數據，你做主

過了喵支援 **Windows、macOS、Linux、Android 和 Web**（iOS 需自行打包）。**一條 Docker 指令**即可部署網頁版。所有題庫、練習記錄和錯題本均儲存在本地——不上傳至任何伺服器（除非你主動使用線上考試功能）。桌面端 API 金鑰使用 **AES-256-GCM** 加密儲存。介面自動隨系統語言（中文/英文），一鍵切換。

- **桌面與行動端** — Windows、macOS、Linux、Android（iOS 需自行打包）
- **自託管網頁版** — Docker 一鍵部署
- **本地優先** — 題庫、練習記錄、錯題本均保存在本機；桌面端 API 金鑰使用 AES-256-GCM 加密儲存
- **中英雙語** — 自動跟隨系統語言，一鍵切換

## 安裝

各平台的預編譯安裝包可在 [GitHub Releases](https://github.com/heshengtao/exameow/releases) 頁面下載。

### 平台支援

| 平台 | 狀態 | 下載格式 |
|------|------|----------|
| Windows | ✅ 已支援 | `.msi` 安裝包 / 免安裝 `.zip` |
| macOS（Apple 晶片 / Intel） | ✅ 已支援 | `.dmg`（去除隔離屬性見 Release 說明） |
| Linux（x86_64 / ARM64） | ✅ 已支援 | `.AppImage` / `.deb` |
| Android（ARM64） | ✅ 已支援 | `.apk` |
| iOS | ⚠️ 需自行打包 | 見下方說明 |
| Web / Docker（自託管） | ✅ 已支援 | Docker 鏡像 |

> **關於 iOS：** 蘋果開發者證書需要付費（$99/年），因此暫不提供預編譯的 iOS 安裝包，需要使用 Xcode 自行打包（`pnpm tauri ios build`）。未來如果打賞收入足夠支付證書費用，會在 GitHub Releases 上提供帶證書的官方打包版本。

### Docker 自託管

```bash
git clone https://github.com/heshengtao/exameow.git
cd exameow

# 構建前端
cd frontend && pnpm install && pnpm build && cd ..

# 配置 AI
export AI_ENDPOINT=https://api.openai.com/v1
export AI_API_KEY=sk-your-key-here
export AI_MODEL=gpt-4o

# 構建並啟動
docker compose up -d --build
```

打開 `http://localhost:3000` 開始出題。

> **🔐 管理金鑰（線上考試管理必看）:** 管理員頁面 `http://localhost:3000/#/admin` 由 `ADMIN_TOKEN` 保護。**不設定時預設為 `pass`，首次登入會被強制要求修改後才能使用**。想跳過這步，啟動時直接聲明:
>
> ```bash
> ADMIN_TOKEN=你的強金鑰 docker compose up -d --build
> ```
>
> 修改後的金鑰會持久化在 `exameow-data` 資料卷(`/app/data/admin_token.txt`)中，容器重啟不丟失；考試數據（SQLite）也存在同一資料卷。

### Docker 預構建鏡像

```bash
docker pull ailm32442/exameow:latest
docker run -d -p 3000:3000 \
  -e AI_ENDPOINT=https://api.openai.com/v1 \
  -e AI_API_KEY=sk-your-key-here \
  -e AI_MODEL=gpt-4o \
  -e ADMIN_TOKEN=你的強金鑰 \
  -v exameow-data:/app/data \
  ailm32442/exameow:latest
```

不設定 `ADMIN_TOKEN` 時預設為 `pass`，首次訪問 `/#/admin` 會被強制修改。

## 環境變數

| 變數 | 預設值 | 說明 |
|------|--------|------|
| `AI_ENDPOINT` | `https://api.openai.com/v1` | OpenAI 相容 API 位置 |
| `AI_API_KEY` | — | AI API 金鑰 |
| `AI_MODEL` | `gpt-4o` | 預設模型 |
| `PORT` | `3000` | 服務連接埠 |
| `STATIC_DIR` | `/app/static` | 靜態檔案目錄 |
| `ADMIN_TOKEN` | `pass` | 管理員頁金鑰;`pass` 時首次訪問 `/#/admin` 強制修改 |
| `EXAM_DB_PATH` | `/app/data/exameow.db` | 線上考試 SQLite 路徑 |
| `ADMIN_TOKEN_FILE` | `/app/data/admin_token.txt` | 修改後的金鑰持久化檔案 |
| `RUST_LOG` | `info` | 記錄檔層級 |

## API 介面

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/models` | 取得可用 AI 模型列表 |
| `POST` | `/api/generate` | 上傳檔案並生成考題 |
| `GET` | `/api/export` | 匯出 CSV |
| `POST` | `/api/export/xlsx` | 匯出 XLSX |
| `POST` | `/api/config/save` | 儲存 AI 配置 |
| `GET` | `/api/config/load` | 讀取已儲存的 AI 配置 |

### 生成考題範例

```bash
curl -X POST http://localhost:3000/api/generate \
  -F "file=@學習資料.pdf" \
  -F 'params={"question_types":["single_choice","multi_choice"],"count":10,"difficulty":"medium","language":"Chinese"}'
```

## 架構

過了喵採用**三後端架構**，共用同一套 Vue 3 前端。同一個 SPA 在執行時自動檢測平台並路由到對應後端：

- **Tauri（桌面/行動端）**：`src-tauri/` 中的 Rust 指令直接呼叫 Rust 核心庫
- **Cloudflare Workers**：`workers/` 中的 TypeScript 呼叫 Cloudflare AI + D1 實現線上考試中轉
- **Axum（自託管/Docker）**：`packages/server/` 中的 Rust HTTP 伺服器端 + SQLite 考試中轉

核心邏輯（檔案解析、AI 用戶端、考題生成、匯出）位於共享的 `packages/core/` Rust crate，並為 Workers 路徑在 TypeScript 中做了對應實現。

## FAQ

### 如何從 PDF 生成考試題目？

將 PDF 拖曳上傳到[演示站](https://exam.superagentparty.com/)或桌面端應用。選擇題型（單選、多選、判斷、填空、簡答），設定題目數量和難度，點擊生成。AI 讀取你的文檔內容，幾秒鐘內生成考題。結果可匯出為 XLSX 或 CSV。

### 過了喵真的完全免費嗎？

是的。過了喵基於 Apache 2.0 開源協定，100% 免費。沒有付費計劃、沒有企業版本、沒有功能限制。演示站提供免費的 AI 生成能力（受 Cloudflare 免費套餐的每日額度限制）。桌面端和行動端需要你自己的 AI API 金鑰，費用直接支付給你的 AI 供應商——過了喵不會向你收費。

### 可以離線使用嗎？

可以。桌面端和行動端應用支援完全離線使用。題庫、練習記錄和錯題本都儲存在本地。只有在呼叫 AI API 生成題目時才需要網路連線。

### 支援哪些 AI 模型？

支援所有 OpenAI 相容的 API：OpenAI（GPT-4o、GPT-4、GPT-3.5）、DeepSeek、通義千問、智譜 GLM，以及透過 Ollama 等工具運行的自託管模型。演示站還提供內置的 Cloudflare 免費 AI。

### 線上考試功能怎麼用？

教師從本地題庫發布考試，獲得 6 位校驗碼。學生透過校驗碼或分享連結在任意瀏覽器中參加。考試限時作答，到時自動交卷。客觀題即時判分。考試數據最多 7 天自動刪除。自託管使用者透過 Docker 獲得同樣的考試中轉功能。

### 我的數據安全嗎？

是的。預設情況下，所有數據（題庫、練習記錄、API 金鑰）都保存在你的裝置上。桌面端 API 金鑰使用 AES-256-GCM 加密儲存。唯一的例外是線上考試數據，這些數據暫時儲存在 Cloudflare D1（7 天自動刪除）或你自託管的 SQLite 中。

## 開發

```bash
# Rust 伺服器端
cargo run -p exameow-server

# 前端開發伺服器
cd frontend && pnpm dev

# Tauri 桌面端
pnpm tauri dev
```

### 專案結構

```
exameow/
├── frontend/          # Vue 3 前端
├── packages/
│   ├── core/          # Rust 核心庫（AI、解析、匯出、配置）
│   ├── server/        # Axum HTTP 伺服器端
│   └── shared/        # TypeScript 共享型態
├── src-tauri/         # Tauri 桌面 + 行動端應用
├── workers/           # Cloudflare Workers (Hono)
├── scripts/           # 構建和部署指令碼
├── Dockerfile
└── docker-compose.yml
```

## 免責聲明

- 本專案為**開源學習工具**,僅供個人學習、教學與內部培訓等合法場景使用。
- **AI 生成內容的準確性不作保證**。題目與解析可能存在錯誤,請人工核對後使用;因使用生成內容造成的任何後果,專案作者不承擔責任。
- **使用者生成內容(UGC)與本專案無關**。透過線上考試功能發布的內容由發布者(教師)自行負責,嚴禁用於儲存或分發違法違規、侵權或敏感資訊;營運方有權在不通知的情況下刪除違規內容。檢舉管道:① 考試頁面右上角內置**檢举按鈕**——當 ≥3 個不同 IP 的使用者檢舉同一場考試時,該考試連結會**自動鎖定為不可訪問**,進入管理員複核佇列;② 透過 GitHub Issues 檢舉。核實後違規內容將予以下架,誤封的考試可由管理員恢復。
- 演示站(exam.superagentparty.com)為免費公共服務,**不承諾可用性與數據持久性**(考試數據最多保留 7 天)。重要數據請自行備份。
- 使用本專案即表示你同意自行承擔使用風險,並遵守所在國家/地區的法律法規。

## 支援我們

### 請給我們點個 Star！
⭐ 你的支援是我們前進的動力！

### 歡迎打賞！
<div align="center" style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/agentparty)
[![愛發電](https://img.shields.io/badge/愛發電-支持我們-946ce6?style=for-the-badge&logo=affine&logoColor=white)](https://afdian.com/a/agentparty)

</div>

### 關注我們
<div align="center">
  <a href="https://space.bilibili.com/26978344">
    <img src="screenshots/B.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="bilibili"/>
  </a>
  <a href="https://www.youtube.com/@agentParty">
    <img src="screenshots/YT.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="youtube"/>
  </a>
</div>

### 加入社群
如果你在使用過程中遇到任何問題，歡迎加入我們的社群交流。

1. QQ 群：`931057213`（1群已滿） `902882342`（2群）

2. Discord: [Discord 連結](https://discord.gg/f2dsAKKr2V)

## 貢獻者

<a href="https://github.com/heshengtao/exameow/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=heshengtao/exameow" alt="heshengtao/exameow 的貢獻者" />
</a>

## License

Apache-2.0

## 第三方授權條款

本專案使用第三方開源軟體。完整的依賴清單、其授權條款及授權連結可以在 [THIRD_PARTY_LICENSES.csv](THIRD_PARTY_LICENSES.csv) 中找到。
