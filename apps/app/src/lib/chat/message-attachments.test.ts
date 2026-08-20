import { describe, expect, it } from "vitest"

import { promptWithAttachments } from "./attachments"
import {
	messageWithAttachments,
	storedAttachmentPath,
} from "./message-attachments"

const ROOT = "/Users/reader/Library/Application Support/com.opennest.app"

const stored = (submittedName: string) =>
	storedAttachmentPath({ root: ROOT, conversationId: "conv-1", submittedName })

const IMAGE = stored("shot.png")
const ARCHIVE = stored("logs.zip")
const MINTED = IMAGE.split("/").at(-1) ?? ""

describe("lifting the paths a prompt named", () => {
	it("takes the trailing paths out of the text and hands them back as files", () => {
		const lifted = messageWithAttachments(
			promptWithAttachments("Have a look at these", [IMAGE, ARCHIVE]),
		)

		expect(lifted.text).toBe("Have a look at these")
		expect(lifted.attachments.map((item) => item.id)).toEqual([IMAGE, ARCHIVE])
	})

	it("leaves no trailing blank behind the text it kept", () => {
		expect(messageWithAttachments(`Look\n\n${IMAGE}`).text).toBe("Look")
	})

	it("keeps every line of a text that ends in none", () => {
		const written = "Nothing attached here\n\nJust two paragraphs"

		const lifted = messageWithAttachments(written)

		expect(lifted.text).toBe(written)
		expect(lifted.attachments).toEqual([])
	})

	it("lifts the paths of a prompt that was only files", () => {
		const lifted = messageWithAttachments(promptWithAttachments("", [IMAGE]))

		expect(lifted.text).toBe("")
		expect(lifted.attachments).toHaveLength(1)
	})

	it("lifts only the trailing run, leaving a path quoted mid-text alone", () => {
		const lifted = messageWithAttachments(
			`Compare ${IMAGE} with\n${IMAGE}\n${ARCHIVE}`,
		)

		expect(lifted.text).toBe(`Compare ${IMAGE} with`)
		expect(lifted.attachments).toHaveLength(2)
	})
})

describe("a line that only looks like a stored path", () => {
	it.each([
		["a name the host never minted", `${ROOT}/attachments/conv-1/shot.png`],
		[
			"no conversation between the store and the file",
			`${ROOT}/attachments/${MINTED}`,
		],
		[
			"a store the reader keeps themselves",
			`/Users/reader/notes/conv-1/${MINTED}`,
		],
		["a stored path named in prose", `Read ${IMAGE} please`],
		["nothing above the store", `attachments/conv-1/${MINTED}`],
	])("stays in the text: %s", (_case, line) => {
		const lifted = messageWithAttachments(`Look\n${line}`)

		expect(lifted.text).toBe(`Look\n${line}`)
		expect(lifted.attachments).toEqual([])
	})
})

describe("what the bubble is handed", () => {
	it("gives an image a source and everything else its name alone", () => {
		const [image, archive] = messageWithAttachments(
			promptWithAttachments("Both", [IMAGE, ARCHIVE]),
		).attachments

		expect(image?.previewUrl).toBe(IMAGE)
		expect(image?.name).toBe(MINTED)
		expect(archive?.previewUrl).toBeUndefined()
		expect(archive?.name).toBe(ARCHIVE.split("/").at(-1))
	})
})
