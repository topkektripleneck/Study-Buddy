use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("storage: {0}")]
    Storage(String),
    #[error("not found: {0}")]
    NotFound(String),
    #[error("invalid input: {0}")]
    InvalidInput(String),
    #[error("timer: {0}")]
    Timer(String),
    #[error("window: {0}")]
    Window(String),
}

impl From<AppError> for String {
    fn from(value: AppError) -> Self {
        value.to_string()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiError {
    pub code: String,
    pub message: String,
}

impl ApiError {
    pub fn from_err(err: AppError) -> Self {
        let code = match &err {
            AppError::Storage(_) => "storage",
            AppError::NotFound(_) => "not_found",
            AppError::InvalidInput(_) => "invalid_input",
            AppError::Timer(_) => "timer",
            AppError::Window(_) => "window",
        };
        Self {
            code: code.to_string(),
            message: err.to_string(),
        }
    }
}
