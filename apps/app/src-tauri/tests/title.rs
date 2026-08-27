use opennest_app::agent::commands::terminate_session;
use opennest_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use opennest_app::agent::AgentState;
use opennest_app::commands::invoke_handler;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Manager, WebviewWindow, WebviewWindowBuilder};

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

fn window(app: &tauri::App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app.handle(), "main", tauri::WebviewUrl::default())
		.build()
		.expect("window builds")
}

fn ask_for_a_title(window: &WebviewWindow<MockRuntime>, text: &str) -> Value {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: "agent_title".into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: json!({ "text": text }).into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.expect("the title crosses")
}

#[test]
fn a_title_crosses_without_a_session_and_nothing_crosses_when_the_runtime_answers_nothing() {
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);

	let app = mock_builder()
		.manage(AgentState::default())
		.invoke_handler(invoke_handler())
		.build(mock_context(noop_assets()))
		.expect("app builds");
	let window = window(&app);

	assert_eq!(
		ask_for_a_title(&window, "Migrer la base de données vers Postgres"),
		json!("Migrer la base de données vers Postgres"),
		"the runtime's line crossed changed"
	);

	assert_eq!(
		ask_for_a_title(&window, "Rename every conversation"),
		json!("Rename every conversation"),
		"a second ask read a cache instead of the runtime"
	);

	assert_eq!(
		ask_for_a_title(&window, "   \n  "),
		Value::Null,
		"an empty answer crossed as a title"
	);

	tauri::async_runtime::block_on(terminate_session(app.state::<AgentState>().inner()));
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}
