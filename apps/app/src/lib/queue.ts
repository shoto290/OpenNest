/** Runs operations one after another, in the order they were handed over.
 *
 * The two callers need it for the same reason from opposite ends: a transcript
 * streaming deltas into one row cannot let two appends race, since an append-only
 * column concatenates them in whatever order the host answered; and a roster cannot
 * let a create land under an answer to a read that predates it. Both are "the order
 * I asked in is the order it happens".
 *
 * A rejection is absorbed by the chain and not by the caller: the promise handed
 * back rejects for whoever asked, while the queue itself carries on, so one refused
 * write does not stop everything queued behind it.
 */
export const createQueue = () => {
	let tail: Promise<unknown> = Promise.resolve()

	return <T>(operation: () => Promise<T>): Promise<T> => {
		const result = tail.then(operation)
		tail = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	}
}
