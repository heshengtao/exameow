use crate::error::CoreError;
use super::chat::{ChatMessage, FunctionCall, ToolCall, ToolDefinition};
use super::models::{ModelInfo, ModelsResponse};
use super::options::AIRequestOptions;
use futures_util::{Stream, StreamExt};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};
use std::pin::Pin;

#[derive(Debug, Clone)]
pub enum ChatStreamChunk {
    Text(String),
    ToolCalls(Vec<ToolCall>),
}

/// AI 请求超时(秒),默认 600s 以兼容响应较慢的自托管网关/大文档生成;
/// 可通过环境变量 AI_TIMEOUT_SECS 覆盖。请求级 options.timeout_seconds 优先。
fn ai_timeout_secs() -> u64 {
    std::env::var("AI_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(600)
}

pub struct AIClient {
    client: reqwest::Client,
    endpoint: String,
    api_key: String,
    options: Option<AIRequestOptions>,
}

impl AIClient {
    pub fn new(endpoint: &str, api_key: &str) -> Self {
        let trimmed = endpoint.trim().trim_end_matches('/');
        let stripped = trimmed
            .to_lowercase()
            .ends_with("/chat/completions")
            .then(|| &trimmed[..trimmed.len() - "/chat/completions".len()])
            .unwrap_or(trimmed);
        let endpoint = stripped.trim_end_matches('/').to_string();
        let client = reqwest::Client::builder()
            .no_proxy()
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            client,
            endpoint,
            api_key: api_key.to_string(),
            options: None,
        }
    }

    pub fn with_options(mut self, options: Option<AIRequestOptions>) -> Result<Self, CoreError> {
        if let Some(ref options) = options {
            options.validate()?;
        }
        self.options = options;
        Ok(self)
    }

    pub async fn fetch_models(&self) -> Result<Vec<ModelInfo>, CoreError> {
        let url = format!("{}/models", self.endpoint);
        let response = self
            .client
            .get(&url)
            .header(AUTHORIZATION, format!("Bearer {}", self.api_key))
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(CoreError::AI(format!("HTTP {status}: {body}")));
        }

        let models_response: ModelsResponse = response.json().await?;
        Ok(models_response.data)
    }

    pub async fn chat(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        model: &str,
    ) -> Result<String, CoreError> {
        let body = serde_json::json!({
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.7,
            "max_tokens": 16384,
        });
        self.post_chat(body).await
    }

    pub async fn chat_with_max_tokens(
        &self,
        system_prompt: &str,
        user_prompt: &str,
        model: &str,
        max_tokens: Option<u32>,
    ) -> Result<String, CoreError> {
        let mut body = serde_json::json!({
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.7,
        });
        if let Some(mt) = max_tokens {
            body["max_tokens"] = serde_json::json!(mt);
        }
        self.post_chat(body).await
    }

    pub async fn chat_with_image(
        &self,
        system_prompt: &str,
        user_text: &str,
        image_data_url: &str,
        model: &str,
    ) -> Result<String, CoreError> {
        let body = serde_json::json!({
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": [
                    {"type": "text", "text": user_text},
                    {"type": "image_url", "image_url": {"url": image_data_url}}
                ]}
            ],
            "temperature": 0.2,
            "max_tokens": 16384,
        });
        self.post_chat(body).await
    }

    /// Multi-turn chat completion from a full messages array, reusing the
    /// existing non-streaming retry / option pipeline.
    pub async fn chat_messages(
        &self,
        messages: &[ChatMessage],
        model: &str,
    ) -> Result<String, CoreError> {
        let body = serde_json::json!({
            "model": model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 16384,
        });
        self.post_chat(body).await
    }

    /// Streaming chat completion. Returns a stream of *text deltas* already
    /// parsed out of the OpenAI-compatible SSE body. Errors before the first
    /// byte surface as `Err`; in-stream failures surface as a stream item.
    pub async fn chat_messages_stream(
        &self,
        messages: Vec<ChatMessage>,
        model: &str,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<String, CoreError>> + Send>>, CoreError> {
        let mut stream = self
            .chat_messages_stream_with_tools(messages, model, Vec::new())
            .await?;
        let text = async_stream::try_stream! {
            while let Some(item) = stream.next().await {
                match item? {
                    ChatStreamChunk::Text(text) => {
                        if !text.is_empty() {
                            yield text;
                        }
                    }
                    ChatStreamChunk::ToolCalls(_) => {}
                }
            }
        };
        Ok(Box::pin(text))
    }

    /// Streaming chat completion with OpenAI-compatible tool definitions.
    /// Text deltas are yielded as they arrive; a completed `ToolCalls` chunk is
    /// yielded once the provider finishes the round.
    pub async fn chat_messages_stream_with_tools(
        &self,
        messages: Vec<ChatMessage>,
        model: &str,
        tools: Vec<ToolDefinition>,
    ) -> Result<Pin<Box<dyn Stream<Item = Result<ChatStreamChunk, CoreError>> + Send>>, CoreError> {
        let mut body = serde_json::json!({
            "model": model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 16384,
            "stream": true,
        });
        if !tools.is_empty() {
            body["tools"] = serde_json::to_value(&tools)?;
            body["tool_choice"] = serde_json::json!("auto");
        }
        if let Some(options) = self.options.as_ref() {
            options.apply(&mut body);
        }
        let timeout = self
            .options
            .as_ref()
            .and_then(|o| o.timeout_seconds)
            .unwrap_or_else(ai_timeout_secs);

        let url = format!("{}/chat/completions", self.endpoint);
        let response = self
            .client
            .post(&url)
            .header(AUTHORIZATION, format!("Bearer {}", self.api_key))
            .header(CONTENT_TYPE, "application/json")
            .json(&body)
            .timeout(std::time::Duration::from_secs(timeout))
            .send()
            .await?;

        let status = response.status();
        if !status.is_success() {
            let text = response.text().await.unwrap_or_default();
            return Err(CoreError::AI(format!("HTTP {status}: {text}")));
        }

        let mut byte_stream = response.bytes_stream();
        let stream = async_stream::try_stream! {
            let mut buffer = String::new();
            let mut tool_calls: std::collections::BTreeMap<u64, ToolCall> =
                std::collections::BTreeMap::new();
            while let Some(chunk) = byte_stream.next().await {
                let chunk = chunk?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));
                loop {
                    let Some(pos) = buffer.find('\n') else { break };
                    let line = buffer[..pos].trim_end_matches('\r').to_string();
                    buffer.drain(..=pos);
                    let Some(data) = line.strip_prefix("data:") else { continue };
                    let data = data.trim();
                    if data.is_empty() {
                        continue;
                    }
                    if data == "[DONE]" {
                        let completed = std::mem::take(&mut tool_calls);
                        if !completed.is_empty() {
                            yield ChatStreamChunk::ToolCalls(completed.into_values().collect());
                        }
                        return;
                    }
                    let Ok(value) = serde_json::from_str::<serde_json::Value>(data) else { continue };
                    if let Some(text) = value["choices"][0]["delta"]["content"].as_str() {
                        if !text.is_empty() {
                            yield ChatStreamChunk::Text(text.to_string());
                        }
                    }
                    if let Some(calls) = value["choices"][0]["delta"]["tool_calls"].as_array() {
                        for call in calls {
                            let index = call["index"].as_u64().unwrap_or(0);
                            let entry = tool_calls.entry(index).or_insert_with(|| ToolCall {
                                id: String::new(),
                                kind: "function".to_string(),
                                function: FunctionCall {
                                    name: String::new(),
                                    arguments: String::new(),
                                },
                            });
                            if let Some(id) = call["id"].as_str() {
                                if !id.is_empty() {
                                    entry.id = id.to_string();
                                }
                            }
                            if let Some(kind) = call["type"].as_str() {
                                if !kind.is_empty() {
                                    entry.kind = kind.to_string();
                                }
                            }
                            if let Some(name) = call["function"]["name"].as_str() {
                                if !name.is_empty() {
                                    entry.function.name = name.to_string();
                                }
                            }
                            if let Some(args) = call["function"]["arguments"].as_str() {
                                entry.function.arguments.push_str(args);
                            }
                        }
                    }
                }
            }
            let completed = std::mem::take(&mut tool_calls);
            if !completed.is_empty() {
                yield ChatStreamChunk::ToolCalls(completed.into_values().collect());
            }
        };

        Ok(Box::pin(stream))
    }

    async fn post_chat(&self, body: serde_json::Value) -> Result<String, CoreError> {
        let mut body = body;
        if let Some(options) = self.options.as_ref() {
            options.apply(&mut body);
        }
        let retries = self.options.as_ref().map(|o| o.retries).unwrap_or(0);
        let timeout = self
            .options
            .as_ref()
            .and_then(|o| o.timeout_seconds)
            .unwrap_or_else(ai_timeout_secs);

        let mut last_error: Option<CoreError> = None;
        for attempt in 0..=retries {
            match self.post_chat_once(&body, timeout).await {
                Ok(content) => return Ok(content),
                Err((error, retryable)) => {
                    if !retryable || attempt == retries {
                        return Err(error);
                    }
                    last_error = Some(error);
                    tokio::time::sleep(std::time::Duration::from_secs(u64::from(attempt + 1))).await;
                }
            }
        }
        Err(last_error.unwrap_or_else(|| CoreError::AI("request failed".to_string())))
    }

    async fn post_chat_once(
        &self,
        body: &serde_json::Value,
        timeout_secs: u64,
    ) -> Result<String, (CoreError, bool)> {
        fn transport_error(error: reqwest::Error) -> (CoreError, bool) {
            let retryable = error.is_timeout() || error.is_connect() || error.is_body();
            (error.into(), retryable)
        }

        let url = format!("{}/chat/completions", self.endpoint);
        let response = self
            .client
            .post(&url)
            .header(AUTHORIZATION, format!("Bearer {}", self.api_key))
            .header(CONTENT_TYPE, "application/json")
            .json(body)
            .timeout(std::time::Duration::from_secs(timeout_secs))
            .send()
            .await
            .map_err(transport_error)?;

        let status = response.status();
        let text = response.text().await.map_err(transport_error)?;

        if !status.is_success() {
            let retryable = status.as_u16() == 408
                || status.as_u16() == 429
                || status.is_server_error();
            return Err((CoreError::AI(format!("HTTP {status}: {text}")), retryable));
        }

        let json: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| (e.into(), false))?;
        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        if content.trim().is_empty() {
            return Err((CoreError::AI("empty response from AI".to_string()), false));
        }
        Ok(content)
    }
}
