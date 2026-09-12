import { describe, expect, it } from "vitest"

import { createUserPluginController } from "./user-plugin-controller"

import { UNDONE_TITLE_PREFIX } from "../bots/history-runs"
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

const movingSkill = (store: TranscriptStore, id: string): TranscriptStore => ({
	...store,
	updateUserPluginSkill: async (skillId, draft) => ({
		...(await store.updateUserPluginSkill(skillId, draft)),
		id,
	}),
})

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

		controller.revert(latest.id, latest.id)
		await settled()

		expect(controller.getState().commits[0].title).toContain(
			UNDONE_TITLE_PREFIX,
		)
	})

	it("reads the files of an opened change", async () => {
		const store = createFakeTranscriptStore()
		await store.createUserPluginSkill(A_SKILL)
		const controller = await opened(store)
		const [latest] = controller.getState().commits

		controller.openFiles(latest.id, latest.id)
		await settled()

		expect(controller.getState().files).toHaveLength(1)
		expect(controller.getState().areFilesReading).toBe(false)
	})

	it("reports a history it could not read instead of an empty panel", async () => {
		const store = createFakeTranscriptStore()
		const refusing: TranscriptStore = {
			...store,
			userPluginHistory: () => Promise.reject(new Error("no bundle")),
		}

		const controller = await opened(refusing)

		expect(controller.getState().hasFailedToLoad).toBe(true)
	})

	it("reads the plugin again when a write is refused", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.removeSkill("nothing-of-the-sort")
		await settled()

		expect(controller.getState().skills).toEqual([])
	})

	it("carries an open file to the id a renamed skill comes back under", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createUserPluginSkill(A_SKILL)
		await store.writeUserPluginSkillFile(written.id, "notes.md", "One line")
		const controller = await opened(movingSkill(store, "how-i-answer"))

		controller.openFile(written.id, "notes.md")
		await settled()
		controller.saveSkill(written.id, { ...A_SKILL, name: "How I answer" })
		await settled()

		expect(controller.getState().file).toMatchObject({
			skillId: "how-i-answer",
			path: "notes.md",
		})
	})
})
