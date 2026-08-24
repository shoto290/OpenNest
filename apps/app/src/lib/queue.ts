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
