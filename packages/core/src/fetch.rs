use crate::error::CoreError;
use crate::search::{http_client, post_json, truncate};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::net::IpAddr;
use std::time::Duration;

const DEEPSEEK_FETCH_URL: &str = "https://api.deepseek.com/v1/tools/fetch";
const TAVILY_EXTRACT_URL: &str = "https://api.tavily.com/extract";
const TAVILY_CRAWL_URL: &str = "https://api.tavily.com/crawl";
const EXA_CONTENTS_URL: &str = "https://api.exa.ai/contents";
const FIRECRAWL_SCRAPE_URL: &str = "https://api.firecrawl.dev/v2/scrape";
const JINA_READER_PREFIX: &str = "https://r.jina.ai/";

const FETCH_TIMEOUT_SECS: u64 = 60;
const CRAWL_TIMEOUT_SECS: u64 = 120;
const MAX_EXTRACT_URLS: usize = 5;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchedPage {
    pub url: String,
    pub title: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FetchResponse {
    pub provider: String,
    pub pages: Vec<FetchedPage>,
}

fn is_safe_public_url(raw: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw) else {
        return false;
    };
    if url.scheme() != "http" && url.scheme() != "https" {
        return false;
    }
    let Some(host) = url.host_str() else {
        return false;
    };
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    if host == "localhost" || host == "::1" || host == "[::1]" || host.ends_with(".local") {
        return false;
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        let blocked = match ip {
            IpAddr::V4(v4) => {
                v4.is_loopback()
                    || v4.is_private()
                    || v4.is_link_local()
                    || v4.is_unspecified()
                    || v4.is_broadcast()
            }
            IpAddr::V6(v6) => v6.is_loopback() || v6.is_unspecified(),
        };
        if blocked {
            return false;
        }
    }
    true
}

fn collect_urls(urls: &[String], mode: &str) -> Result<Vec<String>, CoreError> {
    let max = if mode == "crawl" {
        1
    } else {
        MAX_EXTRACT_URLS
    };
    let cleaned: Vec<String> = urls
        .iter()
        .map(|url| url.trim().to_string())
        .filter(|url| !url.is_empty())
        .take(max)
        .collect();
    if cleaned.is_empty() {
        return Err(CoreError::AI("Fetch URL is missing".to_string()));
    }
    for url in &cleaned {
        if !is_safe_public_url(url) {
            return Err(CoreError::AI(format!("Unsupported or unsafe URL: {url}")));
        }
    }
    Ok(cleaned)
}

fn page(url: &str, title: &str, content: &str, max_chars: usize) -> FetchedPage {
    FetchedPage {
        url: url.to_string(),
        title: title.trim().to_string(),
        content: truncate(content.trim(), max_chars),
    }
}

async fn fetch_deepseek(
    api_key: &str,
    url: &str,
    max_chars: usize,
) -> Result<FetchedPage, CoreError> {
    let json = post_json(
        DEEPSEEK_FETCH_URL,
        api_key,
        "authorization",
        &serde_json::json!({ "url": url }),
        FETCH_TIMEOUT_SECS,
    )
    .await?;
    Ok(page(
        url,
        json["title"].as_str().unwrap_or(""),
        json["content"].as_str().unwrap_or(""),
        max_chars,
    ))
}

async fn fetch_tavily_extract(
    api_key: &str,
    urls: &[String],
    max_chars: usize,
) -> Result<Vec<FetchedPage>, CoreError> {
    let json = post_json(
        TAVILY_EXTRACT_URL,
        api_key,
        "authorization",
        &serde_json::json!({
            "urls": urls,
            "extract_depth": "basic",
        }),
        FETCH_TIMEOUT_SECS,
    )
    .await?;
    let raw = json["results"].as_array().cloned().unwrap_or_default();
    Ok(raw
        .iter()
        .map(|item| {
            page(
                item["url"].as_str().unwrap_or(""),
                item["title"].as_str().unwrap_or(""),
                item["raw_content"].as_str().unwrap_or(""),
                max_chars,
            )
        })
        .filter(|page| !page.content.is_empty())
        .collect())
}

async fn fetch_tavily_crawl(
    api_key: &str,
    url: &str,
    max_chars: usize,
    limit: u32,
) -> Result<Vec<FetchedPage>, CoreError> {
    let json = post_json(
        TAVILY_CRAWL_URL,
        api_key,
        "authorization",
        &serde_json::json!({
            "url": url,
            "max_depth": 1,
            "max_breadth": 20,
            "limit": limit,
            "extract_depth": "basic",
        }),
        CRAWL_TIMEOUT_SECS,
    )
    .await?;
    let raw = json["results"].as_array().cloned().unwrap_or_default();
    Ok(raw
        .iter()
        .map(|item| {
            page(
                item["url"].as_str().unwrap_or(""),
                item["title"].as_str().unwrap_or(""),
                item["raw_content"].as_str().unwrap_or(""),
                max_chars,
            )
        })
        .filter(|page| !page.content.is_empty())
        .collect())
}

async fn fetch_jina(
    api_key: &str,
    url: &str,
    max_chars: usize,
) -> Result<FetchedPage, CoreError> {
    let endpoint = format!("{JINA_READER_PREFIX}{url}");
    let mut request = http_client()
        .get(&endpoint)
        .header("Accept", "application/json")
        .timeout(Duration::from_secs(FETCH_TIMEOUT_SECS));
    if !api_key.trim().is_empty() {
        request = request.header("Authorization", format!("Bearer {}", api_key.trim()));
    }
    let response = request.send().await?;
    let status = response.status();
    let text = response.text().await?;
    if !status.is_success() {
        return Err(CoreError::AI(format!("HTTP {status}: {text}")));
    }
    if let Ok(json) = serde_json::from_str::<Value>(&text) {
        let content = json["content"].as_str().unwrap_or("");
        if !content.trim().is_empty() {
            return Ok(page(url, json["title"].as_str().unwrap_or(""), content, max_chars));
        }
    }
    Ok(page(url, "", &text, max_chars))
}

async fn fetch_exa_contents(
    api_key: &str,
    url: &str,
    max_chars: usize,
) -> Result<FetchedPage, CoreError> {
    let json = post_json(
        EXA_CONTENTS_URL,
        api_key,
        "x-api-key",
        &serde_json::json!({
            "ids": [url],
            "text": { "maxCharacters": max_chars },
        }),
        FETCH_TIMEOUT_SECS,
    )
    .await?;
    let item = json["results"]
        .as_array()
        .and_then(|items| items.first())
        .cloned()
        .unwrap_or(Value::Null);
    Ok(page(
        item["url"].as_str().unwrap_or(url),
        item["title"].as_str().unwrap_or(""),
        item["text"].as_str().unwrap_or(""),
        max_chars,
    ))
}

async fn fetch_firecrawl(
    api_key: &str,
    url: &str,
    max_chars: usize,
) -> Result<FetchedPage, CoreError> {
    let json = post_json(
        FIRECRAWL_SCRAPE_URL,
        api_key,
        "authorization",
        &serde_json::json!({
            "url": url,
            "formats": ["markdown"],
            "onlyMainContent": true,
        }),
        FETCH_TIMEOUT_SECS,
    )
    .await?;
    let data = &json["data"];
    Ok(page(
        url,
        data["metadata"]["title"].as_str().unwrap_or(""),
        data["markdown"].as_str().unwrap_or(""),
        max_chars,
    ))
}

pub async fn fetch_pages(
    provider: &str,
    api_key: &str,
    urls: &[String],
    mode: &str,
    max_chars: u32,
    limit: u32,
) -> Result<FetchResponse, CoreError> {
    let provider = provider.trim().to_lowercase();
    let mode = if mode.trim().eq_ignore_ascii_case("crawl") {
        "crawl"
    } else {
        "extract"
    };
    let urls = collect_urls(urls, mode)?;
    let max_chars = max_chars.clamp(500, 20000) as usize;
    let limit = limit.clamp(1, 10);

    if provider != "jina" && api_key.trim().is_empty() {
        return Err(CoreError::AI("Fetch API key is missing".to_string()));
    }

    let pages = match (provider.as_str(), mode) {
        ("deepseek", "extract") => {
            let mut pages = Vec::new();
            for url in &urls {
                pages.push(fetch_deepseek(api_key, url, max_chars).await?);
            }
            pages
        }
        ("tavily", "extract") => fetch_tavily_extract(api_key, &urls, max_chars).await?,
        ("tavily", "crawl") => {
            fetch_tavily_crawl(api_key, &urls[0], max_chars, limit).await?
        }
        ("jina", "extract") => {
            let mut pages = Vec::new();
            for url in &urls {
                pages.push(fetch_jina(api_key, url, max_chars).await?);
            }
            pages
        }
        ("exa", "extract") => {
            let mut pages = Vec::new();
            for url in &urls {
                pages.push(fetch_exa_contents(api_key, url, max_chars).await?);
            }
            pages
        }
        ("firecrawl", "extract") => {
            let mut pages = Vec::new();
            for url in &urls {
                pages.push(fetch_firecrawl(api_key, url, max_chars).await?);
            }
            pages
        }
        ("firecrawl", "crawl") => {
            return Err(CoreError::AI(
                "Firecrawl crawl is not supported; use Firecrawl extract instead".to_string(),
            ))
        }
        (other, _) => {
            return Err(CoreError::AI(format!(
                "Unsupported fetch provider: {other}"
            )))
        }
    };

    let pages: Vec<FetchedPage> = pages
        .into_iter()
        .filter(|page| !page.content.is_empty())
        .collect();
    if pages.is_empty() {
        return Err(CoreError::AI("Fetch returned no content".to_string()));
    }

    Ok(FetchResponse {
        provider,
        pages,
    })
}
