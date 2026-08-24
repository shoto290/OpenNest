export const asAsyncIterable = <T>(
	next: () => Promise<IteratorResult<T>>,
): AsyncIterable<T> => ({
	[Symbol.asyncIterator]: () => ({ next }),
})

export const yielded = <T>(value: T | undefined): IteratorResult<T> =>
	value === undefined
		? { value: undefined, done: true }
		: { value, done: false }
