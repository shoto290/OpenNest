import { describe, expect, it } from "vitest"

import type { AgentSidebarBot } from "@workspace/ui/components/agents/agent-sidebar"

import { toSpaceBadges, withBadges } from "./sidebar-badges"

type ShownBadge = AgentSidebarBot["badge"]

const rosterBot = (id: string) => ({ id, name: id })

const ATLAS = rosterBot("atlas")
const BEACON = rosterBot("beacon")

describe("withBadges", () => {
	it("gives a bot the badge held for it", () => {
		const [atlas] = withBadges([ATLAS], { atlas: "attention" })
		expect(atlas.badge).toBe("attention")
	})

	it("gives no badge to a bot carrying none", () => {
		const [atlas] = withBadges([ATLAS], { atlas: "none" })
		expect(atlas.badge).toBeUndefined()
	})

	it("gives no badge to a bot without a held badge", () => {
		const [atlas] = withBadges([ATLAS], {})
		expect(atlas.badge).toBeUndefined()
	})

	it("leaves the rest of the row untouched", () => {
		const [atlas] = withBadges([{ ...ATLAS, title: "Scout" }], {
			atlas: "done",
		})
		expect(atlas).toMatchObject({ id: "atlas", name: "atlas", title: "Scout" })
	})
})

describe("toSpaceBadges", () => {
	const spaceOf = (...badges: ShownBadge[]) => ({
		home: badges.map((badge, index) => ({
			...rosterBot(`bot-${index}`),
			badge,
		})),
	})

	it("takes the strongest badge among the bots of a space", () => {
		expect(toSpaceBadges(spaceOf("done", "attention", "failed")).home).toBe(
			"attention",
		)
	})

	it("ranks failed above done", () => {
		expect(toSpaceBadges(spaceOf("done", "failed")).home).toBe("failed")
	})

	it("ranks done above no badge", () => {
		expect(toSpaceBadges(spaceOf(undefined, "done")).home).toBe("done")
	})

	it("gives no badge to a space where every bot carries none", () => {
		expect(toSpaceBadges(spaceOf(undefined, undefined))).toEqual({})
	})

	it("badges every space of the roster", () => {
		const badges = toSpaceBadges({
			home: [{ ...ATLAS, badge: "done" }],
			elsewhere: [{ ...BEACON, badge: "attention" }],
		})
		expect(badges).toEqual({ home: "done", elsewhere: "attention" })
	})
})
