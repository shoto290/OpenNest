//! Brings an existing file up to the schema this build expects.
//!
//! `PRAGMA user_version` is the whole bookkeeping: it lives in the database
//! header, so it is written inside the same transaction as the DDL it stands for
//! and a step that fails halfway leaves neither the tables nor the number behind.
//! A shipped number is spent for good — the next change appends a step, it never
//! edits one, because an installed file has already run the old text.

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
];

/// Timestamps are unix millis, ids are UUID v4 text: both are what the host
/// already produces, so nothing has to be converted on the way in or out.
///
/// `messages` and `turns` are ordered by `(conversation_id, seq)` rather than by
/// their timestamp — two rows written in the same millisecond must still come
/// back in the order they were appended. The unique constraints on those pairs
/// are what makes the order a rule instead of a convention, and each one already
/// gives SQLite the index that lookup walks.
///
/// Nothing here may point across conversations, so a child that belongs to one
/// says so in its own key and is joined on the pair: `UNIQUE (id,
/// conversation_id)` on the parent is what lets the two-column foreign key exist,
/// and the two columns together are what makes "same conversation" a fact SQLite
/// checks rather than a rule the writer is trusted with. The same technique scopes
/// a runtime row to a participant, through the pair `conversation_participants`
/// already keys on: a message's author is a bot the conversation holds rather than
/// any bot that exists, and a checkpoint's run is its own participant's, over the
/// three columns `runtime_sessions` is made to expose for it. The optional half of
/// such a pair stays NULLable — SQLite counts a composite key as satisfied the
/// moment one of its columns is NULL, which is exactly a user message with no bot
/// author and a checkpoint taken outside any run.
///
/// A state a step reads back after a crash is stored, never derived: an activity
/// left `running` by a host that died is only recognisable as abandoned because
/// the row still says `running`. `completion_state` spells the whole lifecycle out
/// for the same reason — `cancelled` is a user who stopped the stream,
/// `interrupted` a process that died under one, and the sweep at the next launch
/// can only tell them apart if both reached the disk.
///
/// A checkpoint is frozen whole rather than column by column: it stands for the
/// messages it folded in, at the count and the moment it folded them, so a later
/// summary is a new row. Refusing every update covers the id and anything added
/// later, which enumerating the columns would not.
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

/// What a bot brings to a context rebuilt for it, beside the transcript:
/// `instructions` is how it was asked to answer, `memory` is what it carries from
/// one run to the next. Both belong to the bot rather than to a conversation or a
/// run — a session rotated away takes neither with it.
///
/// A step of its own rather than two more columns in [`CONVERSATIONS_SCHEMA`]:
/// version 1 is shipped, and an installed file has already run its text. `NOT NULL
/// DEFAULT ''` is what lets `ALTER TABLE` answer for the rows already on disk, and
/// empty is the honest value for a bot that was never given either — a context
/// leaves out a part that has no words in it.
const BOT_CONTEXT: &str = "
ALTER TABLE bots ADD COLUMN instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE bots ADD COLUMN memory TEXT NOT NULL DEFAULT '';
";

/// Who the bot is, beside what it was told: a short role label, a long free text,
/// the avatar it is recognised by, and the directory its runs are meant to happen
/// in. `title` and `description` are `NOT NULL DEFAULT ''` for the reason step 2's
/// columns are — empty is the honest value for a bot nobody has described, and it
/// is what `ALTER TABLE` can answer for the rows already on disk.
///
/// The two avatar columns are `CHECK`-constrained to the words the avatar engine
/// draws, spelled out here rather than trusted to the writer: a row holding a
/// ninth animal would be a bot the UI has no face for, and nothing downstream
/// could tell it from a typo. The defaults are what the bot already on the record
/// is given — it had no face before this step, and every row must come out of the
/// step with one.
///
/// `avatar_image_path` and `working_dir` are NULLable rather than empty-defaulted:
/// both name something outside the database, and "no picture" and "a picture at
/// the empty path" are not the same fact.
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

/// The colour a bot is marked with, which is what replaces the pose as the second
/// half of a face. NULLable and defaulted to nothing on purpose: no mark is what a
/// bot is until someone gives it one, and it is a fact the file can hold rather
/// than a ninth word standing for "none".
///
/// `CHECK`-constrained to the eight the palette holds, for the reason step 3's two
/// avatar columns are — a colour nothing can paint is indistinguishable from a
/// typo once it is on the disk. The constraint passes `NULL` on its own: `NULL IN
/// (...)` is `NULL`, and SQLite refuses a `CHECK` only when it is false.
///
/// `avatar_pose` is left exactly where it is, values included. SQLite will not drop
/// a column another constraint mentions, and nothing above reads or writes it any
/// more, so the honest step is to stop projecting it rather than to rewrite the file
/// around its absence.
const BOT_BLOT: &str = "
ALTER TABLE bots ADD COLUMN avatar_blot TEXT
	CHECK (avatar_blot IN
		('coral', 'amber', 'moss', 'water', 'sky', 'lavender', 'rose', 'slate'));
";

pub fn latest_version() -> u32 {
	MIGRATIONS.last().map_or(0, |migration| migration.version)
}

pub fn apply(connection: &mut Connection) -> Result<(), DatabaseError> {
	apply_each(connection, MIGRATIONS)
}

/// Each step is skipped by number rather than by looking for its tables: what an
/// old build left behind is only knowable from the version it recorded. The
/// number is read once — this loop is the only writer of it, so a committed step
/// is all the local has to follow.
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

	/// Two conversations, two bots, and a bot taking part in only one of them: every
	/// rejection below needs a row that legitimately exists somewhere else, because
	/// what has to be refused is the reference across, not the row itself.
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

	/// Always the participant `('c1', 'b1')`, so the run named is the only thing
	/// under test — `NULL` included, which is why the session comes in quoted.
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

	/// Second statement of step 2 collides with the first, so the step trips after
	/// having already written to the database.
	const BROKEN: &[Migration] = &[
		Migration { version: 1, statements: CONVERSATIONS_SCHEMA },
		Migration {
			version: 2,
			statements: "CREATE TABLE half_landed (id TEXT PRIMARY KEY);
				CREATE TABLE half_landed (id TEXT PRIMARY KEY);",
		},
	];

	/// A step that fails must cost nothing: neither the table it created before
	/// tripping, nor the number that would tell the next launch it had run.
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

	/// The one thing a step appended to a shipped schema has to prove: a file that
	/// stopped at the version before it comes up whole, with the rows it already held
	/// and the columns the new build reads them through. Empty rather than absent —
	/// nothing has been said to this bot yet, and a context leaves such a part out.
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

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// What the install already on disk is: the bot the app shipped with, the chat
	/// it holds and every word said in it. All of it has to be reachable after the
	/// step, and the bot has to come out of it wearing a face it never had.
	#[test]
	fn the_bot_already_on_the_record_keeps_its_transcript_and_gains_a_face() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..2]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at)
					VALUES ('default', 'Claude', 'sonnet', 1);
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1);
				INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
					VALUES ('c1', 'default', 'assistant', 1);
				INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 1);
				INSERT INTO messages
					(id, conversation_id, turn_id, author_bot_id, seq, role, content,
						completion_state, created_at)
					VALUES ('m1', 'c1', 't1', NULL, 1, 'user', 'hello', 'complete', 1),
						('m2', 'c1', 't1', 'default', 2, 'assistant', 'hi there', 'complete', 2);",
			)
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

	/// The two ways a file reaches this build — installed fresh, or upgraded from
	/// the version before — have to leave the same schema behind. They run the same
	/// text in the same order, and this is what says so out loud: a step written as
	/// a `CREATE` for one path and an `ALTER` for the other would pass every other
	/// test in this file and diverge here, down to the declaration each column
	/// carries.
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

	/// Every object the file holds and the text it was declared with. `ALTER TABLE
	/// ADD COLUMN` rewrites that text, so the column a step appended — its type, its
	/// default and the `CHECK` on it — is inside what this compares.
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

	/// A launch that has nothing to do must do nothing: the number is the whole
	/// bookkeeping, so running the steps again on a file already at the latest
	/// version leaves both the version and the rows exactly as they were.
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

	/// The eight animals and the eight poses the avatar engine draws, and nothing
	/// else: a word outside them is a bot the UI has no face for, so it never
	/// reaches the disk to be read back. The pose is no longer projected, and the
	/// column keeps its `CHECK` anyway — what an older build wrote is still what
	/// comes back out.
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

	/// The eight colours the palette holds, and no mark at all: a bot given none is
	/// the default, and it is `NULL` rather than a ninth word. Anything else is a
	/// colour nothing can paint, so it never reaches the disk.
	#[test]
	fn a_blot_outside_the_palette_is_refused_and_no_blot_is_allowed() {
		let dir = temp_dir();
		let connection = migrated(&dir);

		for blot in ["coral", "amber", "moss", "water", "sky", "lavender", "rose", "slate"] {
			assert!(
				write(&connection, &a_bot_marked(&format!("'{blot}'"), blot)).is_ok(),
				"the palette holds {blot} and the file refused it"
			);
		}
		assert!(
			write(&connection, &a_bot_marked("NULL", "unmarked")).is_ok(),
			"a bot with no mark was refused"
		);
		assert_eq!(blot_of(&connection, "unmarked"), None);
		assert!(
			write(&connection, &a_bot_marked("'chartreuse'", "unknown-blot")).is_err(),
			"a colour outside the palette was stored"
		);

		drop(connection);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// What the step that adds the mark owes a file already in use: the bots it
	/// holds come out unmarked, everything said to them is still readable, and the
	/// pose an older build wrote is exactly where it was left.
	#[test]
	fn the_step_that_adds_the_mark_leaves_every_bot_unmarked_and_its_transcript_whole() {
		let dir = temp_dir();
		let mut connection = open(&dir.join(FILE_NAME)).expect("open");
		apply_each(&mut connection, &MIGRATIONS[..3]).expect("the shipped schema installs");
		connection
			.execute_batch(
				"INSERT INTO bots (id, name, model, created_at, title, avatar_animal, avatar_pose)
					VALUES ('default', 'Claude', 'sonnet', 1, 'Reviewer', 'owl', 'curious');
				INSERT INTO conversations (id, kind, title, created_at, updated_at)
					VALUES ('c1', 'main', 'Chat', 1, 1);
				INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
					VALUES ('c1', 'default', 'assistant', 1);
				INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 1);
				INSERT INTO messages
					(id, conversation_id, turn_id, author_bot_id, seq, role, content,
						completion_state, created_at)
					VALUES ('m1', 'c1', 't1', NULL, 1, 'user', 'hello', 'complete', 1),
						('m2', 'c1', 't1', 'default', 2, 'assistant', 'hi there', 'complete', 2);",
			)
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

	fn a_bot_marked(blot: &str, id: &str) -> String {
		format!(
			"INSERT INTO bots (id, name, model, created_at, avatar_blot)
				VALUES ('{id}', 'A bot', 'sonnet', 1, {blot})"
		)
	}

	fn blot_of(connection: &Connection, id: &str) -> Option<String> {
		connection
			.query_row("SELECT avatar_blot FROM bots WHERE id = ?1", [id], |row| row.get(0))
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

	/// Foreign keys are off by default on every new connection, so this is what
	/// proves the pragma is applied where it has to be: on the open, not on the file.
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

	/// Ordering is a constraint, not a habit: two rows claiming the same place in a
	/// conversation, a turn or a participant's run of sessions would make the order
	/// they come back in depend on the query plan.
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

	/// A participant runs one Claude session at a time, and the ones it has already
	/// spent stay on the record: only the live one is exclusive, and only within the
	/// pair it belongs to.
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

	/// A reply and a turn are both same-conversation by construction: the pair is
	/// checked, so a writer cannot quote a message the reader of this conversation
	/// has never seen.
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

	/// A bot that never joined a conversation cannot have spoken in it, and joining is
	/// what makes it able to: `b2` exists and is a participant of `c1`, so `c2` is
	/// where its authorship has to be refused until it joins. A message with no bot
	/// author is the other half of the rule — the pair holds a NULL, so a user message
	/// needs no participant row anywhere.
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

	/// A runtime row belongs to a participant, not to a conversation and a bot that
	/// merely both exist: `b2` is in `c1` only, so `c2` is where it has no run.
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

	/// A session id on its own names any run in the file, including another bot's in
	/// the same conversation and the same bot's in another one. Replaying a summary
	/// into either would resume the wrong context, so the run is scoped by the
	/// participant it was opened for, not by its id.
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

	/// The states a step reads back are the ones it knows how to act on, so a value
	/// outside the vocabulary never reaches the disk to be found later.
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

	/// The two endings nothing derives: `cancelled` is the user stopping the stream and
	/// `interrupted` is the sweep closing out one the process died under. A step reads
	/// them back long after the fact, so the vocabulary has to hold them — and hold
	/// nothing else.
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

	/// A checkpoint stands for the messages it folded in, at the count, the run and the
	/// moment it folded them: an edit to any of that leaves a row claiming something it
	/// never recorded. So the whole row is refused, its id included, and a later
	/// summary is a new checkpoint.
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
