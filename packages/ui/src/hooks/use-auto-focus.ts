import { useEffect, useRef } from "react"

export const useAutoFocus = <Element extends HTMLElement>(isEnabled = true) => {
	const ref = useRef<Element>(null)

	useEffect(() => {
		if (isEnabled) ref.current?.focus()
	}, [isEnabled])

	return ref
}
