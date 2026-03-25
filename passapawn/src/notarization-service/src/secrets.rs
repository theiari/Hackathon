use std::collections::HashMap;
use std::fs;

pub trait SecretProvider: Send + Sync {
    fn get_secret(&self, name: &str) -> Option<String>;
}

#[derive(Clone)]
pub struct EnvAndFileSecretProvider {
    file_cache: HashMap<String, String>,
}

impl EnvAndFileSecretProvider {
    pub fn new(file_path: Option<&str>) -> Self {
        let file_cache = file_path
            .and_then(|path| fs::read_to_string(path).ok())
            .and_then(|content| serde_json::from_str::<HashMap<String, String>>(&content).ok())
            .unwrap_or_default();
        Self { file_cache }
    }
}

impl SecretProvider for EnvAndFileSecretProvider {
    fn get_secret(&self, name: &str) -> Option<String> {
        std::env::var(name)
            .ok()
            .or_else(|| self.file_cache.get(name).cloned())
    }
}
