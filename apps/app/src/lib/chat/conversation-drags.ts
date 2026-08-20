const FILES = "Files"

const carriesFiles = (event: DragEvent) =>
	Boolean(event.dataTransfer?.types.includes(FILES))

export type ConversationDragsPort = {
	/** The region the conversation occupies, as the layout hands it back. A drag
	 * over the roster beside it is not one this composer answers. */
	conversation: { current: HTMLElement | null }
	/** Whether the composer should wear the drop mark. */
	onHover: (isOver: boolean) => void
	onDrop: (files: File[]) => void
}

/**
 * The window drags a conversation answers, watched until the returned call ends
 * it — which also puts the mark out, so a watcher rebuilt under a drag hands the
 * next one a composer that is not still lit.
 *
 * Every file drop over the window is taken from the browser — an unhandled one
 * navigates the webview away from the app — and only the ones over the
 * conversation are handed on.
 *
 * The mark rides a depth count rather than the last event seen: crossing from one
 * element to another enters the next before it leaves the previous, so a lone
 * `dragleave` says nothing about having left. The count follows every element the
 * drag is over, inside the conversation or beside it, because a leave reported on
 * a node a stream has replaced — or on no element at all — still has to bring it
 * down: an OS drag raises `dragend` on nothing, so a count left standing would
 * never come down again.
 */
export const watchConversationDrags = ({
	conversation,
	onHover,
	onDrop,
}: ConversationDragsPort) => {
	let depth = 0
	let isOver = false

	const isInside = (target: EventTarget | null) =>
		target instanceof Node && Boolean(conversation.current?.contains(target))

	const mark = (next: boolean) => {
		if (next === isOver) {
			return
		}
		isOver = next
		onHover(next)
	}

	const settle = () => {
		depth = 0
		mark(false)
	}

	const handlers: Record<string, (event: DragEvent) => void> = {
		dragover: (event) => {
			if (carriesFiles(event)) {
				event.preventDefault()
			}
		},
		dragenter: (event) => {
			if (!carriesFiles(event)) {
				return
			}
			depth += 1
			mark(isInside(event.target))
		},
		dragleave: (event) => {
			if (!carriesFiles(event)) {
				return
			}
			depth = Math.max(depth - 1, 0)
			if (depth === 0) {
				mark(false)
			}
		},
		dragend: settle,
		drop: (event) => {
			if (!carriesFiles(event)) {
				return
			}
			// The composer takes what is dropped on itself, and says so by preventing
			// the default before this listener sees the event.
			const taken = event.defaultPrevented
			event.preventDefault()
			settle()
			if (taken || !isInside(event.target)) {
				return
			}
			onDrop(Array.from(event.dataTransfer?.files ?? []))
		},
	}

	const entries = Object.entries(handlers) as [string, EventListener][]
	for (const [type, handler] of entries) {
		window.addEventListener(type, handler)
	}

	return () => {
		for (const [type, handler] of entries) {
			window.removeEventListener(type, handler)
		}
		settle()
	}
}
