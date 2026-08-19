export const listExhaustively = <T extends string>(members: Record<T, true>) =>
	Object.keys(members) as T[]

export const A11Y_CONTRAST_AWAITING_DESIGN_DECISION = {
	config: {
		rules: [{ id: "color-contrast", reviewOnFail: true }],
	},
}

export const Row = ({ children }: { children: React.ReactNode }) => (
	<div className="flex flex-wrap items-center gap-3">{children}</div>
)

/** Every node a component named with `data-slot`, in document order. What a play
 * function reads a rendering through, rather than a class or a tag it does not own. */
export const slotsIn = (root: Element, slot: string) =>
	Array.from(root.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`))

export const botIdentityAvatars = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "bot-identity-avatar")
