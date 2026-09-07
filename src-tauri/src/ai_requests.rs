use std::{collections::HashMap, future::Future, sync::{LazyLock, Mutex}};
use tokio::sync::oneshot;
use crate::CommandError;

static REQUESTS: LazyLock<Mutex<HashMap<String, oneshot::Sender<()>>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

pub async fn run<T>(id: Option<String>, request: impl Future<Output = Result<T, CommandError>>) -> Result<T, CommandError> {
    let Some(id) = id else { return request.await; };
    let (sender, receiver) = oneshot::channel();
    REQUESTS.lock().unwrap().insert(id.clone(), sender);
    struct Cleanup(String);
    impl Drop for Cleanup {
        fn drop(&mut self) { REQUESTS.lock().unwrap().remove(&self.0); }
    }
    let _cleanup = Cleanup(id);
    tokio::select! {
        result = request => result,
        _ = receiver => Err(CommandError("AI request cancelled".into())),
    }
}

#[tauri::command]
pub fn cancel_ai_request(request_id: String) {
    if let Some(sender) = REQUESTS.lock().unwrap().remove(&request_id) {
        let _ = sender.send(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancellation_drops_request_and_cleans_registry() {
        let (started, ready) = oneshot::channel();
        let request = tokio::spawn(run(Some("cancel-test".into()), async {
            started.send(()).unwrap();
            std::future::pending::<Result<(), CommandError>>().await
        }));
        ready.await.unwrap();
        cancel_ai_request("cancel-test".into());
        assert!(request.await.unwrap().is_err());
        assert!(!REQUESTS.lock().unwrap().contains_key("cancel-test"));
    }
}
