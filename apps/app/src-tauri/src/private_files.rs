//! Every file this host keeps for its user, created the one way it is allowed to
//! be: owner-only, in an owner-only directory made on the first write.
//!
//! Shared by [`crate::avatars`] and [`crate::attachments`] because the rule has
//! nothing to do with what either stores. What a user picked off their disk is
//! theirs, and the app data directory is not a place to publish it from.
//!
//! The mode is part of creating the thing rather than something set on it after.
//! A file created under the umask and narrowed a moment later is a file anybody on
//! the machine could open in between, and that window is the whole of the attack —
//! so `mkdir` and `open` are each told the mode to create with, and nothing here
//! ever holds something wider than it ends up.

use std::fs;
use std::path::Path;

/// The modes the database file already takes. Neither has a group or an other bit
/// for a umask to leave behind, so what is asked for is what is created.
const DIR_MODE: u32 = 0o700;
const FILE_MODE: u32 = 0o600;

/// What a file this host writes to be *run* ends up as. The same owner and nobody
/// else, plus the one bit that makes a script a command.
pub const RUN_MODE: u32 = 0o700;

/// The bytes on the disk, owner-only from the moment the file exists, in a
/// directory made if this is the first file to go in it.
///
/// One write of a whole file, so there is no state where half of what a user
/// picked has been *accepted* — but a write that stops partway still leaves the
/// file it created, and taking that path back is the caller's: the caller is the
/// one that named it and the one that knows what else the call wrote.
pub fn write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	if let Some(dir) = path.parent() {
		create_dir(dir)?;
	}
	create_owned(path, bytes)
}

/// The bytes on the disk under a name the caller derives rather than mints, so a
/// path already taken is the previous version of this very file and not a collision:
/// it is truncated and written again. Owner-only when this call is the one to create
/// it — a file that was already there keeps the mode it has, which is the honest
/// answer for one a user may have put there themselves.
///
/// [`write`] is the other half of the pair and stays `create_new`: what a user picked
/// off their disk is stored under a minted name, and overwriting one of those would
/// mean two uploads had collided.
pub fn replace(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	if let Some(dir) = path.parent() {
		create_dir(dir)?;
	}
	replace_owned(path, bytes)
}

/// The same write, for a file that is run rather than read. The one place this module
/// widens a mode after creating something, and it is allowed to: the file goes from
/// owner-read-write to owner-read-write-execute and never past its own owner, so
/// there is no moment in between when anybody else could open it.
///
/// The bit is set on every write rather than only on the first, so a file that
/// arrived without one — restored from a backup, copied across a disk that carries
/// none — is a command again afterwards.
pub fn replace_runnable(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	replace(path, bytes)?;
	run_owned(path)
}

#[cfg(unix)]
fn run_owned(path: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;
	fs::set_permissions(path, fs::Permissions::from_mode(RUN_MODE))
}

#[cfg(not(unix))]
fn run_owned(_path: &Path) -> std::io::Result<()> {
	Ok(())
}

#[cfg(unix)]
fn replace_owned(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	use std::io::Write;
	use std::os::unix::fs::OpenOptionsExt;

	let mut file = fs::OpenOptions::new()
		.write(true)
		.create(true)
		.truncate(true)
		.mode(FILE_MODE)
		.open(path)?;
	file.write_all(bytes)
}

#[cfg(not(unix))]
fn replace_owned(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
	fs::write(path, bytes)
}

/// The directory and every missing parent of it, each created owner-only —
/// `recursive` hands the same mode down, so a caller's own directory above the leaf
/// is not left under the umask. Idempotent, which is what makes it safe to run
/// before every write: a directory already there is left exactly as it is.
#[cfg(unix)]
pub fn create_dir(path: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::DirBuilderExt;
	fs::DirBuilder::new().recursive(true).mode(DIR_MODE).create(path)
}

#[cfg(not(unix))]
pub fn create_dir(path: &Path) -> std::io::Result<()> {
	fs::create_dir_all(path)
}

/// `create_new` because every caller mints the name it writes under: a path
/// already taken is not a file to overwrite, it is a collision, and a mode is only
/// applied to a file this call is the one to create.
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

/// A file created and then refused halfway through is the one failure a real
/// filesystem cannot be asked for on demand, and it is exactly the one a caller
/// has to take a path back for — see [`crate::attachments::store`]. Armed per
/// thread, which is one test, and compiled out of every build but the test one.
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
