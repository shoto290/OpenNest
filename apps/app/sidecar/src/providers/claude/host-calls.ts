import { askHost, HostRefusal } from "../../host"

const spoken = (answer: unknown) => ({
	content: [{ type: "text" as const, text: JSON.stringify(answer ?? null) }],
})

export const carriedTo =
	(subtype: string) =>
	async (session: string | undefined, operation: string, payload: object) => {
		try {
			return spoken(await askHost(session, { subtype, operation, payload }))
		} catch (error) {
			if (error instanceof HostRefusal) {
				return { ...spoken(error.error), isError: true }
			}
			throw error
		}
	}
