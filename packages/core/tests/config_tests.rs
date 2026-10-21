use exameow_core::config::{AIConfigData, ConfigStore};

#[test]
fn test_save_and_load_config() {
    let store = ConfigStore::new("ExameowTest").unwrap();
    store
        .save(&AIConfigData {
            endpoint: "https://api.openai.com/v1".to_string(),
            api_key: "sk-test-key-123".to_string(),
            model: "gpt-4".to_string(),
            max_tokens: Some(4096),
            token_parameter: Some("max_completion_tokens".to_string()),
            temperature: Some(0.3),
            omit_temperature: false,
            reasoning_effort: Some("high".to_string()),
            extra_prompt: Some("Be terse".to_string()),
            retries: Some(2),
            timeout_seconds: Some(300),
            search: None,
        })
        .unwrap();

    let config = store.load().unwrap().unwrap();
    assert_eq!(config.endpoint, "https://api.openai.com/v1");
    assert_eq!(config.api_key, "sk-test-key-123");
    assert_eq!(config.model, "gpt-4");
    assert_eq!(config.max_tokens, Some(4096));
    assert_eq!(config.token_parameter.as_deref(), Some("max_completion_tokens"));
    assert_eq!(config.temperature, Some(0.3));
    assert_eq!(config.reasoning_effort.as_deref(), Some("high"));
    assert_eq!(config.retries, Some(2));
    assert_eq!(config.timeout_seconds, Some(300));
}

#[test]
fn test_load_nonexistent() {
    let store = ConfigStore::new("ExameowNonExistent").unwrap();
    let config = store.load().unwrap();
    assert!(config.is_none());
}
