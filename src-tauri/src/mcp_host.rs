use exameow_core::config::{config_dir, AIConfigData, ConfigStore};
use exameow_mcp::bridge::SessionRegistry;
use exameow_mcp::{AiConfigSource, McpService};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

const APP_NAME: &str = "Exameow";
const DEFAULT_PORT: u16 = 5274;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpSettings {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub allow_lan: bool,
    #[serde(default)]
    pub token: String,
}

fn default_port() -> u16 {
    DEFAULT_PORT
}

fn is_mobile() -> bool {
    cfg!(any(target_os = "android", target_os = "ios"))
}

impl Default for McpSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            port: DEFAULT_PORT,
            allow_lan: is_mobile(),
            token: random_token(),
        }
    }
}

fn random_token() -> String {
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn settings_path() -> Option<std::path::PathBuf> {
    config_dir(APP_NAME).ok().map(|dir| dir.join("mcp.json"))
}

fn load_settings() -> McpSettings {
    let Some(path) = settings_path() else {
        return McpSettings::default();
    };
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return McpSettings::default();
    };
    let mut settings: McpSettings = serde_json::from_str(&raw).unwrap_or_default();
    if settings.token.trim().is_empty() {
        settings.token = random_token();
    }
    if settings.port == 0 {
        settings.port = DEFAULT_PORT;
    }
    settings
}

fn save_settings(settings: &McpSettings) -> Result<(), String> {
    let path = settings_path().ok_or_else(|| "cannot resolve config directory".to_string())?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| format!("cannot write {}: {e}", path.display()))
}

#[derive(Debug, Clone, Serialize)]
pub struct McpInfoDto {
    pub enabled: bool,
    pub running: bool,
    pub port: u16,
    pub allow_lan: bool,
    pub token: String,
    pub url: String,
    pub ws_url: String,
    pub lan_url: Option<String>,
    pub lan_ws_url: Option<String>,
    pub sessions: usize,
}

struct Running {
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    service: Arc<McpService>,
}

struct NativeConfigSource {
    store: Option<ConfigStore>,
}

impl AiConfigSource for NativeConfigSource {
    fn load(&self) -> Result<Option<AIConfigData>, String> {
        match &self.store {
            Some(store) => store.load().map_err(|e| e.to_string()),
            None => Err("config store unavailable".to_string()),
        }
    }

    fn save(&self, config: &AIConfigData) -> Result<(), String> {
        match &self.store {
            Some(store) => store.save(config).map_err(|e| e.to_string()),
            None => Err("config store unavailable".to_string()),
        }
    }
}

pub struct McpHost {
    settings: Mutex<McpSettings>,
    running: Mutex<Option<Running>>,
    bridge: Arc<SessionRegistry>,
    store: Option<ConfigStore>,
    version: String,
}

impl McpHost {
    pub fn new(version: impl Into<String>) -> Self {
        Self {
            settings: Mutex::new(load_settings()),
            running: Mutex::new(None),
            bridge: Arc::new(SessionRegistry::new()),
            store: ConfigStore::new(APP_NAME).ok(),
            version: version.into(),
        }
    }

    pub fn info(&self) -> McpInfoDto {
        let settings = self.settings.lock().unwrap().clone();
        let running = self.running.lock().unwrap().as_ref().map(|r| r.service.clone());
        let sessions = self.bridge.session_count();
        let token = running
            .as_ref()
            .map(|service| service.token())
            .unwrap_or_else(|| settings.token.clone());
        let lan_ip = if settings.allow_lan {
            local_ipv4()
        } else {
            None
        };
        McpInfoDto {
            // Report the listener that is actually serving, not just the saved
            // setting, so a second app instance cannot borrow another's port.
            enabled: running.is_some(),
            running: running.is_some(),
            port: settings.port,
            allow_lan: settings.allow_lan,
            token,
            url: format!("http://127.0.0.1:{}/mcp", settings.port),
            ws_url: format!("ws://127.0.0.1:{}/api/mcp/session", settings.port),
            lan_url: lan_ip
                .as_ref()
                .map(|ip| format!("http://{ip}:{}/mcp", settings.port)),
            lan_ws_url: lan_ip
                .as_ref()
                .map(|ip| format!("ws://{ip}:{}/api/mcp/session", settings.port)),
            sessions,
        }
    }

    pub fn configure(
        &self,
        enabled: bool,
        port: Option<u16>,
        allow_lan: Option<bool>,
    ) -> Result<(), String> {
        {
            let mut settings = self.settings.lock().unwrap();
            settings.enabled = enabled;
            if let Some(port) = port {
                if port >= 1024 {
                    settings.port = port;
                }
            }
            if let Some(allow_lan) = allow_lan {
                settings.allow_lan = allow_lan;
            }
            if settings.token.trim().is_empty() {
                settings.token = random_token();
            }
            save_settings(&settings)?;
        }
        self.stop();
        if enabled {
            self.start()?;
        }
        Ok(())
    }

    pub fn start_if_enabled(&self) -> Result<(), String> {
        if self.settings.lock().unwrap().enabled {
            self.start()?;
        }
        Ok(())
    }

    pub fn regenerate_token(&self) -> Result<(), String> {
        let token = random_token();
        {
            let mut settings = self.settings.lock().unwrap();
            settings.token = token;
            save_settings(&settings)?;
        }
        // Restart so existing sessions authenticated with the old token are dropped.
        if self.running.lock().unwrap().is_some() {
            self.stop();
            self.start()?;
        }
        Ok(())
    }

    pub fn stop(&self) {
        if let Some(mut running) = self.running.lock().unwrap().take() {
            if let Some(shutdown) = running.shutdown.take() {
                let _ = shutdown.send(());
            }
        }
        self.bridge.fail_pending();
    }

    fn start(&self) -> Result<(), String> {
        let (port, allow_lan, token) = {
            let settings = self.settings.lock().unwrap();
            (settings.port, settings.allow_lan, settings.token.clone())
        };
        let bind = if allow_lan { "0.0.0.0" } else { "127.0.0.1" };
        let listener = std::net::TcpListener::bind((bind, port))
            .map_err(|e| format!("cannot listen on {bind}:{port}: {e}"))?;
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("cannot configure listener: {e}"))?;

        let source = Arc::new(NativeConfigSource {
            store: self.store.clone(),
        });
        let service = McpService::new(
            self.version.clone(),
            source,
            token,
            self.bridge.clone(),
        );
        let service_for_thread = service.clone();
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();

        std::thread::Builder::new()
            .name("exameow-mcp".to_string())
            .spawn(move || {
                let runtime = match tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        eprintln!("[mcp] cannot start runtime: {error}");
                        return;
                    }
                };
                runtime.block_on(async move {
                    let listener = match tokio::net::TcpListener::from_std(listener) {
                        Ok(listener) => listener,
                        Err(error) => {
                            eprintln!("[mcp] cannot adopt listener: {error}");
                            return;
                        }
                    };
                    tokio::select! {
                        _ = exameow_mcp::serve(listener, service_for_thread) => {}
                        _ = shutdown_rx => {}
                    }
                });
            })
            .map_err(|e| format!("cannot spawn MCP thread: {e}"))?;

        *self.running.lock().unwrap() = Some(Running {
            shutdown: Some(shutdown_tx),
            service,
        });
        Ok(())
    }
}

/// Local LAN address, discovered without sending any packet.
fn local_ipv4() -> Option<String> {
    let socket = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let address = socket.local_addr().ok()?;
    let ip = address.ip();
    if ip.is_loopback() || ip.is_unspecified() {
        None
    } else {
        Some(ip.to_string())
    }
}
