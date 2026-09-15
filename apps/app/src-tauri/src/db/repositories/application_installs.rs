use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use rusqlite::{params, Row};
use serde_json::Value;
use uuid::Uuid;

use crate::applications::contract::{ApplicationInstall, Destination, InstallCase, InstallDraft};
use crate::db::{Access, DatabaseError};

pub const MAX_INSTALLS_PER_READ: u32 = 200;

const INSTALL_COLUMNS: &str = "SELECT id, conversation_id, application, title, logo, scope,
	destination_id, install_kind, secret_name, last_message_seq, created_at
	FROM application_installs";

const INSERT_INSTALL: &str = "INSERT INTO application_installs
	(id, conversation_id, application, title, logo, scope, destination_id, install_kind,
		secret_name, last_message_seq, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
		(SELECT COALESCE(MAX(seq), 0) FROM messages WHERE conversation_id = ?2), ?10)
	RETURNING id, conversation_id, application, title, logo, scope, destination_id,
		install_kind, secret_name, last_message_seq, created_at";

const NOTHING: &str = "nothing";
const KEY: &str = "key";
const OAUTH: &str = "oauth";

impl ToSql for Destination {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(named(*self)?))
	}
}

impl FromSql for Destination {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		serde_json::from_value(Value::String(value.as_str()?.to_owned()))
			.map_err(|error| FromSqlError::Other(Box::new(error)))
	}
}

fn named(destination: Destination) -> rusqlite::Result<String> {
	match serde_json::to_value(destination) {
		Ok(Value::String(text)) => Ok(text),
		held => Err(rusqlite::Error::ToSqlConversionFailure(
			format!("a destination did not serialise as a name: {held:?}").into(),
		)),
	}
}

pub struct ApplicationInstallsRepository {
	access: Access,
}

impl ApplicationInstallsRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn record(&self, draft: InstallDraft) -> Result<ApplicationInstall, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection.query_row(
					INSERT_INSTALL,
					params![
						Uuid::new_v4().to_string(),
						draft.conversation_id,
						draft.application,
						draft.title,
						draft.logo,
						draft.scope,
						draft.destination_id,
						kind_of(&draft.install),
						secret_of(&draft.install),
						now(),
					],
					install,
				)?)
			})
			.await
	}

	pub async fn of_conversation(
		&self,
		conversation_id: String,
	) -> Result<Vec<ApplicationInstall>, DatabaseError> {
		self.access
			.call(move |connection| {
				let mut statement = connection.prepare_cached(&format!(
					"{INSTALL_COLUMNS} WHERE conversation_id = ?1
					ORDER BY created_at ASC, id ASC LIMIT ?2"
				))?;
				let rows = statement
					.query_map(params![conversation_id, MAX_INSTALLS_PER_READ], install)?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
	}
}

fn kind_of(install: &InstallCase) -> &'static str {
	match install {
		InstallCase::Nothing => NOTHING,
		InstallCase::Key { .. } => KEY,
		InstallCase::Oauth => OAUTH,
	}
}

fn secret_of(install: &InstallCase) -> Option<&str> {
	match install {
		InstallCase::Key { secret } => Some(secret),
		InstallCase::Nothing | InstallCase::Oauth => None,
	}
}

fn case(kind: &str, secret_name: Option<String>) -> rusqlite::Result<InstallCase> {
	match (kind, secret_name) {
		(NOTHING, _) => Ok(InstallCase::Nothing),
		(OAUTH, _) => Ok(InstallCase::Oauth),
		(KEY, Some(secret)) => Ok(InstallCase::Key { secret }),
		(held, _) => Err(rusqlite::Error::FromSqlConversionFailure(
			0,
			rusqlite::types::Type::Text,
			format!("an install case stored as {held} names no secret").into(),
		)),
	}
}

fn install(row: &Row<'_>) -> rusqlite::Result<ApplicationInstall> {
	Ok(ApplicationInstall {
		id: row.get("id")?,
		conversation_id: row.get("conversation_id")?,
		application: row.get("application")?,
		title: row.get("title")?,
		logo: row.get("logo")?,
		scope: row.get("scope")?,
		destination_id: row.get("destination_id")?,
		install: case(&row.get::<_, String>("install_kind")?, row.get("secret_name")?)?,
		last_message_seq: row.get("last_message_seq")?,
		created_at: row.get("created_at")?,
	})
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as i64
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, open};

	const A_CONVERSATION: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'Shoto', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'Chat', 1, 1), ('c2', 'main', 'Other', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c2', 'b1', 'assistant', 1, 0);
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 1);
		INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m1', 'c1', 't1', 1, 'user', 'add superset', 'complete', 1),
				('m2', 'c1', 't1', 2, 'assistant', 'where', 'complete', 2);
	";

	fn a_draft(application: &str, install: InstallCase) -> InstallDraft {
		InstallDraft {
			conversation_id: "c1".to_owned(),
			application: application.to_owned(),
			title: application.to_owned(),
			logo: Some("https://logos.test/superset.png".to_owned()),
			scope: Destination::Space,
			destination_id: Some("personal".to_owned()),
			install,
		}
	}

	async fn a_store(dir: &std::path::Path) -> crate::db::Database {
		let database = open(dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
			.await
			.expect("the conversation is planted");
		database
	}

	#[tokio::test]
	async fn a_recorded_install_carries_its_conversation_the_seq_it_landed_after_and_its_secret() {
		let dir = temp_dir();
		let database = a_store(&dir).await;

		let recorded = database
			.application_installs()
			.record(a_draft("superset", InstallCase::Key { secret: "SUPERSET_API_KEY".to_owned() }))
			.await
			.expect("the install is recorded");

		assert_eq!(recorded.conversation_id, "c1");
		assert_eq!(recorded.last_message_seq, 2);
		assert_eq!(recorded.scope, Destination::Space);
		assert_eq!(recorded.destination_id.as_deref(), Some("personal"));
		assert_eq!(recorded.install, InstallCase::Key { secret: "SUPERSET_API_KEY".to_owned() });
		assert!(recorded.created_at > 0, "the moment it was written is not held");
		assert_eq!(
			database.application_installs().of_conversation("c1".to_owned()).await.expect("read"),
			vec![recorded]
		);

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_installs_of_one_conversation_read_oldest_first_and_leave_the_others_out() {
		let dir = temp_dir();
		let database = a_store(&dir).await;
		for application in ["paper", "linear", "granola"] {
			database
				.application_installs()
				.record(a_draft(application, InstallCase::Oauth))
				.await
				.expect("the install is recorded");
		}

		let read = database
			.application_installs()
			.of_conversation("c1".to_owned())
			.await
			.expect("the installs read");

		assert_eq!(
			read.iter().map(|held| held.application.as_str()).collect::<Vec<_>>(),
			["paper", "linear", "granola"]
		);
		assert_eq!(
			database.application_installs().of_conversation("c2".to_owned()).await.expect("read"),
			Vec::new(),
			"a conversation with no install answered rows"
		);

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_installs_of_a_conversation_go_when_the_conversation_goes() {
		let dir = temp_dir();
		let database = a_store(&dir).await;
		database
			.application_installs()
			.record(a_draft("paper", InstallCase::Nothing))
			.await
			.expect("the install is recorded");

		database
			.call_mut(|connection| {
				Ok(connection.execute("DELETE FROM conversations WHERE id = 'c1'", [])?)
			})
			.await
			.expect("the conversation is removed");

		assert_eq!(count_of(&database, "application_installs").await, 0);

		std::fs::remove_dir_all(&dir).expect("cleanup");
	}
}
