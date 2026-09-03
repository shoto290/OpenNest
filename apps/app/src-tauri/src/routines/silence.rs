use std::collections::HashMap;

use tokio::sync::Mutex;

use super::contract::SkipReason;
use super::core::{Clock, HOUR_MS, LEASE_MS};

#[derive(Default)]
pub struct Silence {
	until: Mutex<HashMap<String, i64>>,
}

impl Silence {
	pub async fn holds(&self, routine_id: &str, clock: &dyn Clock) -> bool {
		let now = clock.now_ms();
		let mut until = self.until.lock().await;
		until.retain(|_, moment| *moment > now);
		until.contains_key(routine_id)
	}

	pub async fn hold(&self, routine_id: &str, reason: SkipReason, clock: &dyn Clock) {
		let until = clock.now_ms() + span(reason);
		self.until.lock().await.insert(routine_id.to_owned(), until);
	}

	#[cfg(test)]
	async fn held_routines(&self) -> usize {
		self.until.lock().await.len()
	}
}

fn span(reason: SkipReason) -> i64 {
	match reason {
		SkipReason::HourlyCap => HOUR_MS,
		SkipReason::LeaseHeld | SkipReason::BackingOff => LEASE_MS,
	}
}

#[cfg(test)]
mod tests {
	use std::sync::atomic::{AtomicI64, Ordering};

	use super::*;

	const NOON: i64 = 1_800_000_000_000;

	struct Ticking(AtomicI64);

	impl Ticking {
		fn at(now: i64) -> Self {
			Ticking(AtomicI64::new(now))
		}

		fn moved_by(&self, elapsed: i64) {
			self.0.fetch_add(elapsed, Ordering::SeqCst);
		}
	}

	impl Clock for Ticking {
		fn now_ms(&self) -> i64 {
			self.0.load(Ordering::SeqCst)
		}
	}

	#[tokio::test]
	async fn a_routine_held_for_the_hourly_cap_stays_silent_until_the_hour_has_passed() {
		let clock = Ticking::at(NOON);
		let silence = Silence::default();

		silence.hold("r1", SkipReason::HourlyCap, &clock).await;

		assert!(silence.holds("r1", &clock).await);
		clock.moved_by(HOUR_MS - 1);
		assert!(silence.holds("r1", &clock).await);
		clock.moved_by(1);
		assert!(!silence.holds("r1", &clock).await);
	}

	#[tokio::test]
	async fn a_routine_held_for_a_lease_or_a_backoff_stays_silent_for_the_length_of_a_lease() {
		let clock = Ticking::at(NOON);
		let silence = Silence::default();

		silence.hold("r1", SkipReason::LeaseHeld, &clock).await;
		silence.hold("r2", SkipReason::BackingOff, &clock).await;

		clock.moved_by(LEASE_MS - 1);
		assert!(silence.holds("r1", &clock).await);
		assert!(silence.holds("r2", &clock).await);
		clock.moved_by(1);
		assert!(!silence.holds("r1", &clock).await);
		assert!(!silence.holds("r2", &clock).await);
	}

	#[tokio::test]
	async fn one_routine_held_silent_leaves_another_routine_free() {
		let clock = Ticking::at(NOON);
		let silence = Silence::default();

		silence.hold("r1", SkipReason::HourlyCap, &clock).await;

		assert!(silence.holds("r1", &clock).await);
		assert!(!silence.holds("r2", &clock).await);
	}

	#[tokio::test]
	async fn a_routine_whose_silence_has_passed_is_forgotten() {
		let clock = Ticking::at(NOON);
		let silence = Silence::default();
		silence.hold("r1", SkipReason::HourlyCap, &clock).await;
		assert_eq!(silence.held_routines().await, 1);

		clock.moved_by(HOUR_MS);
		silence.holds("r2", &clock).await;

		assert_eq!(silence.held_routines().await, 0);
	}

	#[tokio::test]
	async fn a_fresh_silence_holds_no_routine() {
		let silence = Silence::default();

		assert_eq!(silence.held_routines().await, 0);
	}
}
