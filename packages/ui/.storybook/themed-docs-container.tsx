import { DocsContainer } from "@storybook/addon-docs/blocks"
import type { ReactRenderer } from "@storybook/react-vite"
import type { ComponentProps, PropsWithChildren } from "react"
import { useSyncExternalStore } from "react"
import { GLOBALS_UPDATED } from "storybook/internal/core-events"
import type { StoryStore } from "storybook/preview-api"
import { themes } from "storybook/theming"

export const THEME_CLASS_NAMES = { light: "", dark: "dark" }

type ThemeName = keyof typeof THEME_CLASS_NAMES

type DocsContainerProps = PropsWithChildren<
	ComponentProps<typeof DocsContainer>
>

type DocsContext = DocsContainerProps["context"]

type DocsContextInternals = {
	store: Pick<StoryStore<ReactRenderer>, "userGlobals">
}

const THEME_GLOBAL_KEY = "theme"

const readUserGlobals = (context: DocsContext) => {
	const globals = (context as unknown as DocsContextInternals).store
		?.userGlobals?.globals
	if (!globals) {
		throw new Error(
			"Docs container can no longer reach the theme global: the docs context no longer exposes store.userGlobals.globals. Rewrite readUserGlobals against the Storybook version in use.",
		)
	}
	return globals
}

const readThemeName = (context: DocsContext): ThemeName =>
	readUserGlobals(context)[THEME_GLOBAL_KEY] === "dark" ? "dark" : "light"

const readServerThemeName = (): ThemeName => "light"

const useDocsThemeName = (context: DocsContext) =>
	useSyncExternalStore(
		(onStoreChange) => {
			context.channel.on(GLOBALS_UPDATED, onStoreChange)
			return () => context.channel.off(GLOBALS_UPDATED, onStoreChange)
		},
		() => readThemeName(context),
		readServerThemeName,
	)

export const ThemedDocsContainer = ({
	context,
	children,
}: DocsContainerProps) => {
	const themeName = useDocsThemeName(context)

	return (
		<div className={`${THEME_CLASS_NAMES[themeName]} text-foreground`}>
			<DocsContainer context={context} theme={themes[themeName]}>
				{children}
			</DocsContainer>
		</div>
	)
}
