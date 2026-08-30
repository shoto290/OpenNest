import { describe, expect, it } from "vitest"

import { createSpacePluginController } from "./space-plugin-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"

const A_SKILL = {
	name: "How this space works",
	description: "What every bot in here reads first",
	body: "Short answers.",
}

const A_SPACE = "space-1"

const opened = async (store: TranscriptStore) => {
	const controller = createSpacePluginController(store)
	await controller.open(A_SPACE)
	return controller
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

const movingSkill = (store: TranscriptStore, id: string): TranscriptStore => ({
	...store,
	updateSpacePluginSkill: async (spaceId, skillId, draft) => ({
		...(await store.updateSpacePluginSkill(spaceId, skillId, draft)),
		id,
	}),
})

describe("space plugin controller", () => {
	it("carries an open file to the id a renamed skill comes back under", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createSpacePluginSkill(A_SPACE, A_SKILL)
		await store.writeSpacePluginSkillFile(
			A_SPACE,
			written.id,
			"notes.md",
			"One line",
		)
		const controller = await opened(movingSkill(store, "house-style"))

		controller.openFile(written.id, "notes.md")
		await settled()
		controller.saveSkill(written.id, { ...A_SKILL, name: "House style" })
		await settled()

		expect(controller.getState().file).toMatchObject({
			skillId: "house-style",
			path: "notes.md",
		})
	})

	it("leaves the opened file alone when no file of that skill is open", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createSpacePluginSkill(A_SPACE, A_SKILL)
		const controller = await opened(movingSkill(store, "house-style"))

		controller.saveSkill(written.id, { ...A_SKILL, name: "House style" })
		await settled()

		expect(controller.getState().file).toBe(null)
		expect(controller.getState().skills).toMatchObject([{ id: "house-style" }])
	})
})
