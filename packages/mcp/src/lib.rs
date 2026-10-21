pub mod bridge;
pub mod catalog;
pub mod core_tools;
mod http;
pub mod protocol;
mod service;

pub use http::{router, serve, serve_with_shutdown};
pub use service::{McpInfo, McpService};

use exameow_core::config::AIConfigData;

/// Host-provided AI configuration storage (encrypted ConfigStore on desktop/mobile,
/// server config store on the Axum backend).
pub trait AiConfigSource: Send + Sync {
    fn load(&self) -> Result<Option<AIConfigData>, String>;
    fn save(&self, config: &AIConfigData) -> Result<(), String>;
    /// Optional environment fallback, used by the self-hosted server.
    fn env_config(&self) -> Option<AIConfigData> {
        None
    }
}
