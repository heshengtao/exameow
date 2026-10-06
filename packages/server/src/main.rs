mod relay;
mod routes;

use axum::{
    routing::{delete, get, post},
    Router,
};
use std::sync::{Arc, Mutex};
use routes::AppState;
use exameow_core::config::ConfigStore;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    let config_store = ConfigStore::new("ExameowServer").unwrap_or_else(|_| {
        eprintln!("Warning: could not init config store, using transient store");
        ConfigStore::new("ExameowServerTransient").unwrap()
    });
    let db_path = std::env::var("EXAM_DB_PATH").unwrap_or_else(|_| "./exameow.db".to_string());
    let relay = relay::init_db(&db_path).unwrap_or_else(|e| panic!("failed to init exam db at {db_path}: {e}"));
    let admin_token = relay::load_admin_token();
    if admin_token == "pass" {
        println!("WARNING: ADMIN_TOKEN is the default \"pass\" — change it at /#/admin before exposing this server");
    }

    let state = Arc::new(AppState {
        config_store,
        relay,
        admin_token: Mutex::new(admin_token),
    });

    {
        let state = state.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(3600));
            loop {
                interval.tick().await;
                relay::cleanup_expired(&state.relay);
            }
        });
    }

    let static_dir =
        std::env::var("STATIC_DIR").unwrap_or_else(|_| "../frontend/dist".to_string());

    let app = Router::new()
        .route("/api/models", get(routes::get_models))
        .route("/api/generate", post(routes::generate_exam_handler))
        .route("/api/answer", post(routes::answer_handler))
        .route("/api/judge", post(routes::judge_handler))
        .route("/api/explain", post(routes::explain_handler))
        .route("/api/chat", post(routes::chat_handler))
        .route("/api/export", get(routes::export_handler))
        .route("/api/export/xlsx", post(routes::export_xlsx_handler))
        .route("/api/config/save", post(routes::save_config_handler))
        .route("/api/config/load", get(routes::load_config_handler))
        .route("/api/config/server", get(routes::server_config_info_handler))
        .route("/api/exam/publish", post(relay::publish_handler))
        .route("/api/exam/code/{code}", get(relay::get_exam_handler).delete(relay::delete_exam_handler))
        .route("/api/exam/code/{code}/submit", post(relay::submit_handler))
        .route("/api/exam/code/{code}/results", get(relay::results_handler))
        .route("/api/exam/code/{code}/report", post(relay::report_handler))
        .route("/api/exam/admin/reports", get(relay::admin_reports_handler))
        .route("/api/exam/admin/code/{code}", delete(relay::admin_delete_handler))
        .route("/api/exam/admin/code/{code}/restore", post(relay::admin_restore_handler))
        .route("/api/exam/admin/token", post(relay::admin_change_token_handler))
        .fallback_service(ServeDir::new(&static_dir))
        .layer(CorsLayer::new().allow_origin(Any).allow_methods(Any).allow_headers(Any))
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3000);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .unwrap();
    println!("Exameow server running on http://0.0.0.0:{port}");
    axum::serve(listener, app).await.unwrap();
}
