import type { createQueue } from "./queue"

type WriteLoopOptions<Value, Written> = {
	/** The order writes happen in, shared with everything else the surface writes:
	 * a save must not land under an answer to a read that predates it. */
	enqueue: ReturnType<typeof createQueue>
	/** The write itself. `null` is nothing left to write — the row went away under
	 * the reader — and nothing is applied for it. */
	write: (key: string, value: Value) => Promise<Written | null>
	/** The store's own answer, applied only once nothing newer is waiting: an answer
	 * to a value the reader has already typed past would rewind the field they are
	 * in. */
	apply: (key: string, written: Written) => void
	/** What a refused write falls back to. Neither caller has anywhere to say a save
	 * did not land, so this is where the reader ends up on what the record holds. */
	onRefused: () => void
}

export type WriteLoop<Value> = {
	/** The newest value for that key, written once the one in flight is done.
	 * Everything typed in between is dropped: each value describes the same thing
	 * less completely than the one after it. */
	push: (key: string, value: Value) => void
	/** Forgets whatever is still waiting for a key. */
	drop: (key: string) => void
	/** Forgets everything still waiting — for a surface that just moved to another
	 * subject, whose keys a stale value must not be written against. */
	clear: () => void
}

/**
 * One write at a time per key, always the newest one. Typing is faster than a round
 * trip, so a burst of keystrokes has to collapse to a single save rather than queue
 * one save per character.
 *
 * The surface still shows every keystroke as it happens — that is its own optimistic
 * state, not this — and this only decides what reaches the store and which answer is
 * worth applying back.
 */
export const createWriteLoop = <Value, Written>({
	enqueue,
	write,
	apply,
	onRefused,
}: WriteLoopOptions<Value, Written>): WriteLoop<Value> => {
	const running = new Set<string>()
	const pending = new Map<string, Value>()

	const flush = async (key: string): Promise<void> => {
		const value = pending.get(key)
		if (value === undefined) {
			return
		}
		pending.delete(key)
		const written = await write(key, value)
		if (written !== null && !pending.has(key)) {
			apply(key, written)
		}
		return flush(key)
	}

	return {
		push: (key, value) => {
			pending.set(key, value)
			if (running.has(key)) {
				return
			}
			running.add(key)
			void enqueue(() => flush(key))
				.catch(onRefused)
				.finally(() => {
					running.delete(key)
				})
		},

		drop: (key) => {
			pending.delete(key)
		},

		clear: () => pending.clear(),
	}
}
