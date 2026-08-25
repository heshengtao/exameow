# 学科/章节 + 练习筛选 设计规格

日期：2026-08-25
状态：已批准（用户在 4 个设计小节逐一确认）

## 目标

为题库引入「学科（subject）」和「章节（chapter）」概念，使练习时可以在开始顺序、随机、模拟考试之前按题型、学科、章节筛选，从而同一个题库可以从不同角度刷题。

## 非目标

- 不做手动编辑学科/章节（用户明确要求：无数据时忽略，不提供编辑入口）。
- 不改动错题练习（wrong）模式——它本来就是针对性练习，保持不过滤。
- AI 生成题目不自动打标学科/章节。
- 不新增后端 API。

## 数据模型

给 `Question` 增加两个**可选**字段（TS 与 Rust 同步）：

```ts
export interface Question {
  id: string
  type: QuestionType
  stem: string
  options: string[]
  answer: string
  analysis: string
  aiAnalysis?: string
  score?: number
  subject?: string   // 新增：学科
  chapter?: string   // 新增：章节
}
```

Rust `packages/core/src/exam/types.rs` 对应：

```rust
#[serde(default, skip_serializing_if = "Option::is_none")]
pub subject: Option<String>,
#[serde(default, skip_serializing_if = "Option::is_none")]
pub chapter: Option<String>,
```

- 可选字段向后兼容：已有 localStorage 题库、AI 生成的题、跨端 JSON 均不受影响。
- 字段值直接存储导入时的原文（不做枚举归一化），筛选按字符串精确匹配。

## 导入识别与列映射

文件：`frontend/src/utils/importParser.ts`

- 表头关键词新增学科词：`学科|科目|课程|subject|course|discipline`（章节词 `章节` 已有）。
- `ColumnMapping` 增加两个字段：

```ts
export interface ColumnMapping {
  // ...现有字段
  subject: number | null
  chapter: number | null
}
```

- `parseWithMapping` 逐行读取 `row[subject]` / `row[chapter]` 写入 `Question.subject` / `Question.chapter`。
- 表头为英文（如 `Subject` / `Chapter`）时按关键词匹配自动映射。

### 列映射 UI

文件：`frontend/src/components/practice/ColumnMapper.vue`

- 题型/解析下拉下方新增「学科」「章节」两个 `BaseSelect`（非必填，默认 None）。
- 表头命中关键词时自动预选，用户可改。
- `handleApply()` 将 `subject` / `chapter` 一并写入映射。

### 导出

现有 5 处导出实现统一把 `subject` / `chapter` 写入导出文件。为保证「导出模板 → 再次导入」可往返，新增「学科」列并同步更新导入的位置映射。

**统一新列布局（15 列）**：

| 列 | 内容 |
|----|------|
| 0 | 题干（必填） |
| 1 | 题型（必填） |
| 2–9 | 选项 A–H |
| 10 | 正确答案（必填） |
| 11 | 解析（勿删） |
| 12 | 学科 |
| 13 | 章节（勿删） |
| 14 | 难度 |

需修改的 5 处：

1. `packages/core/src/export/xlsx.rs` — 标题行加「学科」于列 12，章节移到列 13；数据行写 `subject` / `chapter`；`spans="1:14"` 改 `spans="1:15"`。
2. `packages/core/src/export/writer.rs` — CSV 头 `['题干',...,'解析','学科','章节','难度']`，行补 `subject` / `chapter`。
3. `workers/src/export.ts` — 同上列布局与 `spans="1:15"`。
4. `frontend/src/api/http.ts` — `generateCsvContent` 头加「学科」，行写 `subject` / `chapter`。
5. `frontend/src/api/cf.ts` — 同上。

**导入侧配套更新**（`frontend/src/utils/importParser.ts`）：
- `buildXlsxColumnMap` 原生 XLSX 位置映射：`answer=10`、`analysis=11` 不变，新增 `subject=12`、`chapter=13`。
- `detectXlsxFormat` 位置校验（headers[0]/headers[1]/headers[10]）不受影响，保持有效。
- 非原生（关键词）模式下由 `buildColumnMap` 的关键词自动识别「学科/章节」列。

**模板样例**（`frontend/src/components/practice/BankListCard.vue` 的 `handleDownloadTemplate`）：
- 中文样例加 `'学科': ''`；英文样例加 `'Subject': ''`，与 15 列布局一致。

## 筛选页

新增组件 `frontend/src/components/practice/FilterBar.vue`，流程：选库 → **筛选页** → 模式选择 →（mock 则配比页）→ 开始。

筛选维度（均多选 chips，默认全不选 = 不过滤）：

- **题型**：题库中出现的题型去重。
- **学科**：`q.subject` 去重（空值忽略）。
- **章节**：`q.chapter` 去重。存在所选学科时，章节集合 =「属于所选学科的章节 ∪ 无学科章节」。

交互：

- 每选中/取消即时更新「符合条件 N 题」。
- N=0 时禁用「下一步/开始」按钮并提示。
- 题库全部无学科/章节时，对应区块隐藏。
- 全不选显示全部题目。

数据流：`PracticeView.vue` 维护筛选状态，传给 `FilterBar.vue`；确认后进入模式选择。

## 练习模式集成

文件：`frontend/src/stores/practice.ts`

`startSession` 新增可选参数：

```ts
export interface PracticeFilter {
  subjects?: string[]
  chapters?: string[]
  types?: QuestionType[]
}
```

行为：

- **sequential**：先按 filter 过滤，再按题库顺序。
- **random**：先按 filter 过滤，再 shuffle + 选项 shuffle。
- **mock**：先按 filter 过滤池，再按 `mockConfig.typeCounts` 配比抽题。
- **wrong**：不受影响。

mock 模式进入配比页时，`PracticeView.vue` 中传给 `MockExamConfigComponent` 的 `availableTypes` 应基于**筛选后的题目池**计算（各题型数量与上限一致），而非全题库。

`PracticeSession` 不持久化 filter（已开始的练习不记录筛选条件），session 的 `questions` 已是筛选结果，断点续练不受影响。

## i18n

文件：`frontend/src/i18n/locales.ts`（10 语言）

新增 key：

- `practiceFilterTitle`、`practiceFilterSubject`、`practiceFilterChapter`、`practiceFilterTypes`
- `practiceFilterCount`（带 `{ n }`）、`practiceFilterEmpty`、`practiceFilterAll`
- `practiceImportColSubject`、`practiceImportColChapter`

沿用现有逐语言手工补充模式。

## 边界情况

- 题目无学科/章节 → 对应筛选区块隐藏。
- 学科多选 + 章节多选同时勾选时，章节集合 =「属于所选学科的章节 ∪ 无学科章节」，避免过滤过头。
- 筛选后 N=0 → 禁用开始并提示。
- 旧题库（无 subject/chapter 字段）完全兼容：筛选页只显示题型。

## 验证

- `cd frontend && pnpm run type-check`
- `cd workers && pnpm typecheck`
- `cargo build`
