# AI 出题的学科/章节填充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 出题生成的题目带上学科（用户手填，可选）和章节（自动=来源文件名），使导出表格的学科/章节列有值。

**Architecture:** 纯前端改动。`examStore` 新增 `subject` ref；AI 每个 batch 返回后，用 `tagQuestions()` 把 `subject`（用户输入）和 `chapter`（从 `batch.text` 首行的 `## 文件名` 前缀解析，无前缀则回退 `sourceFileName`）写入每题；ParamForm 加学科输入框。导出/保存题库复用现有 subject/chapter 支持，无需改 Rust/workers。

**Tech Stack:** Vue 3 + Pinia + TypeScript。

## Global Constraints

- 学科可选：用户不填时 `Question.subject` 为 `undefined`，导出学科列为空。
- 章节取值规则：`batch.text` 首行若匹配 `## <label>` → chapter = `<label>`；否则（单文件/无标记）→ chapter = `sourceFileName`。
- `getParams()` 不携带 subject/chapter（不发给 AI，纯前端元数据）。
- 不改 Rust / workers（subject/chapter 字段与导出已支持）。
- 验证命令：`cd frontend && pnpm run type-check`。
- i18n 10 语言（zh/zh-TW/en/ja/ko/es/fr/de/ru/ar），沿用现有逐语言手工补充模式。

---

### Task 1: exam store 支持 subject 与 tagQuestions

**Files:**
- Modify: `frontend/src/stores/exam.ts`

**Interfaces:**
- Consumes: `Question`（`@exameow/shared`）、现有 `generate()`/`reset()`
- Produces: `subject: Ref<string>`（store 属性）、`extractBatchFileLabel(text): string`、`tagQuestions(qs, batchText, sourceFileName, subject): Question[]`（均为模块级/导出，供 Task 3 使用）。

- [ ] **Step 1: 新增模块级纯函数**

在 `frontend/src/stores/exam.ts` 顶部（`ALL_TYPES` 定义之后、`useExamStore` 之前）插入：

```ts
function extractBatchFileLabel(text: string): string {
  const firstLine = text.trimStart().split('\n')[0] ?? ''
  if (firstLine.startsWith('## ')) return firstLine.slice(3).trim()
  return ''
}

function tagQuestions(qs: Question[], batchText: string, sourceFileName: string, subject: string): Question[] {
  const chapter = extractBatchFileLabel(batchText) || sourceFileName.trim() || undefined
  const subj = subject.trim() || undefined
  return qs.map(q => ({ ...q, subject: subj, chapter }))
}
```

说明：`extractBatchFileLabel(batchText)` 多文件时返回 `## 文件名`；单文件/无标记时返回空串，回退到 `sourceFileName`（单文件时它就是该文件名）。

- [ ] **Step 2: 新增 subject ref**

第 26 行 `const topicFilter = ref('')` 之后加：

```ts
  const subject = ref('')
```

- [ ] **Step 3: generate() 中打标**

第 545-552 行替换为：

```ts
        if (useDirectAI && batch.text) {
          const { callCustomAI } = await import('@/utils/aiClient')
          const questions_ = await callCustomAI(batch.text, batch, config, signal)
          questions.value.push(...tagQuestions(questions_, batch.text, sourceFileName.value, subject.value))
        } else {
          const result = await api.generateExam(fileRef, batch, config, signal)
          questions.value.push(...tagQuestions(result.questions, batch.text, sourceFileName.value, subject.value))
        }
```

- [ ] **Step 4: reset() 清空 subject**

第 580-584 行 `reset()` 内加一行：

```ts
  function reset() {
    questions.value = []
    sourceFileName.value = ''
    subject.value = ''
    try { localStorage.removeItem('exameow-questions'); localStorage.removeItem('exameow-sourcefile') } catch {}
  }
```

- [ ] **Step 5: return 导出 subject**

第 588 行 `difficulty, language, topicFilter,` 改为：

```ts
    difficulty, language, topicFilter, subject, questions, generating, generated,
```

（`subject` 加在 `topicFilter` 之后。）

- [ ] **Step 6: 类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add frontend/src/stores/exam.ts
git commit -m "feat(exam): tag AI-generated questions with subject and source-file chapter"
```

---

### Task 2: i18n 新增 genSubject / genSubjectPlaceholder（10 语言）

**Files:**
- Modify: `frontend/src/i18n/locales.ts`

**Interfaces:**
- Consumes: 无
- Produces: `genSubject: string`、`genSubjectPlaceholder: string` 在 `LocaleMessages` 接口 + 10 个 locale 对象中。

- [ ] **Step 1: 接口声明加 2 个 key**

`locales.ts` 中 `genTopic: string` / `genTopicPlaceholder: string` 声明附近（第 75-76 行）加：

```ts
  genSubject: string
  genSubjectPlaceholder: string
```

- [ ] **Step 2: 10 个 locale 补充翻译**

每个 locale 对象的 `genTopicPlaceholder:` 行之后加这两行，译文如下（`{locale}` 占位按每语言填入）：

| key | zh | zh-TW | en | ja | ko | es | fr | de | ru | ar |
|-----|----|----|----|----|----|----|----|----|----|----|
| genSubject | 学科 | 學科 | Subject | 科目 | 과목 | Asignatura | Matière | Fach | Предмет | المادة |
| genSubjectPlaceholder | 输入本次出题的学科，不填则留空 | 輸入本次出題的學科，不填則留空 | Enter the subject for this batch, leave empty to omit | この出題の科目を入力（空欄可） | 이번 출제 과목 입력 (비워도 됨) | Introduce la asignatura (opcional) | Saisissez la matière (facultatif) | Fach eingeben (optional) | Введите предмет (необязательно) | أدخل المادة (اختياري) |

在每个 locale 对象的 `genTopicPlaceholder:` 行后加：

```ts
  genSubject: '<对应译文>',
  genSubjectPlaceholder: '<对应译文>',
```

- [ ] **Step 3: 类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误（接口与 10 个 locale 对象 key 完全匹配）。

- [ ] **Step 4: 提交**

```bash
git add frontend/src/i18n/locales.ts
git commit -m "feat(i18n): add gen subject strings across 10 locales"
```

---

### Task 3: ParamForm 加学科输入框

**Files:**
- Modify: `frontend/src/components/generate/ParamForm.vue`

**Interfaces:**
- Consumes: Task 1 的 `store.subject`、Task 2 的 `genSubject` / `genSubjectPlaceholder` i18n keys
- Produces: 无新接口；用户可输入学科。

- [ ] **Step 1: 模板加输入框**

`ParamForm.vue` 第 114-121 行（`genTopic` 输入框区块）之前插入：

```html
      <div class="col-span-2">
        <label class="text-label-md font-semibold tracking-wide block mb-2" style="color: rgb(var(--md-on-surface-variant))">{{ i18n.t('genSubject') }}</label>
        <input
          v-model="store.subject"
          :placeholder="i18n.t('genSubjectPlaceholder')"
          class="input-outlined text-sm !py-3 !rounded-xl"
        />
      </div>
```

- [ ] **Step 2: 类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误（`store.subject` 来自 Task 1 的 export）。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/generate/ParamForm.vue
git commit -m "feat(generate): add subject input to generation params"
```

---

### Task 4: 全量验证

**Files:**
- 无新文件；只跑验证。

**Interfaces:**
- Consumes: 所有前序任务。

- [ ] **Step 1: 前端类型检查**

Run: `cd frontend && pnpm run type-check`
Expected: 无错误。

- [ ] **Step 2: 构建**

Run: `cd frontend && pnpm build`
Expected: 成功。

- [ ] **Step 3: Rust / workers 确认无回归（无改动，跑一次）**

Run: `cargo build`
Expected: 成功。

Run: `cd workers && pnpm typecheck`
Expected: 通过。

- [ ] **Step 4: 人工冒烟清单（浏览器手动验证）**

1. 单文件出题：不填学科 → 预览/导出 XLSX/CSV，学科列为空、章节列 = 该文件名。
2. 单文件出题：填学科「数学」 → 每题的学科 = 数学、章节 = 文件名。
3. 多文件出题：填学科 → 每题的章节 = 各自来源文件名（从 batch `## 文件` 前缀解析），学科统一。
4. 生成的题库进入练习 → 筛选页出现学科/章节 chips（验证数据真正写入了 bank）。
5. 重新开始一批（新批次）→ subject 输入框已清空。

- [ ] **Step 5: 提交（无代码改动则跳过）**

```bash
git status
```
若 `git status` 为空，跳过提交；否则 `git add -A && git commit -m "chore: post-verification fixes"`
```
