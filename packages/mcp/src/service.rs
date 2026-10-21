use crate::bridge::SessionRegistry;
use crate::catalog;
use crate::protocol::{
    error_response, jsonrpc_id, result_response, tool_error, tool_result, INVALID_PARAMS,
    METHOD_NOT_FOUND, PROTOCOL_VERSION,
};
use crate::{core_tools, AiConfigSource};
use serde_json::{json, Value};
use std::sync::{Arc, RwLock};
use std::time::Duration;

pub struct McpInfo {
    pub name: String,
    pub version: String,
    pub instructions: String,
}

pub struct McpService {
    pub info: McpInfo,
    pub token: Arc<RwLock<String>>,
    pub config: Arc<dyn AiConfigSource>,
    pub bridge: Arc<SessionRegistry>,
}

impl McpService {
    pub fn new(
        version: impl Into<String>,
        config: Arc<dyn AiConfigSource>,
        token: impl Into<String>,
        bridge: Arc<SessionRegistry>,
    ) -> Arc<Self> {
        Arc::new(Self {
            info: McpInfo {
                name: "exameow".to_string(),
                version: version.into(),
                instructions: INSTRUCTIONS.to_string(),
            },
            token: Arc::new(RwLock::new(token.into())),
            config,
            bridge,
        })
    }

    pub fn token(&self) -> String {
        self.token.read().map(|t| (*t).clone()).unwrap_or_default()
    }

    pub fn set_token(&self, token: impl Into<String>) {
        if let Ok(mut guard) = self.token.write() {
            *guard = token.into();
        }
    }

    pub async fn handle_rpc(&self, request: Value) -> Option<Value> {
        let id = jsonrpc_id(&request);
        if request.get("jsonrpc").and_then(|v| v.as_str()) != Some("2.0") {
            return Some(error_response(
                id.unwrap_or(Value::Null),
                INVALID_PARAMS,
                "expected jsonrpc 2.0",
            ));
        }
        let Some(method) = request.get("method").and_then(|v| v.as_str()) else {
            return Some(error_response(
                id.unwrap_or(Value::Null),
                INVALID_PARAMS,
                "missing method",
            ));
        };
        let is_notification = id.is_none();

        match method {
            "initialize" => {
                let requested = request
                    .pointer("/params/protocolVersion")
                    .and_then(|v| v.as_str())
                    .unwrap_or(PROTOCOL_VERSION);
                let version = if KNOWN_PROTOCOLS.contains(&requested) {
                    requested
                } else {
                    PROTOCOL_VERSION
                };
                Some(result_response(
                    id.unwrap_or(Value::Null),
                    json!({
                        "protocolVersion": version,
                        "capabilities": { "tools": { "listChanged": false } },
                        "serverInfo": {
                            "name": self.info.name,
                            "version": self.info.version,
                        },
                        "instructions": self.info.instructions,
                    }),
                ))
            }
            "notifications/initialized" | "notifications/cancelled" => None,
            "ping" => Some(result_response(id.unwrap_or(Value::Null), json!({}))),
            "tools/list" => Some(result_response(id.unwrap_or(Value::Null), catalog::list_json())),
            "tools/call" => {
                if is_notification {
                    return None;
                }
                Some(self.call_tool(&request, id.unwrap_or(Value::Null)).await)
            }
            other => Some(error_response(
                id.unwrap_or(Value::Null),
                METHOD_NOT_FOUND,
                format!("method not found: {other}"),
            )),
        }
    }

    async fn call_tool(&self, request: &Value, id: Value) -> Value {
        let Some(name) = request
            .pointer("/params/name")
            .and_then(|v| v.as_str())
            .map(str::to_owned)
        else {
            return error_response(id, INVALID_PARAMS, "params.name is required");
        };
        if catalog::find(&name).is_none() {
            return error_response(id, INVALID_PARAMS, format!("unknown tool `{name}`"));
        }
        let args = request
            .pointer("/params/arguments")
            .cloned()
            .unwrap_or_else(|| json!({}));

        let outcome = if catalog::CORE_TOOLS.contains(&name.as_str()) {
            match core_tools::call(self.config.as_ref(), &name, &args).await {
                Ok(value) => Ok(value),
                Err(message) => Err(message),
            }
        } else {
            match self
                .bridge
                .dispatch(&name, args.clone(), BRIDGE_TIMEOUT)
                .await
            {
                Ok(value) => Ok(value),
                Err(error) => Err(format!("{}: {}", error.code, error.message)),
            }
        };

        let mut value = match outcome {
            Ok(value) => value,
            Err(message) => return result_response(id, tool_error(message)),
        };

        if name == "app_status" {
            if let Some(obj) = value.as_object_mut() {
                obj.insert("mcp_sessions".to_string(), json!(self.bridge.session_count()));
                obj.insert("mcp_version".to_string(), json!(self.info.version));
            }
        }

        // `generate_exam` optionally persists its output through the frontend.
        if name == "generate_exam"
            && args
                .get("save_to_bank")
                .and_then(|v| v.as_bool())
                .unwrap_or(false)
        {
            let questions = value.get("questions").cloned().unwrap_or_else(|| json!([]));
            let bank_name = args
                .get("bank_name")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(str::to_owned)
                .or_else(|| {
                    args.pointer("/source/path")
                        .and_then(|v| v.as_str())
                        .map(file_stem)
                })
                .unwrap_or_else(|| "AI Generated".to_string());
            match self
                .bridge
                .dispatch(
                    "create_bank",
                    json!({ "name": bank_name, "questions": questions }),
                    BRIDGE_TIMEOUT,
                )
                .await
            {
                Ok(bank) => {
                    let bank_id = bank.get("bank_id").cloned();
                    let mut merged = value;
                    if let Some(obj) = merged.as_object_mut() {
                        obj.insert("bank".to_string(), bank);
                        if let Some(bank_id) = bank_id {
                            obj.insert("bank_id".to_string(), bank_id);
                        }
                    }
                    return result_response(id, tool_result(merged));
                }
                Err(error) => {
                    let mut merged = value;
                    if let Some(obj) = merged.as_object_mut() {
                        obj.insert(
                            "bank_save_error".to_string(),
                            json!(format!("{}: {}", error.code, error.message)),
                        );
                    }
                    return result_response(id, tool_result(merged));
                }
            }
        }

        result_response(id, tool_result(value))
    }
}

const KNOWN_PROTOCOLS: &[&str] = &["2024-11-05", "2025-03-26", "2025-06-18"];
const BRIDGE_TIMEOUT: Duration = Duration::from_secs(30);

const INSTRUCTIONS: &str = "\
Exameow is a local AI exam-question generator with a built-in practice mode.

Recommended flow:
1. Call `app_status` to see the platform, whether an AI endpoint is configured, and which banks exist.
2. Use `generate_exam` to create questions from a document path, base64 document, or raw text. Defaults: 5 single-choice medium questions; pass `save_to_bank: true` to store them as a bank the user sees immediately.
3. Use `list_banks` / `get_bank` / `search_bank_questions` to inspect saved content, and `start_practice` / `submit_answer` / `finish_practice` to run the quiz mode.
4. Use `publish_exam` to create a shareable online exam code; keep the returned `admin_token` for `get_exam_results` / `delete_exam`.
5. Use `navigate` to bring the app UI to the relevant screen.

State tools (`app_status` and everything from `list_banks` onward) require the Exameow app window or a browser tab to be open and connected.";

fn file_stem(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("AI Generated")
        .to_string()
}
