//! 极小的 MCP 客户端：只覆盖 `initialize` / `tools/list` / `tools/call` 三条消息。
//!
//! 只连本机回环地址（或显式配置的 LAN 地址），故不需要 TLS。Exameow 的 MCP 端点
//! 默认直接返回 JSON；这里也兼容 SSE 响应，方便指向其它 MCP 实现。

use std::io::{BufRead, BufReader};
use std::time::Duration;

use serde_json::{json, Value};

/// 握手时上报的客户端名。
const CLIENT_NAME: &str = "exameow";
/// 我们支持的 MCP 协议版本（与 `packages/mcp` 一致）。
const PROTOCOL_VERSION: &str = "2025-06-18";
/// 会话头：部分 MCP 服务器在 `initialize` 响应里给出，之后每个请求都要带上。
const SESSION_HEADER: &str = "Mcp-Session-Id";
/// 协议版本头（2025-06-18 规范引入）。
const VERSION_HEADER: &str = "MCP-Protocol-Version";
/// 常规请求超时：生成 / 导出这类工具会跑很久，给足。
const DEFAULT_TIMEOUT: Duration = Duration::from_secs(600);
/// 探测「软件在不在」用的短超时。
const PROBE_TIMEOUT: Duration = Duration::from_secs(2);

/// `initialize` 的请求 id。
const INIT_ID: i64 = 0;
/// `tools/list` 的请求 id。
const LIST_ID: i64 = 1;
/// `tools/call` 的请求 id。
const CALL_ID: i64 = 2;

/// 一个工具的名字与描述。
pub struct ToolInfo {
    pub name: String,
    pub description: String,
}

/// `tools/call` 的结果。
pub struct CallOutcome {
    /// 工具自己报的失败（结果里的 `isError`）。
    pub is_error: bool,
    /// 汇成一段文本的内容。
    pub text: String,
}

/// 一次 HTTP 往返的结果。
struct Reply {
    status: u16,
    session: Option<String>,
    /// 解析出的 JSON-RPC 消息（通知类响应没有正文时为 `None`）。
    message: Option<Value>,
    /// 原始正文，仅在报错时用来带出服务器原文。
    raw: String,
}

/// MCP 薄客户端：持有连接池、当前会话 id 与可选 token。
pub struct McpClient {
    agent: ureq::Agent,
    url: String,
    token: Option<String>,
    session: Option<String>,
}

impl McpClient {
    /// 连接并完成握手；成功即代表软件在运行且 MCP 可用。
    pub fn connect(url: &str, token: Option<String>) -> Result<Self, String> {
        let mut client = Self {
            agent: agent(DEFAULT_TIMEOUT),
            url: url.to_owned(),
            token,
            session: None,
        };
        client.handshake()?;
        Ok(client)
    }

    /// 只做一次握手，用来判断该地址是否可用（短超时，不抛错）。
    pub fn probe(url: &str, token: Option<String>) -> bool {
        let mut client = Self {
            agent: agent(PROBE_TIMEOUT),
            url: url.to_owned(),
            token,
            session: None,
        };
        client.handshake().is_ok()
    }

    /// 列出软件当前暴露的全部工具。
    pub fn list_tools(&self) -> Result<Vec<ToolInfo>, String> {
        let result = self.rpc("tools/list", json!({}), LIST_ID)?;
        let tools = result
            .get("tools")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Ok(tools
            .into_iter()
            .filter_map(|tool| {
                let name = tool.get("name")?.as_str()?.to_owned();
                let description = tool
                    .get("description")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_owned();
                Some(ToolInfo { name, description })
            })
            .collect())
    }

    /// 调用一个工具，参数是 JSON 对象。
    pub fn call_tool(&self, tool: &str, arguments: Value) -> Result<CallOutcome, String> {
        let result = self.rpc(
            "tools/call",
            json!({ "name": tool, "arguments": arguments }),
            CALL_ID,
        )?;
        let is_error = result
            .get("isError")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        Ok(CallOutcome {
            is_error,
            text: collect_text(&result),
        })
    }

    /// 握手：`initialize` + `notifications/initialized`。
    fn handshake(&mut self) -> Result<(), String> {
        let reply = self.post(
            &json!({
                "jsonrpc": "2.0",
                "id": INIT_ID,
                "method": "initialize",
                "params": {
                    "protocolVersion": PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": { "name": CLIENT_NAME, "version": env!("CARGO_PKG_VERSION") },
                },
            }),
            Some(INIT_ID),
        )?;
        if reply.status >= 400 {
            return Err(format!("握手失败：HTTP {}", reply.status));
        }
        if let Some(error) = reply.message.as_ref().and_then(|m| m.get("error")) {
            return Err(format!("握手被拒绝：{}", compact(error)));
        }
        self.session = reply.session;
        // 握手完成后必须通知服务器，会话才进入可用状态。
        self.post(
            &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
            None,
        )?;
        Ok(())
    }

    /// 发一条带 id 的请求，返回 `result`（出错时转成人类可读的消息）。
    fn rpc(&self, method: &str, params: Value, id: i64) -> Result<Value, String> {
        let reply = self.post(
            &json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }),
            Some(id),
        )?;
        if reply.status >= 400 {
            return Err(format!(
                "服务器返回 HTTP {}：{}",
                reply.status,
                truncate(reply.raw.trim())
            ));
        }
        let message = reply
            .message
            .ok_or_else(|| "服务器没有返回消息".to_owned())?;
        if let Some(error) = message.get("error") {
            return Err(format!("MCP 错误：{}", compact(error)));
        }
        Ok(message.get("result").cloned().unwrap_or(Value::Null))
    }

    /// 发一次 POST；`expect_id` 指定要在 SSE 流里等的响应 id。
    fn post(&self, body: &Value, expect_id: Option<i64>) -> Result<Reply, String> {
        let mut request = self
            .agent
            .post(&self.url)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json, text/event-stream")
            .header(VERSION_HEADER, PROTOCOL_VERSION);
        if let Some(token) = &self.token {
            request = request.header("Authorization", &format!("Bearer {token}"));
        }
        if let Some(session) = &self.session {
            request = request.header(SESSION_HEADER, session);
        }
        let mut response = request
            .send(body.to_string())
            .map_err(|e| format!("请求 {} 失败：{e}", self.url))?;

        let (status, session, content_type) = {
            let headers = response.headers();
            (
                response.status().as_u16(),
                headers
                    .get(SESSION_HEADER)
                    .and_then(|v| v.to_str().ok())
                    .map(str::to_owned),
                headers
                    .get("content-type")
                    .and_then(|v| v.to_str().ok())
                    .unwrap_or_default()
                    .to_owned(),
            )
        };

        let (message, raw) = if content_type.contains("text/event-stream") {
            let mut reader = BufReader::new(response.body_mut().as_reader());
            (read_sse(&mut reader, expect_id)?, String::new())
        } else {
            let text = response
                .body_mut()
                .read_to_string()
                .map_err(|e| format!("读取响应失败：{e}"))?;
            let message = if text.trim().is_empty() {
                None
            } else {
                Some(
                    serde_json::from_str(&text).map_err(|e| {
                        format!("响应不是合法 JSON：{e}（原文：{}）", truncate(&text))
                    })?,
                )
            };
            (message, text)
        };

        Ok(Reply {
            status,
            session,
            message,
            raw,
        })
    }
}

/// 建一个连接器：定超时、自己看状态码、不经代理（只连本机）。
fn agent(timeout: Duration) -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(timeout))
        .http_status_as_error(false) // 自己看状态码，好把服务器的报错原文带出来
        .proxy(None) // 只连本机，别被 HTTP_PROXY 带偏
        .build()
        .into()
}

/// 从 SSE 流里读出一条 `data:` 消息；`expect_id` 用于指名要哪条响应。
fn read_sse<R: BufRead>(reader: &mut R, expect_id: Option<i64>) -> Result<Option<Value>, String> {
    let mut data = String::new();
    loop {
        let mut line = String::new();
        let read = reader
            .read_line(&mut line)
            .map_err(|e| format!("读取响应流失败：{e}"))?;
        if read == 0 {
            return finish_event(&data, expect_id);
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            if let Some(value) = finish_event(&data, expect_id)? {
                return Ok(Some(value));
            }
            data.clear();
            continue;
        }
        if let Some(rest) = trimmed.strip_prefix("data:") {
            if !data.is_empty() {
                data.push('\n');
            }
            data.push_str(rest.strip_prefix(' ').unwrap_or(rest));
        }
    }
}

/// 解析一条 SSE 事件的 `data`；只在 id 匹配（或未指定 id）时返回。
fn finish_event(data: &str, expect_id: Option<i64>) -> Result<Option<Value>, String> {
    let data = data.trim();
    if data.is_empty() {
        return Ok(None);
    }
    let value: Value = serde_json::from_str(data).map_err(|e| format!("响应不是合法 JSON：{e}"))?;
    let matched = match expect_id {
        Some(id) => value.get("id").and_then(Value::as_i64) == Some(id),
        None => true,
    };
    Ok(matched.then_some(value))
}

/// 把工具结果里的文本内容汇成一段；没有文本就退回整个结果的 JSON。
fn collect_text(result: &Value) -> String {
    let texts: Vec<String> = result
        .get("content")
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter(|item| item.get("type").and_then(Value::as_str) == Some("text"))
                .map(|item| {
                    item.get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned()
                })
                .collect()
        })
        .unwrap_or_default();
    if texts.is_empty() {
        compact(result)
    } else {
        texts.join("\n")
    }
}

/// 紧凑 JSON（单行）。
fn compact(value: &Value) -> String {
    serde_json::to_string(value).unwrap_or_else(|_| value.to_string())
}

/// 报错时带出服务器原文：过长就截断，避免刷屏。
fn truncate(text: &str) -> String {
    const MAX: usize = 400;
    if text.chars().count() <= MAX {
        return text.to_owned();
    }
    let head: String = text.chars().take(MAX).collect();
    format!("{head}…")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_text_prefers_text_blocks() {
        let value = json!({
            "content": [{ "type": "text", "text": "hello" }],
            "structuredContent": { "ignored": true }
        });
        assert_eq!(collect_text(&value), "hello");
    }

    #[test]
    fn collect_text_falls_back_to_json() {
        let value = json!({ "ok": true });
        assert_eq!(collect_text(&value), r#"{"ok":true}"#);
    }

    #[test]
    fn sse_reads_the_matching_response() {
        let mut input = std::io::Cursor::new(
            "event: message\ndata: {\"jsonrpc\":\"2.0\",\"id\":2,\"result\":{\"ok\":true}}\n\n",
        );
        let value = read_sse(&mut input, Some(2)).unwrap().unwrap();
        assert_eq!(value.pointer("/result/ok"), Some(&Value::Bool(true)));
    }
}
