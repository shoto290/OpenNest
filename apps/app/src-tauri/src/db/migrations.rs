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
	Migration { version: 12, statements: BOT_SPACE },
	Migration { version: 13, statements: BOT_SECTION },
	Migration { version: 14, statements: CONVERSATION_ROOM },
	Migration { version: 15, statements: BOT_PERMISSIONS },
	Migration { version: 17, statements: ROSTER_PIN },
	Migration { version: 18, statements: OPTIONAL_SPACE_COLOUR },
	Migration { version: 19, statements: SPACE_SETTINGS },
	Migration { version: 20, statements: SEVERAL_LIVE_SESSIONS },
	Migration { version: 21, statements: CHECKPOINT_PER_SESSION },
	Migration { version: 22, statements: ROUTINES },
	Migration { version: 23, statements: ROUTINE_TASK },
	Migration { version: 24, statements: ROUTINE_LAST_OCCURRENCE },
	Migration { version: 25, statements: ROUTINE_REPORTED_TURN },
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

const BOT_SPACE: &str = "
CREATE TABLE spaces (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	colour TEXT NOT NULL CHECK (colour IN
		('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange')),
	position INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

INSERT INTO spaces (id, name, colour, position, created_at)
	VALUES ('personal', 'Personal', 'red', 0, unixepoch() * 1000);

PRAGMA legacy_alter_table = ON;
ALTER TABLE bots RENAME TO bots_without_space;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE bots (
	id TEXT PRIMARY KEY,
	space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	model TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	instructions TEXT NOT NULL DEFAULT '',
	memory TEXT NOT NULL DEFAULT '',
	title TEXT NOT NULL DEFAULT '',
	description TEXT NOT NULL DEFAULT '',
	avatar_animal TEXT NOT NULL DEFAULT 'cat'
		CHECK (avatar_animal IN
			('cat', 'rabbit', 'bear', 'chick', 'dog', 'mouse', 'owl', 'koala')),
	avatar_pose TEXT NOT NULL DEFAULT 'idle'
		CHECK (avatar_pose IN
			('idle', 'happy', 'curious', 'proud', 'shy', 'playful', 'bored', 'sleeping')),
	avatar_image_path TEXT,
	working_dir TEXT,
	avatar_blot TEXT
		CHECK (avatar_blot IN
			('coral', 'amber', 'moss', 'water', 'sky', 'lavender', 'rose', 'slate')),
	commands TEXT NOT NULL DEFAULT '[]',
	avatar_color TEXT
		CHECK (avatar_color IN
			('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange')),
	denied_tools TEXT NOT NULL DEFAULT '[]'
);

INSERT INTO bots (id, space_id, name, model, created_at, instructions, memory, title,
		description, avatar_animal, avatar_pose, avatar_image_path, working_dir, avatar_blot,
		commands, avatar_color, denied_tools)
	SELECT id, 'personal', name, model, created_at, instructions, memory, title,
		description, avatar_animal, avatar_pose, avatar_image_path, working_dir, avatar_blot,
		commands, avatar_color, denied_tools
	FROM bots_without_space;

DROP TABLE bots_without_space;
";

const BOT_SECTION: &str = "
CREATE TABLE sections (
	id TEXT PRIMARY KEY,
	space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
	name TEXT NOT NULL,
	position INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

ALTER TABLE bots ADD COLUMN section_id TEXT
	REFERENCES sections(id) ON DELETE SET NULL;
";

const BOT_PERMISSIONS: &str = "
ALTER TABLE bots ADD COLUMN permissions TEXT;
";

const ROSTER_PIN: &str = "
ALTER TABLE bots ADD COLUMN pin_position INTEGER;
ALTER TABLE conversations ADD COLUMN pin_position INTEGER;

UPDATE conversations SET pin_position = (
	SELECT COUNT(*) FROM conversations AS earlier
		WHERE earlier.section_id = conversations.section_id
			AND (earlier.created_at < conversations.created_at
				OR (earlier.created_at = conversations.created_at
					AND earlier.id < conversations.id))
) WHERE section_id IS NOT NULL;

UPDATE bots SET pin_position = (
	SELECT COUNT(*) FROM conversations WHERE conversations.section_id = bots.section_id
) + (
	SELECT COUNT(*) FROM bots AS earlier
		WHERE earlier.section_id = bots.section_id
			AND (earlier.created_at < bots.created_at
				OR (earlier.created_at = bots.created_at AND earlier.id < bots.id))
) WHERE section_id IS NOT NULL;
";

const CONVERSATION_ROOM: &str = "
ALTER TABLE conversations ADD COLUMN space_id TEXT REFERENCES spaces(id) ON DELETE CASCADE;
ALTER TABLE conversations ADD COLUMN section_id TEXT REFERENCES sections(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN instructions TEXT NOT NULL DEFAULT '';

UPDATE conversations SET space_id = (
	SELECT bots.space_id FROM conversation_participants
		JOIN bots ON bots.id = conversation_participants.bot_id
		WHERE conversation_participants.conversation_id = conversations.id
		ORDER BY conversation_participants.joined_at ASC, conversation_participants.bot_id ASC
		LIMIT 1
);

CREATE INDEX conversations_of_space ON conversations (space_id) WHERE kind = 'topic';

ALTER TABLE conversation_participants ADD COLUMN join_seq INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_participants ADD COLUMN left_at INTEGER;

UPDATE conversation_participants SET join_seq = (
	SELECT COUNT(*) FROM conversation_participants AS earlier
		WHERE earlier.conversation_id = conversation_participants.conversation_id
			AND (earlier.joined_at < conversation_participants.joined_at
				OR (earlier.joined_at = conversation_participants.joined_at
					AND earlier.bot_id < conversation_participants.bot_id))
);

CREATE UNIQUE INDEX conversation_participants_in_join_order
	ON conversation_participants (conversation_id, join_seq);

CREATE UNIQUE INDEX conversation_participants_one_lead
	ON conversation_participants (conversation_id) WHERE role = 'lead';

ALTER TABLE bots ADD COLUMN deleted_at INTEGER;
";

const SPACE_SETTINGS: &str = "
CREATE TABLE IF NOT EXISTS space_settings (
	space_id TEXT NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
	key TEXT NOT NULL,
	value TEXT NOT NULL,
	PRIMARY KEY (space_id, key)
);
";

const OPTIONAL_SPACE_COLOUR: &str = "
PRAGMA legacy_alter_table = ON;
ALTER TABLE spaces RENAME TO spaces_always_coloured;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE spaces (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	colour TEXT CHECK (colour IN
		('red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'orange')),
	position INTEGER NOT NULL,
	created_at INTEGER NOT NULL
);

INSERT INTO spaces (id, name, colour, position, created_at)
	SELECT id, name, colour, position, created_at FROM spaces_always_coloured;

DROP TABLE spaces_always_coloured;
";

const SEVERAL_LIVE_SESSIONS: &str = "
DROP INDEX IF EXISTS runtime_sessions_active_per_participant;
";

const CHECKPOINT_PER_SESSION: &str = "
DROP TRIGGER context_checkpoints_are_written_once;

PRAGMA legacy_alter_table = ON;
ALTER TABLE context_checkpoints RENAME TO context_checkpoints_shared_by_a_bot;
PRAGMA legacy_alter_table = OFF;

CREATE TABLE context_checkpoints (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	runtime_session_id TEXT,
	summary TEXT NOT NULL,
	last_message_seq INTEGER NOT NULL,
	token_count INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE,
	FOREIGN KEY (runtime_session_id, conversation_id, bot_id)
		REFERENCES runtime_sessions (id, conversation_id, bot_id)
);

INSERT INTO context_checkpoints
	(id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq,
		token_count, created_at)
	SELECT id, conversation_id, bot_id, runtime_session_id, summary, last_message_seq,
		token_count, created_at
	FROM context_checkpoints_shared_by_a_bot;

DROP TABLE context_checkpoints_shared_by_a_bot;

CREATE UNIQUE INDEX context_checkpoints_per_session
	ON context_checkpoints (runtime_session_id, last_message_seq);

CREATE TRIGGER context_checkpoints_are_written_once
BEFORE UPDATE ON context_checkpoints
BEGIN
	SELECT RAISE(ABORT, 'a checkpoint records one moment: insert a new one, never edit this row');
END;
";

const ROUTINES: &str = "
CREATE TABLE IF NOT EXISTS routines (
	id TEXT PRIMARY KEY,
	conversation_id TEXT NOT NULL,
	bot_id TEXT NOT NULL,
	trigger_source_id TEXT NOT NULL,
	event_filter TEXT NOT NULL,
	trigger_config TEXT NOT NULL,
	trigger_key TEXT NOT NULL UNIQUE,
	is_enabled INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
	consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
	last_failed_at INTEGER,
	created_at INTEGER NOT NULL,
	FOREIGN KEY (conversation_id, bot_id)
		REFERENCES conversation_participants (conversation_id, bot_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS routines_by_conversation ON routines (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS routine_runs (
	id TEXT PRIMARY KEY,
	routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
	started_at INTEGER NOT NULL,
	ended_at INTEGER,
	outcome TEXT CHECK (outcome IN ('ok', 'nothing', 'skipped', 'failed')),
	reason TEXT,
	cost_usd REAL,
	model_usage TEXT,
	lease_renewed_at INTEGER NOT NULL,
	CHECK ((ended_at IS NULL) = (outcome IS NULL))
);

CREATE INDEX IF NOT EXISTS routine_runs_by_routine ON routine_runs (routine_id, started_at);

CREATE UNIQUE INDEX IF NOT EXISTS routine_runs_one_open_per_routine
	ON routine_runs (routine_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS routine_dedupe_values (
	routine_id TEXT NOT NULL REFERENCES routines (id) ON DELETE CASCADE,
	value TEXT NOT NULL,
	seen_at INTEGER NOT NULL,
	PRIMARY KEY (routine_id, value)
);

CREATE INDEX IF NOT EXISTS routine_dedupe_values_by_age ON routine_dedupe_values (seen_at);
";

const ROUTINE_TASK: &str = "
ALTER TABLE routines ADD COLUMN title TEXT NOT NULL DEFAULT '';
ALTER TABLE routines ADD COLUMN instruction TEXT NOT NULL DEFAULT '';
";

const ROUTINE_LAST_OCCURRENCE: &str = "
ALTER TABLE routines ADD COLUMN last_occurrence_at INTEGER;
";

const ROUTINE_REPORTED_TURN: &str = "
ALTER TABLE routine_runs ADD COLUMN reported_turn_id TEXT
	REFERENCES turns (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS routine_runs_one_run_per_reported_turn
	ON routine_runs (reported_turn_id) WHERE reported_turn_id IS NOT NULL;
";

pub fn latest_version() -> u32 {
	MIGRATIONS.last().map_or(0, |migration| migration.version)
}

pub fn apply(connection: &mut Connection) -> Result<(), DatabaseError> {
	apply_each(connection, MIGRATIONS)
}

fn apply_each(connection: &mut Connection, migrations: &[Migration]) -> Result<(), DatabaseError> {
	connection.pragma_update(None, "foreign_keys", "OFF")?;
	let applied = apply_pending(connection, migrations);
	connection.pragma_update(None, "foreign_keys", "ON")?;
	applied
}

fn apply_pending(
	connection: &mut Connection,
	migrations: &[Migration],
) -> Result<(), DatabaseError> {
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
		INSERT INTO bots (id, space_id, name, model, created_at)
			VALUES ('b1', 'personal', 'First', 'sonnet', 1),
				('b2', 'personal', 'Second', 'sonnet', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1), ('c2', 'topic', 'Second', 1, 1);
		INSERT INTO conversation_participants
			(conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c1', 'b2', 'assistant', 1, 1),
				('c2', 'b1', 'assistant', 1, 0);
		INSERT INTO turns (id, conversation_id, seq, started_at)
			VALUES ('t1', 'c1', 1, 1), ('t2', 'c2', 1, 1);
		INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m1', 'c1', 't1', 1, 'user', 'hello', 'complete', 1),
				('m2', 'c2', 't2', 1, 'user', 'hello', 'complete', 1);
		INSERT INTO activities (id, turn_id, kind, status, payload, seq, created_at)
			VALUES ('a1', 't1', 'tool', 'running', '{}', 1, 1);
	";

	const SPACE_SETTINGS_STEP: u32 = 19;
	const SEVERAL_LIVE_SESSIONS_STEP: u32 = 20;
	const CHECKPOINT_PER_SESSION_STEP: u32 = 21;
	const ROUTINE_TASK_STEP: u32 = 23;
	const ROUTINE_LAST_OCCURRENCE_STEP: u32 = 24;
	const ROUTINE_REPORTED_TURN_STEP: u32 = 25;

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

	fn shipped_before(version: u32) -> &'static [Migration] {
		let steps = MIGRATIONS.iter().take_while(|migration| migration.version < version).count();
		&MIGRATIONS[..steps]
	}

	fn only_step(version: u32) -> &'static [Migration] {
		let at = MIGRATIONS
			.iter()
			.position(|migration| migration.version == version)
			.unwrap_or_else(|| panic!("no step declares version {version}"));
		&MIGRATIONS[at..=at]
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
	fn the_bots_a_file_already_held_come_out_of_the_step_in_one_space() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..11]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 2);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'First', 1, 1);
				INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
					VALUES ('c1', 'b1', 'assistant', 1);",
			)
			.expect("the bots this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			spaces_of(&connection),
			vec![("personal".to_owned(), "Personal".to_owned(), Some("red".to_owned()), 0)],
			"the step did not lay down the one space every bot belongs to"
		);
		assert_eq!(
			bot_spaces_of(&connection),
			vec![
				("b1".to_owned(), "personal".to_owned()),
				("b2".to_owned(), "personal".to_owned())
			],
			"a bot came out of the step without the space it belongs to"
		);
		assert_eq!(
			rows_in(&connection, "conversation_participants"),
			1,
			"rebuilding the table the bots live in cost them their seats"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn an_empty_file_comes_out_of_the_step_holding_the_one_space() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");

		apply(&mut connection).expect("the schema installs");

		assert_eq!(
			spaces_of(&connection),
			vec![("personal".to_owned(), "Personal".to_owned(), Some("red".to_owned()), 0)]
		);
		assert_eq!(
			connection
				.pragma_query_value(None, "foreign_keys", |row| row.get::<_, i64>(0))
				.expect("the foreign key switch"),
			1,
			"the steps left the file with nothing holding its references together"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_chats_a_file_already_held_come_out_of_the_step_in_the_space_of_their_bot() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..13]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO spaces (id, name, colour, position, created_at)
					VALUES ('writers', 'Writers', 'blue', 1, 1);
				INSERT INTO bots (id, space_id, name, model, created_at)
					VALUES ('b1', 'writers', 'First', 'sonnet', 1),
						('b2', 'writers', 'Second', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'topic', 'Launch', 1, 1);
				INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
					VALUES ('c1', 'b2', 'assistant', 1), ('c1', 'b1', 'assistant', 2);",
			)
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			connection
				.query_row("SELECT space_id FROM conversations WHERE id = 'c1'", [], |row| row
					.get::<_, Option<
					String,
				>>(0))
				.expect("query"),
			Some("writers".to_owned()),
			"a conversation from the older build came out of the step without a space"
		);
		assert_eq!(
			join_order_of(&connection, "c1"),
			vec![("b2".to_owned(), 0), ("b1".to_owned(), 1)],
			"the seats came out of the step in an order nobody sat down in"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_spaces_a_file_already_held_come_out_of_the_step_wearing_the_colour_they_wore() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..16]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO spaces (id, name, colour, position, created_at)
					VALUES ('writers', 'Writers', 'blue', 1, 1);
				INSERT INTO bots (id, space_id, name, model, created_at)
					VALUES ('b1', 'writers', 'First', 'sonnet', 1);",
			)
			.expect("the install this build upgrades from");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			spaces_of(&connection),
			vec![
				("personal".to_owned(), "Personal".to_owned(), Some("red".to_owned()), 0),
				("writers".to_owned(), "Writers".to_owned(), Some("blue".to_owned()), 1)
			],
			"a space from the older build came out of the step wearing another colour"
		);
		assert_eq!(
			bot_spaces_of(&connection),
			vec![("b1".to_owned(), "writers".to_owned())],
			"rebuilding the table the spaces live in cost a bot its space"
		);
		write(
			&connection,
			"INSERT INTO spaces (id, name, position, created_at)
				VALUES ('plain', 'Plain', 2, 1)",
		)
		.expect("a space wearing no colour is refused");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn join_order_of(connection: &Connection, conversation_id: &str) -> Vec<(String, i64)> {
		let mut statement = connection
			.prepare(
				"SELECT bot_id, join_seq FROM conversation_participants
					WHERE conversation_id = ?1 ORDER BY join_seq",
			)
			.expect("prepare");
		statement
			.query_map([conversation_id], |row| Ok((row.get(0)?, row.get(1)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn spaces_of(connection: &Connection) -> Vec<(String, String, Option<String>, i64)> {
		let mut statement = connection
			.prepare("SELECT id, name, colour, position FROM spaces ORDER BY position, id")
			.expect("prepare");
		statement
			.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn bot_spaces_of(connection: &Connection) -> Vec<(String, String)> {
		let mut statement =
			connection.prepare("SELECT id, space_id FROM bots ORDER BY id").expect("prepare");
		statement
			.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
			.expect("query")
			.collect::<rusqlite::Result<Vec<_>>>()
			.expect("rows")
	}

	fn rows_in(connection: &Connection, table: &str) -> i64 {
		connection
			.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))
			.expect("query")
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

	#[test]
	fn every_step_declares_a_version_no_other_step_uses() {
		for pair in MIGRATIONS.windows(2) {
			assert!(
				pair[0].version < pair[1].version,
				"version {} is declared out of order or by two steps",
				pair[1].version
			);
		}
	}

	#[test]
	fn a_file_that_missed_the_space_settings_step_gains_the_table() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(SPACE_SETTINGS_STEP))
			.expect("the build that shipped without the settings step installs");
		assert!(!has_table(&connection, "space_settings"), "the file already held the table");

		apply(&mut connection).expect("the file comes up to this build");

		assert!(has_table(&connection, "space_settings"), "the file never gained the table");
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn the_step_that_gives_a_routine_a_task_leaves_one_written_earlier_readable() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(ROUTINE_TASK_STEP))
			.expect("the build that shipped a routine without a task installs");
		connection.execute_batch(FIXTURE).expect("the fixture is inserted");
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of the older build");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			connection
				.query_row("SELECT title, instruction FROM routines WHERE id = 'r1'", [], |row| Ok(
					(row.get::<_, String>(0)?, row.get::<_, String>(1)?)
				))
				.expect("the routine of the older build reads back"),
			(String::new(), String::new()),
			"the step left a routine written before it unreadable"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_missed_the_last_occurrence_step_gains_the_column_and_keeps_its_routines() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(ROUTINE_LAST_OCCURRENCE_STEP))
			.expect("the build that shipped without the occurrence column installs");
		connection.execute_batch(FIXTURE).expect("the fixture is inserted");
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of the earlier build");

		apply(&mut connection).expect("the file comes up to this build");

		let held: Option<i64> = connection
			.query_row("SELECT last_occurrence_at FROM routines WHERE id = 'r1'", [], |row| {
				row.get(0)
			})
			.expect("the column is there and the row survived");
		assert_eq!(held, None, "a routine that never fired carries no occurrence");
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_missed_the_reported_turn_step_gains_the_column_and_keeps_its_runs() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(ROUTINE_REPORTED_TURN_STEP))
			.expect("the build that shipped without the reported turn installs");
		connection.execute_batch(FIXTURE).expect("the fixture is inserted");
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of the earlier build");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome,
				lease_renewed_at)
				VALUES ('run1', 'r1', 1, 2, 'ok', 1)",
		)
		.expect("a run of the earlier build");

		apply(&mut connection).expect("the file comes up to this build");

		let held: (Option<String>, Option<i64>) = connection
			.query_row(
				"SELECT reported_turn_id, ended_at FROM routine_runs WHERE id = 'run1'",
				[],
				|row| Ok((row.get(0)?, row.get(1)?)),
			)
			.expect("the column is there and the row survived");
		assert_eq!(held, (None, Some(2)), "a run written before the step reported in no turn");
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_second_run_naming_a_turn_already_reported_in_is_refused_by_the_schema() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of a participant");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome,
				lease_renewed_at, reported_turn_id)
				VALUES ('run1', 'r1', 1, 2, 'ok', 1, 't1')",
		)
		.expect("a run that reported in a turn");

		let refused = write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome,
				lease_renewed_at, reported_turn_id)
				VALUES ('run2', 'r1', 3, 4, 'ok', 3, 't1')",
		);

		assert!(refused.is_err(), "a turn was reported in by two runs");
		assert_eq!(rows_in(&connection, "routine_runs"), 1, "the refused run landed anyway");
		assert!(
			has_index(&connection, "routine_runs_one_run_per_reported_turn"),
			"the reported turn carries no unique index"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_turn_that_goes_leaves_the_run_that_reported_in_it_naming_no_turn() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of a participant");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, ended_at, outcome,
				lease_renewed_at, reported_turn_id)
				VALUES ('run1', 'r1', 1, 2, 'ok', 1, 't1')",
		)
		.expect("a run that reported in a turn");

		write(&connection, "DELETE FROM turns WHERE id = 't1'").expect("the delete lands");

		let held: Option<String> = connection
			.query_row("SELECT reported_turn_id FROM routine_runs WHERE id = 'run1'", [], |row| {
				row.get(0)
			})
			.expect("the run survived the turn");
		assert_eq!(held, None, "the run kept a turn that is gone");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_routine_and_what_hangs_off_it_go_with_the_participant_that_holds_them() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of a participant");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, lease_renewed_at)
				VALUES ('run1', 'r1', 1, 1)",
		)
		.expect("a started run");
		write(
			&connection,
			"INSERT INTO routine_dedupe_values (routine_id, value, seen_at)
				VALUES ('r1', 'once', 1)",
		)
		.expect("a dedupe value");

		write(&connection, "DELETE FROM conversations WHERE id = 'c1'").expect("the delete lands");

		for table in ["routines", "routine_runs", "routine_dedupe_values"] {
			let left: u32 = connection
				.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))
				.expect("query");
			assert_eq!(left, 0, "{table} kept a row of a conversation that is gone");
		}

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_routine_holds_one_open_run_at_a_time_and_never_an_outcome_without_an_end() {
		let dir = temp_dir();
		let connection = fixture(&dir);
		write(
			&connection,
			"INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at)
				VALUES ('r1', 'c1', 'b1', 'schedule', '{}', '{}', 'k1', 1)",
		)
		.expect("a routine of a participant");
		write(
			&connection,
			"INSERT INTO routine_runs (id, routine_id, started_at, lease_renewed_at)
				VALUES ('run1', 'r1', 1, 1)",
		)
		.expect("a started run");

		assert!(
			write(
				&connection,
				"INSERT INTO routine_runs (id, routine_id, started_at, lease_renewed_at)
					VALUES ('run2', 'r1', 2, 2)",
			)
			.is_err(),
			"a second lease was taken while the first was open"
		);
		assert!(
			write(
				&connection,
				"INSERT INTO routine_runs (id, routine_id, started_at, outcome, lease_renewed_at)
					VALUES ('run3', 'r1', 3, 'ok', 3)",
			)
			.is_err(),
			"a run took an outcome without an end"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_already_holds_space_settings_keeps_its_rows() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply(&mut connection).expect("the schema installs");
		write(
			&connection,
			"INSERT INTO space_settings (space_id, key, value)
				VALUES ('personal', 'sidebar', 'open')",
		)
		.expect("a setting written by the build that shipped the table first");
		connection
			.pragma_update(None, "user_version", SPACE_SETTINGS_STEP - 1)
			.expect("the version the merged build left behind");

		apply_each(&mut connection, only_step(SPACE_SETTINGS_STEP))
			.expect("the step the merged build skipped runs again");

		assert_eq!(
			connection
				.query_row(
					"SELECT value FROM space_settings WHERE space_id = 'personal'
						AND key = 'sidebar'",
					[],
					|row| row.get::<_, String>(0)
				)
				.expect("query"),
			"open",
			"the step dropped a setting the older build had written"
		);
		assert_eq!(version(&connection).expect("version"), SPACE_SETTINGS_STEP);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
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
			"INSERT INTO bots (id, space_id, name, model, created_at, title, avatar_animal,
					avatar_pose)
				VALUES ('b1', 'personal', 'First', 'sonnet', 1, 'Reviewer', 'owl', 'curious')",
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
	fn the_step_that_adds_the_pin_pins_what_a_section_held_and_leaves_the_rest_loose() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..15])
			.expect("the install this build upgrades from");
		connection
			.execute_batch(
				"INSERT INTO sections (id, space_id, name, position, created_at)
					VALUES ('writers', 'personal', 'Writers', 0, 1);
				INSERT INTO bots (id, space_id, section_id, name, model, created_at)
					VALUES ('held', 'personal', 'writers', 'Held', 'sonnet', 2),
						('later', 'personal', 'writers', 'Later', 'sonnet', 3),
						('loose', 'personal', NULL, 'Loose', 'sonnet', 4);
				INSERT INTO conversations
					(id, kind, space_id, section_id, title, created_at, updated_at)
					VALUES ('room', 'topic', 'personal', 'writers', 'Room', 1, 1);",
			)
			.expect("a space a section already holds");

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(version(&connection).expect("version"), latest_version());
		assert_eq!(
			pin_of(&connection, "bots", "held"),
			Some(1),
			"a bot a section held came out of the step loose"
		);
		assert_eq!(pin_of(&connection, "bots", "later"), Some(2));
		assert_eq!(
			pin_of(&connection, "conversations", "room"),
			Some(0),
			"a conversation a section held came out of the step loose"
		);
		assert_eq!(
			pin_of(&connection, "bots", "loose"),
			None,
			"the step pinned a bot no section held"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn pin_of(connection: &Connection, table: &str, id: &str) -> Option<i64> {
		connection
			.query_row(&format!("SELECT pin_position FROM {table} WHERE id = ?1"), [id], |row| {
				row.get(0)
			})
			.expect("query")
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
			"INSERT INTO bots (id, space_id, name, model, created_at, avatar_color)
				VALUES ('{id}', 'personal', 'A bot', 'sonnet', 1, {mark})"
		)
	}

	fn blot_of(connection: &Connection, id: &str) -> Option<String> {
		connection
			.query_row("SELECT avatar_color FROM bots WHERE id = ?1", [id], |row| row.get(0))
			.expect("query")
	}

	fn a_bot_shown_as(animal: &str, pose: &str, id: &str) -> String {
		format!(
			"INSERT INTO bots (id, space_id, name, model, created_at, avatar_animal, avatar_pose)
				VALUES ('{id}', 'personal', 'A bot', 'sonnet', 1, '{animal}', '{pose}')"
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
	fn a_participant_holds_as_many_live_sessions_as_it_started() {
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

		assert!(
			second_live.is_ok(),
			"a second instance of one bot was refused a live session: {second_live:?}"
		);
		assert!(another_bot.is_ok(), "a second bot was refused a session of its own");
		assert!(spent.is_ok(), "a rotated session was refused alongside the live one");

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_kept_one_checkpoint_per_bot_keeps_its_rows_and_takes_one_per_session() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(CHECKPOINT_PER_SESSION_STEP))
			.expect("the build that shipped one checkpoint per bot installs");
		connection.execute_batch(FIXTURE).expect("the fixture is inserted");
		connection
			.execute_batch(
				"INSERT INTO runtime_sessions
					(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
					VALUES ('s1', 'c1', 'b1', 'claude-1', 1, 'active', 1),
						('s2', 'c1', 'b1', 'claude-2', 2, 'active', 2);",
			)
			.expect("two instances of one bot");
		write(&connection, A_CHECKPOINT).expect("the checkpoint is inserted");
		let beside_it = a_checkpoint_naming("'s2'", "k2", 1);
		assert!(
			write(&connection, &beside_it).is_err(),
			"the file never held one checkpoint per bot"
		);

		apply(&mut connection).expect("the file comes up to this build");

		assert_eq!(
			connection
				.query_row("SELECT summary FROM context_checkpoints WHERE id = 'k1'", [], |row| row
					.get::<_, String>(0))
				.expect("query"),
			"the conversation so far",
			"the step dropped a checkpoint the older build had written"
		);
		let admitted = write(&connection, &beside_it);
		assert!(admitted.is_ok(), "a second instance was refused its own checkpoint: {admitted:?}");
		assert!(
			write(&connection, &a_checkpoint_naming("'s2'", "k3", 1)).is_err(),
			"one session took two checkpoints at one message"
		);
		assert!(
			write(&connection, "UPDATE context_checkpoints SET summary = 'else' WHERE id = 'k1'")
				.is_err(),
			"the step left the rewritten row unguarded"
		);
		assert_eq!(version(&connection).expect("version"), latest_version());

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[test]
	fn a_file_that_forbade_two_live_sessions_lets_them_in_once_it_is_upgraded() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, shipped_before(SEVERAL_LIVE_SESSIONS_STEP))
			.expect("the build that shipped the one live session rule installs");
		connection.execute_batch(FIXTURE).expect("the fixture is inserted");
		write(&connection, A_LIVE_SESSION).expect("the session is inserted");
		let a_second_instance = "INSERT INTO runtime_sessions
			(id, conversation_id, bot_id, provider_session_id, seq, status, started_at)
			VALUES ('s2', 'c1', 'b1', 'claude-2', 2, 'active', 2)";
		assert!(
			write(&connection, a_second_instance).is_err(),
			"the file never held the one live session rule"
		);

		apply(&mut connection).expect("the file comes up to this build");

		let admitted = write(&connection, a_second_instance);
		assert!(admitted.is_ok(), "the upgraded file still holds the rule: {admitted:?}");
		assert_eq!(version(&connection).expect("version"), latest_version());

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
			"INSERT INTO conversation_participants
				(conversation_id, bot_id, role, joined_at, join_seq)
				VALUES ('c2', 'b2', 'assistant', 2, 1)",
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
