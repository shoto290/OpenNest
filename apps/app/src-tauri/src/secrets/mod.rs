pub mod commands;
pub mod contract;
mod index;
pub mod migrate;
pub mod store;
mod vault;

use tauri::{AppHandle, Manager, Runtime};

pub use contract::SecretError;
pub use store::{Resolved, SecretStore};

pub fn bootstrap<R: Runtime>(app: &AppHandle<R>) {
	let Some(plugins) = crate::bundles::root(app).map(|root| crate::bundles::plugins_dir(&root))
	else {
		return;
	};
	let Ok(app_data) = app.path().app_data_dir() else {
		return;
	};
	let store = SecretStore::under(app_data);
	migrate::run_once(&store, &plugins);
	app.manage(store);
}
