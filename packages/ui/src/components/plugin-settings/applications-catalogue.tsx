"use client"

import { Tabs } from "@base-ui/react/tabs"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import {
	RAIL_ITEM_CLASS,
	SettingsRail,
	SettingsRailAction,
	SettingsRailBack,
	SettingsRailSeparator,
	SettingsScrollingPanel,
} from "@workspace/ui/components/settings-rail"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type ApplicationSetup = "signIn" | "apiKey" | "none"

type CatalogueApplication = {
	id: string
	name: string
	description: string
	setup: ApplicationSetup
	mark?: string
}

type ApplicationCategory = {
	id: string
	label: string
	count?: number
}

const SETUP_ICON = {
	signIn: Icons.User,
	apiKey: Icons.Key,
	none: Icons.Check,
} as const satisfies Record<ApplicationSetup, Icon>

type CatalogueCardProps = {
	application: CatalogueApplication
	onPick: () => void
}

const CatalogueCard = ({ application, onPick }: CatalogueCardProps) => {
	const { t } = useTranslation("bots")
	const SetupIcon = SETUP_ICON[application.setup]

	return (
		<li className="flex min-w-0">
			<button
				className="flex w-full min-w-0 cursor-pointer flex-col gap-2 rounded-xl border border-border p-3 text-start outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onPick}
				type="button"
			>
				<span className="flex min-w-0 items-center gap-2">
					<ApplicationMark mark={application.mark} size="sm" />
					<span className="truncate font-medium text-foreground text-sm">
						{application.name}
					</span>
				</span>
				<span className="truncate text-muted-foreground text-xs">
					{application.description}
				</span>
				<span className="flex min-w-0 items-center gap-1.25 pt-2 text-muted-foreground text-xs">
					<SetupIcon aria-hidden="true" className="size-3.25 shrink-0" />
					<span className="truncate">
						{t(`applications.catalogue.setup.${application.setup}`)}
					</span>
				</span>
			</button>
		</li>
	)
}

type CatalogueCardsProps = {
	applications: CatalogueApplication[]
	onPick: (application: CatalogueApplication) => void
}

const CatalogueCards = ({ applications, onPick }: CatalogueCardsProps) => (
	<ul className="grid list-none grid-cols-3 gap-3 p-0">
		{applications.map((application) => (
			<CatalogueCard
				application={application}
				key={application.id}
				onPick={() => onPick(application)}
			/>
		))}
	</ul>
)

type CatalogueSectionProps = {
	title: string
	subtitle: string
	children: ReactNode
}

const CatalogueSection = ({
	title,
	subtitle,
	children,
}: CatalogueSectionProps) => (
	<section className="flex shrink-0 flex-col gap-2">
		<div className="flex flex-wrap items-baseline gap-x-2">
			<h3 className="font-medium text-foreground text-sm">{title}</h3>
			<p className="text-muted-foreground text-xs">{subtitle}</p>
		</div>
		{children}
	</section>
)

type CatalogueLineProps = {
	icon: Icon
	text: string
	action?: ReactNode
}

const CatalogueLine = ({
	icon: LineIcon,
	text,
	action,
}: CatalogueLineProps) => (
	<div className="flex items-center gap-2.5 rounded-xl border border-border border-dashed px-3 py-2">
		<LineIcon
			aria-hidden="true"
			className="size-4 shrink-0 text-muted-foreground"
		/>
		<p
			className="min-w-0 flex-1 wrap-break-word text-muted-foreground text-sm"
			role="status"
		>
			{text}
		</p>
		{action}
	</div>
)

type ApplicationsCatalogueProps = {
	categories: ApplicationCategory[]
	category: string
	onCategoryChange: (category: string) => void
	query: string
	onQueryChange: (query: string) => void
	curated: CatalogueApplication[]
	registry: CatalogueApplication[]
	publishedCount?: number
	hasRegistryFailed?: boolean
	onRegistryRetry: () => void
	onPick: (application: CatalogueApplication) => void
	onBack: () => void
	onPaste: () => void
	className?: string
}

const ApplicationsCatalogue = ({
	categories,
	category,
	onCategoryChange,
	query,
	onQueryChange,
	curated,
	registry,
	publishedCount,
	hasRegistryFailed = false,
	onRegistryRetry,
	onPick,
	onBack,
	onPaste,
	className,
}: ApplicationsCatalogueProps) => {
	const { t } = useTranslation("bots")
	const isTyped = query.trim() !== ""
	const placeholder = t("applications.catalogue.search.placeholder")

	const registryBody = () => {
		if (!isTyped) {
			return (
				<CatalogueLine
					icon={Icons.Search}
					text={
						publishedCount === undefined
							? t("applications.catalogue.registry.rest")
							: t("applications.catalogue.registry.restCounted", {
									count: publishedCount,
								})
					}
				/>
			)
		}

		if (hasRegistryFailed) {
			return (
				<CatalogueLine
					action={
						<Button onClick={onRegistryRetry} size="xs" variant="outline">
							{t("applications.catalogue.registry.retry")}
						</Button>
					}
					icon={Icons.Alert}
					text={t("applications.catalogue.registry.failed")}
				/>
			)
		}

		if (registry.length > 0) {
			return <CatalogueCards applications={registry} onPick={onPick} />
		}

		if (curated.length === 0) {
			return (
				<CatalogueLine
					icon={Icons.Search}
					text={t("applications.catalogue.nothing", { query: query.trim() })}
				/>
			)
		}

		return null
	}

	const registrySection = registryBody()

	return (
		<Tabs.Root
			className={cn("flex min-h-0 flex-1", className)}
			onValueChange={onCategoryChange}
			orientation="vertical"
			value={category}
		>
			<SettingsRail
				iconsOnly={false}
				leading={
					<>
						<SettingsRailBack
							iconsOnly={false}
							label={t("applications.back")}
							onClick={onBack}
						/>
						<SettingsRailSeparator />
					</>
				}
				trailing={
					<>
						<SettingsRailSeparator />
						<SettingsRailAction
							icon={Icons.Json}
							iconsOnly={false}
							label={t("applications.paste")}
							onClick={onPaste}
						/>
					</>
				}
			>
				{categories.map((entry) => (
					<Tabs.Tab className={RAIL_ITEM_CLASS} key={entry.id} value={entry.id}>
						<span className="min-w-0 flex-1 wrap-break-word text-start">
							{entry.label}
						</span>
						{entry.count === undefined ? null : (
							<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
								{entry.count}
							</span>
						)}
					</Tabs.Tab>
				))}
			</SettingsRail>

			<div className="flex min-h-0 min-w-0 flex-1 flex-col">
				<div className="flex shrink-0 items-center border-border border-b px-5 py-3">
					<h2 className="truncate font-medium text-foreground text-sm">
						{t("applications.catalogue.title")}
					</h2>
				</div>
				<SettingsScrollingPanel value={category}>
					<label className="flex min-h-9 shrink-0 items-center gap-2 rounded-xl border border-input px-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
						<Icons.Search
							aria-hidden="true"
							className="size-4 shrink-0 text-muted-foreground"
						/>
						<input
							aria-label={placeholder}
							className="min-w-0 flex-1 bg-transparent text-foreground text-sm outline-none placeholder:text-muted-foreground"
							onChange={(event) => onQueryChange(event.target.value)}
							placeholder={placeholder}
							type="text"
							value={query}
						/>
						<span className="min-w-0 truncate text-muted-foreground text-xs">
							{t("applications.catalogue.search.hint")}
						</span>
					</label>
					{curated.length > 0 ? (
						<CatalogueSection
							subtitle={t("applications.catalogue.curated.subtitle")}
							title={t("applications.catalogue.curated.title")}
						>
							<CatalogueCards applications={curated} onPick={onPick} />
						</CatalogueSection>
					) : null}
					{registrySection ? (
						<CatalogueSection
							subtitle={t("applications.catalogue.registry.subtitle")}
							title={t("applications.catalogue.registry.title")}
						>
							{registrySection}
						</CatalogueSection>
					) : null}
				</SettingsScrollingPanel>
			</div>
		</Tabs.Root>
	)
}

export {
	type ApplicationCategory,
	type ApplicationSetup,
	ApplicationsCatalogue,
	type ApplicationsCatalogueProps,
	type CatalogueApplication,
}
