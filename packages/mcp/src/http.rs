use axum::body::Bytes;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, DefaultBodyLimit, Extension, Query, State};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::sync::Arc;

use crate::bridge::{BridgeOut, SessionRegistry};
use crate::service::McpService;

pub fn router(service: Arc<McpService>) -> Router {
    Router::new()
        .route("/mcp", post(post_mcp).get(get_mcp).delete(delete_mcp))
        .route("/api/mcp/info", get(info))
        .route("/api/mcp/session", get(ws_session))
        .layer(DefaultBodyLimit::max(8 * 1024 * 1024))
        .with_state(service)
}

/// Runs the MCP endpoint until the listener fails (used by the Tauri hosts).
pub async fn serve(
    listener: tokio::net::TcpListener,
    service: Arc<McpService>,
) -> std::io::Result<()> {
    axum::serve(
        listener,
        router(service).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await
}

/// Runs the MCP endpoint until `shutdown` resolves (used by the Tauri hosts).
pub async fn serve_with_shutdown<F>(
    listener: tokio::net::TcpListener,
    service: Arc<McpService>,
    shutdown: F,
) -> std::io::Result<()>
where
    F: std::future::Future<Output = ()> + Send + 'static,
{
    axum::serve(
        listener,
        router(service).into_make_service_with_connect_info::<SocketAddr>(),
    )
    .with_graceful_shutdown(shutdown)
    .await
}

/// Bootstrap endpoint for the browser bridge: tells the app which URL/token to use.
/// Only same-origin browser requests may read it, so the token never leaks to
/// network scanners or cross-site scripts.
async fn info(State(service): State<Arc<McpService>>, headers: HeaderMap) -> Response {
    if !browser_same_origin(&headers) {
        return forbidden();
    }
    let host = headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("127.0.0.1");
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("http");
    json_response(
        StatusCode::OK,
        json!({
            "enabled": true,
            "url": format!("{scheme}://{host}/mcp"),
            "ws_url": format!("{scheme}://{host}/api/mcp/session"),
            "token": service.token(),
            "sessions": service.bridge.session_count(),
            "server_version": service.info.version,
        }),
    )
}

fn bearer(headers: &HeaderMap) -> Option<String> {
    let raw = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let (scheme, value) = raw.split_once(' ')?;
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }
    let value = value.trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

fn token_ok(service: &McpService, provided: Option<&str>) -> bool {
    let expected = service.token();
    if expected.is_empty() {
        return true;
    }
    provided.map_or(false, |value| constant_time_eq(value, &expected))
}

/// True when the TCP peer is on the loopback interface. Header values are
/// client-controlled, so only the socket address can tell local apart from LAN.
fn loopback_peer(peer: Option<&Extension<ConnectInfo<SocketAddr>>>) -> bool {
    peer.map(|Extension(ConnectInfo(addr))| addr.ip().is_loopback())
        .unwrap_or(false)
}

/// Hostname without the port, handling `[::1]:5274`.
fn hostname_of(host: &str) -> &str {
    if let Some(rest) = host.strip_prefix('[') {
        return rest.split(']').next().unwrap_or(rest);
    }
    host.split(':').next().unwrap_or(host)
}

fn is_loopback_hostname(host: &str) -> bool {
    matches!(hostname_of(host), "localhost" | "127.0.0.1" | "::1")
}

/// Keyless access is only for genuinely local requests. Requiring a loopback
/// `Host` (and a loopback/Tauri `Origin` when a browser sends one) blocks DNS
/// rebinding: after rebinding, the browser still uses the attacker's hostname.
fn keyless_ok(headers: &HeaderMap) -> bool {
    let host_ok = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
        .is_some_and(is_loopback_hostname);
    if !host_ok {
        return false;
    }
    let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) else {
        return true;
    };
    if origin == "tauri://localhost"
        || origin == "https://tauri.localhost"
        || origin == "http://tauri.localhost"
    {
        return true;
    }
    let origin_host = origin
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(origin)
        .split('/')
        .next()
        .unwrap_or("");
    is_loopback_hostname(origin_host)
}

/// Local desktop processes do not need to copy the bearer token: loopback
/// requests are trusted after the Origin/Host checks below. LAN clients still
/// need the token, because their peer address is not loopback.
fn local_request(
    service: &McpService,
    headers: &HeaderMap,
    peer: Option<&Extension<ConnectInfo<SocketAddr>>>,
) -> bool {
    token_ok(service, bearer(headers).as_deref())
        || (loopback_peer(peer) && keyless_ok(headers))
}

/// Blocks browsers on other origins from driving the local port (DNS rebinding /
/// drive-by requests). Non-browser clients send no Origin and are allowed.
fn origin_ok(headers: &HeaderMap) -> bool {
    let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) else {
        return true;
    };
    if origin == "tauri://localhost"
        || origin == "https://tauri.localhost"
        || origin == "http://tauri.localhost"
    {
        return true;
    }
    let origin_host = origin
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(origin)
        .split('/')
        .next()
        .unwrap_or("");
    let origin_hostname = origin_host.split(':').next().unwrap_or("");
    if matches!(origin_hostname, "localhost" | "127.0.0.1" | "[::1]" | "::1") {
        return true;
    }
    headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|host| host.eq_ignore_ascii_case(origin_host))
}

fn host_matches(url: &str, headers: &HeaderMap) -> bool {
    let host = url
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or("");
    headers
        .get(header::HOST)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|header_host| header_host.eq_ignore_ascii_case(host))
}

/// Requires an explicit same-origin `Origin` or `Referer`; a bare `curl` with
/// neither header cannot read the bootstrap token.
fn browser_same_origin(headers: &HeaderMap) -> bool {
    if let Some(origin) = headers.get(header::ORIGIN).and_then(|v| v.to_str().ok()) {
        if origin == "tauri://localhost"
            || origin == "https://tauri.localhost"
            || origin == "http://tauri.localhost"
        {
            return true;
        }
        return host_matches(origin, headers);
    }
    headers
        .get(header::REFERER)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|referer| host_matches(referer, headers))
}

fn unauthorized() -> Response {
    (
        StatusCode::UNAUTHORIZED,
        [(header::WWW_AUTHENTICATE, "Bearer")],
        "unauthorized",
    )
        .into_response()
}

fn forbidden() -> Response {
    (StatusCode::FORBIDDEN, "origin not allowed").into_response()
}

async fn post_mcp(
    State(service): State<Arc<McpService>>,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    if !local_request(&service, &headers, peer.as_ref()) {
        return unauthorized();
    }
    if !origin_ok(&headers) {
        return forbidden();
    }

    let value: Value = match serde_json::from_slice(&body) {
        Ok(value) => value,
        Err(error) => {
            let payload = json!({
                "jsonrpc": "2.0",
                "id": Value::Null,
                "error": { "code": crate::protocol::PARSE_ERROR, "message": error.to_string() }
            });
            return json_response(StatusCode::BAD_REQUEST, payload);
        }
    };

    let batch = value.is_array();
    let mut responses = Vec::new();
    if batch {
        for item in value.as_array().cloned().unwrap_or_default() {
            if let Some(response) = service.handle_rpc(item).await {
                responses.push(response);
            }
        }
    } else if let Some(response) = service.handle_rpc(value).await {
        responses.push(response);
    }

    if responses.is_empty() {
        return StatusCode::ACCEPTED.into_response();
    }
    let payload = if batch {
        Value::Array(responses)
    } else {
        responses.into_iter().next().unwrap_or(Value::Null)
    };
    json_response(StatusCode::OK, payload)
}

fn json_response(status: StatusCode, payload: Value) -> Response {
    (
        status,
        [(header::CONTENT_TYPE, "application/json")],
        serde_json::to_string(&payload).unwrap_or_default(),
    )
        .into_response()
}

async fn get_mcp() -> Response {
    (
        StatusCode::METHOD_NOT_ALLOWED,
        [(header::ALLOW, "POST, DELETE")],
        "This MCP endpoint only supports POST (no server-initiated SSE stream).",
    )
        .into_response()
}

async fn delete_mcp(
    State(service): State<Arc<McpService>>,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    headers: HeaderMap,
) -> Response {
    if !local_request(&service, &headers, peer.as_ref()) {
        return unauthorized();
    }
    json_response(StatusCode::OK, json!({ "ok": true }))
}

#[derive(Deserialize)]
struct TokenQuery {
    token: Option<String>,
}

async fn ws_session(
    State(service): State<Arc<McpService>>,
    peer: Option<Extension<ConnectInfo<SocketAddr>>>,
    Query(query): Query<TokenQuery>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    let provided = query.token.or_else(|| bearer(&headers));
    let allowed = token_ok(&service, provided.as_deref())
        || (loopback_peer(peer.as_ref()) && keyless_ok(&headers));
    if !allowed {
        return unauthorized();
    }
    if !origin_ok(&headers) {
        return forbidden();
    }
    ws.on_upgrade(move |socket| handle_socket(socket, service))
}

async fn handle_socket(mut socket: WebSocket, service: Arc<McpService>) {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<BridgeOut>();
    let id = uuid::Uuid::new_v4().to_string();
    let last_seen = service.bridge.register(id.clone(), tx);

    let hello = crate::bridge::SessionRegistry::hello_frame(&service.info.version);
    if socket
        .send(Message::Text(hello.to_string().into()))
        .await
        .is_err()
    {
        service.bridge.unregister(&id);
        return;
    }

    loop {
        tokio::select! {
            outgoing = rx.recv() => {
                match outgoing {
                    Some(BridgeOut::Call { id, tool, args }) => {
                        let frame = json!({ "type": "call", "id": id, "tool": tool, "args": args });
                        if socket.send(Message::Text(frame.to_string().into())).await.is_err() {
                            break;
                        }
                    }
                    None => break,
                }
            }
            incoming = socket.recv() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        SessionRegistry::touch(&last_seen);
                        service.bridge.resolve(text.as_str());
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        SessionRegistry::touch(&last_seen);
                        let _ = socket.send(Message::Pong(payload)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(_)) => break,
                    _ => {}
                }
            }
        }
    }

    service.bridge.unregister(&id);
    if !service.bridge.is_connected() {
        service.bridge.fail_pending();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hostname_handles_ports_and_ipv6() {
        assert_eq!(hostname_of("127.0.0.1:5274"), "127.0.0.1");
        assert_eq!(hostname_of("localhost:5274"), "localhost");
        assert_eq!(hostname_of("[::1]:5274"), "::1");
        assert_eq!(hostname_of("evil.com:5274"), "evil.com");
    }

    #[test]
    fn keyless_requires_a_loopback_host() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "127.0.0.1:5274".parse().unwrap());
        assert!(keyless_ok(&headers));

        headers.insert(header::HOST, "evil.com:5274".parse().unwrap());
        assert!(!keyless_ok(&headers));
    }

    #[test]
    fn keyless_rejects_cross_origin_browser_requests() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, "127.0.0.1:5274".parse().unwrap());
        headers.insert(header::ORIGIN, "http://evil.com".parse().unwrap());
        assert!(!keyless_ok(&headers));

        headers.insert(header::ORIGIN, "http://127.0.0.1:5274".parse().unwrap());
        assert!(keyless_ok(&headers));
    }
}
