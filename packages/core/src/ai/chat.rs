use super::client::AIClient;
use crate::error::CoreError;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolDefinition {
    #[serde(rename = "type")]
    pub kind: String,
    pub function: FunctionDefinition,
}

/// A single turn of a chat-completions conversation. Shared with the Tauri
/// bridge, the Axum body and the Cloudflare Worker body. Tool-call turns use an
/// empty `content` (omitted on the wire) plus `tool_calls`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResult {
    pub reply: String,
}

/// Streamed chat events emitted to the frontend (Tauri `Channel` payload and
/// the normalized SSE frame body used by Axum / the Cloudflare Worker).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ChatEvent {
    Delta {
        text: String,
    },
    Tool {
        id: String,
        phase: String,
        name: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        ok: Option<bool>,
        #[serde(skip_serializing_if = "Option::is_none")]
        count: Option<u32>,
    },
    Done,
    Error {
        message: String,
    },
}

/// Non-streaming chat completion (fallback / tests).
pub async fn chat(
    client: &AIClient,
    messages: &[ChatMessage],
    model: &str,
) -> Result<ChatResult, CoreError> {
    let reply = client.chat_messages(messages, model).await?;
    Ok(ChatResult { reply })
}
