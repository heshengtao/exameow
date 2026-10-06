<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="Exameow — AI 기반 시험 문제 생성기: 학습 자료를 업로드하여 몇 초 만에 시험 문제 생성">
</p>

<p align="center">
  <a href="https://github.com/heshengtao/exameow/releases"><img src="https://img.shields.io/github/v/release/heshengtao/exameow?style=flat-square&color=1A6CFF" alt="GitHub release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-1A6CFF?style=flat-square" alt="License: Apache-2.0"></a>
  <img src="https://img.shields.io/badge/platforms-Windows%20/%20macOS%20/%20Linux%20/%20Android%20/%20Web-1A6CFF?style=flat-square" alt="지원 플랫폼: Windows, macOS, Linux, Android, Web">
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
  <a href="https://exam.superagentparty.com/"><b>라이브 데모</b></a> ·
  <a href="https://github.com/heshengtao/exameow/releases">클라이언트 다운로드</a> ·
  <a href="https://hub.docker.com/r/ailm32442/exameow">Docker Hub</a>
</p>

## Exameow란?

**Exameow (过了喵)**는 학습 자료를 몇 초 만에 고품질 시험 문제로 변환해 주는 **오픈 소스 AI 시험 문제 생성기**입니다. PDF, Word 문서, PowerPoint 슬라이드, 이미지 또는 텍스트를 업로드하면 AI가 내용을 분석하고 단일 선택, 다중 선택, 참/거짓, 빈칸 채우기, 주관식 문제를 맞춤형으로 생성합니다.

계정 등록, 유료 구독 또는 데이터를 클라우드로 전송해야 하는 다른 AI 문제 생성 도구와 달리, Exameow는 **로컬 우선 및 개인정보 보호 중심**입니다. 문제 은행, 학습 기록 및 오답 노트는 모두 사용자의 기기에 저장됩니다. 데스크톱 및 모바일 앱은 자체 OpenAI 호환 API 키(OpenAI, DeepSeek, Qwen, GLM 또는 모든 셀프 호스팅 모델)를 사용하여 **완전히 오프라인으로 작동**합니다.

교사와 강사를 위해 Exameow에는 **온라인 시험 중계(릴레이) 시스템**이 내장되어 있습니다. 로컬 문제 은행에서 시험을 게시하고 6자리 확인 코드를 공유하면 학생들이 모든 브라우저에서 참여할 수 있습니다. 즉시 자동 채점, 교사 성적 대시보드, 남용 방지 기능이 포함되어 있습니다. 단 하나의 Docker 명령으로 전체 시스템을 셀프 호스팅할 수 있습니다.

<p align="center">
  <a href="https://exam.superagentparty.com/"><img src="screenshots/Cover.png" width="100%" alt="Exameow 데스크톱 및 모바일 앱 인터페이스"></a>
</p>

## 라이브 데모

온라인으로 체험하기: **[exam.superagentparty.com](https://exam.superagentparty.com/)**

데모 사이트는 Cloudflare Workers 무료 AI 플랜에서 실행됩니다:

- ⏳ **일일 쿼터 제한** — Cloudflare의 무료 AI 할당량은 매일 초기화됩니다
- 📄 **컨텍스트 창 제한** — 대용량 문서는 모델의 컨텍스트 창 크기에 맞게 잘릴 수 있습니다

무제한으로 사용하려면 Docker로 셀프 호스팅하거나 자체 API 키가 설정된 데스크톱/모바일 앱을 사용하세요.

## 주요 기능

### ✨ AI 문제 생성 — 파일 업로드로 몇 초 만에 문제 생성

Exameow는 **10가지 이상의 파일 형식**(PDF, DOCX, XLSX, PPTX, EPUB, ODT, TXT, CSV, HTML, 이미지: PNG/JPG/WEBP/GIF/BMP) 분석을 지원합니다. 단일 파일을 업로드하거나 여러 파일을 끌어서 놓기(Drag & Drop)할 수 있습니다. AI는 **5가지 문제 유형**(단일 선택, 다중 선택, 참/거짓, 빈칸 채우기, 주관식)을 생성하며, 유형별 문항 수, 난이도(쉬움/보통/어려움), 출력 언어 및 주제/단원별 필터링을 세부적으로 제어할 수 있습니다. 대용량 문서는 자동으로 분할되어 중복 없이 배치 생성됩니다. OpenAI, DeepSeek, Qwen, GLM 등 모든 OpenAI 호환 API와 연동되며, 데모 사이트의 내장 무료 Cloudflare AI도 사용할 수 있습니다. 결과는 XLSX 또는 CSV로 내보낼 수 있습니다.

- **풍부한 입력 형식** — PDF, DOCX, XLSX, PPTX, EPUB, ODT, TXT, CSV, HTML, 이미지(PNG/JPG/WEBP/GIF/BMP) 및 모든 텍스트/코드 파일 지원. 드래그 앤 드롭을 통한 다중 파일 업로드 가능
- **5가지 문제 유형** — 단일 선택, 다중 선택, 참/거짓, 빈칸 채우기, 주관식 (유형별 문항 수 설정 지원)
- **정밀한 제어** — 난이도(쉬움/보통/어려움), 출력 언어, 주제/단원별 맞춤출제
- **스마트 배치 생성** — 대용량 문서를 자동으로 분할하고 중복을 제거하여 단계별 생성
- **모든 OpenAI 호환 API 지원** — OpenAI, DeepSeek, Qwen, GLM 등 지원. 데모 사이트의 무료 Cloudflare AI도 활용 가능
- **내보내기** — 결과를 XLSX 또는 CSV 파일로 다운로드

### 📚 학습 모드 — 더 스마트하게 공부하고 효율적으로 기억

생성된 문제를 대화형 학습 세션으로 활용하세요. 순서대로 풀기, 문제 및 보기 랜덤 셔플, 자동 생성된 시험지를 통한 제한 시간 모의고사를 지원합니다. 틀린 문제는 오답 노트에 자동으로 기록·추적되며, 연속으로 정답을 맞히면 오답 목록에서 해제됩니다. 시험 모드(답안 입력 후 정답 확인)와 암기 모드(문제와 정답을 동시 확인)를 자유롭게 전환할 수 있습니다. 주관식 문제는 AI가 모범 답안과 비교하여 자동으로 채점하고 피드백을 제공합니다(수동 재채점 지원). 스마트 열 매핑이 포함된 XLSX/CSV 문제 은행 가져오기/내보내기를 지원합니다.

- **순서대로 풀기** — 문제 은행의 순서에 따라 차례대로 연습
- **랜덤 연습** — 문제와 보기 순서를 무작위로 섞어 위치 기억 방지
- **모의고사** — 문제 은행에서 유형별 문항 수를 설정하여 무작위 시험지를 자동 생성
- **오답 노트 연습** — 틀린 문제를 자동 추적하여 취약점만 집중 학습. 연속 정답 시 오답 노트에서 자동 제거
- **시험 / 암기 모드** — 먼저 풀고 정답을 확인하거나, 문제와 정답을 동시에 확인하며 암기
- **AI 자동 채점** — 주관식 문제를 AI가 모범 답안과 비교하여 채점 및 피드백 제공 (수동 수정 지원)
- **문제 은행 관리** — 스마트 열 매핑을 통한 XLSX/CSV 가져오기 및 내보내기

### 📝 온라인 시험 — 시험 게시 및 학생 초대

로컬의 여러 문제 은행에서 유형별 문항 수와 배점을 설정하여 시험지를 구성할 수 있습니다. 시험 제목, 시작 시간 및 시험 시간을 설정할 수 있습니다. **6자리 확인 코드** 또는 시험 링크를 공유하면 학생들은 앱 설치 없이 모든 기기의 브라우저에서 참여할 수 있습니다. 로컬 카운트다운 타이머와 자동 제출 기능으로 공정한 시험을 유지하며, 페이지를 새로고침해도 진행 상황이 유지됩니다. 객관식 문제는 제출 즉시 서버에서 채점되어 정답과 해설이 표시됩니다. 교사 대시보드에서는 점수 순 정렬 및 문항별 상세 답안을 확인할 수 있습니다. 개인정보 보호를 위해 시험 데이터는 7일 후 자동으로 삭제됩니다. 남용 방지: IP당 하루 20회 게시 제한, 3개의 서로 다른 IP에서 신고 시 자동 일시 정지 기능을 갖추고 있습니다. **Docker 이미지는 완전히 독립적**이며, 온라인 시험 릴레이는 SQLite에서 실행되므로 데모 사이트에 의존하지 않습니다.

- **문제 은행에서 시험 출제** — 로컬 문제 은행에서 유형별 문항 수와 배점을 설정하여 시험 구성. 제목, 시작 시간, 제한 시간 설정 가능
- **6자리 코드 + 시험 링크** — 앱 설치 없이 브라우저에서 코드 입력 또는 링크 클릭으로 참여 가능
- **제한 시간 세션** — 카운트다운 타이머 및 자동 제출 기능. 새로고침 후에도 이어서 응시 가능
- **즉시 채점** — 제출 즉시 서버에서 객관식 문제를 채점하고 정답 및 해설 표시. 결과는 로컬에 저장되어 언제든 확인 가능
- **교사 성적 대시보드** — 점수 순 정렬 및 문항별 상세 분석 제공. 결과는 로컬에 캐시되어 시험 종료 후 1회만 조회. 교사는 언제든지 시험을 삭제 가능 (즉시 학생 접근 차단 및 성적 삭제)
- **개인정보 보호 릴레이** — 시험 데이터는 Cloudflare D1에 최대 7일간 보관 후 자동 삭제. 제출 전에는 학생에게 정답을 전송하지 않음
- **남용 방지 메커니즘** — IP당 하루 20회 게시 제한. 3개의 서로 다른 IP에서 신고 시 자동 일시 정지. 관리자는 `#/admin` 페이지에서 복원 또는 삭제 가능
- **완전한 셀프 호스팅** — Docker 이미지에 동일한 시험 릴레이(SQLite)가 내장되어 있어 데모 사이트에 의존하지 않음. `ADMIN_TOKEN`으로 관리자 페이지 보호 (기본값 `pass`, 최초 접속 시 변경 필수)

### 🔍 검색 모드 — 빠른 정답 검색

문제 텍스트를 입력하여 로컬 문제 은행에서 검색하고, 선택적으로 AI 해설을 제공받을 수 있습니다. **사진 검색**은 기기 내 OCR을 사용하여 카메라 촬영이나 업로드된 이미지에서 문제를 인식합니다 (브라우저 내 로컬 실행, 서버 업로드 없음). **실시간 카메라 검색**은 카메라를 화면이나 시험지에 가져다 대면 AI가 실시간으로 일치하는 문제를 검색합니다. **화면 녹화 검색**은 임의의 창 위에 캡처 영역을 지정하면 AI가 이를 감지하여 플로팅 오버레이에 정답을 실시간으로 표시합니다 (Windows/macOS/Linux/Android 지원, iOS는 시스템 제한으로 미지원).

- **텍스트 검색** — 문제 텍스트를 입력하여 로컬 문제 은행에서 검색하고 AI 해설 확인
- **사진 검색** — 문제 사진 촬영 및 업로드를 통한 검색. 브라우저 내 로컬 OCR 실행 (업로드 없음)
- **실시간 카메라 검색** — 카메라를 화면이나 종이에 대면 AI가 실시간으로 매칭되는 문제 검색
- **화면 녹화 검색** — 화면의 특정 영역을 지정하면 AI가 실시간으로 문제를 인식하고 플로팅 창에 정답 표시 (Windows / macOS / Linux / Android 지원, iOS 미지원)

### 🌐 교차 플랫폼 및 개인정보 보호 — 내 데이터는 내 기기에

Exameow는 **Windows, macOS, Linux, Android, Web** (iOS는 셀프 빌드)을 지원합니다. Web 버전은 **단 하나의 Docker 명령**으로 데플로이할 수 있습니다. 모든 문제 은행, 학습 기록, 오답 노트는 로컬에 저장되며, 온라인 시험 기능을 사용하지 않는 한 서버로 업로드되지 않습니다. 데스크톱 앱의 API 키는 **AES-256-GCM**으로 암호화되어 저장됩니다. UI는 시스템 언어(한국어/영어/중국어 등)를 자동으로 감지하며 원터치로 전환할 수 있습니다.

- **데스크톱 및 모바일** — Windows, macOS, Linux, Android (iOS 셀프 빌드)
- **셀프 호스팅 웹 버전** — Docker 명령 하나로 배포
- **로컬 우선** — 문제 은행, 학습 기록, 오답 노트는 기기에만 보관. API 키는 AES-256-GCM 암호화 저장
- **다국어 UI 지원** — 시스템 언어 자동 감지 및 원터치 전환

## 설치

모든 플랫폼을 위한 사전 빌드된 바이너리는 [GitHub Releases](https://github.com/heshengtao/exameow/releases) 페이지에서 다운로드할 수 있습니다.

### 플랫폼 지원

| 플랫폼 | 상태 | 다운로드 형식 |
|--------|------|---------------|
| Windows | ✅ 지원됨 | `.msi` 설치 파일 / 무설치 `.zip` |
| macOS (Apple Silicon / Intel) | ✅ 지원됨 | `.dmg` (격리 속성 제거 방법은 Release 참조) |
| Linux (x86_64 / ARM64) | ✅ 지원됨 | `.AppImage` / `.deb` |
| Android (ARM64) | ✅ 지원됨 | `.apk` |
| iOS | ⚠️ 셀프 빌드 필요 | 아래 참고 사항 참조 |
| Web / Docker (셀프 호스팅) | ✅ 지원됨 | Docker 이미지 |

> **iOS 관련 안내:** Apple 개발자 프로그램 비용($99/년) 문제로 현재 사전 빌드된 iOS 패키지는 제공되지 않습니다. Xcode를 사용하여 직접 빌드해야 합니다 (`pnpm tauri ios build`). 향후 후원금으로 인증서 비용이 충당되면 GitHub Releases에 공식 서명된 iOS 빌드가 게시될 예정입니다.

### Docker (셀프 호스팅)

```bash
git clone https://github.com/heshengtao/exameow.git
cd exameow

# 프론트엔드 빌드
cd frontend && pnpm install && pnpm build && cd ..

# AI 프로바이더 설정
export AI_ENDPOINT=https://api.openai.com/v1
export AI_API_KEY=sk-your-key-here
export AI_MODEL=gpt-4o

# 빌드 및 실행
docker compose up -d --build
```

브라우저에서 `http://localhost:3000`을 엽니다.

> **🔐 관리자 토큰 (온라인 시험 관리 필수):** `http://localhost:3000/#/admin` 관리자 페이지는 `ADMIN_TOKEN`으로 보호됩니다. 설정하지 않을 경우 기본값은 **`pass`**이며, **최초 로그인 시 비밀번호 변경이 강제**됩니다. 이를 건너뛰려면 실행 시 설정하세요:
>
> ```bash
> ADMIN_TOKEN=your-strong-token docker compose up -d --build
> ```
>
> 변경된 토큰은 컨테이너가 재시작되어도 `exameow-data` 볼륨(`/app/data/admin_token.txt`)에 보관됩니다. 시험 데이터(SQLite)도 동일한 볼륨에 저장됩니다.

### Docker (사전 빌드된 이미지)

```bash
docker pull ailm32442/exameow:latest
docker run -d -p 3000:3000 \
  -e AI_ENDPOINT=https://api.openai.com/v1 \
  -e AI_API_KEY=sk-your-key-here \
  -e AI_MODEL=gpt-4o \
  -e ADMIN_TOKEN=your-strong-token \
  -v exameow-data:/app/data \
  ailm32442/exameow:latest
```

`ADMIN_TOKEN`을 설정하지 않으면 기본값은 `pass`이며, `/#/admin` 최초 방문 시 변경해야 합니다.

## 환경 변수

| 변수명 | 기본값 | 설명 |
|--------|--------|------|
| `AI_ENDPOINT` | `https://api.openai.com/v1` | OpenAI 호환 API 엔드포인트 |
| `AI_API_KEY` | — | AI API 키 |
| `AI_MODEL` | `gpt-4o` | 사용할 기본 모델 |
| `PORT` | `3000` | 서버 수신 포트 |
| `STATIC_DIR` | `/app/static` | 정적 파일 디렉토리 |
| `ADMIN_TOKEN` | `pass` | 관리자 페이지 토큰. `pass`일 경우 `/#/admin` 최초 접속 시 변경 강제 |
| `EXAM_DB_PATH` | `/app/data/exameow.db` | 온라인 시험 릴레이용 SQLite 경로 |
| `ADMIN_TOKEN_FILE` | `/app/data/admin_token.txt` | 변경된 관리자 토큰 저장 경로 |
| `RUST_LOG` | `info` | 로그 레벨 |

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| `GET` | `/api/models` | 사용 가능한 AI 모델 목록 조회 |
| `POST` | `/api/generate` | 파일 업로드 및 시험 문제 생성 |
| `GET` | `/api/export` | 문제를 CSV로 내보내기 |
| `POST` | `/api/export/xlsx` | 문제를 XLSX로 내보내기 |
| `POST` | `/api/config/save` | AI 설정 저장 |
| `GET` | `/api/config/load` | 저장된 AI 설정 불러오기 |

### 문제 생성 요청 예시

```bash
curl -X POST http://localhost:3000/api/generate \
  -F "file=@study-material.pdf" \
  -F 'params={"question_types":["single_choice","multi_choice"],"count":10,"difficulty":"medium","language":"Chinese"}'
```

## 아키텍처

Exameow는 하나의 Vue 3 프론트엔드를 공유하는 **3중 백엔드 아키텍처**를 채택하고 있습니다. 동일한 SPA가 런타임 시 플랫폼을 자동 감지하여 적절한 백엔드로 라우팅합니다:

- **Tauri (데스크톱/모바일)**: `src-tauri/` 의 Rust 명령어가 Rust 코어 라이브러리를 직접 호출
- **Cloudflare Workers**: `workers/` 의 TypeScript가 Cloudflare AI + D1을 호출하여 온라인 시험 중계
- **Axum (셀프 호스팅/Docker)**: `packages/server/` 의 Rust HTTP 서버가 SQLite를 사용하여 시험 중계

핵심 로직(파일 분석, AI 클라이언트, 문제 생성, 내보내기)은 공유 `packages/core/` Rust 크레이트에 위치하며, Workers 경로를 위해 TypeScript로도 동일하게 구현되어 있습니다.

## 자주 묻는 질문 (FAQ)

### PDF에서 시험 문제를 어떻게 생성하나요?

[데모 사이트](https://exam.superagentparty.com/) 또는 데스크톱 앱에서 PDF를 드래그 앤 드롭하여 업로드합니다. 문제 유형(단일 선택, 다중 선택, 참/거짓, 빈칸 채우기, 주관식)을 선택하고 문항 수와 난이도를 설정한 후 '생성'을 클릭합니다. AI가 문서를 읽고 몇 초 만에 문제를 작성합니다. 결과는 XLSX 또는 CSV로 내보낼 수 있습니다.

### Exameow는 정말 무료인가요?

네. Exameow는 Apache 2.0 라이선스 기반의 오픈 소스이며 100% 무료입니다. 유료 플랜, 기업용 티어, 기능 제한이 전혀 없습니다. 데모 사이트는 무료 AI 생성 기능을 제공합니다 (Cloudflare 무료 플랜의 일일 할당량 제한 적용). 데스크톱/모바일 앱에서는 사용자가 직접 준비한 AI API 키가 필요하며, 비용은 해당 AI 제공업체에 직접 지불합니다. Exameow는 사용자에게 어떠한 비용도 청구하지 않습니다.

### 오프라인으로 사용할 수 있나요?

네. 데스크톱 및 모바일 앱은 완전히 오프라인으로 작동합니다. 문제 은행, 학습 기록, 오답 노트는 로컬에 저장됩니다. AI API를 호출하여 문제를 생성할 때만 인터넷 연결이 필요합니다.

### 어떤 AI 모델을 지원하나요?

모든 OpenAI 호환 API를 지원합니다: OpenAI (GPT-4o, GPT-4, GPT-3.5), DeepSeek, Qwen, GLM 및 Ollama 등을 통한 셀프 호스팅 모델. 데모 사이트에서는 내장된 무료 Cloudflare AI도 사용할 수 있습니다.

### 온라인 시험 기능은 어떻게 작동하나요?

교사가 로컬 문제 은행에서 6자리 코드가 포함된 시험을 게시합니다. 학생들은 해당 코드나 공유 링크를 사용하여 모든 브라우저에서 참여합니다. 시험은 제한 시간과 자동 제출 기능이 있으며, 객관식 문제는 즉시 채점됩니다. 시험 데이터는 7일 후 자동 삭제됩니다. 셀프 호스팅 사용자도 Docker를 통해 동일한 릴레이 기능을 사용할 수 있습니다.

### 내 데이터는 안전한가요?

네. 기본적으로 모든 데이터(문제 은행, 학습 기록, API 키)는 사용자의 기기에 보관됩니다. API 키는 AES-256-GCM으로 암호화됩니다. 유일한 예외는 온라인 시험 데이터이며, Cloudflare D1(7일 자동 삭제) 또는 자체 호스팅된 SQLite에 임시로 저장됩니다.

## 개발

```bash
# Rust 서버
cargo run -p exameow-server

# 프론트엔드 개발 서버
cd frontend && pnpm dev

# Tauri 데스크톱 앱
pnpm tauri dev
```

### 프로젝트 구조

```
exameow/
├── frontend/          # Vue 3 SPA
├── packages/
│   ├── core/          # Rust 공유 라이브러리 (AI, 분석, 내보내기, 설정)
│   ├── server/        # Axum HTTP 서버
│   └── shared/        # TypeScript 공유 타입
├── src-tauri/         # Tauri 데스크톱 + 모바일 앱
├── workers/           # Cloudflare Workers (Hono)
├── scripts/           # 빌드 및 배포 스크립트
├── Dockerfile
└── docker-compose.yml
```

## 면책 조항

- 본 프로젝트는 **오픈 소스 학습 도구**이며, 개인 학습, 교육 및 내부 교육 등 합법적인 목적을 위해서만 사용해야 합니다.
- **AI가 생성한 콘텐츠의 정확성은 보장되지 않습니다.** 문제 및 해설에 오류가 포함될 수 있으므로 사용 전에 검토하시기 바랍니다. 생성된 콘텐츠 사용으로 인해 발생하는 결과에 대해 제작자는 어떠한 책임을 지지 않습니다.
- **사용자 생성 콘텐츠(UGC)에 대한 책임은 게시자에게 있습니다.** 온라인 시험 기능을 사용하여 불법, 침해 또는 민감한 정보를 저장하거나 배포하지 마십시오. 운영자는 사전 통지 없이 위반 콘텐츠를 삭제할 권리를 보유합니다. 신고 창구: ① 시험 페이지 우측 상단의 **신고 버튼** (3개 이상의 서로 다른 IP에서 동일한 시험을 신고하면 링크가 **자동으로 잠기고 접근 불가** 상태가 되어 관리자 검토에 들어갑니다), ② GitHub Issues. 위반 사항 확인 시 즉시 삭제되며, 잘못 차단된 시험은 관리자가 복원할 수 있습니다.
- 데모 사이트(exam.superagentparty.com)는 무료 공공 서비스이며 **가용성 및 데이터 지속성을 보장하지 않습니다** (시험 데이터는 최대 7일간 보관). 중요한 데이터는 직접 백업하시기 바랍니다.
- 본 프로젝트를 사용하는 것은 사용에 따른 모든 위험을 부담하고 해당 국가/지역의 법률 및 규정을 준수하는 데 동의하는 것으로 간주됩니다.

## 후원하기

### Star를 눌러주세요!
⭐ 여러분의 지원은 프로젝트 개발의 큰 원동력이 됩니다!

### 개발자 후원하기
<div align="center" style="display: flex; gap: 20px; justify-content: center; flex-wrap: wrap;">

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/agentparty)
[![爱发电](https://img.shields.io/badge/爱发电-支持我们-946ce6?style=for-the-badge&logo=affine&logoColor=white)](https://afdian.com/a/agentparty)

</div>

### 팔로우하기
<div align="center">
  <a href="https://space.bilibili.com/26978344">
    <img src="screenshots/B.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="bilibili"/>
  </a>
  <a href="https://www.youtube.com/@agentParty">
    <img src="screenshots/YT.png" width="100" height="100" style="border-radius: 80%; overflow: hidden;" alt="youtube"/>
  </a>
</div>

### 커뮤니티 참여
프로젝트 사용 중 궁금한 점이나 문제가 있으면 언제든지 커뮤니티에 참여하세요.

1. QQ 그룹: `931057213` (1그룹 만석) / `902882342` (2그룹)

2. Discord: [Discord 링크](https://discord.gg/f2dsAKKr2V)

## 기여자에 대해

<a href="https://github.com/heshengtao/exameow/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=heshengtao/exameow" alt="heshengtao/exameow 기여자 목록" />
</a>

## 라이선스

Apache-2.0

## 제3자 라이선스

본 프로젝트는 제3자 오픈 소스 소프트웨어를 사용합니다. 의존성 목록, 라이선스 및 라이선스 URL의 전체 정보는 [THIRD_PARTY_LICENSES.csv](THIRD_PARTY_LICENSES.csv)에서 확인할 수 있습니다.
