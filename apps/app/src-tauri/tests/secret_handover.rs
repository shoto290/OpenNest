use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use opennest_app::agent::contract::AgentEvent;
use opennest_app::agent::session::{EventSink, Session, SessionOptions};
use opennest_app::agent::sidecar::{Sidecar, SidecarOptions};
use tokio::sync::mpsc;

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

fn an_arrivals_file() -> PathBuf {
	let dir = std::env::temp_dir().join(format!("opennest-arrivals-{}", uuid::Uuid::new_v4()));
	std::fs::create_dir_all(&dir).expect("temp dir");
	dir.join("arrivals.txt")
}

async fn a_sidecar(arrivals: &Path) -> Arc<Sidecar> {
	let mut options = SidecarOptions::new(PathBuf::from(FAKE_SIDECAR))
		.with_env("FAKE_AGENT_ARRIVALS", arrivals.to_string_lossy().into_owned());
	options.ready_timeout = Duration::from_secs(2);
	Sidecar::start(options).await.expect("the fake sidecar announces itself")
}

async fn open_with(secrets: BTreeMap<String, String>, arrivals: &Path) -> Session {
	let sidecar = a_sidecar(arrivals).await;
	let (tx, _events) = mpsc::unbounded_channel::<AgentEvent>();
	let sink: Arc<dyn EventSink> = Arc::new(tx);
	let mut options = SessionOptions::new(std::env::temp_dir()).with_secrets(secrets);
	options.startup_timeout = Duration::from_secs(2);
	Session::start(sidecar, options, sink).await.expect("the session opens")
}

fn arrivals_in(path: &Path) -> Vec<String> {
	std::fs::read_to_string(path)
		.expect("the fake sidecar noted what arrived")
		.lines()
		.map(str::to_owned)
		.collect()
}

#[tokio::test]
async fn the_secrets_reach_the_sidecar_before_the_session_is_opened() {
	let arrivals = an_arrivals_file();
	let secrets = BTreeMap::from([
		("github.GITHUB_TOKEN".to_owned(), "ghp_livevalue".to_owned()),
		("linear.API_KEY".to_owned(), "lin_livevalue".to_owned()),
	]);

	let session = open_with(secrets, &arrivals).await;

	assert_eq!(
		arrivals_in(&arrivals),
		vec!["secrets:github.GITHUB_TOKEN,linear.API_KEY".to_owned(), "open".to_owned()]
	);
	session.shutdown().await;
}

#[tokio::test]
async fn a_bot_with_no_secrets_opens_without_the_frame() {
	let arrivals = an_arrivals_file();

	let session = open_with(BTreeMap::new(), &arrivals).await;

	assert_eq!(arrivals_in(&arrivals), vec!["open".to_owned()]);
	session.shutdown().await;
}
