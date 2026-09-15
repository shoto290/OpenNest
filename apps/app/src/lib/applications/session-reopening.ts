import {
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ChatController } from "../chat/chat-controller"
import { isTurnBusy } from "../chat/chat-state"
import type { Bot, EnvOwner } from "../conversations/store-contract"

export type ReopenedScope =
	| { kind: "user" }
	| { kind: "space"; id: string }
	| { kind: "companion"; id: string }

export type CompanionRosters = Record<string, Bot[]>

export type SessionReopening = {
	scope: ReopenedScope
	application: string
}

export type SessionReopenerParts = {
	chat: Pick<ChatController, "reopen" | "stateFor">
	rosters: () => CompanionRosters
}

export type SessionReopener = (reopening: SessionReopening) => Promise<void>

export const scopeOfOwner = (owner: EnvOwner): ReopenedScope =>
	owner.kind === "bot" ? { kind: "companion", id: owner.id } : owner

const everyCompanion = (rosters: CompanionRosters) => [
	...new Map(
		Object.values(rosters)
			.flat()
			.map((companion) => [companion.id, companion] as const),
	).values(),
]

const companionsIn = (rosters: CompanionRosters, scope: ReopenedScope) => {
	if (scope.kind === "space") {
		return rosters[scope.id] ?? []
	}
	const every = everyCompanion(rosters)
	return scope.kind === "user"
		? every
		: every.filter((companion) => companion.id === scope.id)
}

export const createSessionReopener = ({
	chat,
	rosters,
}: SessionReopenerParts): SessionReopener => {
	const reopenOne = async (companion: Bot, application: string) => {
		const handle = await chat.reopen(companion.id)
		if (handle) {
			return true
		}
		raiseFailureNotice({
			title: i18n.t("bots:applications.reopen.refused.title", {
				companion: companion.name,
			}),
			description: i18n.t("bots:applications.reopen.refused.description", {
				name: application,
			}),
		})
		return false
	}

	const announceLanding = (application: string) =>
		raiseTransientNotice({
			title: i18n.t("bots:applications.reopen.landed.title", {
				name: application,
			}),
			description: i18n.t("bots:applications.reopen.landed.description"),
		})

	const isMidTurn = (companion: Bot) =>
		isTurnBusy(chat.stateFor(companion.id).turn)

	return async ({ scope, application }) => {
		const live = companionsIn(rosters(), scope).filter(
			(companion) => chat.stateFor(companion.id).sessionOpen,
		)
		const waiting = live.filter(isMidTurn)
		for (const companion of waiting) {
			void reopenOne(companion, application)
		}
		const landings = await Promise.all(
			live
				.filter((companion) => !isMidTurn(companion))
				.map((companion) => reopenOne(companion, application)),
		)
		if (landings.some(Boolean) || waiting.length > 0) {
			announceLanding(application)
		}
	}
}
