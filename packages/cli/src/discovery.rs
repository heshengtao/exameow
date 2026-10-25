//! 找到「正在运行的 Exameow」的 MCP 端点。
//!
//! 优先读 App 写下的**运行时发现文件**（`mcp-url`），读不到再退回配置里的端口。
//! 配置目录规则与 `exameow-core` 的 `config_dir("Exameow")` 一致。

use std::path::PathBuf;

/// MCP 默认监听端口；与 `src-tauri/src/mcp_host.rs` 的 `DEFAULT_PORT` 保持一致。
pub const DEFAULT_PORT: u16 = 5274;

/// 应用配置目录名（macOS `~/Library/Application Support/Exameow`）。
const APP_NAME: &str = "Exameow";

/// 应用标识符（用于 macOS 的 `open -b`）。
pub const APP_IDENTIFIER: &str = "com.exameow.app";

/// 应用名（macOS 上 `open -a` 用它启动）。
pub const APP_NAME_LABEL: &str = "Exameow";

/// 应用配置目录：与 Tauri / exameow-core 同规则。
pub fn config_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|home| {
            PathBuf::from(home)
                .join("Library/Application Support")
                .join(APP_NAME)
        })
    }
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("APPDATA").map(|dir| PathBuf::from(dir).join(APP_NAME))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".config")))
            .map(|dir| dir.join(APP_NAME))
    }
}

/// 运行时发现文件（`mcp-url`）的位置。
pub fn url_file() -> Option<PathBuf> {
    config_dir().map(|dir| dir.join("mcp-url"))
}

/// 读发现文件里记的实际地址；缺失或空白时返回 `None`。
pub fn read_url_file() -> Option<String> {
    let text = std::fs::read_to_string(url_file()?).ok()?;
    let url = text.trim();
    (!url.is_empty()).then(|| url.to_owned())
}

/// App 配置文件（`mcp.json`）：端口与 token。
pub fn settings_file() -> Option<PathBuf> {
    config_dir().map(|dir| dir.join("mcp.json"))
}

#[derive(Debug, Default, Clone)]
pub struct SavedMcp {
    pub port: u16,
    pub token: String,
}

/// 读 `mcp.json`。格式与 Tauri 端一致；坏文件按默认值处理。
pub fn read_saved_mcp() -> SavedMcp {
    let Some(path) = settings_file() else {
        return SavedMcp::default();
    };
    let Ok(raw) = std::fs::read_to_string(path) else {
        return SavedMcp::default();
    };
    let value: serde_json::Value = serde_json::from_str(&raw).unwrap_or_default();
    let port = value
        .get("port")
        .and_then(|v| v.as_u64())
        .filter(|port| (1024..=65535).contains(port))
        .map(|port| port as u16)
        .unwrap_or(DEFAULT_PORT);
    let token = value
        .get("token")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .trim()
        .to_owned();
    SavedMcp { port, token }
}

/// 默认地址（配置端口，缺失时 5274）。
pub fn default_url() -> String {
    let port = read_saved_mcp().port;
    format!("http://127.0.0.1:{port}/mcp")
}

/// 依序尝试的候选地址：环境变量覆盖 → 发现文件 → 配置端口（去重）。
pub fn candidates() -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |url: String| {
        if !url.is_empty() && !out.contains(&url) {
            out.push(url);
        }
    };
    if let Ok(url) = std::env::var("EXAMEOW_MCP_URL") {
        push(url.trim().to_owned());
    }
    if let Some(url) = read_url_file() {
        push(url);
    }
    push(default_url());
    out
}

/// MCP 访问 token：环境变量优先，其次 `mcp.json`。
///
/// 本机回环调用不需要 token（服务端对 loopback 放行）；这里读到的 token
/// 只用于显式配置了 LAN / 反向代理的场景。
pub fn token() -> Option<String> {
    if let Ok(token) = std::env::var("EXAMEOW_MCP_TOKEN") {
        let token = token.trim().to_owned();
        if !token.is_empty() {
            return Some(token);
        }
    }
    let saved = read_saved_mcp().token;
    (!saved.is_empty()).then_some(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_url_uses_the_standard_port() {
        // 不依赖本机是否有 mcp.json：端口非法时一定回退 5274。
        assert_eq!(DEFAULT_PORT, 5274);
        assert!(default_url().starts_with("http://127.0.0.1:"));
        assert!(default_url().ends_with("/mcp"));
    }

    #[test]
    fn candidates_always_end_with_the_default() {
        let candidates = candidates();
        assert_eq!(candidates.last().unwrap(), &default_url());
    }
}
