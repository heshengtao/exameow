//! 把打包进 App 的 `skills/exameow` 安装到 AI harness 能发现的目录。
//!
//! 安装是设置页里的**显式开关**：不点就不动用户目录。目标目录是 Agent Skills
//! 生态里最常见的两处：
//!
//! - `~/.claude/skills/exameow`（Claude Code）
//! - `~/.agents/skills/exameow`（通用 Agent Skills）
//!
//! 每个目录里写一个 `.exameow-skill.json` 标记（版本号）。App 升级后设置页会提示
//! 重新安装；卸载只删除带标记 / `SKILL.md` 里 name 是 `exameow` 的目录，不碰别人的 skill。

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::Manager;

const SKILL_NAME: &str = "exameow";
const MARKER: &str = ".exameow-skill.json";

#[derive(Debug, Clone, Serialize)]
pub struct SkillTargetStatus {
    pub path: String,
    pub installed: bool,
    /// 标记文件里记录的版本；旧安装可能没有。
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillStatus {
    /// 包内 skill 目录；`None` = 这个构建没带 skill。
    pub bundled: Option<String>,
    /// 当前 App 版本。
    pub version: String,
    /// 至少一个目标目录已安装。
    pub installed: bool,
    /// 已安装的版本与 App 版本不一致。
    pub update_available: bool,
    /// 这个构建没有可安装的 skill（开发构建 / 未打包）。
    pub unsupported: bool,
    pub targets: Vec<SkillTargetStatus>,
}

fn app_version() -> String {
    env!("CARGO_PKG_VERSION").to_owned()
}

fn home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

fn target_dirs() -> Vec<PathBuf> {
    let Some(home) = home_dir() else {
        return Vec::new();
    };
    vec![
        home.join(".claude").join("skills").join(SKILL_NAME),
        home.join(".agents").join("skills").join(SKILL_NAME),
    ]
}

/// 包内 skill 目录：优先 Tauri resource dir，开发构建回退到仓库里的 `skills/exameow`。
fn bundled_skill_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("skills").join(SKILL_NAME);
        if candidate.join("SKILL.md").is_file() {
            return Some(candidate);
        }
    }
    if cfg!(debug_assertions) {
        let candidate = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("skills")
            .join(SKILL_NAME);
        if candidate.join("SKILL.md").is_file() {
            return Some(candidate);
        }
    }
    None
}

fn marker_version(dir: &Path) -> Option<String> {
    let raw = std::fs::read_to_string(dir.join(MARKER)).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value
        .get("version")
        .and_then(|v| v.as_str())
        .map(str::to_owned)
}

fn is_our_skill(dir: &Path) -> bool {
    if dir.join(MARKER).is_file() {
        return true;
    }
    let Ok(head) = std::fs::read_to_string(dir.join("SKILL.md")) else {
        return false;
    };
    head.lines()
        .take(20)
        .any(|line| line.trim() == format!("name: {SKILL_NAME}"))
}

fn status_of(app: &tauri::AppHandle) -> SkillStatus {
    let version = app_version();
    let mut targets = Vec::new();
    let mut installed = false;
    let mut update_available = false;
    for dir in target_dirs() {
        let present = is_our_skill(&dir);
        let installed_version = marker_version(&dir);
        if present {
            installed = true;
            if installed_version.as_deref() != Some(version.as_str()) {
                update_available = true;
            }
        }
        targets.push(SkillTargetStatus {
            path: dir.display().to_string(),
            installed: present,
            version: installed_version,
        });
    }
    let bundled = bundled_skill_dir(app);
    SkillStatus {
        unsupported: bundled.is_none(),
        bundled: bundled.map(|p| p.display().to_string()),
        version,
        installed,
        update_available,
        targets,
    }
}

fn copy_dir(source: &Path, target: &Path) -> Result<(), String> {
    std::fs::create_dir_all(target)
        .map_err(|e| format!("无法创建 {}：{e}", target.display()))?;
    let entries = std::fs::read_dir(source)
        .map_err(|e| format!("无法读取 {}：{e}", source.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录失败：{e}"))?;
        let from = entry.path();
        let to = target.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|e| format!("读取文件类型失败（{}）：{e}", from.display()))?;
        if file_type.is_dir() {
            copy_dir(&from, &to)?;
        } else if file_type.is_file() {
            // 不复制 macOS 的 .DS_Store。
            if entry.file_name() == ".DS_Store" {
                continue;
            }
            std::fs::copy(&from, &to)
                .map_err(|e| format!("复制 {} 失败：{e}", from.display()))?;
        }
    }
    Ok(())
}

fn write_marker(dir: &Path, version: &str) -> Result<(), String> {
    let marker = serde_json::json!({
        "name": SKILL_NAME,
        "version": version,
        "installedAt": std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0),
    });
    std::fs::write(
        dir.join(MARKER),
        serde_json::to_string_pretty(&marker).unwrap_or_default(),
    )
    .map_err(|e| format!("无法写入 {}：{e}", dir.join(MARKER).display()))
}

pub fn install(app: &tauri::AppHandle) -> Result<SkillStatus, String> {
    let source = bundled_skill_dir(app)
        .ok_or_else(|| "这个构建里没有内置 exameow skill（开发构建 / 未打包）".to_owned())?;
    let version = app_version();
    let targets = target_dirs();
    if targets.is_empty() {
        return Err("无法确定用户主目录".to_owned());
    }

    let mut installed_any = false;
    let mut errors = Vec::new();
    for target in targets {
        if target.exists() {
            if !is_our_skill(&target) {
                errors.push(format!(
                    "{} 已存在且不是 Exameow skill，已跳过",
                    target.display()
                ));
                continue;
            }
            if let Err(error) = std::fs::remove_dir_all(&target) {
                errors.push(format!("无法清理 {}：{error}", target.display()));
                continue;
            }
        }
        match copy_dir(&source, &target).and_then(|_| write_marker(&target, &version)) {
            Ok(()) => installed_any = true,
            Err(error) => errors.push(error),
        }
    }

    if !installed_any {
        return Err(if errors.is_empty() {
            "没有可安装的目标目录".to_owned()
        } else {
            errors.join("；")
        });
    }
    if !errors.is_empty() {
        eprintln!("[skills] {}", errors.join("；"));
    }
    Ok(status_of(app))
}

pub fn uninstall(app: &tauri::AppHandle) -> Result<SkillStatus, String> {
    for target in target_dirs() {
        if !target.exists() || !is_our_skill(&target) {
            continue;
        }
        std::fs::remove_dir_all(&target)
            .map_err(|e| format!("无法删除 {}：{e}", target.display()))?;
    }
    Ok(status_of(app))
}

#[tauri::command]
pub fn skill_status(app: tauri::AppHandle) -> SkillStatus {
    status_of(&app)
}

#[tauri::command]
pub fn skill_install(app: tauri::AppHandle) -> Result<SkillStatus, String> {
    install(&app)
}

#[tauri::command]
pub fn skill_uninstall(app: tauri::AppHandle) -> Result<SkillStatus, String> {
    uninstall(&app)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "exameow-skill-{}-{name}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        dir
    }

    #[test]
    fn copy_dir_copies_nested_files_and_skips_ds_store() {
        let source = temp_dir("source");
        let target = temp_dir("target");
        std::fs::create_dir_all(source.join("references")).unwrap();
        std::fs::write(source.join("SKILL.md"), "---\nname: exameow\n---\n").unwrap();
        std::fs::write(source.join("references/tutor.md"), "tutor").unwrap();
        std::fs::write(source.join(".DS_Store"), "junk").unwrap();

        copy_dir(&source, &target).unwrap();
        assert!(target.join("SKILL.md").is_file());
        assert_eq!(
            std::fs::read_to_string(target.join("references/tutor.md")).unwrap(),
            "tutor"
        );
        assert!(!target.join(".DS_Store").exists());

        let _ = std::fs::remove_dir_all(&source);
        let _ = std::fs::remove_dir_all(&target);
    }

    #[test]
    fn our_skill_detection_requires_the_exameow_name_or_marker() {
        let dir = temp_dir("detect");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("SKILL.md"), "---\nname: other\n---\n").unwrap();
        assert!(!is_our_skill(&dir));

        std::fs::write(dir.join("SKILL.md"), "---\nname: exameow\n---\n").unwrap();
        assert!(is_our_skill(&dir));

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn marker_version_roundtrips() {
        let dir = temp_dir("marker");
        std::fs::create_dir_all(&dir).unwrap();
        write_marker(&dir, "1.2.3").unwrap();
        assert_eq!(marker_version(&dir).as_deref(), Some("1.2.3"));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
