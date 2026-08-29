export const REFERENCE_OPEN = "${secret:"
export const REFERENCE_CLOSE = "}"

const INTERPOLATION_OPEN = "${"

const UNUSABLE_IN_KEY = /[:{}$]|\s/

export const isReferenceKey = (key: string): boolean =>
	key.length > 0 && !UNUSABLE_IN_KEY.test(key)

export const placeholderFor = (key: string): string =>
	`${REFERENCE_OPEN}${key}${REFERENCE_CLOSE}`

export const referencesIn = (value: string): string[] => {
	const found: string[] = []
	let rest = value

	while (rest.includes(REFERENCE_OPEN)) {
		const after = rest.slice(
			rest.indexOf(REFERENCE_OPEN) + REFERENCE_OPEN.length,
		)
		const end = after.indexOf(REFERENCE_CLOSE)
		if (end === -1) {
			return found
		}
		const key = after.slice(0, end)
		if (isReferenceKey(key) && !found.includes(key)) {
			found.push(key)
		}
		rest = after.slice(end + REFERENCE_CLOSE.length)
	}

	return found
}

export const holdsAReference = (value: string): boolean =>
	referencesIn(value).length > 0

export const looksInterpolated = (value: string): boolean =>
	value.includes(INTERPOLATION_OPEN)

export const substitutedReferences = (
	value: string,
	held: (key: string) => string | undefined,
): { text: string; missing: string[] } => {
	const missing: string[] = []
	let text = value

	for (const key of referencesIn(value)) {
		const found = held(key)
		if (found === undefined) {
			missing.push(key)
			continue
		}
		text = text.split(placeholderFor(key)).join(found)
	}

	return { text, missing }
}

const isWalkable = (value: unknown): value is Record<string, unknown> =>
	Boolean(value) && typeof value === "object" && !Array.isArray(value)

export const referencesInDeclaration = (declaration: unknown): string[] => {
	const found = new Set<string>()

	const walk = (value: unknown) => {
		if (typeof value === "string") {
			for (const key of referencesIn(value)) found.add(key)
			return
		}
		if (Array.isArray(value)) {
			for (const item of value) walk(item)
			return
		}
		if (isWalkable(value)) {
			for (const item of Object.values(value)) walk(item)
		}
	}

	walk(declaration)
	return [...found]
}
