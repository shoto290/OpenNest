// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	AppSidebar,
	type AppSidebarBot,
	type AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import "@workspace/ui/lib/i18n"

const ATLAS: AppSidebarBot = {
	id: "atlas",
	name: "Atlas",
	lastMessage: "Pulled the three papers.",
	timestamp: "09:24",
	badge: "attention",
}

const REVIEW: AppSidebarConversation = {
	id: "review",
	name: "Launch review",
	participants: [ATLAS],
	lastMessage: "Both green.",
	timestamp: "09:20",
	badge: "done",
}

const AVATARS =
	'[data-slot="bot-identity-avatar"], [data-slot="conversation-avatar"]'

const dotsInRoster = (isExpanded: boolean) => {
	const { container } = render(
		<WorkspaceShell
			defaultOpen={isExpanded}
			sidebar={<AppSidebar bots={[ATLAS]} conversations={[REVIEW]} />}
		>
			{null}
		</WorkspaceShell>,
	)

	return [
		...container.querySelectorAll<HTMLElement>(
			'[data-slot="bot-activity-dot"]',
		),
	]
}

const badgesOf = (dots: HTMLElement[]) => dots.map((dot) => dot.dataset.badge)

const onAvatars = (dots: HTMLElement[]) =>
	dots.map((dot) => Boolean(dot.closest(AVATARS)))

describe("AppSidebar roster badge placement mounted", () => {
	afterEach(cleanup)

	it("draws the bot and conversation dots outside the avatars while expanded", () => {
		const dots = dotsInRoster(true)

		expect(badgesOf(dots)).toEqual([REVIEW.badge, ATLAS.badge])
		expect(onAvatars(dots)).toEqual([false, false])
	})

	it("draws them back on the avatars once the panel collapses to its rail", () => {
		const dots = dotsInRoster(false)

		expect(badgesOf(dots)).toEqual([REVIEW.badge, ATLAS.badge])
		expect(onAvatars(dots)).toEqual([true, true])
	})
})
