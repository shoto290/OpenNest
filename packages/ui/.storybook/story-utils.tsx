export const listExhaustively = <T extends string>(members: Record<T, true>) =>
	Object.keys(members) as T[]

export const Row = ({ children }: { children: React.ReactNode }) => (
	<div className="flex flex-wrap items-center gap-3">{children}</div>
)
