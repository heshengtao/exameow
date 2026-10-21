use serde_json::{json, Value};
use std::collections::HashMap;
use std::fmt;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::sync::{mpsc, oneshot};

/// A frontend that has not sent any frame (including the 20s heartbeat) for this
/// long is treated as suspended — macOS/Android/iOS pause a hidden WebView.
const ALIVE_WINDOW_MS: u64 = 45_000;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Outgoing frames pushed to a connected frontend over its WebSocket.
#[derive(Debug)]
pub enum BridgeOut {
    Call { id: String, tool: String, args: Value },
}

#[derive(Debug)]
pub struct BridgeError {
    pub code: &'static str,
    pub message: String,
}

impl BridgeError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for BridgeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

struct Session {
    id: String,
    tx: mpsc::UnboundedSender<BridgeOut>,
    last_seen: Arc<AtomicU64>,
}

/// Connected frontend sessions plus the in-flight tool calls waiting on them.
/// Calls always go to the most recently connected session.
#[derive(Default)]
pub struct SessionRegistry {
    sessions: Mutex<Vec<Session>>,
    pending: Mutex<HashMap<String, oneshot::Sender<Result<Value, String>>>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// Returns a handle the socket task must `touch()` for every inbound frame.
    pub fn register(
        &self,
        id: String,
        tx: mpsc::UnboundedSender<BridgeOut>,
    ) -> Arc<AtomicU64> {
        let last_seen = Arc::new(AtomicU64::new(now_ms()));
        self.sessions.lock().unwrap().push(Session {
            id,
            tx,
            last_seen: last_seen.clone(),
        });
        last_seen
    }

    pub fn touch(last_seen: &AtomicU64) {
        last_seen.store(now_ms(), Ordering::Relaxed);
    }

    pub fn unregister(&self, id: &str) {
        self.sessions
            .lock()
            .unwrap()
            .retain(|session| session.id != id);
    }

    pub fn is_connected(&self) -> bool {
        !self.sessions.lock().unwrap().is_empty()
    }

    pub fn session_count(&self) -> usize {
        self.sessions.lock().unwrap().len()
    }

    /// Resolves a pending call from a `{"type":"result"}` frame.
    pub fn resolve(&self, frame: &str) {
        let Ok(value) = serde_json::from_str::<Value>(frame) else {
            return;
        };
        if value.get("type").and_then(|v| v.as_str()) != Some("result") {
            return;
        }
        let Some(id) = value.get("id").and_then(|v| v.as_str()) else {
            return;
        };
        let sender = self.pending.lock().unwrap().remove(id);
        let Some(sender) = sender else {
            return;
        };
        let payload = if value.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
            Ok(value.get("result").cloned().unwrap_or(Value::Null))
        } else {
            Err(value
                .get("error")
                .and_then(|e| e.get("message"))
                .and_then(|m| m.as_str())
                .unwrap_or("frontend tool failed")
                .to_string())
        };
        let _ = sender.send(payload);
    }

    pub async fn dispatch(
        &self,
        tool: &str,
        args: Value,
        timeout: Duration,
    ) -> Result<Value, BridgeError> {
        let target = {
            let guard = self.sessions.lock().unwrap();
            guard
                .last()
                .map(|session| (session.tx.clone(), session.last_seen.clone()))
        };
        let Some((tx, last_seen)) = target else {
            return Err(BridgeError::new(
                "app_not_connected",
                "The Exameow window is not connected. Open the app (and keep this tab in the foreground) before calling app-state tools.",
            ));
        };

        let idle_ms = now_ms().saturating_sub(last_seen.load(Ordering::Relaxed));
        if idle_ms > ALIVE_WINDOW_MS {
            return Err(BridgeError::new(
                "app_suspended",
                "The Exameow window stopped responding (hidden, minimized, or on another desktop). Bring it to the foreground and retry.",
            ));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let (result_tx, result_rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id.clone(), result_tx);

        if tx
            .send(BridgeOut::Call {
                id: id.clone(),
                tool: tool.to_string(),
                args,
            })
            .is_err()
        {
            self.pending.lock().unwrap().remove(&id);
            return Err(BridgeError::new("app_not_connected", "Bridge channel closed"));
        }

        match tokio::time::timeout(timeout, result_rx).await {
            Ok(Ok(Ok(value))) => Ok(value),
            Ok(Ok(Err(message))) => Err(BridgeError::new("tool_failed", message)),
            Ok(Err(_)) => Err(BridgeError::new("app_not_connected", "Bridge channel dropped")),
            Err(_) => {
                self.pending.lock().unwrap().remove(&id);
                Err(BridgeError::new(
                    "timeout",
                    format!("Frontend did not answer `{tool}` within {}s", timeout.as_secs()),
                ))
            }
        }
    }

    /// Called when the last socket closes so callers fail fast instead of waiting.
    pub fn fail_pending(&self) {
        let pending = std::mem::take(&mut *self.pending.lock().unwrap());
        for (_, sender) in pending {
            let _ = sender.send(Err("frontend disconnected".to_string()));
        }
    }

    pub fn hello_frame(version: &str) -> Value {
        json!({
            "type": "connected",
            "server": "exameow",
            "version": version,
            "protocol": super::protocol::PROTOCOL_VERSION,
        })
    }
}
