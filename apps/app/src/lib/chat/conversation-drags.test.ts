import { afterEach, describe, expect, it, vi } from "vitest"

import { watchConversationDrags } from "./conversation-drags"

class FakeNode {
	parent: FakeNode | null = null

	contains(other: unknown) {
		let node = other instanceof FakeNode ? other : null
		while (node) {
			if (node === this) {
				return true
			}
			node = node.parent
		}
		return false
	}
}

const childOf = (parent: FakeNode) => {
	const node = new FakeNode()
	node.parent = parent
	return node
}

const fileNamed = (name: string) => new File([new Uint8Array([1])], name)

type FakeDrag = {
	target: unknown
	types?: string[]
	files?: File[]
	defaultPrevented?: boolean
}

const dragOf = ({
	target,
	types = ["Files"],
	files = [],
	defaultPrevented = false,
}: FakeDrag) => ({
	target,
	defaultPrevented,
	dataTransfer: { types, files },
	preventDefault: vi.fn(),
})

type FiredDrag = ReturnType<typeof dragOf>

const watchedConversation = () => {
	const listeners = new Map<string, Set<(event: FiredDrag) => void>>()
	vi.stubGlobal("Node", FakeNode)
	vi.stubGlobal("window", {
		addEventListener: (type: string, listener: (event: FiredDrag) => void) => {
			const forType = listeners.get(type) ?? new Set()
			forType.add(listener)
			listeners.set(type, forType)
		},
		removeEventListener: (
			type: string,
			listener: (event: FiredDrag) => void,
		) => {
			listeners.get(type)?.delete(listener)
		},
	})

	const region = new FakeNode()
	const transcript = childOf(region)
	const composer = childOf(region)
	const roster = new FakeNode()
	const hovers: boolean[] = []
	const dropped: string[][] = []
	const stop = watchConversationDrags({
		conversation: { current: region as unknown as HTMLElement },
		onHover: (isOver) => hovers.push(isOver),
		onDrop: (files) => dropped.push(files.map((file) => file.name)),
	})

	return {
		transcript,
		composer,
		roster,
		hovers,
		dropped,
		stop,
		detach: (node: FakeNode) => {
			node.parent = null
		},
		listenerCount: () =>
			[...listeners.values()].reduce((count, set) => count + set.size, 0),
		fire: (type: string, drag: FakeDrag) => {
			const event = dragOf(drag)
			for (const listener of listeners.get(type) ?? []) {
				listener(event)
			}
			return event
		},
	}
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe("the drop mark over a conversation", () => {
	it("is worn while files are dragged over it", () => {
		const { fire, hovers, transcript } = watchedConversation()

		fire("dragenter", { target: transcript })

		expect(hovers).toEqual([true])
	})

	it("stays worn while the drag crosses from one element to another", () => {
		const { fire, hovers, transcript, composer } = watchedConversation()

		fire("dragenter", { target: transcript })
		fire("dragenter", { target: composer })
		fire("dragleave", { target: transcript })

		expect(hovers).toEqual([true])
	})

	it("is given up once the drag has left every element it entered", () => {
		const { fire, hovers, transcript, composer } = watchedConversation()

		fire("dragenter", { target: transcript })
		fire("dragenter", { target: composer })
		fire("dragleave", { target: transcript })
		fire("dragleave", { target: composer })

		expect(hovers).toEqual([true, false])
	})

	it("is given up when the drag leaves for the roster beside it", () => {
		const { fire, hovers, transcript, roster } = watchedConversation()

		fire("dragenter", { target: transcript })
		fire("dragenter", { target: roster })
		fire("dragleave", { target: transcript })

		expect(hovers).toEqual([true, false])
	})

	it("is given up when the leave is reported on a node a stream replaced", () => {
		const { fire, hovers, transcript, detach } = watchedConversation()

		fire("dragenter", { target: transcript })
		detach(transcript)
		fire("dragleave", { target: transcript })

		expect(hovers).toEqual([true, false])
	})

	it("is given up when the leave is reported on no element of the page", () => {
		const { fire, hovers, transcript } = watchedConversation()

		fire("dragenter", { target: transcript })
		fire("dragleave", { target: {} })

		expect(hovers).toEqual([true, false])
	})

	it("is given up when the drag ends", () => {
		const { fire, hovers, transcript, composer } = watchedConversation()

		fire("dragenter", { target: transcript })
		fire("dragenter", { target: composer })
		fire("dragend", { target: composer })

		expect(hovers).toEqual([true, false])
	})

	it("is given up when the files are dropped", () => {
		const { fire, hovers, transcript, composer } = watchedConversation()

		fire("dragenter", { target: transcript })
		fire("dragenter", { target: composer })
		fire("drop", { target: composer, files: [fileNamed("note.md")] })

		expect(hovers).toEqual([true, false])
	})

	it("is given up when the composer takes the drop itself", () => {
		const { fire, hovers, dropped, composer } = watchedConversation()

		fire("dragenter", { target: composer })
		fire("drop", {
			target: composer,
			files: [fileNamed("note.md")],
			defaultPrevented: true,
		})

		expect(hovers).toEqual([true, false])
		expect(dropped).toEqual([])
	})

	it("is given up when the watcher is rebuilt under the drag", () => {
		const { fire, hovers, stop, transcript } = watchedConversation()

		fire("dragenter", { target: transcript })
		stop()

		expect(hovers).toEqual([true, false])
	})

	it("is never worn by a drag carrying no file", () => {
		const { fire, hovers, transcript } = watchedConversation()

		fire("dragenter", { target: transcript, types: ["text/plain"] })
		fire("dragleave", { target: transcript, types: ["text/plain"] })

		expect(hovers).toEqual([])
	})

	it("is never worn by a drag over the roster alone", () => {
		const { fire, hovers, roster } = watchedConversation()

		fire("dragenter", { target: roster })
		fire("dragleave", { target: roster })

		expect(hovers).toEqual([])
	})

	it("is never worn by a drag over what is no element of the page", () => {
		const { fire, hovers } = watchedConversation()

		fire("dragenter", { target: null })

		expect(hovers).toEqual([])
	})
})

describe("the files a drop hands over", () => {
	it("are staged when they land on the conversation", () => {
		const { fire, dropped, transcript } = watchedConversation()

		const event = fire("drop", {
			target: transcript,
			files: [fileNamed("note.md")],
		})

		expect(dropped).toEqual([["note.md"]])
		expect(event.preventDefault).toHaveBeenCalled()
	})

	it("are left alone when they land beside the conversation", () => {
		const { fire, dropped, roster } = watchedConversation()

		const event = fire("drop", {
			target: roster,
			files: [fileNamed("note.md")],
		})

		expect(dropped).toEqual([])
		expect(event.preventDefault).toHaveBeenCalled()
	})

	it("are left alone when they land on a node a stream replaced", () => {
		const { fire, dropped, transcript, detach } = watchedConversation()

		detach(transcript)
		fire("drop", { target: transcript, files: [fileNamed("note.md")] })

		expect(dropped).toEqual([])
	})

	it("are left to the browser when the drag carries no file", () => {
		const { fire, dropped, transcript } = watchedConversation()

		const event = fire("drop", { target: transcript, types: ["text/plain"] })

		expect(dropped).toEqual([])
		expect(event.preventDefault).not.toHaveBeenCalled()
	})
})

describe("a drag carrying files over the window", () => {
	it("is taken from the browser so the drop reaches the app", () => {
		const { fire, roster } = watchedConversation()

		const event = fire("dragover", { target: roster })

		expect(event.preventDefault).toHaveBeenCalled()
	})

	it("is left to the browser when it carries no file", () => {
		const { fire, transcript } = watchedConversation()

		const event = fire("dragover", {
			target: transcript,
			types: ["text/plain"],
		})

		expect(event.preventDefault).not.toHaveBeenCalled()
	})
})

describe("a conversation no longer watched", () => {
	it("leaves no listener behind, and answers no drag over it", () => {
		const { fire, stop, hovers, dropped, listenerCount, transcript } =
			watchedConversation()

		expect(listenerCount()).toBe(5)
		stop()
		fire("dragenter", { target: transcript })
		fire("drop", { target: transcript, files: [fileNamed("note.md")] })

		expect(listenerCount()).toBe(0)
		expect(hovers).toEqual([])
		expect(dropped).toEqual([])
	})
})
