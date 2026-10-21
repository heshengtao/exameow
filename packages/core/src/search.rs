use crate::error::CoreError;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::time::Duration;

const TAVILY_URL: &str = "https://api.tavily.com/search";
const DEEPSEEK_URL: &str = "https://api.deepseek.com/v1/tools/search";
const EXA_URL: &str = "https://api.exa.ai/search";
const FIRECRAWL_URL: &str = "https://api.firecrawl.dev/v2/search";
const BOCHA_URL: &str = "https://api.bochaai.com/v1/web-search";

const MAX_QUERY_CHARS: usize = 120;
const MAX_SNIPPET_CHARS: usize = 800;
const SEARCH_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub provider: String,
    pub query: String,
    pub results: Vec<SearchResult>,
}

pub(crate) fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn normalize_query(query: &str) -> String {
    query
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(MAX_QUERY_CHARS)
        .collect()
}

pub(crate) fn truncate(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        text.to_string()
    } else {
        let mut out: String = text.chars().take(max_chars).collect();
        out.push('…');
        out
    }
}

/// POST JSON to a provider. `auth_header` is `authorization` (Bearer) or
/// `x-api-key` (raw key); an empty key omits the header.
pub(crate) async fn post_json(
    url: &str,
    api_key: &str,
    auth_header: &str,
    body: &Value,
    timeout_secs: u64,
) -> Result<Value, CoreError> {
    let mut request = http_client()
        .post(url)
        .header("Content-Type", "application/json")
        .json(body)
        .timeout(Duration::from_secs(timeout_secs));

    let key = api_key.trim();
    if !key.is_empty() {
        let value = if auth_header.eq_ignore_ascii_case("authorization") {
            format!("Bearer {key}")
        } else {
            key.to_string()
        };
        request = request.header(auth_header, value);
    }

    let response = request.send().await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(CoreError::AI(format!("HTTP {status}: {text}")));
    }
    Ok(serde_json::from_str(&text)?)
}

fn get_str<'a>(item: &'a Value, keys: &[&str]) -> &'a str {
    keys.iter()
        .find_map(|key| item.get(*key).and_then(|value| value.as_str()))
        .unwrap_or("")
}

fn results_from(
    raw: &[Value],
    count: usize,
    title_keys: &[&str],
    url_keys: &[&str],
    snippet_keys: &[&str],
) -> Vec<SearchResult> {
    raw.iter()
        .take(count)
        .filter_map(|item| {
            let title = get_str(item, title_keys).trim();
            let url = get_str(item, url_keys).trim();
            if title.is_empty() || url.is_empty() {
                return None;
            }
            let snippet = get_str(item, snippet_keys).trim();
            Some(SearchResult {
                title: title.to_string(),
                url: url.to_string(),
                snippet: truncate(snippet, MAX_SNIPPET_CHARS),
            })
        })
        .collect()
}

async fn search_tavily(
    api_key: &str,
    query: &str,
    count: usize,
) -> Result<Vec<SearchResult>, CoreError> {
    let json = post_json(
        TAVILY_URL,
        api_key,
        "authorization",
        &serde_json::json!({
            "query": query,
            "max_results": count,
            "search_depth": "basic",
            "include_answer": false,
        }),
        SEARCH_TIMEOUT_SECS,
    )
    .await?;
    let raw = json["results"].as_array().cloned().unwrap_or_default();
    Ok(results_from(
        &raw,
        count,
        &["title"],
        &["url"],
        &["content", "snippet"],
    ))
}

async fn search_deepseek(
    api_key: &str,
    query: &str,
    count: usize,
) -> Result<Vec<SearchResult>, CoreError> {
    let json = post_json(
        DEEPSEEK_URL,
        api_key,
        "authorization",
        &serde_json::json!({
            "query": query,
            "count": count,
            "need_content": false,
        }),
        SEARCH_TIMEOUT_SECS,
    )
    .await?;
    let raw = json["results"].as_array().cloned().unwrap_or_default();
    Ok(results_from(
        &raw,
        count,
        &["title"],
        &["url"],
        &["summary", "snippet"],
    ))
}

async fn search_exa(
    api_key: &str,
    query: &str,
    count: usize,
) -> Result<Vec<SearchResult>, CoreError> {
    let json = post_json(
        EXA_URL,
        api_key,
        "x-api-key",
        &serde_json::json!({
            "query": query,
            "numResults": count,
            "type": "auto",
            "contents": { "highlights": true },
        }),
        SEARCH_TIMEOUT_SECS,
    )
    .await?;
    let raw = json["results"].as_array().cloned().unwrap_or_default();
    Ok(raw
        .iter()
        .take(count)
        .filter_map(|item| {
            let title = get_str(item, &["title"]).trim();
            let url = get_str(item, &["url"]).trim();
            if title.is_empty() || url.is_empty() {
                return None;
            }
            let mut snippet = get_str(item, &["text", "summary"]).trim();
            if snippet.is_empty() {
                snippet = item["highlights"]
                    .as_array()
                    .and_then(|items| items.first())
                    .and_then(|value| value.as_str())
                    .unwrap_or("");
            }
            Some(SearchResult {
                title: title.to_string(),
                url: url.to_string(),
                snippet: truncate(snippet, MAX_SNIPPET_CHARS),
            })
        })
        .collect())
}

async fn search_firecrawl(
    api_key: &str,
    query: &str,
    count: usize,
) -> Result<Vec<SearchResult>, CoreError> {
    let json = post_json(
        FIRECRAWL_URL,
        api_key,
        "authorization",
        &serde_json::json!({
            "query": query,
            "limit": count,
        }),
        SEARCH_TIMEOUT_SECS,
    )
    .await?;
    let raw = json["data"]["web"]
        .as_array()
        .or_else(|| json["data"].as_array())
        .cloned()
        .unwrap_or_default();
    Ok(results_from(
        &raw,
        count,
        &["title"],
        &["url"],
        &["description", "markdown"],
    ))
}

async fn search_bocha(
    api_key: &str,
    query: &str,
    count: usize,
) -> Result<Vec<SearchResult>, CoreError> {
    let json = post_json(
        BOCHA_URL,
        api_key,
        "authorization",
        &serde_json::json!({
            "query": query,
            "summary": true,
            "count": count,
        }),
        SEARCH_TIMEOUT_SECS,
    )
    .await?;
    let raw = json["data"]["webPages"]["value"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    Ok(results_from(
        &raw,
        count,
        &["name", "title"],
        &["url"],
        &["snippet", "summary"],
    ))
}

pub async fn search_web(
    provider: &str,
    api_key: &str,
    query: &str,
    max_results: u32,
) -> Result<SearchResponse, CoreError> {
    let query = normalize_query(query);
    if query.is_empty() {
        return Err(CoreError::AI("Search query is empty".to_string()));
    }
    if api_key.trim().is_empty() {
        return Err(CoreError::AI("Search API key is missing".to_string()));
    }

    let provider = provider.trim().to_lowercase();
    let count = max_results.clamp(1, 10) as usize;
    let results = match provider.as_str() {
        "tavily" => search_tavily(api_key, &query, count).await?,
        "deepseek" => search_deepseek(api_key, &query, count).await?,
        "exa" => search_exa(api_key, &query, count).await?,
        "firecrawl" => search_firecrawl(api_key, &query, count).await?,
        "bocha" => search_bocha(api_key, &query, count).await?,
        other => {
            return Err(CoreError::AI(format!(
                "Unsupported search provider: {other}"
            )))
        }
    };

    Ok(SearchResponse {
        provider,
        query,
        results,
    })
}
