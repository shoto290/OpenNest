import type { EvolvedBundle } from "../agent/contract"
import type { ChatDriver } from "../chat/driver"

type BotPanel = {
	getState: () => { botId: string | null }
	reload: () => void
}

type PersonPanel = {
	reload: () => void
}

type SpacePanel = {
	getState: () => { spaceId: string | null }
	reload: () => void
}

type RosterPanel = {
	spaceOfBot: (botId: string) => string | undefined
	reload: () => Promise<void>
}

export type EvolutionSourceOptions = {
	driver: Pick<ChatDriver, "subscribe">
	roster: RosterPanel
	skills: BotPanel
	history: BotPanel
	userPlugin: PersonPanel
	spacePlugin: SpacePanel
}

export const startEvolutionSource = ({
	driver,
	roster,
	skills,
	history,
	userPlugin,
	spacePlugin,
}: EvolutionSourceOptions): (() => void) => {
	const readBotPanels = (botId: string) => {
		void roster.reload()
		for (const panel of [skills, history]) {
			if (panel.getState().botId === botId) {
				panel.reload()
			}
		}
	}

	const readSpacePanel = (botId: string) => {
		const spaceId = roster.spaceOfBot(botId)
		if (spaceId && spacePlugin.getState().spaceId === spaceId) {
			spacePlugin.reload()
		}
	}

	const readPanels = (botId: string, bundle: EvolvedBundle) => {
		if (bundle === "user") {
			return userPlugin.reload()
		}
		if (bundle === "space") {
			return readSpacePanel(botId)
		}
		return readBotPanels(botId)
	}

	const detach = driver
		.subscribe(({ scope, event }) => {
			if (scope && event.type === "botEvolved") {
				readPanels(scope.botId, event.bundle)
			}
		})
		.catch(() => undefined)

	return () => {
		void detach.then((stop) => stop?.())
	}
}
