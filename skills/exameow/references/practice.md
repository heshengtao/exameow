# 题库与练习

## 题库

```bash
exameow call list_banks --json '{}'
exameow call get_bank --json '{"bank_id":"bank-xxx","offset":0,"limit":50}'
exameow call search_bank_questions --json '{"query":"极限","limit":20}'
```

- `get_bank` 返回的题目**包含答案与解析**；只给你备课，用户作答前不要贴。
- `create_bank` 需要 `name` + `questions[]`（最小字段 `type` / `stem` / `answer`）。
- `add_questions_to_bank` 追加；`delete_bank` 必须 `confirm:true`，会连带删进度。

## 开始练习

```bash
exameow call start_practice --json '{"bank_id":"bank-xxx","mode":"random"}'
```

| `mode` | 行为 |
| --- | --- |
| `sequential` | 按题库顺序；会跳过已做过的题（进度恢复） |
| `random` | 未做过的题随机排序，已做过的排后面 |
| `mock` | 模拟卷：用 `count` 或 `type_counts` 抽题 |
| `wrong` | 只练该题库的错题；没有错题会报 `no_questions` |

- `mock` 的 `type_counts`：`{"single_choice":10,"short_answer":2}`。
- 返回 session 摘要 + `current_question`（**不含答案**）。

## 当前题与进度

```bash
exameow call get_practice_state --json '{}'
```

返回：

```json
{
  "bank_id": "...",
  "mode": "random",
  "index": 3,
  "total": 20,
  "answered": 3,
  "submitted": false,
  "finished_at": null,
  "current_question": {
    "id": "q12",
    "type": "single_choice",
    "stem": "...",
    "options": ["A. ...", "B. ..."],
    "media": []
  }
}
```

- `index` 从 0 开始。
- `submitted:true` 表示当前题已作答；答案仍在 `submit_answer` 的返回里。

## 提交与判分

```bash
exameow call submit_answer --json '{"answer":"B"}'
```

- 单选：`A`；多选：`AC`；判断：`正确` / `错误`；填空：原文；简答：文本。
- 选择题 / 判断题 / 填空题在本地判分。
- 简答题默认 `is_correct:null`（待自评）。加 `use_ai_judge:true` 让 AI 判分
  （需要已配置模型）。
- 返回：`is_correct`、`correct_answer`、`analysis` + 最新 session 摘要。
- **不会自动跳题**。

## 下一题

```bash
exameow call next_question --json '{}'
```

- 讨论完再调用；返回 `at_end` 与新的 `current_question`。
- `at_end:true` 表示已经是最后一题（索引未变），此时应 `finish_practice`。
- 用户想跳过某题：直接 `next_question`，不提交（该题保持未作答）。

## 结束与总结

```bash
exameow call finish_practice --json '{}'
```

返回 `total` / `answered` / `correct` / `wrong` / `pending` / `duration_sec`。
之后可以开错题轮：`start_practice {mode:"wrong"}`。

## 错题

```bash
exameow call list_wrong_questions --json '{"bank_id":"bank-xxx","limit":50}'
```

每条含 `wrong_count`、`consecutive_correct`、`last_wrong_at`、`stem`。
连续答对若干次后记录会弱化；具体阈值由 App 管理，不要自己伪造。

## 状态与错误

| 错误码 | 含义 |
| --- | --- |
| `no_session` | 还没 `start_practice` |
| `no_questions` | 该模式没有可用题（空题库 / 无错题） |
| `not_found` | `bank_id` 不存在 |
| `invalid_args` | 参数缺失或枚举不对 |
| `app_not_connected` | App 窗口没连上 bridge |
| `app_suspended` | 窗口被挂起 / 隐藏，带到前台重试 |
