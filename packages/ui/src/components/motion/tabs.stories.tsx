import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	Tabs,
	TabsContent,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/motion/tabs"

const SECTIONS = [
	{ value: "framework", label: "Framework", body: "Next.js, Vite or Remix." },
	{ value: "scope", label: "Scope", body: "Which surfaces the change covers." },
	{ value: "release", label: "Release", body: "Now, or after the audit." },
]

const meta = preview.meta({
	title: "Navigation/Tabs",
	component: Tabs,
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"One panel at a time out of a small, named set, with the indicator gliding from the tab it leaves to the one it lands on — every trigger shares one layout id, and the indicator lands without travelling when the reader asked for no motion. Three shapes: `pill` for a row that floats on its own, `segment` for a control that reads as one block, `underline` for a header the panel hangs from. Every trigger is a button, so Tab travels them one by one; the group holds the value itself unless a `value` is passed.",
			},
		},
	},
	args: { children: null, onValueChange: fn() },
})

const Row = ({ variant }: { variant: "pill" | "segment" | "underline" }) => (
	<Tabs className="w-80" defaultValue="framework" variant={variant}>
		<TabsList>
			{SECTIONS.map((section) => (
				<TabsTrigger key={section.value} value={section.value}>
					{section.label}
				</TabsTrigger>
			))}
		</TabsList>
		{SECTIONS.map((section) => (
			<TabsContent key={section.value} value={section.value}>
				<p className="text-muted-foreground text-sm">{section.body}</p>
			</TabsContent>
		))}
	</Tabs>
)

export const Variants = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three shapes against each other, so the choice is made by eye. Check that the indicator glides rather than blinking on every one, that the inactive labels stay legible instead of fading out, and that the panel under the row swaps without the row moving.",
			},
		},
	},
	render: () => (
		<div className="grid gap-8">
			<Row variant="pill" />
			<Row variant="segment" />
			<Row variant="underline" />
		</div>
	),
})

export const Still = meta.story({
	args: { defaultValue: "framework", isAnimated: false, variant: "pill" },
	render: (args) => (
		<Tabs {...args}>
			<TabsList>
				{SECTIONS.map((section) => (
					<TabsTrigger key={section.value} value={section.value}>
						{section.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The same row with `isAnimated` false: the indicator is drawn on the tab it belongs to instead of travelling there. Reach for this where the tabs are one section of a surface that must not move under the reader — a pending tool card docked above the composer. Check that the selected tab is marked as firmly as in `Variants`, and that nothing else about the row changes.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("tab", { name: "Release" }))
		await expect(canvas.getByRole("tab", { name: "Release" })).toHaveAttribute(
			"aria-selected",
			"true",
		)
	},
})

export const Keyboard = meta.story({
	args: { defaultValue: "framework", variant: "pill" },
	render: (args) => (
		<Tabs {...args}>
			<TabsList>
				{SECTIONS.map((section) => (
					<TabsTrigger key={section.value} value={section.value}>
						{section.label}
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The row on its own, without a panel under it: every trigger is a tab stop, Tab walks them one by one and Space selects the one focused. Check that selecting keeps focus on the tab rather than throwing it into the panel, and that only one tab ever reads as selected.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.tab()
		await userEvent.tab()

		const scope = canvas.getByRole("tab", { name: "Scope" })
		await expect(scope).toHaveFocus()

		await userEvent.keyboard(" ")
		await expect(args.onValueChange).toHaveBeenCalledWith("scope")
		await expect(scope).toHaveAttribute("aria-selected", "true")
		await expect(
			canvas.getByRole("tab", { name: "Framework" }),
		).toHaveAttribute("aria-selected", "false")
	},
})
