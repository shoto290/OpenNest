import { describe, expect, it } from "vitest"

import { createSkillsController } from "./skills-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { BotSkillDraft } from "../conversations/store-contract"
import type { TranscriptStore } from "../conversations/store-port"

const A_SKILL = {
	name: "Release notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
}

const opened = async (store: TranscriptStore, botId = "default") => {
	const controller = createSkillsController(store)
	await controller.open(botId)
	return controller
}

/** The queue behind every write answers on its own turn, so a test reads what the
 * store holds only after the loop it was handed to has run out. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("skills controller", () => {
	it("opens on the skills the bundle already holds", async () => {
		const store = createFakeTranscriptStore()
		await store.createBotSkill("default", A_SKILL)

		const controller = await opened(store)

		expect(controller.getState().skills).toMatchObject([A_SKILL])
	})

	it("creates a skill with everything the reader gave", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.create(A_SKILL, false)
		await settled()

		expect(await store.botSkills("default")).toMatchObject([
			{ ...A_SKILL, isPreloaded: false },
		])
	})

	it("creates a skill already carried, when that is what was asked for", async () => {
		const store = createFakeTranscriptStore()
		const controller = await opened(store)

		controller.create(A_SKILL, true)
		await settled()

		expect(controller.getState().skills).toMatchObject([{ isPreloaded: true }])
		expect((await store.botSkills("default"))[0].isPreloaded).toBe(true)
	})

	it("writes a save to the skill it was opened on, by id", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.save(written.id, { ...A_SKILL, name: "Changelog" })
		await settled()

		const [held] = await store.botSkills("default")
		expect(held).toMatchObject({ id: written.id, name: "Changelog" })
	})

	it("writes every field the save carried, once", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const drafts: BotSkillDraft[] = []
		const counted: TranscriptStore = {
			...store,
			updateBotSkill: (botId, skillId, draft) => {
				drafts.push(draft)
				return store.updateBotSkill(botId, skillId, draft)
			},
		}
		const controller = await opened(counted)

		controller.save(written.id, {
			...A_SKILL,
			allowedTools: ["Read"],
			model: "",
			whenToUse: "Whenever a release is cut",
		})
		await settled()

		expect(drafts).toEqual([
			{
				...A_SKILL,
				allowedTools: ["Read"],
				model: "",
				whenToUse: "Whenever a release is cut",
			},
		])
		expect(controller.getState().skills[0]).toMatchObject({
			allowedTools: ["Read"],
			whenToUse: "Whenever a release is cut",
		})
	})

	it("puts the reader back on what the bundle holds when a save is refused", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const refusing: TranscriptStore = {
			...store,
			updateBotSkill: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await opened(refusing)

		controller.save(written.id, { ...A_SKILL, name: "Changelog" })
		await settled()

		expect(controller.getState().skills).toMatchObject([A_SKILL])
	})

	it("sets the preload mark on its own", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.setPreloaded(written.id, true)
		await settled()

		expect((await store.botSkills("default"))[0].isPreloaded).toBe(true)
	})

	it("takes a skill away", async () => {
		const store = createFakeTranscriptStore()
		const written = await store.createBotSkill("default", A_SKILL)
		const controller = await opened(store)

		controller.remove(written.id)
		await settled()

		expect(controller.getState().skills).toEqual([])
		expect(await store.botSkills("default")).toEqual([])
	})

	it("writes nothing while no bot is open", async () => {
		const store = createFakeTranscriptStore()
		const controller = createSkillsController(store)

		controller.create(A_SKILL, false)
		await settled()

		expect(await store.botSkills("default")).toEqual([])
	})
})
