"use client"

import { Tabs } from "@base-ui/react/tabs"
import { type ReactNode, useRef } from "react"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import {
	RAIL_ITEM_CLASS,
	SETTINGS_PANEL_CLASS,
	SettingsRail,
	SettingsRailAction,
	SettingsRailBack,
	SettingsRailSeparator,
} from "@workspace/ui/components/settings-rail"
import { Button } from "@workspace/ui/components/ui/button"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
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
	signIn: Icons.ExternalLink,
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
		<li className="flex w-46.5 shrink-0">
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
				<span className="wrap-break-word text-muted-foreground text-xs/4">
					{application.description}
				</span>
				<span className="flex min-w-0 items-center gap-1.25 pt-2 text-muted-foreground text-xs">
					<SetupIcon
						aria-hidden="true"
						className={cn(
							"size-3.25 shrink-0",
							application.setup === "none" && "text-state-connected",
						)}
					/>
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
	<ul className="flex list-none flex-wrap gap-3 p-0">
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
	isAnnounced?: boolean
	action?: ReactNode
}

const CatalogueLine = ({
	icon: LineIcon,
	text,
	isAnnounced = false,
	action,
}: CatalogueLineProps) => (
	<div className="flex items-center gap-2.5 rounded-xl border border-border border-dashed px-3 py-2">
		<LineIcon
			aria-hidden="true"
			className="size-4 shrink-0 text-muted-foreground"
		/>
		<p
			aria-live={isAnnounced ? "polite" : "off"}
			className="min-w-0 flex-1 wrap-break-word text-muted-foreground text-sm"
		>
			{text}
		</p>
		{action}
	</div>
)

type CataloguePageProps = {
	categories: ApplicationCategory[]
	category: string
	onCategoryChange: (category: string) => void
	onBack: () => void
	onPaste: () => void
	className?: string
	children: ReactNode
}

const CataloguePage = ({
	categories,
	category,
	onCategoryChange,
	onBack,
	onPaste,
	className,
	children,
}: CataloguePageProps) => {
	const { t } = useTranslation("bots")

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
			{children}
		</Tabs.Root>
	)
}

type ApplicationsCatalogueProps = Omit<CataloguePageProps, "children"> & {
	query: string
	onQueryChange: (query: string) => void
	curated: CatalogueApplication[]
	registry: CatalogueApplication[]
	publishedCount?: number
	isRegistrySearching?: boolean
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
	isRegistrySearching = false,
	hasRegistryFailed = false,
	onRegistryRetry,
	onPick,
	onBack,
	onPaste,
	className,
}: ApplicationsCatalogueProps) => {
	const { t } = useTranslation("bots")
	const panel = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(panel)
	const typed = query.trim()
	const placeholder = t("applications.catalogue.search.placeholder")

	const registryBody = () => {
		if (typed === "") {
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

		if (isRegistrySearching) {
			return (
				<CatalogueLine
					icon={Icons.Search}
					isAnnounced
					text={t("applications.catalogue.registry.searching")}
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
					isAnnounced
					text={t("applications.catalogue.registry.failed")}
				/>
			)
		}

		if (registry.length > 0) {
			return <CatalogueCards applications={registry} onPick={onPick} />
		}

		return (
			<CatalogueLine
				icon={Icons.Search}
				isAnnounced
				text={
					curated.length === 0
						? t("applications.catalogue.nothing", { query: typed })
						: t("applications.catalogue.registry.empty", { query: typed })
				}
			/>
		)
	}

	return (
		<CataloguePage
			categories={categories}
			category={category}
			className={className}
			onBack={onBack}
			onCategoryChange={onCategoryChange}
			onPaste={onPaste}
		>
			<Tabs.Panel
				className={cn(SETTINGS_PANEL_CLASS, "gap-3.5 overflow-y-auto")}
				ref={panel}
				value={category}
			>
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
				<CatalogueSection
					subtitle={t("applications.catalogue.registry.subtitle")}
					title={t("applications.catalogue.registry.title")}
				>
					{registryBody()}
				</CatalogueSection>
			</Tabs.Panel>
		</CataloguePage>
	)
}

export {
	type ApplicationCategory,
	type ApplicationSetup,
	ApplicationsCatalogue,
	type ApplicationsCatalogueProps,
	type CatalogueApplication,
	CataloguePage,
	type CataloguePageProps,
}
