import { useEffect, useRef } from "react"

export const SPACE_RANK_LIMIT = 9

export const spaceRankOf = ({ key, metaKey }: KeyboardEvent) => {
	const rank = Number(key)
	if (!metaKey || !Number.isInteger(rank)) return 0
	return rank >= 1 && rank <= SPACE_RANK_LIMIT ? rank : 0
}

type SpaceShortcut = {
	count: number
	isEnabled: boolean
	onRank: (rank: number) => void
}

export const useSpaceShortcut = ({
	count,
	isEnabled,
	onRank,
}: SpaceShortcut) => {
	const reach = useRef(onRank)
	reach.current = onRank

	useEffect(() => {
		if (!isEnabled || count === 0) return

		const pick = (event: KeyboardEvent) => {
			const rank = spaceRankOf(event)
			if (rank === 0 || rank > count) return
			event.preventDefault()
			reach.current(rank)
		}

		window.addEventListener("keydown", pick, true)
		return () => window.removeEventListener("keydown", pick, true)
	}, [count, isEnabled])
}
