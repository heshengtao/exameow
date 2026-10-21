use serde_json::{json, Value};

pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub input_schema: Value,
    pub read_only: bool,
    pub destructive: bool,
}

impl ToolDef {
    pub fn to_json(&self) -> Value {
        json!({
            "name": self.name,
            "description": self.description,
            "inputSchema": self.input_schema,
            "annotations": {
                "readOnlyHint": self.read_only,
                "destructiveHint": self.destructive,
                "idempotentHint": self.read_only,
                "openWorldHint": !self.read_only,
            }
        })
    }
}

fn question_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "id": { "type": "string", "description": "Unique id; generated if omitted" },
            "type": { "type": "string", "enum": ["single_choice", "multi_choice", "true_false", "fill_blank", "short_answer"] },
            "stem": { "type": "string" },
            "options": { "type": "array", "items": { "type": "string" }, "description": "Choice labels starting with A., B., ..." },
            "answer": { "type": "string", "description": "Correct answer, e.g. \"A\" / \"AC\" / \"正确\" / free text" },
            "analysis": { "type": "string" },
            "aiAnalysis": { "type": "string" },
            "score": { "type": "number" },
            "subject": { "type": "string" },
            "chapter": { "type": "string" },
            "difficulty": { "type": "string", "enum": ["easy", "medium", "hard"] },
            "media": { "type": "array", "items": { "type": "object", "properties": { "id": { "type": "string" }, "target": { "type": "string", "enum": ["stem", "option"] }, "optionIndex": { "type": "number" } }, "required": ["id", "target"] } }
        },
        "required": ["type", "stem", "answer"]
    })
}

fn object(properties: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": properties, "required": required })
}

pub fn catalog() -> Vec<ToolDef> {
    vec![
        ToolDef {
            name: "app_status",
            description: "Report what the running Exameow app currently has: platform, version, AI configuration status, question-bank count, active practice session and MCP session count. Call this first.",
            input_schema: object(json!({}), &[]),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "get_config",
            description: "Read the current AI provider configuration (endpoint, model, whether an API key is stored). The API key itself is never returned.",
            input_schema: object(json!({}), &[]),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "set_config",
            description: "Save the AI provider configuration used by the app (and by these tools). Only the fields you pass are changed.",
            input_schema: object(
                json!({
                    "endpoint": { "type": "string", "description": "OpenAI-compatible base URL, e.g. https://api.openai.com/v1" },
                    "api_key": { "type": "string" },
                    "model": { "type": "string" },
                    "max_tokens": { "type": "integer" },
                    "temperature": { "type": "number" },
                    "reasoning_effort": { "type": "string", "enum": ["minimal", "low", "medium", "high", "xhigh", "max", "none"] }
                }),
                &[],
            ),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "list_models",
            description: "List model ids exposed by the configured (or supplied) OpenAI-compatible endpoint.",
            input_schema: object(
                json!({
                    "endpoint": { "type": "string" },
                    "api_key": { "type": "string" }
                }),
                &[],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "parse_document",
            description: "Extract plain text from a document (PDF, DOCX, XLSX/XLS/ODS, PPTX, ODT, EPUB, CSV, HTML, TXT) either from a local path or base64 bytes.",
            input_schema: object(
                json!({
                    "path": { "type": "string", "description": "Absolute path readable by the app" },
                    "base64": { "type": "string", "description": "File bytes, base64 encoded" },
                    "ext": { "type": "string", "description": "File extension for base64 input, e.g. pdf" },
                    "max_chars": { "type": "integer", "description": "Preview length (default 20000)" }
                }),
                &[],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "generate_exam",
            description: "Generate exam questions with the app's AI pipeline. Source is a local file path, base64 document or raw text. Set save_to_bank=true to also store the result as a question bank (the app UI shows it immediately).",
            input_schema: object(
                json!({
                    "source": {
                        "type": "object",
                        "properties": {
                            "path": { "type": "string" },
                            "base64": { "type": "string" },
                            "ext": { "type": "string" },
                            "text": { "type": "string" }
                        }
                    },
                    "params": {
                        "type": "object",
                        "properties": {
                            "question_types": { "type": "array", "items": { "type": "string", "enum": ["single_choice", "multi_choice", "true_false", "fill_blank", "short_answer"] } },
                            "count": { "type": "integer", "description": "1-50, default 5" },
                            "type_counts": { "type": "object", "additionalProperties": { "type": "integer" } },
                            "difficulty": { "type": "string", "enum": ["easy", "medium", "hard"] },
                            "language": { "type": "string", "description": "e.g. zh-CN, en" },
                            "topic_filter": { "type": "string" },
                            "auto_chapter": { "type": "boolean" },
                            "custom_prompt": { "type": "string" },
                            "max_tokens": { "type": "integer" }
                        }
                    },
                    "save_to_bank": { "type": "boolean" },
                    "bank_name": { "type": "string" }
                }),
                &["source", "params"],
            ),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "answer_question",
            description: "Answer a single question (with reasoning) using the configured AI model.",
            input_schema: object(
                json!({
                    "question": { "type": "string" },
                    "language": { "type": "string" }
                }),
                &["question"],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "judge_answer",
            description: "Grade a free-text student answer against a reference answer.",
            input_schema: object(
                json!({
                    "stem": { "type": "string" },
                    "reference_answer": { "type": "string" },
                    "analysis": { "type": "string" },
                    "user_answer": { "type": "string" },
                    "language": { "type": "string" }
                }),
                &["stem", "reference_answer", "user_answer"],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "explain_question",
            description: "Produce a tutor-style explanation for a question, optionally grounded in a web search.",
            input_schema: object(
                json!({
                    "stem": { "type": "string" },
                    "reference_answer": { "type": "string" },
                    "analysis": { "type": "string" },
                    "language": { "type": "string" },
                    "use_search": { "type": "boolean" }
                }),
                &["stem", "reference_answer"],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "export_questions",
            description: "Export questions to CSV or XLSX. With save_path the file is written there; otherwise the bytes are returned base64 encoded.",
            input_schema: object(
                json!({
                    "questions": { "type": "array", "items": question_schema() },
                    "format": { "type": "string", "enum": ["csv", "xlsx"] },
                    "save_path": { "type": "string", "description": "Absolute path; extension should match format" }
                }),
                &["questions", "format"],
            ),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "web_search",
            description: "Search the web through the provider configured in the app's settings (or an explicit provider/api_key).",
            input_schema: object(
                json!({
                    "query": { "type": "string" },
                    "provider": { "type": "string", "enum": ["tavily", "deepseek", "exa", "firecrawl", "bocha"] },
                    "api_key": { "type": "string" },
                    "max_results": { "type": "integer", "description": "1-8, default 5" }
                }),
                &["query"],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "fetch_page",
            description: "Fetch and extract readable text from a public web page.",
            input_schema: object(
                json!({
                    "url": { "type": "string" },
                    "max_chars": { "type": "integer", "description": "500-20000, default 4000" }
                }),
                &["url"],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "list_banks",
            description: "List the question banks stored in the app (localStorage).",
            input_schema: object(json!({}), &[]),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "get_bank",
            description: "Read one question bank together with its questions (answers and analysis included).",
            input_schema: object(
                json!({
                    "bank_id": { "type": "string" },
                    "offset": { "type": "integer", "description": "Default 0" },
                    "limit": { "type": "integer", "description": "Default 200" }
                }),
                &["bank_id"],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "create_bank",
            description: "Create a new question bank in the app from an array of questions.",
            input_schema: object(
                json!({
                    "name": { "type": "string" },
                    "questions": { "type": "array", "items": question_schema() }
                }),
                &["name", "questions"],
            ),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "add_questions_to_bank",
            description: "Append questions to an existing bank.",
            input_schema: object(
                json!({
                    "bank_id": { "type": "string" },
                    "questions": { "type": "array", "items": question_schema() }
                }),
                &["bank_id", "questions"],
            ),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "delete_bank",
            description: "Delete a question bank and its practice progress. Requires confirm=true.",
            input_schema: object(
                json!({
                    "bank_id": { "type": "string" },
                    "confirm": { "type": "boolean" }
                }),
                &["bank_id", "confirm"],
            ),
            read_only: false,
            destructive: true,
        },
        ToolDef {
            name: "search_bank_questions",
            description: "Substring search over question stems, optionally limited to one bank.",
            input_schema: object(
                json!({
                    "query": { "type": "string" },
                    "bank_id": { "type": "string" },
                    "limit": { "type": "integer", "description": "Default 20" }
                }),
                &["query"],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "start_practice",
            description: "Start a practice session in the app (sequential, random, mock or wrong-only). Returns the session summary and the first question without its answer.",
            input_schema: object(
                json!({
                    "bank_id": { "type": "string" },
                    "mode": { "type": "string", "enum": ["sequential", "random", "mock", "wrong"] },
                    "count": { "type": "integer", "description": "Mock mode only: total questions" },
                    "type_counts": { "type": "object", "additionalProperties": { "type": "integer" }, "description": "Mock mode only" }
                }),
                &["bank_id", "mode"],
            ),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "get_practice_state",
            description: "Inspect the active practice session: progress counters and the current question.",
            input_schema: object(json!({}), &[]),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "submit_answer",
            description: "Submit an answer for the current practice question. Choice/true-false/fill-blank are graded locally; short answers can be graded by AI with use_ai_judge=true.",
            input_schema: object(
                json!({
                    "answer": { "type": "string" },
                    "use_ai_judge": { "type": "boolean" }
                }),
                &["answer"],
            ),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "finish_practice",
            description: "Finish the current practice session and return the score summary.",
            input_schema: object(json!({}), &[]),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "list_wrong_questions",
            description: "List wrong-question records (wrong count, consecutive correct count) across banks or for one bank.",
            input_schema: object(
                json!({
                    "bank_id": { "type": "string" },
                    "limit": { "type": "integer", "description": "Default 50" }
                }),
                &[],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "publish_exam",
            description: "Publish an online exam link. Pass either explicit questions or bank_ids with per-type counts/points. Windows must be within 7 days; the relay rate-limits to 20 publishes per IP per day.",
            input_schema: object(
                json!({
                    "title": { "type": "string" },
                    "start_at": { "type": "integer", "description": "Epoch milliseconds; defaults to now" },
                    "duration_minutes": { "type": "integer", "description": "Default 60" },
                    "questions": { "type": "array", "items": question_schema() },
                    "bank_ids": { "type": "array", "items": { "type": "string" } },
                    "type_counts": { "type": "object", "additionalProperties": { "type": "integer" } },
                    "points": { "type": "object", "additionalProperties": { "type": "number" } }
                }),
                &["title"],
            ),
            read_only: false,
            destructive: false,
        },
        ToolDef {
            name: "get_exam_results",
            description: "Read submissions of a published exam. Requires the per-exam admin token returned by publish_exam.",
            input_schema: object(
                json!({
                    "code": { "type": "string" },
                    "token": { "type": "string" }
                }),
                &["code", "token"],
            ),
            read_only: true,
            destructive: false,
        },
        ToolDef {
            name: "delete_exam",
            description: "Delete a published exam and its results. Requires the per-exam admin token and confirm=true.",
            input_schema: object(
                json!({
                    "code": { "type": "string" },
                    "token": { "type": "string" },
                    "confirm": { "type": "boolean" }
                }),
                &["code", "token", "confirm"],
            ),
            read_only: false,
            destructive: true,
        },
        ToolDef {
            name: "navigate",
            description: "Bring the app UI to a route so the user can see the result, e.g. /practice, /generate, /learn, /mine/records.",
            input_schema: object(
                json!({
                    "route": { "type": "string", "enum": ["/practice", "/generate", "/learn", "/search", "/search/text", "/mine", "/mine/config", "/mine/settings", "/mine/published", "/mine/joined", "/mine/records"] }
                }),
                &["route"],
            ),
            read_only: false,
            destructive: false,
        },
    ]
}

pub const CORE_TOOLS: &[&str] = &[
    "get_config",
    "set_config",
    "list_models",
    "parse_document",
    "generate_exam",
    "answer_question",
    "judge_answer",
    "explain_question",
    "export_questions",
    "web_search",
    "fetch_page",
];

pub const BRIDGE_TOOLS: &[&str] = &[
    "app_status",
    "list_banks",
    "get_bank",
    "create_bank",
    "add_questions_to_bank",
    "delete_bank",
    "search_bank_questions",
    "start_practice",
    "get_practice_state",
    "submit_answer",
    "finish_practice",
    "list_wrong_questions",
    "publish_exam",
    "get_exam_results",
    "delete_exam",
    "navigate",
];

pub fn find(name: &str) -> Option<ToolDef> {
    let mut all = catalog();
    let index = all.iter().position(|tool| tool.name == name)?;
    Some(all.swap_remove(index))
}

pub fn list_json() -> Value {
    json!({ "tools": catalog().iter().map(ToolDef::to_json).collect::<Vec<_>>() })
}
