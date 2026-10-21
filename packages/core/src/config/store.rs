use crate::error::CoreError;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SearchConfigData {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub provider: String,
    #[serde(default)]
    pub max_results: u32,
    #[serde(default)]
    pub fetch_provider: String,
    #[serde(default)]
    pub max_content_chars: u32,
    #[serde(default)]
    pub crawl_limit: u32,
    #[serde(default)]
    pub keys: HashMap<String, String>,
    #[serde(default)]
    pub tools_enabled: bool,
    #[serde(default)]
    pub max_tool_rounds: u32,
    /// Legacy single key from older versions; kept for config migration only.
    #[serde(default)]
    pub api_key: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AIConfigData {
    pub endpoint: String,
    pub api_key: String,
    pub model: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tokens: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_parameter: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f64>,
    #[serde(default)]
    pub omit_temperature: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extra_prompt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub retries: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timeout_seconds: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub search: Option<SearchConfigData>,
}

pub struct ConfigStore {
    config_path: PathBuf,
    key: [u8; 32],
}

fn seal(key: &[u8; 32], plaintext: &[u8]) -> Result<String, CoreError> {
    let rng = SystemRandom::new();
    let mut nonce_bytes = [0u8; 12];
    rng.fill(&mut nonce_bytes)
        .map_err(|_| CoreError::Config("nonce generation failed".to_string()))?;

    let unbound_key = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|_| CoreError::Config("invalid key".to_string()))?;
    let sealing_key = LessSafeKey::new(unbound_key);

    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut in_out = plaintext.to_vec();
    sealing_key
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| CoreError::Config("encryption failed".to_string()))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&in_out);
    Ok(BASE64.encode(&combined))
}

fn open_sealed(key: &[u8; 32], encoded: &str) -> Result<Vec<u8>, CoreError> {
    let combined = BASE64
        .decode(encoded)
        .map_err(|e| CoreError::Config(format!("decode error: {e}")))?;
    if combined.len() < 12 + 16 {
        return Err(CoreError::Config("config file corrupted".to_string()));
    }
    let nonce_bytes: [u8; 12] = combined[..12].try_into().unwrap();
    let unbound_key = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|_| CoreError::Config("invalid key".to_string()))?;
    let opening_key = LessSafeKey::new(unbound_key);
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);
    let mut in_out = combined[12..].to_vec();
    let plaintext = opening_key
        .open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| CoreError::Config("decryption failed — config may be corrupted".to_string()))?;
    Ok(plaintext.to_vec())
}

impl ConfigStore {
    pub fn new(app_name: &str) -> Result<Self, CoreError> {
        let config_dir = dirs_next().ok_or_else(|| {
            CoreError::Config("cannot determine config directory".to_string())
        })?;
        let app_dir = config_dir.join(app_name);
        std::fs::create_dir_all(&app_dir)
            .map_err(|e| CoreError::Config(format!("cannot create config dir: {e}")))?;

        let config_path = app_dir.join("config.enc");
        let key_path = app_dir.join("key.bin");

        let key = if key_path.exists() {
            let key_bytes = std::fs::read(&key_path)
                .map_err(|e| CoreError::Config(format!("cannot read key: {e}")))?;
            let mut key = [0u8; 32];
            key.copy_from_slice(&key_bytes[..32]);
            key
        } else {
            let rng = SystemRandom::new();
            let mut key = [0u8; 32];
            rng.fill(&mut key)
                .map_err(|_| CoreError::Config("key generation failed".to_string()))?;
            std::fs::write(&key_path, &key)
                .map_err(|e| CoreError::Config(format!("cannot write key: {e}")))?;

            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let mut perms = std::fs::metadata(&key_path)
                    .map_err(|e| CoreError::Config(format!("cannot read key metadata: {e}")))?
                    .permissions();
                perms.set_mode(0o600);
                std::fs::set_permissions(&key_path, perms)
                    .map_err(|e| CoreError::Config(format!("cannot set key permissions: {e}")))?;
            }

            key
        };

        Ok(Self { config_path, key })
    }

    pub fn save(&self, config: &AIConfigData) -> Result<(), CoreError> {
        let plaintext = serde_json::to_vec(config)
            .map_err(|e| CoreError::Config(format!("serialize error: {e}")))?;
        let encoded = seal(&self.key, &plaintext)?;
        std::fs::write(&self.config_path, encoded)
            .map_err(|e| CoreError::Config(format!("write error: {e}")))?;
        Ok(())
    }

    pub fn load(&self) -> Result<Option<AIConfigData>, CoreError> {
        if !self.config_path.exists() {
            return Ok(None);
        }

        let encoded = std::fs::read_to_string(&self.config_path)
            .map_err(|e| CoreError::Config(format!("read error: {e}")))?;
        let plaintext = open_sealed(&self.key, &encoded)?;
        let config: AIConfigData = serde_json::from_slice(&plaintext)
            .map_err(|e| CoreError::Config(format!("deserialize error: {e}")))?;
        Ok(Some(config))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_open_roundtrip() {
        let key = [7u8; 32];
        let sealed = seal(&key, b"hello vision").unwrap();
        let opened = open_sealed(&key, &sealed).unwrap();
        assert_eq!(opened, b"hello vision");
    }

    #[test]
    fn open_rejects_wrong_key() {
        let sealed = seal(&[7u8; 32], b"secret").unwrap();
        assert!(open_sealed(&[8u8; 32], &sealed).is_err());
    }
}

fn dirs_next() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Some(PathBuf::from(home).join("Library").join("Application Support"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(data) = std::env::var("XDG_CONFIG_HOME") {
            if !data.is_empty() {
                return Some(PathBuf::from(data));
            }
        }
        if let Ok(home) = std::env::var("HOME") {
            return Some(PathBuf::from(home).join(".config"));
        }
    }
    #[cfg(target_os = "android")]
    {
        if let Ok(home) = std::env::var("HOME") {
            let p = PathBuf::from(home).join(".config");
            let _ = std::fs::create_dir_all(&p);
            return Some(p);
        }
        if let Ok(tmp) = std::env::var("TMPDIR") {
            return Some(PathBuf::from(tmp));
        }
    }
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            return Some(PathBuf::from(appdata));
        }
    }
    None
}
