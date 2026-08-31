
use crate::db::repositories::conversations::Seat;
use crate::db::repositories::messages::{
	MessageRole, MessageWindowQuery, StoredMessage, TranscriptError,
};
use crate::db::repositories::runtime_context::{ContextCheckpoint, NewCheckpoint, ParticipantKey};
use crate::db::{Database, DatabaseError};

use super::contract::{MessageRun, TranscriptStoreError, message_uri};

const RECENT_TAIL: u32 = 20;

const FOLDED_PER_CHECKPOINT: u32 = 200;

const SUMMARY_LIMIT: usize = 4_000;

const SUMMARY_LINE_LIMIT: usize = 200;

const CHARS_PER_TOKEN: i64 = 4;

const ELIDED: &str = "…";

const UNKNOWN_SESSION: &str = "unknown";

const INSTRUCTIONS_LABEL: &str = "The instructions of this conversation:";
const SUMMARY_LABEL: &str = "The conversation so far:";
const REPLY_LABEL: &str = "The message this one replies to:";
const RECENT_LABEL: &str = "The most recent messages:";
const PROMPT_LABEL: &str = "The new message:";
const ROOM_LABEL: &str = "The bots in this conversation, and the token that reaches each of them:";
const ADDRESSED_NOTE: &str = "This message names you: it is yours to answer.";
const LEAD_NOTE: &str = "This message names nobody, and you hold the lead: it is yours to answer.";

const MENTION_OPEN: &str = "<@";
const MENTION_CLOSE: &str = ">";

pub async fn bounded_context(
	database: &Database,
	participant: ParticipantKey,
	runtime_session_id: String,
	prompt_message_id: String,
) -> Result<String, TranscriptStoreError> {
	let conversation_id = participant.conversation_id.clone();
	let prompt = database
		.messages()
		.message(conversation_id.clone(), prompt_message_id)
		.await?
		.ok_or_else(no_such_message)?;
	let checkpoint = database.runtime_context().latest_checkpoint(runtime_session_id).await?;
	let recent = database
		.messages()
		.window_messages(MessageWindowQuery {
			conversation_id: conversation_id.clone(),
			after_seq: checkpoint.as_ref().map_or(0, |checkpoint| checkpoint.last_message_seq),
			before_seq: prompt.seq,
			limit: RECENT_TAIL,
		})
		.await?;
	let replied_to = replied_to_target(database, &conversation_id, &prompt).await?;
	let room = room_around(database, &participant).await?;
	let instructions = database.conversations().instructions(conversation_id).await?;

	Ok(compose(Parts {
		instructions: &instructions,
		summary: checkpoint.as_ref().map(|checkpoint| checkpoint.summary.as_str()),
		replied_to: replied_to.as_ref(),
		recent: &recent,
		prompt: &prompt.content,
		room: room.as_ref(),
	}))
}

async fn room_around(
	database: &Database,
	participant: &ParticipantKey,
) -> Result<Option<Room>, TranscriptStoreError> {
	let seats = database.conversations().seats(participant.conversation_id.clone()).await?;
	Ok(match seats.len() > 1 {
		true => Some(Room { reader: participant.bot_id.clone(), seats }),
		false => None,
	})
}

async fn replied_to_target(
	database: &Database,
	conversation_id: &str,
	prompt: &StoredMessage,
) -> Result<Option<RepliedTo>, TranscriptStoreError> {
	let Some(target_id) = prompt.replied_to_message_id.as_ref() else {
		return Ok(None);
	};
	let Some(target) =
		database.messages().message(conversation_id.to_owned(), target_id.clone()).await?
	else {
		return Ok(None);
	};
	let run = run_behind(database, &target).await?;

	Ok(Some(RepliedTo {
		uri: message_uri(conversation_id, &target.id),
		role: target.role,
		author_bot_id: target.author_bot_id,
		provider_session_id: run.provider_session_id,
		content: target.content,
	}))
}

pub async fn run_behind(
	database: &Database,
	stored: &StoredMessage,
) -> Result<MessageRun, TranscriptStoreError> {
	let runtime_session_id = match &stored.runtime_session_id {
		Some(session_id) => Some(session_id.clone()),
		None => database.messages().run_of_turn(stored.turn_id.clone()).await?,
	};
	let provider_session_id = match &runtime_session_id {
		Some(session_id) => database
			.runtime_context()
			.session(session_id.clone())
			.await?
			.and_then(|session| session.provider_session_id),
		None => None,
	};
	Ok(MessageRun { runtime_session_id, provider_session_id })
}

pub async fn capture_checkpoint(
	database: &Database,
	participant: ParticipantKey,
	runtime_session_id: String,
	created_at: i64,
) -> Result<Option<ContextCheckpoint>, TranscriptStoreError> {
	let conversation_id = participant.conversation_id.clone();
	let previous = database.runtime_context().latest_checkpoint(runtime_session_id.clone()).await?;
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
	let room = room_around(database, &participant).await?;
	let summary = folded_summary(
		previous.as_ref().map(|checkpoint| checkpoint.summary.as_str()),
		&folded,
		elided,
		room.as_ref(),
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

struct RepliedTo {
	uri: String,
	role: MessageRole,
	author_bot_id: Option<String>,
	provider_session_id: Option<String>,
	content: String,
}

struct Room {
	reader: String,
	seats: Vec<Seat>,
}

impl Room {
	fn seat(&self, bot_id: &str) -> Option<&Seat> {
		self.seats.iter().find(|seat| seat.bot_id == bot_id)
	}

	fn named(&self, bot_id: &str) -> Option<String> {
		let seat = self.seat(bot_id)?;
		Some(match (seat.bot_id == self.reader, seat.is_deleted) {
			(true, _) => format!("{} (you)", seat.name),
			(_, true) => format!("{} (gone)", seat.name),
			_ => seat.name.clone(),
		})
	}

	fn present(&self) -> impl Iterator<Item = &Seat> {
		self.seats.iter().filter(|seat| seat.left_at.is_none() && !seat.is_deleted)
	}

	fn roster(&self) -> String {
		self.present().map(|seat| self.seated_line(seat)).collect::<Vec<_>>().join("\n")
	}

	fn seated_line(&self, seat: &Seat) -> String {
		let mut line = format!("- {} — {}", seat.name, mention_of(&seat.bot_id));
		if seat.bot_id == self.reader {
			line.push_str(" — this is you");
		}
		if seat.is_lead() {
			line.push_str(" — holds the lead");
		}
		line
	}

	fn leads(&self) -> bool {
		self.present().any(|seat| seat.bot_id == self.reader && seat.is_lead())
	}

	fn note_about(&self, prompt: &str) -> Option<&'static str> {
		if prompt.contains(&mention_of(&self.reader)) {
			return Some(ADDRESSED_NOTE);
		}
		match mention_at(prompt).is_none() && self.leads() {
			true => Some(LEAD_NOTE),
			false => None,
		}
	}
}

fn mention_of(bot_id: &str) -> String {
	format!("{MENTION_OPEN}{bot_id}{MENTION_CLOSE}")
}

fn mention_at(text: &str) -> Option<(&str, &str, &str)> {
	let opened = text.find(MENTION_OPEN)?;
	let body = &text[opened + MENTION_OPEN.len()..];
	let closed = body.find(MENTION_CLOSE)?;
	Some((&text[..opened], &body[..closed], &body[closed + MENTION_CLOSE.len()..]))
}

fn spelled(room: Option<&Room>, text: &str) -> String {
	let Some(room) = room else {
		return text.to_owned();
	};
	let mut spelled = String::with_capacity(text.len());
	let mut rest = text;
	while let Some((before, bot_id, after)) = mention_at(rest) {
		spelled.push_str(before);
		match room.seat(bot_id) {
			Some(seat) => spelled.push_str(&format!("@{}", seat.name)),
			None => spelled.push_str(&mention_of(bot_id)),
		}
		rest = after;
	}
	spelled.push_str(rest);
	spelled
}

struct Parts<'a> {
	instructions: &'a str,
	summary: Option<&'a str>,
	replied_to: Option<&'a RepliedTo>,
	recent: &'a [StoredMessage],
	prompt: &'a str,
	room: Option<&'a Room>,
}

fn compose(parts: Parts<'_>) -> String {
	let mut sections: Vec<String> = Vec::new();
	push_section(&mut sections, INSTRUCTIONS_LABEL, parts.instructions);
	if let Some(room) = parts.room {
		push_section(&mut sections, ROOM_LABEL, &room.roster());
	}
	if let Some(summary) = parts.summary {
		push_section(&mut sections, SUMMARY_LABEL, &spelled(parts.room, summary));
	}
	if let Some(replied_to) = parts.replied_to {
		push_section(&mut sections, REPLY_LABEL, &quoted(replied_to, parts.room));
	}
	if !parts.recent.is_empty() {
		let spoken: Vec<String> =
			parts.recent.iter().map(|message| spoken(message, parts.room)).collect();
		push_section(&mut sections, RECENT_LABEL, &spoken.join("\n"));
	}
	if sections.is_empty() {
		return parts.prompt.to_owned();
	}
	push_section(&mut sections, PROMPT_LABEL, &spelled(parts.room, parts.prompt));
	if let Some(note) = parts.room.and_then(|room| room.note_about(parts.prompt)) {
		sections.push(note.to_owned());
	}
	sections.join("\n\n")
}

fn push_section(sections: &mut Vec<String>, label: &str, body: &str) {
	if body.trim().is_empty() {
		return;
	}
	sections.push(format!("{label}\n{body}"));
}

fn quoted(replied_to: &RepliedTo, room: Option<&Room>) -> String {
	let session = replied_to.provider_session_id.as_deref().unwrap_or(UNKNOWN_SESSION);
	let from = authored(replied_to.author_bot_id.as_deref(), room)
		.unwrap_or_else(|| quoted_speaker(replied_to.role).to_owned());
	format!(
		"uri: {}\nfrom: {from}\nclaude session: {session}\n{}",
		replied_to.uri,
		spelled(room, &replied_to.content)
	)
}

fn quoted_speaker(role: MessageRole) -> &'static str {
	match role {
		MessageRole::User => "user",
		MessageRole::Assistant => "you",
	}
}

fn spoken(message: &StoredMessage, room: Option<&Room>) -> String {
	format!("{}: {}", author_of(message, room), spelled(room, &message.content))
}

fn author_of(message: &StoredMessage, room: Option<&Room>) -> String {
	authored(message.author_bot_id.as_deref(), room)
		.unwrap_or_else(|| speaker(message.role).to_owned())
}

fn authored(author_bot_id: Option<&str>, room: Option<&Room>) -> Option<String> {
	room?.named(author_bot_id?)
}

fn speaker(role: MessageRole) -> &'static str {
	match role {
		MessageRole::User => "user",
		MessageRole::Assistant => "assistant",
	}
}

fn folded_summary(
	previous: Option<&str>,
	folded: &[StoredMessage],
	elided: bool,
	room: Option<&Room>,
) -> String {
	let mut lines: Vec<String> = Vec::new();
	if let Some(previous) = previous {
		lines.push(previous.to_owned());
	}
	if elided {
		lines.push(ELIDED.to_owned());
	}
	lines.extend(folded.iter().map(|message| summary_line(message, room)));
	let summary = lines.join("\n");
	let kept = last_chars(&summary, SUMMARY_LIMIT);
	if kept.len() == summary.len() {
		return summary;
	}
	format!("{ELIDED}\n{kept}")
}

fn summary_line(message: &StoredMessage, room: Option<&Room>) -> String {
	let flattened = message.content.split_whitespace().collect::<Vec<_>>().join(" ");
	format!("{}: {}", author_of(message, room), clipped(&flattened, SUMMARY_LINE_LIMIT))
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
			runtime_session_id: None,
		}
	}

	fn only(prompt: &str) -> Parts<'_> {
		Parts { instructions: "", summary: None, replied_to: None, recent: &[], prompt, room: None }
	}

	#[test]
	fn a_context_with_nothing_behind_it_is_the_prompt_itself() {
		assert_eq!(compose(only("hello")), "hello");
	}

	#[test]
	fn every_part_is_printed_once_and_the_prompt_comes_last() {
		let target = RepliedTo {
			uri: "opennest://c/c1/m/m2".to_owned(),
			role: MessageRole::User,
			author_bot_id: None,
			provider_session_id: Some("claude-9f3c".to_owned()),
			content: "what about the roof?".to_owned(),
		};
		let recent = [
			a_message(40, MessageRole::User, "and the walls?"),
			a_message(41, MessageRole::Assistant, "they are up"),
		];

		let context = compose(Parts {
			summary: Some("user: we are building a house"),
			replied_to: Some(&target),
			recent: &recent,
			..only("and now?")
		});

		assert_eq!(
			context,
			"The conversation so far:\nuser: we are building a house\n\n\
			The message this one replies to:\n\
			uri: opennest://c/c1/m/m2\nfrom: user\nclaude session: claude-9f3c\n\
			what about the roof?\n\n\
			The most recent messages:\nuser: and the walls?\nassistant: they are up\n\n\
			The new message:\nand now?"
		);
		assert_eq!(context.matches("and now?").count(), 1, "the prompt was printed twice");
	}

	#[test]
	fn the_instructions_of_a_conversation_open_the_context() {
		let room = a_room();
		let context = compose(Parts {
			instructions: "Speak in French.",
			summary: Some("Ada: we are building a house"),
			room: Some(&room),
			..only("and now?")
		});

		assert!(
			context.starts_with(INSTRUCTIONS_LABEL),
			"the instructions did not come first: {context}"
		);
		assert_eq!(section(&context, INSTRUCTIONS_LABEL), Some("Speak in French."));
	}

	#[test]
	fn a_conversation_with_no_instructions_reads_as_it_did() {
		let blank = compose(Parts { instructions: "   ", ..only("hello") });
		assert_eq!(blank, "hello", "an empty rule was announced");
	}

	#[test]
	fn a_part_with_no_words_in_it_is_left_out_with_its_heading() {
		let context = compose(Parts {
			summary: Some(""),
			recent: &[a_message(1, MessageRole::User, "hello")],
			..only("and now?")
		});

		assert!(!context.contains(SUMMARY_LABEL), "an empty summary was announced");
		assert!(context.contains(RECENT_LABEL), "the tail that was there went missing");
	}

	#[test]
	fn a_fold_carries_the_previous_summary_forward_and_adds_to_it() {
		let folded = [
			a_message(3, MessageRole::User, "and the roof?"),
			a_message(4, MessageRole::Assistant, "tiled"),
		];

		let summary = folded_summary(Some("user: we are building a house"), &folded, false, None);

		assert_eq!(summary, "user: we are building a house\nuser: and the roof?\nassistant: tiled");
	}

	#[test]
	fn a_summary_stays_within_its_bound_however_long_the_conversation_is() {
		let long = a_message(1, MessageRole::Assistant, &"word ".repeat(400));
		let line = summary_line(&long, None);
		assert!(
			line.chars().count()
				<= SUMMARY_LINE_LIMIT + "assistant: ".len() + ELIDED.chars().count(),
			"one message spent more than its share of the summary: {} characters",
			line.chars().count()
		);
		assert!(line.ends_with(ELIDED), "a clipped message did not say it was clipped");

		let previous = "user: said long ago\n".repeat(500);
		let summary =
			folded_summary(Some(&previous), &[a_message(2, MessageRole::User, "now")], false, None);

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
		let summary =
			folded_summary(None, &[a_message(9, MessageRole::User, "the rest")], true, None);

		assert_eq!(summary, "…\nuser: the rest");
	}

	#[test]
	fn the_stored_token_count_is_an_estimate_of_the_summary_it_stands_for() {
		assert_eq!(estimated_tokens(""), 0);
		assert_eq!(estimated_tokens(&"a".repeat(400)), 100);
	}

	fn a_seat(bot_id: &str, name: &str, role: &str) -> Seat {
		Seat {
			bot_id: bot_id.to_owned(),
			role: role.to_owned(),
			joined_at: 1,
			left_at: None,
			name: name.to_owned(),
			avatar_animal: AvatarAnimal::Cat,
			avatar_blot: None,
			avatar_image_path: None,
			is_deleted: false,
		}
	}

	fn a_room() -> Room {
		Room {
			reader: "nyx".to_owned(),
			seats: vec![a_seat("ada", "Ada", "lead"), a_seat("nyx", "Nyx", "assistant")],
		}
	}

	fn a_message_from(seq: i64, bot_id: &str, content: &str) -> StoredMessage {
		StoredMessage {
			author_bot_id: Some(bot_id.to_owned()),
			..a_message(seq, MessageRole::Assistant, content)
		}
	}

	#[test]
	fn a_room_of_several_bots_names_every_speaker_and_the_reader_itself() {
		let room = a_room();
		let recent =
			[a_message_from(1, "ada", "the roof is up"), a_message_from(2, "nyx", "the walls too")];

		let context = compose(Parts { recent: &recent, room: Some(&room), ..only("and now?") });

		assert_eq!(
			section(&context, RECENT_LABEL),
			Some("Ada: the roof is up\nNyx (you): the walls too"),
			"a shared window did not name who spoke: {context}"
		);
	}

	#[test]
	fn the_room_names_who_sits_in_it_the_token_reaching_them_and_the_lead() {
		let room = a_room();

		let context = compose(Parts { room: Some(&room), ..only("and now?") });

		assert_eq!(
			section(&context, ROOM_LABEL),
			Some("- Ada — <@ada> — holds the lead\n- Nyx — <@nyx> — this is you"),
			"the room was not described to the bot reading it: {context}"
		);
	}

	#[test]
	fn every_mention_of_the_window_reads_as_the_name_of_the_bot_it_points_at() {
		let room = a_room();
		let recent = [a_message_from(1, "ada", "<@nyx> can you take the walls?")];

		let context = compose(Parts {
			summary: Some("Ada: <@nyx> is on the roof"),
			recent: &recent,
			room: Some(&room),
			..only("<@ada> and now?")
		});

		assert_eq!(section(&context, RECENT_LABEL), Some("Ada: @Nyx can you take the walls?"));
		assert_eq!(section(&context, SUMMARY_LABEL), Some("Ada: @Nyx is on the roof"));
		assert_eq!(section(&context, PROMPT_LABEL), Some("@Ada and now?"));
	}

	#[test]
	fn a_message_naming_the_reader_tells_it_the_turn_is_its_own() {
		let room = a_room();

		let context = compose(Parts { room: Some(&room), ..only("<@nyx> your turn") });

		assert!(context.ends_with(ADDRESSED_NOTE), "the bot addressed was not told: {context}");
	}

	#[test]
	fn a_message_naming_nobody_tells_the_lead_and_only_the_lead_that_it_is_expected() {
		let seats = a_room().seats;
		let lead = Room { reader: "ada".to_owned(), seats };

		let expected = compose(Parts { room: Some(&lead), ..only("and now?") });
		let quiet = compose(Parts { room: Some(&a_room()), ..only("and now?") });
		let addressed = compose(Parts { room: Some(&lead), ..only("<@nyx> and now?") });

		assert!(expected.ends_with(LEAD_NOTE), "the lead was not told it is expected: {expected}");
		assert!(!quiet.contains(LEAD_NOTE), "a bot without the lead was told to answer: {quiet}");
		assert!(
			!addressed.contains(LEAD_NOTE),
			"the lead was told to answer a message naming someone else: {addressed}"
		);
	}

	#[test]
	fn a_bot_that_left_or_is_gone_stays_out_of_the_room_and_keeps_its_name_on_what_it_wrote() {
		let mut left = a_seat("old", "Old", "assistant");
		left.left_at = Some(9);
		let mut gone = a_seat("ghost", "Ghost", "assistant");
		gone.is_deleted = true;
		let mut room = a_room();
		room.seats.extend([left, gone]);
		let recent = [
			a_message_from(1, "old", "I laid the floor"),
			a_message_from(2, "ghost", "and I left"),
		];

		let context = compose(Parts { recent: &recent, room: Some(&room), ..only("and now?") });

		assert_eq!(
			section(&context, ROOM_LABEL),
			Some("- Ada — <@ada> — holds the lead\n- Nyx — <@nyx> — this is you"),
			"a bot that is no longer there was seated in the room: {context}"
		);
		assert_eq!(
			section(&context, RECENT_LABEL),
			Some("Old: I laid the floor\nGhost (gone): and I left"),
			"what a departed bot wrote lost its author: {context}"
		);
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

	async fn a_run_of(database: &Database, conversation_id: &str, bot_id: &str) -> String {
		database
			.runtime_context()
			.open(participant_of(conversation_id, bot_id), 1, None)
			.await
			.expect("the run is opened")
			.id
	}

	async fn another_bot(database: &Database, conversation_id: &str, id: &'static str) {
		let conversation_id = conversation_id.to_owned();
		database
			.call(move |connection| {
				connection.execute(
					"INSERT INTO bots (id, space_id, name, model, created_at)
						VALUES (?1, 'personal', 'Second', 'sonnet', 1)",
					rusqlite::params![id],
				)?;
				connection.execute(
					"INSERT INTO conversation_participants
						(conversation_id, bot_id, role, joined_at, join_seq)
						VALUES (?1, ?2, 'assistant', 1, 1)",
					rusqlite::params![conversation_id, id],
				)?;
				Ok(())
			})
			.await
			.expect("the second bot joins");
	}

	async fn ruled(database: &Database, conversation_id: &str, instructions: &'static str) {
		let conversation_id = conversation_id.to_owned();
		database
			.call(move |connection| {
				connection.execute(
					"UPDATE conversations SET instructions = ?2 WHERE id = ?1",
					rusqlite::params![conversation_id, instructions],
				)?;
				Ok(())
			})
			.await
			.expect("the conversation is given its rules");
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
			.finalize_message(id, TerminalState::Complete, None)
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

	const PROVIDER_SESSION: &str = "claude-9f3c";

	async fn ran(database: &Database, conversation_id: &str, message_id: &'static str) {
		let participant = participant_of(conversation_id, "default");
		let session = database
			.runtime_context()
			.open(participant.clone(), 1, None)
			.await
			.expect("the run is opened");
		let session_id = session.id.clone();
		database
			.runtime_context()
			.record_provider_session(participant, session.id, PROVIDER_SESSION.to_owned())
			.await
			.expect("the provider names its session");
		database
			.call(move |connection| {
				connection.execute(
					"UPDATE messages SET runtime_session_id = ?2 WHERE id = ?1",
					rusqlite::params![message_id, session_id],
				)?;
				Ok(())
			})
			.await
			.expect("the message names its run");
	}

	async fn a_long_message(database: &Database, conversation_id: &str, id: &str) -> String {
		let content = "a question about the roof ".repeat(30).trim_end().to_owned();
		database
			.messages()
			.append_user_message(NewUserMessage {
				id: id.to_owned(),
				conversation_id: conversation_id.to_owned(),
				turn_id: TURN.to_owned(),
				author_bot_id: None,
				replied_to_message_id: None,
				content: content.clone(),
				created_at: 98,
			})
			.await
			.expect("the long message is appended");
		content
	}

	fn quoting(
		conversation_id: &str,
		message_id: &str,
		from: &str,
		session: &str,
		content: &str,
	) -> String {
		format!(
			"uri: {}\nfrom: {from}\nclaude session: {session}\n{content}",
			message_uri(conversation_id, message_id)
		)
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
		let run = a_run_of(&database, &conversation, "default").await;
		spoken_so_far(&database, &conversation, SPOKEN).await;
		capture_checkpoint(&database, participant_of(&conversation, "default"), run.clone(), 7)
			.await
			.expect("the checkpoint is taken");
		prompt(&database, &conversation, "p1", None).await;

		let context = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run,
			"p1".to_owned(),
		)
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
	async fn the_instructions_of_a_conversation_reach_the_bot_and_follow_their_edits() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		let participant = participant_of(&conversation, "default");
		let run = a_run_of(&database, &conversation, "default").await;
		ruled(&database, &conversation, "Speak in French.").await;
		spoken_so_far(&database, &conversation, SPOKEN).await;
		let checkpoint = capture_checkpoint(&database, participant.clone(), run.clone(), 7)
			.await
			.expect("the checkpoint is taken")
			.expect("something to fold");
		prompt(&database, &conversation, "p1", None).await;

		let first = bounded_context(&database, participant.clone(), run.clone(), "p1".to_owned())
			.await
			.expect("the context is rebuilt");

		assert!(
			first.starts_with(INSTRUCTIONS_LABEL),
			"the instructions did not open the context: {first}"
		);
		assert_eq!(section(&first, INSTRUCTIONS_LABEL), Some("Speak in French."));
		assert!(
			!checkpoint.summary.contains("Speak in French."),
			"the instructions were folded into the summary"
		);

		ruled(&database, &conversation, "Speak in Dutch.").await;
		prompt(&database, &conversation, "p2", None).await;
		let second = bounded_context(&database, participant.clone(), run.clone(), "p2".to_owned())
			.await
			.expect("the context is rebuilt");

		assert_eq!(section(&second, INSTRUCTIONS_LABEL), Some("Speak in Dutch."));
		assert_eq!(
			database
				.runtime_context()
				.latest_checkpoint(run)
				.await
				.expect("the latest checkpoint")
				.map(|found| found.summary),
			Some(checkpoint.summary),
			"an edit to the instructions rewrote what was already folded"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_reply_names_its_target_whether_or_not_the_tail_still_holds_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		spoken_so_far(&database, &conversation, SPOKEN).await;
		prompt(&database, &conversation, "p1", Some("m1")).await;
		prompt(&database, &conversation, "p2", Some("m30")).await;
		let run = a_run_of(&database, &conversation, "default").await;

		let old = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run.clone(),
			"p1".to_owned(),
		)
		.await
		.expect("the context is rebuilt");
		let recent = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run,
			"p2".to_owned(),
		)
		.await
		.expect("the context is rebuilt");

		assert_eq!(
			section(&old, REPLY_LABEL),
			Some(quoting(&conversation, "m1", "user", "unknown", "message 1").as_str()),
			"an answer to an old message lost its target: {old}"
		);
		assert_eq!(
			section(&recent, REPLY_LABEL),
			Some(quoting(&conversation, "m30", "you", "unknown", "message 30").as_str()),
			"a target the tail already holds was not named: {recent}"
		);
		assert!(
			section(&recent, RECENT_LABEL)
				.is_some_and(|tail| tail.lines().any(|line| line == "assistant: message 30")),
			"the tail lost the message being answered: {recent}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_reply_names_the_run_behind_the_message_it_points_at() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		spoken_so_far(&database, &conversation, SPOKEN).await;
		ran(&database, &conversation, "m30").await;
		prompt(&database, &conversation, "p1", Some("m30")).await;
		let run = a_run_of(&database, &conversation, "default").await;

		let context = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run,
			"p1".to_owned(),
		)
		.await
		.expect("the context is rebuilt");

		assert_eq!(
			section(&context, REPLY_LABEL),
			Some(quoting(&conversation, "m30", "you", PROVIDER_SESSION, "message 30").as_str()),
			"the run behind the quoted message went unnamed: {context}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_quoted_message_is_carried_whole_however_long_it_is() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		let content = a_long_message(&database, &conversation, "long").await;
		prompt(&database, &conversation, "p1", Some("long")).await;

		let run = a_run_of(&database, &conversation, "default").await;

		let context = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run,
			"p1".to_owned(),
		)
		.await
		.expect("the context is rebuilt");

		assert_eq!(
			section(&context, REPLY_LABEL),
			Some(quoting(&conversation, "long", "user", "unknown", &content).as_str()),
			"a long quoted message was cut short"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_message_replying_to_nothing_carries_no_section() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		spoken_so_far(&database, &conversation, 2).await;
		prompt(&database, &conversation, "p1", None).await;

		let run = a_run_of(&database, &conversation, "default").await;

		let context = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run,
			"p1".to_owned(),
		)
		.await
		.expect("the context is rebuilt");

		assert!(
			!context.contains(REPLY_LABEL),
			"a message replying to nothing was quoted: {context}"
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
		let run = a_run_of(&database, &conversation, "default").await;
		spoken_so_far(&database, &conversation, SPOKEN).await;
		let first = capture_checkpoint(&database, participant.clone(), run.clone(), 7)
			.await
			.expect("the first checkpoint")
			.expect("something to fold");

		let nothing_new = capture_checkpoint(&database, participant.clone(), run.clone(), 8)
			.await
			.expect("the checkpoint is considered");
		for index in SPOKEN + 1..=SPOKEN + 20 {
			say(&database, &conversation, index).await;
		}
		let second = capture_checkpoint(&database, participant.clone(), run.clone(), 9)
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
				.latest_checkpoint(run)
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
		let run = a_run_of(&database, &conversation, "default").await;
		spoken_so_far(&database, &conversation, SPOKEN).await;
		let kept = capture_checkpoint(&database, participant.clone(), run.clone(), 7)
			.await
			.expect("the first checkpoint")
			.expect("something to fold");
		for index in SPOKEN + 1..=SPOKEN + 20 {
			say(&database, &conversation, index).await;
		}

		let refused =
			capture_checkpoint(&database, participant.clone(), "a run of nobody's".to_owned(), 9)
				.await;

		assert!(refused.is_err(), "a checkpoint naming a run of nobody's was stored: {refused:?}");
		assert_eq!(
			database
				.runtime_context()
				.latest_checkpoint(run.clone())
				.await
				.expect("the latest checkpoint")
				.map(|checkpoint| (checkpoint.id.clone(), checkpoint.summary)),
			Some((kept.id, kept.summary)),
			"a refused capture moved the recovery point"
		);

		prompt(&database, &conversation, "p1", None).await;
		let context = bounded_context(&database, participant, run, "p1".to_owned())
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
		let first_run = a_run_of(&database, &conversation, "default").await;
		let second_run = a_run_of(&database, &conversation, "second").await;

		capture_checkpoint(
			&database,
			participant_of(&conversation, "default"),
			first_run.clone(),
			7,
		)
		.await
		.expect("the first bot's checkpoint")
		.expect("something to fold");
		prompt(&database, &conversation, "p1", None).await;
		let first = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			first_run,
			"p1".to_owned(),
		)
		.await
		.expect("the context is rebuilt");
		let second = bounded_context(
			&database,
			participant_of(&conversation, "second"),
			second_run.clone(),
			"p1".to_owned(),
		)
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
				.latest_checkpoint(second_run)
				.await
				.expect("the second bot's checkpoint"),
			None,
			"a checkpoint reached across participants"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn said_by(database: &Database, conversation_id: &str, bot_id: &str, content: &str) {
		let id = "s1".to_owned();
		database
			.messages()
			.open_assistant_message(NewAssistantMessage {
				id: id.clone(),
				conversation_id: conversation_id.to_owned(),
				turn_id: TURN.to_owned(),
				author_bot_id: Some(bot_id.to_owned()),
				replied_to_message_id: None,
				created_at: 50,
			})
			.await
			.expect("the reply is opened");
		database
			.messages()
			.append_text(id.clone(), content.to_owned())
			.await
			.expect("the reply streams");
		database
			.messages()
			.finalize_message(id, TerminalState::Complete, None)
			.await
			.expect("the reply ends");
	}

	#[tokio::test]
	async fn a_bot_sharing_a_conversation_is_told_the_room_and_reads_names_in_place_of_tokens() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		another_bot(&database, &conversation, "second").await;
		said_by(&database, &conversation, "second", "<@default> what about the roof?").await;
		prompt(&database, &conversation, "p1", Some("s1")).await;

		let run = a_run_of(&database, &conversation, "default").await;

		let context = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run,
			"p1".to_owned(),
		)
		.await
		.expect("the context is rebuilt");

		assert_eq!(
			section(&context, ROOM_LABEL),
			Some("- Claude — <@default> — this is you\n- Second — <@second>"),
			"the room went undescribed: {context}"
		);
		assert_eq!(
			section(&context, RECENT_LABEL),
			Some("Second: @Claude what about the roof?"),
			"the shared window lost its author or its mention: {context}"
		);
		assert!(
			section(&context, REPLY_LABEL).is_some_and(|quoted| quoted.contains("from: Second")),
			"the quoted message was not named after the bot that wrote it: {context}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_conversation_of_a_single_bot_is_left_reading_as_it_did() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;
		spoken_so_far(&database, &conversation, 2).await;
		prompt(&database, &conversation, "p1", None).await;

		let run = a_run_of(&database, &conversation, "default").await;

		let context = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run,
			"p1".to_owned(),
		)
		.await
		.expect("the context is rebuilt");

		assert!(!context.contains(ROOM_LABEL), "a chat of one bot was given a room: {context}");
		assert_eq!(
			section(&context, RECENT_LABEL),
			Some("user: message 1\nassistant: message 2"),
			"a chat of one bot stopped reading as it did: {context}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_context_for_a_prompt_the_file_does_not_hold_is_refused() {
		let dir = temp_dir();
		let database = open(&dir);
		let conversation = a_conversation(&database).await;

		let run = a_run_of(&database, &conversation, "default").await;

		let refused = bounded_context(
			&database,
			participant_of(&conversation, "default"),
			run,
			"no such message".to_owned(),
		)
		.await;

		assert!(refused.is_err(), "a context was built around a prompt nobody wrote: {refused:?}");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
