import { useState } from "react"
import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	DEFAULT_NOTIFICATIONS,
	type Notifications,
} from "@workspace/ui/components/user-settings"
import {
	NotificationFields,
	type NotificationFieldsProps,
} from "@workspace/ui/components/user-settings-dialog/notification-fields"
import { activateLanguage, DEFAULT_LANGUAGE } from "@workspace/ui/lib/i18n"

const NOTHING_NOTIFIED: Notifications = {
	question: false,
	permission: false,
	turn: false,
}

/** The group keeps no switch of its own, so a story that lets a reader flip one
 * holds what the flipping produces. */
const NotificationHost = (props: NotificationFieldsProps) => {
	const [notifications, setNotifications] = useState(props.notifications)

	return (
		<NotificationFields
			{...props}
			notifications={notifications}
			onNotificationsChange={(next) => {
				setNotifications(next)
				props.onNotificationsChange(next)
			}}
		/>
	)
}

const meta = preview.meta({
	title: "Forms/NotificationFields",
	component: NotificationFields,
	render: (args) => (
		<div className="w-[26rem]">
			<NotificationHost {...args} />
		</div>
	),
	parameters: {
		layout: "centered",
		docs: {
			description: {
				component:
					"What a reader is told about, one switch to a moment: a bot asking them a question, a bot asking leave, a bot going quiet. All three start on — a bot that asked something nobody heard waits forever, so silence is only ever something a reader chose. Each row says under its name what turning it off costs, because a switch whose consequence needs a sentence is one nobody should have to guess at. It holds nothing: a flip hands the whole set back to the host, the flipped one among them.",
			},
		},
	},
	args: {
		notifications: DEFAULT_NOTIFICATIONS,
		onNotificationsChange: fn(),
	},
})

export const Default = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The three switches as a reader who has changed nothing finds them: all on. Check that each switch is pressed by its own words as well as its handle, that its sentence is announced with it, and that flipping one hands back all three with that one turned off. Pick `AllOff` for the reader who turned the lot off, `InFrench` for the group once the reader has switched language.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const switches = canvas.getAllByRole("switch")
		await expect(switches).toHaveLength(3)
		for (const control of switches) {
			await expect(control).toBeChecked()
		}

		await userEvent.click(canvas.getByText("A bot asks a question"))
		await expect(args.onNotificationsChange).toHaveBeenCalledWith({
			question: false,
			permission: true,
			turn: true,
		})
		await expect(
			canvas.getByRole("switch", { name: "A bot asks a question" }),
		).not.toBeChecked()
	},
})

export const AllOff = meta.story({
	args: { notifications: NOTHING_NOTIFIED },
	parameters: {
		docs: {
			description: {
				story:
					"The reader who turned all three off, which is the state the sentences under the names are there to warn about: nothing reaches them and a bot waiting on an answer waits in silence. Check that every switch reads as off rather than merely unstyled, and that turning one back on leaves the other two off. Pick `Default` for the state a reader starts in.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		for (const control of canvas.getAllByRole("switch")) {
			await expect(control).not.toBeChecked()
		}

		await userEvent.click(canvas.getByText("A bot finishes its turn"))
		await expect(args.onNotificationsChange).toHaveBeenCalledWith({
			...NOTHING_NOTIFIED,
			turn: true,
		})
		await expect(
			canvas.getByRole("switch", { name: "A bot finishes its turn" }),
		).toBeChecked()
	},
})

export const InFrench = meta.story({
	beforeEach: () => {
		activateLanguage("fr")

		return () => activateLanguage(DEFAULT_LANGUAGE)
	},
	parameters: {
		docs: {
			description: {
				story:
					"The group read in French, where the rows are longest: every name and every sentence under it turns, and the permission row is the one that has to wrap without pushing its switch off the edge. Check that the legend turned too and that each switch stays beside the words it belongs to. Pick `Default` for the English group.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			await canvas.findByRole("group", { name: "Me prévenir quand" }),
		).toBeVisible()
		await expect(
			canvas.getByRole("switch", { name: "Un bot demande une permission" }),
		).toBeVisible()
	},
})
