use serde::Deserialize;
use tauri::{AppHandle, Runtime, State};

use crate::{bundles, db};

use super::contract::{owner_for, SecretError, SecretScope};
use super::store::{SecretStore, StoreStatus, StoredKeys};

async fn space_of(database: &db::DatabaseState, bot_id: &str) -> Option<String> {
	let database = database.as_ref().ok()?;
	let bot = database.conversations().bot(bot_id.to_owned()).await.ok()??;
	(!bot.space_id.is_empty()).then_some(bot.space_id)
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SecretTarget {
	#[serde(default)]
	bot_id: Option<String>,
	#[serde(default)]
	space_id: Option<String>,
	#[serde(default)]
	scope: Option<SecretScope>,
	#[serde(default)]
	server: Option<String>,
}

struct Address {
	scope: SecretScope,
	bot_id: Option<String>,
	space_id: Option<String>,
	server: Option<String>,
}

async fn addressed<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::DatabaseState,
	target: SecretTarget,
) -> Result<Address, SecretError> {
	let SecretTarget { bot_id, space_id, scope, server } = target;
	let scope = scope.unwrap_or_default();
	let space_id = match (&space_id, &bot_id) {
		(Some(named), _) => Some(named.clone()),
		(None, Some(bot_id)) => space_of(database, bot_id).await,
		(None, None) => None,
	};

	if scope == SecretScope::Server {
		let (Some(bot_id), Some(server)) = (&bot_id, &server) else {
			return Err(SecretError::NoServer {
				bot_id: bot_id.clone().unwrap_or_default(),
			});
		};
		if !declares_the_server(app, bot_id, server) {
			return Err(SecretError::UnknownServer { server: server.clone() });
		}
	}

	Ok(Address { scope, bot_id, space_id, server })
}

fn declares_the_server<R: Runtime>(app: &AppHandle<R>, bot_id: &str, server: &str) -> bool {
	bundles::root(app).is_some_and(|root| {
		bundles::mcp_servers(&root, bot_id).iter().any(|declared| declared.name == server)
	})
}

fn owner_of(address: &Address) -> Result<String, SecretError> {
	owner_for(
		address.scope,
		address.bot_id.as_deref().unwrap_or_default(),
		address.space_id.as_deref(),
		address.server.as_deref(),
	)
}

#[tauri::command]
pub async fn secret_keys<R: Runtime>(
	app: AppHandle<R>,
	store: State<'_, SecretStore>,
	database: State<'_, db::DatabaseState>,
	target: SecretTarget,
) -> Result<StoredKeys, SecretError> {
	let address = addressed(&app, &database, target).await?;
	Ok(store.keys_for(
		address.scope,
		address.bot_id.as_deref(),
		address.space_id.as_deref(),
		address.server.as_deref(),
	))
}

#[tauri::command]
pub async fn secret_set<R: Runtime>(
	app: AppHandle<R>,
	store: State<'_, SecretStore>,
	database: State<'_, db::DatabaseState>,
	target: SecretTarget,
	key: String,
	value: String,
) -> Result<(), SecretError> {
	let address = addressed(&app, &database, target).await?;
	store.set(&owner_of(&address)?, &key, &value)
}

#[tauri::command]
pub async fn secret_delete<R: Runtime>(
	app: AppHandle<R>,
	store: State<'_, SecretStore>,
	database: State<'_, db::DatabaseState>,
	target: SecretTarget,
	key: String,
) -> Result<(), SecretError> {
	let address = addressed(&app, &database, target).await?;
	store.delete(&owner_of(&address)?, &key)
}

#[tauri::command]
pub async fn secret_unlock_vault<R: Runtime>(
	app: AppHandle<R>,
	store: State<'_, SecretStore>,
	passphrase: String,
) -> Result<(), SecretError> {
	store.unlock(&passphrase)?;
	super::sweep_and_announce(&app, &store);
	Ok(())
}

#[tauri::command]
pub async fn secret_store_status(
	store: State<'_, SecretStore>,
) -> Result<StoreStatus, SecretError> {
	Ok(store.status())
}
