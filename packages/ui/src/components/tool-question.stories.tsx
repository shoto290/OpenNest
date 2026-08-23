import { expect, fn } from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	ToolQuestion,
	type ToolQuestionItem,
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
	title: "AI/ToolQuestion",
	component: ToolQuestion,
	parameters: {
		docs: {
			description: {
				component:
					"The surface of one `AskUserQuestion` call: one to four questions, answered in a single pass and submitted once. Only one question is ever on screen — the others wait behind their own tab, which carries a check once it holds an answer — because four question at once is a wall nobody reads. Answering a single-select question moves the card to the next one still waiting.\n\nEvery option is one box, and the whole box is the target: the label, the description, the padding around them. Every question also takes a free-text answer, exclusive with the options — typing clears the picks, picking clears the text. The card reports one string per question: the picked labels joined by `, `, or the typed text.",
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
					"The widest call the tool can make: four questions under four tabs, one on screen at a time. Check that answering the first hands over the second by itself, that a tab can be reached in any order once the reader wants to change an answer, that an answered tab carries its check, and that submit stays refused until the last question holds an answer — then reports all four at once, keyed by question.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const submit = canvas.getByRole("button", { name: /send answers/i })
		await expect(canvas.getAllByRole("tab")).toHaveLength(4)

		await userEvent.click(canvas.getByRole("radio", { name: /Next\.js/ }))
		await expect(canvas.getByText(SCOPE_QUESTION.question)).toBeVisible()
		await expect(
			canvas.queryByText(FRAMEWORK_QUESTION.question),
		).not.toBeInTheDocument()

		await userEvent.click(canvas.getByRole("checkbox", { name: /Settings/ }))
		await userEvent.click(canvas.getByRole("checkbox", { name: /Chat/ }))
		await expect(submit).toBeDisabled()

		await userEvent.click(canvas.getByRole("tab", { name: /naming/i }))
		await userEvent.type(
			canvas.getByLabelText("Other answer"),
			"@workspace/foundations",
		)
		await expect(submit).toBeDisabled()

		await userEvent.click(canvas.getByRole("tab", { name: /release/i }))
		await userEvent.click(canvas.getByRole("radio", { name: /Next week/ }))
		await expect(submit).toBeEnabled()

		await userEvent.click(submit)
		await expect(args.onAnswer).toHaveBeenCalledWith({
			[FRAMEWORK_QUESTION.question]: "Next.js",
			[SCOPE_QUESTION.question]: "Settings, Chat",
			[NAMING_QUESTION.question]: "@workspace/foundations",
			[RELEASE_QUESTION.question]: "Next week",
		})
	},
})
