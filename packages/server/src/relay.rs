use axum::{
    body::Body,
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::Response,
    Json,
};
use base64::Engine as _;
use exameow_core::exam::Question;
use rand::Rng;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

const CODE_ALPHABET: &[u8] = b"ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_AGE_MS: i64 = 7 * 24 * 60 * 60 * 1000;
const MAX_QUESTIONS: usize = 500;
const MAX_PUBLISH_PER_DAY: i64 = 20;
const REPORT_SUSPEND_THRESHOLD: i64 = 3;
const MAX_WINDOW_MS: i64 = 7 * 24 * 60 * 60 * 1000;
const MAX_MEDIA_BYTES_PER_IMAGE: usize = 8 * 1024 * 1024;
const MAX_MEDIA_BYTES_TOTAL: usize = 60 * 1024 * 1024;

pub struct RelayState {
    pub conn: Mutex<Connection>,
}

type Err = (StatusCode, String);

fn err(status: StatusCode, code: &str) -> Err {
    (status, serde_json::json!({ "error": code }).to_string())
}

fn num(v: f64) -> serde_json::Value {
    if v.fract() == 0.0 {
        serde_json::Value::from(v as i64)
    } else {
        serde_json::Number::from_f64(v).map(serde_json::Value::Number).unwrap_or(serde_json::Value::from(0))
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn today() -> String {
    let secs = now_ms() / 1000;
    let days = secs / 86400;
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

fn civil_from_days(z: i64) -> (i64, i64, i64) {
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    (if m <= 2 { y + 1 } else { y }, m, d)
}

fn gen_code() -> String {
    let mut rng = rand::thread_rng();
    (0..6)
        .map(|_| CODE_ALPHABET[rng.gen_range(0..CODE_ALPHABET.len())] as char)
        .collect()
}

fn gen_token() -> String {
    let bytes: [u8; 16] = rand::thread_rng().gen();
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn sha256_hex(text: &str) -> String {
    let mut h = Sha256::new();
    h.update(text.as_bytes());
    h.finalize().iter().map(|b| format!("{b:02x}")).collect()
}

pub fn init_db(path: &str) -> Result<RelayState, String> {
    let conn = Connection::open(path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS exams (
          code TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          questions TEXT NOT NULL,
          start_at INTEGER NOT NULL,
          end_at INTEGER NOT NULL,
          duration_minutes INTEGER NOT NULL,
          created_at INTEGER NOT NULL,
          admin_token_hash TEXT NOT NULL,
          suspended INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS results (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          name TEXT NOT NULL,
          answers TEXT NOT NULL,
          score REAL NOT NULL,
          total_score REAL NOT NULL,
          correct_count INTEGER NOT NULL,
          total_count INTEGER NOT NULL,
          pending_count INTEGER NOT NULL,
          duration_sec INTEGER NOT NULL,
          submitted_at INTEGER NOT NULL,
          detail TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_results_code ON results(code);
        CREATE TABLE IF NOT EXISTS reports (
          id TEXT PRIMARY KEY,
          code TEXT NOT NULL,
          ip TEXT NOT NULL,
          reason TEXT NOT NULL,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_reports_code ON reports(code);
        CREATE TABLE IF NOT EXISTS publish_limits (
          ip TEXT NOT NULL,
          day TEXT NOT NULL,
          count INTEGER NOT NULL,
          PRIMARY KEY (ip, day)
        );
        CREATE TABLE IF NOT EXISTS exam_media (
          code TEXT NOT NULL,
          image_id TEXT NOT NULL,
          mime TEXT NOT NULL,
          bytes BLOB NOT NULL,
          PRIMARY KEY (code, image_id)
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(RelayState {
        conn: Mutex::new(conn),
    })
}

pub fn cleanup_expired(state: &RelayState) {
    let cutoff = now_ms() - MAX_AGE_MS;
    let day_cutoff = {
        let secs = (now_ms() - 2 * 24 * 60 * 60 * 1000) / 1000;
        let days = secs / 86400;
        let (y, m, d) = civil_from_days(days);
        format!("{y:04}-{m:02}-{d:02}")
    };
    if let Ok(conn) = state.conn.lock() {
        let _ = conn.execute("DELETE FROM exams WHERE created_at < ?1", params![cutoff]);
        let _ = conn.execute("DELETE FROM results WHERE submitted_at < ?1", params![cutoff]);
        let _ = conn.execute("DELETE FROM reports WHERE created_at < ?1", params![cutoff]);
        let _ = conn.execute("DELETE FROM publish_limits WHERE day < ?1", params![day_cutoff]);
        let _ = conn.execute("DELETE FROM exam_media WHERE code NOT IN (SELECT code FROM exams)", []);
    }
}

struct StoredExam {
    title: String,
    questions: Vec<Question>,
    start_at: i64,
    end_at: i64,
    duration_minutes: i64,
    created_at: i64,
    admin_token_hash: String,
    suspended: i64,
}

fn read_exam(conn: &Connection, code: &str) -> Result<Option<StoredExam>, Err> {
    let row = conn
        .query_row(
            "SELECT title, questions, start_at, end_at, duration_minutes, created_at, admin_token_hash, suspended FROM exams WHERE code = ?1",
            params![code],
            |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, i64>(2)?,
                    r.get::<_, i64>(3)?,
                    r.get::<_, i64>(4)?,
                    r.get::<_, i64>(5)?,
                    r.get::<_, String>(6)?,
                    r.get::<_, i64>(7)?,
                ))
            },
        )
        .ok();
    let Some((title, questions, start_at, end_at, duration_minutes, created_at, admin_token_hash, suspended)) = row else {
        return Ok(None);
    };
    if now_ms() - created_at > MAX_AGE_MS {
        let _ = conn.execute("DELETE FROM exams WHERE code = ?1", params![code]);
        let _ = conn.execute("DELETE FROM results WHERE code = ?1", params![code]);
        let _ = conn.execute("DELETE FROM reports WHERE code = ?1", params![code]);
        let _ = conn.execute("DELETE FROM exam_media WHERE code = ?1", params![code]);
        return Ok(None);
    }
    let questions: Vec<Question> = serde_json::from_str(&questions)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Some(StoredExam {
        title,
        questions,
        start_at,
        end_at,
        duration_minutes,
        created_at,
        admin_token_hash,
        suspended,
    }))
}

fn window_check(exam: &StoredExam) -> Option<Err> {
    let now = now_ms();
    if now < exam.start_at {
        return Some((
            StatusCode::FORBIDDEN,
            serde_json::json!({ "error": "not_started", "startAt": exam.start_at }).to_string(),
        ));
    }
    if now > exam.end_at {
        return Some(err(StatusCode::FORBIDDEN, "ended"));
    }
    None
}

fn normalize_choice(s: &str) -> String {
    let mut chars: Vec<char> = s
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| ('A'..='H').contains(c))
        .collect();
    chars.sort();
    chars.into_iter().collect()
}

fn is_true_answer(a: &str) -> bool {
    const ALIASES: &[&str] = &["A", "√", "对", "正确", "TRUE", "T", "是", "YES", "Y", "1"];
    const NEGATIONS: &[char] = &['不', '非', '错', '没'];
    let t = a.trim();
    let upper = t.to_uppercase();
    ALIASES.iter().any(|v| {
        upper == v.to_uppercase()
            || (v.chars().count() > 1 && t.contains(v) && !t.replacen(v, "", 1).chars().any(|c| NEGATIONS.contains(&c)))
    })
}

fn grade(q: &Question, user: Option<&str>) -> Option<bool> {
    if q.qtype == exameow_core::exam::QuestionType::ShortAnswer {
        return None;
    }
    let u = user?;
    if u.trim().is_empty() {
        return Some(false);
    }
    match q.qtype {
        exameow_core::exam::QuestionType::SingleChoice | exameow_core::exam::QuestionType::MultiChoice => {
            Some(normalize_choice(u) == normalize_choice(&q.answer))
        }
        exameow_core::exam::QuestionType::TrueFalse => Some(is_true_answer(u) == is_true_answer(&q.answer)),
        exameow_core::exam::QuestionType::FillBlank => {
            Some(u.trim().to_lowercase() == q.answer.trim().to_lowercase())
        }
        exameow_core::exam::QuestionType::ShortAnswer => None,
    }
}

fn client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string())
}

pub fn admin_token_valid(state: &crate::routes::AppState, headers: &HeaderMap) -> bool {
    let Ok(token) = state.admin_token.lock() else { return false };
    headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .map(|v| v == format!("Bearer {}", token.as_str()))
        .unwrap_or(false)
}

#[derive(Deserialize)]
pub struct PublishReq {
    title: Option<String>,
    questions: Option<Vec<Question>>,
    #[serde(rename = "startAt")]
    start_at: Option<i64>,
    #[serde(rename = "endAt")]
    end_at: Option<i64>,
    #[serde(rename = "durationMinutes")]
    duration_minutes: Option<i64>,
    /// image_id -> base64 payload. Only ids referenced by `questions` are stored.
    images: Option<HashMap<String, MediaPayload>>,
}

#[derive(Deserialize)]
pub struct MediaPayload {
    mime: Option<String>,
    data: Option<String>,
}

#[derive(Serialize)]
pub struct PublishRes {
    code: String,
    #[serde(rename = "adminToken")]
    admin_token: String,
    #[serde(rename = "manageUrl")]
    manage_url: String,
}

pub async fn publish_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    headers: HeaderMap,
    Json(req): Json<PublishReq>,
) -> Result<Json<PublishRes>, Err> {
    let ip = client_ip(&headers);
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;

    conn.execute(
        "INSERT INTO publish_limits (ip, day, count) VALUES (?1, ?2, 1) ON CONFLICT(ip, day) DO UPDATE SET count = count + 1",
        params![ip, today()],
    )
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let count: i64 = conn
        .query_row(
            "SELECT count FROM publish_limits WHERE ip = ?1 AND day = ?2",
            params![ip, today()],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if count > MAX_PUBLISH_PER_DAY {
        return Err(err(StatusCode::TOO_MANY_REQUESTS, "rate_limited"));
    }

    let title = req.title.filter(|t| !t.trim().is_empty()).ok_or(err(StatusCode::BAD_REQUEST, "title_required"))?;
    let questions = req.questions.filter(|q| !q.is_empty() && q.len() <= MAX_QUESTIONS).ok_or(err(StatusCode::BAD_REQUEST, "invalid_questions"))?;
    let (Some(start_at), Some(end_at), Some(duration_minutes)) = (req.start_at, req.end_at, req.duration_minutes) else {
        return Err(err(StatusCode::BAD_REQUEST, "invalid_window"));
    };
    if start_at >= end_at || duration_minutes <= 0 || end_at - start_at > MAX_WINDOW_MS {
        return Err(err(StatusCode::BAD_REQUEST, "invalid_window"));
    }
    let questions_json = serde_json::to_string(&questions).map_err(|e| err(StatusCode::BAD_REQUEST, &e.to_string()))?;
    if questions_json.len() > 5 * 1024 * 1024 {
        return Err(err(StatusCode::BAD_REQUEST, "payload_too_large"));
    }

    let mut code = gen_code();
    for _ in 0..5 {
        let exists: bool = conn
            .query_row("SELECT 1 FROM exams WHERE code = ?1", params![code], |_| Ok(()))
            .is_ok();
        if !exists {
            break;
        }
        code = gen_code();
    }

    let admin_token = gen_token();
    conn.execute(
        "INSERT INTO exams (code, title, questions, start_at, end_at, duration_minutes, created_at, admin_token_hash, suspended) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0)",
        params![code, title.trim(), questions_json, start_at, end_at, duration_minutes, now_ms(), sha256_hex(&admin_token)],
    )
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    if let Some(images) = req.images {
        let referenced: HashSet<String> = questions
            .iter()
            .flat_map(|q| q.images.clone().unwrap_or_default())
            .collect();
        let mut total_bytes = 0usize;
        for (image_id, payload) in images {
            if !referenced.contains(&image_id) {
                continue;
            }
            let Some(data) = payload.data else { continue };
            let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(data) else {
                continue;
            };
            if bytes.is_empty()
                || bytes.len() > MAX_MEDIA_BYTES_PER_IMAGE
                || total_bytes + bytes.len() > MAX_MEDIA_BYTES_TOTAL
            {
                continue;
            }
            let mime = payload.mime.unwrap_or_else(|| "image/png".to_string());
            if mime != "image/png" && mime != "image/jpeg" {
                continue;
            }
            total_bytes += bytes.len();
            conn.execute(
                "INSERT OR REPLACE INTO exam_media (code, image_id, mime, bytes) VALUES (?1, ?2, ?3, ?4)",
                params![code, image_id, mime, bytes],
            )
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
        }
    }

    Ok(Json(PublishRes {
        manage_url: format!("/#/manage/{code}?token={admin_token}"),
        code,
        admin_token,
    }))
}

pub async fn get_exam_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    Path(code): Path<String>,
) -> Result<Json<serde_json::Value>, Err> {
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let Some(exam) = read_exam(&conn, &code)? else {
        return Err(err(StatusCode::NOT_FOUND, "not_found"));
    };
    if exam.suspended != 0 {
        return Err(err(StatusCode::FORBIDDEN, "reported"));
    }
    if let Some(e) = window_check(&exam) {
        return Err(e);
    }
    let public: Vec<serde_json::Value> = exam
        .questions
        .iter()
        .map(|q| {
            serde_json::json!({
                "id": q.id,
                "type": q.qtype,
                "stem": q.stem,
                "options": q.options,
                "images": q.images.clone().unwrap_or_default(),
            })
        })
        .collect();
    Ok(Json(serde_json::json!({
        "title": exam.title,
        "questions": public,
        "startAt": exam.start_at,
        "endAt": exam.end_at,
        "durationMinutes": exam.duration_minutes,
    })))
}

#[derive(Deserialize)]
pub struct SubmitReq {
    name: Option<String>,
    answers: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(rename = "durationSec")]
    duration_sec: Option<i64>,
}

pub async fn submit_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    Path(code): Path<String>,
    Json(req): Json<SubmitReq>,
) -> Result<Json<serde_json::Value>, Err> {
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let Some(exam) = read_exam(&conn, &code)? else {
        return Err(err(StatusCode::NOT_FOUND, "not_found"));
    };
    if exam.suspended != 0 {
        return Err(err(StatusCode::FORBIDDEN, "reported"));
    }
    if let Some(e) = window_check(&exam) {
        return Err(e);
    }
    let name = req.name.filter(|n| !n.trim().is_empty()).ok_or(err(StatusCode::BAD_REQUEST, "name_required"))?;
    let duration_sec = req.duration_sec.unwrap_or(0).max(0);
    let empty = serde_json::Map::new();
    let answers = req.answers.as_ref().unwrap_or(&empty);

    let mut graded = Vec::new();
    let mut score = 0.0f64;
    let mut total_score = 0.0f64;
    let mut correct_count = 0i64;
    let mut pending_count = 0i64;
    let mut clean_answers = serde_json::Map::new();
    for q in &exam.questions {
        let user_answer = answers.get(&q.id).and_then(|v| v.as_str()).map(|s| s.to_string());
        if let Some(a) = &user_answer {
            clean_answers.insert(q.id.clone(), serde_json::Value::String(a.clone()));
        }
        let is_correct = grade(q, user_answer.as_deref());
        let points = q.score.filter(|s| *s > 0.0).unwrap_or(1.0);
        match is_correct {
            Some(true) => {
                score += points;
                total_score += points;
                correct_count += 1;
            }
            Some(false) => total_score += points,
            None => pending_count += 1,
        }
        graded.push(serde_json::json!({
            "question": q,
            "userAnswer": user_answer,
            "isCorrect": is_correct,
        }));
    }

    let detail: Vec<serde_json::Value> = graded
        .iter()
        .map(|g| {
            serde_json::json!({
                "questionId": g["question"]["id"],
                "isCorrect": g["isCorrect"],
            })
        })
        .collect();

    conn.execute(
        "INSERT INTO results (id, code, name, answers, score, total_score, correct_count, total_count, pending_count, duration_sec, submitted_at, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            uuid::Uuid::new_v4().to_string(),
            code,
            name.trim(),
            serde_json::to_string(&clean_answers).unwrap_or_default(),
            score,
            total_score,
            correct_count,
            exam.questions.len() as i64,
            pending_count,
            duration_sec,
            now_ms(),
            serde_json::to_string(&detail).unwrap_or_default(),
        ],
    )
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;

    Ok(Json(serde_json::json!({
        "score": num(score),
        "totalScore": num(total_score),
        "correctCount": correct_count,
        "totalCount": exam.questions.len(),
        "pendingCount": pending_count,
        "graded": graded,
    })))
}

#[derive(Deserialize)]
pub struct TokenQuery {
    token: Option<String>,
}

pub async fn results_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    Path(code): Path<String>,
    Query(q): Query<TokenQuery>,
) -> Result<Json<serde_json::Value>, Err> {
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let Some(exam) = read_exam(&conn, &code)? else {
        return Err(err(StatusCode::NOT_FOUND, "not_found"));
    };
    let token = q.token.unwrap_or_default();
    if token.is_empty() || sha256_hex(&token) != exam.admin_token_hash {
        return Err(err(StatusCode::FORBIDDEN, "unauthorized"));
    }
    let mut stmt = conn
        .prepare("SELECT name, answers, score, total_score, correct_count, total_count, pending_count, duration_sec, submitted_at, detail FROM results WHERE code = ?1 ORDER BY score DESC, submitted_at ASC LIMIT 500")
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let rows = stmt
        .query_map(params![code], |r| {
            Ok(serde_json::json!({
                "name": r.get::<_, String>(0)?,
                "answers": serde_json::from_str::<serde_json::Value>(&r.get::<_, String>(1)?).unwrap_or_default(),
                "score": num(r.get::<_, f64>(2)?),
                "totalScore": num(r.get::<_, f64>(3)?),
                "correctCount": r.get::<_, i64>(4)?,
                "totalCount": r.get::<_, i64>(5)?,
                "pendingCount": r.get::<_, i64>(6)?,
                "durationSec": r.get::<_, i64>(7)?,
                "submittedAt": r.get::<_, i64>(8)?,
                "detail": serde_json::from_str::<serde_json::Value>(&r.get::<_, String>(9)?).unwrap_or_default(),
            }))
        })
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let results: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();
    Ok(Json(serde_json::json!({
        "title": exam.title,
        "questions": exam.questions,
        "results": results,
        "endAt": exam.end_at,
    })))
}

pub async fn delete_exam_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    Path(code): Path<String>,
    Query(q): Query<TokenQuery>,
) -> Result<Json<serde_json::Value>, Err> {
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let Some(exam) = read_exam(&conn, &code)? else {
        return Err(err(StatusCode::NOT_FOUND, "not_found"));
    };
    let token = q.token.unwrap_or_default();
    if token.is_empty() || sha256_hex(&token) != exam.admin_token_hash {
        return Err(err(StatusCode::FORBIDDEN, "unauthorized"));
    }
    let _ = conn.execute("DELETE FROM exams WHERE code = ?1", params![code]);
    let _ = conn.execute("DELETE FROM results WHERE code = ?1", params![code]);
    let _ = conn.execute("DELETE FROM reports WHERE code = ?1", params![code]);
    let _ = conn.execute("DELETE FROM exam_media WHERE code = ?1", params![code]);
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn get_media_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    Path((code, image_id)): Path<(String, String)>,
) -> Result<Response, Err> {
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let row: Option<(String, Vec<u8>)> = conn
        .query_row(
            "SELECT mime, bytes FROM exam_media WHERE code = ?1 AND image_id = ?2",
            params![code, image_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok();
    let Some((mime, bytes)) = row else {
        return Err(err(StatusCode::NOT_FOUND, "not_found"));
    };
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "public, max-age=31536000, immutable")
        .body(Body::from(bytes))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Deserialize)]
pub struct ReportReq {
    reason: Option<String>,
}

pub async fn report_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    Path(code): Path<String>,
    headers: HeaderMap,
    Json(req): Json<ReportReq>,
) -> Result<Json<serde_json::Value>, Err> {
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let Some(_exam) = read_exam(&conn, &code)? else {
        return Err(err(StatusCode::NOT_FOUND, "not_found"));
    };
    let reason = req.reason.unwrap_or_default().trim().chars().take(500).collect::<String>();
    conn.execute(
        "INSERT INTO reports (id, code, ip, reason, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![uuid::Uuid::new_v4().to_string(), code, client_ip(&headers), reason, now_ms()],
    )
    .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let ip_count: i64 = conn
        .query_row("SELECT COUNT(DISTINCT ip) FROM reports WHERE code = ?1", params![code], |r| r.get(0))
        .unwrap_or(0);
    if ip_count >= REPORT_SUSPEND_THRESHOLD {
        let _ = conn.execute("UPDATE exams SET suspended = 1 WHERE code = ?1", params![code]);
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn admin_reports_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, Err> {
    if !admin_token_valid(&state, &headers) {
        return Err(err(StatusCode::FORBIDDEN, "unauthorized"));
    }
    if state.admin_token.lock().map(|t| t.as_str() == "pass").unwrap_or(false) {
        return Ok(Json(serde_json::json!({ "need_change": true, "reports": [] })));
    }
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let mut stmt = conn
        .prepare(
            "SELECT r.code, COUNT(*) AS report_count, COUNT(DISTINCT r.ip) AS ip_count,
                    MAX(r.created_at) AS last_reported_at,
                    (SELECT title FROM exams e WHERE e.code = r.code) AS title,
                    (SELECT suspended FROM exams e WHERE e.code = r.code) AS suspended,
                    (SELECT reason FROM reports r2 WHERE r2.code = r.code ORDER BY r2.created_at DESC LIMIT 1) AS last_reason
             FROM reports r GROUP BY r.code ORDER BY ip_count DESC, last_reported_at DESC LIMIT 100",
        )
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let rows = stmt
        .query_map([], |r| {
            Ok(serde_json::json!({
                "code": r.get::<_, String>(0)?,
                "report_count": r.get::<_, i64>(1)?,
                "ip_count": r.get::<_, i64>(2)?,
                "last_reported_at": r.get::<_, i64>(3)?,
                "title": r.get::<_, Option<String>>(4)?,
                "suspended": r.get::<_, Option<i64>>(5)?,
                "last_reason": r.get::<_, Option<String>>(6)?,
            }))
        })
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    let reports: Vec<serde_json::Value> = rows.filter_map(|r| r.ok()).collect();
    Ok(Json(serde_json::json!({ "reports": reports })))
}

pub async fn admin_delete_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
) -> Result<Json<serde_json::Value>, Err> {
    if !admin_token_valid(&state, &headers) {
        return Err(err(StatusCode::FORBIDDEN, "unauthorized"));
    }
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let _ = conn.execute("DELETE FROM exams WHERE code = ?1", params![code]);
    let _ = conn.execute("DELETE FROM results WHERE code = ?1", params![code]);
    let _ = conn.execute("DELETE FROM reports WHERE code = ?1", params![code]);
    let _ = conn.execute("DELETE FROM exam_media WHERE code = ?1", params![code]);
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn admin_restore_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
) -> Result<Json<serde_json::Value>, Err> {
    if !admin_token_valid(&state, &headers) {
        return Err(err(StatusCode::FORBIDDEN, "unauthorized"));
    }
    let conn = state.relay.conn.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "db lock"))?;
    let _ = conn.execute("UPDATE exams SET suspended = 0 WHERE code = ?1", params![code]);
    let _ = conn.execute("DELETE FROM reports WHERE code = ?1", params![code]);
    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct ChangeTokenReq {
    new_token: Option<String>,
}

pub async fn admin_change_token_handler(
    State(state): State<Arc<crate::routes::AppState>>,
    Json(req): Json<ChangeTokenReq>,
) -> Result<Json<serde_json::Value>, Err> {
    let new_token = req
        .new_token
        .map(|t| t.trim().to_string())
        .filter(|t| t.len() >= 8)
        .ok_or(err(StatusCode::BAD_REQUEST, "token_too_short"))?;
    {
        let mut token = state.admin_token.lock().map_err(|_| err(StatusCode::INTERNAL_SERVER_ERROR, "lock"))?;
        *token = new_token.clone();
    }
    let path = std::env::var("ADMIN_TOKEN_FILE").unwrap_or_else(|_| "./admin_token.txt".to_string());
    std::fs::write(&path, &new_token).map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &e.to_string()))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

pub fn load_admin_token() -> String {
    let path = std::env::var("ADMIN_TOKEN_FILE").unwrap_or_else(|_| "./admin_token.txt".to_string());
    if let Ok(saved) = std::fs::read_to_string(&path) {
        let saved = saved.trim().to_string();
        if !saved.is_empty() {
            return saved;
        }
    }
    std::env::var("ADMIN_TOKEN").unwrap_or_else(|_| "pass".to_string())
}
