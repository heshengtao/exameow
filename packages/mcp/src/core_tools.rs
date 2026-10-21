use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use exameow_core::ai::{AIClient, AIRequestOptions};
use exameow_core::config::AIConfigData;
use exameow_core::exam::{
    answer_question as core_answer_question, explain_question as core_explain_question,
    generate_exam as core_generate_exam, judge_answer as core_judge_answer, ExamParams, Question,
};
use exameow_core::export::{export_csv_to_writer, export_xlsx_to_writer};
use exameow_core::fetch::fetch_pages;
use exameow_core::parser::parse_file;
use exameow_core::search::{search_web, SearchResult};
use serde_json::{json, Value};

use crate::AiConfigSource;

pub fn arg_str(args: &Value, key: &str) -> Option<String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

fn nonempty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

pub fn stored_config(source: &dyn AiConfigSource) -> AIConfigData {
    source.load().ok().flatten().unwrap_or_default()
}

/// Stored config, with env fallbacks filling only empty fields.
fn base_config(source: &dyn AiConfigSource) -> AIConfigData {
    let mut cfg = stored_config(source);
    if let Some(env) = source.env_config() {
        if cfg.endpoint.trim().is_empty() {
            cfg.endpoint = env.endpoint;
        }
        if cfg.api_key.trim().is_empty() {
            cfg.api_key = env.api_key;
        }
        if cfg.model.trim().is_empty() {
            cfg.model = env.model;
        }
    }
    cfg
}

fn resolve_config(source: &dyn AiConfigSource, args: &Value) -> Result<AIConfigData, String> {
    let mut cfg = base_config(source);
    if let Some(endpoint) = arg_str(args, "endpoint") {
        cfg.endpoint = endpoint;
    }
    if let Some(key) = arg_str(args, "api_key") {
        cfg.api_key = key;
    }
    if let Some(model) = arg_str(args, "model") {
        cfg.model = model;
    }
    if cfg.endpoint.trim().is_empty() {
        return Err("AI endpoint is not configured. Call set_config first.".to_string());
    }
    if cfg.model.trim().is_empty() {
        return Err("AI model is not configured. Call set_config first.".to_string());
    }
    Ok(cfg)
}

fn options_of(cfg: &AIConfigData, args: &Value) -> Result<AIRequestOptions, String> {
    if let Some(value) = args.get("options").filter(|v| v.is_object()) {
        return serde_json::from_value(value.clone()).map_err(|e| format!("invalid options: {e}"));
    }
    Ok(AIRequestOptions {
        max_tokens: cfg.max_tokens,
        token_parameter: cfg
            .token_parameter
            .clone()
            .unwrap_or_else(|| "max_tokens".to_string()),
        temperature: cfg.temperature,
        omit_temperature: cfg.omit_temperature,
        reasoning_effort: cfg.reasoning_effort.clone(),
        extra_prompt: cfg.extra_prompt.clone(),
        retries: cfg.retries.unwrap_or(0),
        timeout_seconds: cfg.timeout_seconds,
    })
}

fn client_for(cfg: &AIConfigData, args: &Value) -> Result<AIClient, String> {
    AIClient::new(&cfg.endpoint, &cfg.api_key)
        .with_options(Some(options_of(cfg, args)?))
        .map_err(|e| e.to_string())
}

fn redacted(cfg: &AIConfigData) -> Value {
    json!({
        "endpoint": cfg.endpoint,
        "model": cfg.model,
        "has_api_key": !cfg.api_key.trim().is_empty(),
        "max_tokens": cfg.max_tokens,
        "temperature": cfg.temperature,
        "reasoning_effort": cfg.reasoning_effort,
        "search_enabled": cfg.search.as_ref().map(|s| s.enabled).unwrap_or(false),
        "tool_rounds": cfg.search.as_ref().map(|s| s.max_tool_rounds).unwrap_or(0),
    })
}

fn search_credentials(cfg: &AIConfigData, provider: &str) -> Option<(String, String)> {
    let search = cfg.search.as_ref()?;
    let key = search
        .keys
        .get(provider)
        .cloned()
        .filter(|k| !k.trim().is_empty())
        .or_else(|| nonempty(&search.api_key))?;
    Some((provider.to_string(), key))
}

fn parse_questions(value: &Value) -> Result<Vec<Question>, String> {
    let items = value
        .as_array()
        .ok_or_else(|| "questions must be an array".to_string())?;
    let mut out = Vec::with_capacity(items.len());
    for (index, item) in items.iter().enumerate() {
        if !item.is_object() {
            return Err(format!("question #{} must be an object", index + 1));
        }
        let mut obj = item.clone();
        if obj
            .get("id")
            .and_then(|v| v.as_str())
            .map_or(true, |s| s.trim().is_empty())
        {
            obj["id"] = json!(format!("q{}", index + 1));
        }
        if obj.get("options").is_none() {
            obj["options"] = json!([]);
        }
        if obj.get("analysis").is_none() {
            obj["analysis"] = json!("");
        }
        out.push(
            serde_json::from_value(obj).map_err(|e| format!("question #{}: {e}", index + 1))?,
        );
    }
    Ok(out)
}

fn normalize_params(mut value: Value) -> Result<ExamParams, String> {
    if !value.is_object() {
        return Err("params must be an object".to_string());
    }
    if value.get("question_types").is_none() {
        value["question_types"] = json!(["single_choice"]);
    }
    if value.get("count").is_none() {
        value["count"] = json!(5);
    }
    if let Some(count) = value.get("count").and_then(|v| v.as_u64()) {
        value["count"] = json!(count.clamp(1, 50));
    }
    if value.get("difficulty").is_none() {
        value["difficulty"] = json!("medium");
    }
    if value.get("language").is_none() {
        value["language"] = json!("zh-CN");
    }
    serde_json::from_value(value).map_err(|e| format!("invalid params: {e}"))
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let mut out: String = text.chars().take(max_chars).collect();
    out.push('…');
    out
}

fn read_source(source: &Value) -> Result<String, String> {
    if let Some(text) = source
        .get("text")
        .and_then(|v| v.as_str())
        .filter(|t| !t.trim().is_empty())
    {
        return Ok(text.to_string());
    }
    if let Some(path) = arg_str(source, "path") {
        return parse_file(&path).map_err(|e| e.to_string());
    }
    if let Some(data) = arg_str(source, "base64") {
        let ext = arg_str(source, "ext").unwrap_or_else(|| "txt".to_string());
        let bytes = BASE64
            .decode(data.as_bytes())
            .map_err(|e| format!("invalid base64: {e}"))?;
        let path = std::env::temp_dir().join(format!(
            "exameow_mcp_{}.{}",
            uuid::Uuid::new_v4(),
            ext.trim_start_matches('.')
        ));
        std::fs::write(&path, &bytes).map_err(|e| format!("cannot write temp file: {e}"))?;
        let result = parse_file(path.to_string_lossy().as_ref()).map_err(|e| e.to_string());
        let _ = std::fs::remove_file(&path);
        return result;
    }
    Err("source.path, source.base64 or source.text is required".to_string())
}

pub async fn call(source: &dyn AiConfigSource, name: &str, args: &Value) -> Result<Value, String> {
    match name {
        "get_config" => Ok(redacted(&base_config(source))),
        "set_config" => {
            let mut cfg = stored_config(source);
            if let Some(endpoint) = arg_str(args, "endpoint") {
                cfg.endpoint = endpoint;
            }
            if let Some(key) = arg_str(args, "api_key") {
                cfg.api_key = key;
            }
            if let Some(model) = arg_str(args, "model") {
                cfg.model = model;
            }
            if let Some(max_tokens) = args.get("max_tokens").and_then(|v| v.as_u64()) {
                cfg.max_tokens = Some(max_tokens as u32);
            }
            if let Some(temperature) = args.get("temperature").and_then(|v| v.as_f64()) {
                cfg.temperature = Some(temperature);
            }
            if let Some(effort) = arg_str(args, "reasoning_effort") {
                cfg.reasoning_effort = Some(effort);
            }
            source.save(&cfg)?;
            Ok(redacted(&cfg))
        }
        "list_models" => {
            let cfg = resolve_config(source, args)?;
            let models = AIClient::new(&cfg.endpoint, &cfg.api_key)
                .fetch_models()
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(models).map_err(|e| e.to_string())?)
        }
        "parse_document" => {
            let text = read_source(args)?;
            let max_chars = args
                .get("max_chars")
                .and_then(|v| v.as_u64())
                .unwrap_or(20_000) as usize;
            Ok(json!({
                "chars": text.chars().count(),
                "truncated": text.chars().count() > max_chars,
                "text": truncate_chars(&text, max_chars),
            }))
        }
        "generate_exam" => {
            let params = normalize_params(args.get("params").cloned().unwrap_or(json!({})))?;
            let source_value = args.get("source").cloned().unwrap_or(json!({}));
            let text = read_source(&source_value)?;
            let cfg = resolve_config(source, args)?;
            let client = client_for(&cfg, args)?;
            let questions = core_generate_exam(&client, &text, &params, &cfg.model)
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({ "count": questions.len(), "questions": questions }))
        }
        "answer_question" => {
            let question =
                arg_str(args, "question").ok_or_else(|| "question is required".to_string())?;
            let language = arg_str(args, "language").unwrap_or_else(|| "Chinese".to_string());
            let cfg = resolve_config(source, args)?;
            let client = client_for(&cfg, args)?;
            let result = core_answer_question(&client, &question, &language, &cfg.model)
                .await
                .map_err(|e| e.to_string())?;
            Ok(json!({ "answer": result.answer, "analysis": result.analysis }))
        }
        "judge_answer" => {
            let stem = arg_str(args, "stem").ok_or_else(|| "stem is required".to_string())?;
            let reference = arg_str(args, "reference_answer")
                .ok_or_else(|| "reference_answer is required".to_string())?;
            let user_answer = arg_str(args, "user_answer")
                .ok_or_else(|| "user_answer is required".to_string())?;
            let analysis = arg_str(args, "analysis").unwrap_or_default();
            let language = arg_str(args, "language").unwrap_or_else(|| "Chinese".to_string());
            let cfg = resolve_config(source, args)?;
            let client = client_for(&cfg, args)?;
            let result = core_judge_answer(
                &client,
                &stem,
                &reference,
                &analysis,
                &user_answer,
                &language,
                &cfg.model,
            )
            .await
            .map_err(|e| e.to_string())?;
            Ok(json!({ "correct": result.correct, "feedback": result.feedback }))
        }
        "explain_question" => {
            let stem = arg_str(args, "stem").ok_or_else(|| "stem is required".to_string())?;
            let reference = arg_str(args, "reference_answer")
                .ok_or_else(|| "reference_answer is required".to_string())?;
            let analysis = arg_str(args, "analysis").unwrap_or_default();
            let language = arg_str(args, "language").unwrap_or_else(|| "Chinese".to_string());
            let cfg = resolve_config(source, args)?;
            let client = client_for(&cfg, args)?;
            let mut search_results: Vec<SearchResult> = Vec::new();
            if args
                .get("use_search")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
            {
                let provider = cfg
                    .search
                    .as_ref()
                    .and_then(|s| nonempty(&s.provider))
                    .or_else(|| Some("tavily".to_string()));
                if let Some(provider) = provider {
                    if let Some((provider, key)) = search_credentials(&cfg, &provider) {
                        if let Ok(response) =
                            search_web(&provider, &key, &stem, 5).await
                        {
                            search_results = response.results;
                        }
                    }
                }
            }
            let result = core_explain_question(
                &client,
                &stem,
                &reference,
                &analysis,
                &language,
                &cfg.model,
                &search_results,
            )
            .await
            .map_err(|e| e.to_string())?;
            Ok(json!({
                "explanation": result.explanation,
                "used_search_results": search_results.len(),
            }))
        }
        "export_questions" => {
            let questions = parse_questions(
                args.get("questions")
                    .ok_or_else(|| "questions is required".to_string())?,
            )?;
            let format = arg_str(args, "format").unwrap_or_else(|| "csv".to_string());
            let (bytes, mime, filename) = match format.as_str() {
                "csv" => {
                    let mut buf = Vec::new();
                    export_csv_to_writer(&questions, &mut buf).map_err(|e| e.to_string())?;
                    (buf, "text/csv", "exameow_questions.csv")
                }
                "xlsx" => (
                    export_xlsx_to_writer(&questions).map_err(|e| e.to_string())?,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    "exameow_questions.xlsx",
                ),
                other => return Err(format!("unsupported format `{other}` (csv|xlsx)")),
            };
            match arg_str(args, "save_path") {
                Some(path) => {
                    std::fs::write(&path, &bytes)
                        .map_err(|e| format!("cannot write `{path}`: {e}"))?;
                    Ok(json!({ "path": path, "bytes": bytes.len() }))
                }
                None => Ok(json!({
                    "filename": filename,
                    "mime": mime,
                    "bytes": bytes.len(),
                    "base64": BASE64.encode(&bytes),
                })),
            }
        }
        "web_search" => {
            let query = arg_str(args, "query").ok_or_else(|| "query is required".to_string())?;
            let cfg = base_config(source);
            let provider = arg_str(args, "provider")
                .or_else(|| cfg.search.as_ref().and_then(|s| nonempty(&s.provider)))
                .ok_or_else(|| "no search provider configured".to_string())?;
            let key = arg_str(args, "api_key")
                .or_else(|| search_credentials(&cfg, &provider).map(|(_, key)| key))
                .ok_or_else(|| format!("no API key for search provider `{provider}`"))?;
            let max = args
                .get("max_results")
                .and_then(|v| v.as_u64())
                .unwrap_or(5)
                .min(8) as u32;
            let response = search_web(&provider, &key, &query, max)
                .await
                .map_err(|e| e.to_string())?;
            Ok(serde_json::to_value(response).map_err(|e| e.to_string())?)
        }
        "fetch_page" => {
            let url = arg_str(args, "url").ok_or_else(|| "url is required".to_string())?;
            let cfg = base_config(source);
            let provider = cfg
                .search
                .as_ref()
                .and_then(|s| nonempty(&s.fetch_provider))
                .unwrap_or_else(|| "tavily".to_string());
            let key = search_credentials(&cfg, &provider)
                .map(|(_, key)| key)
                .unwrap_or_default();
            let max_chars = args
                .get("max_chars")
                .and_then(|v| v.as_u64())
                .unwrap_or(4000) as u32;
            let response = fetch_pages(&provider, &key, &[url], "extract", max_chars, 1)
                .await
                .map_err(|e| e.to_string())?;
            let page = response
                .pages
                .into_iter()
                .next()
                .ok_or_else(|| "no page content returned".to_string())?;
            Ok(json!({ "url": page.url, "title": page.title, "content": page.content }))
        }
        other => Err(format!("unknown core tool `{other}`")),
    }
}
