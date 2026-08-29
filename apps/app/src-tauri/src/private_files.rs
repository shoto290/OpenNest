
use std::fs;
use std::path::Path;

const DIR_MODE: u32 = 0o700;
const FILE_MODE: u32 = 0o600;

pub fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	if let Some(dir) = path.parent() {
		create_dir(dir)?;
	}
	create_owned(path, bytes)
}

pub fn replace(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	let dir = path.parent().unwrap_or(Path::new("."));
	create_dir(dir)?;

	let staged = dir.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
	match staged_then_renamed(&staged, path, bytes) {
		Ok(()) => Ok(()),
		Err(error) => {
			let _ = fs::remove_file(&staged);
			Err(error)
		}
	}
}

fn staged_then_renamed(staged: &Path, path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	filled(staged, bytes)?;
	fs::rename(staged, path)?;
	sync_dir(path.parent().unwrap_or(Path::new(".")));
	Ok(())
}

#[cfg(unix)]
fn filled(staged: &Path, bytes: &[u8]) -> std::io::Result<()> {
	use std::io::Write;
	use std::os::unix::fs::OpenOptionsExt;

	let mut file =
		fs::OpenOptions::new().write(true).create_new(true).mode(FILE_MODE).open(staged)?;
	if interrupted() {
		file.write_all(&bytes[..bytes.len() / 2])?;
		return Err(stopped_partway());
	}
	file.write_all(bytes)?;
	file.sync_all()
}

#[cfg(not(unix))]
fn filled(staged: &Path, bytes: &[u8]) -> std::io::Result<()> {
	use std::io::Write;

	let mut file = fs::OpenOptions::new().write(true).create_new(true).open(staged)?;
	if interrupted() {
		file.write_all(&bytes[..bytes.len() / 2])?;
		return Err(stopped_partway());
	}
	file.write_all(bytes)?;
	file.sync_all()
}

#[cfg(unix)]
fn sync_dir(dir: &Path) {
	if let Ok(handle) = fs::File::open(dir) {
		let _ = handle.sync_all();
	}
}

#[cfg(not(unix))]
fn sync_dir(_dir: &Path) {}

#[cfg(unix)]
pub fn create_dir(path: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::DirBuilderExt;
	fs::DirBuilder::new().recursive(true).mode(DIR_MODE).create(path)
}

#[cfg(not(unix))]
pub fn create_dir(path: &Path) -> std::io::Result<()> {
	fs::create_dir_all(path)
}

#[cfg(unix)]
fn create_owned(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	use std::io::Write;
	use std::os::unix::fs::OpenOptionsExt;

	let mut file =
		fs::OpenOptions::new().write(true).create_new(true).mode(FILE_MODE).open(path)?;
	if interrupted() {
		file.write_all(&bytes[..bytes.len() / 2])?;
		return Err(stopped_partway());
	}
	file.write_all(bytes)
}

#[cfg(not(unix))]
fn create_owned(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	if interrupted() {
		fs::write(path, &bytes[..bytes.len() / 2])?;
		return Err(stopped_partway());
	}
	fs::write(path, bytes)
}

fn stopped_partway() -> std::io::Error {
	std::io::Error::other("the write stopped partway")
}

#[cfg(test)]
thread_local! {
	static WRITES_BEFORE_INTERRUPT: std::cell::Cell<Option<usize>> =
		const { std::cell::Cell::new(None) };
}

#[cfg(test)]
pub fn interrupt_the_write_after(writes: usize) {
	WRITES_BEFORE_INTERRUPT.with(|left| left.set(Some(writes)));
}

#[cfg(test)]
fn interrupted() -> bool {
	WRITES_BEFORE_INTERRUPT.with(|left| match left.get() {
		Some(0) => {
			left.set(None);
			true
		}
		Some(remaining) => {
			left.set(Some(remaining - 1));
			false
		}
		None => false,
	})
}

#[cfg(not(test))]
fn interrupted() -> bool {
	false
}

#[cfg(test)]
mod replacement_tests {
	use super::*;

	fn a_file() -> std::path::PathBuf {
		let dir = std::env::temp_dir().join(format!("opennest-atomic-{}", uuid::Uuid::new_v4()));
		fs::create_dir_all(&dir).expect("temp dir");
		dir.join("held.json")
	}

	#[test]
	fn a_replacement_that_finishes_lands_whole() {
		let path = a_file();
		replace(&path, b"first").expect("writes");
		replace(&path, b"second and longer").expect("replaces");

		assert_eq!(fs::read(&path).expect("reads"), b"second and longer");
	}

	#[test]
	fn an_interrupted_replacement_leaves_the_target_untouched() {
		let path = a_file();
		replace(&path, b"the value that was already there").expect("writes");

		interrupt_the_write_after(0);
		assert!(replace(&path, b"a half written replacement").is_err());

		assert_eq!(fs::read(&path).expect("reads"), b"the value that was already there");
	}

	#[test]
	fn an_interrupted_replacement_leaves_no_staged_file_behind() {
		let path = a_file();
		replace(&path, b"the value that was already there").expect("writes");

		interrupt_the_write_after(0);
		let _ = replace(&path, b"a half written replacement");

		let left: Vec<_> = fs::read_dir(path.parent().expect("dir"))
			.expect("lists")
			.flatten()
			.map(|entry| entry.file_name())
			.collect();
		assert_eq!(left, vec![std::ffi::OsString::from("held.json")]);
	}

	#[cfg(unix)]
	#[test]
	fn a_replacement_keeps_the_owner_only_mode() {
		use std::os::unix::fs::PermissionsExt;

		let path = a_file();
		replace(&path, b"first").expect("writes");
		replace(&path, b"second").expect("replaces");

		let mode = fs::metadata(&path).expect("reads").permissions().mode();
		assert_eq!(mode & 0o777, FILE_MODE);
	}
}
