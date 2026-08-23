//! The preferences record as the frontend meets it: over IPC, in JSON.
//!
//! What a repository test cannot see is exactly what fails here — a command left
//! out of the registry, a field renamed on the way out, a refusal flattened into a
//! string, and above all a picture the bot sweep does not know is referenced. Every
//! call goes through `get_ipc_response`, so what is asserted is the JSON itself.
//!
//! The database is the real one, opened through `db::bootstrap` the way the launch
//! opens it, and every test takes a `Home` of its own so it writes where no
//! neighbour is reading — and gets it back off the disk however it ends.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};

use opennest_app::commands::invoke_handler;
use opennest_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};

const BOT: &str = "default";

/// One test's application data directory: an identifier no run and no neighbour
/// claims twice, and the directory it resolves to taken away when the test ends —
/// returned from or panicked out of, since `Drop` runs either way. Where the
/// identifier lands is read from the resolver the commands read it from, rather
/// than rebuilt from platform rules.
struct Home {
	identifier: String,
	dir: PathBuf,
}

impl Home {
	fn new() -> Self {
		static CLAIMED: AtomicUsize = AtomicUsize::new(0);
		let identifier = format!(
			"com.opennest.user-commands-{}-{}",
			std::process::id(),
			CLAIMED.fetch_add(1, Ordering::Relaxed)
		);
		let dir = host(&identifier).path().app_data_dir().expect("data dir");
		Self { identifier, dir }
	}

	fn app(&self) -> App<MockRuntime> {
		let app = host(&self.identifier);
		app.manage(db::bootstrap(app.handle()));
		app
	}
}

impl Drop for Home {
	fn drop(&mut self) {
		let _ = std::fs::remove_dir_all(&self.dir);
	}
}

/// Built and no further: it carries the identifier every path below is resolved
/// from, and without a database under it nothing has touched the disk yet.
fn host(identifier: &str) -> App<MockRuntime> {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = identifier.into();
	mock_builder().invoke_handler(invoke_handler()).build(context).expect("app builds")
}

fn app_without_a_database() -> App<MockRuntime> {
	mock_builder()
		.invoke_handler(invoke_handler())
		.manage(db::DatabaseState::Err(db::DatabaseError::AppDataDir))
		.build(mock_context(noop_assets()))
		.expect("app builds")
}

fn window(app: &App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app, "main", Default::default()).build().expect("window builds")
}

fn call(window: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: cmd.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: body.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
}

fn avatar_dir(app: &App<MockRuntime>) -> PathBuf {
	app.path().app_data_dir().expect("data dir").join("avatars")
}

fn stored_avatars(app: &App<MockRuntime>) -> Vec<String> {
	let Ok(entries) = std::fs::read_dir(avatar_dir(app)) else {
		return Vec::new();
	};
	let mut names: Vec<String> =
		entries.flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect();
	names.sort();
	names
}

/// Built rather than checked in, so the bytes and the decoder that has to read
/// them cannot drift apart.
fn a_png(width: u32, height: u32) -> Vec<u8> {
	let mut canvas = image::RgbImage::new(width, height);
	for (x, y, pixel) in canvas.enumerate_pixels_mut() {
		*pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 64]);
	}
	let mut encoded = std::io::Cursor::new(Vec::new());
	image::DynamicImage::ImageRgb8(canvas)
		.write_to(&mut encoded, image::ImageFormat::Png)
		.expect("the fixture encodes");
	encoded.into_inner()
}

fn a_record(picture: Value) -> Value {
	json!({
		"displayName": "Nyx",
		"profilePicturePath": picture,
		"colorScheme": "dark",
		"palette": "moss",
		"language": "fr",
		"notifyOnQuestion": false,
		"notifyOnPermission": true,
		"notifyOnFinishedTurn": false,
	})
}

fn read(window: &WebviewWindow<MockRuntime>) -> Value {
	call(window, "user_preferences", json!({})).expect("the record")
}

fn a_stored_picture(window: &WebviewWindow<MockRuntime>) -> String {
	call(window, "user_set_profile_picture", json!({ "bytes": a_png(60, 24) }))
		.expect("the picture is stored")["profilePicturePath"]
		.as_str()
		.expect("a path crossed")
		.to_owned()
}

/// A bot wearing a picture of its own, so every sweep below runs against a
/// directory holding more than the record's file.
fn a_bot_wearing_a_picture(window: &WebviewWindow<MockRuntime>) -> String {
	call(window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	call(window, "conversation_set_bot_avatar_image", json!({ "id": BOT, "bytes": a_png(30, 30) }))
		.expect("the bot's picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned()
}

/// The command is registered — an unregistered one is not refused, it is not
/// answered at all — and the reason there is no database survives the crossing
/// with its shape.
#[test]
fn a_host_without_a_database_answers_every_preferences_command_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);
	let unavailable = Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }));

	assert_eq!(call(&window, "user_preferences", json!({})), unavailable);
	assert_eq!(
		call(&window, "user_set_preferences", json!({ "preferences": a_record(Value::Null) })),
		unavailable
	);
	assert_eq!(
		call(&window, "user_set_profile_picture", json!({ "bytes": a_png(24, 24) })),
		unavailable
	);
}

/// The record the app opens on, before anyone has chosen anything.
#[test]
fn a_record_nobody_has_written_crosses_as_the_defaults() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	assert_eq!(
		read(&window),
		json!({
			"displayName": "",
			"profilePicturePath": null,
			"colorScheme": "system",
			"palette": "amber",
			"language": null,
			"notifyOnQuestion": true,
			"notifyOnPermission": true,
			"notifyOnFinishedTurn": true,
		})
	);
}

#[test]
fn a_written_record_is_answered_and_read_back_whole() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let answered =
		call(&window, "user_set_preferences", json!({ "preferences": a_record(Value::Null) }))
			.expect("the record is stored");

	assert_eq!(answered, a_record(Value::Null));
	assert_eq!(read(&window), a_record(Value::Null));
}

/// A word outside the three is refused before the command is entered, so nothing
/// reaches the file.
#[test]
fn a_scheme_outside_the_vocabulary_never_reaches_the_record() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut sepia = a_record(Value::Null);
	sepia["colorScheme"] = json!("sepia");

	assert!(
		call(&window, "user_set_preferences", json!({ "preferences": sepia })).is_err(),
		"a scheme this build cannot paint was accepted"
	);
	assert_eq!(read(&window)["colorScheme"], json!("system"));
}

/// Bytes in, one normalised file beside the database, and a path the webview can
/// be pointed at — the same guarantee a bot's picture carries.
#[test]
fn an_uploaded_picture_is_stored_squared_and_crosses_as_a_path() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let recorded = a_stored_picture(&window);

	assert_eq!(
		Path::new(&recorded).parent(),
		Some(avatar_dir(&app).as_path()),
		"a picture was stored outside the directory the asset scope covers"
	);
	assert_eq!(Path::new(&recorded).extension().and_then(|it| it.to_str()), Some("png"));
	let stored = image::load_from_memory_with_format(
		&std::fs::read(&recorded).expect("the stored file is readable"),
		image::ImageFormat::Png,
	)
	.expect("the stored file decodes as png");
	assert_eq!(image::GenericImageView::dimensions(&stored), (512, 512));
	assert_eq!(read(&window)["profilePicturePath"], json!(recorded));
}

/// The rule the whole feature turns on: the sweep a bot write runs is told about
/// the record's picture too, so writing a bot never takes it off the disk.
#[test]
fn a_bot_write_leaves_the_record_its_own_picture() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let worn = a_bot_wearing_a_picture(&window);
	let mine = a_stored_picture(&window);

	call(
		&window,
		"conversation_create_bot",
		json!({ "identity": {
			"name": "Ada",
			"title": "",
			"model": "sonnet",
			"avatarAnimal": "owl",
			"avatarBlot": null,
			"avatarImagePath": null,
			"workingDir": null,
			"instructions": "",
			"deniedTools": [],
		} }),
	)
	.expect("the bot is created");

	assert!(Path::new(&mine).exists(), "a bot write swept the record's own picture away");
	assert!(Path::new(&worn).exists(), "a bot write swept another bot's picture away");
	assert_eq!(read(&window)["profilePicturePath"], json!(mine));
	assert_eq!(stored_avatars(&app).len(), 2);
}

/// Replacing leaves exactly one file, and the bot's stays where it is.
#[test]
fn replacing_the_picture_leaves_one_file_behind_and_spares_the_bots() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let worn = a_bot_wearing_a_picture(&window);
	let first = a_stored_picture(&window);

	let second = a_stored_picture(&window);

	assert_ne!(first, second, "a replacement was written over the file it replaced");
	assert!(!Path::new(&first).exists(), "the replaced picture stayed behind");
	assert!(Path::new(&second).exists(), "the replacement is not there");
	assert!(Path::new(&worn).exists(), "the bot lost its picture to the record's write");
	assert_eq!(stored_avatars(&app).len(), 2);
}

/// A record written with no picture is a picture taken off, and the sweep that
/// follows takes the file with it.
#[test]
fn a_record_written_without_a_picture_takes_the_file_with_it() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let worn = a_bot_wearing_a_picture(&window);
	let mine = a_stored_picture(&window);

	call(&window, "user_set_preferences", json!({ "preferences": a_record(Value::Null) }))
		.expect("the record is stored");

	assert_eq!(read(&window)["profilePicturePath"], json!(null));
	assert!(!Path::new(&mine).exists(), "a picture taken off the record stayed on the disk");
	assert!(Path::new(&worn).exists(), "the bot lost its picture to the record's write");
}

/// Echoing the path back is how a record keeps the picture it already had.
#[test]
fn a_record_written_with_the_path_it_was_handed_keeps_its_picture() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mine = a_stored_picture(&window);

	let answered =
		call(&window, "user_set_preferences", json!({ "preferences": a_record(json!(mine)) }))
			.expect("the record is stored");

	assert_eq!(answered["profilePicturePath"], json!(mine));
	assert!(Path::new(&mine).exists(), "an echoed path lost the file it named");
}

/// Three refusals, three reasons, and the same nothing behind each: no file, and a
/// record still pointing where it pointed.
#[test]
fn a_picture_the_host_refuses_leaves_the_record_on_the_one_it_held() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let held = a_stored_picture(&window);

	assert_eq!(
		call(&window, "user_set_profile_picture", json!({ "bytes": b"GIF89a\0\0\0\0\0\0" })),
		Err(json!({ "kind": "rejectedProfilePicture", "reason": { "kind": "unknownFormat" } })),
		"a format this build cannot decode was accepted"
	);
	let limit = 5 * 1024 * 1024;
	assert_eq!(
		call(&window, "user_set_profile_picture", json!({ "bytes": vec![0u8; limit + 1] })),
		Err(json!({
			"kind": "rejectedProfilePicture",
			"reason": { "kind": "tooLarge", "bytes": limit + 1, "limit": limit }
		}))
	);
	let torn = call(&window, "user_set_profile_picture", json!({ "bytes": a_png(40, 40)[..24] }));
	assert!(
		matches!(&torn, Err(refusal) if refusal["kind"] == json!("rejectedProfilePicture")
			&& refusal["reason"]["kind"] == json!("undecodable")),
		"bytes that claimed a format and were not one crossed as something else: {torn:?}"
	);

	assert_eq!(read(&window)["profilePicturePath"], json!(held), "a refusal moved the record");
	assert!(Path::new(&held).exists(), "a refusal took the picture the record held");
	assert_eq!(stored_avatars(&app).len(), 1, "a refused picture reached the disk");
}
