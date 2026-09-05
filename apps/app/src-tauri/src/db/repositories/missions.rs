use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Connection, OptionalExtension, Row, Transaction, TransactionBehavior};
use serde_json::Value;
use uuid::Uuid;

use super::conversations::open_thread_under;
use crate::db::{Access, DatabaseError};
use crate::missions::contract::{
	ConversationMissions, Mission, MissionClosing, MissionDetail, MissionDraft, MissionEntry,
	MissionError, MissionEvent, MissionEventKind, MissionInThread, MissionState, MissionWatch,
	Ticket, WatchedMission,
};

const MAX_MISSIONS_PER_READ: u32 = 200;
const MAX_EVENTS_PER_MISSION: u32 = 500;

impl ToSql for MissionEventKind {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(named(*self)?))
	}
}

impl FromSql for MissionEventKind {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		serde_json::from_value(Value::String(value.as_str()?.to_owned()))
			.map_err(|error| FromSqlError::Other(Box::new(error)))
	}
}

fn named(kind: MissionEventKind) -> rusqlite::Result<String> {
	match serde_json::to_value(kind) {
		Ok(Value::String(text)) => Ok(text),
		held => Err(rusqlite::Error::ToSqlConversionFailure(
			format!("a mission event kind did not serialise as a name: {held:?}").into(),
		)),
	}
}

const MISSION_COLUMNS: &str = "SELECT id, origin_conversation_id, bot_id, thread_conversation_id,
	objective, ticket_platform, ticket_external_id, ticket_url, ticket_title, tools,
	opened_at, closed_at,
	COALESCE((SELECT kind FROM mission_events
		WHERE mission_events.mission_id = missions.id AND mission_events.kind <> 'note'
		ORDER BY mission_events.seq DESC LIMIT 1), 'opened') AS state_kind
	FROM missions";

const INSERT_MISSION: &str = "INSERT INTO missions
	(id, origin_conversation_id, bot_id, thread_conversation_id, objective, ticket_platform,
		ticket_external_id, ticket_url, ticket_title, tools, opened_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)";

const INSERT_EVENT: &str = "INSERT INTO mission_events
	(id, mission_id, seq, kind, source, payload, created_at, delivery_id)
	SELECT ?1, ?2, COALESCE(max(seq), 0) + 1, ?3, ?4, ?5, ?6, ?7
	FROM mission_events WHERE mission_id = ?2";

const COUNT_DELIVERY: &str = "SELECT count(*) FROM mission_events
	WHERE mission_id = ?1 AND delivery_id = ?2";

const WATCH_COLUMNS: &str = "SELECT id, watch_branch, watch_repository, github_fingerprint
	FROM missions";

const ARM_MISSION: &str = "UPDATE missions SET watch_branch = ?2, watch_repository = ?3,
	watch_workspace_path = ?4, delivery_key = ?5 WHERE id = ?1";

const KEEP_FINGERPRINT: &str = "UPDATE missions SET github_fingerprint = ?2 WHERE id = ?1";

const SELECT_KEY: &str = "SELECT delivery_key FROM missions WHERE id = ?1";

const CLOSE_MISSION: &str = "UPDATE missions SET closed_at = ?2 WHERE id = ?1";

const SELECT_EVENTS: &str = "SELECT id, mission_id, kind, source, payload, created_at
	FROM mission_events WHERE mission_id = ?1 ORDER BY seq DESC LIMIT ?2";

const COUNT_EVENTS: &str = "SELECT count(*) FROM mission_events WHERE mission_id = ?1";

pub struct MissionsRepository {
	access: Access,
}

impl MissionsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn open(&self, draft: MissionDraft) -> Result<Mission, MissionError> {
		self.access.call_mut(move |connection| Ok(opened(connection, &draft))).await?
	}

	pub async fn append(
		&self,
		mission_id: String,
		entry: MissionEntry,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| Ok(appended(connection, &mission_id, &entry, "")))
			.await?
	}

	pub async fn close(
		&self,
		mission_id: String,
		closing: MissionClosing,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| Ok(closed(connection, &mission_id, &closing)))
			.await?
	}

	pub async fn arm(
		&self,
		mission_id: String,
		watch: MissionWatch,
		minted_key: String,
	) -> Result<(Mission, String), MissionError> {
		self.access
			.call_mut(move |connection| Ok(armed(connection, &mission_id, &watch, &minted_key)))
			.await?
	}

	pub async fn armed_on_key(&self, key: String) -> Result<Option<Mission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE delivery_key = ?1
						AND delivery_key <> ''"
				))?;
				Ok(statement.query_row([key], mission).optional()?)
			})
			.await?)
	}

	pub async fn append_delivery(
		&self,
		mission_id: String,
		entry: MissionEntry,
		delivery_id: String,
	) -> Result<Mission, MissionError> {
		self.access
			.call_mut(move |connection| Ok(appended(connection, &mission_id, &entry, &delivery_id)))
			.await?
	}

	pub async fn watched(&self) -> Result<Vec<WatchedMission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{WATCH_COLUMNS} WHERE closed_at IS NULL AND watch_repository <> ''
						AND watch_branch <> '' ORDER BY opened_at, id LIMIT ?1"
				))?;
				let rows = statement.query_map([MAX_MISSIONS_PER_READ], watched)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await?)
	}

	pub async fn record_github(
		&self,
		mission_id: String,
		entries: Vec<MissionEntry>,
		fingerprint: String,
	) -> Result<Option<Mission>, MissionError> {
		self.access
			.call_mut(move |connection| {
				Ok(recorded(connection, &mission_id, &entries, &fingerprint))
			})
			.await?
	}

	pub async fn of_conversation(
		&self,
		conversation_id: String,
	) -> Result<ConversationMissions, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE origin_conversation_id = ?1
					ORDER BY opened_at DESC, id DESC LIMIT ?2"
				))?;
				let rows = statement
					.query_map(params![conversation_id, MAX_MISSIONS_PER_READ], mission)?;
				Ok(parted(oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?)))
			})
			.await?)
	}

	pub async fn still_open_for_bot(
		&self,
		conversation_id: String,
		bot_id: String,
	) -> Result<Vec<Mission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE closed_at IS NULL AND bot_id = ?2
					AND (origin_conversation_id = ?1 OR thread_conversation_id = ?1)
					ORDER BY opened_at DESC, id DESC LIMIT ?3"
				))?;
				let rows = statement
					.query_map(params![conversation_id, bot_id, MAX_MISSIONS_PER_READ], mission)?;
				Ok(oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?))
			})
			.await?)
	}

	pub async fn in_thread(
		&self,
		conversation_id: String,
		events: u32,
	) -> Result<Option<MissionInThread>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE thread_conversation_id = ?1"
				))?;
				let Some(threaded) = statement.query_row([conversation_id], mission).optional()?
				else {
					return Ok(None);
				};
				let mut statement = connection.prepare_cached(SELECT_EVENTS)?;
				let rows = statement.query_map(params![threaded.id, events], event)?;
				let latest = oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?);
				let held: i64 =
					connection.query_row(COUNT_EVENTS, [&threaded.id], |row| row.get(0))?;
				Ok(Some(MissionInThread {
					earlier_events: held - latest.len() as i64,
					mission: threaded,
					events: latest,
				}))
			})
			.await?)
	}

	pub async fn still_open(&self) -> Result<Vec<Mission>, MissionError> {
		Ok(self
			.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{MISSION_COLUMNS} WHERE closed_at IS NULL
					ORDER BY opened_at DESC, id DESC LIMIT ?1"
				))?;
				let rows = statement.query_map([MAX_MISSIONS_PER_READ], mission)?;
				Ok(oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?))
			})
			.await?)
	}

	pub async fn held(&self, id: String) -> Result<Option<Mission>, MissionError> {
		Ok(self.access.call(move |connection| held(connection, &id)).await?)
	}

	pub async fn detail(&self, id: String) -> Result<MissionDetail, MissionError> {
		self.access
			.call(move |connection| {
				let Some(held) = held(connection, &id)? else {
					return Ok(Err(MissionError::UnknownMission { id }));
				};
				let mut statement = connection.prepare_cached(SELECT_EVENTS)?;
				let rows = statement.query_map(params![held.id, MAX_EVENTS_PER_MISSION], event)?;
				let events = oldest_first(rows.collect::<rusqlite::Result<Vec<_>>>()?);
				Ok(Ok(MissionDetail { mission: held, events }))
			})
			.await?
	}
}

fn opened(connection: &mut Connection, draft: &MissionDraft) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	let thread = open_thread_under(
		&transaction,
		&draft.origin_conversation_id,
		&draft.bot_id,
		&draft.objective,
	)?;
	let id = Uuid::new_v4().to_string();
	let at = now();
	transaction
		.execute(
			INSERT_MISSION,
			params![
				id,
				draft.origin_conversation_id,
				draft.bot_id,
				thread,
				draft.objective,
				draft.ticket.platform,
				draft.ticket.external_id,
				draft.ticket.url,
				draft.ticket.title,
				as_text(&draft.tools)?,
				at,
			],
		)
		.map_err(|error| {
			unknown_participant(error, &draft.origin_conversation_id, &draft.bot_id)
		})?;
	let entry = MissionEntry {
		kind: MissionEventKind::Opened,
		source: draft.source.clone(),
		payload: serde_json::json!({}),
	};
	record(&transaction, &id, &entry, "", at)?;
	let stored = read(&transaction, &id)?;
	transaction.commit()?;
	Ok(stored)
}

fn appended(
	connection: &mut Connection,
	mission_id: &str,
	entry: &MissionEntry,
	delivery_id: &str,
) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	refuse_a_shut_mission(&transaction, mission_id)?;
	if !already_delivered(&transaction, mission_id, delivery_id)? {
		let at = now();
		record(&transaction, mission_id, entry, delivery_id, at)?;
		if entry.kind.closes() {
			transaction.execute(CLOSE_MISSION, params![mission_id, at])?;
		}
	}
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn refuse_a_shut_mission(
	transaction: &Transaction<'_>,
	mission_id: &str,
) -> Result<(), MissionError> {
	let Some(standing) = held(transaction, mission_id)? else {
		return Err(MissionError::UnknownMission { id: mission_id.to_owned() });
	};
	match standing.closed_at {
		Some(_) => Err(MissionError::MissionAlreadyClosed { id: mission_id.to_owned() }),
		None => Ok(()),
	}
}

fn closed(
	connection: &mut Connection,
	mission_id: &str,
	closing: &MissionClosing,
) -> Result<Mission, MissionError> {
	let transaction = write_transaction(connection)?;
	refuse_a_shut_mission(&transaction, mission_id)?;
	let at = now();
	record(&transaction, mission_id, &closing.entry(), "", at)?;
	transaction.execute(CLOSE_MISSION, params![mission_id, at])?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(stored)
}

fn armed(
	connection: &mut Connection,
	mission_id: &str,
	watch: &MissionWatch,
	minted_key: &str,
) -> Result<(Mission, String), MissionError> {
	let transaction = write_transaction(connection)?;
	refuse_a_shut_mission(&transaction, mission_id)?;
	let held_key: String = transaction.query_row(SELECT_KEY, [mission_id], |row| row.get(0))?;
	let key = match held_key.is_empty() {
		true => minted_key.to_owned(),
		false => held_key,
	};
	transaction.execute(
		ARM_MISSION,
		params![mission_id, watch.branch, watch.repository, watch.workspace_path, key],
	)?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok((stored, key))
}

fn recorded(
	connection: &mut Connection,
	mission_id: &str,
	entries: &[MissionEntry],
	fingerprint: &str,
) -> Result<Option<Mission>, MissionError> {
	let transaction = write_transaction(connection)?;
	let Some(standing) = held(&transaction, mission_id)? else {
		return Ok(None);
	};
	if standing.closed_at.is_some() {
		return Ok(None);
	}
	let at = now();
	let mut closed = false;
	for entry in entries {
		if closed {
			break;
		}
		record(&transaction, mission_id, entry, "", at)?;
		closed = entry.kind.closes();
	}
	if closed {
		transaction.execute(CLOSE_MISSION, params![mission_id, at])?;
	}
	transaction.execute(KEEP_FINGERPRINT, params![mission_id, fingerprint])?;
	let stored = read(&transaction, mission_id)?;
	transaction.commit()?;
	Ok(Some(stored))
}

fn already_delivered(
	transaction: &Transaction<'_>,
	mission_id: &str,
	delivery_id: &str,
) -> Result<bool, MissionError> {
	if delivery_id.is_empty() {
		return Ok(false);
	}
	let carried: i64 =
		transaction
			.query_row(COUNT_DELIVERY, params![mission_id, delivery_id], |row| row.get(0))?;
	Ok(carried > 0)
}

fn record(
	transaction: &Transaction<'_>,
	mission_id: &str,
	entry: &MissionEntry,
	delivery_id: &str,
	at: i64,
) -> Result<(), MissionError> {
	transaction.execute(
		INSERT_EVENT,
		params![
			Uuid::new_v4().to_string(),
			mission_id,
			entry.kind,
			entry.source,
			as_text(&entry.payload)?,
			at,
			delivery_id,
		],
	)?;
	Ok(())
}

fn held(connection: &Connection, id: &str) -> Result<Option<Mission>, DatabaseError> {
	let mut statement = connection.prepare_cached(&format!("{MISSION_COLUMNS} WHERE id = ?1"))?;
	Ok(statement.query_row([id], mission).optional()?)
}

fn read(transaction: &Transaction<'_>, id: &str) -> Result<Mission, MissionError> {
	held(transaction, id)?.ok_or_else(|| MissionError::UnknownMission { id: id.to_owned() })
}

fn oldest_first<T>(mut newest_first: Vec<T>) -> Vec<T> {
	newest_first.reverse();
	newest_first
}

fn parted(missions: Vec<Mission>) -> ConversationMissions {
	let (done, open) =
		missions.into_iter().partition::<Vec<_>, _>(|mission| mission.closed_at.is_some());
	ConversationMissions { open, done }
}

fn unknown_participant(
	error: rusqlite::Error,
	conversation_id: &str,
	bot_id: &str,
) -> MissionError {
	match error.sqlite_error_code() {
		Some(rusqlite::ErrorCode::ConstraintViolation) => MissionError::UnknownParticipant {
			conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
		},
		_ => MissionError::from(DatabaseError::Sqlite(error)),
	}
}

fn mission(row: &Row<'_>) -> rusqlite::Result<Mission> {
	Ok(Mission {
		id: row.get(0)?,
		origin_conversation_id: row.get(1)?,
		bot_id: row.get(2)?,
		thread_conversation_id: row.get(3)?,
		objective: row.get(4)?,
		ticket: Ticket {
			platform: row.get(5)?,
			external_id: row.get(6)?,
			url: row.get(7)?,
			title: row.get(8)?,
		},
		tools: from_text(row, 9)?,
		opened_at: row.get(10)?,
		closed_at: row.get(11)?,
		state: derived(row.get(12)?)?,
	})
}

fn watched(row: &Row<'_>) -> rusqlite::Result<WatchedMission> {
	Ok(WatchedMission {
		id: row.get(0)?,
		branch: row.get(1)?,
		repository: row.get(2)?,
		fingerprint: row.get(3)?,
	})
}

fn event(row: &Row<'_>) -> rusqlite::Result<MissionEvent> {
	Ok(MissionEvent {
		id: row.get(0)?,
		mission_id: row.get(1)?,
		kind: row.get(2)?,
		source: row.get(3)?,
		payload: from_text(row, 4)?,
		created_at: row.get(5)?,
	})
}

fn derived(kind: MissionEventKind) -> rusqlite::Result<MissionState> {
	kind.state().ok_or_else(|| {
		rusqlite::Error::FromSqlConversionFailure(
			12,
			rusqlite::types::Type::Text,
			format!("{kind:?} carries no mission state").into(),
		)
	})
}

fn from_text<T: serde::de::DeserializeOwned>(row: &Row<'_>, index: usize) -> rusqlite::Result<T> {
	serde_json::from_str(&row.get::<_, String>(index)?).map_err(|error| {
		rusqlite::Error::FromSqlConversionFailure(
			index,
			rusqlite::types::Type::Text,
			Box::new(error),
		)
	})
}

fn as_text<T: serde::Serialize>(value: &T) -> Result<String, MissionError> {
	serde_json::to_string(value)
		.map_err(|error| MissionError::Unexpected { detail: error.to_string() })
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;

	use serde_json::json;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, open, Database};
	use crate::missions::contract::MissionNote;

	const TWO_SPACES: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 'blue', 1, 1);
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1),
				('b2', 'work', 'Second', 'sonnet', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'personal', 'First', 1, 1),
				('c2', 'topic', 'work', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0), ('c2', 'b2', 'lead', 1, 0);
	";

	async fn planted() -> (Database, PathBuf) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(TWO_SPACES)?))
			.await
			.expect("the spaces are planted");
		(database, dir)
	}

	fn a_draft(conversation_id: &str, bot_id: &str, objective: &str) -> MissionDraft {
		MissionDraft {
			origin_conversation_id: conversation_id.to_owned(),
			bot_id: bot_id.to_owned(),
			objective: objective.to_owned(),
			ticket: Ticket {
				platform: "github".to_owned(),
				external_id: "42".to_owned(),
				url: "https://opennest.test/tickets/42".to_owned(),
				title: "Crash on open".to_owned(),
			},
			tools: vec!["gh".to_owned()],
			source: "bot".to_owned(),
		}
	}

	fn an_entry(kind: MissionEventKind) -> MissionEntry {
		MissionEntry::of(kind, MissionNote { source: "bot".to_owned(), payload: json!({}) })
	}

	async fn thread_of(database: &Database, id: String) -> (String, Option<String>, String, i64) {
		database
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT conversations.kind, conversations.space_id, conversations.title,
						(SELECT count(*) FROM conversation_participants
							WHERE conversation_id = conversations.id AND bot_id = 'b1')
						FROM conversations WHERE id = ?1",
					[&id],
					|row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
				)?)
			})
			.await
			.expect("the thread reads")
	}

	#[tokio::test]
	async fn opening_hangs_a_thread_under_the_conversation_the_work_came_in() {
		let (database, dir) = planted().await;

		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");

		assert_eq!(opened.state, MissionState::Working);
		assert_eq!(opened.tools, vec!["gh".to_owned()]);
		assert_eq!(opened.closed_at, None);
		assert_eq!(
			thread_of(&database, opened.thread_conversation_id.clone()).await,
			("mission".to_owned(), Some("personal".to_owned()), "Fix the crash".to_owned(), 1,),
			"the thread did not land in the space of the conversation with its bot seated"
		);
		let detail = database.missions().detail(opened.id).await.expect("the mission reads");
		assert_eq!(
			detail.events.iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Opened],
			"opening wrote something other than one opened event"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn every_kind_that_carries_a_state_moves_the_mission_to_it() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");

		let mut walked = Vec::new();
		for kind in MissionEventKind::ALL {
			let written = database
				.missions()
				.append(opened.id.clone(), an_entry(kind))
				.await
				.expect("the event is appended");
			walked.push((kind, written.state));
		}

		assert_eq!(
			walked,
			vec![
				(MissionEventKind::Opened, MissionState::Working),
				(MissionEventKind::Note, MissionState::Working),
				(MissionEventKind::AgentAsked, MissionState::WaitingBot),
				(MissionEventKind::Answered, MissionState::Working),
				(MissionEventKind::Escalated, MissionState::WaitingHuman),
				(MissionEventKind::Ready, MissionState::ReadyToMerge),
				(MissionEventKind::Failed, MissionState::Failed),
				(MissionEventKind::Closed, MissionState::Done),
			],
			"a kind moved the mission somewhere the contract does not name"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_failed_mission_stays_open_until_its_bot_closes_it() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");

		let failed = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Failed))
			.await
			.expect("the failure is recorded");
		let while_failed =
			database.missions().of_conversation("c1".to_owned()).await.expect("the missions read");
		database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission is closed");
		let once_closed =
			database.missions().of_conversation("c1".to_owned()).await.expect("the missions read");

		assert_eq!(failed.state, MissionState::Failed);
		assert_eq!(failed.closed_at, None, "a failure closed the mission");
		assert_eq!(
			while_failed.open.iter().map(|held| held.id.clone()).collect::<Vec<_>>(),
			vec![opened.id.clone()],
			"a failed mission left the open list before it was closed"
		);
		assert!(while_failed.done.is_empty(), "got {:?}", while_failed.done);
		assert!(once_closed.open.is_empty(), "got {:?}", once_closed.open);
		assert_eq!(
			once_closed.done.iter().map(|held| held.state).collect::<Vec<_>>(),
			vec![MissionState::Done]
		);
		assert!(once_closed.done[0].closed_at.is_some(), "a closed mission carries no closing");

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_missions_of_a_conversation_come_back_open_apart_from_done() {
		let (database, dir) = planted().await;
		let still_open = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");
		let done = database
			.missions()
			.open(a_draft("c1", "b1", "Ship the fix"))
			.await
			.expect("the mission opens");
		database
			.missions()
			.append(done.id.clone(), an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission is closed");
		database
			.missions()
			.open(a_draft("c2", "b2", "Another room"))
			.await
			.expect("the mission opens");

		let held =
			database.missions().of_conversation("c1".to_owned()).await.expect("the missions read");

		assert_eq!(
			held.open.iter().map(|mission| mission.id.clone()).collect::<Vec<_>>(),
			vec![still_open.id],
			"the open list carried a mission of another conversation or a done one"
		);
		assert_eq!(
			held.done.iter().map(|mission| mission.id.clone()).collect::<Vec<_>>(),
			vec![done.id]
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn every_open_mission_of_every_space_comes_back_with_its_bot_and_its_state() {
		let (database, dir) = planted().await;
		let here = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");
		let there = database
			.missions()
			.open(a_draft("c2", "b2", "Another room"))
			.await
			.expect("the mission opens");
		let closed = database
			.missions()
			.open(a_draft("c2", "b2", "Already done"))
			.await
			.expect("the mission opens");
		database
			.missions()
			.append(here.id.clone(), an_entry(MissionEventKind::Escalated))
			.await
			.expect("the escalation is recorded");
		database
			.missions()
			.append(closed.id, an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission is closed");

		let board = database.missions().still_open().await.expect("the board reads");

		assert_eq!(
			board
				.iter()
				.map(|mission| (mission.id.clone(), mission.bot_id.clone(), mission.state))
				.collect::<Vec<_>>(),
			vec![
				(here.id, "b1".to_owned(), MissionState::WaitingHuman),
				(there.id, "b2".to_owned(), MissionState::Working),
			],
			"the board dropped an open mission or misread its state"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	const MISSIONS_PAST_THE_CAP: &str = "
		WITH RECURSIVE counter(value) AS
			(SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 205)
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			SELECT 'thread-' || value, 'mission', 'personal', 'Objective ' || value, value, value
			FROM counter;

		WITH RECURSIVE counter(value) AS
			(SELECT 1 UNION ALL SELECT value + 1 FROM counter WHERE value < 205)
		INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
			objective, ticket_platform, ticket_external_id, ticket_url, ticket_title,
			tools, opened_at)
			SELECT 'm-' || value, 'c1', 'b1', 'thread-' || value, 'Objective ' || value,
				'github', value, 'https://opennest.test/tickets/' || value, 'Ticket', '[]', value
			FROM counter;
	";

	fn events_past_the_cap(mission_id: &str) -> String {
		format!(
			"WITH RECURSIVE counter(value) AS
				(SELECT 2 UNION ALL SELECT value + 1 FROM counter WHERE value < 506)
			INSERT INTO mission_events (id, mission_id, seq, kind, source, payload, created_at)
				SELECT 'e-' || value, '{mission_id}', value, 'note', 'bot',
					'{{\"seq\":' || value || '}}', value
				FROM counter;"
		)
	}

	#[tokio::test]
	async fn a_conversation_past_the_cap_answers_the_missions_opened_last() {
		let (database, dir) = planted().await;
		database
			.call_mut(|connection| Ok(connection.execute_batch(MISSIONS_PAST_THE_CAP)?))
			.await
			.expect("the missions are planted");

		let held =
			database.missions().of_conversation("c1".to_owned()).await.expect("the missions read");

		assert_eq!(held.open.len(), MAX_MISSIONS_PER_READ as usize, "the read went past its cap");
		assert_eq!(
			held.open.first().map(|mission| mission.objective.clone()),
			Some("Objective 6".to_owned()),
			"the capped read did not drop the oldest missions"
		);
		assert_eq!(
			held.open.last().map(|mission| mission.objective.clone()),
			Some("Objective 205".to_owned()),
			"the newest mission fell out of the read"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_past_the_cap_answers_the_events_written_last() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");
		let planting = events_past_the_cap(&opened.id);
		database
			.call_mut(move |connection| Ok(connection.execute_batch(&planting)?))
			.await
			.expect("the events are planted");

		let detail = database.missions().detail(opened.id).await.expect("the mission reads");

		assert_eq!(
			detail.events.len(),
			MAX_EVENTS_PER_MISSION as usize,
			"the read went past its cap"
		);
		assert_eq!(
			detail.events.first().map(|event| event.payload.clone()),
			Some(json!({ "seq": 7 })),
			"the capped read did not drop the oldest events"
		);
		assert_eq!(
			detail.events.last().map(|event| event.payload.clone()),
			Some(json!({ "seq": 506 })),
			"the newest event fell out of the read"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn a_watch(branch: &str) -> MissionWatch {
		MissionWatch {
			branch: branch.to_owned(),
			repository: "shoto290/OpenNest".to_owned(),
			workspace_path: Some("/tmp/workspace".to_owned()),
		}
	}

	#[tokio::test]
	async fn arming_a_mission_twice_keeps_the_key_minted_the_first_time_and_carries_the_new_watch()
	{
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");

		let (_, first) = database
			.missions()
			.arm(opened.id.clone(), a_watch("feature/one"), "minted-first".to_owned())
			.await
			.expect("the mission is armed");
		let (armed, second) = database
			.missions()
			.arm(opened.id.clone(), a_watch("feature/two"), "minted-second".to_owned())
			.await
			.expect("the mission is armed again");

		assert_eq!((first.as_str(), second.as_str()), ("minted-first", "minted-first"));
		assert_eq!(armed.id, opened.id);
		assert_eq!(
			database
				.missions()
				.watched()
				.await
				.expect("the watched missions read")
				.into_iter()
				.map(|held| (held.id, held.branch, held.repository, held.fingerprint))
				.collect::<Vec<_>>(),
			vec![(
				opened.id.clone(),
				"feature/two".to_owned(),
				"shoto290/OpenNest".to_owned(),
				String::new(),
			)],
			"the second arming did not carry the branch it named"
		);
		assert_eq!(
			database
				.missions()
				.armed_on_key("minted-first".to_owned())
				.await
				.expect("the mission reads")
				.map(|held| held.id),
			Some(opened.id),
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_mission_nobody_armed_is_neither_watched_nor_reachable_on_a_blank_key() {
		let (database, dir) = planted().await;
		database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");

		assert!(database.missions().watched().await.expect("the watched missions read").is_empty());
		assert_eq!(
			database.missions().armed_on_key(String::new()).await.expect("the mission reads"),
			None,
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_delivery_id_already_appended_leaves_the_mission_with_one_event() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");

		for _ in 0..2 {
			database
				.missions()
				.append_delivery(
					opened.id.clone(),
					an_entry(MissionEventKind::AgentAsked),
					"delivery-1".to_owned(),
				)
				.await
				.expect("the delivery is appended");
		}

		assert_eq!(
			database
				.missions()
				.detail(opened.id.clone())
				.await
				.expect("the mission reads")
				.events
				.iter()
				.filter(|event| event.kind == MissionEventKind::AgentAsked)
				.count(),
			1,
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_event_appended_to_a_closed_mission_is_refused_and_written_nowhere() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");
		let closed = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Closed))
			.await
			.expect("the mission is closed");

		let refused = database
			.missions()
			.append(opened.id.clone(), an_entry(MissionEventKind::Failed))
			.await
			.expect_err("the event is refused");

		assert_eq!(refused, MissionError::MissionAlreadyClosed { id: opened.id.clone() });
		assert_eq!(count_of(&database, "mission_events").await, 2, "an event was written anyway");
		let detail = database.missions().detail(opened.id).await.expect("the mission reads");
		assert_eq!(detail.mission.state, MissionState::Done, "the refused event moved the state");
		assert_eq!(detail.mission.closed_at, closed.closed_at);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn an_event_for_a_mission_no_row_holds_is_refused_and_written_nowhere() {
		let (database, dir) = planted().await;

		let refused = database
			.missions()
			.append("x9".to_owned(), an_entry(MissionEventKind::Note))
			.await
			.expect_err("the event is refused");
		let read = database.missions().detail("x9".to_owned()).await.expect_err("the read refuses");

		assert_eq!(refused, MissionError::UnknownMission { id: "x9".to_owned() });
		assert_eq!(read, MissionError::UnknownMission { id: "x9".to_owned() });
		assert_eq!(count_of(&database, "mission_events").await, 0, "an event was written anyway");

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_thread_answers_with_its_mission_the_events_it_is_bounded_to_and_what_it_left_out() {
		let (database, dir) = planted().await;
		let opened = database
			.missions()
			.open(a_draft("c1", "b1", "Fix the crash"))
			.await
			.expect("the mission opens");
		for _ in 0..3 {
			database
				.missions()
				.append(opened.id.clone(), an_entry(MissionEventKind::Note))
				.await
				.expect("the event is appended");
		}

		let in_thread = database
			.missions()
			.in_thread(opened.thread_conversation_id.clone(), 2)
			.await
			.expect("the thread reads")
			.expect("a mission behind the thread");

		assert_eq!(in_thread.mission.id, opened.id);
		assert_eq!(
			in_thread.events.iter().map(|event| event.kind).collect::<Vec<_>>(),
			vec![MissionEventKind::Note, MissionEventKind::Note],
			"the thread carried something other than its most recent events"
		);
		assert_eq!(in_thread.earlier_events, 2, "the events left out went miscounted");
		assert_eq!(
			database.missions().in_thread("c1".to_owned(), 2).await.expect("the read answers"),
			None,
			"a conversation holding a mission answered as its thread"
		);

		drop(database);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}
}
