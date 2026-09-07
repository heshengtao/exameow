use crate::error::CoreError;
use super::AIOptions;
use super::models::{ModelInfo, ModelsResponse};
use reqwest::header::{AUTHORIZATION, CONTENT_TYPE};

pub struct AIClient {
    client: reqwest::Client,
    endpoint: String,
    api_key: String,
    options: Option<AIOptions>,
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

    pub fn with_options(mut self, options: Option<AIOptions>) -> Result<Self, CoreError> {
        if let Some(ref options) = options { options.validate()?; }
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

    async fn post_chat(&self, mut body: serde_json::Value) -> Result<String, CoreError> {
        if let Some(ref options) = self.options { options.apply(&mut body); }
        let options = self.options.clone().unwrap_or_default();
        for attempt in 0..=options.retries {
            match self.post_chat_once(&body, options.timeout_seconds).await {
                Ok(content) => return Ok(content),
                Err((error, retryable)) => {
                    if !retryable || attempt == options.retries { return Err(error); }
                    tokio::time::sleep(std::time::Duration::from_secs(u64::from(attempt + 1))).await;
                }
            }
        }
        unreachable!()
    }

    async fn post_chat_once(&self, body: &serde_json::Value, timeout: u64) -> Result<String, (CoreError, bool)> {
        fn transport_error(error: reqwest::Error) -> (CoreError, bool) {
            let retryable = error.is_timeout() || error.is_connect() || error.is_body();
            (error.into(), retryable)
        }
        let url = format!("{}/chat/completions", self.endpoint);
        let response = self.client.post(&url)
            .header(AUTHORIZATION, format!("Bearer {}", self.api_key))
            .header(CONTENT_TYPE, "application/json")
            .json(body)
            .timeout(std::time::Duration::from_secs(timeout))
            .send().await.map_err(transport_error)?;
        let status = response.status();
        let text = response.text().await.map_err(transport_error)?;
        if !status.is_success() {
            return Err((CoreError::AI(format!("HTTP {status}: {text}")),
                status.as_u16() == 408 || status.as_u16() == 429 || status.is_server_error()));
        }
        let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| (e.into(), false))?;
        let content = json["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string();
        if content.trim().is_empty() {
            return Err((CoreError::AI("empty response from AI".into()), false));
        }
        Ok(content)
    }
}
