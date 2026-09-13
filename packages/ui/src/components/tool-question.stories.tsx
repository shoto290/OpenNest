import { expect, fn, spyOn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { slotIn } from "@workspace/storybook/story-utils"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import {
	Message,
	MessageAuthor,
	MessageAvatar,
	MessageContent,
} from "@workspace/ui/components/message"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import {
	ToolQuestion,
	type ToolQuestionItem,
	type ToolQuestionProps,
} from "@workspace/ui/components/tool-question"

const FRAMEWORK_QUESTION: ToolQuestionItem = {
	question: "Which framework should the dashboard use?",
	header: "Framework",
	options: [
		{
			label: "Next.js",
			description: "Server rendering and routing out of the box.",
			preview: "bun create next-app dashboard",
		},
		{
			label: "Vite",
			description: "A thin dev server, no framework opinions.",
			preview: "bun create vite dashboard",
		},
		{
			label: "Remix",
			description: "Nested routes with loaders on every level.",
		},
	],
}

const SCOPE_QUESTION: ToolQuestionItem = {
	question: "Which surfaces should the migration cover?",
	header: "Scope",
	multiSelect: true,
	options: [
		{ label: "Chat", description: "The transcript and its composer." },
		{ label: "Settings", description: "Every panel of the settings dialog." },
		{ label: "Onboarding", description: "The first-run screens only." },
		{ label: "Marketing", description: "The public site, out of the app." },
	],
}

const NAMING_QUESTION: ToolQuestionItem = {
	question: "What should the package be called?",
	header: "Naming",
	options: [
		{ label: "@workspace/tokens", description: "Matches the ui package." },
		{ label: "@workspace/design", description: "Wider than tokens alone." },
	],
}

const RELEASE_QUESTION: ToolQuestionItem = {
	question: "When should it ship?",
	header: "Release",
	options: [
		{ label: "Now", description: "Cut a release from this branch." },
		{ label: "Next week", description: "Wait for the audit to land." },
	],
}

const meta = preview.meta({
	title: "Conversation/Tools/ToolQuestion",
	component: ToolQuestion,
	parameters: {
		docs: {
			description: {
				component:
					"The surface of one `AskUserQuestion` call: one to four questions, answered in a single pass and submitted once. Only one question is ever on screen — the others wait behind their own tab, which carries a check once it holds an answer — because four question at once is a wall nobody reads. Answering a single-select question moves the card to the next one still waiting, and the primary button reads `Next question` until none is left to wait for.\n\nEvery option is one box, and the whole box is the target: the label, the description, the padding around them. Every question also takes a free-text answer, exclusive with the options — typing clears the picks, picking clears the text. The card reports one string per question: the picked labels joined by `, `, or the typed text.",
			},
		},
	},
	args: {
		questions: [FRAMEWORK_QUESTION],
		onAnswer: fn(),
		onDeny: fn(),
	},
	decorators: [
		(Story) => (
			<div className="mx-auto max-w-xl">
				<Story />
			</div>
		),
	],
})

export const SingleSelect = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"One question that holds at most one answer: picking a second option replaces the first rather than adding to it. Reach for this to check the whole box picks the option — click the description, the padding, anywhere but the preview — that hovering a box says so before the click, and that the preview appears only under the picked option.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const submit = canvas.getByRole("button", { name: /send answers/i })
		await expect(submit).toBeDisabled()

		await userEvent.click(
			canvas.getByText("Server rendering and routing out of the box."),
		)
		await expect(
			canvas.getByText("bun create next-app dashboard"),
		).toBeVisible()

		await userEvent.click(canvas.getByRole("radio", { name: /Vite/ }))
		await expect(
			canvas.queryByText("bun create next-app dashboard"),
		).not.toBeInTheDocument()

		await userEvent.click(submit)
		await expect(args.onAnswer).toHaveBeenCalledTimes(1)
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "Vite",
		})

		await userEvent.click(canvas.getByRole("button", { name: /dismiss/i }))
		await expect(args.onDeny).toHaveBeenCalledTimes(1)
	},
})

export const MultiSelect = meta.story({
	args: { questions: [SCOPE_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"The same question with `multiSelect` true: several options hold at once and the answer is their labels joined by `, `, in the order they were picked. Check that picking a second option keeps the first, that picking a held option lets it go, and that the card stays put — a question still being built must not be taken as done.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("checkbox", { name: /Chat/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Onboarding/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Marketing/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Marketing/ }))

		await userEvent.click(canvas.getByRole("button", { name: /send answers/i }))
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[SCOPE_QUESTION.question]: "Chat, Onboarding",
		})
	},
})

export const FreeText = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"The answer the call never offered. Every question carries a free-text field under its options, and what is typed there is reported as the whole answer — it is not a note attached to a pick. Check that typing drops whatever was picked, that the keyboard alone reaches the options, the field and the submit control, and that the answer is the typed text verbatim.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await userEvent.click(canvas.getByRole("radio", { name: /Remix/ }))

		await userEvent.type(
			canvas.getByLabelText("Other answer"),
			"TanStack Start, once it is stable",
		)
		await expect(canvas.getByRole("radio", { name: /Remix/ })).toHaveAttribute(
			"aria-checked",
			"false",
		)

		await userEvent.tab()
		await expect(
			canvas.getByRole("button", { name: /send answers/i }),
		).toHaveFocus()
		await userEvent.keyboard("{Enter}")

		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "TanStack Start, once it is stable",
		})
	},
})

export const KeyboardOnly = meta.story({
	args: { questions: [SCOPE_QUESTION, RELEASE_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"The card as a docked surface reached without the mouse: it is a form that takes focus the moment it appears, so the reader never hunts for it above the composer. Enter does exactly what the primary button does — it hands over the next question still waiting, and sends the answers once none is. Enter on a question holding nothing does nothing, and every control that already answers to Enter — an option, a tab, the free-text field, a footer button — keeps its own behaviour.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const card = canvas.getByRole("form")
		await expect(card).toHaveFocus()

		await userEvent.keyboard("{Enter}")
		await expect(args.onAnswer).not.toHaveBeenCalled()
		await expect(canvas.getByText(SCOPE_QUESTION.question)).toBeVisible()

		await userEvent.click(canvas.getByRole("checkbox", { name: /Chat/ }))
		await expect(
			canvas.getByRole("button", { name: /next question/i }),
		).toBeEnabled()

		card.focus()
		await userEvent.keyboard("{Enter}")
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()

		await userEvent.click(canvas.getByRole("radio", { name: /Now/ }))
		await expect(
			canvas.getByRole("button", { name: /send answers/i }),
		).toBeEnabled()

		card.focus()
		await userEvent.keyboard("{Enter}")
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[SCOPE_QUESTION.question]: "Chat",
			[RELEASE_QUESTION.question]: "Now",
		})
	},
})

export const FourQuestions = meta.story({
	args: {
		questions: [
			FRAMEWORK_QUESTION,
			SCOPE_QUESTION,
			NAMING_QUESTION,
			RELEASE_QUESTION,
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The widest call the tool can make: four questions under four tabs, one on screen at a time. The primary button carries the reader through them: it reads `Next question` while another question still waits, and only becomes `Send answers` on the last one, so nothing is sent half-answered. Check that answering a single-select question hands over the next by itself, that the button is refused until the question on screen holds an answer, that a tab can be reached in any order once the reader wants to change an answer, that an answered tab carries its check, and that the send reports all four at once, keyed by question.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const primary = () =>
			canvas.getByRole("button", { name: /next question|send answers/i })

		await expect(canvas.getAllByRole("tab")).toHaveLength(4)
		await expect(primary()).toBeDisabled()

		await userEvent.click(canvas.getByRole("radio", { name: /Next\.js/ }))
		await expect(canvas.getByText(SCOPE_QUESTION.question)).toBeVisible()
		await expect(
			canvas.queryByText(FRAMEWORK_QUESTION.question),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("checkbox", { name: /Settings/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Chat/ }))
		await expect(primary()).toHaveAccessibleName(/next question/i)

		await userEvent.click(primary())
		await expect(canvas.getByText(NAMING_QUESTION.question)).toBeVisible()

		await userEvent.type(
			canvas.getByLabelText("Other answer"),
			"@workspace/foundations",
		)
		await userEvent.click(primary())
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()
		await expect(primary()).toBeDisabled()

		await userEvent.click(canvas.getByRole("tab", { name: /framework/i }))
		await expect(
			canvas.getByRole("radio", { name: /Next\.js/ }),
		).toHaveAttribute("aria-checked", "true")

		await userEvent.click(canvas.getByRole("tab", { name: /release/i }))
		await userEvent.click(canvas.getByRole("radio", { name: /Next week/ }))
		await expect(primary()).toHaveAccessibleName(/send answers/i)

		await userEvent.click(primary())
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "Next.js",
			[SCOPE_QUESTION.question]: "Settings, Chat",
			[NAMING_QUESTION.question]: "@workspace/foundations",
			[RELEASE_QUESTION.question]: "Next week",
		})
	},
})

export const Narrow = meta.story({
	args: {
		questions: [
			FRAMEWORK_QUESTION,
			SCOPE_QUESTION,
			NAMING_QUESTION,
			RELEASE_QUESTION,
		],
	},
	parameters: {
		docs: {
			description: {
				story:
					"The four-tab card in a 320px column, the narrowest surface a transcript ever hands it. Check that the tab strip wraps over several lines inside the column rather than pushing a tab out of it, that every tab is still reachable by pointer and by arrow key, and that an option below still takes a press and hands the card over to the next question waiting. Pick `FourQuestions` for the same card with room to spread.",
			},
		},
	},
	render: (args) => (
		<div className="w-[320px]">
			<ToolQuestion {...args} />
		</div>
	),
	play: async ({ canvas, canvasElement, userEvent }) => {
		const column = canvasElement.querySelector("div")
		const tabs = canvas.getAllByRole("tab")
		const bounds = column?.getBoundingClientRect()
		if (!bounds) throw new Error("The card drew no column")

		for (const tab of tabs) {
			await expect(tab.getBoundingClientRect().right).toBeLessThanOrEqual(
				bounds.right,
			)
		}

		await userEvent.click(canvas.getByRole("tab", { name: /release/i }))
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()

		await userEvent.click(
			await canvas.findByRole("radio", { name: /Next week/ }),
		)
		await expect(canvas.getByText(FRAMEWORK_QUESTION.question)).toBeVisible()
	},
})

export const ArrowKeyTabs = meta.story({
	args: { questions: [SCOPE_QUESTION, RELEASE_QUESTION, FRAMEWORK_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"The tab strip walked with the arrow keys. A tab here changes nothing but which question is on screen, so walking is opening: the arrows select as they move and the card follows without a second press. Check that the question under the strip is the one the arrows landed on. The search palette does the opposite, because a tab there starts a query.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		await expect(canvas.getByText(SCOPE_QUESTION.question)).toBeVisible()

		canvas.getByRole("tab", { name: SCOPE_QUESTION.header }).focus()
		await userEvent.keyboard("{ArrowRight}")

		await expect(
			canvas.getByRole("tab", { name: RELEASE_QUESTION.header }),
		).toHaveAttribute("aria-selected", "true")
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()
	},
})

export const ReducedMotion = meta.story({
	args: { questions: [SCOPE_QUESTION, RELEASE_QUESTION] },
	parameters: {
		docs: {
			description: {
				story:
					"The card for a reader who asked the system to stop moving things. The registry tab transitions every property it changes; the card drops that under `prefers-reduced-motion`, so the fill moves from one tab to the next in a single frame. Check that every tab reports a transition of no duration, and that the strip still selects.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const tabs = canvas.getAllByRole("tab")

		for (const tab of tabs) {
			await expect(getComputedStyle(tab).transitionDuration).toBe("0s")
		}

		await userEvent.click(
			canvas.getByRole("tab", { name: RELEASE_QUESTION.header }),
		)
		await expect(canvas.getByText(RELEASE_QUESTION.question)).toBeVisible()
	},
})

const SHOTO: MessageAuthor = {
	id: "bot-shoto",
	name: "Shoto",
	animal: "koala",
	blot: "green",
}

const askedByShoto = (args: ToolQuestionProps) => (
	<Message from="assistant">
		<MessageAvatar>
			<BotIdentityAvatar
				animal={SHOTO.animal}
				blot={SHOTO.blot}
				name={SHOTO.name}
				seed={SHOTO.id}
				size={28}
			/>
		</MessageAvatar>
		<MessageContent>
			<MessageAuthor author={SHOTO} />
			<MessageBubble>
				<MessageBubbleContent>
					<ToolQuestion {...args} />
				</MessageBubbleContent>
			</MessageBubble>
		</MessageContent>
	</Message>
)

const expectAskedByShoto = async (canvasElement: HTMLElement, step: string) => {
	const bubble = slotIn(canvasElement, "message-bubble-content")

	await expect(slotIn(canvasElement, "message-avatar")).toBeVisible()
	await expect(slotIn(canvasElement, "message-author")).toHaveTextContent(
		"Shoto",
	)
	await expect(within(bubble).getByText(step)).toBeVisible()
}

const tokenColor = (token: string) => {
	const probe = document.createElement("div")
	probe.style.backgroundColor = `var(${token})`
	document.body.append(probe)
	const color = getComputedStyle(probe).backgroundColor
	probe.remove()
	return color
}

const SIGN_IN_URL =
	"claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&scope=user%3Ainference&state=8f3c1a"

const SIGN_IN_CODE = "Xk3nQ8#7f2a1c4e"

const WELCOME_STEP: ToolQuestionItem = {
	question: "Ready to start?",
	header: "Setup",
	optionsOnly: true,
	options: [
		{ label: "Start", description: "Three steps, about a minute." },
		{
			label: "Tell me more first",
			description: "What Kiroshi is, before you connect anything.",
		},
	],
}

const ACCOUNT_STEP: ToolQuestionItem = {
	question: "Use the account already on this machine?",
	header: "Your Claude account",
	optionsOnly: true,
	options: [
		{
			label: "Use this account",
			description:
				"Signed in with your Claude subscription, under your own login.",
		},
		{
			label: "Use another account",
			description: "Sign in again with a different one.",
		},
	],
}

const ACCESS_STEP: ToolQuestionItem = {
	question: "How do you want to connect?",
	header: "Your Claude account",
	optionsOnly: true,
	options: [
		{
			label: "Sign in with Claude",
			description:
				"Opens your browser once. Works with your Pro or Max subscription.",
		},
		{
			label: "Paste an API key",
			description: "Pay per use, with nothing to sign in to.",
		},
	],
}

const pasteKeyInstead = fn()

const CODE_STEP: ToolQuestionItem = {
	question: "Paste the code Claude gave you",
	header: "Sign in",
	options: [],
	link: { label: "Open this link and sign in", url: SIGN_IN_URL },
	entry: { label: "Then paste the code it gives you" },
	exit: { label: "Paste a key instead", onSelect: pasteKeyInstead },
}

const KEY_STEP: ToolQuestionItem = {
	question: "Paste your Anthropic API key",
	header: "API key",
	options: [],
	entry: { label: "Key", placeholder: "sk-ant-…", isSecret: true },
	exit: { label: "Sign in instead", onSelect: fn() },
}

const SIGN_IN_FAILED_STEP: ToolQuestionItem = {
	question: "Try again, or use a key instead?",
	header: "Sign in",
	optionsOnly: true,
	failure: {
		title: "Couldn't sign you in",
		detail: "auth login exited with code 1",
	},
	options: [
		{ label: "Try again", description: "Opens your browser once more." },
		{
			label: "Paste an API key",
			description: "Pay per use, with nothing to sign in to.",
		},
	],
}

const FIRST_REPLY_STEP: ToolQuestionItem = {
	question: "That's it working. Ready for the last one?",
	header: "Last step",
	optionsOnly: true,
	options: [
		{
			label: "Pick my first companion",
			description: "One more question, then you're set up.",
		},
		{
			label: "Keep talking first",
			description: "Ask me a few more things. I'll wait.",
		},
	],
}

const FIRST_COMPANION_STEP: ToolQuestionItem = {
	question: "Who should join first?",
	header: "First companion",
	options: [
		{
			label: "Scout, who looks things up",
			description: "Reads long pages and reports back short.",
		},
		{
			label: "Ledger, who keeps things in order",
			description: "Watches your files and says what changed.",
		},
		{
			label: "Maker, who writes code",
			description: "Edits the folders you point it at.",
		},
	],
}

const HAND_OFF_STEP: ToolQuestionItem = {
	question: "Where do you want to go?",
	header: "Done",
	optionsOnly: true,
	options: [
		{
			label: "Open Scout",
			description: "Say hello and give it something to look up.",
		},
		{
			label: "Stay here",
			description:
				"Keep talking to me. Scout is in the sidebar when you want it.",
		},
	],
}

export const StepWelcome = meta.story({
	args: { questions: [WELCOME_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The first onboarding step, asked the way every step is asked: a question bubble from Shoto, with the gutter avatar and the name line the transcript draws. Nothing here is a card of its own: the step is the question, and the two options are the whole answer.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, WELCOME_STEP.question)
	},
})

export const StepAccountDetected = meta.story({
	args: { questions: [ACCOUNT_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The account already signed in on the machine, offered as the first of two options. Check that the account line reads as an option rather than as a status, since taking it is the answer.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, ACCOUNT_STEP.question)
	},
})

export const StepSignInOrKey = meta.story({
	args: { questions: [ACCESS_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The fork between signing in and pasting a key. Both ways out of this step are options of the question, so neither is a control the reader has to look for elsewhere.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, ACCESS_STEP.question)
	},
})

export const StepPasteTheCode = meta.story({
	args: { questions: [CODE_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The step that waits on the browser: the sign-in link to carry away, then the code to bring back, drawn here holding the code so `Continue` takes a press. The way out to an API key sits beside the primary control as a low emphasis control, because it leaves the step rather than answering it.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		pasteKeyInstead.mockClear()
		await expectAskedByShoto(canvasElement, CODE_STEP.question)

		await userEvent.type(
			canvas.getByLabelText("Then paste the code it gives you"),
			SIGN_IN_CODE,
		)
		await expect(canvas.getByRole("button", { name: "Continue" })).toBeEnabled()

		await userEvent.click(
			canvas.getByRole("button", { name: "Paste a key instead" }),
		)
		await expect(pasteKeyInstead).toHaveBeenCalledTimes(1)
	},
})

export const StepPasteAnApiKey = meta.story({
	args: { questions: [KEY_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The same bubble with a single masked field, drawn empty, so `Continue` is refused until a key is pasted. The key is never drawn, so a screen share during onboarding shows the step without showing the secret.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectAskedByShoto(canvasElement, KEY_STEP.question)
		await expect(canvas.getByLabelText("Key")).toHaveValue("")
		await expect(
			canvas.getByRole("button", { name: "Continue" }),
		).toBeDisabled()
	},
})

export const StepSignInFailed = meta.story({
	args: { questions: [SIGN_IN_FAILED_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The sign-in that came back refused, in the very bubble that asks what to do about it. The failure is a block above the question line, not a card of its own, and the two ways forward are the options below it.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, SIGN_IN_FAILED_STEP.question)
	},
})

export const StepFirstReply = meta.story({
	args: { questions: [FIRST_REPLY_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The step after the first answer came back, asking whether to go on. Its two options are the whole answer, so no free-text field is drawn.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectAskedByShoto(canvasElement, FIRST_REPLY_STEP.question)
		await expect(
			canvas.queryByLabelText("Other answer"),
		).not.toBeInTheDocument()
	},
})

export const StepFirstCompanion = meta.story({
	args: { questions: [FIRST_COMPANION_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"Three companions, one seat. The options carry what each one does, and the free-text field stays under them, because the reader may want a companion none of the three is.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		await expectAskedByShoto(canvasElement, FIRST_COMPANION_STEP.question)
		await expect(canvas.getByLabelText("Other answer")).toBeVisible()
	},
})

export const StepHandOff = meta.story({
	args: { questions: [HAND_OFF_STEP] },
	render: askedByShoto,
	parameters: {
		docs: {
			description: {
				story:
					"The last step, which hands the reader over to the app. The onboarding ends on a question like every other step, so nothing switches shape at the end.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectAskedByShoto(canvasElement, HAND_OFF_STEP.question)
	},
})

export const OptionsAsWholeAnswer = meta.story({
	args: { questions: [{ ...FRAMEWORK_QUESTION, optionsOnly: true }] },
	parameters: {
		docs: {
			description: {
				story:
					"A question whose listed options are the whole answer: the free-text field is dropped rather than disabled, because an onboarding step that only accepts what it offers must not draw a field that leads nowhere. Check that the options still answer and that nothing else changes.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		await expect(
			canvas.queryByLabelText("Other answer"),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("radio", { name: /Vite/ }))
		await userEvent.click(canvas.getByRole("button", { name: /send answers/i }))
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "Vite",
		})
	},
})

export const NoDismiss = meta.story({
	render: (args) => <ToolQuestion {...args} onDeny={undefined} />,
	parameters: {
		docs: {
			description: {
				story:
					"The same card asked by a host that offers no way to refuse. With no `onDeny`, the dismiss control is not drawn at all: a disabled one would read as a way out that stopped working. The submit control keeps its place.",
			},
		},
	},
	play: async ({ canvas }) => {
		await expect(
			canvas.queryByRole("button", { name: /dismiss/i }),
		).not.toBeInTheDocument()
		await expect(
			canvas.getByRole("button", { name: /send answers/i }),
		).toBeVisible()
	},
})

export const EntryWithLink = meta.story({
	args: { questions: [CODE_STEP] },
	render: (args) => (
		<div className="w-[320px]">
			<ToolQuestion {...args} />
		</div>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An entry question in a 320px column: its fields replace the option rows, so neither a radio nor the free-text field is drawn. The link is read only and cut to one line while the copy control keeps its full size beside it, and copying is announced in a polite region, and the refused write leaves the link on screen and says so in the same region, since a link nobody can copy is still a link that can be read out.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		const writeText = spyOn(navigator.clipboard, "writeText").mockRejectedValue(
			new DOMException("Write permission denied.", "NotAllowedError"),
		)

		await expect(canvas.queryByRole("radio")).not.toBeInTheDocument()
		await expect(
			canvas.queryByLabelText("Other answer"),
		).not.toBeInTheDocument()

		const link = canvas.getByLabelText("Open this link and sign in")
		const copy = canvas.getByRole("button", { name: "Copy" })

		await expect(link).toHaveAttribute("readonly")
		await expect(link).toHaveValue(SIGN_IN_URL)
		await expect(link.scrollWidth).toBeGreaterThan(link.clientWidth)
		await expect(copy.clientWidth).toBe(copy.scrollWidth)
		await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
			canvasElement.clientWidth,
		)
		await expect(
			getComputedStyle(link.parentElement as HTMLElement).backgroundColor,
		).toBe(tokenColor("--background"))

		await userEvent.click(copy)
		await expect(
			await canvas.findByText(
				"Couldn't copy. Select the link and copy it yourself.",
			),
		).toBeInTheDocument()
		await expect(link).toHaveValue(SIGN_IN_URL)

		writeText.mockResolvedValue()
		await userEvent.click(copy)
		await expect(writeText).toHaveBeenLastCalledWith(SIGN_IN_URL)
		await expect(
			await canvas.findByText("Link copied to clipboard"),
		).toBeInTheDocument()

		writeText.mockRestore()
	},
})

export const EntryWithSecret = meta.story({
	args: { questions: [KEY_STEP] },
	parameters: {
		docs: {
			description: {
				story:
					"The entry question that holds a secret: the value is masked, and autocomplete and spell checking are off, so a key is neither stored by the browser nor sent to a dictionary. The primary control reads `Continue` in place of the send label and refuses an empty field, and Enter inside the field submits the question rather than reaching for the button.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const field = canvas.getByLabelText("Key")

		await expect(field).toHaveAttribute("type", "password")
		await expect(field).toHaveAttribute("autocomplete", "off")
		await expect(field).toHaveAttribute("spellcheck", "false")
		const primary = canvas.getByRole("button", { name: "Continue" })
		await expect(primary).toHaveTextContent(/^Continue$/)
		await expect(primary).toBeDisabled()

		await userEvent.type(field, "sk-ant-0f3c1a{Enter}")
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[KEY_STEP.question]: "sk-ant-0f3c1a",
		})
	},
})

export const Failure = meta.story({
	args: { questions: [SIGN_IN_FAILED_STEP] },
	parameters: {
		docs: {
			description: {
				story:
					"A failure carried by the question itself. The block sits above the question line inside the same card: a dot in the destructive token, the sentence that says what went wrong across the whole row, and the raw detail on a surface sized to its own text at the inline start. The question keeps its options below, and the form names the failure in its accessible description, so a screen reader hears what went wrong along with the question it asks.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const failure = slotIn(canvasElement, "tool-question-failure")
		const question = canvas.getByText(SIGN_IN_FAILED_STEP.question)
		const title = canvas.getByText("Couldn't sign you in")
		const detail = canvas.getByText("auth login exited with code 1")
		const form = canvas.getByRole("form")

		await expect(form).toContainElement(failure)
		await expect(form).toHaveAccessibleDescription("Couldn't sign you in")
		await expect(detail.getBoundingClientRect().width).toBeLessThan(
			title.getBoundingClientRect().width,
		)
		await expect(
			failure.compareDocumentPosition(question) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(getComputedStyle(detail).backgroundColor).toBe(
			tokenColor("--background"),
		)
		await expect(
			getComputedStyle(slotIn(canvasElement, "tool-question-failure-dot"))
				.backgroundColor,
		).toBe(tokenColor("--destructive"))

		await expect(canvas.getByRole("radio", { name: /Try again/ })).toBeVisible()
	},
})
