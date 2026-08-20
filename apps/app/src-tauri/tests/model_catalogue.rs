//! The model catalogue as the frontend asks for it, over IPC.
//!
//! A suite of its own because the answer is asked once per host and kept: a second
//! test pointing the host at a different sidecar would be answered with the first
//! one's catalogue, which would make both tests lie. One process, one ask, one
//! sidecar — the way a launch has it.

use opennest_app::agent::commands::terminate_session;
use opennest_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use opennest_app::agent::AgentState;
use opennest_app::commands::invoke_handler;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

/// Labels no module of this repository could have made up. The host holds no list of
/// models to check an answer against, and this is what says so from the outside: what
/// the sidecar offers is what the frontend is offered, verbatim and in order.
const OFFERED: &str = "quasar,quasar[1m],nimbus-preview";

fn window(app: &tauri::App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app.handle(), "main", tauri::WebviewUrl::default())
		.build()
		.expect("window builds")
}

fn call(window: &WebviewWindow<MockRuntime>, cmd: &str) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: cmd.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: json!({}).into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
}

/// The whole crossing: the command is registered, the host asks the sidecar it serves
/// its sessions from, and what comes back is the list the sidecar named — labels this
/// build has never heard of included, which is the point.
#[test]
fn the_catalogue_crosses_as_the_sidecar_offers_it() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_MODELS", OFFERED);

	let app = mock_builder()
		.manage(AgentState::default())
		.invoke_handler(invoke_handler())
		.build(mock_context(noop_assets()))
		.expect("app builds");
	let window = window(&app);

	let offered = call(&window, "agent_models").expect("the catalogue crosses");
	let values: Vec<String> =
		serde_json::from_value(offered.clone()).expect("a list of labels crossed");

	assert_eq!(values, OFFERED.split(',').collect::<Vec<_>>(), "the catalogue crossed changed");

	// Asked once and kept: the same answer, with nothing left to ask.
	std::env::set_var("FAKE_AGENT_MODELS", "something,else");
	assert_eq!(call(&window, "agent_models"), Ok(offered), "a second ask reached the sidecar");

	tauri::async_runtime::block_on(terminate_session(app.state::<AgentState>().inner()));
	std::env::remove_var("FAKE_AGENT_MODELS");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}
