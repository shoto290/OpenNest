import { describe, expect, it } from "vitest"

import { createHistoryController } from "./history-controller"

import { createFakeTranscriptStore } from "../conversations/fake-transcript-store"
import type { TranscriptStore } from "../conversations/store-port"

const A_SKILL = {
	name: "Release notes",
	description: "How this project words a changelog entry",
	body: "One line per change.",
}

/** A bundle with one write in it, which is the smallest history a reader can act
 * on: every commit here comes from a write the fake accepted. */
const written = async (store: TranscriptStore) => {
	await store.createBotSkill("default", A_SKILL)
	const controller = createHistoryController(store)
	await controller.open("default")
	return controller
}

/** The queue behind every call answers on its own turn, so a test reads the state
 * only after the loop it was handed to has run out. */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0))

describe("history controller", () => {
	it("opens on every write the bundle already holds", async () => {
		const store = createFakeTranscriptStore()
		const controller = await written(store)

		expect(controller.getState().commits).toMatchObject([
			{ author: "user", title: `Skill "${A_SKILL.name}" saved from settings` },
		])
	})

	it("reads a diff onto the commit it was asked for", async () => {
		const store = createFakeTranscriptStore()
		const controller = await written(store)
		const [commit] = controller.getState().commits

		controller.loadDiff(commit.id)
		await settled()

		expect(controller.getState().commits[0].diff).toBe(
			await store.botHistoryDiff("default", commit.id),
		)
	})

	it("reads a commit's diff once", async () => {
		const store = createFakeTranscriptStore()
		const asked: string[] = []
		const counted: TranscriptStore = {
			...store,
			botHistoryDiff: (botId, commitId) => {
				asked.push(commitId)
				return store.botHistoryDiff(botId, commitId)
			},
		}
		const controller = await written(counted)
		const [commit] = controller.getState().commits

		controller.loadDiff(commit.id)
		await settled()
		controller.loadDiff(commit.id)
		await settled()

		expect(asked).toEqual([commit.id])
	})

	it("shows the history the undo answered with", async () => {
		const store = createFakeTranscriptStore()
		const controller = await written(store)
		const [commit] = controller.getState().commits

		controller.revert(commit.id)
		await settled()

		expect(controller.getState().commits).toMatchObject([
			{ title: `Undone: ${commit.title}` },
			{ id: commit.id },
		])
	})

	it("puts the reader back on what the bundle holds when an undo is refused", async () => {
		const store = createFakeTranscriptStore()
		const refusing: TranscriptStore = {
			...store,
			revertBot: () => Promise.reject({ kind: "unwritableBundle" }),
		}
		const controller = await written(refusing)
		const [commit] = controller.getState().commits

		controller.revert(commit.id)
		await settled()

		expect(controller.getState().commits).toMatchObject([{ id: commit.id }])
	})

	it("reads nothing while no bot is open", async () => {
		const store = createFakeTranscriptStore()
		await store.createBotSkill("default", A_SKILL)
		const asked: string[] = []
		const counted: TranscriptStore = {
			...store,
			botHistoryDiff: (botId, commitId) => {
				asked.push(commitId)
				return store.botHistoryDiff(botId, commitId)
			},
		}
		const controller = createHistoryController(counted)

		controller.loadDiff("commit-1")
		controller.revert("commit-1")
		await settled()

		expect(asked).toEqual([])
		expect(await store.botHistory("default")).toHaveLength(1)
	})
})
