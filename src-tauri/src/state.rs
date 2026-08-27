use std::sync::Arc;

use parking_lot::RwLock;

use crate::storage::StorageEngine;
use crate::timer::TimerActor;

pub struct AppState {
    pub storage: Arc<StorageEngine>,
    pub timer: Arc<TimerActor>,
    pub revision: RwLock<u64>,
}

impl AppState {
    pub fn bump_revision(&self) -> u64 {
        let mut rev = self.revision.write();
        *rev += 1;
        *rev
    }
}
