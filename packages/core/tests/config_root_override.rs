//! Regression test for issue #12: on Android/iOS an app process has neither
//! `HOME` nor `TMPDIR`, so `dirs_next()` cannot resolve a config directory and
//! every `save_config`/`load_config` call failed. The shell now hands core the
//! platform-provided directory through `set_config_root`.

use exameow_core::config::{config_dir, set_config_root, AIConfigData, ConfigStore};

#[test]
fn config_root_override_resolves_and_round_trips() {
    let root = std::env::temp_dir().join(format!("exameow-root-{}", std::process::id()));
    set_config_root(&root);

    let app_dir = config_dir("Exameow").expect("override must always resolve");
    assert_eq!(app_dir, root.join("Exameow"));
    assert!(app_dir.is_dir());

    let store = ConfigStore::new("Exameow").expect("store must initialise under the override");
    let config = AIConfigData {
        endpoint: "https://api.example.com/v1".to_string(),
        api_key: "sk-override".to_string(),
        model: "test-model".to_string(),
        ..Default::default()
    };
    store.save(&config).expect("save must succeed");
    let loaded = store.load().expect("load must succeed").expect("config must exist");
    assert_eq!(loaded.endpoint, "https://api.example.com/v1");
    assert_eq!(loaded.api_key, "sk-override");

    std::fs::remove_dir_all(&root).ok();
}
