use crate::error::CoreError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AIOptions {
    pub thinking: String,
    pub reasoning_effort: String,
    pub max_tokens: u32,
    pub token_parameter: String,
    pub temperature: Option<f64>,
    pub prompt: String,
    pub timeout_seconds: u64,
    pub retries: u32,
}

impl Default for AIOptions {
    fn default() -> Self {
        Self {
            thinking: "auto".into(), reasoning_effort: "medium".into(), max_tokens: 16384,
            token_parameter: "max_tokens".into(), temperature: Some(0.7), prompt: String::new(),
            timeout_seconds: 120, retries: 0,
        }
    }
}

impl AIOptions {
    pub fn validate(&self) -> Result<(), CoreError> {
        if !["auto", "on", "off"].contains(&self.thinking.as_str())
            || !["minimal", "low", "medium", "high", "xhigh", "max"].contains(&self.reasoning_effort.as_str())
            || !["max_tokens", "max_completion_tokens"].contains(&self.token_parameter.as_str())
            || !(1..=1_000_000).contains(&self.max_tokens)
            || self.temperature.is_some_and(|v| !v.is_finite() || !(0.0..=2.0).contains(&v))
            || !(1..=3600).contains(&self.timeout_seconds) || self.retries > 5
            || self.prompt.encode_utf16().count() > 20000
        {
            return Err(CoreError::Config("Invalid AI options".into()));
        }
        Ok(())
    }

    pub fn apply(&self, body: &mut serde_json::Value) {
        body.as_object_mut().unwrap().remove("max_tokens");
        body[&self.token_parameter] = self.max_tokens.into();
        if let Some(temperature) = self.temperature {
            body["temperature"] = temperature.into();
        } else {
            body.as_object_mut().unwrap().remove("temperature");
        }
        if self.thinking != "auto" {
            body["reasoning_effort"] = if self.thinking == "off" { "none" } else { &self.reasoning_effort }.into();
        }
        if !self.prompt.trim().is_empty() {
            let system = body["messages"][0]["content"].as_str().unwrap_or_default();
            body["messages"][0]["content"] = format!("{system}\n\n## Additional user instructions\n{}\n\nFollow the required output format above.", self.prompt.trim()).into();
        }
    }
}
