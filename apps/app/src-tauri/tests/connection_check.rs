
use opennest_app::agent::commands::{check, terminate_session};
use opennest_app::agent::contract::{ConnectionState, TransportError};
use opennest_app::agent::sidecar::SIDECAR_OVERRIDE_ENV;
use opennest_app::agent::AgentState;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

static SERIAL: std::sync::Mutex<()> = std::sync::Mutex::new(());

fn serial() -> std::sync::MutexGuard<'static, ()> {
	SERIAL.lock().unwrap_or_else(|error| error.into_inner())
}

fn runtime() -> tokio::runtime::Runtime {
	tokio::runtime::Runtime::new().expect("runtime")
}

fn not_a_sidecar() -> &'static str {
	concat!(env!("CARGO_MANIFEST_DIR"), "/Cargo.toml")
}

#[test]
fn a_signed_out_install_is_reported_as_a_sign_in_and_not_as_a_missing_sidecar() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_SIGNED_OUT", "1");

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state).await;

		assert_eq!(report.connection, ConnectionState::Unavailable);
		assert!(!report.authenticated);
		assert_eq!(report.error, Some(TransportError::NotAuthenticated));
		assert_eq!(
			report.binary_version.as_deref(),
			Some("2.0.0-fake"),
			"a sidecar that answered was reported as one that never spoke"
		);

		terminate_session(&state).await;
	});

	std::env::remove_var("FAKE_AGENT_SIGNED_OUT");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_host_with_no_sidecar_reports_neither_a_version_nor_a_sign_in() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, not_a_sidecar());

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state).await;

		assert_eq!(report.connection, ConnectionState::Unavailable);
		assert!(!report.authenticated);
		assert_eq!(report.binary_version, None, "a host with nothing to ask reported a version");
		assert!(
			!matches!(report.error, Some(TransportError::NotAuthenticated)),
			"a missing sidecar was reported as a sign-in: {:?}",
			report.error
		);
		assert!(report.error.is_some(), "a host with nothing to ask reported no failure");

		terminate_session(&state).await;
	});

	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_sidecar_that_died_before_ready_is_reported_with_what_it_wrote() {
	let _serial = serial();
	let motive = "the bundled runtime is not installed";
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_STARTUP_STDERR", motive);

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state).await;

		assert_eq!(report.connection, ConnectionState::Unavailable);
		let Some(TransportError::Crashed { detail, .. }) = report.error else {
			panic!("a sidecar that died before ready was not reported as a crash");
		};
		let detail = detail.expect("the crash named no detail");
		assert!(
			detail.starts_with("the sidecar exited during startup"),
			"the startup failure was replaced: {detail}"
		);
		assert!(detail.contains(motive), "what the sidecar wrote was dropped: {detail}");

		terminate_session(&state).await;
	});

	std::env::remove_var("FAKE_AGENT_STARTUP_STDERR");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}

#[test]
fn a_probe_that_could_not_run_is_reported_apart_from_a_refusal() {
	let _serial = serial();
	std::env::set_var(SIDECAR_OVERRIDE_ENV, FAKE_SIDECAR);
	std::env::set_var("FAKE_AGENT_CHECK_FAILS", "the credential store is unreadable");

	let state = AgentState::default();
	runtime().block_on(async {
		let report = check(&state).await;

		assert_eq!(report.connection, ConnectionState::Unavailable);
		assert!(matches!(report.error, Some(TransportError::AuthCheckFailed { .. })));

		terminate_session(&state).await;
	});

	std::env::remove_var("FAKE_AGENT_CHECK_FAILS");
	std::env::remove_var(SIDECAR_OVERRIDE_ENV);
}
