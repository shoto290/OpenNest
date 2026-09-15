import {
	raiseFailureNotice,
	raiseTransientNotice,
} from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import type { ChatController } from "../chat/chat-controller"
import type { Bot, EnvOwner } from "../conversations/store-contract"

export type ReopenedScope =
	| { kind: "user" }
	| { kind: "space"; id: string }
	| { kind: "companion"; id: string }

export type ReopenedCompanions = {
	rosters: Record<string, Bot[]>
}

export type SessionReopening = {
	scope: ReopenedScope
	application: string
}

export type SessionReopenerParts = {
	chat: Pick<ChatController, "reopen" | "stateFor">
	companions: () => ReopenedCompanions
}

export type SessionReopener = (reopening: SessionReopening) => Promise<void>

export const scopeOfOwner = (owner: EnvOwner): ReopenedScope =>
	owner.kind === "bot" ? { kind: "companion", id: owner.id } : owner

const everyCompanion = (rosters: Record<string, Bot[]>) => {
	const held = new Map<string, Bot>()
	for (const roster of Object.values(rosters)) {
		for (const companion of roster) {
			held.set(companion.id, companion)
		}
	}
	return [...held.values()]
}

const companionsIn = (
	{ rosters }: ReopenedCompanions,
	scope: ReopenedScope,
): Bot[] => {
	if (scope.kind === "user") {
		return everyCompanion(rosters)
	}
	if (scope.kind === "space") {
		return rosters[scope.id] ?? []
	}
	return everyCompanion(rosters).filter((held) => held.id === scope.id)
}

export const createSessionReopener = ({
	chat,
	companions,
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

	return async ({ scope, application }) => {
		const live = companionsIn(companions(), scope).filter(
			(companion) => chat.stateFor(companion.id).sessionOpen,
		)
		const landings = await Promise.all(
			live.map((companion) => reopenOne(companion, application)),
		)
		if (landings.some(Boolean)) {
			raiseTransientNotice({
				title: i18n.t("bots:applications.reopen.landed.title", {
					name: application,
				}),
				description: i18n.t("bots:applications.reopen.landed.description"),
			})
		}
	}
}
