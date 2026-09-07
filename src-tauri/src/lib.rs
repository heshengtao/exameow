use exameow_core::ai::AIOptions;
use exameow_core::ai::{AIClient, ModelInfo};
use exameow_core::config::{AIConfigData, ConfigStore};
use exameow_core::exam::{
    answer_question as core_answer_question, explain_question as core_explain_question,
    generate_exam as core_generate_exam,
    judge_answer as core_judge_answer, AnswerResult, ExamParams, ExplainResult, JudgeResult, Question,
};
use exameow_core::export::export_csv as core_export_csv;
use exameow_core::export::export_xlsx as core_export_xlsx;
use exameow_core::parser::parse_file;
use serde::Serialize;
use std::fmt;

mod ota;
#[cfg(target_os = "macos")]
fn make_webview_transparent(win: &tauri::WebviewWindow) {
    use objc::runtime::{Class, Object, NO};
    use objc::{msg_send, sel, sel_impl};
    if let Ok(ptr) = win.ns_window() {
        unsafe {
            let ns_window = ptr as *mut Object;
            let clear: *mut Object = msg_send![Class::get("NSColor").unwrap(), clearColor];
            let _: () = msg_send![ns_window, setOpaque: NO];
            let _: () = msg_send![ns_window, setBackgroundColor: clear];
        }
    }
}

use tauri::Manager;
use base64::Engine;

const APP_NAME: &str = "Exameow";

#[cfg(target_os = "macos")]
fn setup_dock_icon() {
    use objc::runtime::{Class, Object};
    use objc::{msg_send, sel, sel_impl};

    const ICON: &[u8] = include_bytes!("../icons/icon.png");

    unsafe {
        let data: *mut Object = msg_send![Class::get("NSData").unwrap(), dataWithBytes:ICON.as_ptr() as *const std::ffi::c_void length:ICON.len()];
        let image: *mut Object = msg_send![Class::get("NSImage").unwrap(), alloc];
        let _: () = msg_send![image, initWithData:data];
        let app: *mut Object = msg_send![Class::get("NSApplication").unwrap(), sharedApplication];
        let _: () = msg_send![app, setApplicationIconImage:image];
    }
}

#[derive(Debug, Serialize)]
pub struct CommandError(String);

impl fmt::Display for CommandError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(f)
    }
}

impl std::error::Error for CommandError {}

#[derive(Serialize)]
pub struct GenerateResult {
    pub questions: Vec<Question>,
}

#[tauri::command]
async fn get_models(endpoint: String, api_key: String) -> Result<Vec<ModelInfo>, CommandError> {
    let client = AIClient::new(&endpoint, &api_key);
    client
        .fetch_models()
        .await
        .map_err(|e| CommandError(format!("Failed to fetch models: {e}")))
}

#[tauri::command]
async fn generate_exam(
    file_path: String,
    params_json: String,
    endpoint: String,
    api_key: String,
    model: String,
    options: Option<AIOptions>,
) -> Result<GenerateResult, CommandError> {
    let params: ExamParams = serde_json::from_str(&params_json)
        .map_err(|e| CommandError(format!("Invalid params JSON: {e}")))?;

    let text = if params.text.is_some() {
        params.text.clone().unwrap()
    } else {
        parse_file(&file_path).map_err(|e| CommandError(format!("File parse error: {e}")))?
    };

    let client = AIClient::new(&endpoint, &api_key).with_options(options)
        .map_err(|e| CommandError(e.to_string()))?;
    let questions = core_generate_exam(&client, &text, &params, &model)
        .await
        .map_err(|e| CommandError(format!("Exam generation error: {e}")))?;

    Ok(GenerateResult { questions })
}

#[tauri::command]
async fn answer_question(
    question: String,
    language: String,
    endpoint: String,
    api_key: String,
    model: String,
    options: Option<AIOptions>,
) -> Result<AnswerResult, CommandError> {
    if question.trim().is_empty() {
        return Err(CommandError("Question is empty".to_string()));
    }
    let client = AIClient::new(&endpoint, &api_key).with_options(options)
        .map_err(|e| CommandError(e.to_string()))?;
    core_answer_question(&client, &question, &language, &model)
        .await
        .map_err(|e| CommandError(format!("Answer error: {e}")))
}

#[tauri::command]
async fn judge_answer(
    stem: String,
    reference_answer: String,
    analysis: String,
    user_answer: String,
    language: String,
    endpoint: String,
    api_key: String,
    model: String,
    options: Option<AIOptions>,
) -> Result<JudgeResult, CommandError> {
    if user_answer.trim().is_empty() {
        return Err(CommandError("User answer is empty".to_string()));
    }
    let client = AIClient::new(&endpoint, &api_key).with_options(options)
        .map_err(|e| CommandError(e.to_string()))?;
    core_judge_answer(
        &client,
        &stem,
        &reference_answer,
        &analysis,
        &user_answer,
        &language,
        &model,
    )
    .await
    .map_err(|e| CommandError(format!("Judge error: {e}")))
}

#[tauri::command]
async fn explain_question(
    stem: String,
    reference_answer: String,
    analysis: String,
    language: String,
    endpoint: String,
    api_key: String,
    model: String,
    options: Option<AIOptions>,
) -> Result<ExplainResult, CommandError> {
    if stem.trim().is_empty() {
        return Err(CommandError("Question is empty".to_string()));
    }
    let client = AIClient::new(&endpoint, &api_key).with_options(options)
        .map_err(|e| CommandError(e.to_string()))?;
    core_explain_question(&client, &stem, &reference_answer, &analysis, &language, &model)
        .await
        .map_err(|e| CommandError(format!("Explain error: {e}")))
}

#[tauri::command]
fn parse_file_text(file_path: String) -> Result<String, CommandError> {
    parse_file(&file_path).map_err(|e| CommandError(format!("File parse error: {e}")))
}

#[tauri::command]
fn parse_file_bytes(base64_data: String, file_ext: String) -> Result<String, CommandError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&base64_data)
        .map_err(|e| CommandError(format!("Base64 decode error: {e}")))?;

    let dir = std::env::temp_dir();
    let file_name = format!("exameow_upload.{}", file_ext);
    let file_path = dir.join(&file_name);

    std::fs::write(&file_path, &bytes)
        .map_err(|e| CommandError(format!("Write temp file error: {e}")))?;

    let result = parse_file(file_path.to_string_lossy().as_ref());
    let _ = std::fs::remove_file(&file_path);
    result.map_err(|e| CommandError(format!("File parse error: {e}")))
}

#[tauri::command]
fn export_csv(questions_json: String, save_path: String) -> Result<(), CommandError> {
    let questions: Vec<Question> = serde_json::from_str(&questions_json)
        .map_err(|e| CommandError(format!("Invalid questions JSON: {e}")))?;
    core_export_csv(&questions, &save_path)
        .map_err(|e| CommandError(format!("CSV export error: {e}")))
}

#[tauri::command]
fn export_xlsx(questions_json: String, save_path: String) -> Result<(), CommandError> {
    let questions: Vec<Question> = serde_json::from_str(&questions_json)
        .map_err(|e| CommandError(format!("Invalid questions JSON: {e}")))?;
    core_export_xlsx(&questions, &save_path)
        .map_err(|e| CommandError(format!("XLSX export error: {e}")))
}

#[tauri::command]
fn export_xlsx_data(questions_json: String) -> Result<String, CommandError> {
    let questions: Vec<Question> = serde_json::from_str(&questions_json)
        .map_err(|e| CommandError(format!("Invalid questions JSON: {e}")))?;
    let data = exameow_core::export::export_xlsx_to_writer(&questions)
        .map_err(|e| CommandError(format!("Export XLSX error: {e}")))?;
    Ok(base64::engine::general_purpose::STANDARD.encode(&data))
}

#[tauri::command]
fn write_file(save_path: String, content_base64: String) -> Result<(), CommandError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&content_base64)
        .map_err(|e| CommandError(format!("Base64 decode error: {e}")))?;
    std::fs::write(&save_path, &bytes).map_err(|e| CommandError(format!("Write error: {e}")))
}

#[tauri::command]
fn save_to_cache(
    app: tauri::AppHandle,
    filename: String,
    content_base64: String,
) -> Result<String, CommandError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&content_base64)
        .map_err(|e| CommandError(format!("Base64 decode error: {e}")))?;
    let dir = app
        .path()
        .app_cache_dir()
        .map_err(|e| CommandError(format!("Cache dir error: {e}")))?
        .join("Exameow");
    std::fs::create_dir_all(&dir).map_err(|e| CommandError(format!("Create dir error: {e}")))?;
    let path = dir.join(&filename);
    std::fs::write(&path, &bytes).map_err(|e| CommandError(format!("Write error: {e}")))?;
    Ok(path.to_string_lossy().to_string())
}

fn unique_download_path(dir: &std::path::Path, filename: &str) -> std::path::PathBuf {
    let path = dir.join(filename);
    if !path.exists() {
        return path;
    }
    let (stem, ext) = match filename.rsplit_once('.') {
        Some((s, e)) if !s.is_empty() => (s.to_string(), format!(".{e}")),
        _ => (filename.to_string(), String::new()),
    };
    for i in 2u32.. {
        let candidate = dir.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    unreachable!()
}

#[tauri::command]
fn save_to_downloads(
    app: tauri::AppHandle,
    filename: String,
    content_base64: String,
) -> Result<String, CommandError> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(&content_base64)
        .map_err(|e| CommandError(format!("Base64 decode error: {e}")))?;
    #[cfg(target_os = "android")]
    let dir = std::path::PathBuf::from("/storage/emulated/0/Download/Exameow");
    #[cfg(not(target_os = "android"))]
    let dir = app
        .path()
        .download_dir()
        .map_err(|e| CommandError(format!("Download dir error: {e}")))?
        .join("Exameow");
    std::fs::create_dir_all(&dir)
        .map_err(|e| CommandError(format!("Create dir error: {e}")))?;
    let path = unique_download_path(&dir, &filename);
    std::fs::write(&path, &bytes)
        .map_err(|e| CommandError(format!("Write error: {e}")))?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn save_config(endpoint: String, api_key: String, model: String) -> Result<(), CommandError> {
    let store = ConfigStore::new(APP_NAME)
        .map_err(|e| CommandError(format!("Config init error: {e}")))?;
    store
        .save(&endpoint, &api_key, &model)
        .map_err(|e| CommandError(format!("Config save error: {e}")))
}

#[tauri::command]
fn load_config() -> Result<Option<AIConfigData>, CommandError> {
    let store = ConfigStore::new(APP_NAME)
        .map_err(|e| CommandError(format!("Config init error: {e}")))?;
    store
        .load()
        .map_err(|e| CommandError(format!("Config load error: {e}")))
}

#[tauri::command]
fn open_app_settings() -> Result<(), CommandError> {
    #[cfg(target_os = "android")]
    {
        // On Android handled via @tauri-apps/plugin-opener on the frontend side
    }
    #[cfg(target_os = "ios")]
    {
        use objc::runtime::{Class, Object};
        use objc::{msg_send, sel, sel_impl};
        unsafe {
            let ns_url: *mut Object = {
                let cls = Class::get("NSURL").unwrap();
                let ns_str: *mut Object = msg_send![Class::get("NSString").unwrap(), stringWithUTF8String: "app-settings:\0".as_ptr() as *const i8];
                msg_send![cls, URLWithString: ns_str]
            };
            let app: *mut Object = msg_send![Class::get("UIApplication").unwrap(), sharedApplication];
            let _: () = msg_send![app, openURL: ns_url options: 0_usize completionHandler: 0_usize];
        }
    }
    Ok(())
}


#[cfg(target_os = "macos")]
mod screen_capture_access {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightScreenCaptureAccess() -> bool;
        fn CGRequestScreenCaptureAccess() -> bool;
    }

    pub fn preflight() -> bool {
        unsafe { CGPreflightScreenCaptureAccess() }
    }

    pub fn request() -> bool {
        unsafe { CGRequestScreenCaptureAccess() }
    }
}

#[tauri::command]
fn check_screen_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        screen_capture_access::preflight()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn request_screen_permission() -> bool {
    #[cfg(target_os = "macos")]
    {
        screen_capture_access::request()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

#[tauri::command]
fn open_screen_recording_settings() -> Result<(), CommandError> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")
            .spawn()
            .map_err(|e| CommandError(format!("Failed to open settings: {e}")))?;
    }
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn capture_screen(x: i32, y: i32, w: i32, h: i32, force: Option<bool>) -> Result<tauri::ipc::Response, CommandError> {
    std::panic::catch_unwind(|| capture_screen_inner(x, y, w, h, force.unwrap_or(false)))
        .map_err(|_| CommandError("Screen capture panicked".to_string()))?
}

#[cfg(not(desktop))]
#[tauri::command]
fn capture_screen(_x: i32, _y: i32, _w: i32, _h: i32, _force: Option<bool>) -> Result<tauri::ipc::Response, CommandError> {
    Err(CommandError(
        "Screen capture is only supported on desktop".to_string(),
    ))
}

#[cfg(desktop)]
fn capture_screen_inner(x: i32, y: i32, w: i32, h: i32, force: bool) -> Result<tauri::ipc::Response, CommandError> {
    #[cfg(target_os = "macos")]
    if !screen_capture_access::preflight() {
        return Err(CommandError("screen_recording_permission_denied".to_string()));
    }

    let t0 = std::time::Instant::now();
    let monitors = xcap::Monitor::all()
        .map_err(|e| CommandError(format!("Failed to enumerate monitors: {e}")))?;

    // Pick the monitor whose bounds contain the capture region center,
    // falling back to the primary monitor.
    let cx = x + w / 2;
    let cy = y + h / 2;
    let monitor = monitors
        .iter()
        .find(|m| {
            let mx = m.x().unwrap_or(0);
            let my = m.y().unwrap_or(0);
            let mw = m.width().unwrap_or(0) as i32;
            let mh = m.height().unwrap_or(0) as i32;
            cx >= mx && cx < mx + mw && cy >= my && cy < my + mh
        })
        .unwrap_or(&monitors[0]);

    let captured = monitor
        .capture_image()
        .map_err(|e| CommandError(format!("Failed to capture screen: {e}")))?;
    let mut dyn_img = image::DynamicImage::ImageRgba8(captured);
    let img_w = dyn_img.width();
    let img_h = dyn_img.height();

    // Convert global coordinates to monitor-local coordinates
    let mon_x = monitor.x().unwrap_or(0);
    let mon_y = monitor.y().unwrap_or(0);
    let local_x = x - mon_x;
    let local_y = y - mon_y;
    let cx = (local_x.max(0) as u32).min(img_w.saturating_sub(1));
    let cy = (local_y.max(0) as u32).min(img_h.saturating_sub(1));
    let cw = (w.max(1) as u32).min(img_w - cx);
    let ch = (h.max(1) as u32).min(img_h - cy);
    let cropped = dyn_img.crop(cx, cy, cw, ch);
    let changed = frame_changed(&cropped);
    if !force && !changed {
        eprintln!("[capture_screen] unchanged, skipped, elapsed={:?}", t0.elapsed());
        return Ok(tauri::ipc::Response::new(Vec::new()));
    }
    eprintln!("[capture_screen] crop=({cx},{cy},{cw}x{ch}) of {img_w}x{img_h} on monitor({mon_x},{mon_y}), elapsed={:?}", t0.elapsed());
    let mut buf = std::io::Cursor::new(Vec::new());
    cropped
        .write_to(&mut buf, image::ImageFormat::Jpeg)
        .map_err(|e| CommandError(format!("Failed to encode JPEG: {e}")))?;
    Ok(tauri::ipc::Response::new(buf.into_inner()))
}

// 降采样整图对比相邻两帧：静态画面直接跳过 JPEG 编码和 IPC 传输。
// 缩略图全像素比较，阈值 0.5%：光标闪烁不计入，文字变化必然超过。
// 前端另有 ~5s 心跳强制 OCR 兜底，即使漏检也不会永久卡住。
#[cfg(desktop)]
static LAST_FRAME: std::sync::Mutex<Option<Vec<u8>>> = std::sync::Mutex::new(None);

#[cfg(desktop)]
fn frame_changed(img: &image::DynamicImage) -> bool {
    const THUMB_W: u32 = 128;
    const THUMB_H: u32 = 64;
    let thumb = image::imageops::resize(img, THUMB_W, THUMB_H, image::imageops::FilterType::Triangle);
    let gray = image::imageops::grayscale(&thumb);
    let data = gray.into_raw();
    let mut guard = LAST_FRAME.lock().unwrap();
    let changed = match guard.as_ref() {
        Some(prev) if prev.len() == data.len() => {
            let mut diff = 0usize;
            for (a, b) in prev.iter().zip(data.iter()) {
                if (*a as i32 - *b as i32).abs() > 16 {
                    diff += 1;
                }
            }
            diff * 1000 / data.len().max(1) > 5
        }
        _ => true,
    };
    if changed {
        *guard = Some(data);
    }
    changed
}

#[tauri::command]
fn frontend_log(msg: String) {
    eprintln!("[frontend] {msg}");
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Exameow is ready.", name)
}

#[cfg(desktop)]
fn place_window(win: &tauri::WebviewWindow, x: f64, y: f64, w: f64, h: f64) -> Result<(), CommandError> {
    use tauri::{PhysicalPosition, PhysicalSize};
    win.set_position(PhysicalPosition::new(x as i32, y as i32))
        .map_err(|e| CommandError(format!("Failed to position window: {e}")))?;
    win.set_size(PhysicalSize::new(w.max(1.0) as u32, h.max(1.0) as u32))
        .map_err(|e| CommandError(format!("Failed to size window: {e}")))?;
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
async fn create_record_windows(app: tauri::AppHandle) -> Result<(), CommandError> {
    if let Some(w) = app.get_webview_window("record-overlay") { w.close().ok(); }
    if let Some(w) = app.get_webview_window("answer-float") { w.close().ok(); }

    *LAST_FRAME.lock().unwrap() = None;

    // Geometry is computed here (not in JS) on the monitor hosting the main
    // window, in physical pixels: window.screen in the webview only covers the
    // current monitor and Tauri's builder position/inner_size are logical, so
    // JS-side math breaks on multi-monitor or scaled (125%/150%) displays.
    let main_win = app.get_webview_window("main");
    let monitor = main_win
        .as_ref()
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| main_win.as_ref().and_then(|w| w.primary_monitor().ok().flatten()))
        .ok_or_else(|| CommandError("No monitor found".to_string()))?;

    let sf = monitor.scale_factor();
    let mx = monitor.position().x as f64;
    let my = monitor.position().y as f64;
    let mw = monitor.size().width as f64;
    let mh = monitor.size().height as f64;

    let overlay_w = (mw * 0.6).round();
    let overlay_h = (mh * 0.4).round();
    let overlay_x = (mx + (mw - overlay_w) / 2.0).round();
    let overlay_y = (my + mh * 0.08).round();

    let float_w = (340.0 * sf).round();
    let float_h = (320.0 * sf).round();
    let float_x = (mx + mw - float_w - 20.0 * sf).round();
    let float_y = (my + mh - float_h - 40.0 * sf).round();

    #[cfg(debug_assertions)]
    let overlay_url = tauri::WebviewUrl::External("http://localhost:5273/#/src-windows/record-overlay".parse().unwrap());
    #[cfg(not(debug_assertions))]
    let overlay_url = tauri::WebviewUrl::App("/index.html#/src-windows/record-overlay".into());

    let _overlay = tauri::WebviewWindowBuilder::new(
        &app,
        "record-overlay",
        overlay_url,
    )
    // Windows quirk: a transparent window created hidden renders an opaque
    // white background when shown later (until moved/resized), so create it
    // visible with logical geometry, then correct with physical values below.
    .position(overlay_x / sf, overlay_y / sf)
    .inner_size(overlay_w / sf, overlay_h / sf)
    .min_inner_size(240.0, 120.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .resizable(true)
    .visible(true)
    .build()
    .map_err(|e| CommandError(format!("Failed to create record-overlay: {e}")))?;

    #[cfg(target_os = "macos")]
    make_webview_transparent(&_overlay);

    place_window(&_overlay, overlay_x, overlay_y, overlay_w, overlay_h)?;

    #[cfg(debug_assertions)]
    let float_url = tauri::WebviewUrl::External("http://localhost:5273/#/src-windows/answer-float".parse().unwrap());
    #[cfg(not(debug_assertions))]
    let float_url = tauri::WebviewUrl::App("/index.html#/src-windows/answer-float".into());

    let _float = tauri::WebviewWindowBuilder::new(
        &app,
        "answer-float",
        float_url,
    )
    .position(float_x / sf, float_y / sf)
    .inner_size(float_w / sf, float_h / sf)
    .min_inner_size(280.0, 200.0)
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .resizable(true)
    .visible(true)
    .build()
    .map_err(|e| CommandError(format!("Failed to create answer-float: {e}")))?;

    #[cfg(target_os = "macos")]
    make_webview_transparent(&_float);

    place_window(&_float, float_x, float_y, float_w, float_h)?;

    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
async fn create_record_windows(_app: tauri::AppHandle) -> Result<(), CommandError> {
    Err(CommandError(
        "Recording windows are only supported on desktop".to_string(),
    ))
}

#[cfg(desktop)]
#[tauri::command]
fn close_record_windows(app: tauri::AppHandle) -> Result<(), CommandError> {
    if let Some(w) = app.get_webview_window("record-overlay") {
        w.close().ok();
    }
    if let Some(w) = app.get_webview_window("answer-float") {
        w.close().ok();
    }
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
fn close_record_windows(_app: tauri::AppHandle) -> Result<(), CommandError> {
    Ok(())
}

#[cfg(desktop)]
#[tauri::command]
fn resize_record_overlay(app: tauri::AppHandle, w: f64, h: f64) -> Result<(), CommandError> {
    if let Some(win) = app.get_webview_window("record-overlay") {
        use tauri::Size;
        win.set_size(Size::Logical((w, h).into()))
            .map_err(|e| CommandError(format!("Failed to resize: {e}")))?;
    }
    Ok(())
}

#[cfg(not(desktop))]
#[tauri::command]
fn resize_record_overlay(_app: tauri::AppHandle, _w: f64, _h: f64) -> Result<(), CommandError> {
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut context = tauri::generate_context!();
    #[cfg(mobile)]
    {
        let embedded = context.set_assets(Box::new(ota::OtaAssets::uninit()));
        context.set_assets(Box::new(ota::OtaAssets::new(embedded)));
    }
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sharekit::init())
        .plugin(tauri_plugin_screenrecord::init());
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());
    builder
        .setup(|app| {
            let config = &app.config().app.windows[0];
            let mut builder = tauri::WebviewWindowBuilder::from_config(app.handle(), config)?;

            #[cfg(target_os = "macos")]
            {
                builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
            }

            #[cfg(any(target_os = "windows", target_os = "linux"))]
            {
                builder = builder.decorations(false);
            }

            let window = builder.build()?;

            #[cfg(not(target_os = "android"))]
            window.show()?;

            #[cfg(target_os = "macos")]
            setup_dock_icon();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_models,
            generate_exam,
            answer_question,
            judge_answer,
            explain_question,
            parse_file_text,
            parse_file_bytes,
            export_csv,
            export_xlsx,
            export_xlsx_data,
            write_file,
            save_to_cache,
            save_to_downloads,
            save_config,
            load_config,
            open_app_settings,
            capture_screen,
            check_screen_permission,
            request_screen_permission,
            open_screen_recording_settings,
            frontend_log,
            create_record_windows,
            close_record_windows,
            resize_record_overlay,
            ota::ota_check,
            ota::ota_download,
            ota::ota_notify_ready,
            ota::ota_current,
            ota::ota_reset,
        ])
        .run(context)
        .expect("error while running tauri application");
}
