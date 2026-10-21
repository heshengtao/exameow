use exameow_core::config::{AIConfigData, ConfigStore};
use exameow_mcp::bridge::SessionRegistry;
use exameow_mcp::{AiConfigSource, McpService};
use rand::Rng;
use std::sync::Arc;

/// Self-hosted MCP is on unless explicitly disabled.
pub fn enabled() -> bool {
    match std::env::var("MCP_ENABLED") {
        Ok(value) => !matches!(
            value.trim().to_ascii_lowercase().as_str(),
            "0" | "false" | "no" | "off"
        ),
        Err(_) => true,
    }
}

pub struct ServerConfigSource {
    store: ConfigStore,
}

impl AiConfigSource for ServerConfigSource {
    fn load(&self) -> Result<Option<AIConfigData>, String> {
        self.store.load().map_err(|e| e.to_string())
    }

    fn save(&self, config: &AIConfigData) -> Result<(), String> {
        self.store.save(config).map_err(|e| e.to_string())
    }

    fn env_config(&self) -> Option<AIConfigData> {
        let endpoint = std::env::var("AI_ENDPOINT").unwrap_or_default();
        let api_key = std::env::var("AI_API_KEY").unwrap_or_default();
        if endpoint.trim().is_empty() && api_key.trim().is_empty() {
            return None;
        }
        Some(AIConfigData {
            endpoint,
            api_key,
            model: std::env::var("AI_MODEL").unwrap_or_else(|_| "gpt-4o".to_string()),
            ..Default::default()
        })
    }
}

fn random_token() -> String {
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// `MCP_TOKEN` env → `MCP_TOKEN_FILE` (generated on first boot) → transient token.
pub fn load_token() -> String {
    if let Ok(token) = std::env::var("MCP_TOKEN") {
        let token = token.trim().to_string();
        if !token.is_empty() {
            return token;
        }
    }
    let path = std::env::var("MCP_TOKEN_FILE").unwrap_or_else(|_| "./mcp_token.txt".to_string());
    if let Ok(existing) = std::fs::read_to_string(&path) {
        let token = existing.trim().to_string();
        if !token.is_empty() {
            return token;
        }
    }
    let token = random_token();
    match std::fs::write(&path, &token) {
        Ok(()) => println!("MCP token generated at {path}"),
        Err(error) => eprintln!("Warning: could not persist MCP token to {path}: {error}"),
    }
    token
}

pub fn build(config_store: ConfigStore, version: &str) -> Arc<McpService> {
    let source = Arc::new(ServerConfigSource { store: config_store });
    let bridge = Arc::new(SessionRegistry::new());
    let token = load_token();
    McpService::new(version, source, token, bridge)
}
