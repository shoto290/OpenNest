//! What a provider session has to be told before it can carry on a conversation
//! it never saw.
//!
//! A durable chat outlives every process that ever answered in it, so a new run
//! starts knowing nothing. What it is given is rebuilt here, out of the file alone
//! and in plain text: what the bot remembers, the summary of what came before, the
//! messages since that summary, the older message this prompt explicitly answers,
//! and the prompt. Nothing in it is a provider's feature — there is no transcript
//! replay and no session to resume, so the same words would serve any model that
//! reads.
//!
//! What the bot was told to be is not in it. Instructions reach the process as its
//! system prompt, spelled on the command line that starts it — see
//! [`crate::agent::session::SessionOptions`] — so a context that also printed them
//! would say the same thing twice, once with less standing than the other.
//!
//! Bounded is the whole point. Every part has a limit that does not grow with the
//! conversation: the tail is a count of messages, the summary is a count of
//! characters, and a checkpoint folds a bounded stretch at a time. A context that
//! grew with the transcript would fail at exactly the length this module exists
//! for.
//!
//! The prompt is read from the transcript rather than taken from the caller, and
//! the window stops below its `seq`. That is what makes duplication impossible
//! rather than unlikely: the row is written once, it is the upper bound of its own
//! context, and it is printed once at the end.
//!
//! A checkpoint is only ever added. The one a context resumes from is the furthest
//! into the transcript, so a fold that produces nothing and a write the file
//! refuses both leave the previous recovery point exactly where it was — and the
//! messages it does not cover are still on the record to be read verbatim.

use crate::db::repositories::conversations::Bot;
use crate::db::repositories::messages::{
	MessageRole, MessageWindowQuery, StoredMessage, TranscriptError,
};
use crate::db::repositories::runtime_context::{ContextCheckpoint, NewCheckpoint, ParticipantKey};
use crate::db::{Database, DatabaseError};

use super::contract::TranscriptStoreError;

/// How many messages a context carries word for word. The bound belongs at the
/// recent end: what a reconstruction can afford to hold as a summary is what was
/// said long ago, never what was just said.
const RECENT_TAIL: u32 = 20;

/// How many messages one checkpoint folds into its summary. A checkpoint is taken
/// at every rotation, so the stretch between two of them is normally far shorter
/// than this — the limit is for the first one taken over a transcript that grew
/// before there were any.
const FOLDED_PER_CHECKPOINT: u32 = 200;

/// How long a summary may get, in characters. It is rolled forward from one
/// checkpoint to the next, so without a limit it would grow with the conversation
/// and take the context with it. What is dropped is the oldest end.
const SUMMARY_LIMIT: usize = 4_000;

/// How much of one message a summary line keeps. A single long message would
/// otherwise spend the whole summary on itself.
const SUMMARY_LINE_LIMIT: usize = 200;

/// Tokens are the provider's unit and this module counts characters, so
/// `token_count` is stored as an estimate at the usual rule of thumb. Nothing
/// budgets against it — it is there for a reader comparing two checkpoints.
const CHARS_PER_TOKEN: i64 = 4;

/// What stands in for the words a bound left out, wherever one did.
const ELIDED: &str = "…";

const MEMORY_LABEL: &str = "What you remember:";
const SUMMARY_LABEL: &str = "The conversation so far:";
const REPLY_LABEL: &str = "The message this one replies to:";
const RECENT_LABEL: &str = "The most recent messages:";
const PROMPT_LABEL: &str = "The new message:";

/// The context for one prompt of one participant, ready to be submitted as it is.
///
/// A conversation with nothing behind it comes back as the prompt itself, with no
/// label and no heading: a first message deserves to reach the provider as the
/// user wrote it, and a section naming parts that are all empty would be noise the
/// model has to read past.
pub async fn bounded_context(
	database: &Database,
	participant: ParticipantKey,
	prompt_message_id: String,
) -> Result<String, TranscriptStoreError> {
	let conversation_id = participant.conversation_id.clone();
	let prompt = database
		.messages()
		.message(conversation_id.clone(), prompt_message_id)
		.await?
		.ok_or_else(no_such_message)?;
	let checkpoint = database.runtime_context().latest_checkpoint(participant.clone()).await?;
	let bot = database.conversations().bot(participant.bot_id.clone()).await?;
	let recent = database
		.messages()
		.window_messages(MessageWindowQuery {
			conversation_id: conversation_id.clone(),
			after_seq: checkpoint.as_ref().map_or(0, |checkpoint| checkpoint.last_message_seq),
			before_seq: prompt.seq,
			limit: RECENT_TAIL,
		})
		.await?;
	let replied_to = replied_to_target(database, &conversation_id, &prompt, &recent).await?;

	Ok(compose(Parts {
		bot: bot.as_ref(),
		summary: checkpoint.as_ref().map(|checkpoint| checkpoint.summary.as_str()),
		replied_to: replied_to.as_ref(),
		recent: &recent,
		prompt: &prompt.content,
	}))
}

/// The message a prompt answers, and only when the window does not already hold
/// it: a target inside the tail is about to be printed there, and printing it
/// twice would tell the model the same thing was said twice.
async fn replied_to_target(
	database: &Database,
	conversation_id: &str,
	prompt: &StoredMessage,
	recent: &[StoredMessage],
) -> Result<Option<StoredMessage>, TranscriptError> {
	let Some(target_id) = prompt.replied_to_message_id.as_ref() else {
		return Ok(None);
	};
	if recent.iter().any(|message| &message.id == target_id) {
		return Ok(None);
	}
	database.messages().message(conversation_id.to_owned(), target_id.clone()).await
}

/// The next recovery point for a participant, folded from the file and stored
/// whole. `None` when there is nothing new to fold, which is the ordinary answer
/// for a rotation that follows another closely: the previous checkpoint already
/// stands for everything but the tail, and the tail is what a context reads
/// verbatim anyway.
///
/// The write is the last thing that happens, and it adds a row rather than
/// replacing one. So a fold with nothing in it, a file that refuses the insert and
/// a host that dies in the middle all leave the previous checkpoint answering for
/// the conversation exactly as it did before.
pub async fn capture_checkpoint(
	database: &Database,
	participant: ParticipantKey,
	runtime_session_id: Option<String>,
	created_at: i64,
) -> Result<Option<ContextCheckpoint>, TranscriptStoreError> {
	let conversation_id = participant.conversation_id.clone();
	let previous = database.runtime_context().latest_checkpoint(participant.clone()).await?;
	let baseline = previous.as_ref().map_or(0, |checkpoint| checkpoint.last_message_seq);
	let last_seq = database.messages().last_seq(conversation_id.clone()).await?;
	let cutoff = last_seq - i64::from(RECENT_TAIL);
	if cutoff <= baseline {
		return Ok(None);
	}

	let folded = database
		.messages()
		.window_messages(MessageWindowQuery {
			conversation_id,
			after_seq: baseline,
			before_seq: cutoff + 1,
			limit: FOLDED_PER_CHECKPOINT,
		})
		.await?;
	let elided = cutoff - baseline > folded.len() as i64;
	let summary = folded_summary(
		previous.as_ref().map(|checkpoint| checkpoint.summary.as_str()),
		&folded,
		elided,
	);

	Ok(Some(
		database
			.runtime_context()
			.checkpoint(NewCheckpoint {
				participant,
				runtime_session_id,
				token_count: estimated_tokens(&summary),
				summary,
				last_message_seq: cutoff,
				created_at,
			})
			.await?,
	))
}

/// A call naming a message the file does not hold is a caller working from an id
/// that never reached the transcript, which is a mistake of its own rather than an
/// empty conversation: it is told so, instead of being handed a context built
/// around a prompt nobody can read back.
fn no_such_message() -> TranscriptError {
	TranscriptError::Database(DatabaseError::Sqlite(rusqlite::Error::QueryReturnedNoRows))
}

struct Parts<'a> {
	bot: Option<&'a Bot>,
	summary: Option<&'a str>,
	replied_to: Option<&'a StoredMessage>,
	recent: &'a [StoredMessage],
	prompt: &'a str,
}

fn compose(parts: Parts<'_>) -> String {
	let mut sections: Vec<String> = Vec::new();
	if let Some(bot) = parts.bot {
		push_section(&mut sections, MEMORY_LABEL, &bot.memory);
	}
	if let Some(summary) = parts.summary {
		push_section(&mut sections, SUMMARY_LABEL, summary);
	}
	if let Some(replied_to) = parts.replied_to {
		push_section(&mut sections, REPLY_LABEL, &spoken(replied_to));
	}
	if !parts.recent.is_empty() {
		let spoken: Vec<String> = parts.recent.iter().map(spoken).collect();
		push_section(&mut sections, RECENT_LABEL, &spoken.join("\n"));
	}
	if sections.is_empty() {
		return parts.prompt.to_owned();
	}
	push_section(&mut sections, PROMPT_LABEL, parts.prompt);
	sections.join("\n\n")
}

/// A part with no words in it is left out whole, heading included: an empty
/// heading says a bot has instructions and then shows none.
fn push_section(sections: &mut Vec<String>, label: &str, body: &str) {
	if body.trim().is_empty() {
		return;
	}
	sections.push(format!("{label}\n{body}"));
}

fn spoken(message: &StoredMessage) -> String {
	format!("{}: {}", speaker(message.role), message.content)
}

fn speaker(role: MessageRole) -> &'static str {
	match role {
		MessageRole::User => "user",
		MessageRole::Assistant => "assistant",
	}
}

/// The previous summary, then what this fold adds, oldest last. Rolled forward
/// rather than rewritten: what an earlier checkpoint stood for is not on the file
/// as messages this one would read again, so dropping it would lose the beginning
/// of the conversation for good.
fn folded_summary(previous: Option<&str>, folded: &[StoredMessage], elided: bool) -> String {
	let mut lines: Vec<String> = Vec::new();
	if let Some(previous) = previous {
		lines.push(previous.to_owned());
	}
	if elided {
		lines.push(ELIDED.to_owned());
	}
	lines.extend(folded.iter().map(summary_line));
	let summary = lines.join("\n");
	let kept = last_chars(&summary, SUMMARY_LIMIT);
	if kept.len() == summary.len() {
		return summary;
	}
	format!("{ELIDED}\n{kept}")
}

/// One message on one line: a summary is read as a list, and a reply that spans
/// paragraphs would otherwise look like several.
fn summary_line(message: &StoredMessage) -> String {
	let flattened = message.content.split_whitespace().collect::<Vec<_>>().join(" ");
	format!("{}: {}", speaker(message.role), clipped(&flattened, SUMMARY_LINE_LIMIT))
}

fn clipped(text: &str, limit: usize) -> String {
	let mut kept: String = text.chars().take(limit).collect();
	if text.chars().nth(limit).is_some() {
		kept.push_str(ELIDED);
	}
	kept
}

/// The last `limit` characters, cut on a character and never in the middle of
/// one: a summary holds whatever the conversation was written in.
fn last_chars(text: &str, limit: usize) -> &str {
	match text.char_indices().nth_back(limit.saturating_sub(1)) {
		Some((index, _)) => &text[index..],
		None => text,
	}
}

fn estimated_tokens(summary: &str) -> i64 {
	summary.chars().count() as i64 / CHARS_PER_TOKEN
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::open;
	use crate::db::repositories::conversations::AvatarAnimal;
	use crate::db::repositories::messages::{
		MessageState, NewAssistantMessage, NewTurn, NewUserMessage, TerminalState,
	};

	fn a_message(seq: i64, role: MessageRole, content: &str) -> StoredMessage {
		StoredMessage {
			id: format!("m{seq}"),
			turn_id: "t1".to_owned(),
			author_bot_id: None,
			replied_to_message_id: None,
			seq,
			role,
			content: content.to_owned(),
			state: MessageState::Complete,
			created_at: seq,
		}
	}

	fn a_bot(instructions: &str, memory: &str) -> Bot {
		Bot {
			id: "b1".to_owned(),
			name: "Claude".to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_animal: AvatarAnimal::Cat,
			avatar_blot: None,
			avatar_image_path: None,
			working_dir: None,
			instructions: instructions.to_owned(),
			memory: memory.to_owned(),
			created_at: 1,
		}
	}

	fn only(prompt: &str) -> Parts<'_> {
		Parts { bot: None, summary: None, replied_to: None, recent: &[], prompt }
	}

	/// The first message of a conversation that has nothing behind it: no summary,
	/// no tail, no instructions. What reaches the provider is what the user typed,
	/// because a heading over five empty parts is noise the model pays for.
	#[test]
	fn a_context_with_nothing_behind_it_is_the_prompt_itself() {
		assert_eq!(compose(only("hello")), "hello");
		assert_eq!(compose(Parts { bot: Some(&a_bot("", "")), ..only("hello") }), "hello");
	}

	/// Every part in its place, once each, with the prompt last. The order is what a
	/// reader of the context meets: what it remembers, what came before, what is
	/// being answered, what was just said, and only then the question.
	///
	/// The instructions are not among them, however loudly the bot carries them: they
	/// are the process's system prompt, and a context that repeated them would be the
	/// weaker of two copies of the same thing.
	#[test]
	fn every_part_is_printed_once_and_the_prompt_comes_last() {
		let bot = a_bot("Answer briefly.", "The reader prefers French.");
		let target = a_message(2, MessageRole::User, "what about the roof?");
		let recent = [
			a_message(40, MessageRole::User, "and the walls?"),
			a_message(41, MessageRole::Assistant, "they are up"),
		];

		let context = compose(Parts {
			bot: Some(&bot),
			summary: Some("user: we are building a house"),
			replied_to: Some(&target),
			recent: &recent,
			prompt: "and now?",
		});

		assert_eq!(
			context,
			"What you remember:\nThe reader prefers French.\n\n\
			The conversation so far:\nuser: we are building a house\n\n\
			The message this one replies to:\nuser: what about the roof?\n\n\
			The most recent messages:\nuser: and the walls?\nassistant: they are up\n\n\
			The new message:\nand now?"
		);
		assert_eq!(context.matches("and now?").count(), 1, "the prompt was printed twice");
		assert!(!context.contains("Answer briefly."), "the system prompt was said twice");
	}

	/// A part nobody filled in is left out whole. A heading with nothing under it
	/// tells the model there is something to read and then shows it nothing.
	#[test]
	fn a_part_with_no_words_in_it_is_left_out_with_its_heading() {
		let context = compose(Parts {
			bot: Some(&a_bot("", "   ")),
			summary: Some(""),
			recent: &[a_message(1, MessageRole::User, "hello")],
			..only("and now?")
		});

		assert!(!context.contains(MEMORY_LABEL), "an empty memory was announced");
		assert!(!context.contains(SUMMARY_LABEL), "an empty summary was announced");
		assert!(context.contains(RECENT_LABEL), "the tail that was there went missing");
	}

	/// The summary is rolled forward, so what an earlier checkpoint stood for is
	/// never read off the file again. Dropping it would lose the beginning of the
	/// conversation for good.
	#[test]
	fn a_fold_carries_the_previous_summary_forward_and_adds_to_it() {
		let folded = [
			a_message(3, MessageRole::User, "and the roof?"),
			a_message(4, MessageRole::Assistant, "tiled"),
		];

		let summary = folded_summary(Some("user: we are building a house"), &folded, false);

		assert_eq!(summary, "user: we are building a house\nuser: and the roof?\nassistant: tiled");
	}

	/// Both bounds, on the two ways a summary grows: one message that will not stop,
	/// and a conversation that will not stop. Neither may push a summary past its
	/// limit, and what is dropped is always the older end.
	#[test]
	fn a_summary_stays_within_its_bound_however_long_the_conversation_is() {
		let long = a_message(1, MessageRole::Assistant, &"word ".repeat(400));
		let line = summary_line(&long);
		assert!(
			line.chars().count()
				<= SUMMARY_LINE_LIMIT + "assistant: ".len() + ELIDED.chars().count(),
			"one message spent more than its share of the summary: {} characters",
			line.chars().count()
		);
		assert!(line.ends_with(ELIDED), "a clipped message did not say it was clipped");

		let previous = "user: said long ago\n".repeat(500);
		let summary =
			folded_summary(Some(&previous), &[a_message(2, MessageRole::User, "now")], false);

		assert!(
			summary.chars().count() <= SUMMARY_LIMIT + ELIDED.chars().count() + 1,
			"a rolled summary grew past its bound: {} characters",
			summary.chars().count()
		);
		assert!(summary.starts_with(ELIDED), "a summary that dropped its beginning did not say so");
		assert!(summary.ends_with("user: now"), "a bounded summary dropped the newest end");
	}

	/// A fold that could not reach the whole stretch says so where the summary is
	/// read, rather than leaving a gap nothing accounts for.
	#[test]
	fn a_fold_that_left_messages_out_says_so_in_the_summary() {
		let summary = folded_summary(None, &[a_message(9, MessageRole::User, "the rest")], true);

		assert_eq!(summary, "…\nuser: the rest");
	}

	/// A summary is measured in characters and stored in the provider's unit, so the
	/// number written down is an estimate of one from the other — never a count of
	/// something nobody measured.
	#[test]
	fn the_stored_token_count_is_an_estimate_of_the_summary_it_stands_for() {
		assert_eq!(estimated_tokens(""), 0);
		assert_eq!(estimated_tokens(&"a".repeat(400)), 100);
	}

	const TURN: &str = "t1";
	/// Long enough that a checkpoint has something to fold under [`RECENT_TAIL`],
	/// and that the tail cannot reach back to the beginning.
	const SPOKEN: usize = 30;

	/// The chat as the app opens it, with a turn to write into: the participant is
	/// what every runtime row and every checkpoint below is scoped by, and only
	/// `ensure_chat` writes the seat that makes one exist.
	async fn a_conversation(database: &Database) -> String {
		let bot = database.conversations().ensure_default_bot().await.expect("the bot");
		let chat = database.conversations().ensure_chat(bot.id).await.expect("the chat");
		database
			.messages()
			.start_turn(NewTurn {
				id: TURN.to_owned(),
				conversation_id: chat.id.clone(),
				started_at: 1,
			})
			.await
			.expect("the turn is started");
		chat.id
	}

	fn participant_of(conversation_id: &str, bot_id: &str) -> ParticipantKey {
		ParticipantKey { conversation_id: conversation_id.to_owned(), bot_id: bot_id.to_owned() }
	}

	/// A second bot seated in the same conversation, written straight into the file:
	/// the repository seeds one bot only, and what has to be proven here is that two
	/// participants of one transcript never read each other's context.
	async fn another_bot(database: &Database, conversation_id: &str, id: &'static str) {
		let conversation_id = conversation_id.to_owned();
		database
			.call(move |connection| {
				connection.execute(
					"INSERT INTO bots (id, name, model, created_at) VALUES (?1, 'Second', 'sonnet', 1)",
					rusqlite::params![id],
				)?;
				connection.execute(
					"INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at)
						VALUES (?1, ?2, 'assistant', 1)",
					rusqlite::params![conversation_id, id],
				)?;
				Ok(())
			})
			.await
			.expect("the second bot joins");
	}

	async fn told(database: &Database, bot_id: &'static str, instructions: &'static str) {
		database
			.call(move |connection| {
				connection.execute(
					"UPDATE bots SET instructions = ?2 WHERE id = ?1",
					rusqlite::params![bot_id, instructions],
				)?;
				Ok(())
			})
			.await
			.expect("the bot is told how to answer");
	}

	/// One message under an id the assertions can name, alternating speakers so a
	/// rebuilt tail shows the conversation and not a monologue. Answers the `seq` the
	/// file gave it.
	async fn say(database: &Database, conversation_id: &str, index: usize) -> i64 {
		let id = format!("m{index}");
		let content = format!("message {index}");
		if index % 2 == 1 {
			return database
				.messages()
				.append_user_message(NewUserMessage {
					id,
					conversation_id: conversation_id.to_owned(),
					turn_id: TURN.to_owned(),
					author_bot_id: None,
					replied_to_message_id: None,
					content,
					created_at: index as i64,
				})
				.await
				.expect("the message is appended");
		}
		let seq = database
			.messages()
			.open_assistant_message(NewAssistantMessage {
				id: id.clone(),
				conversation_id: conversation_id.to_owned(),
				turn_id: TURN.to_owned(),
				author_bot_id: None,
				replied_to_message_id: None,
				created_at: index as i64,
			})
			.await
			.expect("the reply is opened");
		database.messages().append_text(id.clone(), content).await.expect("the reply streams");
		database
			.messages()
			.finalize_message(id, TerminalState::Complete)
			.await
			.expect("the reply ends");
		seq
	}

	/// The prompt a context is built for, written the way the app writes one: on the
	/// record first, and the upper bound of its own context afterwards. Its text
	/// names it, so a prompt still on the transcript when the next one is asked about
	/// can be told from the one being asked.
	async fn prompt(
		database: &Database,
		conversation_id: &str,
		id: &str,
		replied_to: Option<&str>,
	) {
		database
			.messages()
			.append_user_message(NewUserMessage {
				id: id.to_owned(),
				conversation_id: conversation_id.to_owned(),
				turn_id: TURN.to_owned(),
				author_bot_id: None,
				replied_to_message_id: replied_to.map(str::to_owned),
				content: asked(id),
				created_at: 99,
			})
			.await
			.expect("the prompt is appended");
	}

	fn asked(id: &str) -> String {
		format!("and now? ({id})")
	}

	/// The body of one section, for an assertion about what a bound really kept. The
	/// sections are joined by a blank line and nothing in these fixtures holds one.
	fn section<'a>(context: &'a str, label: &str) -> Option<&'a str> {
		context
			.split("\n\n")
			.find(|part| part.starts_with(label))
			.map(|part| part[label.len()..].trim())
	}

	async fn spoken_so_far(database: &Database, conversation_id: &str, count: usize) {
		for index in 1..=count {
			say(database, conversation_id, index).await;
		}
	}

	fn occurrences(context: &str, needle: &str) -> usize {
		context.matches(needle).count()
	}

	/// The whole reconstruction over a real file: what the summary stands for is in
	/// the summary, what came after it is there word for word, and the prompt is at
	/// the end exactly once. The tail is what bounds it — twenty messages of thirty,
	/// however long the conversation gets.
	#[tokio::test]
	async fn a_rebuilt_context_carries_the_summary_the_tail_and_the_prompt_once() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		told(&database, "default", "Answer briefly.").await;
		spoken_so_far(&database, &conversation, SPOKEN).await;
		capture_checkpoint(&database, participant_of(&conversation, "default"), None, 7)
			.await
			.expect("the checkpoint is taken");
		prompt(&database, &conversation, "p1", None).await;

		let context =
			bounded_context(&database, participant_of(&conversation, "default"), "p1".to_owned())
				.await
				.expect("the context is rebuilt");

		assert!(context.starts_with(SUMMARY_LABEL), "the context did not open on the summary");
		assert_eq!(
			occurrences(&context, "Answer briefly."),
			0,
			"the instructions the process carries were printed into its context too"
		);
		assert_eq!(occurrences(&context, SUMMARY_LABEL), 1, "the summary went missing");
		assert_eq!(
			occurrences(&context, "message 3\n"),
			1,
			"a message the checkpoint folded was not in the summary"
		);
		assert_eq!(occurrences(&context, "message 25\n"), 1, "a recent message was not carried");
		assert_eq!(
			section(&context, RECENT_LABEL).map(|tail| tail.lines().count()),
			Some(RECENT_TAIL as usize),
			"the tail carried something other than the count it is bounded by"
		);
		assert_eq!(
			section(&context, PROMPT_LABEL),
			Some(asked("p1").as_str()),
			"the prompt was not the last thing the run is told: {context}"
		);
		assert_eq!(occurrences(&context, &asked("p1")), 1, "the prompt was carried twice");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// The one message a bound may not drop: the reader pointed at it. It travels
	/// with the prompt when the tail has already left it behind, and is not repeated
	/// when the tail still holds it.
	#[tokio::test]
	async fn a_reply_carries_its_target_only_when_the_tail_has_left_it_behind() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		spoken_so_far(&database, &conversation, SPOKEN).await;
		prompt(&database, &conversation, "p1", Some("m2")).await;
		prompt(&database, &conversation, "p2", Some("m30")).await;

		let old =
			bounded_context(&database, participant_of(&conversation, "default"), "p1".to_owned())
				.await
				.expect("the context is rebuilt");
		let recent =
			bounded_context(&database, participant_of(&conversation, "default"), "p2".to_owned())
				.await
				.expect("the context is rebuilt");

		assert_eq!(
			occurrences(&old, REPLY_LABEL),
			1,
			"an answer to an old message lost its target"
		);
		assert_eq!(occurrences(&old, "message 2\n"), 1, "the target was carried more than once");
		assert!(
			!recent.contains(REPLY_LABEL),
			"a target the tail already holds was carried a second time: {recent}"
		);
		assert_eq!(
			occurrences(&recent, "message 30"),
			1,
			"the tail lost the message being answered"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Two checkpoints in a row: the second folds what the first left, carries the
	/// first's summary forward, and becomes the one a context resumes from. Nothing
	/// the first stood for is read off the file again, and nothing is lost.
	#[tokio::test]
	async fn a_second_checkpoint_folds_what_the_first_left_and_keeps_what_it_held() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		let participant = participant_of(&conversation, "default");
		spoken_so_far(&database, &conversation, SPOKEN).await;
		let first = capture_checkpoint(&database, participant.clone(), None, 7)
			.await
			.expect("the first checkpoint")
			.expect("something to fold");

		let nothing_new = capture_checkpoint(&database, participant.clone(), None, 8)
			.await
			.expect("the checkpoint is considered");
		for index in SPOKEN + 1..=SPOKEN + 20 {
			say(&database, &conversation, index).await;
		}
		let second = capture_checkpoint(&database, participant.clone(), None, 9)
			.await
			.expect("the second checkpoint")
			.expect("something to fold");

		assert_eq!(first.last_message_seq, (SPOKEN - RECENT_TAIL as usize) as i64);
		assert!(nothing_new.is_none(), "a checkpoint was taken over a tail already folded");
		assert_eq!(second.last_message_seq, SPOKEN as i64);
		assert!(second.summary.contains("message 1\n"), "the first summary was dropped");
		assert!(second.summary.contains("message 25"), "the second fold missed its own stretch");
		assert_eq!(
			database
				.runtime_context()
				.latest_checkpoint(participant)
				.await
				.expect("the latest checkpoint")
				.map(|checkpoint| checkpoint.id),
			Some(second.id),
			"a context would resume from something other than the furthest checkpoint"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A capture the file refuses — here a run that is not this participant's, which
	/// the schema will not have a checkpoint point at. The previous recovery point
	/// has to answer for the conversation exactly as it did, and the messages the
	/// refused one would have folded are still there to be read.
	#[tokio::test]
	async fn a_refused_capture_leaves_the_previous_checkpoint_answering_for_the_chat() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		let participant = participant_of(&conversation, "default");
		spoken_so_far(&database, &conversation, SPOKEN).await;
		let kept = capture_checkpoint(&database, participant.clone(), None, 7)
			.await
			.expect("the first checkpoint")
			.expect("something to fold");
		for index in SPOKEN + 1..=SPOKEN + 20 {
			say(&database, &conversation, index).await;
		}

		let refused = capture_checkpoint(
			&database,
			participant.clone(),
			Some("a run of nobody's".to_owned()),
			9,
		)
		.await;

		assert!(refused.is_err(), "a checkpoint naming a run of nobody's was stored: {refused:?}");
		assert_eq!(
			database
				.runtime_context()
				.latest_checkpoint(participant.clone())
				.await
				.expect("the latest checkpoint")
				.map(|checkpoint| (checkpoint.id.clone(), checkpoint.summary)),
			Some((kept.id, kept.summary)),
			"a refused capture moved the recovery point"
		);

		prompt(&database, &conversation, "p1", None).await;
		let context = bounded_context(&database, participant, "p1".to_owned())
			.await
			.expect("the context is rebuilt");

		assert_eq!(occurrences(&context, "message 3\n"), 1, "the kept summary stopped being read");
		assert_eq!(
			occurrences(&context, "message 50\n"),
			1,
			"a conversation that outran its checkpoint lost what it said since"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// Two bots in one conversation read the same transcript and nothing else in
	/// common: a checkpoint is a participant's own, and one rotating has no effect on
	/// what the other is rebuilt from. What either of them was told to be is in
	/// neither context — that reaches each process as its own system prompt.
	#[tokio::test]
	async fn two_bots_in_one_conversation_are_rebuilt_from_their_own_recovery_points() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		another_bot(&database, &conversation, "second").await;
		told(&database, "default", "Answer briefly.").await;
		told(&database, "second", "Answer at length.").await;
		spoken_so_far(&database, &conversation, SPOKEN).await;

		capture_checkpoint(&database, participant_of(&conversation, "default"), None, 7)
			.await
			.expect("the first bot's checkpoint")
			.expect("something to fold");
		prompt(&database, &conversation, "p1", None).await;
		let first =
			bounded_context(&database, participant_of(&conversation, "default"), "p1".to_owned())
				.await
				.expect("the context is rebuilt");
		let second =
			bounded_context(&database, participant_of(&conversation, "second"), "p1".to_owned())
				.await
				.expect("the context is rebuilt");

		for (context, told) in [(&first, "Answer briefly."), (&second, "Answer at length.")] {
			assert!(!context.contains(told), "a bot's instructions were printed into its context");
		}
		assert!(first.contains(SUMMARY_LABEL), "the bot that folded its own history lost it");
		assert!(
			!second.contains(SUMMARY_LABEL),
			"a bot resumed from a checkpoint that was never its own: {second}"
		);
		assert_eq!(
			database
				.runtime_context()
				.latest_checkpoint(participant_of(&conversation, "second"))
				.await
				.expect("the second bot's checkpoint"),
			None,
			"a checkpoint reached across participants"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	/// A context is built around a prompt the file holds. Asked for one it does not,
	/// it says so rather than answering with a conversation that has no question at
	/// the end of it.
	#[tokio::test]
	async fn a_context_for_a_prompt_the_file_does_not_hold_is_refused() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;

		let refused = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			"no such message".to_owned(),
		)
		.await;

		assert!(refused.is_err(), "a context was built around a prompt nobody wrote: {refused:?}");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
