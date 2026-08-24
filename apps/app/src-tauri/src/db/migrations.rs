
use rusqlite::Connection;

use super::connection::DatabaseError;

struct Migration {
	version: u32,
	statements: &'static str,
}

const MIGRATIONS: &[Migration] = &[
	Migration { version: 1, statements: CONVERSATIONS_SCHEMA },
	Migration { version: 2, statements: BOT_CONTEXT },
	Migration { version: 3, statements: BOT_IDENTITY },
	Migration { version: 4, statements: BOT_BLOT },
	Migration { version: 5, statements: BOT_COMMANDS },
	Migration { version: 6, statements: BOT_DENIAL },
	Migration { version: 7, statements: BOT_COLOUR },
	Migration { version: 8, statements: BOT_DENIED_TOOLS },
	Migration { version: 9, statements: MESSAGE_RUNTIME_SESSION },
	Migration { version: 10, statements: MESSAGE_PIN },
	Migration { version: 11, statements: BUBBLE_PIN },
];

const CONVERSATIONS_SCHEMA: &str = "
CREATE TABLE bots (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	model TEXT NOT NULL,
	created_at INTEGER NOT NULL
);

CREATE TABLE conversations (
	id TEXT PRIMARY KEY,
	kind TEXT NOT NULL CHECK (kind IN ('main', 'topic')),
	title TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL,
	archived_at INTEGER
);

CREATE TABLE conversation_participants (
	conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
	bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
	role TEXT NOT NULL,
	joined_at INTEGER NOT NULL,
	PRIMARY KEY (conversation_id, bot_id)
);

CREATE TABLE runtime_sessions (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	provider_session_id TEXT,
	seq INTEGER NOT NULL,
	status TEXT NOT NULL CHECK (status IN ('active', 'rotated', 'ended', 'failed')),
	started_at INTEGER NOT NULL,
	ended_at INTEGER,
	rotation_reason TEXT,
	UNIQUE (conversation_id, bot_id, seq),
	UNIQUE (id, conversation_id, bot_id),
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX runtime_sessions_active_per_participant
	ON runtime_sessions (conversation_id, bot_id) WHERE status = 'active';

CREATE TABLE turns (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
	seq INTEGER NOT NULL,
	started_at INTEGER NOT NULL,
	completed_at INTEGER,
	UNIQUE (conversation_id, seq),
	UNIQUE (id, conversation_id)
);

CREATE TABLE messages (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
	turn_id TEXT NOT NULL,
	author_bot_id TEXT,
	replied_to_message_id TEXT,
	seq INTEGER NOT NULL,
	role TEXT NOT NULL,
	content TEXT NOT NULL,
	completion_state TEXT NOT NULL CHECK (completion_state IN
		('pending', 'streaming', 'complete', 'cancelled', 'failed', 'interrupted')),
	created_at INTEGER NOT NULL,
	UNIQUE (conversation_id, seq),
	UNIQUE (id, conversation_id),
	FOREIGN KEY (turn_id, conversation_id)
		REFERENCES turns (id, conversation_id) ON DELETE CASCADE,
	FOREIGN KEY (replied_to_message_id, conversation_id)
		REFERENCES messages (id, conversation_id) ON DELETE CASCADE,
	FOREIGN KEY (conversation_id, author_bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id)
);

CREATE INDEX messages_by_turn ON messages(turn_id);

CREATE TABLE activities (
	id TEXT PRIMARY KEY,
	turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
	kind TEXT NOT NULL,
	status TEXT NOT NULL
		CHECK (status IN ('pending', 'running', 'succeeded', 'failed', 'terminated')),
	payload TEXT NOT NULL,
	seq INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (turn_id, seq)
);

CREATE INDEX activities_unfinished ON activities (status)
	WHERE status IN ('pending', 'running');

CREATE TABLE context_checkpoints (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	runtime_session_id TEXT,
	summary TEXT NOT NULL,
	last_message_seq INTEGER NOT NULL,
	token_count INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	UNIQUE (conversation_id, bot_id, last_message_seq),
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE,
	FOREIGN KEY (runtime_session_id, conversation_id, bot_id)
		REFERENCES runtime_sessions (id, conversation_id, bot_id)
);

CREATE TRIGGER context_checkpoints_are_written_once
BEFORE UPDATE ON context_checkpoints
BEGIN
	SELECT RAISE(ABORT, 'a checkpoint records one moment: insert a new one, never edit this row');
END;

CREATE TABLE app_settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL
);
";

const BOT_CONTEXT: &str = "
ALTER TABLE bots ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN memory TEXT NOT NULL DEFAULT '';
";

const BOT_IDENTITY: &str = "
ALTER TABLE bots ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN avatar_animal TEXT NOT NULL DEFAULT 'cat'
	CHECK (avatar_animal IN
		('cat', 'rabbit', 'bear', 'chick', 'dog', 'mouse', 'owl', 'koala'));
ALTER TABLE bots ADD COLUMN avatar_pose TEXT NOT NULL DEFAULT 'idle'
	CHECK (avatar_pose IN
		('idle', 'happy', 'curious', 'proud', 'shy', 'playful', 'bored', 'sleeping'));
ALTER TABLE bots ADD COLUMN avatar_image_path TEXT;
ALTER TABLE bots ADD COLUMN working_dir TEXT;
";

const BOT_BLOT: &str = "
ALTER TABLE bots ADD COLUMN avatar_blot TEXT
	CHECK (avatar_blot IN
		('coral', 'amber', 'moss', 'water', 'sky', 'lavender', 'rose', 'slate'));
";

const BOT_COMMANDS: &str = "
ALTER TABLE bots ADD COLUMN commands TEXT NOT NULL DEFAULT '[]';
";

const BOT_DENIAL: &str = "
ALTER TABLE bots ADD COLUMN changes_nothing INTEGER NOT NULL DEFAULT 0;
";

const BOT_COLOUR: &str = "
ALTER TABLE bots ADD COLUMN avatar_color TEXT
	CHECK (avatar_color IN
		('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange'));

UPDATE bots SET avatar_color = CASE avatar_blot
	WHEN 'coral' THEN 'red'
	WHEN 'amber' THEN 'yellow'
	WHEN 'moss' THEN 'green'
	WHEN 'water' THEN 'cyan'
	WHEN 'sky' THEN 'blue'
	WHEN 'lavender' THEN 'purple'
	WHEN 'rose' THEN 'pink'
	WHEN 'slate' THEN 'orange'
END;
";

const BOT_DENIED_TOOLS: &str = "
ALTER TABLE bots ADD COLUMN denied_tools TEXT NOT NULL DEFAULT '[]';
UPDATE bots SET denied_tools = '[\"Bash\",\"Edit\",\"NotebookEdit\",\"Write\"]'
	WHERE changes_nothing = 1;
ALTER TABLE bots DROP COLUMN changes_nothing;
";

const MESSAGE_RUNTIME_SESSION: &str = "
ALTER TABLE messages ADD COLUMN runtime_session_id TEXT REFERENCES runtime_sessions(id);
";

const MESSAGE_PIN: &str = "
ALTER TABLE messages ADD COLUMN pinned_at INTEGER;
CREATE INDEX messages_pinned ON messages (conversation_id, seq) WHERE pinned_at IS NOT NULL;
";

const BUBBLE_PIN: &str = "
CREATE TABLE message_pins (
	conversation_id TEXT NOT NULL,
	message_id TEXT NOT NULL,
	block_index INTEGER NOT NULL,
	pinned_at INTEGER NOT NULL,
	PRIMARY KEY (conversation_id, message_id, block_index),
	FOREIGN KEY (message_id, conversation_id)
		REFERENCES messages (id, conversation_id) ON DELETE CASCADE
);

INSERT INTO message_pins (conversation_id, message_id, block_index, pinned_at)
	SELECT conversation_id, id, 0, pinned_at FROM messages WHERE pinned_at IS NOT NULL;

DROP INDEX messages_pinned;
ALTER TABLE messages DROP COLUMN pinned_at;
";

pub fn latest_version() -> u32 {
	MIGRATIONS.last().map_or(0, |migration| migration.version)
}

pub fn apply(connection: &mut Connection) -> Result<(), DatabaseError> {
	apply_each(connection, MIGRATIONS)
}

fn apply_each(connection: &mut Connection, migrations: &[Migration]) -> Result<(), DatabaseError> {
	let mut installed = version(connection)?;
	for migration in migrations {
		if installed >= migration.version {
			continue;
		}
		let transaction = connection.transaction()?;
		transaction.execute_batch(migration.statements)?;
		transaction.pragma_update(None, "user_version", migration.version)?;
		transaction.commit()?;
		installed = migration.version;
	}
	Ok(())
}

pub fn version(connection: &Connection) -> Result<u32, DatabaseError> {
	Ok(connection.pragma_query_value(None, "user_version", |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::Path;

	use super::*;
	use crate::db::connection::{open, temp_dir, FILE_NAME};

	const FIXTURE: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1), ('c2', 'topic', 'Second', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
			VALUES ('c1', 'b1', 'assistant', 1), ('c1', 'b2', 'assistant', 1),
				('c2', 'b1', 'assistant', 1);
		INSERT INTO turns (id, conversation_id, seq, started_at)
			VALUES ('t1', 'c1', 1, 1), ('t2', 'c2', 1, 1);
		INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m1', 'c1', 't1', 1, 'user', 'hello', 'complete', 1),
				('m2', 'c2', 't2', 1, 'user', 'hello', 'complete', 1);
		INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
			VALUES ('a1', 't1', 'tool', 'running', '{}', 1, 1);
	";

	const A_LIVE_SESSION: &str = "INSERT INTO runtime_sessions
		(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
		VALUES ('s1', 'c1', 'b1', 'claude-1', 1, 'active', 1)";

	const A_CHECKPOINT: &str = "INSERT INTO context_checkpoints
		(id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq,
			token_count, created_at)
		VALUES ('k1', 'c1', 'b1', 's1', 'the conversation so far', 1, 120, 1)";

	fn a_message_ending_in(state: &str, id: &str, seq: u32) -> String {
		format!(
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('{id}', 'c1', 't1', {seq}, 'assistant', 'hi', '{state}', 2)"
		)
	}

	fn a_checkpoint_naming(session: &str, id: &str, last_message_seq: u32) -> String {
		format!(
			"INSERT INTO context_checkpoints
				(id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq,
					token_count, created_at)
				VALUES ('{id}', 'c1', 'b1', {session}, 'the conversation so far',
					{last_message_seq}, 120, 1)"
		)
	}

	fn migrated(dir: &Path) -> Connection {
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply(&mut connection).expect("the schema installs");
		connection
	}

	fn fixture(dir: &Path) -> Connection {
		let connection = migrated(dir);
		connection.execute_batch(FIXTURE).expect("the fixture is inserted");
		connection
	}

	fn write(connection: &Connection, statement: &str) -> rusqlite::Result<usize> {
		connection.execute(statement, [])
	}

	const BROKEN: &[Migration] = &[
		Migration { version: 1, statements: CONVERSATIONS_SCHEMA },
		Migration {
			version: 2,
			statements: "CREATE TABLE half_landed (id TEXT PRIMARY KEY);
				CREATE TABLE half_landed (id TEXT PRIMARY KEY);",
		},
	];

	#[test]
	fn a_failing_step_rolls_back_its_tables_and_its_version() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");

		let outcome = apply_each(&mut connection, BROKEN);

		assert!(outcome.is_err(), "a broken step reported success");
		assert_eq!(version(&connection).expect("version"), 1, "a failed step kept its version");
		assert!(
			!has_table(&connection, "half_landed"),
			"a failed step left a table the schema does not know"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_installed_before_the_later_steps_keeps_its_rows_and_gains_their_columns() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..1]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1);",
			)
			.expect("a bot written by the older build");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			connection
				.query_row(
					"SELECT instructions, memory, name FROM bots WHERE id = 'b1'",
					[],
					|row| {
						Ok((
							row.get::<_, String>(0)?,
							row.get::<_, String>(1)?,
							row.get::<_, String>(2)?,
						))
					}
				)
				.expect("query"),
			(String::new(), String::new(), "First".to_owned()),
			"a bot from the older build did not survive the step that reads it"
		);
		assert_eq!(
			identity_of(&connection, "b1"),
			(String::new(), String::new(), "cat".to_owned(), "idle".to_owned(), None, None),
			"a bot from the older build came out of the step without a face"
		);
		assert_eq!(
			connection
				.query_row("SELECT commands FROM bots WHERE id = 'b1'", [], |row| row
					.get::<_, String>(0))
				.expect("query"),
			"[]",
			"a bot from the older build came out of the step offering something"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_bot_already_on_the_record_keeps_its_transcript_and_gains_a_face() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..2]).expect("the shipped schema installs");
		connection
			.execute_batch(&a_chat_held_by(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('default', 'Claude', 'sonnet', 1);",
			))
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			transcript_of(&connection, "c1"),
			vec!["hello".to_owned(), "hi there".to_owned()],
			"the step the bot gained a face in cost it its transcript"
		);
		assert_eq!(
			identity_of(&connection, "default"),
			(String::new(), String::new(), "cat".to_owned(), "idle".to_owned(), None, None)
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_fresh_install_and_an_upgraded_file_come_out_the_same_shape() {
		let fresh_dir = temp_dir();
		let upgraded_dir = temp_dir();
		let mut fresh = open(&fresh_dir.join(FILE_NAME)).expect("open");
		let mut upgraded = open(&upgraded_dir.join(FILE_NAME)).expect("open");
		apply_each(&mut upgraded, &MIGRATIONS[..2]).expect("the shipped schema installs");

		apply(&mut fresh).expect("the schema installs");
		apply(&mut upgraded).expect("the file comes up to this build");

		assert_eq!(version(&fresh).expect("version"), version(&upgraded).expect("version"));
		assert_eq!(
			schema_of(&fresh),
			schema_of(&upgraded),
			"a file that was upgraded holds a different schema than one installed fresh"
		);

		drop(fresh);
		drop(upgraded);
		fs::remove_dir_all(&fresh_dir).expect("cleanup");
		fs::remove_dir_all(&upgraded_dir).expect("cleanup");
	}

	fn schema_of(connection: &Connection) -> Vec<(String, String)> {
		let mut statement = connection
			.prepare(
				"SELECT name, COALESCE(sql, '') FROM sqlite_master
					WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
			)
			.expect("prepare");
		statement
			.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	#[test]
	fn running_the_steps_again_on_an_up_to_date_file_changes_nothing() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply(&mut connection).expect("the schema installs");
		write(
			&connection,
			"INSERT INTO bots (id, name, model, created_at, title, avatar_animal, avatar_pose)
				VALUES ('b1', 'First', 'sonnet', 1, 'Reviewer', 'owl', 'curious')",
		)
		.expect("a bot written between the two runs");

		apply(&mut connection).expect("the steps run a second time");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			identity_of(&connection, "b1"),
			(
				"Reviewer".to_owned(),
				String::new(),
				"owl".to_owned(),
				"curious".to_owned(),
				None,
				None
			),
			"a second run rewrote a row it had nothing to do with"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_face_the_avatar_engine_cannot_draw_is_refused() {
		let dir = temp_dir();
		let connection = migrated(&dir);

		for animal in ["cat", "rabbit", "bear", "chick", "dog", "mouse", "owl", "koala"] {
			assert!(
				write(&connection, &a_bot_shown_as(animal, "idle", animal)).is_ok(),
				"the engine draws {animal} and the file refused it"
			);
		}
		for pose in ["idle", "happy", "curious", "proud", "shy", "playful", "bored", "sleeping"] {
			assert!(
				write(&connection, &a_bot_shown_as("cat", pose, pose)).is_ok(),
				"the engine draws {pose} and the file refused it"
			);
		}
		assert!(
			write(&connection, &a_bot_shown_as("dragon", "idle", "unknown-animal")).is_err(),
			"an animal the engine cannot draw was stored"
		);
		assert!(
			write(&connection, &a_bot_shown_as("cat", "furious", "unknown-pose")).is_err(),
			"a pose the engine cannot draw was stored"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_blot_outside_the_palette_is_refused_and_no_blot_is_allowed() {
		let dir = temp_dir();
		let connection = migrated(&dir);

		for blot in ["red", "yellow", "green", "cyan", "blue", "purple", "pink", "orange"] {
			assert!(
				write(&connection, &a_bot_marked(Some(blot), blot)).is_ok(),
				"the palette holds {blot} and the file refused it"
			);
		}
		assert!(
			write(&connection, &a_bot_marked(None, "unmarked")).is_ok(),
			"a bot with no mark was refused"
		);
		assert_eq!(blot_of(&connection, "unmarked"), None);
		assert!(
			write(&connection, &a_bot_marked(Some("chartreuse"), "unknown-blot")).is_err(),
			"a colour outside the palette was stored"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_names_the_denied_tools_carries_the_switch_it_replaces() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..6]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at, changes_nothing)
					VALUES ('held', 'Held', 'sonnet', 1, 1),
					       ('free', 'Free', 'sonnet', 2, 0);",
			)
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			denied_tools_of(&connection, "held"),
			r#"["Bash","Edit","NotebookEdit","Write"]"#,
			"a bot set to change nothing came up denying nothing"
		);
		assert_eq!(denied_tools_of(&connection, "free"), "[]");
		assert!(
			connection
				.query_row("SELECT changes_nothing FROM bots", [], |row| row.get::<_, i64>(0))
				.is_err(),
			"the switch the list replaced is still a column"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_names_the_run_leaves_every_message_already_written_without_one() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..8]).expect("the shipped schema installs");
		connection
			.execute_batch(&a_chat_held_by(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('default', 'Claude', 'sonnet', 1);",
			))
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			transcript_of(&connection, "c1"),
			vec!["hello".to_owned(), "hi there".to_owned()],
			"the step the messages gained a run in cost the chat its transcript"
		);
		assert_eq!(
			runs_named_in(&connection, "c1"),
			vec![None, None],
			"the step named a run on a message written before there was one"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_moves_the_pin_to_a_bubble_carries_it_over_and_leaves_the_transcript_whole() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..10]).expect("the shipped schema installs");
		connection
			.execute_batch(&a_chat_held_by(
				"INSERT INTO bots (id, name, model, created_at, denied_tools)
					VALUES ('default', 'Claude', 'sonnet', 1, '[]');",
			))
			.expect("the install this build upgrades from");
		connection
			.execute("UPDATE messages SET pinned_at = 42 WHERE id = 'm2'", [])
			.expect("the pin this build carries over");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			transcript_of(&connection, "c1"),
			vec!["hello".to_owned(), "hi there".to_owned()],
			"the step the pin moved to a bubble in cost the chat its transcript"
		);
		assert_eq!(
			pins_held_in(&connection, "c1"),
			vec![("m2".to_owned(), 0, 42)],
			"the step lost the pin the reader had set or moved it off the first bubble"
		);
		assert!(
			!has_index(&connection, "messages_pinned"),
			"the step left the index the pin column carried behind"
		);
		assert!(
			connection
				.query_row("SELECT pinned_at FROM messages", [], |row| row.get::<_, i64>(0))
				.is_err(),
			"the column the pin table replaced is still on the messages"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn pins_held_in(connection: &Connection, conversation_id: &str) -> Vec<(String, i64, i64)> {
		let mut statement = connection
			.prepare(
				"SELECT message_id, block_index, pinned_at FROM message_pins
					WHERE conversation_id = ?1 ORDER BY message_id ASC, block_index ASC",
			)
			.expect("prepare");
		statement
			.query_map([conversation_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn has_index(connection: &Connection, name: &str) -> bool {
		connection
			.query_row(
				"SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = ?1",
				[name],
				|row| row.get::<_, u32>(0),
			)
			.expect("query")
			> 0
	}

	fn runs_named_in(connection: &Connection, conversation_id: &str) -> Vec<Option<String>> {
		let mut statement = connection
			.prepare(
				"SELECT runtime_session_id FROM messages
					WHERE conversation_id = ?1 ORDER BY seq ASC",
			)
			.expect("prepare");
		statement
			.query_map([conversation_id], |row| row.get::<_, Option<String>>(0))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn denied_tools_of(connection: &Connection, id: &str) -> String {
		connection
			.query_row("SELECT denied_tools FROM bots WHERE id = ?1", [id], |row| row.get(0))
			.expect("the denials")
	}

	#[test]
	fn the_step_that_adds_the_mark_leaves_every_bot_unmarked_and_its_transcript_whole() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..3]).expect("the shipped schema installs");
		connection
			.execute_batch(&a_chat_held_by(
				"INSERT INTO bots (id, name, model, created_at, title, avatar_animal, avatar_pose)
					VALUES ('default', 'Claude', 'sonnet', 1, 'Reviewer', 'owl', 'curious');",
			))
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(blot_of(&connection, "default"), None, "the step marked a bot nobody marked");
		assert_eq!(
			transcript_of(&connection, "c1"),
			vec!["hello".to_owned(), "hi there".to_owned()],
			"the step the bot gained a mark in cost it its transcript"
		);
		assert_eq!(
			identity_of(&connection, "default"),
			(
				"Reviewer".to_owned(),
				String::new(),
				"owl".to_owned(),
				"curious".to_owned(),
				None,
				None
			),
			"the step rewrote the pose it was told to leave alone"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_renames_the_marks_carries_every_bot_to_its_new_name() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..6]).expect("the build before the rename");
		let marked = [
			("coral", "red"),
			("amber", "yellow"),
			("moss", "green"),
			("water", "cyan"),
			("sky", "blue"),
			("lavender", "purple"),
			("rose", "pink"),
			("slate", "orange"),
		];
		let rows: String = marked
			.iter()
			.map(|(was, _)| {
				format!(
					"INSERT INTO bots (id, name, model, created_at, avatar_blot)
						VALUES ('{was}', 'A bot', 'sonnet', 1, '{was}');"
				)
			})
			.collect();
		connection
			.execute_batch(&format!(
				"{rows}
				INSERT INTO bots (id, name, model, created_at)
					VALUES ('unmarked', 'A bot', 'sonnet', 1);"
			))
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		for (was, now) in marked {
			assert_eq!(
				blot_of(&connection, was).as_deref(),
				Some(now),
				"the bot stored as {was} did not come up as {now}"
			);
		}
		assert_eq!(blot_of(&connection, "unmarked"), None, "the step marked a bot nobody marked");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn a_chat_held_by(bot: &str) -> String {
		format!(
			"{bot}
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1);
				INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
					VALUES ('c1', 'default', 'assistant', 1);
				INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 1);
				INSERT INTO messages
					(id, conversation_id, turn_id, author_bot_id, seq, role, content,
						completion_state, created_at)
					VALUES ('m1', 'c1', 't1', NULL, 1, 'user', 'hello', 'complete', 1),
						('m2', 'c1', 't1', 'default', 2, 'assistant', 'hi there', 'complete', 2);"
		)
	}

	fn a_bot_marked(blot: Option<&str>, id: &str) -> String {
		let mark = blot.map_or("NULL".to_owned(), |blot| format!("'{blot}'"));
		format!(
			"INSERT INTO bots (id, name, model, created_at, avatar_color)
				VALUES ('{id}', 'A bot', 'sonnet', 1, {mark})"
		)
	}

	fn blot_of(connection: &Connection, id: &str) -> Option<String> {
		connection
			.query_row("SELECT avatar_color FROM bots WHERE id = ?1", [id], |row| row.get(0))
			.expect("query")
	}

	fn a_bot_shown_as(animal: &str, pose: &str, id: &str) -> String {
		format!(
			"INSERT INTO bots (id, name, model, created_at, avatar_animal, avatar_pose)
				VALUES ('{id}', 'A bot', 'sonnet', 1, '{animal}', '{pose}')"
		)
	}

	type StoredIdentity = (String, String, String, String, Option<String>, Option<String>);

	fn identity_of(connection: &Connection, id: &str) -> StoredIdentity {
		connection
			.query_row(
				"SELECT title, description, avatar_animal, avatar_pose, avatar_image_path,
					working_dir
					FROM bots WHERE id = ?1",
				[id],
				|row| {
					Ok((
						row.get(0)?,
						row.get(1)?,
						row.get(2)?,
						row.get(3)?,
						row.get(4)?,
						row.get(5)?,
					))
				},
			)
			.expect("query")
	}

	fn transcript_of(connection: &Connection, conversation_id: &str) -> Vec<String> {
		let mut statement = connection
			.prepare("SELECT content FROM messages WHERE conversation_id = ?1 ORDER BY seq ASC")
			.expect("prepare");
		statement
			.query_map([conversation_id], |row| row.get::<_, String>(0))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn has_table(connection: &Connection, name: &str) -> bool {
		connection
			.query_row(
				"SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
				[name],
				|row| row.get::<_, u32>(0),
			)
			.expect("query")
			> 0
	}

	#[test]
	fn a_row_pointing_at_nothing_is_refused() {
		let dir = temp_dir();
		let connection = migrated(&dir);

		let orphan = write(
			&connection,
			"INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
				VALUES ('missing', 'missing', 'assistant', 1)",
		);

		assert!(orphan.is_err(), "a participant of no conversation was accepted");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_second_row_claiming_the_same_place_is_refused() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");

		let turn = write(
			&connection,
			"INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t3', 'c1', 1, 2)",
		);
		let message = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m3', 'c1', 't1', 1, 'assistant', 'hi', 'complete', 2)",
		);
		let activity = write(
			&connection,
			"INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
				VALUES ('a2', 't1', 'tool', 'pending', '{}', 1, 2)",
		);
		let session = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s2', 'c1', 'b1', 'claude-2', 1, 'ended', 2)",
		);

		assert!(turn.is_err(), "two turns took the same seq");
		assert!(message.is_err(), "two messages took the same seq");
		assert!(activity.is_err(), "two activities took the same seq in a turn");
		assert!(session.is_err(), "two sessions took the same seq for a participant");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_participant_holds_one_live_session_at_a_time() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");

		let second_live = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s2', 'c1', 'b1', 'claude-2', 2, 'active', 2)",
		);
		let another_bot = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s3', 'c1', 'b2', 'claude-3', 1, 'active', 3)",
		);
		let spent = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at,
					ended_at, rotation_reason)
				VALUES ('s4', 'c1', 'b1', 'claude-4', 3, 'rotated', 4, 5, 'context full')",
		);

		assert!(second_live.is_err(), "a participant was given two live sessions at once");
		assert!(another_bot.is_ok(), "a second bot was refused a session of its own");
		assert!(spent.is_ok(), "a rotated session was refused alongside the live one");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_message_never_reaches_into_another_conversation() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let within = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, replied_to_message_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m3', 'c1', 't1', 'm1', 2, 'assistant', 'hi', 'streaming', 2)",
		);
		let across_reply = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, replied_to_message_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m4', 'c1', 't1', 'm2', 3, 'assistant', 'hi', 'complete', 3)",
		);
		let across_turn = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m5', 'c1', 't2', 4, 'assistant', 'hi', 'complete', 4)",
		);

		assert!(within.is_ok(), "a reply inside its own conversation was refused: {within:?}");
		assert!(across_reply.is_err(), "a message quoted another conversation's message");
		assert!(across_turn.is_err(), "a message was filed under another conversation's turn");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_message_is_authored_by_a_participant_or_by_no_one() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let outsider = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, author_bot_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m3', 'c2', 't2', 'b2', 2, 'assistant', 'hi', 'complete', 2)",
		);
		write(
			&connection,
			"INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
				VALUES ('c2', 'b2', 'assistant', 2)",
		)
		.expect("the bot joins the conversation");
		let participant = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, author_bot_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m4', 'c2', 't2', 'b2', 3, 'assistant', 'hi', 'complete', 3)",
		);
		connection
			.execute_batch(
				"INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c3', 'topic', 'Third', 1, 1);
				INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t3', 'c3', 1, 1);",
			)
			.expect("a conversation nobody has joined");
		let unauthored = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m5', 'c3', 't3', 1, 'user', 'hello', 'complete', 1)",
		);

		assert!(outsider.is_err(), "a bot outside the conversation authored a message in it");
		assert!(participant.is_ok(), "a participant's own message was refused: {participant:?}");
		assert!(unauthored.is_ok(), "a message with no bot author was refused: {unauthored:?}");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_runtime_row_only_exists_for_a_participant() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");

		let session = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s2', 'c2', 'b2', 'claude-2', 1, 'active', 2)",
		);
		let checkpoint = write(
			&connection,
			"INSERT INTO context_checkpoints
				(id, conversation_id, bot_id, summary, last_message_seq, token_count, created_at)
				VALUES ('k2', 'c2', 'b2', 'the conversation so far', 1, 120, 2)",
		);
		let for_a_participant = write(&connection, A_CHECKPOINT);

		assert!(session.is_err(), "a bot outside the conversation was given a session in it");
		assert!(checkpoint.is_err(), "a bot outside the conversation was given a checkpoint in it");
		assert!(
			for_a_participant.is_ok(),
			"a participant's own checkpoint was refused: {for_a_participant:?}"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_checkpoint_only_names_its_own_participants_session() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		connection
			.execute_batch(
				"INSERT INTO runtime_sessions
					(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
					VALUES ('s1', 'c1', 'b1', 'claude-1', 1, 'active', 1),
						('s2', 'c1', 'b2', 'claude-2', 1, 'active', 2),
						('s3', 'c2', 'b1', 'claude-3', 1, 'active', 3);",
			)
			.expect("a session for three participants");

		let another_bot = write(&connection, &a_checkpoint_naming("'s2'", "k2", 2));
		let another_conversation = write(&connection, &a_checkpoint_naming("'s3'", "k3", 3));
		let own_session = write(&connection, A_CHECKPOINT);
		let no_session = write(&connection, &a_checkpoint_naming("NULL", "k4", 4));

		assert!(another_bot.is_err(), "a checkpoint named another bot's run in its conversation");
		assert!(another_conversation.is_err(), "a checkpoint named its bot's run in another one");
		assert!(own_session.is_ok(), "a participant's own run was refused: {own_session:?}");
		assert!(no_session.is_ok(), "a checkpoint outside any run was refused: {no_session:?}");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_state_the_schema_has_no_word_for_is_refused() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let kind = write(
			&connection,
			"INSERT INTO conversations (id, kind, title, created_at, updated_at)
				VALUES ('c3', 'draft', 'Third', 1, 1)",
		);
		let completion = write(
			&connection,
			"INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m3', 'c1', 't1', 2, 'assistant', 'hi', 'half', 2)",
		);
		let activity = write(
			&connection,
			"INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
				VALUES ('a2', 't1', 'tool', 'halfway', '{}', 2, 2)",
		);
		let session = write(
			&connection,
			"INSERT INTO runtime_sessions
				(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
				VALUES ('s2', 'c1', 'b1', 'claude-2', 1, 'paused', 2)",
		);

		assert!(kind.is_err(), "a conversation of no known kind was accepted");
		assert!(completion.is_err(), "a message in no known completion state was accepted");
		assert!(activity.is_err(), "an activity in no known status was accepted");
		assert!(session.is_err(), "a session in no known status was accepted");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_message_can_be_stored_cancelled_or_interrupted() {
		let dir = temp_dir();
		let connection = fixture(&dir);

		let cancelled = write(&connection, &a_message_ending_in("cancelled", "m3", 2));
		let interrupted = write(&connection, &a_message_ending_in("interrupted", "m4", 3));
		let unknown = write(&connection, &a_message_ending_in("aborted", "m5", 4));

		assert!(cancelled.is_ok(), "a message the user stopped was refused: {cancelled:?}");
		assert!(interrupted.is_ok(), "a message the sweep closed out was refused: {interrupted:?}");
		assert!(unknown.is_err(), "a message in no known completion state was accepted");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_stored_checkpoint_cannot_be_rewritten() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");
		write(&connection, A_CHECKPOINT).expect("the checkpoint is inserted");

		for rewrite in [
			"id = 'k2'",
			"conversation_id = 'c2'",
			"bot_id = 'b2'",
			"runtime_session_id = NULL",
			"summary = 'something else'",
			"last_message_seq = 2",
			"token_count = 130",
			"created_at = 2",
		] {
			let refused = write(
				&connection,
				&format!("UPDATE context_checkpoints SET {rewrite} WHERE id = 'k1'"),
			);

			assert!(refused.is_err(), "a stored checkpoint accepted `{rewrite}`");
		}

		assert_eq!(
			connection
				.query_row("SELECT summary FROM context_checkpoints WHERE id = 'k1'", [], |row| row
					.get::<_, String>(0))
				.expect("query"),
			"the conversation so far"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
