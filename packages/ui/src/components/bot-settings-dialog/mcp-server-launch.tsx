"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import { isConfigObject } from "@workspace/ui/components/bot-settings"
import { Button } from "@workspace/ui/components/button"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { FIELD_LABEL_CLASS } from "@workspace/ui/components/settings-styles"

/** The mask an environment value wears until it is asked for. A fixed run of dots
 * rather than one per character: the length of a token is itself worth hiding. */
const HIDDEN_VALUE = "••••••••"

type McpServerLaunchReading = {
	/** The whole command line, ready to read: the program and its arguments, spaced
	 * the way a shell would show them. */
	command: string | null
	url: string | null
	environment: { name: string; value: string }[]
}

const readText = (value: unknown) =>
	typeof value === "string" && value.length > 0 ? value : null

const readArguments = (value: unknown) =>
	Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : []

const readEnvironment = (value: unknown) =>
	isConfigObject(value)
		? Object.entries(value).map(([name, entry]) => ({
				name,
				value: typeof entry === "string" ? entry : JSON.stringify(entry),
			}))
		: []

/**
 * The keys a configuration is understood by, read off whatever else it holds. It
 * recognises rather than validates: a key it does not know is left alone, because the
 * shape belongs to the transport and this side is only here to say what will happen.
 */
const readMcpServerLaunch = (
	config: Record<string, unknown>,
): McpServerLaunchReading => {
	const command = readText(config.command)

	return {
		command: command
			? [command, ...readArguments(config.args)].join(" ")
			: null,
		url: readText(config.url),
		environment: readEnvironment(config.env),
	}
}

type LaunchLineProps = {
	icon: Icon
	text: string
}

/** The one thing that will happen, said in the terms it will happen in. It wraps
 * rather than truncates: a reader has to see all of what is about to run. */
const LaunchLine = ({ icon: LineIcon, text }: LaunchLineProps) => (
	<p className="flex items-start gap-2 text-foreground text-xs">
		<LineIcon
			aria-hidden="true"
			className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
		/>
		<span className="min-w-0 break-all font-mono">{text}</span>
	</p>
)

type McpServerLaunchProps = {
	config: Record<string, unknown>
}

/**
 * What the configuration above it actually means, in the two terms a reader can act
 * on: the command line that will run on their machine, or the address that will be
 * reached, and the environment it carries.
 *
 * It exists because the configuration is edited as raw JSON — the shape is the
 * transport's to define, so a form of fixed fields would refuse the next kind of
 * server the day it arrives. What a form would have given for free, this gives back:
 * the reader sees the program before it starts.
 *
 * Every environment value is masked. An environment is where a token is pasted, and
 * this panel opens over whatever screen is being shared; a value is shown for one
 * variable at a time, and only once it is asked for.
 */
const McpServerLaunch = ({ config }: McpServerLaunchProps) => {
	const { t } = useTranslation("bots")
	const [revealed, setRevealed] = useState<string[]>([])
	const { command, url, environment } = readMcpServerLaunch(config)

	const toggle = (name: string) =>
		setRevealed(
			revealed.includes(name)
				? revealed.filter((entry) => entry !== name)
				: [...revealed, name],
		)

	return (
		<section className="flex shrink-0 flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
			<h3 className={FIELD_LABEL_CLASS}>{t("mcp.launch.label")}</h3>

			{command ? <LaunchLine icon={Icons.Terminal} text={command} /> : null}

			{url ? <LaunchLine icon={Icons.Web} text={url} /> : null}

			{!command && !url ? (
				<p className="text-muted-foreground text-xs leading-relaxed">
					{t("mcp.launch.unknown")}
				</p>
			) : null}

			{environment.length > 0 ? (
				<>
					<h4 className="pt-1 font-medium text-muted-foreground text-xs">
						{t("mcp.launch.environment")}
					</h4>
					<ul className="flex list-none flex-col gap-1 p-0">
						{environment.map((variable) => {
							const isRevealed = revealed.includes(variable.name)

							return (
								<li className="flex items-center gap-2" key={variable.name}>
									<span className="shrink-0 font-mono text-foreground text-xs">
										{variable.name}
									</span>
									<span className="min-w-0 flex-1 truncate font-mono text-muted-foreground text-xs">
										{isRevealed ? variable.value : HIDDEN_VALUE}
									</span>
									<Button
										aria-label={t(
											isRevealed ? "mcp.launch.conceal" : "mcp.launch.reveal",
											{ name: variable.name },
										)}
										onClick={() => toggle(variable.name)}
										size="icon-xs"
										variant="ghost"
									>
										{isRevealed ? (
											<Icons.Conceal aria-hidden="true" />
										) : (
											<Icons.Reveal aria-hidden="true" />
										)}
									</Button>
								</li>
							)
						})}
					</ul>
				</>
			) : null}
		</section>
	)
}

export {
	McpServerLaunch,
	type McpServerLaunchProps,
	type McpServerLaunchReading,
	readMcpServerLaunch,
}
