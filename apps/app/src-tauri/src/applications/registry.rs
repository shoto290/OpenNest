use std::collections::HashSet;
use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use reqwest::{Client, StatusCode, Url};
use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::task::JoinSet;

use super::contract::{Application, ApplicationsError, Install};
use crate::missions::github::installed_tls_provider;

pub const REGISTRY: &str = "https://registry.modelcontextprotocol.io";

const API_VERSION: &str = "v0.1";

const BOUND: &str = "10";

const TIMEOUT: Duration = Duration::from_secs(10);

const AGENT: &str = "Kiroshi";

const STREAMABLE_HTTP: &str = "streamable-http";

const SSE: &str = "sse";

const NPM: &str = "npm";

#[derive(Deserialize)]
struct Listed {
	servers: Vec<Entry>,
}

#[derive(Deserialize)]
struct Entry {
	server: Server,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Server {
	name: String,
	#[serde(default)]
	title: Option<String>,
	#[serde(default)]
	description: String,
	#[serde(default)]
	remotes: Vec<Remote>,
	#[serde(default)]
	packages: Vec<Package>,
}

#[derive(Deserialize)]
struct Remote {
	#[serde(rename = "type")]
	kind: String,
	url: String,
	#[serde(default)]
	headers: Vec<Input>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Package {
	registry_type: String,
	identifier: String,
	#[serde(default)]
	environment_variables: Vec<Input>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Input {
	name: String,
	#[serde(default)]
	description: Option<String>,
	#[serde(default)]
	is_required: bool,
	#[serde(default)]
	is_secret: bool,
	#[serde(default)]
	value: Option<String>,
}

type DetailRead = (usize, String, Result<Entry, ApplicationsError>);

enum Transport<'a> {
	Remote(&'a Remote),
	Npm(&'a Package),
}

pub async fn search(base: &str, query: &str) -> Result<Vec<Application>, ApplicationsError> {
	let base = Url::parse(base)
		.map_err(|error| ApplicationsError::RegistryUnreached { detail: error.to_string() })?;
	let client = client()?;
	let mut list = endpoint(&base, &[API_VERSION, "servers"])?;
	list.query_pairs_mut().append_pair("search", query).append_pair("limit", BOUND);
	let listed: Listed = read(&client, list).await?;
	let mut details = JoinSet::new();
	for (at, name) in distinct(listed.servers).into_iter().enumerate() {
		let url = endpoint(&base, &[API_VERSION, "servers", &name, "versions", "latest"])?;
		let client = client.clone();
		details.spawn(async move { (at, name, read::<Entry>(&client, url).await) });
	}
	let servers = answered(details).await?;
	Ok(servers.into_iter().filter_map(descriptor).collect())
}

fn distinct(entries: Vec<Entry>) -> Vec<String> {
	let mut seen = HashSet::new();
	entries
		.into_iter()
		.map(|entry| entry.server.name)
		.filter(|name| seen.insert(name.clone()))
		.collect()
}

async fn answered(mut details: JoinSet<DetailRead>) -> Result<Vec<Server>, ApplicationsError> {
	let mut outcomes = Vec::new();
	while let Some(joined) = details.join_next().await {
		outcomes.push(match joined {
			Ok((at, name, outcome)) => (
				at,
				outcome.inspect_err(|failure| {
					eprintln!("the registry entry {name} was left out: {failure:?}")
				}),
			),
			Err(stopped) => (
				usize::MAX,
				Err(ApplicationsError::RegistryUnreadable {
					detail: format!("a detail read stopped: {stopped}"),
				}),
			),
		});
	}
	outcomes.sort_by_key(|(at, _)| *at);
	let (read, failed): (Vec<_>, Vec<_>) =
		outcomes.into_iter().map(|(_, outcome)| outcome).partition(Result::is_ok);
	if let (true, Some(Err(failure))) = (read.is_empty(), failed.into_iter().next()) {
		return Err(failure);
	}
	Ok(read.into_iter().flatten().map(|entry| entry.server).collect())
}

fn client() -> Result<Client, ApplicationsError> {
	installed_tls_provider();
	let mut headers = HeaderMap::new();
	headers.insert(USER_AGENT, HeaderValue::from_static(AGENT));
	Client::builder().timeout(TIMEOUT).default_headers(headers).build().map_err(|error| {
		ApplicationsError::RegistryUnreached {
			detail: format!("the http client was not built: {error}"),
		}
	})
}

fn endpoint(base: &Url, segments: &[&str]) -> Result<Url, ApplicationsError> {
	let mut url = base.clone();
	url.path_segments_mut()
		.map_err(|()| ApplicationsError::RegistryUnreached {
			detail: format!("{base} cannot hold a path"),
		})?
		.pop_if_empty()
		.extend(segments);
	Ok(url)
}

async fn read<T: DeserializeOwned>(client: &Client, url: Url) -> Result<T, ApplicationsError> {
	let answer = client.get(url).send().await.map_err(unreached)?;
	if answer.status() != StatusCode::OK {
		return Err(ApplicationsError::RegistryRefused { status: answer.status().as_u16() });
	}
	answer
		.json::<T>()
		.await
		.map_err(|error| ApplicationsError::RegistryUnreadable { detail: error.to_string() })
}

fn unreached(error: reqwest::Error) -> ApplicationsError {
	if error.is_timeout() {
		return ApplicationsError::RegistryTimedOut;
	}
	ApplicationsError::RegistryUnreached { detail: error.to_string() }
}

fn descriptor(server: Server) -> Option<Application> {
	let (config, install) = match transport(&server)? {
		Transport::Remote(remote) => match asked(&remote.headers) {
			Some(key) => (headed_config(remote), key),
			None => (remote_config(remote), Install::Oauth),
		},
		Transport::Npm(package) => (
			package_config(package),
			asked(&package.environment_variables).unwrap_or(Install::Nothing),
		),
	};
	Some(Application {
		title: server.title.unwrap_or_else(|| server.name.clone()),
		name: server.name,
		description: server.description,
		config,
		tools: Vec::new(),
		logo: None,
		install,
	})
}

fn transport(server: &Server) -> Option<Transport<'_>> {
	let remote = |kind: &str| server.remotes.iter().find(|remote| remote.kind == kind);
	remote(STREAMABLE_HTTP).or_else(|| remote(SSE)).map(Transport::Remote).or_else(|| {
		server.packages.iter().find(|package| package.registry_type == NPM).map(Transport::Npm)
	})
}

fn remote_config(remote: &Remote) -> Value {
	json!({ "type": "http", "url": remote.url })
}

fn headed_config(remote: &Remote) -> Value {
	let mut config = remote_config(remote);
	config["headers"] = Value::Object(
		remote
			.headers
			.iter()
			.map(|header| (header.name.clone(), Value::String(header_value(header))))
			.collect(),
	);
	config
}

fn header_value(header: &Input) -> String {
	let reference = reference(&header.name);
	header
		.value
		.as_deref()
		.and_then(|template| substituted(template, &reference))
		.unwrap_or(reference)
}

fn substituted(template: &str, reference: &str) -> Option<String> {
	let (before, opened) = template.split_once('{')?;
	let (_, after) = opened.split_once('}')?;
	let rest = substituted(after, reference).unwrap_or_else(|| after.to_owned());
	Some(format!("{before}{reference}{rest}"))
}

fn package_config(package: &Package) -> Value {
	let mut config =
		json!({ "type": "stdio", "command": "npx", "args": ["-y", package.identifier] });
	let mut required =
		package.environment_variables.iter().filter(|input| input.is_required).peekable();
	if required.peek().is_some() {
		config["env"] = placeholders(required);
	}
	config
}

fn placeholders<'a>(inputs: impl Iterator<Item = &'a Input>) -> Value {
	Value::Object(
		inputs.map(|input| (input.name.clone(), Value::String(reference(&input.name)))).collect(),
	)
}

fn reference(declared: &str) -> String {
	format!("${{{}}}", variable(declared))
}

fn asked(inputs: &[Input]) -> Option<Install> {
	inputs.iter().find(|input| input.is_required && input.is_secret).map(|input| Install::Key {
		name: input.name.clone(),
		secret: variable(&input.name),
		description: input.description.clone(),
	})
}

fn variable(declared: &str) -> String {
	let named: String = declared
		.chars()
		.map(|held| if held.is_ascii_alphanumeric() { held.to_ascii_uppercase() } else { '_' })
		.collect();
	if named.starts_with(|held: char| held.is_ascii_digit()) {
		return format!("_{named}");
	}
	named
}

#[cfg(test)]
mod tests {
	use std::collections::HashMap;
	use std::net::{Ipv4Addr, SocketAddr};
	use std::sync::{Arc, Mutex};

	use axum::extract::{Path as AxumPath, State as Extracted};
	use axum::http::Uri;
	use axum::response::{IntoResponse, Response as Answered};
	use axum::routing::get;
	use axum::Router;

	use super::*;

	const BROKEN: &str = "io.test/broken";

	fn described(body: Value) -> Application {
		let server: Server = serde_json::from_value(body).expect("the fixture is a server.json");
		descriptor(server).expect("the fixture offers a transport")
	}

	fn a_remote_without_headers() -> Value {
		json!({
			"name": "com.notion/mcp",
			"title": "Notion",
			"description": "Notion workspace.",
			"remotes": [{ "type": "streamable-http", "url": "https://mcp.notion.test/mcp" }],
		})
	}

	fn a_remote_asking_a_required_secret_header() -> Value {
		json!({
			"name": "ai.smithery/smithery-notion",
			"description": "Notion through Smithery.",
			"remotes": [{
				"type": "streamable-http",
				"url": "https://server.smithery.test/notion/mcp",
				"headers": [{
					"name": "Authorization",
					"description": "Bearer token for Smithery authentication",
					"isRequired": true,
					"isSecret": true,
					"value": "Bearer {smithery_api_key}",
				}],
			}],
		})
	}

	fn an_npm_package_with_a_required_plain_variable() -> Value {
		json!({
			"name": "io.github.Digital-Defiance/mcp-filesystem",
			"description": "A filesystem server.",
			"packages": [{
				"registryType": "npm",
				"identifier": "@digital-defiance/mcp-filesystem",
				"version": "1.0.0",
				"transport": { "type": "stdio" },
				"environmentVariables": [
					{ "name": "ALLOWED_ROOT", "isRequired": true, "default": "/srv/data" },
					{ "name": "LOG_LEVEL", "isRequired": false },
				],
			}],
		})
	}

	#[test]
	fn a_remote_with_no_header_answers_oauth() {
		let application = described(a_remote_without_headers());

		assert_eq!(application.install, Install::Oauth);
		assert_eq!(
			application.config,
			json!({ "type": "http", "url": "https://mcp.notion.test/mcp" })
		);
		assert_eq!(application.title, "Notion");
		assert_eq!(application.logo, None);
	}

	#[test]
	fn a_required_secret_header_answers_the_key_case_naming_it() {
		let application = described(a_remote_asking_a_required_secret_header());

		assert_eq!(
			application.install,
			Install::Key {
				name: "Authorization".to_owned(),
				secret: "AUTHORIZATION".to_owned(),
				description: Some("Bearer token for Smithery authentication".to_owned()),
			}
		);
		assert_eq!(
			application.config,
			json!({
				"type": "http",
				"url": "https://server.smithery.test/notion/mcp",
				"headers": { "Authorization": "Bearer ${AUTHORIZATION}" },
			})
		);
		assert_eq!(application.title, "ai.smithery/smithery-notion");
	}

	#[test]
	fn a_declared_value_with_no_part_to_fill_answers_the_bare_reference() {
		let application = described(json!({
			"name": "io.test/fixed",
			"remotes": [{
				"type": "streamable-http",
				"url": "https://fixed.test/mcp",
				"headers": [{ "name": "X-Api-Key", "isRequired": true, "isSecret": true, "value": "fixed" }],
			}],
		}));

		assert_eq!(application.config["headers"], json!({ "X-Api-Key": "${X_API_KEY}" }));
	}

	#[test]
	fn an_npm_package_with_a_required_plain_variable_answers_nothing_with_a_placeholder() {
		let application = described(an_npm_package_with_a_required_plain_variable());

		assert_eq!(application.install, Install::Nothing);
		assert_eq!(
			application.config,
			json!({
				"type": "stdio",
				"command": "npx",
				"args": ["-y", "@digital-defiance/mcp-filesystem"],
				"env": { "ALLOWED_ROOT": "${ALLOWED_ROOT}" },
			})
		);
	}

	#[test]
	fn a_secret_header_whose_requirement_is_absent_answers_oauth() {
		let application = described(json!({
			"name": "io.github.github/github-mcp-server",
			"description": "GitHub.",
			"remotes": [{
				"type": "streamable-http",
				"url": "https://api.github.test/mcp/",
				"headers": [{ "name": "Authorization", "isSecret": true }],
			}],
		}));

		assert_eq!(application.install, Install::Oauth);
		assert_eq!(
			application.config,
			json!({ "type": "http", "url": "https://api.github.test/mcp/" })
		);
		assert!(application.config.get("headers").is_none());
	}

	#[test]
	fn a_required_secret_variable_answers_the_key_case_naming_the_first() {
		let application = described(json!({
			"name": "io.test/keyed",
			"packages": [{
				"registryType": "npm",
				"identifier": "keyed-mcp",
				"environmentVariables": [
					{ "name": "OPTIONAL_TOKEN", "isSecret": true },
					{ "name": "api-key", "isRequired": true, "isSecret": true, "description": "The key." },
					{ "name": "OTHER_KEY", "isRequired": true, "isSecret": true },
				],
			}],
		}));

		assert_eq!(
			application.install,
			Install::Key {
				name: "api-key".to_owned(),
				secret: "API_KEY".to_owned(),
				description: Some("The key.".to_owned()),
			}
		);
		assert_eq!(
			application.config["env"],
			json!({ "api-key": "${API_KEY}", "OTHER_KEY": "${OTHER_KEY}" })
		);
	}

	#[test]
	fn streamable_http_is_preferred_over_sse_and_sse_over_npm() {
		let npm = json!({ "registryType": "npm", "identifier": "an-mcp" });
		let sse = json!({ "type": "sse", "url": "https://sse.test/mcp" });
		let streamable = json!({ "type": "streamable-http", "url": "https://streamable.test/mcp" });

		let every =
			described(json!({ "name": "a", "remotes": [sse, streamable], "packages": [npm] }));
		let no_streamable = described(json!({ "name": "a", "remotes": [sse], "packages": [npm] }));
		let package_only = described(json!({ "name": "a", "packages": [npm] }));

		assert_eq!(every.config["url"], "https://streamable.test/mcp");
		assert_eq!(no_streamable.config, json!({ "type": "http", "url": "https://sse.test/mcp" }));
		assert_eq!(package_only.config["command"], "npx");
	}

	#[test]
	fn an_entry_offering_none_of_the_three_is_left_out() {
		let server: Server = serde_json::from_value(json!({
			"name": "io.test/pypi-only",
			"remotes": [{ "type": "websocket", "url": "wss://ws.test/mcp" }],
			"packages": [{ "registryType": "pypi", "identifier": "an-mcp" }],
		}))
		.expect("the fixture is a server.json");

		assert!(descriptor(server).is_none());
	}

	struct Held {
		list_status: StatusCode,
		listed: Vec<&'static str>,
		details: HashMap<String, Value>,
		asked: Mutex<Vec<String>>,
		detailed: Mutex<Vec<String>>,
	}

	async fn serving(held: Held) -> (String, Arc<Held>) {
		let held = Arc::new(held);
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address: SocketAddr = listener.local_addr().expect("the stub is named");
		let router = Router::new()
			.route("/v0.1/servers", get(list_of))
			.route("/v0.1/servers/{name}/versions/latest", get(detail_of))
			.with_state(held.clone());
		tokio::spawn(async move { axum::serve(listener, router).await.expect("the stub serves") });
		(format!("http://{address}"), held)
	}

	async fn list_of(Extracted(held): Extracted<Arc<Held>>, uri: Uri) -> Answered {
		held.asked.lock().expect("the stub records").push(uri.to_string());
		if held.list_status != StatusCode::OK {
			return held.list_status.into_response();
		}
		let servers: Vec<Value> =
			held.listed.iter().map(|name| json!({ "server": { "name": name } })).collect();
		as_json(&json!({ "servers": servers, "metadata": { "count": servers.len() } }))
	}

	async fn detail_of(
		Extracted(held): Extracted<Arc<Held>>,
		AxumPath(name): AxumPath<String>,
	) -> Answered {
		held.detailed.lock().expect("the stub records").push(name.clone());
		match held.details.get(&name) {
			Some(detail) => as_json(&json!({ "server": detail })),
			None => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
		}
	}

	fn as_json(held: &Value) -> Answered {
		Answered::builder()
			.status(StatusCode::OK)
			.header(reqwest::header::CONTENT_TYPE, "application/json")
			.body(axum::body::Body::from(held.to_string()))
			.expect("the stub answers with a body")
	}

	fn holding(listed: Vec<&'static str>) -> Held {
		let details = [a_remote_without_headers(), an_npm_package_with_a_required_plain_variable()]
			.into_iter()
			.map(|detail| (detail["name"].as_str().expect("named").to_owned(), detail))
			.collect();
		Held {
			list_status: StatusCode::OK,
			listed,
			details,
			asked: Mutex::new(Vec::new()),
			detailed: Mutex::new(Vec::new()),
		}
	}

	#[tokio::test]
	async fn a_search_reads_every_detail_and_leaves_out_the_one_that_failed() {
		let (base, held) = serving(holding(vec![
			"com.notion/mcp",
			BROKEN,
			"io.github.Digital-Defiance/mcp-filesystem",
		]))
		.await;

		let found = search(&base, "notion files").await.expect("the search answers");

		let names: Vec<&str> = found.iter().map(|held| held.name.as_str()).collect();
		assert_eq!(names, ["com.notion/mcp", "io.github.Digital-Defiance/mcp-filesystem"]);
		assert_eq!(found[0].install, Install::Oauth);
		assert_eq!(found[1].install, Install::Nothing);
		let asked = held.asked.lock().expect("the stub records").clone();
		assert_eq!(asked, ["/v0.1/servers?search=notion+files&limit=10"]);
	}

	#[tokio::test]
	async fn a_search_whose_every_detail_is_refused_answers_the_refusal() {
		let (base, held) =
			serving(holding(vec![BROKEN, "io.test/also-broken", "io.test/still-broken"])).await;

		let answered = search(&base, "broken").await;

		assert_eq!(answered, Err(ApplicationsError::RegistryRefused { status: 500 }));
		assert_eq!(held.detailed.lock().expect("the stub records").len(), 3);
	}

	#[tokio::test]
	async fn a_server_listed_twice_is_read_once_and_answered_once() {
		let (base, held) = serving(holding(vec!["com.notion/mcp", "com.notion/mcp"])).await;

		let found = search(&base, "notion").await.expect("the search answers");

		let names: Vec<&str> = found.iter().map(|held| held.name.as_str()).collect();
		assert_eq!(names, ["com.notion/mcp"]);
		assert_eq!(*held.detailed.lock().expect("the stub records"), ["com.notion/mcp"]);
	}

	#[tokio::test]
	async fn a_query_matching_nothing_answers_an_empty_list() {
		let (base, _) = serving(holding(Vec::new())).await;

		assert_eq!(search(&base, "nothing").await, Ok(Vec::new()));
	}

	#[tokio::test]
	async fn a_refused_list_answers_an_error_and_not_an_empty_list() {
		let mut refusing = holding(vec!["com.notion/mcp"]);
		refusing.list_status = StatusCode::SERVICE_UNAVAILABLE;
		let (base, _) = serving(refusing).await;

		assert_eq!(
			search(&base, "notion").await,
			Err(ApplicationsError::RegistryRefused { status: 503 })
		);
	}

	#[tokio::test]
	async fn an_unreached_registry_answers_an_error_and_not_an_empty_list() {
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let address = listener.local_addr().expect("the port is named");
		drop(listener);

		let answered = search(&format!("http://{address}"), "notion").await;

		assert!(
			matches!(answered, Err(ApplicationsError::RegistryUnreached { .. })),
			"got {answered:?}"
		);
	}
}
