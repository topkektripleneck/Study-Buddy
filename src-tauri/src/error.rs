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
