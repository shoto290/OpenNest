
use crate::db::repositories::conversations::Bot;
use crate::db::repositories::messages::{
	MessageRole, MessageWindowQuery, StoredMessage, TranscriptError,
};
use crate::db::repositories::runtime_context::{ContextCheckpoint, NewCheckpoint, ParticipantKey};
use crate::db::{Database, DatabaseError};

use super::contract::TranscriptStoreError;

const RECENT_TAIL: u32 = 20;

const FOLDED_PER_CHECKPOINT: u32 = 200;

const SUMMARY_LIMIT: usize = 4_000;

const SUMMARY_LINE_LIMIT: usize = 200;

const CHARS_PER_TOKEN: i64 = 4;

const ELIDED: &str = "…";

const MEMORY_LABEL: &str = "What you remember:";
const SUMMARY_LABEL: &str = "The conversation so far:";
const REPLY_LABEL: &str = "The message this one replies to:";
const RECENT_LABEL: &str = "The most recent messages:";
const PROMPT_LABEL: &str = "The new message:";

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
			denied_tools: Vec::new(),
			created_at: 1,
		}
	}

	fn only(prompt: &str) -> Parts<'_> {
		Parts { bot: None, summary: None, replied_to: None, recent: &[], prompt }
	}

	#[test]
	fn a_context_with_nothing_behind_it_is_the_prompt_itself() {
		assert_eq!(compose(only("hello")), "hello");
		assert_eq!(compose(Parts { bot: Some(&a_bot("", "")), ..only("hello") }), "hello");
	}

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

	#[test]
	fn a_fold_carries_the_previous_summary_forward_and_adds_to_it() {
		let folded = [
			a_message(3, MessageRole::User, "and the roof?"),
			a_message(4, MessageRole::Assistant, "tiled"),
		];

		let summary = folded_summary(Some("user: we are building a house"), &folded, false);

		assert_eq!(summary, "user: we are building a house\nuser: and the roof?\nassistant: tiled");
	}

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

	#[test]
	fn a_fold_that_left_messages_out_says_so_in_the_summary() {
		let summary = folded_summary(None, &[a_message(9, MessageRole::User, "the rest")], true);

		assert_eq!(summary, "…\nuser: the rest");
	}

	#[test]
	fn the_stored_token_count_is_an_estimate_of_the_summary_it_stands_for() {
		assert_eq!(estimated_tokens(""), 0);
		assert_eq!(estimated_tokens(&"a".repeat(400)), 100);
	}

	const TURN: &str = "t1";
	const SPOKEN: usize = 30;

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
