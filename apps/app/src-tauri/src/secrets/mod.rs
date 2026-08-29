pub mod commands;
pub mod contract;
mod index;
pub mod migrate;
pub mod store;
mod vault;

use tauri::{AppHandle, Emitter, Manager, Runtime};

pub use contract::SecretError;
pub use store::{Resolved, SecretStore};

pub const EVENT_CHANNEL: &str = "secrets://unmoved";

pub fn sweep_and_announce<R: Runtime>(app: &AppHandle<R>, store: &SecretStore) {
	let unmoved = migrate::sweep(store, store.plugins_dir());
	if !unmoved.is_empty() {
		let _ = app.emit(EVENT_CHANNEL, unmoved);
	}
}

pub fn bootstrap<R: Runtime>(app: &AppHandle<R>) {
	let Ok(app_data) = app.path().app_data_dir() else {
		return;
	};
	let store = SecretStore::under(app_data);
	sweep_and_announce(app, &store);
	app.manage(store);
}
