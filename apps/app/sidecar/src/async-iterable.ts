/** One `next` is the whole of an async iterable. Spelled here so the two streams
 * that need one say what they yield rather than how a generator is shaped. */
export const asAsyncIterable = <T>(
	next: () => Promise<IteratorResult<T>>,
): AsyncIterable<T> => ({
	[Symbol.asyncIterator]: () => ({ next }),
})

/** Nothing left to take is the end of the stream, which is what both queues use
 * an empty shift to mean. */
export const yielded = <T>(value: T | undefined): IteratorResult<T> =>
	value === undefined
		? { value: undefined, done: true }
		: { value, done: false }
