import type { VariantProps } from "class-variance-authority"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	A11Y_CONTRAST_AWAITING_DESIGN_DECISION,
	listExhaustively,
	Row,
} from "@workspace/storybook/story-utils"
import { Button, type buttonVariants } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"

type ButtonVariant = NonNullable<VariantProps<typeof buttonVariants>["variant"]>
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>

const BUTTON_VARIANTS = listExhaustively<ButtonVariant>({
	default: true,
	secondary: true,
	outline: true,
	ghost: true,
	destructive: true,
	link: true,
})

const BUTTON_SIZES = listExhaustively<ButtonSize>({
	xs: true,
	sm: true,
	default: true,
	lg: true,
	"icon-xs": true,
	"icon-sm": true,
	icon: true,
	"icon-lg": true,
})

const isIconSize = (size: ButtonSize) => size.startsWith("icon")

const meta = preview.meta({
	title: "Primitives/Button",
	component: Button,
	parameters: { layout: "centered" },
	args: {
		children: "Button",
		onClick: fn(),
	},
	argTypes: {
		variant: { control: "select", options: BUTTON_VARIANTS },
		size: { control: "select", options: BUTTON_SIZES },
		children: { control: "text" },
		disabled: { control: "boolean" },
	},
})

export const Playground = meta.story({
	play: async ({ args, canvas, userEvent }) => {
		const button = canvas.getByRole("button", { name: "Button" })

		await userEvent.tab()
		await expect(button).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(args.onClick).toHaveBeenCalled()
	},
})

export const Variants = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	render: () => (
		<Row>
			{BUTTON_VARIANTS.map((variant) => (
				<Button key={variant} variant={variant}>
					{variant}
				</Button>
			))}
		</Row>
	),
})

export const Sizes = meta.story({
	render: () => (
		<div className="flex flex-col gap-4">
			<Row>
				{BUTTON_SIZES.filter((size) => !isIconSize(size)).map((size) => (
					<Button key={size} size={size}>
						{size}
					</Button>
				))}
			</Row>
			<Row>
				{BUTTON_SIZES.filter(isIconSize).map((size) => (
					<Button key={size} size={size} aria-label={size}>
						<Icons.Add />
					</Button>
				))}
			</Row>
		</div>
	),
})

export const States = meta.story({
	parameters: {
		pseudo: {
			hover: "#button-hover",
			focusVisible: "#button-focus",
			active: "#button-active",
		},
	},
	render: () => (
		<Row>
			<Button>Default</Button>
			<Button id="button-hover">Hover</Button>
			<Button id="button-focus">Focus</Button>
			<Button id="button-active">Active</Button>
			<Button disabled>Disabled</Button>
		</Row>
	),
})

export const WithIcons = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	render: () => (
		<Row>
			<Button>
				<Icons.Add data-icon="inline-start" />
				Create
			</Button>
			<Button variant="outline">
				Continue
				<Icons.ArrowRight data-icon="inline-end" />
			</Button>
			<Button variant="destructive">
				<Icons.Delete data-icon="inline-start" />
				Delete
			</Button>
			<Button variant="ghost" size="icon" aria-label="Settings">
				<Icons.Settings />
			</Button>
		</Row>
	),
})

export const WithTooltip = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"`tooltip` wraps the button in a `Tooltip` and costs nothing when it is omitted — no wrapper, no listeners. Reach for it on an icon-only control, and give that control an `aria-label` too: the tooltip describes on hover and focus, it does not name. Check that the label opens on hover and on Tab, and that the plain button beside it renders exactly as it did before.",
			},
		},
	},
	render: () => (
		<Row>
			<Button variant="ghost" size="icon-sm" aria-label="Copy" tooltip="Copy">
				<Icons.Copy />
			</Button>
			<Button variant="outline" tooltip="Sends the prompt to Claude">
				Send
			</Button>
			<Button variant="outline">No tooltip</Button>
		</Row>
	),
	play: async ({ canvas }) => {
		const wrapper = canvas.getByRole("button", { name: "Copy" }).parentElement
		const plain = canvas.getByRole("button", { name: "No tooltip" })

		await expect(wrapper?.tagName).toBe("SPAN")
		await expect(wrapper?.parentElement).toBe(plain.parentElement)
	},
})

export const AsLink = meta.story({
	parameters: { a11y: A11Y_CONTRAST_AWAITING_DESIGN_DECISION },
	render: () => (
		<Row>
			<Button nativeButton={false} render={<a href="#button-as-link" />}>
				Anchor button
			</Button>
			<Button
				variant="link"
				nativeButton={false}
				render={<a href="#button-as-link" />}
			>
				Link variant
			</Button>
		</Row>
	),
})
