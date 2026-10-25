//! `exameow` CLI 的**挂载 / 卸载**：让用户在终端里随处可敲 `exameow`。
//!
//! **不自动做任何事**：启动时不碰 PATH、不弹密码框。挂载是设置页里的一个**显式开关**——
//! 用户点它的时候才知道「这次要输密码是为了把命令行挂上去」。不打开也完全能用，
//! 只是调用要给全路径（`…/Exameow.app/Contents/MacOS/exameow-cli`）。
//!
//! 二进制由 Tauri 作为 sidecar 打进安装包（`bundle.externalBin`），落在**主程序旁边**。
//! 因为主程序本身叫 `exameow`，sidecar 用 `exameow-cli`；这里负责把 `exameow` 这个名字接进 PATH：
//!
//! - **macOS**：软链 `/usr/local/bin/exameow` → 包内 `exameow-cli`。需要一次管理员授权。
//! - **Windows**：在 `%LOCALAPPDATA%\Exameow\bin` 写一个 `exameow.cmd` 转发到
//!   `exameow-cli.exe`，并把这个 bin 目录加进**用户** PATH（不需要提权）。
//! - **Linux（deb / rpm）**：sidecar 在 `/usr/bin/exameow-cli`；软链需要 root，所以只给手工命令。
//! - **Linux（AppImage）**：二进制路径每次挂载都变，不能软链 → 不自动安装。
//!
//! 发现文件 `cli-path` 每次启动都会重写，供外部 AI harness 直接读取（不需要搜索 / PATH）。

use std::path::{Path, PathBuf};

use serde::Serialize;

/// 用户敲的命令名。
const COMMAND: &str = "exameow";

/// 包内 sidecar 文件名（不能与主程序 `exameow` 同名）。
const BINARY: &str = "exameow-cli";

/// **发现文件**名：包内 CLI 的绝对路径。与 `mcp-url` 并列放在应用配置目录里。
pub const PATH_FILE: &str = "cli-path";

/// macOS / Linux 上放软链的目录。
#[cfg(unix)]
const LINK_DIR: &str = "/usr/local/bin";

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CliState {
    /// 已挂载，且指向包内二进制。
    Installed,
    /// 没挂载，可以挂。
    Missing,
    /// 同名命令已存在，但**不是我们**挂的 —— 打开开关会覆盖它。
    Conflict,
    /// 系统包管理器已经放好了（本仓库目前不会出现）。
    System,
    /// 这个环境挂不了（开发构建没有真包；AppImage 路径不稳定）。
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CliHint {
    /// 开发构建：不是真正的安装包。
    DevBuild,
    /// AppImage：二进制在临时挂载点里，路径每次都变。
    #[allow(dead_code)]
    AppImage,
    /// 这个平台需要 root，只能给出手工命令。
    #[allow(dead_code)]
    NeedsManual,
}

#[derive(Debug, Clone, Serialize)]
pub struct CliStatus {
    pub state: CliState,
    /// 用户敲的命令名。
    pub command: String,
    /// 已挂载时：软链（macOS）或 shim（Windows）的位置。
    pub target: Option<String>,
    /// 包内 sidecar 的位置；`None` = 这个构建里没有 sidecar。
    pub bundled: Option<String>,
    /// 冲突时：现有那份命令在哪。
    pub conflict: Option<String>,
    /// 挂不了时的原因。
    pub hint: Option<CliHint>,
    /// 手工安装命令（可直接复制到终端）。
    pub manual_command: Option<String>,
    /// 不挂也能用：包内二进制的**全路径**，可直接调用。
    pub full_path: Option<String>,
}

// ---------------------------------------------------------------------------
// 对外动作
// ---------------------------------------------------------------------------

pub fn status() -> CliStatus {
    classify(&probe())
}

/// 把 `exameow` 接进 PATH（macOS 会弹一次管理员授权）。
pub fn install() -> Result<CliStatus, String> {
    let probe = probe();
    let Some(bundled) = probe.bundled.clone() else {
        return Err("这个构建里没有内置 exameow CLI（开发构建？）".to_owned());
    };
    if let Some(reason) = probe.unsupported {
        return Err(format!("此环境不支持挂载：{reason:?}"));
    }

    match install_command(&bundled, &probe) {
        Ok(()) => {}
        Err(InstallError::Declined) => return Err("已取消管理员授权".to_owned()),
        Err(InstallError::Failed(message)) => return Err(message),
    }

    let after = status();
    if after.state != CliState::Installed {
        return Err("挂载似乎没有生效".to_owned());
    }
    Ok(after)
}

/// 卸载（只动我们自己挂的那份）。
pub fn uninstall() -> Result<CliStatus, String> {
    if status().state != CliState::Installed {
        return Ok(status());
    }
    let probe = probe();
    match uninstall_command(&probe) {
        Ok(()) => Ok(status()),
        Err(InstallError::Declined) => Err("已取消管理员授权".to_owned()),
        Err(InstallError::Failed(message)) => Err(message),
    }
}

/// 启动时调用：登记包内 CLI 的绝对路径，供外部 AI harness 直接读取。
pub fn publish_path() {
    let dir = match exameow_core::config::config_dir("Exameow") {
        Ok(dir) => dir,
        Err(error) => {
            eprintln!("[cli] 无法解析配置目录：{error}");
            return;
        }
    };
    if let Err(error) = write_path_file(&dir, bundled_binary().as_deref()) {
        eprintln!("[cli] 写入发现文件 {PATH_FILE} 失败：{error}");
    }
}

fn write_path_file(dir: &Path, bundled: Option<&Path>) -> std::io::Result<()> {
    let Some(bundled) = bundled else {
        return Ok(());
    };
    std::fs::create_dir_all(dir)?;
    std::fs::write(dir.join(PATH_FILE), bundled.display().to_string())
}

// ---------------------------------------------------------------------------
// 探测
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct Probe {
    bundled: Option<PathBuf>,
    link: PathBuf,
    link_target: Option<PathBuf>,
    link_exists: bool,
    system_present: bool,
    unsupported: Option<CliHint>,
    manual_command: Option<String>,
}

/// 包内 CLI 的位置 = **主程序旁边**的同名 sidecar。
fn bundled_binary() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let name = if cfg!(windows) {
        format!("{BINARY}.exe")
    } else {
        BINARY.to_owned()
    };
    let candidate = exe.parent()?.join(name);
    candidate.is_file().then_some(candidate)
}

#[cfg(windows)]
fn shim_dir() -> Option<PathBuf> {
    std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .map(|dir| dir.join("Exameow").join("bin"))
}

#[cfg(windows)]
fn shim_path() -> Option<PathBuf> {
    shim_dir().map(|dir| dir.join(format!("{COMMAND}.cmd")))
}

fn looks_like_dev_build(exe: &Path) -> bool {
    if exe.to_string_lossy().contains(".app/Contents/MacOS/") {
        return false;
    }
    let text = exe.to_string_lossy();
    let names: Vec<&str> = text
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .collect();
    match names.iter().rposition(|name| *name == "target") {
        Some(index) => names[index + 1..]
            .iter()
            .any(|name| *name == "debug" || *name == "release"),
        None => false,
    }
}

fn is_dev_build() -> bool {
    std::env::current_exe()
        .map(|exe| looks_like_dev_build(&exe))
        .unwrap_or(true)
}

fn classify(probe: &Probe) -> CliStatus {
    let bundled = probe.bundled.as_ref().map(|p| p.display().to_string());
    let mut status = CliStatus {
        state: CliState::Missing,
        command: COMMAND.to_owned(),
        target: None,
        bundled: bundled.clone(),
        conflict: None,
        hint: None,
        manual_command: probe.manual_command.clone(),
        full_path: bundled,
    };

    if probe.link_exists {
        if probe
            .bundled
            .as_ref()
            .is_some_and(|bundled| path_points_at(probe, bundled))
        {
            status.state = CliState::Installed;
            status.target = Some(
                probe
                    .link_target
                    .clone()
                    .unwrap_or_else(|| probe.link.clone())
                    .display()
                    .to_string(),
            );
        } else {
            status.state = CliState::Conflict;
            status.conflict = Some(
                probe
                    .link_target
                    .clone()
                    .unwrap_or_else(|| probe.link.clone())
                    .display()
                    .to_string(),
            );
        }
        return status;
    }
    if probe.system_present {
        status.state = CliState::System;
        status.target = status.bundled.clone();
        return status;
    }
    if let Some(hint) = probe.unsupported {
        status.state = CliState::Unsupported;
        status.hint = Some(hint);
        return status;
    }
    if probe.bundled.is_none() {
        status.state = CliState::Unsupported;
        status.hint = Some(CliHint::DevBuild);
    }
    status
}

fn path_points_at(probe: &Probe, bundled: &Path) -> bool {
    match &probe.link_target {
        Some(target) => same_file(target, bundled),
        None => false,
    }
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

#[cfg(target_os = "macos")]
fn probe() -> Probe {
    let bundled = bundled_binary();
    let link = PathBuf::from(LINK_DIR).join(COMMAND);
    let link_exists = std::fs::symlink_metadata(&link).is_ok();
    let link_target = std::fs::read_link(&link).ok();
    let unsupported = is_dev_build().then_some(CliHint::DevBuild);
    let manual_command = bundled.as_ref().map(|bundled| {
        format!(
            "sudo /bin/mkdir -p {dir} && sudo /bin/ln -sfn {src} {dir}/{COMMAND}",
            dir = LINK_DIR,
            src = sh_quote(&bundled.display().to_string()),
        )
    });
    Probe {
        bundled,
        link,
        link_target,
        link_exists,
        system_present: false,
        unsupported,
        manual_command,
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn probe() -> Probe {
    let bundled = bundled_binary();
    let link = PathBuf::from(LINK_DIR).join(COMMAND);
    let link_exists = std::fs::symlink_metadata(&link).is_ok();
    let link_target = std::fs::read_link(&link).ok();
    let unsupported = if is_dev_build() {
        Some(CliHint::DevBuild)
    } else if std::env::var_os("APPIMAGE").is_some() {
        Some(CliHint::AppImage)
    } else if bundled.is_some() {
        // sidecar 在包内的临时/系统目录；软链需要 root，交给用户手工执行。
        Some(CliHint::NeedsManual)
    } else {
        None
    };
    let manual_command = bundled.as_ref().map(|bundled| {
        format!(
            "sudo /bin/mkdir -p {dir} && sudo /bin/ln -sfn {src} {dir}/{COMMAND}",
            dir = LINK_DIR,
            src = sh_quote(&bundled.display().to_string()),
        )
    });
    Probe {
        bundled,
        link,
        link_target,
        link_exists,
        system_present: false,
        unsupported,
        manual_command,
    }
}

#[cfg(windows)]
fn probe() -> Probe {
    let bundled = bundled_binary();
    let link = shim_path().unwrap_or_default();
    let link_exists = link.is_file();
    // shim 内容里含包内路径 = 我们挂的。
    let link_target = if link_exists {
        std::fs::read_to_string(&link)
            .ok()
            .and_then(|text| {
                bundled
                    .as_ref()
                    .filter(|bundled| text.contains(&bundled.display().to_string()))
                    .cloned()
            })
            .or_else(|| Some(link.clone()))
    } else {
        None
    };
    let unsupported = is_dev_build().then_some(CliHint::DevBuild);
    Probe {
        bundled,
        link,
        link_target,
        link_exists,
        system_present: false,
        unsupported,
        manual_command: None,
    }
}

// ---------------------------------------------------------------------------
// 安装 / 卸载
// ---------------------------------------------------------------------------

enum InstallError {
    Declined,
    Failed(String),
}

#[cfg(target_os = "macos")]
fn install_command(bundled: &Path, probe: &Probe) -> Result<(), InstallError> {
    let dir = probe
        .link
        .parent()
        .ok_or_else(|| InstallError::Failed("安装目录不合法".to_owned()))?;
    let shell = format!(
        "/bin/mkdir -p {dir} && /bin/ln -sfn {src} {link}",
        dir = sh_quote(&dir.display().to_string()),
        src = sh_quote(&bundled.display().to_string()),
        link = sh_quote(&probe.link.display().to_string()),
    );
    run_privileged(&shell)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn install_command(_bundled: &Path, _probe: &Probe) -> Result<(), InstallError> {
    Err(InstallError::Failed(
        "需要 root 权限，请按提示的命令手工挂载".to_owned(),
    ))
}

#[cfg(windows)]
fn install_command(bundled: &Path, probe: &Probe) -> Result<(), InstallError> {
    let dir = probe
        .link
        .parent()
        .ok_or_else(|| InstallError::Failed("安装目录不合法".to_owned()))?;
    std::fs::create_dir_all(dir)
        .map_err(|e| InstallError::Failed(format!("无法创建 {}：{e}", dir.display())))?;
    let script = format!("@echo off\r\n\"{}\" %*\r\n", bundled.display());
    std::fs::write(&probe.link, script)
        .map_err(|e| InstallError::Failed(format!("无法写入 {}：{e}", probe.link.display())))?;
    add_to_user_path(dir).map_err(InstallError::Failed)
}

#[cfg(not(any(unix, windows)))]
fn install_command(_bundled: &Path, _probe: &Probe) -> Result<(), InstallError> {
    Err(InstallError::Failed("不支持的平台".to_owned()))
}

#[cfg(target_os = "macos")]
fn uninstall_command(probe: &Probe) -> Result<(), InstallError> {
    let shell = format!("/bin/rm -f {link}", link = sh_quote(&probe.link.display().to_string()));
    run_privileged(&shell)
}

#[cfg(all(unix, not(target_os = "macos")))]
fn uninstall_command(probe: &Probe) -> Result<(), InstallError> {
    std::fs::remove_file(&probe.link).map_err(|e| {
        InstallError::Failed(format!(
            "无法删除 {}：{e}（可能需要 sudo）",
            probe.link.display()
        ))
    })
}

#[cfg(windows)]
fn uninstall_command(probe: &Probe) -> Result<(), InstallError> {
    let _ = std::fs::remove_file(&probe.link);
    if let Some(dir) = probe.link.parent() {
        remove_from_user_path(dir).map_err(InstallError::Failed)?;
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
fn uninstall_command(_probe: &Probe) -> Result<(), InstallError> {
    Err(InstallError::Failed("不支持的平台".to_owned()))
}

#[cfg(target_os = "macos")]
fn run_privileged(shell_command: &str) -> Result<(), InstallError> {
    use std::process::Command;

    let script = osascript_script(shell_command);
    let output = Command::new("/usr/bin/osascript")
        .arg("-e")
        .arg(&script)
        .output()
        .map_err(|e| InstallError::Failed(format!("无法调用 osascript：{e}")))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("User canceled") || stderr.contains("-128") {
        return Err(InstallError::Declined);
    }
    Err(InstallError::Failed(format!("挂载失败：{}", stderr.trim())))
}

// ---------------------------------------------------------------------------
// 转义
// ---------------------------------------------------------------------------

fn sh_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', r"'\''"))
}

#[cfg(target_os = "macos")]
fn applescript_escape(value: &str) -> String {
    value.replace('\\', r"\\").replace('"', "\\\"")
}

#[cfg(target_os = "macos")]
fn osascript_script(shell_command: &str) -> String {
    format!(
        "do shell script \"{}\" with administrator privileges",
        applescript_escape(shell_command)
    )
}

// ---------------------------------------------------------------------------
// Windows 用户 PATH（shim 目录要排在前面，避免被主程序 exameow.exe 抢先）
// ---------------------------------------------------------------------------

#[cfg(windows)]
fn read_user_path() -> Result<(String, winreg::enums::RegType), String> {
    use winreg::enums::{RegType, HKEY_CURRENT_USER};
    use winreg::RegKey;

    let key = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Environment")
        .map_err(|e| format!("打开注册表 Environment 失败：{e}"))?;
    match key.get_raw_value("Path") {
        Ok(raw) => {
            let units: Vec<u16> = raw
                .bytes
                .chunks_exact(2)
                .map(|c| u16::from_le_bytes([c[0], c[1]]))
                .collect();
            let text = String::from_utf16_lossy(&units)
                .trim_end_matches('\0')
                .to_owned();
            Ok((text, raw.vtype))
        }
        Err(_) => Ok((String::new(), RegType::REG_EXPAND_SZ)),
    }
}

#[cfg(windows)]
fn write_user_path(value: &str, vtype: winreg::enums::RegType) -> Result<(), String> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::{RegKey, RegValue};

    let (key, _) = RegKey::predef(HKEY_CURRENT_USER)
        .create_subkey("Environment")
        .map_err(|e| format!("打开注册表 Environment 失败：{e}"))?;
    let mut bytes: Vec<u8> = value.encode_utf16().flat_map(|u| u.to_le_bytes()).collect();
    bytes.extend([0, 0]);
    key.set_raw_value(
        "Path",
        &RegValue {
            bytes: bytes.into(),
            vtype,
        },
    )
    .map_err(|e| format!("写入用户 PATH 失败：{e}"))
}

#[cfg(windows)]
fn normalize_path(path: &Path) -> String {
    path.display()
        .to_string()
        .trim_end_matches(['\\', '/'])
        .to_ascii_lowercase()
}

#[cfg(windows)]
fn add_to_user_path(dir: &Path) -> Result<(), String> {
    let (path, vtype) = read_user_path()?;
    let want = normalize_path(dir);
    let entries: Vec<String> = path
        .split(';')
        .filter(|entry| !entry.trim().is_empty())
        .map(|entry| entry.trim().to_owned())
        .collect();
    if entries.iter().any(|entry| normalize_path(Path::new(entry)) == want) {
        return Ok(());
    }
    let joined = if entries.is_empty() {
        dir.display().to_string()
    } else {
        format!("{};{}", dir.display(), entries.join(";"))
    };
    write_user_path(&joined, vtype)
}

#[cfg(windows)]
fn remove_from_user_path(dir: &Path) -> Result<(), String> {
    let (path, vtype) = read_user_path()?;
    let want = normalize_path(dir);
    let kept: Vec<String> = path
        .split(';')
        .filter(|entry| !entry.trim().is_empty())
        .filter(|entry| normalize_path(Path::new(entry.trim())) != want)
        .map(|entry| entry.trim().to_owned())
        .collect();
    write_user_path(&kept.join(";"), vtype)
}

// ---------------------------------------------------------------------------
// Tauri 命令
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn cli_status() -> CliStatus {
    status()
}

#[tauri::command]
pub fn install_cli() -> Result<CliStatus, String> {
    install()
}

#[tauri::command]
pub fn uninstall_cli() -> Result<CliStatus, String> {
    uninstall()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn probe_with(bundled: Option<&str>, link_target: Option<&str>, exists: bool) -> Probe {
        Probe {
            bundled: bundled.map(PathBuf::from),
            link: PathBuf::from("/usr/local/bin/exameow"),
            link_target: link_target.map(PathBuf::from),
            link_exists: exists,
            system_present: false,
            unsupported: None,
            manual_command: None,
        }
    }

    #[test]
    fn classify_reports_missing_when_nothing_is_there() {
        let status = classify(&probe_with(Some("/app/exameow-cli"), None, false));
        assert_eq!(status.state, CliState::Missing);
        assert_eq!(status.full_path.as_deref(), Some("/app/exameow-cli"));
    }

    #[test]
    fn classify_reports_installed_when_link_points_at_bundled() {
        let probe = probe_with(
            Some("/app/exameow-cli"),
            Some("/app/exameow-cli"),
            true,
        );
        assert_eq!(classify(&probe).state, CliState::Installed);
    }

    #[test]
    fn classify_reports_conflict_for_a_foreign_command() {
        let probe = probe_with(
            Some("/app/exameow-cli"),
            Some("/opt/other/exameow"),
            true,
        );
        let status = classify(&probe);
        assert_eq!(status.state, CliState::Conflict);
        assert_eq!(status.conflict.as_deref(), Some("/opt/other/exameow"));
    }

    #[test]
    fn classify_reports_unsupported_without_a_sidecar() {
        let status = classify(&probe_with(None, None, false));
        assert_eq!(status.state, CliState::Unsupported);
        assert_eq!(status.hint, Some(CliHint::DevBuild));
    }

    #[test]
    fn dev_build_detection_covers_cargo_target_dirs() {
        assert!(looks_like_dev_build(Path::new(
            "/Users/me/proj/src-tauri/target/debug/exameow"
        )));
        assert!(!looks_like_dev_build(Path::new(
            "/Applications/Exameow.app/Contents/MacOS/Exameow"
        )));
    }

    #[test]
    fn shell_quote_survives_spaces_and_quotes() {
        assert_eq!(
            sh_quote("/Applications/Exameow.app/Contents/MacOS/exameow-cli"),
            "'/Applications/Exameow.app/Contents/MacOS/exameow-cli'"
        );
        assert_eq!(sh_quote("it's"), r"'it'\''s'");
    }
}
