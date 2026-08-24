import { type ClassValue, clsx } from "clsx"
import type { Ref } from "react"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs))
}

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>) {
	return (node: T | null) => {
		for (const ref of refs) {
			if (typeof ref === "function") ref(node)
			else if (ref) ref.current = node
		}
	}
}
