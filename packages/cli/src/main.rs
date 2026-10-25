//! `exameow` —— Exameow 的 MCP 薄客户端。
//!
//! 软件开着就把命令转发给它的 MCP HTTP 端点；没开就先把它启动起来。命令面 = MCP 工具面：
//! 加一个 MCP 工具 = 自动多一条可调用的 CLI 命令（按名转发，无需逐工具写代码）。
//!
//! 本机回环调用**不需要密钥**：服务端对 loopback 请求放行；只有 LAN / 反向代理
//! 场景才需要 `mcp.json` 里的 token（或 `EXAMEOW_MCP_TOKEN`）。

mod client;
mod discovery;

use std::process::ExitCode;
use std::time::{Duration, Instant};

use clap::{Parser, Subcommand};
use serde_json::Value;

use client::McpClient;

/// `exameow start` 等待 MCP 就绪的上限。
const START_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Parser)]
#[command(
    name = "exameow",
    bin_name = "exameow",
    version,
    about = "Exameow 的 MCP 薄客户端：软件开着就转发命令，没开就先启动。"
)]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// 列出软件当前暴露的全部 MCP 工具。
    Tools,
    /// 调用一个 MCP 工具（参数为 JSON 对象）。
    Call {
        /// 工具名（用 `exameow tools` 查看）。
        tool: String,
        /// 工具参数，JSON 对象，例如 '{"count":5}'。
        #[arg(long, value_name = "JSON", default_value = "{}")]
        json: String,
    },
    /// 报告软件是否在运行、MCP 地址是否可达。
    Status,
    /// 未运行则启动软件，等到 MCP 就绪再返回。
    Start,
}

fn main() -> ExitCode {
    let cli = Cli::parse();
    match run(cli) {
        Ok(code) => code,
        Err(err) => {
            eprintln!("exameow: {err}");
            ExitCode::FAILURE
        }
    }
}

fn run(cli: Cli) -> Result<ExitCode, String> {
    match cli.command {
        Command::Tools => {
            let (client, _) = connect_any()?;
            for tool in client.list_tools()? {
                let description = one_line(&tool.description);
                if description.is_empty() {
                    println!("{}", tool.name);
                } else {
                    println!("{} — {description}", tool.name);
                }
            }
            Ok(ExitCode::SUCCESS)
        }
        Command::Call { tool, json } => {
            let arguments = parse_arguments(&json)?;
            let (client, _) = connect_any()?;
            let outcome = client.call_tool(&tool, arguments)?;
            if outcome.is_error {
                eprintln!("{}", outcome.text);
                return Ok(ExitCode::FAILURE);
            }
            println!("{}", outcome.text);
            Ok(ExitCode::SUCCESS)
        }
        Command::Status => match probe_any() {
            Some(url) => {
                println!("运行中 {url}");
                Ok(ExitCode::SUCCESS)
            }
            None => {
                println!("未运行");
                Ok(ExitCode::FAILURE)
            }
        },
        Command::Start => {
            if let Some(url) = probe_any() {
                println!("已在运行 {url}");
                return Ok(ExitCode::SUCCESS);
            }
            launch()?;
            let url = wait_ready()?;
            println!("已启动 {url}");
            Ok(ExitCode::SUCCESS)
        }
    }
}

/// 找到第一个可达的地址并完成握手（软件没开时给出可操作的报错）。
fn connect_any() -> Result<(McpClient, String), String> {
    let token = discovery::token();
    let candidates = discovery::candidates();
    for url in &candidates {
        if McpClient::probe(url, token.clone()) {
            return Ok((McpClient::connect(url, token)?, url.clone()));
        }
    }
    Err(format!(
        "未找到正在运行的 Exameow（已尝试：{}）。\n先执行 `exameow start`；若软件已开，请在「设置 → MCP / AI 客户端接入」里打开 MCP。",
        candidates.join(", ")
    ))
}

/// 探测哪个候选地址开着（短超时）。
fn probe_any() -> Option<String> {
    let token = discovery::token();
    discovery::candidates()
        .into_iter()
        .find(|url| McpClient::probe(url, token.clone()))
}

/// 轮询直到 MCP 就绪（每轮重读发现文件——软件起来后会写下实际地址）。
fn wait_ready() -> Result<String, String> {
    let deadline = Instant::now() + START_TIMEOUT;
    loop {
        if let Some(url) = probe_any() {
            return Ok(url);
        }
        if Instant::now() >= deadline {
            return Err(format!(
                "等待 MCP 就绪超时（{} 秒）。软件可能仍在启动，或 MCP 未启用——请在设置里打开。",
                START_TIMEOUT.as_secs()
            ));
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}

/// 解析 `--json` 参数：必须是 JSON 对象（MCP 的 `arguments`）。
fn parse_arguments(text: &str) -> Result<Value, String> {
    let value: Value =
        serde_json::from_str(text).map_err(|e| format!("--json 不是合法 JSON：{e}"))?;
    if !value.is_object() {
        return Err("--json 必须是一个 JSON 对象，例如 '{\"count\":5}'".to_owned());
    }
    Ok(value)
}

/// 启动软件。可用 `EXAMEOW_APP_PATH` 覆盖（dev 构建 / 自定义安装位置）。
#[cfg(target_os = "macos")]
fn launch() -> Result<(), String> {
    if let Ok(path) = std::env::var("EXAMEOW_APP_PATH") {
        if points_at_self(std::path::Path::new(&path)) {
            return Err("EXAMEOW_APP_PATH 指向的是 CLI 自己；请指向 Exameow.app 或主程序。".to_owned());
        }
        return spawn_path(&path);
    }
    // 先按 bundle id 找（与安装位置无关），再退回应用名。
    if let Ok(status) = std::process::Command::new("open")
        .args(["-b", discovery::APP_IDENTIFIER])
        .status()
    {
        if status.success() {
            return Ok(());
        }
    }
    let status = std::process::Command::new("open")
        .args(["-a", discovery::APP_NAME_LABEL])
        .status()
        .map_err(|e| format!("无法启动软件（执行 open 失败）：{e}"))?;
    if !status.success() {
        return Err(format!(
            "无法启动软件：`open -b {}` 与 `open -a {}` 都失败了。可用 EXAMEOW_APP_PATH 指定应用路径。",
            discovery::APP_IDENTIFIER,
            discovery::APP_NAME_LABEL
        ));
    }
    Ok(())
}

/// 启动软件。本平台优先使用 `EXAMEOW_APP_PATH`，否则探测常见安装位置。
#[cfg(not(target_os = "macos"))]
fn launch() -> Result<(), String> {
    if let Ok(path) = std::env::var("EXAMEOW_APP_PATH") {
        return spawn_path(&path);
    }
    for path in fallback_app_paths() {
        if !path.exists() || points_at_self(&path) {
            continue;
        }
        return spawn_path(&path.display().to_string());
    }
    Err("找不到 Exameow 可执行文件。请先手动打开桌面版，或设置 EXAMEOW_APP_PATH 指向它。".to_owned())
}

/// 避免把 CLI 自己当成 GUI 再启动一遍。
fn points_at_self(path: &std::path::Path) -> bool {
    let Ok(current) = std::env::current_exe() else {
        return false;
    };
    match (
        std::fs::canonicalize(path),
        std::fs::canonicalize(&current),
    ) {
        (Ok(a), Ok(b)) => a == b,
        _ => path == current,
    }
}

#[cfg(not(target_os = "macos"))]
fn fallback_app_paths() -> Vec<std::path::PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let mut out = Vec::new();
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            out.push(
                std::path::PathBuf::from(local)
                    .join("Programs/Exameow/Exameow.exe"),
            );
            out.push(std::path::PathBuf::from(local).join("Exameow/Exameow.exe"));
        }
        if let Ok(programs) = std::env::var("PROGRAMFILES") {
            out.push(std::path::PathBuf::from(programs).join("Exameow/Exameow.exe"));
        }
        out
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let mut out = Vec::new();
        // AppImage 的实际可执行文件路径由环境变量给出。
        if let Ok(appimage) = std::env::var("APPIMAGE") {
            if !appimage.trim().is_empty() {
                out.push(std::path::PathBuf::from(appimage));
            }
        }
        out.extend([
            std::path::PathBuf::from("/usr/bin/exameow"),
            std::path::PathBuf::from("/usr/bin/Exameow"),
            std::path::PathBuf::from("/usr/local/bin/Exameow"),
            std::path::PathBuf::from("/opt/Exameow/Exameow"),
            std::path::PathBuf::from("/opt/Exameow/exameow"),
        ]);
        out
    }
}

fn spawn_path(path: &str) -> Result<(), String> {
    std::process::Command::new(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("无法启动软件（{path}）：{e}"))
}

/// 压成一行（工具描述里可能带换行）。
fn one_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_arguments_requires_an_object() {
        assert!(parse_arguments("{}").is_ok());
        assert!(parse_arguments("[]").is_err());
        assert!(parse_arguments("not json").is_err());
    }

    #[test]
    fn one_line_collapses_whitespace() {
        assert_eq!(one_line("a\n  b\tc"), "a b c");
    }
}
