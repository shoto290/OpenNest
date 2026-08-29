// @vitest-environment happy-dom

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
	AppSidebar,
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarSection,
	type Space,
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

const SPACES: Space[] = [
	{ id: "personal", name: "Personal", colour: "blue" },
	{ id: "vocca", name: "Vocca", colour: "green" },
	{ id: "labs", name: "Labs", colour: "red" },
]

const RESEARCH: AppSidebarSection = {
	id: "research",
	name: "Research",
	position: 0,
}

const FILED: AppSidebarBot = {
	...ATLAS,
	sectionId: RESEARCH.id,
	pinPosition: 1,
}

const researchHeaderIn = (container: HTMLElement) => {
	const name = container.querySelector<HTMLElement>(
		'[data-slot="roster-section-name"]',
	)
	if (!name?.parentElement) throw new Error("No section header on screen")
	return name.parentElement
}

const shellOnSpace = (selectedSpaceId: string) => (
	<WorkspaceShell
		defaultOpen
		sidebar={
			<AppSidebar
				bots={[FILED]}
				botsBySpaceId={{ personal: [FILED], vocca: [], labs: [] }}
				collapsedSectionIds={[RESEARCH.id]}
				sectionsBySpaceId={{ personal: [RESEARCH], vocca: [], labs: [] }}
				selectedSpaceId={selectedSpaceId}
				spaces={SPACES}
			/>
		}
	>
		{null}
	</WorkspaceShell>
)

describe("AppSidebar section collapse across spaces mounted", () => {
	afterEach(cleanup)

	it("keeps a section shut once the reader leaves the space and comes back", () => {
		const { container, rerender } = render(shellOnSpace("personal"))

		expect(researchHeaderIn(container).getAttribute("aria-expanded")).toBe(
			"false",
		)

		rerender(shellOnSpace("labs"))

		expect(
			container.querySelector('[data-slot="roster-section-name"]'),
		).toBeNull()

		cleanup()
		const { container: revisited } = render(shellOnSpace("personal"))

		expect(researchHeaderIn(revisited).getAttribute("aria-expanded")).toBe(
			"false",
		)
	})
})
