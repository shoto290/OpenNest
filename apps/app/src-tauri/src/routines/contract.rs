use serde::{Deserialize, Serialize};

use crate::conversations::contract::{StorageFailure, TranscriptStoreError};
use crate::db::DatabaseError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FieldType {
	String,
	Number,
	Boolean,
	Datetime,
}

impl FieldType {
	pub const ALL: [FieldType; 4] =
		[FieldType::String, FieldType::Number, FieldType::Boolean, FieldType::Datetime];

	pub fn operators(self) -> &'static [FilterOperator] {
		match self {
			FieldType::String => &[
				FilterOperator::Exists,
				FilterOperator::NotExists,
				FilterOperator::Equals,
				FilterOperator::NotEquals,
				FilterOperator::Contains,
				FilterOperator::NotContains,
				FilterOperator::StartsWith,
				FilterOperator::EndsWith,
			],
			FieldType::Number => &[
				FilterOperator::Exists,
				FilterOperator::NotExists,
				FilterOperator::Equals,
				FilterOperator::NotEquals,
				FilterOperator::Gt,
				FilterOperator::Lt,
			],
			FieldType::Boolean => &[
				FilterOperator::Exists,
				FilterOperator::NotExists,
				FilterOperator::Equals,
				FilterOperator::NotEquals,
			],
			FieldType::Datetime => &[
				FilterOperator::Exists,
				FilterOperator::NotExists,
				FilterOperator::Gt,
				FilterOperator::Lt,
			],
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
	Exists,
	NotExists,
	Equals,
	NotEquals,
	Contains,
	NotContains,
	StartsWith,
	EndsWith,
	Gt,
	Lt,
}

impl FilterOperator {
	pub const ALL: [FilterOperator; 10] = [
		FilterOperator::Exists,
		FilterOperator::NotExists,
		FilterOperator::Equals,
		FilterOperator::NotEquals,
		FilterOperator::Contains,
		FilterOperator::NotContains,
		FilterOperator::StartsWith,
		FilterOperator::EndsWith,
		FilterOperator::Gt,
		FilterOperator::Lt,
	];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum FilterMatchMode {
	All,
	Any,
}

impl FilterMatchMode {
	pub const ALL: [FilterMatchMode; 2] = [FilterMatchMode::All, FilterMatchMode::Any];
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterRow {
	pub field: String,
	pub operator: FilterOperator,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub value: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Filter {
	pub match_mode: FilterMatchMode,
	pub rows: Vec<FilterRow>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PayloadField {
	pub name: String,
	#[serde(rename = "type")]
	pub field_type: FieldType,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerSource {
	pub id: String,
	pub title: String,
	pub payload: Vec<PayloadField>,
	pub dedupe_key: String,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub header: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RunOutcome {
	Ok,
	Nothing,
	Skipped,
	Failed,
}

impl RunOutcome {
	pub const ALL: [RunOutcome; 4] =
		[RunOutcome::Ok, RunOutcome::Nothing, RunOutcome::Skipped, RunOutcome::Failed];

	pub fn is_failure(self) -> bool {
		matches!(self, RunOutcome::Failed)
	}

	pub fn clears_failures(self) -> bool {
		matches!(self, RunOutcome::Ok | RunOutcome::Nothing)
	}
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Routine {
	pub id: String,
	pub conversation_id: String,
	pub bot_id: String,
	pub title: String,
	pub instruction: String,
	pub trigger_source_id: String,
	pub filter: Filter,
	pub trigger_config: serde_json::Value,
	pub is_enabled: bool,
	pub consecutive_failures: u32,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineDraft {
	pub conversation_id: String,
	pub bot_id: String,
	pub title: String,
	pub instruction: String,
	pub trigger_source_id: String,
	pub filter: Filter,
	pub trigger_config: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineEdit {
	pub title: String,
	pub instruction: String,
	pub filter: Filter,
	pub trigger_config: serde_json::Value,
	pub is_enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineKey {
	pub key: String,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub header: Option<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineRun {
	pub id: String,
	pub routine_id: String,
	pub started_at: i64,
	pub ended_at: Option<i64>,
	pub outcome: Option<RunOutcome>,
	pub reason: Option<String>,
	pub cost_usd: Option<f64>,
	pub model_usage: Option<serde_json::Value>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunClosing {
	pub outcome: RunOutcome,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub reason: Option<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub cost_usd: Option<f64>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub model_usage: Option<serde_json::Value>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub reported_turn_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportedRun {
	pub turn_id: String,
	pub routine_title: String,
	pub trigger_source_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TriggerEvent {
	pub routine_id: String,
	pub source: TriggerSource,
	pub payload: serde_json::Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunRequested {
	pub cause: RunCause,
	pub title: String,
	pub instruction: String,
	pub routine_id: String,
	pub run_id: String,
	pub bot_id: String,
	pub conversation_id: String,
	pub trigger_source_id: String,
	pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RunCause {
	Trigger,
	RunNow,
}

impl RunCause {
	pub const ALL: [RunCause; 2] = [RunCause::Trigger, RunCause::RunNow];
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SkipReason {
	LeaseHeld,
	HourlyCap,
	BackingOff,
}

impl SkipReason {
	pub const ALL: [SkipReason; 3] =
		[SkipReason::LeaseHeld, SkipReason::HourlyCap, SkipReason::BackingOff];

	pub fn recorded(self) -> &'static str {
		match self {
			SkipReason::LeaseHeld => "previous run still in progress",
			SkipReason::HourlyCap => "hourly cap",
			SkipReason::BackingOff => "backing off",
		}
	}
}

pub const LEASE_EXPIRED: &str = "lease expired";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Refusal {
	Disabled,
	Filter,
	DedupeValueMissing,
	AlreadySeen,
}

impl Refusal {
	pub const ALL: [Refusal; 4] =
		[Refusal::Disabled, Refusal::Filter, Refusal::DedupeValueMissing, Refusal::AlreadySeen];
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TriggerDecision {
	#[serde(rename_all = "camelCase")]
	Started { run_id: String },
	#[serde(rename_all = "camelCase")]
	Skipped { run_id: String, reason: SkipReason },
	#[serde(rename_all = "camelCase")]
	Refused { by: Refusal },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RoutineError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	UnknownRoutine { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownRun { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownBot { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownParticipant { conversation_id: String, bot_id: String },
	#[serde(rename_all = "camelCase")]
	UnknownSource { id: String },
	#[serde(rename_all = "camelCase")]
	RoutineOfAnotherConversation { id: String, conversation_id: String },
	#[serde(rename_all = "camelCase")]
	RoutineOfAnotherBot { id: String, bot_id: String },
	#[serde(rename_all = "camelCase")]
	NotInAConversation { conversation_id: String, reason: String },
	#[serde(rename_all = "camelCase")]
	UnreadableRequest { detail: String },
	#[serde(rename_all = "camelCase")]
	UnknownTurn { id: String },
	#[serde(rename_all = "camelCase")]
	TurnOfAnotherConversation { turn_id: String, conversation_id: String },
	#[serde(rename_all = "camelCase")]
	TurnAlreadyReported { turn_id: String, run_id: String },
	#[serde(rename_all = "camelCase")]
	TurnWithoutReport { turn_id: String, outcome: RunOutcome },
	#[serde(rename_all = "camelCase")]
	BlankField { field: String },
	#[serde(rename_all = "camelCase")]
	UnsupportedOperator {
		row: usize,
		field: String,
		operator: FilterOperator,
		field_type: FieldType,
	},
	#[serde(rename_all = "camelCase")]
	RunAlreadyClosed { id: String },
	#[serde(rename_all = "camelCase")]
	UnreadableSources { path: String, reason: String },
	#[serde(rename_all = "camelCase")]
	UnreadableExpression { expression: String, reason: String },
	#[serde(rename_all = "camelCase")]
	Undeliverable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unexpected { detail: String },
}

impl From<DatabaseError> for RoutineError {
	fn from(error: DatabaseError) -> Self {
		RoutineError::Storage { failure: (&error).into() }
	}
}

impl From<rusqlite::Error> for RoutineError {
	fn from(error: rusqlite::Error) -> Self {
		RoutineError::from(DatabaseError::Sqlite(error))
	}
}

impl From<TranscriptStoreError> for RoutineError {
	fn from(error: TranscriptStoreError) -> Self {
		match error {
			TranscriptStoreError::Unavailable { failure } => RoutineError::Unavailable { failure },
			TranscriptStoreError::UnknownBot { id } => RoutineError::UnknownBot { id },
			TranscriptStoreError::UnreadableSources { path, reason } => {
				RoutineError::UnreadableSources { path, reason }
			}
			TranscriptStoreError::Storage { failure } => RoutineError::Storage { failure },
			other => RoutineError::Unexpected { detail: format!("{other:?}") },
		}
	}
}

#[cfg(test)]
mod tests {
	use std::collections::BTreeSet;
	use std::path::PathBuf;

	use serde_json::{json, to_value};

	use super::*;

	fn vocabulary() -> serde_json::Value {
		let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
			.join("..")
			.join("shared")
			.join("filter-vocabulary.json");
		let text = std::fs::read_to_string(&path).expect("the vocabulary reads");
		serde_json::from_str(&text).expect("the vocabulary is JSON")
	}

	fn name<T: Serialize>(value: &T) -> String {
		to_value(value).expect("the value serialises").as_str().expect("it is a name").to_owned()
	}

	fn named<T: Serialize>(values: &[T]) -> BTreeSet<String> {
		values.iter().map(name).collect()
	}

	fn listed(value: &serde_json::Value) -> BTreeSet<String> {
		value
			.as_array()
			.expect("the entry is a list")
			.iter()
			.map(|name| name.as_str().expect("the name is a string").to_owned())
			.collect()
	}

	#[test]
	fn the_field_types_are_the_ones_the_shared_vocabulary_holds() {
		let vocabulary = vocabulary();

		assert_eq!(named(&FieldType::ALL), listed(&vocabulary["fieldTypes"]));
	}

	#[test]
	fn the_operators_are_the_ones_the_shared_vocabulary_holds() {
		let vocabulary = vocabulary();
		let table = vocabulary["operatorsByFieldType"].as_object().expect("the table is an object");

		assert_eq!(
			named(&FieldType::ALL),
			table.keys().cloned().collect::<BTreeSet<_>>(),
			"the table covers every field type"
		);
		let accepted: BTreeSet<String> = table.values().flat_map(listed).collect();
		assert_eq!(named(&FilterOperator::ALL), accepted);
	}

	#[test]
	fn every_field_type_accepts_the_operators_the_shared_vocabulary_gives_it() {
		let vocabulary = vocabulary();

		for field_type in FieldType::ALL {
			let held = name(&field_type);
			assert_eq!(
				named(field_type.operators()),
				listed(&vocabulary["operatorsByFieldType"][&held]),
				"the operators of {held} drifted"
			);
		}
	}

	#[test]
	fn the_match_modes_are_the_ones_the_shared_vocabulary_holds() {
		let vocabulary = vocabulary();

		assert_eq!(named(&FilterMatchMode::ALL), listed(&vocabulary["matchModes"]));
	}

	fn mirror() -> String {
		let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
			.join("..")
			.join("src")
			.join("lib")
			.join("routines")
			.join("routine-contract.ts");
		std::fs::read_to_string(&path).expect("the mirror reads")
	}

	fn mirrored(alias: &str) -> BTreeSet<String> {
		let mirror = mirror();
		let opening = format!("export type {alias} =");
		let start =
			mirror.find(&opening).unwrap_or_else(|| panic!("the mirror declares no {alias}"))
				+ opening.len();
		let body = &mirror[start..];
		let body = body.split("\nexport ").next().unwrap_or(body);
		body.split('"').skip(1).step_by(2).map(str::to_owned).collect()
	}

	fn tagged<T: Serialize>(values: &[T]) -> BTreeSet<String> {
		values
			.iter()
			.map(|value| {
				to_value(value).expect("the decision serialises")["kind"]
					.as_str()
					.expect("the tag is a name")
					.to_owned()
			})
			.collect()
	}

	fn mirrored_fields(alias: &str) -> BTreeSet<String> {
		let mirror = mirror();
		let opening = format!("export type {alias} = {{\n");
		let start =
			mirror.find(&opening).unwrap_or_else(|| panic!("the mirror declares no {alias}"))
				+ opening.len();
		let body = &mirror[start..];
		let body = body.split("\n}").next().unwrap_or(body);
		body.lines()
			.filter_map(|line| line.split_once(':'))
			.map(|(name, _)| name.trim().trim_end_matches('?').to_owned())
			.collect()
	}

	fn serialised_fields<T: Serialize>(value: &T) -> BTreeSet<String> {
		to_value(value)
			.expect("the value serialises")
			.as_object()
			.expect("the value is an object")
			.keys()
			.cloned()
			.collect()
	}

	#[test]
	fn a_routine_and_what_writes_one_name_the_fields_the_front_declares() {
		let filter = Filter { match_mode: FilterMatchMode::All, rows: Vec::new() };
		let routine = Routine {
			id: "r1".to_owned(),
			conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			title: "Nightly report".to_owned(),
			instruction: "Read the shift log.".to_owned(),
			trigger_source_id: "schedule".to_owned(),
			filter: filter.clone(),
			trigger_config: json!({}),
			is_enabled: true,
			consecutive_failures: 0,
			created_at: 1,
		};
		let draft = RoutineDraft {
			conversation_id: routine.conversation_id.clone(),
			bot_id: routine.bot_id.clone(),
			title: routine.title.clone(),
			instruction: routine.instruction.clone(),
			trigger_source_id: routine.trigger_source_id.clone(),
			filter: filter.clone(),
			trigger_config: json!({}),
		};
		let edit = RoutineEdit {
			title: routine.title.clone(),
			instruction: routine.instruction.clone(),
			filter,
			trigger_config: json!({}),
			is_enabled: true,
		};
		let requested = RunRequested {
			cause: RunCause::Trigger,
			title: routine.title.clone(),
			instruction: routine.instruction.clone(),
			routine_id: routine.id.clone(),
			run_id: "run-1".to_owned(),
			bot_id: routine.bot_id.clone(),
			conversation_id: routine.conversation_id.clone(),
			trigger_source_id: routine.trigger_source_id.clone(),
			payload: json!({}),
		};

		assert_eq!(serialised_fields(&routine), mirrored_fields("Routine"));
		assert_eq!(serialised_fields(&draft), mirrored_fields("RoutineDraft"));
		assert_eq!(serialised_fields(&edit), mirrored_fields("RoutineEdit"));
		assert_eq!(serialised_fields(&requested), mirrored_fields("RunRequested"));
	}

	#[test]
	fn a_closing_and_a_reported_run_name_the_fields_the_front_declares() {
		let closing = RunClosing {
			outcome: RunOutcome::Ok,
			reason: Some("done".to_owned()),
			cost_usd: Some(0.42),
			model_usage: Some(json!({ "sonnet": { "inputTokens": 120 } })),
			reported_turn_id: Some("t1".to_owned()),
		};
		let reported = ReportedRun {
			turn_id: "t1".to_owned(),
			routine_title: "Nightly report".to_owned(),
			trigger_source_id: "schedule".to_owned(),
		};

		assert_eq!(serialised_fields(&closing), mirrored_fields("RunClosing"));
		assert_eq!(serialised_fields(&reported), mirrored_fields("ReportedRun"));
	}

	#[test]
	fn every_refusal_of_a_reported_turn_carries_the_kind_the_front_declares() {
		let refusals = [
			RoutineError::UnknownTurn { id: "t1".to_owned() },
			RoutineError::TurnOfAnotherConversation {
				turn_id: "t1".to_owned(),
				conversation_id: "c2".to_owned(),
			},
			RoutineError::TurnAlreadyReported {
				turn_id: "t1".to_owned(),
				run_id: "run-1".to_owned(),
			},
			RoutineError::TurnWithoutReport {
				turn_id: "t1".to_owned(),
				outcome: RunOutcome::Nothing,
			},
		];

		assert_eq!(tagged(&refusals), mirrored("ReportRefusal"));
	}

	#[test]
	fn the_key_answer_names_the_fields_the_front_declares() {
		let answer = RoutineKey {
			key: "the-key".to_owned(),
			header: Some("X-OpenNest-Delivery".to_owned()),
			url: Some("http://127.0.0.1:45367/routines/call".to_owned()),
		};

		assert_eq!(serialised_fields(&answer), mirrored_fields("RoutineKey"));
	}

	#[test]
	fn every_run_outcome_serialises_as_the_front_declares_it() {
		assert_eq!(named(&RunOutcome::ALL), mirrored("RunOutcome"));
	}

	#[test]
	fn every_run_cause_serialises_as_the_front_declares_it() {
		assert_eq!(named(&RunCause::ALL), mirrored("RunCause"));
	}

	#[test]
	fn every_skip_reason_serialises_as_the_front_declares_it() {
		assert_eq!(named(&SkipReason::ALL), mirrored("SkipReason"));
	}

	#[test]
	fn every_refusal_serialises_as_the_front_declares_it() {
		assert_eq!(named(&Refusal::ALL), mirrored("Refusal"));
	}

	#[test]
	fn every_trigger_decision_carries_the_tag_the_front_declares() {
		let decisions = [
			TriggerDecision::Started { run_id: "run-1".to_owned() },
			TriggerDecision::Skipped { run_id: "run-1".to_owned(), reason: SkipReason::HourlyCap },
			TriggerDecision::Refused { by: Refusal::Disabled },
		];

		assert_eq!(tagged(&decisions), mirrored("TriggerDecision"));
	}

	#[test]
	fn a_run_outcome_reads_back_from_the_text_it_serialises_as() {
		for outcome in RunOutcome::ALL {
			let held = name(&outcome);
			assert_eq!(
				serde_json::from_value::<RunOutcome>(serde_json::Value::String(held.clone()))
					.expect("the outcome reads back"),
				outcome,
				"{held} did not read back as the outcome it was written from"
			);
		}
	}

	#[test]
	fn a_filter_is_a_match_mode_and_a_flat_list_of_rows() {
		let filter = Filter {
			match_mode: FilterMatchMode::Any,
			rows: vec![
				FilterRow {
					field: "issue.labels.name".to_owned(),
					operator: FilterOperator::Equals,
					value: Some(json!("bug")),
				},
				FilterRow {
					field: "issue.closedAt".to_owned(),
					operator: FilterOperator::Exists,
					value: None,
				},
			],
		};

		assert_eq!(
			to_value(&filter).expect("the filter serialises"),
			json!({
				"matchMode": "any",
				"rows": [
					{ "field": "issue.labels.name", "operator": "equals", "value": "bug" },
					{ "field": "issue.closedAt", "operator": "exists" },
				],
			})
		);
	}
}
