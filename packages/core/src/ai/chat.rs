use super::client::AIClient;
use crate::error::CoreError;
use serde::{Deserialize, Serialize};

/// A single turn of a chat-completions conversation. Shared with the Tauri
/// bridge, the Axum body and the Cloudflare Worker body.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
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
    Delta { text: String },
    Done,
    Error { message: String },
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
