# 学科/章节 + 练习筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给题库引入学科（subject）/章节（chapter）元数据（从 CSV/XLSX 导入识别），并新增独立筛选页，让顺序/随机/模拟考试练习可按题型、学科、章节多选筛选后开始。

**Architecture:** `Question` 增加可选 `subject`/`chapter` 字段（TS + Rust 同步）；导入解析器与列映射 UI 支持学科/章节列；5 处导出写入这两个字段；新增 `FilterBar.vue` 独立筛选页；`startSession` 接受 `PracticeFilter` 参数按题型/学科/章节过滤后再取题。

**Tech Stack:** Vue 3 + Pinia + TypeScript（frontend）、Rust exameow-core（packages/core）、TypeScript Hono（workers）。

## Global Constraints

- Rust ⇄ TS parity：`Question.subject` / `Question.chapter` 在 `packages/core/src/exam/types.rs`、`packages/shared/src/types.ts`、`workers/src/types.ts` 三处保持一致，均为可选字段。
- 不做手动编辑学科/章节；无数据时忽略。
- wrong 练习模式不受筛选影响。
- AI 生成不自动打标学科/章节。
- 不新增后端 API。
- 验证命令：`cd frontend && pnpm run type-check`、`cd workers && pnpm typecheck`、`cargo build`（在 `packages/core` 或仓库根）。
- i18n 10 语言（zh/zh-TW/en/ja/ko/es/fr/de/ru/ar），沿用现有逐语言手工补充模式。

---

### Task 1: Question 数据模型增加 subject/chapter（TS + Rust 同步）

**Files:**
- Modify: `packages/shared/src/types.ts`（`Question` 接口，第 15-24 行；新增 `PracticeFilter` 接口）
- Modify: `packages/core/src/exam/types.rs`（`Question` struct，第 56-71 行）
- Modify: `workers/src/types.ts`（`Question` 接口，第 15-23 行）
- Test: `packages/core/tests/exam_tests.rs`

**Interfaces:**
- Consumes: 无
- Produces: `Question` 新增可选字段 `subject?: string`、`chapter?: string`（TS）；Rust `Option<String>` 字段，serde `default` + `skip_serializing_if = "Option::is_none"`；`packages/shared/src/types.ts` 新增导出 `PracticeFilter` 接口（供 Task 7/8/9 使用）。

- [ ] **Step 1: 写失败测试（Rust 序列化/反序列化含 subject/chapter 的 JSON）**

在 `packages/core/tests/exam_tests.rs` 末尾追加：

```rust
#[test]
fn test_parse_questions_with_subject_chapter() {
    let json = r#"[
        {"id": "q1", "type": "single_choice", "stem": "What is AI?", "options": ["A", "B", "C", "D"], "answer": "A", "analysis": "", "subject": "计算机", "chapter": "第一章 绪论"},
        {"id": "q2", "type": "true_false", "stem": "Is Earth round?", "options": ["True", "False"], "answer": "True", "analysis": "", "subject": "地理", "chapter": "第二章 大气"}
    ]"#;
    let questions = parse_questions(json).unwrap();
    assert_eq!(questions[0].subject.as_deref(), Some("计算机"));
    assert_eq!(questions[0].chapter.as_deref(), Some("第一章 绪论"));
    assert_eq!(questions[1].subject.as_deref(), Some("地理"));
    assert_eq!(questions[1].chapter.as_deref(), Some("第二章 大气"));

    let serialized = serde_json::to_string(&questions[0]).unwrap();
    assert!(serialized.contains("\"subject\":\"计算机\""));
    assert!(serialized.contains("\"chapter\":\"第一章 绪论\""));
}

#[test]
fn test_parse_questions_without_subject_chapter() {
    let json = r#"[
        {"id": "q1", "type": "single_choice", "stem": "What is AI?", "options": ["A", "B", "C", "D"], "answer": "A", "analysis": ""}
    ]"#;
    let questions = parse_questions(json).unwrap();
    assert_eq!(questions[0].subject, None);
    assert_eq!(questions[0].chapter, None);
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test -p exameow-core --test exam_tests test_parse_questions_with_subject_chapter test_parse_questions_without_subject_chapter`
Expected: 编译失败，报错 `no field 'subject'` / `no field 'chapter'`。

- [ ] **Step 3: 三处 Question 模型加字段**

`packages/core/src/exam/types.rs` 的 `Question` struct 中 `score` 字段后追加：

```rust
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chapter: Option<String>,
```

`packages/shared/src/types.ts` 的 `Question` 接口 `score?: number` 后追加：

```ts
  subject?: string
  chapter?: string
```

`packages/shared/src/types.ts` 在 `Question` 接口之后（`QuestionBank` 之前）追加导出：

```ts
export interface PracticeFilter {
  subjects?: string[]
  chapters?: string[]
  types?: QuestionType[]
}
```

`workers/src/types.ts` 的 `Question` 接口 `score?: number` 后追加：

```ts
  subject?: string
  chapter?: string
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test -p exameow-core --test exam_tests test_parse_questions_with_subject_chapter test_parse_questions_without_subject_chapter`
Expected: PASS（2 个测试全过）。

- [ ] **Step 5: 修复现有 Rust 测试的 struct 字面量**

`packages/core/tests/export_tests.rs` 第 6-27 行 `make_questions()` 构造 `Question` 时新增两个字段（`score: None,` 之后）：

```rust
            subject: None,
            chapter: None,
```

两个 `Question` 字面量都要加。

- [ ] **Step 6: 全量验证**

Run: `cargo test -p exameow-core`
Expected: 全部通过（现有测试 + 新增 2 个）。

- [ ] **Step 7: 提交**

```bash
git add packages/shared/src/types.ts packages/core/src/exam/types.rs workers/src/types.ts packages/core/tests/exam_tests.rs packages/core/tests/export_tests.rs
git commit -m "feat(core): add optional subject/chapter fields to Question (TS+Rust parity)"
```

---

### Task 2: 导入解析器支持学科/章节列

**Files:**
- Modify: `frontend/src/utils/importParser.ts`

**Interfaces:**
- Consumes: Task 1 的 `Question.subject?` / `Question.chapter?`
- Produces: `ColumnMapping` 增加 `subject: number | null`、`chapter: number | null`；`parseWithMapping` 返回的 `Question` 携带 `subject`/`chapter`。

- [ ] **Step 1: `ColumnMapping` 接口增加字段**

`frontend/src/utils/importParser.ts` 第 13-22 行：

```ts
export interface ColumnMapping {
  stem: number | null
  type: number | null
  options: number[]
  combinedOptions: number | null
  optionsDelimiter: string
  answer: number | null
  analysis: number | null
  subject: number | null
  chapter: number | null
}
```

- [ ] **Step 2: 表头关键词检测加入学科词**

`buildColumnMap`（第 96-151 行）在 `analysis` 检测块之后、`isCombinedOptionsHeader` 之前插入：

```ts
    if (map.subject === null && (
      n.includes('学科') || n.includes('科目') || n.includes('课程') || n.includes('subject') || n.includes('course') || n.includes('discipline')
    )) {
      map.subject = i
      continue
    }

    if (map.chapter === null && (
      n.includes('章节') || n.includes('chapter') || n.includes('unit') || n.includes('模块')
    )) {
      map.chapter = i
      continue
    }
```

- [ ] **Step 3: `buildColumnMap` 初始化新字段**

第 96-100 行：

```ts
  const map: ColumnMapping = {
    stem: null, type: null, options: [], combinedOptions: null,
    optionsDelimiter: '', answer: null, analysis: null, subject: null, chapter: null,
  }
```

- [ ] **Step 4: 位置映射（原生 XLSX）与 fallback 增加字段**

`buildXlsxColumnMap`（第 164-174 行）：

```ts
function buildXlsxColumnMap(): ColumnMapping {
  return {
    stem: 0,
    type: 1,
    options: [2, 3, 4, 5, 6, 7, 8, 9],
    combinedOptions: null,
    optionsDelimiter: '',
    answer: 10,
    analysis: 11,
    subject: 12,
    chapter: 13,
  }
}
```

`applyPositionalFallback`（第 153-162 行）保持不变（位置兜底不设学科/章节，保持 None）。

- [ ] **Step 5: `parseWithMapping` 逐行写入 subject/chapter**

第 372-379 行 `questions.push({...})` 中加字段：

```ts
    questions.push({
      id: `${source}-${i + 1}`,
      type: qtype,
      stem,
      options,
      answer,
      analysis,
      subject: mapping.subject !== null ? (row[mapping.subject] ?? '').trim() || undefined : undefined,
      chapter: mapping.chapter !== null ? (row[mapping.chapter] ?? '').trim() || undefined : undefined,
    })
```

- [ ] **Step 6: 前端类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误（若 `ImportAnalysis` 或别处显式构造 `ColumnMapping` 缺字段会报错，需补上 —— 见 Step 7）。

- [ ] **Step 7: 修复其它显式构造 `ColumnMapping` 的位置（若 type-check 报错）**

Run: `cd frontend && grep -rn "combinedOptions:" frontend/src/utils/importParser.ts`
Expected: 只有第 96、164 行两处（都已改）。若其它文件显式构造 `ColumnMapping`，用 grep `grep -rn "optionsDelimiter:" frontend/src` 找出并补 `subject: null, chapter: null`。

- [ ] **Step 8: 提交**

```bash
git add frontend/src/utils/importParser.ts
git commit -m "feat(import): parse subject/chapter columns from CSV/XLSX"
```

---

### Task 3: 列映射 UI 增加学科/章节下拉

**Files:**
- Modify: `frontend/src/components/practice/ColumnMapper.vue`

**Interfaces:**
- Consumes: Task 2 的 `ColumnMapping.subject` / `ColumnMapping.chapter`
- Produces: `handleApply()` emit 的 `ColumnMapping` 携带 `subject`/`chapter`。

- [ ] **Step 1: script 中初始化 subject/chapter ref**

`ColumnMapper.vue` 第 21-28 行 ref 声明区（`analysisCol` 之后）加：

```ts
const subjectCol = ref<number | null>(m.subject)
const chapterCol = ref<number | null>(m.chapter)
```

- [ ] **Step 2: `handleApply()` 输出新字段**

第 75-85 行：

```ts
function handleApply() {
  emit('apply', {
    stem: stem.value,
    type: type.value,
    options: mode.value === 'multi' ? [...optionCols.value] : [],
    combinedOptions: mode.value === 'combined' ? combinedCol.value : null,
    optionsDelimiter: mode.value === 'combined' ? delimiter.value : '',
    answer: answer.value,
    analysis: analysisCol.value,
    subject: subjectCol.value,
    chapter: chapterCol.value,
  })
}
```

- [ ] **Step 3: 模板加两个下拉**

`ColumnMapper.vue` 第 132-137 行（analysis 的 `<label>`）之后，`</div>`（第 138 行 grid 结束）之前插入：

```html
      <label class="block">
        <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceImportColSubject') }}
        </span>
        <BaseSelect v-model="subjectCol" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>

      <label class="block">
        <span class="block text-body-sm mb-1" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
          {{ i18n.t('practiceImportColChapter') }}
        </span>
        <BaseSelect v-model="chapterCol" :options="colSelectOptions" :placeholder="i18n.t('practiceMapNone')" />
      </label>
```

- [ ] **Step 4: 前端类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/components/practice/ColumnMapper.vue
git commit -m "feat(import): add subject/chapter column mapping in import dialog"
```

---

### Task 4: 导出写入 subject/chapter（Rust xlsx + CSV）

**Files:**
- Modify: `packages/core/src/export/xlsx.rs`
- Modify: `packages/core/src/export/writer.rs`
- Test: `packages/core/tests/export_tests.rs`

**Interfaces:**
- Consumes: Task 1 的 `Question.subject` / `Question.chapter`
- Produces: 导出列布局改为 15 列：0题干 1题型 2-9选项 10答案 11解析 12学科 13章节 14难度。

- [ ] **Step 1: 写失败测试**

`packages/core/tests/export_tests.rs` 的 `make_questions()` 中第一个 `Question` 设置：

```rust
            subject: Some("计算机".to_string()),
            chapter: Some("第一章".to_string()),
```

并在文件末尾追加：

```rust
#[test]
fn test_export_csv_includes_subject_chapter() {
    let questions = make_questions();
    let dir = std::env::temp_dir();
    let path = dir.join("test_subject_chapter.csv");
    let path_str = path.to_str().unwrap();
    export_csv(&questions, path_str).unwrap();

    let content = std::fs::read_to_string(path_str).unwrap();
    assert!(content.contains("解析,学科,章节,难度"));
    assert!(content.contains("计算机,第一章"));

    std::fs::remove_file(&path).ok();
}
```

- [ ] **Step 2: 运行确认失败**

Run: `cargo test -p exameow-core --test export_tests test_export_csv_includes_subject_chapter`
Expected: FAIL（当前 CSV 头是 `...解析,章节,难度`，无「学科」，行内学科为空字符串，断言 `解析,学科,章节,难度` 与 `计算机,第一章` 都不成立）。

- [ ] **Step 3: 修改 Rust CSV writer**

`packages/core/src/export/writer.rs` 第 28 行：

```rust
    wtr.write_record(["题干", "题型", "选项A", "选项B", "选项C", "选项D", "选项E", "选项F", "选项G", "选项H", "正确答案", "解析", "学科", "章节", "难度"])
```

第 43-44 行：

```rust
        row.push(q.subject.clone().unwrap_or_default());
        row.push(q.chapter.clone().unwrap_or_default());
```

- [ ] **Step 4: 修改 Rust xlsx writer**

`packages/core/src/export/xlsx.rs`：
- 第 141 行 `spans="1:14"` → `spans="1:15"`。
- 标题行（第 198-201 行）：

```rust
    writer.add_string_cell(10, "正确答案\n（必填）");
    writer.add_string_cell(11, "解析\n（勿删）");
    writer.add_string_cell(12, "学科");
    writer.add_string_cell(13, "章节\n（勿删）");
    writer.add_string_cell(14, "难度");
```

- 数据行（第 245-246 行）：

```rust
        writer.add_string_cell(12, q.subject.clone().unwrap_or_default().as_str());
        writer.add_string_cell(13, q.chapter.clone().unwrap_or_default().as_str());
        writer.add_string_cell(14, "");
```

- [ ] **Step 5: 更新现有 CSV 头断言测试**

`export_tests.rs` 第 38 行改为：

```rust
    assert!(content.contains("题干,题型,选项A,选项B,选项C,选项D,选项E,选项F,选项G,选项H,正确答案,解析,学科,章节,难度"));
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cargo test -p exameow-core`
Expected: 全部通过。

- [ ] **Step 7: 提交**

```bash
git add packages/core/src/export/xlsx.rs packages/core/src/export/writer.rs packages/core/tests/export_tests.rs
git commit -m "feat(export): write subject/chapter into Rust xlsx and csv output"
```

---

### Task 5: 导出写入 subject/chapter（workers + frontend CSV）

**Files:**
- Modify: `workers/src/export.ts`
- Modify: `frontend/src/api/http.ts`
- Modify: `frontend/src/api/cf.ts`
- Modify: `frontend/src/components/practice/BankListCard.vue`（模板样例加 Subject 列）

**Interfaces:**
- Consumes: Task 1 的 `Question.subject` / `Question.chapter`
- Produces: 三处导出与 Rust 相同 15 列布局（0题干 1题型 2-9选项 10答案 11解析 12学科 13章节 14难度）。

- [ ] **Step 1: workers xlsx 导出**

`workers/src/export.ts`：
- 第 76 行 `spans="1:14"` → `spans="1:15"`。
- 第 88-89 行：

```ts
    { col: 12, value: '学科' },
    { col: 13, value: '章节\n（勿删）' },
    { col: 14, value: '难度' },
```

- 第 132-133 行：

```ts
    cells.push({ col: 12, value: q.subject || '' })
    cells.push({ col: 13, value: q.chapter || '' })
    cells.push({ col: 14, value: '' })
```

- [ ] **Step 2: workers 类型检查**

Run: `cd workers && pnpm typecheck`
Expected: 通过（`workers/src/types.ts` 的 `Question` 已有 subject/chapter）。

- [ ] **Step 3: frontend http.ts CSV**

`frontend/src/api/http.ts` 第 181 行：

```ts
  const headers = ['题干', '题型', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '选项G', '选项H', '正确答案', '解析', '学科', '章节', '难度']
```

第 195-196 行：

```ts
    q.subject || '',
    q.chapter || '',
    '',
  ])
```

- [ ] **Step 4: frontend cf.ts CSV**

`frontend/src/api/cf.ts` 第 162 行：

```ts
  const headers = ['题干', '题型', '选项A', '选项B', '选项C', '选项D', '选项E', '选项F', '选项G', '选项H', '正确答案', '解析', '学科', '章节', '难度']
```

第 176-177 行：

```ts
    q.subject || '',
    q.chapter || '',
    '',
  ])
```

- [ ] **Step 5: 模板样例加 Subject 列**

`frontend/src/components/practice/BankListCard.vue`：
- 中文样例（第 133 行 `'章节': '',` 之前）加 `'学科': '',`，即：

```ts
          '解析': 'Exameow 兼容所有 OpenAI 格式的 API，支持对接任何 OpenAI 兼容的服务商。',
          '学科': '',
          '章节': '',
          '难度': '',
```

- 英文样例（第 149 行 `'Chapter': '',` 之前）加 `'Subject': '',`，即：

```ts
          'Analysis': 'Exameow works with any OpenAI-compatible API provider.',
          'Subject': '',
          'Chapter': '',
          'Difficulty': '',
```

- [ ] **Step 6: 前端类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add workers/src/export.ts frontend/src/api/http.ts frontend/src/api/cf.ts frontend/src/components/practice/BankListCard.vue
git commit -m "feat(export): write subject/chapter into workers and frontend csv/xlsx"
```

---

### Task 6: i18n 新增筛选与导入 key（10 语言）

**Files:**
- Modify: `frontend/src/i18n/locales.ts`

**Interfaces:**
- Consumes: 无
- Produces: 新 key `practiceFilterTitle`、`practiceFilterSubject`、`practiceFilterChapter`、`practiceFilterTypes`、`practiceFilterCount`、`practiceFilterEmpty`、`practiceFilterAll`、`practiceImportColSubject`、`practiceImportColChapter`，在 `LocaleMessages` 接口与 10 个 locale 对象中均有。

- [ ] **Step 1: 接口声明加 9 个 key**

`locales.ts` 第 207 行 `practiceImportColAnalysis: string` 后加：

```ts
  practiceImportColSubject: string
  practiceImportColChapter: string
```

在 `practiceImportColChapter` 之后的某处（练习相关 key 区，如第 139 行 `practiceQuestions` 附近）加：

```ts
  practiceFilterTitle: string
  practiceFilterSubject: string
  practiceFilterChapter: string
  practiceFilterTypes: string
  practiceFilterCount: string
  practiceFilterEmpty: string
  practiceFilterAll: string
```

- [ ] **Step 2: 10 个 locale 补充翻译**

每个 locale 对象内，在 `practiceImportColAnalysis` 行之后加 `practiceImportColSubject` / `practiceImportColChapter`，在 `practiceQuestions` 行之后加 `practiceFilter*` 系列。10 语言译文如下：

| key | zh | zh-TW | en | ja | ko | es | fr | de | ru | ar |
|-----|----|----|----|----|----|----|----|----|----|----|
| practiceImportColSubject | 学科 | 學科 | Subject | 科目 | 과목 | Asignatura | Matière | Fach | Предмет | المادة |
| practiceImportColChapter | 章节 | 章節 | Chapter | 章 | 단원 | Capítulo | Chapitre | Kapitel | Глава | الفصل |
| practiceFilterTitle | 筛选题目 | 篩選題目 | Filter Questions | 問題を絞り込む | 문제 필터 | Filtrar Preguntas | Filtrer les Questions | Fragen Filtern | Фильтр Вопросов | تصفية الأسئلة |
| practiceFilterSubject | 学科 | 學科 | Subject | 科目 | 과목 | Asignatura | Matière | Fach | Предмет | المادة |
| practiceFilterChapter | 章节 | 章節 | Chapter | 章 | 단원 | Capítulo | Chapitre | Kapitel | Глава | الفصل |
| practiceFilterTypes | 题型 | 題型 | Question Types | 問題形式 | 문제 유형 | Tipos de Pregunta | Types de Questions | Fragetypen | Типы Вопросов | أنواع الأسئلة |
| practiceFilterCount | 符合条件 {n} 题 | 符合條件 {n} 題 | {n} questions match | {n} 問が該当 | {n}개 일치 | {n} preguntas coinciden | {n} questions correspondent | {n} Fragen passen | Подходит {n} вопросов | {n} سؤال مطابق |
| practiceFilterEmpty | 请至少选择一项筛选条件 | 請至少選擇一項篩選條件 | Select at least one filter | 条件を1つ以上選択してください | 필터를 하나 이상 선택하세요 | Selecciona al menos un filtro | Sélectionnez au moins un filtre | Wählen Sie mindestens einen Filter | Выберите хотя бы один фильтр | اختر فلترًا واحدًا على الأقل |
| practiceFilterAll | 全部 | 全部 | All | すべて | 전체 | Todos | Tout | Alle | Все | الكل |

在每个 locale 的 `practiceQuestions:` 行后加：

```ts
  practiceFilterTitle: '<对应译文>',
  practiceFilterSubject: '<对应译文>',
  practiceFilterChapter: '<对应译文>',
  practiceFilterTypes: '<对应译文>',
  practiceFilterCount: '<对应译文>',
  practiceFilterEmpty: '<对应译文>',
  practiceFilterAll: '<对应译文>',
```

在每个 locale 的 `practiceImportColAnalysis:` 行后加：

```ts
  practiceImportColSubject: '<对应译文>',
  practiceImportColChapter: '<对应译文>',
```

注意：`practiceFilterCount` 中保留 `{n}` 占位符（i18n `t()` 会用参数替换）。

- [ ] **Step 3: 前端类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误（接口声明与 10 个 locale 对象 key 完全匹配）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/i18n/locales.ts
git commit -m "feat(i18n): add filter and import subject/chapter strings across 10 locales"
```

---

### Task 7: 筛选逻辑（practice store）

**Files:**
- Modify: `frontend/src/stores/practice.ts`

**Interfaces:**
- Consumes: Task 1 的 `QuestionType` / `PracticeFilter`（`@exameow/shared`）、`QuestionBank`
- Produces: `startSession` 新增 `filter?: PracticeFilter` 参数（`PracticeFilter` 来自 `@exameow/shared`）。

- [ ] **Step 1: import PracticeFilter 与过滤函数**

`practice.ts` 顶部 import 区（第 3 行 `import type { ... Question }` 中加 `QuestionType, PracticeFilter`）：

```ts
import type { QuestionBank, PracticeSession, PracticeMode, MockExamConfig, Question, QuestionType, PracticeFilter } from '@exameow/shared'
```

模块级加（不再本地定义 `PracticeFilter` 接口，直接使用 shared 类型）：

```ts
function applyPracticeFilter(questions: Question[], filter?: PracticeFilter): Question[] {
  if (!filter) return questions
  const subjects = filter.subjects?.filter(Boolean)
  const chapters = filter.chapters?.filter(Boolean)
  const types = filter.types?.filter(Boolean)
  if (!subjects?.length && !chapters?.length && !types?.length) return questions
  return questions.filter(q => {
    if (types?.length && !types.includes(q.type)) return false
    // 学科：带学科的题必须命中选中学科；无学科的题（孤儿）始终通过（对应「∪ 无学科」）
    if (subjects?.length && q.subject && !subjects.includes(q.subject)) return false
    if (chapters?.length && (!q.chapter || !chapters.includes(q.chapter))) return false
    return true
  })
}
```

- [ ] **Step 2: `startSession` 加 filter 参数并在取题前过滤**

第 170 行改为：

```ts
  function startSession(bankId: string, mode: PracticeMode, mockConfig?: MockExamConfig, customQuestions?: Question[], filter?: PracticeFilter) {
    const bank = getBank(bankId)
    if (!bank) return

    const baseQuestions = customQuestions ?? applyPracticeFilter(bank.questions, filter)
    let questions: Question[]
    if (customQuestions) {
      questions = customQuestions
    } else if (mode === 'mock' && mockConfig) {
      questions = generateMockQuestions({ ...bank, questions: baseQuestions }, mockConfig)
    } else if (mode === 'sequential') {
      questions = [...baseQuestions]
    } else {
      questions = shuffleArray([...baseQuestions])
    }
```

- [ ] **Step 3: 前端类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误（其它调用 `startSession` 的地方参数兼容——`customQuestions`/`filter` 都是可选尾参）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/stores/practice.ts
git commit -m "feat(practice): support PracticeFilter in startSession for sequential/random/mock"
```

---

### Task 8: 筛选页组件 FilterBar.vue

**Files:**
- Create: `frontend/src/components/practice/FilterBar.vue`

**Interfaces:**
- Consumes: Task 1 的 `QuestionType`、Task 6 的 i18n key、`@exameow/shared` 的 `QuestionBank`
- Produces: props `bank: QuestionBank`、`modelValue: PracticeFilter`；emits `update:modelValue`、`confirm`。内部通过 `i18n.t('practiceFilterCount', { n })` 显示计数。

- [ ] **Step 1: 创建组件**

`frontend/src/components/practice/FilterBar.vue`：

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import type { QuestionBank, QuestionType, PracticeFilter } from '@exameow/shared'
import { ArrowRightIcon } from '@heroicons/vue/24/outline'

const props = defineProps<{
  bank: QuestionBank
  modelValue: PracticeFilter
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: PracticeFilter): void
  (e: 'confirm'): void
}>()

const i18n = useI18nStore()

const typeOptions = computed(() => {
  const counts: Record<string, number> = {}
  for (const q of props.bank.questions) {
    counts[q.type] = (counts[q.type] || 0) + 1
  }
  const typeKeys: Record<string, string> = {
    single_choice: 'typeSingle',
    multi_choice: 'typeMulti',
    true_false: 'typeTrueFalse',
    fill_blank: 'typeFillBlank',
    short_answer: 'typeShortAnswer',
  }
  return Object.entries(counts).map(([type, count]) => ({
    type: type as QuestionType,
    label: i18n.t(typeKeys[type] as any),
    count,
  }))
})

const subjectOptions = computed(() => {
  const set = new Set<string>()
  for (const q of props.bank.questions) {
    if (q.subject) set.add(q.subject)
  }
  return [...set]
})

const chapterOptions = computed(() => {
  const set = new Set<string>()
  const selSubjects = props.modelValue.subjects ?? []
  for (const q of props.bank.questions) {
    if (!q.chapter) continue
    if (selSubjects.length === 0) {
      set.add(q.chapter)
    } else if (!q.subject) {
      set.add(q.chapter)
    } else if (selSubjects.includes(q.subject)) {
      set.add(q.chapter)
    }
  }
  return [...set]
})

const subjectVisible = computed(() => subjectOptions.value.length > 0)
const chapterVisible = computed(() => chapterOptions.value.length > 0)

const matchedCount = computed(() => {
  const subjects = props.modelValue.subjects ?? []
  const chapters = props.modelValue.chapters ?? []
  const types = props.modelValue.types ?? []
  if (subjects.length === 0 && chapters.length === 0 && types.length === 0) {
    return props.bank.questions.length
  }
  return props.bank.questions.filter(q => {
    if (types.length && !types.includes(q.type)) return false
    if (subjects.length && q.subject && !subjects.includes(q.subject)) return false
    if (chapters.length && (!q.chapter || !chapters.includes(q.chapter))) return false
    return true
  }).length
})

const canConfirm = computed(() => matchedCount.value > 0)

function toggle(list: string[] | QuestionType[] | undefined, value: string | QuestionType): string[] | QuestionType[] | undefined {
  const arr = list ? [...list] : []
  const idx = arr.indexOf(value as any)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(value as any)
  return arr.length > 0 ? arr : undefined
}

function toggleType(value: QuestionType) {
  emit('update:modelValue', {
    ...props.modelValue,
    types: toggle(props.modelValue.types, value) as QuestionType[] | undefined,
  })
}

function toggleSubject(value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    subjects: toggle(props.modelValue.subjects, value) as string[] | undefined,
  })
}

function toggleChapter(value: string) {
  emit('update:modelValue', {
    ...props.modelValue,
    chapters: toggle(props.modelValue.chapters, value) as string[] | undefined,
  })
}

const selectedTypes = computed(() => props.modelValue.types ?? [])
const selectedSubjects = computed(() => props.modelValue.subjects ?? [])
const selectedChapters = computed(() => props.modelValue.chapters ?? [])
</script>

<template>
  <div class="space-y-5">
    <div>
      <h3 class="text-title-md font-bold tracking-tight mb-1" :style="{ color: 'rgb(var(--md-on-surface))' }">
        {{ i18n.t('practiceFilterTitle') }}
      </h3>
      <p class="text-body-sm" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">
        {{ props.bank.name }} · {{ i18n.t('practiceQuestionUnit', { n: props.bank.questions.length }) }}
      </p>
    </div>

    <div v-if="typeOptions.length">
      <div class="text-body-sm mb-2" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterTypes') }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="opt in typeOptions"
          :key="opt.type"
          class="chip-filter"
          :class="{ 'chip-filter-active': selectedTypes.includes(opt.type) }"
          @click="toggleType(opt.type)"
        >
          {{ opt.label }} ({{ opt.count }})
        </button>
      </div>
    </div>

    <div v-if="subjectVisible">
      <div class="text-body-sm mb-2" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterSubject') }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in subjectOptions"
          :key="s"
          class="chip-filter"
          :class="{ 'chip-filter-active': selectedSubjects.includes(s) }"
          @click="toggleSubject(s)"
        >
          {{ s }}
        </button>
      </div>
    </div>

    <div v-if="chapterVisible">
      <div class="text-body-sm mb-2" :style="{ color: 'rgb(var(--md-on-surface-variant))' }">{{ i18n.t('practiceFilterChapter') }}</div>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in chapterOptions"
          :key="c"
          class="chip-filter"
          :class="{ 'chip-filter-active': selectedChapters.includes(c) }"
          @click="toggleChapter(c)"
        >
          {{ c }}
        </button>
      </div>
    </div>

    <div class="flex items-center gap-3 pt-2">
      <div class="flex-1 text-body-sm" :style="{ color: canConfirm ? 'rgb(var(--md-primary))' : 'rgb(var(--md-error))' }">
        {{ canConfirm ? i18n.t('practiceFilterCount', { n: matchedCount }) : i18n.t('practiceFilterEmpty') }}
      </div>
      <button class="btn-filled" :disabled="!canConfirm" @click="emit('confirm')">
        <ArrowRightIcon class="w-4 h-4 rtl:rotate-180" />
        {{ i18n.t('practiceNextBtn') }}
      </button>
    </div>
  </div>
</template>
```

注意：`practiceQuestionUnit` key 已存在（PracticeView.vue 第 704 行用过 `i18n.t('practiceQuestionUnit', { n })`）。`chip-filter` / `chip-filter-active` / `btn-filled` 均为现有 CSS class（见 MockExamConfig.vue）。

- [ ] **Step 2: 前端类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/practice/FilterBar.vue
git commit -m "feat(practice): add FilterBar component for subject/chapter/type filtering"
```

---

### Task 9: PracticeView 集成筛选流程

**Files:**
- Modify: `frontend/src/views/PracticeView.vue`

**Interfaces:**
- Consumes: Task 7 `PracticeFilter` / `startSession(filter)`、Task 8 `FilterBar.vue`、Task 6 i18n keys
- Produces: 选库 → 筛选页（`viewState === 'filter'`）→ 模式选择 →（mock 配比）→ 开始，全程携带 `filter`。

- [ ] **Step 1: 引入 FilterBar 与类型**

`PracticeView.vue` 第 21 行 `import PracticeModeToggle ...` 后加：

```ts
import FilterBar from '@/components/practice/FilterBar.vue'
```

第 11 行 import 加 `PracticeFilter`：

```ts
import type { PracticeMode, MockExamConfig, WrongSort, PracticeFilter } from '@exameow/shared'
```

- [ ] **Step 2: viewState 加 'filter'，加 filter ref**

第 39 行：

```ts
type ViewState = 'browse' | 'filter' | 'select-mode' | 'mock-config' | 'practice' | 'result'
```

第 43 行 `selectedBankId` 后加：

```ts
const practiceFilter = ref<PracticeFilter>({})
```

- [ ] **Step 3: 选库后先进筛选页**

第 264-267 行：

```ts
function selectBank(id: string) {
  selectedBankId.value = id
  practiceFilter.value = {}
  viewState.value = 'filter'
}
```

- [ ] **Step 4: 筛选确认进入模式选择**

`handleModeSelect` 之前加：

```ts
function handleFilterConfirm() {
  viewState.value = 'select-mode'
}
```

- [ ] **Step 5: 开始练习带 filter**

第 286-291 行：

```ts
function startPractice(mode: PracticeMode) {
  if (!selectedBankId.value) return
  practiceStore.startSession(selectedBankId.value, mode, mode === 'mock' ? mockConfig.value : undefined, undefined, practiceFilter.value)
  viewState.value = 'practice'
  autoAdvancing.value = false
}
```

- [ ] **Step 6: 模拟考试配比页基于筛选后题目池**

第 238-258 行 `availableTypes` 改为基于筛选后题目计算：

```ts
const filteredQuestions = computed(() => {
  if (!selectedBankId.value) return []
  const bank = practiceStore.getBank(selectedBankId.value)
  if (!bank) return []
  const subjects = practiceFilter.value.subjects ?? []
  const chapters = practiceFilter.value.chapters ?? []
  const types = practiceFilter.value.types ?? []
  if (subjects.length === 0 && chapters.length === 0 && types.length === 0) return bank.questions
  return bank.questions.filter(q => {
    if (types.length && !types.includes(q.type)) return false
    if (subjects.length && q.subject && !subjects.includes(q.subject)) return false
    if (chapters.length && (!q.chapter || !chapters.includes(q.chapter))) return false
    return true
  })
})

const availableTypes = computed(() => {
  const counts: Record<string, number> = {}
  for (const q of filteredQuestions.value) {
    counts[q.type] = (counts[q.type] || 0) + 1
  }
  const typeKeys: Record<string, string> = {
    single_choice: 'typeSingle',
    multi_choice: 'typeMulti',
    true_false: 'typeTrueFalse',
    fill_blank: 'typeFillBlank',
    short_answer: 'typeShortAnswer',
  }
  return Object.entries(counts).map(([type, count]) => ({
    type: type as any,
    label: i18n.t(typeKeys[type] as any),
    count,
  }))
})
```

- [ ] **Step 7: 模板加筛选页**

`select-mode` 模板块之前（第 696 行 `<template v-if="isView('select-mode')">` 之前）插入：

```html
    <!-- Filter View -->
    <template v-if="isView('filter') && selectedBankId">
      <FilterBar
        :bank="practiceStore.getBank(selectedBankId)!"
        v-model="practiceFilter"
        @confirm="handleFilterConfirm"
      />
    </template>
```

- [ ] **Step 8: handleBack / handleHome 处理 'filter' 状态**

`handleBack`（第 571-595 行）开头加：

```ts
  if (viewState.value === 'filter') {
    viewState.value = 'browse'
    selectedBankId.value = null
    practiceFilter.value = {}
    return
  }
```

`handleHome`（第 541-553 行）`mockConfig.value = { typeCounts: {} }` 后加：

```ts
  practiceFilter.value = {}
```

- [ ] **Step 9: 前端类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误。

- [ ] **Step 10: 提交**

```bash
git add frontend/src/views/PracticeView.vue
git commit -m "feat(practice): integrate filter page before mode selection"
```

---

### Task 10: 全量验证

**Files:**
- 无新文件；只跑验证。

**Interfaces:**
- Consumes: 所有前序任务。

- [ ] **Step 1: Rust 测试与构建**

Run: `cargo test -p exameow-core`
Expected: 全部通过。

Run: `cargo build -p exameow-server`
Expected: 成功。

- [ ] **Step 2: workers 类型检查**

Run: `cd workers && pnpm typecheck`
Expected: 通过。

- [ ] **Step 3: frontend 类型检查与构建**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误。

Run: `cd frontend && pnpm build`
Expected: 成功。

- [ ] **Step 4: 人工冒烟清单（浏览器手动验证）**

1. 导入一份含「学科」「章节」列的 CSV/XLSX → 列映射界面自动预选学科/章节下拉。
2. 题库卡片进入 → 筛选页显示题型/学科/章节 chips，计数正确。
3. 勾选某学科 → 章节 chips 联动过滤；再勾某章节 → 计数变化。
4. 不选任何筛选 → 「符合条件 N 题」= 全部，可开始。
5. 顺序练习只含筛选后题目；随机练习同样；模拟考试配比池基于筛选后题目。
6. 导出该题库 CSV/XLSX → 含学科/章节列且值正确；再导入导出文件 → 学科/章节可识别。
7. 旧题库（无学科/章节）→ 筛选页只显示题型区块。

- [ ] **Step 5: 提交（无代码改动则跳过）**

```bash
git status
```
若 `git status` 为空，跳过提交；否则 `git add -A && git commit -m "chore: post-verification fixes"`
```
