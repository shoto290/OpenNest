export type OpenedMission = {
	missionId: string
	rowId: string
}

export type OpenedMissionController = {
	getState: () => OpenedMission | null
	subscribe: (listener: () => void) => () => void
	open: (opened: OpenedMission) => void
	leave: () => void
}

export type SelectedRow = {
	selectedBotId: string | null
	selectedConversationId: string | null
}

export type SelectedRowSource = {
	getState: () => SelectedRow
	subscribe: (listener: () => void) => () => void
}

const selectedRowIn = ({ getState }: SelectedRowSource) => {
	const { selectedBotId, selectedConversationId } = getState()

	return selectedBotId ?? selectedConversationId
}

export const createOpenedMissionController = (
	roster: SelectedRowSource,
): OpenedMissionController => {
	let opened: OpenedMission | null = null
	const listeners = new Set<() => void>()

	const set = (next: OpenedMission | null) => {
		opened = next
		for (const listener of [...listeners]) {
			listener()
		}
	}

	roster.subscribe(() => {
		if (opened && opened.rowId !== selectedRowIn(roster)) {
			set(null)
		}
	})

	return {
		getState: () => opened,

		subscribe: (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		open: (next) => set(next),

		leave: () => set(null),
	}
}
