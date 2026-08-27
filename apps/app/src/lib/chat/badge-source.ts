import type { BotBadge } from "./bot-badge"

type BadgedRow = {
	id: string
}

export type BadgeRuleInput<State> = {
	held: BotBadge
	before: State | undefined
	after: State
	isSelected: boolean
	hasFocus: boolean
}

type StateSource<State> = {
	stateFor: (id: string) => State | null
	subscribe: (listener: () => void) => () => void
}

type SelectionSource = {
	getState: () => {
		ids: string[]
		selectedId: string | null
	}
	subscribe: (listener: () => void) => () => void
}

export type BadgeSourceOptions<State> = {
	states: StateSource<State>
	selection: SelectionSource
	ruleOf: (input: BadgeRuleInput<State>) => BotBadge
	hasFocus: () => boolean
	watchFocus: (report: (isFocused: boolean) => void) => Promise<() => void>
}

export type BadgeSource = {
	getBadges: () => Record<string, BotBadge>
	subscribe: (listener: () => void) => () => void
	start: () => () => void
}

export const rowIdsIn = (rosters: Record<string, BadgedRow[]>): string[] =>
	Object.values(rosters).flatMap((rows) => rows.map((row) => row.id))

export const createBadgeSource = <State>({
	states,
	selection,
	ruleOf,
	hasFocus,
	watchFocus,
}: BadgeSourceOptions<State>): BadgeSource => {
	const seen = new Map<string, State>()
	const listeners = new Set<() => void>()

	let badges: Record<string, BotBadge> = {}
	let selectedId: string | null = null
	let windowFocus: boolean | undefined

	const publish = () => {
		for (const listener of [...listeners]) {
			listener()
		}
	}

	const forget = (ids: string[]) => {
		for (const id of seen.keys()) {
			if (!ids.includes(id)) {
				seen.delete(id)
			}
		}
	}

	const hasChanged = (next: Record<string, BotBadge>): boolean => {
		const keys = Object.keys(next)
		return (
			keys.length !== Object.keys(badges).length ||
			keys.some((id) => next[id] !== badges[id])
		)
	}

	const refresh = (cleared: string | null = null) => {
		const { ids } = selection.getState()
		const isFocused = windowFocus ?? hasFocus()
		const next: Record<string, BotBadge> = {}

		for (const id of ids) {
			const after = states.stateFor(id)
			if (!after) {
				seen.delete(id)
				continue
			}
			next[id] = ruleOf({
				held: id === cleared ? "none" : (badges[id] ?? "none"),
				before: seen.get(id),
				after,
				isSelected: id === selectedId,
				hasFocus: isFocused,
			})
			seen.set(id, after)
		}

		forget(ids)

		if (!hasChanged(next)) {
			return
		}
		badges = next
		publish()
	}

	const followFocus = (isFocused: boolean) => {
		windowFocus = isFocused
		if (isFocused) {
			refresh()
		}
	}

	const followSelection = () => {
		const selected = selection.getState().selectedId
		if (selected === selectedId) {
			refresh()
			return
		}
		selectedId = selected
		refresh(selected)
	}

	return {
		getBadges: () => badges,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		start: () => {
			const stopStates = states.subscribe(refresh)
			const stopSelection = selection.subscribe(followSelection)
			const focus = watchFocus(followFocus).catch(() => undefined)

			followSelection()

			return () => {
				stopStates()
				stopSelection()
				void focus.then((stop) => stop?.())
			}
		},
	}
}
