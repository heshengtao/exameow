use exameow_core::ai::{AIClient, AIOptions};
use serde_json::{json, Value};
use std::{io::{Read, Write}, net::TcpListener, sync::{Arc, Mutex}, thread, time::Duration};

fn server(statuses: Vec<u16>, delay_body: bool) -> (String, Arc<Mutex<Vec<Value>>>, thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let endpoint = format!("http://{}", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let received = requests.clone();
    let handle = thread::spawn(move || {
        for status in statuses {
            let (mut stream, _) = listener.accept().unwrap();
            stream.set_read_timeout(Some(Duration::from_secs(5))).unwrap();
            let mut bytes = Vec::new();
            let mut buffer = [0; 4096];
            loop {
                let n = stream.read(&mut buffer).unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buffer[..n]);
                if let Some(end) = bytes.windows(4).position(|w| w == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&bytes[..end]).to_lowercase();
                    let len: usize = headers.lines().find_map(|line| line.strip_prefix("content-length: ")).unwrap().parse().unwrap();
                    if bytes.len() >= end + 4 + len {
                        received.lock().unwrap().push(serde_json::from_slice(&bytes[end + 4..end + 4 + len]).unwrap());
                        break;
                    }
                }
            }
            let body = json!({"choices":[{"message":{"content":"ok"}}]}).to_string();
            write!(stream, "HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n", body.len()).unwrap();
            if delay_body { thread::sleep(Duration::from_millis(1300)); }
            let _ = stream.write_all(body.as_bytes());
        }
    });
    (endpoint, requests, handle)
}

#[test]
fn old_config_and_validation() {
    let defaults: AIOptions = serde_json::from_value(json!({})).unwrap();
    assert_eq!(defaults.temperature, Some(0.7));
    assert_eq!(defaults.retries, 0);
    let omit: AIOptions = serde_json::from_value(json!({"temperature":null})).unwrap();
    assert_eq!(omit.temperature, None);
    assert!(AIOptions { retries: 6, ..defaults.clone() }.validate().is_err());
    assert!(AIOptions { max_tokens: 0, ..defaults }.validate().is_err());
}

#[tokio::test]
async fn sends_options_and_retries_transient_errors() {
    let (endpoint, requests, handle) = server(vec![503, 200], false);
    let options = AIOptions { thinking: "on".into(), reasoning_effort: "high".into(), temperature: None,
        max_tokens: 2048, token_parameter: "max_completion_tokens".into(), prompt: "Explain carefully".into(), retries: 1, ..AIOptions::default() };
    let client = AIClient::new(&endpoint, "test").with_options(Some(options)).unwrap();
    assert_eq!(client.chat("Return JSON", "Question", "test-model").await.unwrap(), "ok");
    handle.join().unwrap();
    let requests = requests.lock().unwrap();
    assert_eq!(requests.len(), 2);
    assert_eq!(requests[0], requests[1]);
    assert_eq!(requests[0]["reasoning_effort"], "high");
    assert_eq!(requests[0]["max_completion_tokens"], 2048);
    assert!(requests[0].get("max_tokens").is_none());
    assert!(requests[0].get("temperature").is_none());
    let prompt = requests[0]["messages"][0]["content"].as_str().unwrap();
    assert!(prompt.starts_with("Return JSON"));
    assert!(prompt.contains("Explain carefully"));
}

#[tokio::test]
async fn no_retry_for_bad_request_and_thinking_off() {
    let (endpoint, requests, handle) = server(vec![400], false);
    let options = AIOptions { thinking: "off".into(), retries: 2, ..AIOptions::default() };
    let client = AIClient::new(&endpoint, "test").with_options(Some(options)).unwrap();
    assert!(client.chat("System", "User", "test").await.unwrap_err().to_string().contains("400"));
    handle.join().unwrap();
    assert_eq!(requests.lock().unwrap()[0]["reasoning_effort"], "none");
}

#[tokio::test]
async fn timeout_covers_body_and_retry_limit_is_exact() {
    let (endpoint, requests, handle) = server(vec![200], true);
    let client = AIClient::new(&endpoint, "test").with_options(Some(AIOptions { timeout_seconds: 1, ..AIOptions::default() })).unwrap();
    assert!(client.chat("System", "User", "test").await.is_err());
    handle.join().unwrap();
    assert_eq!(requests.lock().unwrap().len(), 1);
    let (endpoint, requests, handle) = server(vec![429, 429], false);
    let client = AIClient::new(&endpoint, "test").with_options(Some(AIOptions { retries: 1, ..AIOptions::default() })).unwrap();
    assert!(client.chat("System", "User", "test").await.unwrap_err().to_string().contains("429"));
    handle.join().unwrap();
    assert_eq!(requests.lock().unwrap().len(), 2);
}
