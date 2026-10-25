# 配置、模型与联网检索

## 读配置

```bash
exameow call get_config --json '{}'
```

返回 endpoint / model / `has_api_key` / 采样参数 / 搜索开关。**永远不会返回 API Key 本身**。

## 写配置

```bash
exameow call set_config --json '{
  "endpoint": "https://api.openai.com/v1",
  "api_key": "sk-...",
  "model": "gpt-4o",
  "max_tokens": 4096,
  "temperature": 0.7
}'
```

- 只改传入的字段。
- Key 存在 App 的加密配置里（桌面端 AES-256-GCM）。
- 不要把 Key 回显到聊天；用户粘贴后确认保存成功即可。

## 模型列表

```bash
exameow call list_models --json '{}'
# 或临时指定 endpoint / key
exameow call list_models --json '{"endpoint":"http://localhost:11434/v1"}'
```

## 无 Key 时能做什么

| 能力 | 无模型 Key |
| --- | --- |
| 浏览题库、`get_bank` | ✅ |
| `start_practice` / `get_practice_state` / `next_question` | ✅ |
| 选择题 / 判断题 / 填空题判分 | ✅ |
| `finish_practice` / 错题 | ✅ |
| 简答题 AI 判分 | ❌（可让用户自评） |
| `generate_exam` / `answer_question` / `explain_question` | ❌ |
| 发布在线考试（题库已有题） | ✅ |

所以「无 Key 也能陪刷题」：用已有题库 + 本地判分；讲解只能基于题目自带的 `analysis`。

## 联网检索

```bash
exameow call web_search --json '{"query":"...","max_results":5}'
exameow call fetch_page --json '{"url":"https://...","max_chars":4000}'
```

- 需要 App 里配置搜索 provider 与 key（Tavily / DeepSeek / Exa / Firecrawl / Bocha）。
- `explain_question` 的 `use_search:true` 会尝试联网；失败会退回模型知识。
- 不要把搜索结果当唯一事实；引用时说明来源。

## 典型配置问题

| 现象 | 处理 |
| --- | --- |
| `AI endpoint is not configured` | `set_config` 或让用户去「设置 → AI 配置」 |
| `AI model is not configured` | 同上，补 `model` |
| 401 / 403 | Key 错、过期、或端点不支持该模型 |
| 404 | 端点少了 `/v1` 或路径不对 |
| 超时 | 换更快模型 / 降 `max_tokens` / 分批 |
| 搜索 401 | 搜索 provider 的 key 与模型 key 是分开的 |
