use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use super::contract::{
	Application, ApplicationInstalled, ConnectorError, ConnectorInstall, ConnectorSearch,
	ConnectorState, Destination, INSTALLED_EVENT,
};
use super::{catalogue, registry};
use crate::agent::protocol::HostAnswer;
use crate::agent::session::{Answering, HostRequests};
use crate::conversations::commands::{
	conversation_bot_mcp_servers, conversation_set_bot_mcp_server,
	conversation_set_space_mcp_server, conversation_space_mcp_servers,
};
use crate::conversations::contract::McpServer;
use crate::db;
use crate::environment::contract::EnvOwner;
use crate::mcp_oauth::commands::mcp_connector_status;
use crate::user::commands::{user_plugin_mcp_servers, user_plugin_set_mcp_server};

const SUBTYPE: &str = "application";

const NO_DATABASE: &str = "the store this session writes to is not open";

#[derive(Debug)]
pub struct ApplicationHost<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
	registry: String,
}

impl<R: Runtime> Clone for ApplicationHost<R> {
	fn clone(&self) -> Self {
		Self {
			app: self.app.clone(),
			conversation_id: self.conversation_id.clone(),
			bot_id: self.bot_id.clone(),
			registry: self.registry.clone(),
		}
	}
}

impl<R: Runtime> ApplicationHost<R> {
	pub fn new(app: AppHandle<R>, conversation_id: String, bot_id: String) -> Self {
		Self { app, conversation_id, bot_id, registry: registry::REGISTRY.to_owned() }
	}

	pub async fn answer(&self, request: Value) -> HostAnswer {
		self.served(request).await.map_err(refused)
	}

	async fn served(&self, request: Value) -> Result<Value, ConnectorError> {
		let Asked::Application { operation, payload } = read(request)?;
		match operation {
			Operation::Search => {
				let asked: Searched = read(payload)?;
				answered(self.search(&asked.query).await?)
			}
			Operation::Install => {
				let asked: Named = read(payload)?;
				answered(self.install(asked).await?)
			}
			Operation::Status => {
				let asked: Named = read(payload)?;
				answered(self.status(asked).await?)
			}
		}
	}

	async fn search(&self, query: &str) -> Result<ConnectorSearch, ConnectorError> {
		let mut applications = matching(catalogue::curated()?, query);
		let registry_failure = match registry::search(&self.registry, query).await {
			Ok(found) => {
				applications.extend(found);
				None
			}
			Err(failure) => Some(failure),
		};
		Ok(ConnectorSearch { applications, registry_failure })
	}

	async fn install(&self, asked: Named) -> Result<ConnectorInstall, ConnectorError> {
		let scope = destination(&asked.scope)?;
		let owner = self.owner(scope).await?;
		if self.declared(&owner).await?.iter().any(|server| server.name == asked.application) {
			return Ok(ConnectorInstall::AlreadyInstalled {
				application: asked.application,
				scope,
			});
		}
		let application = self.application(&asked.application).await?;
		self.declare(&owner, &application).await?;
		self.announce(ApplicationInstalled { application: application.name.clone(), scope })?;
		Ok(ConnectorInstall::Installed {
			application: application.name,
			scope,
			install: application.install.into(),
		})
	}

	async fn status(&self, asked: Named) -> Result<ConnectorState, ConnectorError> {
		let owner = self.owner(destination(&asked.scope)?).await?;
		let rows = mcp_connector_status(self.app.clone(), owner).await?;
		Ok(rows
			.into_iter()
			.find(|row| row.name == asked.application)
			.map_or(ConnectorState::NotInstalled, |row| row.status.into()))
	}

	async fn application(&self, name: &str) -> Result<Application, ConnectorError> {
		if let Some(curated) = catalogue::curated()?.into_iter().find(|held| held.name == name) {
			return Ok(curated);
		}
		registry::search(&self.registry, name)
			.await?
			.into_iter()
			.find(|held| held.name == name)
			.ok_or_else(|| ConnectorError::UnknownApplication { application: name.to_owned() })
	}

	async fn owner(&self, scope: Destination) -> Result<EnvOwner, ConnectorError> {
		match scope {
			Destination::User => Ok(EnvOwner::User),
			Destination::Space => Ok(EnvOwner::Space { id: self.space().await? }),
			Destination::Companion => {
				Ok(EnvOwner::Bot { id: self.bot_id.clone(), space_id: self.space().await? })
			}
		}
	}

	async fn declared(&self, owner: &EnvOwner) -> Result<Vec<McpServer>, ConnectorError> {
		let app = self.app.clone();
		Ok(match owner {
			EnvOwner::User => user_plugin_mcp_servers(app).await?,
			EnvOwner::Space { id } => conversation_space_mcp_servers(app, id.clone()).await?,
			EnvOwner::Bot { id, .. } => conversation_bot_mcp_servers(app, id.clone()).await?,
		})
	}

	async fn declare(
		&self,
		owner: &EnvOwner,
		application: &Application,
	) -> Result<McpServer, ConnectorError> {
		let app = self.app.clone();
		let name = application.name.clone();
		let config = application.config.clone();
		Ok(match owner {
			EnvOwner::User => user_plugin_set_mcp_server(app, name, config).await?,
			EnvOwner::Space { id } => {
				conversation_set_space_mcp_server(app, id.clone(), name, config).await?
			}
			EnvOwner::Bot { id, .. } => {
				let state = self
					.app
					.try_state::<db::DatabaseState>()
					.ok_or_else(|| ConnectorError::Unexpected { detail: NO_DATABASE.to_owned() })?;
				conversation_set_bot_mcp_server(app, state, id.clone(), name, config).await?
			}
		})
	}

	async fn space(&self) -> Result<String, ConnectorError> {
		let state = self
			.app
			.try_state::<db::DatabaseState>()
			.ok_or_else(|| ConnectorError::Unexpected { detail: NO_DATABASE.to_owned() })?;
		let database = crate::conversations::commands::ready(&state)?;
		database.conversations().space(self.conversation_id.clone()).await?.ok_or_else(|| {
			ConnectorError::ConversationWithoutSpace {
				conversation_id: self.conversation_id.clone(),
			}
		})
	}

	fn announce(&self, installed: ApplicationInstalled) -> Result<(), ConnectorError> {
		self.app
			.emit(INSTALLED_EVENT, installed)
			.map_err(|error| ConnectorError::Undeliverable { detail: error.to_string() })
	}
}

impl<R: Runtime> HostRequests for ApplicationHost<R> {
	fn subtype(&self) -> &'static str {
		SUBTYPE
	}

	fn serve(&self, request: Value) -> Answering {
		let held = self.clone();
		Box::pin(async move { held.answer(request).await })
	}
}

#[derive(Debug, Deserialize)]
#[serde(tag = "subtype", rename_all = "camelCase")]
enum Asked {
	Application { operation: Operation, payload: Value },
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Operation {
	Search,
	Install,
	Status,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Searched {
	query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Named {
	application: String,
	scope: String,
}

fn destination(scope: &str) -> Result<Destination, ConnectorError> {
	match scope {
		"companion" => Ok(Destination::Companion),
		"space" => Ok(Destination::Space),
		"user" => Ok(Destination::User),
		unknown => Err(ConnectorError::UnknownScope { scope: unknown.to_owned() }),
	}
}

fn matching(curated: Vec<Application>, query: &str) -> Vec<Application> {
	let terms: Vec<String> = query.split_whitespace().map(str::to_lowercase).collect();
	curated.into_iter().filter(|held| terms.iter().any(|term| answers_to(held, term))).collect()
}

fn answers_to(application: &Application, term: &str) -> bool {
	application.name.to_lowercase().contains(term)
		|| application.title.to_lowercase().contains(term)
}

fn read<T: serde::de::DeserializeOwned>(payload: Value) -> Result<T, ConnectorError> {
	serde_json::from_value(payload)
		.map_err(|error| ConnectorError::UnreadableRequest { detail: error.to_string() })
}

fn answered<T: Serialize>(answer: T) -> Result<Value, ConnectorError> {
	serde_json::to_value(answer)
		.map_err(|error| ConnectorError::Unexpected { detail: error.to_string() })
}

fn refused(error: ConnectorError) -> Value {
	serde_json::to_value(&error).unwrap_or_else(
		|failure| serde_json::json!({ "kind": "unexpected", "detail": failure.to_string() }),
	)
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::net::Ipv4Addr;
	use std::path::PathBuf;
	use std::sync::mpsc;
	use std::time::Duration;

	use serde_json::json;
	use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime};
	use tauri::{App, Listener as _};

	use super::*;
	use crate::applications::registry::tests::{holding, serving};
	use crate::bundles;
	use crate::conversations::commands::ready;
	use crate::mcp_oauth::commands::McpOauthState;
	use crate::mcp_oauth::reports::{ConnectorReports, Standing};

	const A_SPACE: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'Shoto', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'main', 'personal', 'Chat', 1, 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('nowhere', 'main', 'Chat', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('nowhere', 'b1', 'assistant', 1, 0);
	";

	const SCOPES: [&str; 3] = ["companion", "space", "user"];

	async fn a_host(name: &str) -> App<MockRuntime> {
		let mut context = mock_context(noop_assets());
		context.config_mut().identifier =
			format!("com.kiroshi.application-host-{name}-{}", std::process::id());
		let app = mock_builder().build(context).expect("the app builds");
		cleaned(&app);
		app.manage(db::bootstrap(app.handle()));
		app.manage(McpOauthState::default());
		app.manage(ConnectorReports::default());
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(A_SPACE)?))
			.await
			.expect("the space is planted");
		bundles::space::lay_down(app.handle(), "personal").expect("the space plugin lands");
		bundles::user::lay_down(&user_plugin(&app)).expect("the person plugin lands");
		app
	}

	fn cleaned(app: &App<MockRuntime>) {
		if let Ok(dir) = app.path().app_data_dir() {
			let _ = fs::remove_dir_all(&dir);
		}
	}

	fn user_plugin(app: &App<MockRuntime>) -> PathBuf {
		bundles::user::path(app.handle()).expect("the person plugin has a home")
	}

	fn space_plugin(app: &App<MockRuntime>) -> PathBuf {
		bundles::space::path(app.handle(), "personal").expect("the space plugin has a home")
	}

	async fn unreached() -> String {
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let address = listener.local_addr().expect("the port is named");
		drop(listener);
		format!("http://{address}")
	}

	fn serving_in(
		app: &App<MockRuntime>,
		conversation_id: &str,
		registry: String,
	) -> ApplicationHost<MockRuntime> {
		ApplicationHost {
			app: app.handle().clone(),
			conversation_id: conversation_id.to_owned(),
			bot_id: "b1".to_owned(),
			registry,
		}
	}

	fn asking(operation: &str, payload: Value) -> Value {
		json!({ "subtype": "application", "operation": operation, "payload": payload })
	}

	fn an_install(application: &str, scope: &str) -> Value {
		asking("install", json!({ "application": application, "scope": scope }))
	}

	fn a_status(application: &str, scope: &str) -> Value {
		asking("status", json!({ "application": application, "scope": scope }))
	}

	fn names(answer: &Value) -> Vec<&str> {
		answer["applications"]
			.as_array()
			.expect("the search lists applications")
			.iter()
			.map(|held| held["name"].as_str().expect("an application is named"))
			.collect()
	}

	fn declarations(app: &App<MockRuntime>) -> [Vec<(String, Value)>; 3] {
		let root = bundles::root(app.handle()).expect("the bundles have a root");
		[
			bundles::mcp_servers(&root, "b1"),
			bundles::space::mcp_servers(&space_plugin(app)),
			bundles::user::mcp_servers(&user_plugin(app)),
		]
		.map(|servers| servers.into_iter().map(|server| (server.name, server.config)).collect())
	}

	fn curated_config(name: &str) -> Value {
		catalogue::curated()
			.expect("the catalogue reads")
			.into_iter()
			.find(|held| held.name == name)
			.unwrap_or_else(|| panic!("{name} is curated"))
			.config
	}

	fn heard(app: &App<MockRuntime>) -> mpsc::Receiver<String> {
		let (announced, arriving) = mpsc::channel();
		app.listen(INSTALLED_EVENT, move |event| {
			announced.send(event.payload().to_owned()).expect("the test is listening");
		});
		arriving
	}

	#[tokio::test]
	async fn a_search_answers_the_curated_matches_before_the_registry_ones() {
		let app = a_host("curated-first").await;
		let (base, _) = serving(holding(vec!["com.notion/mcp"])).await;

		let answer = serving_in(&app, "c1", base)
			.answer(asking("search", json!({ "query": "linear" })))
			.await;

		let answer = answer.expect("the search answers");
		assert_eq!(names(&answer), ["linear", "com.notion/mcp"]);
		assert_eq!(answer["applications"][0]["install"], json!({ "kind": "oauth" }));
		assert!(answer.get("registryFailure").is_none(), "got {answer}");
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_search_no_curated_application_matches_answers_the_registry_alone() {
		let app = a_host("registry-alone").await;
		let (base, _) = serving(holding(vec!["io.github.Digital-Defiance/mcp-filesystem"])).await;

		let answer = serving_in(&app, "c1", base)
			.answer(asking("search", json!({ "query": "filesystem" })))
			.await
			.expect("the search answers");

		assert_eq!(names(&answer), ["io.github.Digital-Defiance/mcp-filesystem"]);
		cleaned(&app);
	}

	#[tokio::test]
	async fn an_unreadable_registry_answers_the_curated_matches_and_names_the_failure() {
		let app = a_host("registry-down").await;

		let answer = serving_in(&app, "c1", unreached().await)
			.answer(asking("search", json!({ "query": "linear" })))
			.await
			.expect("the search answers");

		assert_eq!(names(&answer), ["linear"]);
		assert_eq!(answer["registryFailure"]["kind"], "registryUnreached");
		cleaned(&app);
	}

	#[tokio::test]
	async fn an_install_lands_in_the_mcp_json_of_its_scope_and_of_no_other() {
		for (at, scope) in SCOPES.iter().enumerate() {
			let app = a_host(&format!("lands-{scope}")).await;

			let answer = serving_in(&app, "c1", unreached().await)
				.answer(an_install("paper", scope))
				.await
				.expect("the install answers");

			assert_eq!(
				answer,
				json!({
					"outcome": "installed",
					"application": "paper",
					"scope": scope,
					"install": { "kind": "nothing" },
				})
			);
			for (held_at, declared) in declarations(&app).into_iter().enumerate() {
				let expected = if held_at == at {
					vec![("paper".to_owned(), curated_config("paper"))]
				} else {
					Vec::new()
				};
				assert_eq!(declared, expected, "installing in {scope}");
			}
			cleaned(&app);
		}
	}

	#[tokio::test]
	async fn a_key_install_answers_the_secret_still_needed_and_nothing_else_about_credentials() {
		let app = a_host("key").await;

		let answer = serving_in(&app, "c1", unreached().await)
			.answer(an_install("superset", "user"))
			.await
			.expect("the install answers");

		assert_eq!(answer["install"], json!({ "kind": "key", "secret": "SUPERSET_API_KEY" }));
		cleaned(&app);
	}

	#[tokio::test]
	async fn an_install_announces_the_application_and_the_scope_it_landed_in() {
		let app = a_host("announced").await;
		let arriving = heard(&app);

		serving_in(&app, "c1", unreached().await)
			.answer(an_install("superset", "space"))
			.await
			.expect("the install answers");

		let payload =
			arriving.recv_timeout(Duration::from_secs(5)).expect("the event is announced");
		assert_eq!(
			serde_json::from_str::<Value>(&payload).expect("the event is JSON"),
			json!({ "application": "superset", "scope": "space" })
		);
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_scope_already_declaring_the_server_keeps_the_config_it_had() {
		let app = a_host("kept").await;
		let mine = json!({ "type": "http", "url": "https://mine.test/mcp" });
		bundles::space::set_mcp_server(&space_plugin(&app), "superset", &mine)
			.expect("the declaration lands");
		let arriving = heard(&app);

		let answer = serving_in(&app, "c1", unreached().await)
			.answer(an_install("superset", "space"))
			.await
			.expect("the install answers");

		assert_eq!(
			answer,
			json!({ "outcome": "alreadyInstalled", "application": "superset", "scope": "space" })
		);
		assert_eq!(declarations(&app)[1], [("superset".to_owned(), mine)]);
		assert!(arriving.recv_timeout(Duration::from_millis(200)).is_err(), "nothing is announced");
		cleaned(&app);
	}

	#[tokio::test]
	async fn an_unknown_scope_is_refused_by_name_and_nothing_is_written() {
		let app = a_host("unknown-scope").await;

		let refusal = serving_in(&app, "c1", unreached().await)
			.answer(an_install("paper", "team"))
			.await
			.expect_err("the scope is refused");

		assert_eq!(refusal, json!({ "kind": "unknownScope", "scope": "team" }));
		assert_eq!(declarations(&app), [Vec::new(), Vec::new(), Vec::new()]);
		cleaned(&app);
	}

	#[tokio::test]
	async fn an_application_neither_the_catalogue_nor_the_registry_answers_is_refused() {
		let app = a_host("unknown-application").await;
		let (base, _) = serving(holding(vec!["com.notion/mcp"])).await;

		for scope in SCOPES {
			let refusal = serving_in(&app, "c1", base.clone())
				.answer(an_install("io.test/nowhere", scope))
				.await
				.expect_err("the application is refused");

			assert_eq!(
				refusal,
				json!({ "kind": "unknownApplication", "application": "io.test/nowhere" })
			);
		}
		assert_eq!(declarations(&app), [Vec::new(), Vec::new(), Vec::new()]);
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_companion_or_space_install_from_a_conversation_in_no_space_is_refused() {
		let app = a_host("no-space").await;

		for scope in ["companion", "space"] {
			let refusal = serving_in(&app, "nowhere", unreached().await)
				.answer(an_install("paper", scope))
				.await
				.expect_err("the conversation is refused");

			assert_eq!(
				refusal,
				json!({ "kind": "conversationWithoutSpace", "conversationId": "nowhere" })
			);
		}
		assert_eq!(declarations(&app), [Vec::new(), Vec::new(), Vec::new()]);
		cleaned(&app);
	}

	#[tokio::test]
	async fn the_status_tells_apart_not_installed_connected_needs_authorization_and_failed() {
		let app = a_host("status").await;
		let host = serving_in(&app, "c1", unreached().await);
		for scope in ["companion", "user"] {
			host.answer(an_install("linear", scope)).await.expect("the install answers");
		}
		host.answer(an_install("paper", "companion")).await.expect("the install answers");
		let reports = app.state::<ConnectorReports>();
		reports.record("b1", "linear", Standing::Holding);
		reports.record("b1", "paper", Standing::LeftOut { reason: Some("refused".to_owned()) });

		let read = |application: &'static str, scope: &'static str| {
			let host = host.clone();
			async move { host.answer(a_status(application, scope)).await.expect("the status reads") }
		};

		assert_eq!(read("linear", "space").await, json!({ "status": "notInstalled" }));
		assert_eq!(read("linear", "companion").await, json!({ "status": "connected" }));
		assert_eq!(read("linear", "user").await, json!({ "status": "needsAuthorization" }));
		assert_eq!(
			read("paper", "companion").await,
			json!({ "status": "failed", "reason": "refused" })
		);
		cleaned(&app);
	}

	#[tokio::test]
	async fn a_status_in_an_unknown_scope_is_refused_by_name() {
		let app = a_host("status-unknown-scope").await;

		let refusal = serving_in(&app, "c1", unreached().await)
			.answer(a_status("linear", "team"))
			.await
			.expect_err("the scope is refused");

		assert_eq!(refusal, json!({ "kind": "unknownScope", "scope": "team" }));
		cleaned(&app);
	}
}
