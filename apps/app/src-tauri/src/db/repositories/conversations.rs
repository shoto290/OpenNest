//! Reads and writes the conversation list: `conversations`,
//! `conversation_participants` and `bots`.

use rusqlite::Connection;

use crate::db::{Access, DatabaseError};

pub struct ConversationsRepository {
	access: Access,
}

impl ConversationsRepository {
	/// Only the `db` module builds a repository: `Access` is what makes one able to
	/// reach the file, and it is not a capability the rest of the host may hand out.
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	/// The one way the queries below reach SQLite — see [`crate::db::Database::call`]
	/// for why the connection is only ever a closure's argument.
	pub async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call(f).await
	}

	pub async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call_mut(f).await
	}
}
