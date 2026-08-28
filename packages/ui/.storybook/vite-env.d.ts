/// <reference types="vite/client" />

declare module "virtual:/@storybook/builder-vite/project-annotations.js" {
	import type { setProjectAnnotations } from "storybook/preview-api"

	export const getProjectAnnotations: () => Parameters<
		typeof setProjectAnnotations
	>[0]
}
