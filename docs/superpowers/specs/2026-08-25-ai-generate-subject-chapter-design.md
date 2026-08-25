# AI 出题的学科/章节填充 设计规格

日期：2026-08-25
状态：已批准（用户在 3 个设计小节逐一确认）

## 目标

AI 出题生成的题目也支持学科（subject）和章节（chapter）元数据：
- **学科**：用户在出题页手动填入（可选，不填则为空列），本次出题所有题目共用同一学科。
- **章节**：自动填充为出题依据的文档名称；多文件时每题填各自来源文件名，单文件时填该文件名。

这样 AI 生成后保存为题库、再导出的表格都带学科和章节列。

## 背景（前置功能已就绪）

上一功能「学科/章节 + 练习筛选」已完成：
- `Question` 已有可选 `subject?`/`chapter?` 字段（TS + Rust 三处同步）。
- 5 处导出（Rust xlsx/CSV、workers xlsx/CSV、frontend http/cf CSV）已写入学科/章节列（空则留空）。
- 导入解析器已支持学科/章节列映射。

因此本功能**只需在生成后填充这两个字段**，导出自动带上，无需改 Rust / workers。

## 数据流

1. 用户在 ParamForm 输入「学科」（可选）。
2. `examStore.generate()` 对每个 batch 调用 AI 后，把返回的题目标上：
   - `subject` = 用户输入的学科（空则 `undefined`）
   - `chapter` = 该 batch 来源文件名
3. 生成完成后 `saveGeneratedAsBank()` 保存题库（题目已带 subject/chapter），导出自动带上。

## 章节取值逻辑

每个 batch 的 `text` 结构：
- 多文件时，`parseInputs` 已把每个文件拼成 `## <文件名>\n<内容>`，`chunkByFileProportion` 分块时每块保留 `## <文件名>` 前缀（exam.ts:213）。因此 batch.text 首行就是来源文件名。
- 单文件时，`splitByFileSections` 对单段返回 label 空串，prefix 为空，batch.text 无 `## ` 前缀。

**取值规则（前缀优先 + 回退）**：
- 若 `batch.text` 首行匹配 `## <label>` → chapter = `<label>`
- 否则（单文件/无标记）→ chapter = `sourceFileName`（单文件时它就是该文件名）

## 前端改动

### `frontend/src/stores/exam.ts`

1. 新增 `const subject = ref('')`（与 `topicFilter` 并列，第 26 行附近）。
2. 新增模块级纯函数：

```ts
function extractBatchFileLabel(text: string): string {
  const firstLine = text.trimStart().split('\n')[0] ?? ''
  if (firstLine.startsWith('## ')) return firstLine.slice(3).trim()
  return ''
}
```

3. `generate()` 中每个 batch 生成后打标（第 545-553 行区域）：

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

模块级辅助（subject / sourceFileName 作为参数传入，避免在模块级调用 store）：

```ts
function tagQuestions(qs: Question[], batchText: string, sourceFileName: string, subject: string): Question[] {
  const chapter = extractBatchFileLabel(batchText) || sourceFileName.trim() || undefined
  const subj = subject.trim() || undefined
  return qs.map(q => ({ ...q, subject: subj, chapter }))
}
```

说明：`extractBatchFileLabel(batchText)` 多文件时返回 `## 文件名`；单文件/无标记时返回空串，回退到 `sourceFileName`（单文件时它就是该文件名）。

4. `reset()` 清空 subject（第 580-584 行）。

5. `getParams()` 不携带 subject/chapter（AI 只负责出题内容，学科/章节是前端元数据，不发给 AI）。

### `frontend/src/components/generate/ParamForm.vue`

在「知识点/章节」(genTopic) 输入框区块（第 114-121 行）上方加一个「学科」输入框：

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

## 边界情况

- 用户不填 subject → `Question.subject` 为 `undefined`，导出学科列为空 ✓
- 单文件 → chapter = 文件名（从 `sourceFileName` 取；单文件时它就是该文件名）
- 多文件 → 每题 chapter = 各自来源文件（从 batch.text 的 `## 文件名` 解析）
- 文件解析失败跳过 → 该文件无题目，不影响其他
- 图片文件 → `parseInputs` 里 label 用 `fileNameFromInput`（含扩展名处理），与现有 sourceFileName 拼接行为一致

## i18n

文件：`frontend/src/i18n/locales.ts`（10 语言）

新增 key：
- `genSubject` — 学科标签
- `genSubjectPlaceholder` — 占位文案（「输入本次出题的学科，不填则留空」类）

译文（沿用现有逐语言补充模式）：

| key | zh | zh-TW | en | ja | ko | es | fr | de | ru | ar |
|-----|----|----|----|----|----|----|----|----|----|----|
| genSubject | 学科 | 學科 | Subject | 科目 | 과목 | Asignatura | Matière | Fach | Предмет | المادة |
| genSubjectPlaceholder | 输入本次出题的学科，不填则留空 | 輸入本次出題的學科，不填則留空 | Enter the subject for this batch, leave empty to omit | この出題の科目を入力（空欄可） | 이번 출제 과목 입력 (비워도 됨) | Introduce la asignatura (opcional) | Saisissez la matière (facultatif) | Fach eingeben (optional) | Введите предмет (необязательно) | أدخل المادة (اختياري) |

## 验证

- `cd frontend && pnpm run type-check`
- `cd workers && pnpm typecheck`（无改动，应通过）
- `cargo build`（无改动，应通过）
- 人工冒烟：单文件出题 → 每题的 chapter = 文件名、subject = 输入值；多文件出题 → 每题 chapter = 各自来源文件名；不填学科 → 学科列空；导出 XLSX/CSV 验证列值。
