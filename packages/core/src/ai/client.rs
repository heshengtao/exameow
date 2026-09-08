use crate::error::CoreError;
use super::models::{ModelInfo, ModelsResponse};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};

/// AI 请求超时(秒),默认 600s 以兼容响应较慢的自托管网关/大文档生成;
/// 可通过环境变量 AI_TIMEOUT_SECS 覆盖。
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
        }
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

    async fn post_chat(&self, body: serde_json::Value) -> Result<String, CoreError> {
        let url = format!("{}/chat/completions", self.endpoint);
        let response = self
            .client
            .post(&url)
            .header(AUTHORIZATION, format!("Bearer {}", self.api_key))
            .header(CONTENT_TYPE, "application/json")
            .json(&body)
            .timeout(std::time::Duration::from_secs(ai_timeout_secs()))
            .send()
            .await?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(CoreError::AI(format!("HTTP {status}: {body}")));
        }

        let json: serde_json::Value = response.json().await?;
        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        if content.is_empty() {
            return Err(CoreError::AI("empty response from AI".to_string()));
        }
        Ok(content)
    }
}
