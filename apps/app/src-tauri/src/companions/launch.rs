use std::fmt::Debug;
use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime, State};

use super::contract::{
	CompanionCreated, CompanionSeedRefused, LaunchOutcome, CREATED_EVENT, SEED_REFUSED_EVENT,
};

const REASON_SEPARATOR: &str = "; ";

#[derive(Debug, Default)]
pub struct LaunchOutcomeState(Mutex<LaunchOutcome>);

impl LaunchOutcomeState {
	pub fn read(&self) -> LaunchOutcome {
		self.0.lock().unwrap_or_else(PoisonError::into_inner).clone()
	}

	fn record(&self, outcome: LaunchOutcome) {
		*self.0.lock().unwrap_or_else(PoisonError::into_inner) = outcome;
	}
}

#[tauri::command]
pub fn companion_launch_outcome(state: State<'_, LaunchOutcomeState>) -> LaunchOutcome {
	state.read()
}

pub fn settle<R: Runtime>(
	app: &AppHandle<R>,
	created: Option<CompanionCreated>,
	reasons: Vec<String>,
) {
	let outcome = LaunchOutcome {
		created,
		refused: (!reasons.is_empty())
			.then(|| CompanionSeedRefused { reason: reasons.join(REASON_SEPARATOR) }),
	};
	match app.try_state::<LaunchOutcomeState>() {
		Some(state) => state.record(outcome.clone()),
		None => eprintln!("the launch outcome was not kept for a later read: {outcome:?}"),
	}
	if let Some(created) = outcome.created {
		announce(app, CREATED_EVENT, created);
	}
	if let Some(refused) = outcome.refused {
		announce(app, SEED_REFUSED_EVENT, refused);
	}
}

fn announce<R: Runtime, T: Serialize + Clone + Debug>(app: &AppHandle<R>, event: &str, payload: T) {
	if let Err(failure) = app.emit(event, payload.clone()) {
		eprintln!("{event} was not announced for {payload:?}: {failure}");
	}
}
