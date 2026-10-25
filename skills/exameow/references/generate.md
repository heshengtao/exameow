# 出题：文档 / 文本 → 题库

## 默认：用 App 的 AI 算力

出题默认调用 `generate_exam`：文档解析在 App 本地完成，题目由 **App 里配置的 AI
端点 / 模型 / Key** 生成。Harness 只负责传参数、拿回题目，**不需要自己出题**，也不消耗
Harness 的模型额度（只有返回的题目 JSON 会进入 Harness 上下文）。

标准流程：

1. `app_status` 看 `ai_configured`；
2. 已配置 → 直接 `generate_exam`，不要自己写题；
3. 未配置 → 建议用户去「设置 → AI 配置」，或按下面的「App 没配模型时」处理。

## 先看模型和材料

```bash
exameow call get_config --json '{}'
# { "endpoint": "...", "model": "...", "has_api_key": true }
```

- `has_api_key:false` → 先在 App「设置 → AI 配置」里配置，或让用户提供 endpoint/api_key
  后用 `set_config`。不要假装出题成功。
- 支持材料：PDF、DOCX、XLSX/XLS/ODS、PPTX、ODT、EPUB、CSV、HTML、TXT。
- 来源三选一：`source.path`（App 能读到的绝对路径）、`source.base64` + `source.ext`、
  `source.text`（纯文本）。

## 需要预览 / 分批时再解析

**默认不需要这一步**：直接把 `source.path`（或 `source.base64`）交给 `generate_exam`，
App 会在本地解析，全文不会进入 Harness 上下文。

只有下面几种情况才调用 `parse_document`：

- 用户想先看材料内容 / 确认解析是否成功；
- 文档太长，需要按章节切分后分批生成；
- `generate_exam` 报解析为空。

```bash
exameow call parse_document --json '{"path":"/abs/notes.pdf","max_chars":20000}'
```

返回 `chars` / `truncated` / `text`。注意：`text` 会进入 Harness 上下文，长文档只取需要的片段。

## 生成

```bash
exameow call generate_exam --json '{
  "source": { "path": "/abs/notes.pdf" },
  "params": {
    "question_types": ["single_choice", "true_false"],
    "type_counts": { "single_choice": 10, "true_false": 5 },
    "difficulty": "medium",
    "language": "zh-CN",
    "topic_filter": "第三章",
    "auto_chapter": true
  },
  "save_to_bank": true,
  "bank_name": "高数 · 第三章"
}'
```

### `params`

| 字段 | 说明 |
| --- | --- |
| `question_types` | `single_choice` / `multi_choice` / `true_false` / `fill_blank` / `short_answer` |
| `count` | 1–50，默认 5；与 `type_counts` 二选一 |
| `type_counts` | 精确指定每种题型的数量 |
| `difficulty` | `easy` / `medium` / `hard` |
| `language` | 例如 `zh-CN`、`en`；决定题干语言 |
| `topic_filter` | 只出某章 / 某主题的题 |
| `auto_chapter` | 自动按材料结构标注章节（依赖 App 版本支持） |
| `custom_prompt` | 额外的出题要求（谨慎使用，别覆盖输出格式约束） |
| `max_tokens` | 单次生成的 token 上限 |

### 保存与返回

- `save_to_bank:true`：把结果写进 App 的题库，返回 `bank` 与 `bank_id`，界面立即可见。
- `bank_name` 省略时用来源文件名。
- 不保存时只返回 `{count, questions}`；要保存也可以随后 `create_bank`。

## 分批（长材料 / 很多题）

1. 只有需要分批时才 `parse_document` 看 `text` 与 `chars`（全文会进入上下文）。
2. 按章节 / 标题 / 表格边界切分（保留 Markdown 结构），每批约 1–3 万字。
3. 每批 `generate_exam`，第一批 `save_to_bank:true`，后续用
   `add_questions_to_bank` 追加到同一个 `bank_id`。
4. 每批返回后检查题型数量与重复题干；重复多就换 `topic_filter` 或降低 `count`。

> 能不分批就不分批：每次 `generate_exam` 的生成算力都在 App 侧，Harness 只接收题目 JSON。

## App 没配模型时（仅限用户同意）

这是**例外路径**，不要在 `ai_configured:true` 时使用，也不要默认自己写题。
只有 App 没配模型、且用户明确同意时，才由 Harness 自己出题：

1. `parse_document` 取材料文本；
2. 自己按 `question_schema` 出题（`type` / `stem` / `options` / `answer` / `analysis`）；
3. `create_bank` 存进 App（或 `add_questions_to_bank` 追加）。

这样「出题」不依赖 App 的 AI Key；练习、判分、错题、导出仍然走 App。

## 导出

```bash
# 写到文件（推荐）
exameow call export_questions --json '{
  "questions": [...],
  "format": "xlsx",
  "save_path": "/abs/exam.xlsx"
}'

# 或拿 base64 自己落盘
exameow call export_questions --json '{ "questions": [...], "format": "csv" }'
```

- CSV 不包含图片；需要图片用 XLSX。
- 题目对象的最小字段：`type`、`stem`、`answer`；选项以 `A.` `B.` 开头。
- 导出不会自动存库；要留存先 `create_bank`。

## 常见失败

| 返回 | 处理 |
| --- | --- |
| `AI endpoint is not configured` | `set_config` 或让用户在设置里填 |
| 解析为空 / 字符很少 | 扫描版 PDF 需要 OCR；换文本版或先让用户转文本 |
| 题型不符合 | 用 `type_counts` 精确指定；检查模型是否支持该题型 |
| 超时 | 降低 `count` / 分批 / 缩短材料 |
| 题干重复 | 降 `count`、加 `topic_filter`、换批次材料 |
