import { describe, expect, it } from "vitest"

import { createUserPluginController } from "./user-plugin-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"

const A_SKILL = {
	name: "How I work",
	description: "How the person likes to be answered",
	body: "Short answers.",
}

const opened = async (store: TranscriptStore) => {
	const controller = createUserPluginController(store)
	await controller.open()
	return controller
}

const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("user plugin controller", () => {
	it("opens on a plugin nobody has written into yet", async () => {
		const controller = await opened(createFakeTranscriptStore())

		expect(controller.getState().skills).toEqual([])
		expect(controller.getState().commits).toEqual([])
	})

	it("keeps a skill the person writes and records it in the history", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.createSkill(A_SKILL, false)
		await settled()

		expect(controller.getState().skills).toMatchObject([A_SKILL])
		expect(controller.getState().commits).toHaveLength(1)
		expect(await store.userPluginSkills()).toMatchObject([A_SKILL])
	})

	it("saves an edited body to the plugin rather than to the screen alone", async () => {
		const store = createFakeTranscriptStore()
		const created = await store.createUserPluginSkill(A_SKILL)
		const controller = await opened(store)

		controller.saveSkill(created.id, { ...A_SKILL, body: "Even shorter." })
		await settled()

		expect(await store.userPluginSkills()).toMatchObject([
			{ body: "Even shorter." },
		])
	})

	it("puts a skill in the brief and leaves it there", async () => {
		const store = createFakeTranscriptStore()
		const created = await store.createUserPluginSkill(A_SKILL)
		const controller = await opened(store)

		controller.setSkillPreloaded(created.id, true)
		await settled()

		expect(controller.getState().skills).toMatchObject([{ isPreloaded: true }])
	})

	it("takes a skill away from the plugin", async () => {
		const store = createFakeTranscriptStore()
		const created = await store.createUserPluginSkill(A_SKILL)
		const controller = await opened(store)

		controller.removeSkill(created.id)
		await settled()

		expect(controller.getState().skills).toEqual([])
		expect(await store.userPluginSkills()).toEqual([])
	})

	it("puts the plugin back on the history it is given after an undo", async () => {
		const store = createFakeTranscriptStore()
		await store.createUserPluginSkill(A_SKILL)
		const controller = await opened(store)
		const [latest] = controller.getState().commits

		controller.revert(latest.id)
		await settled()

		expect(controller.getState().commits[0].title).toContain("Undone")
	})

	it("reads a diff once and holds on to it", async () => {
		const store = createFakeTranscriptStore()
		await store.createUserPluginSkill(A_SKILL)
		const controller = await opened(store)
		const [latest] = controller.getState().commits

		controller.loadDiff(latest.id)
		await settled()

		expect(controller.getState().commits[0].diff).toContain(latest.title)
	})

	it("reads the plugin again when a write is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.removeSkill("nothing-of-the-sort")
		await settled()

		expect(controller.getState().skills).toEqual([])
	})
})
