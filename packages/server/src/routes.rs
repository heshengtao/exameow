use axum::{
    extract::{Multipart, Query, State},
    http::{header, StatusCode},
    response::Response,
    Json,
};
use exameow_core::ai::{AIClient, AIOptions, ModelInfo};
use exameow_core::config::{AIConfigData, ConfigStore};
use exameow_core::exam::{
    answer_question, explain_question, generate_exam, judge_answer, AnswerResult, ExamParams, ExplainResult, JudgeResult, Question,
};
use exameow_core::parser::parse_file;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub config_store: ConfigStore,
    pub relay: crate::relay::RelayState,
    pub admin_token: Mutex<String>,
}

#[derive(Deserialize)]
pub struct ModelsQuery {
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
}

#[derive(Serialize)]
pub struct GenerateResult {
    pub questions: Vec<Question>,
}

#[derive(Deserialize)]
pub struct ExportQuery {
    pub questions: String,
}

fn ai_endpoint() -> String { std::env::var("AI_ENDPOINT").unwrap_or_default() }
fn ai_api_key() -> String { std::env::var("AI_API_KEY").unwrap_or_default() }
fn ai_model() -> String { std::env::var("AI_MODEL").unwrap_or_default() }

pub async fn get_models(
    Query(params): Query<ModelsQuery>,
) -> Result<Json<Vec<ModelInfo>>, (StatusCode, String)> {
    let endpoint = params.endpoint.as_deref().unwrap_or("");
    let api_key = params.api_key.as_deref().unwrap_or("");

    let (endpoint, api_key) = if endpoint.is_empty() || api_key.is_empty() {
        let e = ai_endpoint();
        let k = ai_api_key();
        if e.is_empty() || k.is_empty() {
            return Err((StatusCode::BAD_REQUEST, "No AI config (set AI_ENDPOINT/AI_API_KEY env vars)".to_string()));
        }
        (e, k)
    } else {
        (endpoint.to_string(), api_key.to_string())
    };

    let client = AIClient::new(&endpoint, &api_key);
    let models = client
        .fetch_models()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("AI error: {e}")))?;
    Ok(Json(models))
}

pub async fn generate_exam_handler(
    State(_state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<GenerateResult>, (StatusCode, String)> {
    let mut file_data: Option<Vec<u8>> = None;
    let mut file_name = String::new();
    let mut params_json = String::new();
    let mut endpoint = String::new();
    let mut api_key = String::new();
    let mut model = String::new();
    let mut options: Option<AIOptions> = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                file_name = field.file_name().unwrap_or("unknown").to_string();
                file_data = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
                        .to_vec(),
                );
            }
            "params" => {
                params_json = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
            }
            "endpoint" => {
                endpoint = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
            }
            "api_key" => {
                api_key = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
            }
            "options" => {
                let json = field.text().await.map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
                options = Some(serde_json::from_str(&json).map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid AI options: {e}")))?);
            }
            "model" => {
                model = field
                    .text()
                    .await
                    .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?
            }
            _ => {}
        }
    }

    let file_data =
        file_data.ok_or((StatusCode::BAD_REQUEST, "No file uploaded".to_string()))?;

    let endpoint = if endpoint.is_empty() { ai_endpoint() } else { endpoint };
    let api_key = if api_key.is_empty() { ai_api_key() } else { api_key };
    let model = if model.is_empty() { ai_model() } else { model };

    if endpoint.is_empty() || api_key.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "No AI config (set AI_ENDPOINT/AI_API_KEY env vars)".to_string()));
    }

    let params: ExamParams = serde_json::from_str(&params_json)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid params: {e}")))?;

    let ext = file_name.rsplit_once('.').map(|(_, e)| e).unwrap_or("txt");
    let mut temp_file = tempfile::Builder::new()
        .suffix(&format!(".{ext}"))
        .tempfile()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    temp_file
        .write_all(&file_data)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    let (_, temp_path) = temp_file
        .keep()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let temp_path_str = temp_path.to_string_lossy().to_string();

    let text = parse_file(&temp_path_str)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Parse error: {e}")))?;

    let _ = std::fs::remove_file(&temp_path_str);

    let client = AIClient::new(&endpoint, &api_key).with_options(options)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let questions = generate_exam(&client, &text, &params, &model)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("AI error: {e}")))?;

    Ok(Json(GenerateResult { questions }))
}

pub async fn export_handler(
    Query(params): Query<ExportQuery>,
) -> Result<Response, (StatusCode, String)> {
    let questions: Vec<Question> = serde_json::from_str(&params.questions)
        .map_err(|e| (StatusCode::BAD_REQUEST, format!("Invalid questions JSON: {e}")))?;

    let mut buf = vec![];
    exameow_core::export::export_csv_to_writer(&questions, &mut buf)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Response::builder()
        .header(header::CONTENT_TYPE, "text/csv; charset=utf-8")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"questions.csv\"",
        )
        .body(axum::body::Body::from(buf))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn export_xlsx_handler(
    Json(questions): Json<Vec<Question>>,
) -> Result<Response, (StatusCode, String)> {
    let data = exameow_core::export::export_xlsx_to_writer(&questions)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Response::builder()
        .header(
            header::CONTENT_TYPE,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"exameow_questions.xlsx\"",
        )
        .body(axum::body::Body::from(data))
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

pub async fn save_config_handler(
    State(_state): State<Arc<AppState>>,
    Json(config): Json<AIConfigData>,
) -> Result<StatusCode, (StatusCode, String)> {
    _state
        .config_store
        .save(&config.endpoint, &config.api_key, &config.model)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Save error: {e}")))?;
    Ok(StatusCode::OK)
}

pub async fn load_config_handler(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Option<AIConfigData>>, (StatusCode, String)> {
    let config = _state
        .config_store
        .load()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("Load error: {e}")))?;
    Ok(Json(config))
}

#[derive(Deserialize)]
pub struct AnswerRequest {
    pub question: String,
    pub language: Option<String>,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub options: Option<AIOptions>,
}

pub async fn answer_handler(
    Json(req): Json<AnswerRequest>,
) -> Result<Json<AnswerResult>, (StatusCode, String)> {
    if req.question.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Question is empty".to_string()));
    }

    let endpoint = req
        .endpoint
        .filter(|s| !s.is_empty())
        .unwrap_or_else(ai_endpoint);
    let api_key = req
        .api_key
        .filter(|s| !s.is_empty())
        .unwrap_or_else(ai_api_key);
    let model = req.model.filter(|s| !s.is_empty()).unwrap_or_else(ai_model);

    if endpoint.is_empty() || api_key.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "No AI config (set AI_ENDPOINT/AI_API_KEY env vars)".to_string(),
        ));
    }

    let language = req.language.filter(|s| !s.is_empty()).unwrap_or_else(|| "Chinese".to_string());

    let client = AIClient::new(&endpoint, &api_key).with_options(req.options)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let result = answer_question(&client, &req.question, &language, &model)
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("AI error: {e}")))?;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct JudgeRequest {
    pub stem: String,
    pub reference_answer: String,
    pub analysis: Option<String>,
    pub user_answer: String,
    pub language: Option<String>,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub options: Option<AIOptions>,
}

pub async fn judge_handler(
    Json(req): Json<JudgeRequest>,
) -> Result<Json<JudgeResult>, (StatusCode, String)> {
    if req.user_answer.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "User answer is empty".to_string()));
    }

    let endpoint = req
        .endpoint
        .filter(|s| !s.is_empty())
        .unwrap_or_else(ai_endpoint);
    let api_key = req
        .api_key
        .filter(|s| !s.is_empty())
        .unwrap_or_else(ai_api_key);
    let model = req.model.filter(|s| !s.is_empty()).unwrap_or_else(ai_model);

    if endpoint.is_empty() || api_key.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "No AI config (set AI_ENDPOINT/AI_API_KEY env vars)".to_string(),
        ));
    }

    let language = req.language.filter(|s| !s.is_empty()).unwrap_or_else(|| "Chinese".to_string());
    let analysis = req.analysis.unwrap_or_default();

    let client = AIClient::new(&endpoint, &api_key).with_options(req.options)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let result = judge_answer(
        &client,
        &req.stem,
        &req.reference_answer,
        &analysis,
        &req.user_answer,
        &language,
        &model,
    )
    .await
    .map_err(|e| (StatusCode::BAD_GATEWAY, format!("AI error: {e}")))?;
    Ok(Json(result))
}

#[derive(Deserialize)]
pub struct ExplainRequest {
    pub stem: String,
    pub reference_answer: String,
    pub analysis: Option<String>,
    pub language: Option<String>,
    pub endpoint: Option<String>,
    pub api_key: Option<String>,
    pub model: Option<String>,
    pub options: Option<AIOptions>,
}

pub async fn explain_handler(
    Json(req): Json<ExplainRequest>,
) -> Result<Json<ExplainResult>, (StatusCode, String)> {
    if req.stem.trim().is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Question is empty".to_string()));
    }

    let endpoint = req
        .endpoint
        .filter(|s| !s.is_empty())
        .unwrap_or_else(ai_endpoint);
    let api_key = req
        .api_key
        .filter(|s| !s.is_empty())
        .unwrap_or_else(ai_api_key);
    let model = req.model.filter(|s| !s.is_empty()).unwrap_or_else(ai_model);

    if endpoint.is_empty() || api_key.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "No AI config (set AI_ENDPOINT/AI_API_KEY env vars)".to_string(),
        ));
    }

    let language = req.language.filter(|s| !s.is_empty()).unwrap_or_else(|| "Chinese".to_string());
    let analysis = req.analysis.unwrap_or_default();

    let client = AIClient::new(&endpoint, &api_key).with_options(req.options)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;
    let result = explain_question(
        &client,
        &req.stem,
        &req.reference_answer,
        &analysis,
        &language,
        &model,
    )
    .await
    .map_err(|e| (StatusCode::BAD_GATEWAY, format!("AI error: {e}")))?;
    Ok(Json(result))
}

#[derive(Serialize)]
pub struct ServerConfigInfo {
    pub has_env_ai: bool,
    pub endpoint: String,
    pub model: String,
}

pub async fn server_config_info_handler() -> Json<ServerConfigInfo> {
    let endpoint = ai_endpoint();
    let api_key = ai_api_key();
    let model = ai_model();
    Json(ServerConfigInfo {
        has_env_ai: !endpoint.is_empty() && !api_key.is_empty(),
        endpoint,
        model,
    })
}
