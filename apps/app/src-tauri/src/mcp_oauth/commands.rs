use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use super::contract::{Disconnected, OauthError};
use super::credentials::{self, ServedGrants};
use super::reports::{ConnectorReports, Standing};
use super::status::{status, ConnectorRow, Evidence};
use crate::agent::commands::AgentState;
use crate::agent::protocol::{OauthCredentials, RevocationRequest};
use crate::agent::sidecar::Opening;
use crate::agent::translate::now_ms;
use crate::bundles::{self, McpServer};
use crate::environment::commands::writable_root;
use crate::environment::contract::{
	EnvError, EnvOwner, EnvScope, Values, OAUTH_ACCESS_TOKEN, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET,
	OAUTH_REFRESH_TOKEN,
};
use crate::environment::store;

const NOTHING_STORED: &str = "no access token was stored for that server";

const NO_BUNDLES: &str = "the bundle directory is unavailable";

const OPENABLE_SCHEMES: [&str; 2] = ["http://", "https://"];

pub(crate) fn is_openable(url: &str) -> bool {
	let lowered = url.to_ascii_lowercase();
	OPENABLE_SCHEMES.iter().any(|scheme| lowered.starts_with(scheme))
}

enum Flow {
	Authorizing(EnvScope),
	Revoking,
}

#[derive(Default)]
pub struct McpOauthState {
	running: Mutex<Option<Flow>>,
}

impl McpOauthState {
	fn begin(&self, flow: Flow) -> Result<Running<'_>, OauthError> {
		let mut running = self.held();
		if running.is_some() {
			return Err(OauthError::AlreadyRunning);
		}
		*running = Some(flow);
		Ok(Running { state: self })
	}

	fn held(&self) -> MutexGuard<'_, Option<Flow>> {
		self.running.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn is_running(&self) -> bool {
		self.held().is_some()
	}

	fn is_authorizing(&self, scope: &EnvScope) -> bool {
		matches!(self.held().as_ref(), Some(Flow::Authorizing(held)) if held == scope)
	}
}

struct Running<'a> {
	state: &'a McpOauthState,
}

impl Drop for Running<'_> {
	fn drop(&mut self) {
		*self.state.held() = None;
	}
}

async fn granted<R: Runtime>(
	app: &AppHandle<R>,
	url: &str,
) -> Result<OauthCredentials, OauthError> {
	let sidecar = app.state::<AgentState>().sidecar().await?;
	let mut flow = sidecar.begin_oauth(url)?;
	let settled = match flow.opened().await? {
		Opening::Settled(settled) => settled,
		Opening::Authorization(authorization) => {
			if !is_openable(&authorization) {
				return Err(OauthError::RefusedUrl { url: authorization });
			}
			if app.opener().open_url(authorization.clone(), None::<&str>).is_err() {
				return Err(OauthError::BrowserRefused { url: authorization });
			}
			flow.settled().await?
		}
	};
	match (settled.credentials, settled.error) {
		(Some(credentials), _) => Ok(credentials),
		(None, Some(failure)) => Err(OauthError::from(failure)),
		(None, None) => Err(OauthError::Failed {
			detail: "the authorization flow settled with neither a grant nor a reason".to_owned(),
		}),
	}
}

#[tauri::command]
pub async fn mcp_oauth_connect<R: Runtime>(
	app: AppHandle<R>,
	owner: EnvOwner,
	name: String,
	url: String,
) -> Result<(), OauthError> {
	let state = app.state::<McpOauthState>();
	let scope = EnvScope::Server { name: name.clone(), owner };
	let _running = state.begin(Flow::Authorizing(scope.clone()))?;
	let root = writable_root(&app)?;
	let credentials = granted(&app, &url).await?;
	kept(&root, &scope, &name, &credentials, &app.state::<ConnectorReports>())
}

fn kept(
	root: &Path,
	scope: &EnvScope,
	name: &str,
	grant: &OauthCredentials,
	reports: &ConnectorReports,
) -> Result<(), OauthError> {
	credentials::store(root, scope, grant)?;
	reports.forget(name);
	Ok(())
}

#[tauri::command]
pub async fn mcp_oauth_cancel<R: Runtime>(app: AppHandle<R>) -> Result<(), OauthError> {
	if !app.state::<McpOauthState>().is_running() {
		return Ok(());
	}
	Ok(app.state::<AgentState>().sidecar().await?.cancel_oauth()?)
}

#[tauri::command]
pub async fn mcp_oauth_disconnect<R: Runtime>(
	app: AppHandle<R>,
	owner: EnvOwner,
	name: String,
	url: String,
) -> Result<Disconnected, OauthError> {
	let state = app.state::<McpOauthState>();
	let _running = state.begin(Flow::Revoking)?;
	let settled = disconnected(&app, &owner, &name, &url).await;
	app.state::<ConnectorReports>().forget(&name);
	settled
}

async fn disconnected<R: Runtime>(
	app: &AppHandle<R>,
	owner: &EnvOwner,
	name: &str,
	url: &str,
) -> Result<Disconnected, OauthError> {
	let root = writable_root(app)?;
	let scope = held_at(&root, owner, name)?;
	let held = store::values(&root, &scope)?;
	let revocation = revoked(app, url, &held).await;
	credentials::forget(&root, &scope)?;
	Ok(revocation)
}

fn held_at(root: &Path, owner: &EnvOwner, name: &str) -> Result<EnvScope, EnvError> {
	let served = credentials::served(root, owner)?.remove(name);
	Ok(served.map_or_else(
		|| EnvScope::Server { name: name.to_owned(), owner: owner.clone() },
		|grant| grant.scope,
	))
}

#[tauri::command]
pub async fn mcp_connector_status<R: Runtime>(
	app: AppHandle<R>,
	owner: EnvOwner,
) -> Result<Vec<ConnectorRow>, EnvError> {
	let root = writable_root(&app)?;
	let grants = credentials::served(&root, &owner)?;
	let readings = Readings {
		owner: &owner,
		flows: &app.state::<McpOauthState>(),
		reports: &app.state::<ConnectorReports>(),
		grants: &grants,
		now: now_ms(),
	};
	Ok(declared_servers(&app, &owner)?.into_iter().map(|server| readings.row(server)).collect())
}

struct Readings<'a> {
	owner: &'a EnvOwner,
	flows: &'a McpOauthState,
	reports: &'a ConnectorReports,
	grants: &'a ServedGrants,
	now: i64,
}

impl Readings<'_> {
	fn row(&self, server: McpServer) -> ConnectorRow {
		let named = EnvScope::Server { name: server.name.clone(), owner: self.owner.clone() };
		let grant = self.grants.get(&server.name);
		let evidence = Evidence {
			is_authorizing: self.flows.is_authorizing(&named),
			reported: last_reported(self.reports, self.owner, &server.name),
			held: grant.map(|grant| grant.held.clone()).unwrap_or_default(),
			declares_url: server.url().is_some(),
		};
		ConnectorRow {
			status: status(evidence, self.now),
			scope: grant.map(|grant| grant.scope.clone()),
			name: server.name,
		}
	}
}

fn last_reported(reports: &ConnectorReports, owner: &EnvOwner, name: &str) -> Option<Standing> {
	match owner {
		EnvOwner::Bot { id, .. } => reports.last(id, name),
		EnvOwner::User | EnvOwner::Space { .. } => None,
	}
}

fn declared_servers<R: Runtime>(
	app: &AppHandle<R>,
	owner: &EnvOwner,
) -> Result<Vec<McpServer>, EnvError> {
	match owner {
		EnvOwner::Bot { id, .. } => bundles::root(app)
			.map(|root| bundles::mcp_servers(&root, id))
			.ok_or_else(|| EnvError::Unreadable { detail: NO_BUNDLES.to_owned() }),
		EnvOwner::Space { id } => Ok(bundles::space::laid_down(app, id)
			.map_or_else(Vec::new, |bundle| bundles::mcp_servers_at(&bundle))),
		EnvOwner::User => Ok(bundles::user::laid_down(app)
			.map_or_else(Vec::new, |bundle| bundles::mcp_servers_at(&bundle))),
	}
}

async fn revoked<R: Runtime>(app: &AppHandle<R>, url: &str, held: &Values) -> Disconnected {
	let Some(token) = held.get(OAUTH_ACCESS_TOKEN) else {
		return Disconnected { revoked: false, detail: Some(NOTHING_STORED.to_owned()) };
	};
	let request = RevocationRequest {
		url: url.to_owned(),
		token: token.clone(),
		refresh_token: held.get(OAUTH_REFRESH_TOKEN).cloned(),
		client_id: held.get(OAUTH_CLIENT_ID).cloned(),
		client_secret: held.get(OAUTH_CLIENT_SECRET).cloned(),
	};
	match app.state::<AgentState>().sidecar().await {
		Ok(sidecar) => match sidecar.revoke_oauth(&request).await {
			Ok(answer) => Disconnected { revoked: answer.revoked, detail: answer.detail },
			Err(error) => Disconnected { revoked: false, detail: Some(format!("{error:?}")) },
		},
		Err(error) => Disconnected { revoked: false, detail: Some(format!("{error:?}")) },
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::mcp_oauth::status::ConnectorStatus;
	use tauri::test::{mock_builder, mock_context, noop_assets};

	fn a_server(name: &str) -> EnvScope {
		EnvScope::Server {
			name: name.to_owned(),
			owner: EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
		}
	}

	fn a_host(name: &str) -> (tauri::App<tauri::test::MockRuntime>, std::path::PathBuf) {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.kiroshi.mcp-oauth-{name}-{}", std::process::id()).into();
		let app = mock_builder().build(context).expect("the app builds");
		let data = app.path().app_data_dir().expect("the data dir is named");
		let _ = std::fs::remove_dir_all(&data);
		app.manage(McpOauthState::default());
		app.manage(ConnectorReports::default());
		(app, data)
	}

	#[tokio::test]
	async fn the_connectors_of_the_user_are_the_servers_the_user_plugin_declares() {
		let (app, data) = a_host("user-connectors");
		let path = bundles::user::path(app.handle()).expect("the plugin has a home");
		bundles::user::lay_down(&path).expect("the plugin is laid down");
		for name in ["clock", "granola"] {
			bundles::user::set_mcp_server(&path, name, &serde_json::json!({ "command": name }))
				.expect("the server lands");
		}

		let rows = mcp_connector_status(app.handle().clone(), EnvOwner::User)
			.await
			.expect("the status reads");

		assert_eq!(
			rows.iter().map(|row| row.name.as_str()).collect::<Vec<_>>(),
			["clock", "granola"]
		);
		let _ = std::fs::remove_dir_all(&data);
	}

	#[test]
	fn a_second_flow_is_refused_while_one_is_running() {
		let state = McpOauthState::default();
		let running =
			state.begin(Flow::Authorizing(a_server("granola"))).expect("the first flow claims");

		assert_eq!(state.begin(Flow::Revoking).err(), Some(OauthError::AlreadyRunning));
		assert!(state.is_running());

		drop(running);

		assert!(!state.is_running());
		state.begin(Flow::Revoking).expect("a flow that settled leaves the state free");
	}

	#[test]
	fn a_running_authorization_reads_as_connecting_for_its_server_and_no_other() {
		let state = McpOauthState::default();
		let running = state.begin(Flow::Authorizing(a_server("granola"))).expect("the flow claims");

		assert!(state.is_authorizing(&a_server("granola")));
		assert!(!state.is_authorizing(&a_server("notion")));
		assert!(!state.is_authorizing(&EnvScope::Server {
			name: "granola".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		}));

		drop(running);

		assert!(!state.is_authorizing(&a_server("granola")));
	}

	fn a_live_grant() -> OauthCredentials {
		OauthCredentials {
			access_token: "granted".to_owned(),
			refresh_token: Some("renewable".to_owned()),
			expires_at: Some(now_ms() + 3_600_000),
			client_id: "registered".to_owned(),
			client_secret: None,
		}
	}

	#[test]
	fn a_server_a_session_reported_waiting_reads_connected_once_the_person_authorizes_it() {
		let root = std::env::temp_dir().join("kiroshi-mcp-oauth-connect-clears");
		let _ = std::fs::remove_dir_all(&root);
		let owner = EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() };
		let reports = ConnectorReports::default();
		reports.record("b1", "granola", Standing::NeedsAuth);
		reports.record("b2", "granola", Standing::NeedsAuth);
		reports.record("b1", "clock", Standing::Holding);

		kept(&root, &a_server("granola"), "granola", &a_live_grant(), &reports)
			.expect("the grant is stored");

		let grants = credentials::served(&root, &owner).expect("the grants are readable");
		let readings = Readings {
			owner: &owner,
			flows: &McpOauthState::default(),
			reports: &reports,
			grants: &grants,
			now: now_ms(),
		};
		let granola = McpServer {
			name: "granola".to_owned(),
			config: serde_json::json!({ "url": "https://mcp.granola.test/mcp" }),
		};
		assert_eq!(readings.row(granola).status, ConnectorStatus::Connected);
		assert_eq!(reports.last("b2", "granola"), None);
		assert_eq!(reports.last("b1", "clock"), Some(Standing::Holding));
	}

	fn a_bot() -> EnvOwner {
		EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
	}

	fn granola_of_the_space() -> EnvScope {
		EnvScope::Server {
			name: "granola".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		}
	}

	fn a_root(name: &str) -> std::path::PathBuf {
		let root = std::env::temp_dir().join(format!("kiroshi-mcp-oauth-commands-{name}"));
		let _ = std::fs::remove_dir_all(&root);
		root
	}

	fn read_row(root: &Path, owner: &EnvOwner) -> ConnectorRow {
		let grants = credentials::served(root, owner).expect("the grants are readable");
		let readings = Readings {
			owner,
			flows: &McpOauthState::default(),
			reports: &ConnectorReports::default(),
			grants: &grants,
			now: now_ms(),
		};
		readings.row(McpServer {
			name: "granola".to_owned(),
			config: serde_json::json!({ "url": "https://mcp.granola.test/mcp" }),
		})
	}

	#[test]
	fn a_row_names_the_broader_scope_a_bot_holding_no_grant_is_served_from() {
		let root = a_root("row-broader");
		credentials::store(&root, &granola_of_the_space(), &a_live_grant())
			.expect("the space grant is written");

		let row = read_row(&root, &a_bot());

		assert_eq!(row.scope, Some(granola_of_the_space()));
		assert_eq!(row.status, ConnectorStatus::Connected);
	}

	#[test]
	fn a_connect_stores_at_the_owner_named_and_the_row_then_names_that_owner() {
		let root = a_root("row-named");
		credentials::store(&root, &granola_of_the_space(), &a_live_grant())
			.expect("the space grant is written");

		kept(&root, &a_server("granola"), "granola", &a_live_grant(), &ConnectorReports::default())
			.expect("the grant is stored");

		assert_eq!(read_row(&root, &a_bot()).scope, Some(a_server("granola")));
		assert!(store::values(&root, &a_server("granola"))
			.expect("the scope is readable")
			.contains_key(OAUTH_ACCESS_TOKEN));
	}

	#[test]
	fn a_disconnect_acts_on_the_broader_grant_a_bot_is_served_and_else_on_the_owner_named() {
		let root = a_root("held-at");

		assert_eq!(held_at(&root, &a_bot(), "granola"), Ok(a_server("granola")));

		credentials::store(&root, &granola_of_the_space(), &a_live_grant())
			.expect("the space grant is written");

		assert_eq!(held_at(&root, &a_bot(), "granola"), Ok(granola_of_the_space()));

		let root = a_root("held-at-user");
		let of_the_user = EnvScope::Server { name: "granola".to_owned(), owner: EnvOwner::User };
		credentials::store(&root, &of_the_user, &a_live_grant())
			.expect("the user grant is written");

		assert_eq!(held_at(&root, &a_bot(), "granola"), Ok(of_the_user));

		credentials::store(&root, &a_server("granola"), &a_live_grant())
			.expect("the bot grant is written");

		assert_eq!(held_at(&root, &a_bot(), "granola"), Ok(a_server("granola")));
	}

	#[tokio::test]
	async fn a_settled_disconnect_forgets_every_standing_of_that_server() {
		let app = tauri::test::mock_app();
		app.manage(McpOauthState::default());
		app.manage(ConnectorReports::default());
		let reports = app.state::<ConnectorReports>();
		reports.record("b-disconnect-test", "granola", Standing::Holding);
		reports.record("b-other", "granola", Standing::NeedsAuth);
		reports.record("b-disconnect-test", "clock", Standing::Holding);
		let owner =
			EnvOwner::Bot { id: "b-disconnect-test".to_owned(), space_id: "s-test".to_owned() };

		let settled = mcp_oauth_disconnect(
			app.handle().clone(),
			owner,
			"granola".to_owned(),
			"https://mcp.granola.test/mcp".to_owned(),
		)
		.await;

		assert_eq!(
			settled,
			Ok(Disconnected { revoked: false, detail: Some(NOTHING_STORED.to_owned()) })
		);
		assert_eq!(reports.last("b-disconnect-test", "granola"), None);
		assert_eq!(reports.last("b-other", "granola"), None);
		assert_eq!(reports.last("b-disconnect-test", "clock"), Some(Standing::Holding));
	}

	#[test]
	fn a_disconnect_reads_as_connecting_for_no_server() {
		let state = McpOauthState::default();
		let _revoking = state.begin(Flow::Revoking).expect("the disconnect claims");

		assert!(!state.is_authorizing(&a_server("granola")));
	}

	#[test]
	fn a_state_holding_no_flow_reads_as_holding_none() {
		assert!(!McpOauthState::default().is_running());
	}

	#[test]
	fn a_disconnect_claims_the_same_state_a_connect_does() {
		let state = McpOauthState::default();
		let connecting =
			state.begin(Flow::Authorizing(a_server("granola"))).expect("the connect claims");

		assert_eq!(state.begin(Flow::Revoking).err(), Some(OauthError::AlreadyRunning));

		drop(connecting);
		let disconnecting = state.begin(Flow::Revoking).expect("the disconnect claims in turn");

		assert_eq!(
			state.begin(Flow::Authorizing(a_server("granola"))).err(),
			Some(OauthError::AlreadyRunning)
		);
		drop(disconnecting);
	}

	#[test]
	fn only_an_http_url_is_ever_handed_to_a_browser() {
		assert!(is_openable("https://authority.test/authorize?state=1"));
		assert!(is_openable("http://127.0.0.1:8080/authorize"));
		assert!(is_openable("HTTPS://authority.test/authorize"));
		assert!(!is_openable("javascript:alert(1)"));
		assert!(!is_openable("file:///etc/passwd"));
		assert!(!is_openable("data:text/html,<script>1</script>"));
		assert!(!is_openable("authorize"));
	}
}
