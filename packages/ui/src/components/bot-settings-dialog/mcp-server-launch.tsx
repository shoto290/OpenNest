"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	readConfigList,
	readConfigPairs,
	readConfigText,
} from "@workspace/ui/components/bot-settings"
import { Button } from "@workspace/ui/components/button"
import { type Icon, Icons } from "@workspace/ui/components/icons"
import { FIELD_LABEL_CLASS } from "@workspace/ui/components/settings-styles"

const HIDDEN_VALUE = "••••••••"

type McpServerLaunchReading = {
	command: string | null
	url: string | null
	environment: { name: string; value: string }[]
}

const readLine = (value: unknown) => readConfigText(value) || null

const readMcpServerLaunch = (
	config: Record<string, unknown>,
): McpServerLaunchReading => {
	const command = readLine(config.command)

	return {
		command: command
			? [command, ...readConfigList(config.args)].join(" ")
			: null,
		url: readLine(config.url),
		environment: readConfigPairs(config.env),
	}
}

type LaunchLineProps = {
	icon: Icon
	text: string
}

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
