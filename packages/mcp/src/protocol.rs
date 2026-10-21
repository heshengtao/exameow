use serde_json::{json, Value};

/// MCP protocol revision implemented by this server (subset: tools only).
pub const PROTOCOL_VERSION: &str = "2025-06-18";

pub const PARSE_ERROR: i64 = -32700;
pub const INVALID_REQUEST: i64 = -32600;
pub const METHOD_NOT_FOUND: i64 = -32601;
pub const INVALID_PARAMS: i64 = -32602;

pub fn error_response(id: Value, code: i64, message: impl Into<String>) -> Value {
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "error": { "code": code, "message": message.into() }
    })
}

pub fn result_response(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

pub fn text_content(text: impl Into<String>) -> Value {
    json!([{ "type": "text", "text": text.into() }])
}

/// A tool execution failure is reported inside the result (MCP convention),
/// while protocol-level problems use JSON-RPC errors.
pub fn tool_error(message: impl Into<String>) -> Value {
    json!({
        "content": text_content(message),
        "isError": true
    })
}

pub fn tool_result(value: Value) -> Value {
    let text = serde_json::to_string_pretty(&value).unwrap_or_else(|_| value.to_string());
    let mut out = json!({ "content": text_content(text), "isError": false });
    if value.is_object() {
        out["structuredContent"] = value;
    }
    out
}

pub fn jsonrpc_id(req: &Value) -> Option<Value> {
    req.get("id").cloned()
}
