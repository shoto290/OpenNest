"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { SettingsGroup } from "@workspace/ui/components/settings-group"
import { FIELD_OPTION_CLASS } from "@workspace/ui/components/settings-styles"
import {
	COLOR_SCHEME_IDS,
	type ColorScheme,
} from "@workspace/ui/components/user-settings"
import { PALETTE_IDS, type Palette } from "@workspace/ui/lib/palettes"
import { cn } from "@workspace/ui/lib/utils"

const SCHEME_ICONS: Record<ColorScheme, Icon> = {
	light: Icons.LightScheme,
	dark: Icons.DarkScheme,
	system: Icons.SystemScheme,
}

/** One named scheme on a row of them, its icon above its name. */
const OPTION_CLASS = cn(FIELD_OPTION_CLASS, "gap-1.5 px-2 py-3 text-xs")

/** A tile drawn in the palette it offers. Its edge is that palette's own primary
 * once chosen, so the mark that says "this one" is itself a sample of the choice. */
const VIGNETTE_CLASS =
	"flex cursor-pointer flex-col gap-1.5 rounded-xl border border-border bg-background p-1.5 text-foreground hover:border-primary/50 has-[:checked]:border-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"

/** The app in miniature: the sidebar down the left, a heading and two lines of
 * text beside it. Every band is a token read live from the palette the tile names,
 * never a colour copied out of it — so a palette repainted in the stylesheet is
 * repainted here, in both schemes, with nothing to keep in sync. */
const PaletteVignette = () => (
	<span
		aria-hidden="true"
		className="flex h-14 overflow-hidden rounded-lg border border-border"
	>
		<span className="flex w-1/3 flex-col gap-1 bg-sidebar p-1.5">
			<span className="h-1.5 rounded-full bg-sidebar-primary" />
			<span className="h-1.5 w-2/3 rounded-full bg-sidebar-accent" />
		</span>
		<span className="flex flex-1 flex-col gap-1 bg-background p-1.5">
			<span className="h-1.5 w-3/4 rounded-full bg-primary" />
			<span className="h-1.5 rounded-full bg-muted" />
			<span className="h-1.5 w-1/2 rounded-full bg-muted" />
		</span>
	</span>
)

type AppearanceFieldsProps = {
	colorScheme: ColorScheme
	palette: Palette
	onColorSchemeChange: (colorScheme: ColorScheme) => void
	onPaletteChange: (palette: Palette) => void
	/** Two palettes a row instead of three — what a panel has room for once the rail
	 * beside it has dropped to its icons. */
	compact?: boolean
	className?: string
}

/**
 * How the app is painted: the scheme it follows, then the six palettes as tiles that
 * each paint themselves in what they offer. Nothing is folded away behind a popover
 * — a reader comparing two palettes sees both at once, in the scheme they are
 * reading in.
 */
const AppearanceFields = ({
	colorScheme,
	palette,
	onColorSchemeChange,
	onPaletteChange,
	compact = false,
	className,
}: AppearanceFieldsProps) => {
	const { t } = useTranslation("settings")
	const groupId = useId()

	return (
		<div
			className={cn("flex flex-col gap-5", className)}
			data-slot="appearance-fields"
		>
			<SettingsGroup
				grid="grid-cols-3 gap-1.5"
				label={t("appearance.scheme.label")}
			>
				{COLOR_SCHEME_IDS.map((scheme) => {
					const SchemeIcon = SCHEME_ICONS[scheme]

					return (
						<label className={OPTION_CLASS} key={scheme}>
							<input
								checked={colorScheme === scheme}
								className="sr-only"
								name={`${groupId}-scheme`}
								onChange={() => onColorSchemeChange(scheme)}
								type="radio"
								value={scheme}
							/>
							<SchemeIcon aria-hidden="true" className="size-4" />
							<span>{t(`appearance.scheme.option.${scheme}`)}</span>
						</label>
					)
				})}
			</SettingsGroup>

			<SettingsGroup
				grid={cn("gap-2", compact ? "grid-cols-2" : "grid-cols-3")}
				label={t("appearance.palette.label")}
			>
				{PALETTE_IDS.map((id) => (
					<label
						className={VIGNETTE_CLASS}
						data-slot="palette-vignette"
						data-theme={id}
						key={id}
					>
						<input
							checked={palette === id}
							className="sr-only"
							name={`${groupId}-palette`}
							onChange={() => onPaletteChange(id)}
							type="radio"
							value={id}
						/>
						<PaletteVignette />
						<span className="flex items-center justify-between gap-1 px-0.5 text-xs">
							<span className="truncate">
								{t(`appearance.palette.option.${id}`)}
							</span>
							{palette === id ? (
								<Icons.Check
									aria-hidden="true"
									className="size-3.5 shrink-0 text-primary"
								/>
							) : null}
						</span>
					</label>
				))}
			</SettingsGroup>
		</div>
	)
}

export { AppearanceFields, type AppearanceFieldsProps }
