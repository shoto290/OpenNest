
use opennest_app::agent::commands::terminate_session;
use opennest_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use opennest_app::agent::AgentState;
use opennest_app::commands::invoke_handler;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

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

	std::env::set_var("FAKE_AGENT_MODELS", "something,else");
	assert_eq!(call(&window, "agent_models"), Ok(offered), "a second ask reached the sidecar");

	tauri::async_runtime::block_on(terminate_session(app.state::<AgentState>().inner()));
	std::env::remove_var("FAKE_AGENT_MODELS");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}
