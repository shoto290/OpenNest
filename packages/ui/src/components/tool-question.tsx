"use client"

import { motion, useReducedMotion } from "motion/react"
import { type ReactNode, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { Checkbox } from "@workspace/ui/components/motion/checkbox"
import {
	RadioGroup,
	RadioGroupItem,
} from "@workspace/ui/components/motion/radio"
import {
	Tabs,
	TabsList,
	TabsTrigger,
} from "@workspace/ui/components/motion/tabs"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { EASE_OUT } from "@workspace/ui/lib/ease"
import { cn } from "@workspace/ui/lib/utils"

/** One option of an `AskUserQuestion` question. `preview` is what picking it would
 * produce, shown only once it is picked. */
export type ToolQuestionOption = {
	label: string
	description: string
	preview?: ReactNode
}

export type ToolQuestionItem = {
	question: string
	header: string
	multiSelect?: boolean
	options: ToolQuestionOption[]
}

export type ToolQuestionAnswers = Record<string, string>

export interface ToolQuestionProps {
	questions: ToolQuestionItem[]
	onAnswer?: (answers: ToolQuestionAnswers) => void
	onDeny?: () => void
	className?: string
}

/** What a question holds so far. The two ways to answer are exclusive: text is the
 * whole answer when there is any, so picking an option clears it and typing clears
 * the picks. */
type Draft = { selected: string[]; text: string }

const EMPTY_DRAFT: Draft = { selected: [], text: "" }

const answerOf = ({ selected, text }: Draft) =>
	text.trim() || selected.join(", ")

const ToolQuestion = ({
	questions,
	onAnswer,
	onDeny,
	className,
}: ToolQuestionProps) => {
	const { t } = useTranslation("chat")
	const reduce = useReducedMotion() ?? false
	const [drafts, setDrafts] = useState<Record<string, Draft>>({})
	const [asked, setAsked] = useState(questions[0]?.question)

	const draftOf = (question: string) => drafts[question] ?? EMPTY_DRAFT
	const answerTo = (question: string) => answerOf(draftOf(question))

	const writeDraft = (question: string, draft: Draft) =>
		setDrafts((current) => ({ ...current, [question]: draft }))

	/** A question that holds one answer is done the moment it is picked, so the card
	 * moves on to the next one still waiting rather than making the reader find it. */
	const askNextUnanswered = (answered: ToolQuestionItem) => {
		const next = questions.find(
			(item) => item !== answered && answerTo(item.question) === "",
		)
		if (next) setAsked(next.question)
	}

	const pickOption = (item: ToolQuestionItem, label: string) => {
		const { selected } = draftOf(item.question)
		const held = selected.includes(label)
		writeDraft(item.question, {
			selected: held
				? selected.filter((picked) => picked !== label)
				: item.multiSelect
					? [...selected, label]
					: [label],
			text: "",
		})
		if (!item.multiSelect && !held) askNextUnanswered(item)
	}

	const item = questions.find((candidate) => candidate.question === asked)
	if (!item) return null

	const draft = draftOf(item.question)
	const rows = item.options.map((option) => (
		<OptionRow
			isSelected={draft.selected.includes(option.label)}
			key={option.label}
			option={option}
			render={(id) =>
				item.multiSelect ? (
					<Checkbox
						checked={draft.selected.includes(option.label)}
						id={id}
						onCheckedChange={() => pickOption(item, option.label)}
					/>
				) : (
					<RadioGroupItem id={id} value={option.label} />
				)
			}
		/>
	))

	const answers = Object.fromEntries(
		questions.map(({ question }) => [question, answerTo(question)]),
	)
	const isComplete = questions.every(({ question }) => answers[question] !== "")

	return (
		<div
			className={cn(
				"w-full overflow-hidden rounded-2xl border border-border bg-card text-sm",
				className,
			)}
			role="group"
		>
			<Tabs
				className="px-3 pt-3"
				onValueChange={setAsked}
				value={item.question}
				variant="pill"
			>
				<TabsList className="flex-wrap bg-transparent p-0">
					{questions.map((candidate) => (
						<TabsTrigger key={candidate.question} value={candidate.question}>
							{candidate.header}
							{answers[candidate.question] ? (
								<Icons.Check className="ml-1.5 size-3" />
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<div className="grid gap-2 px-4 py-3">
				<p className="font-medium text-foreground">{item.question}</p>

				{item.multiSelect ? (
					<div className="grid gap-2">{rows}</div>
				) : (
					<RadioGroup
						className="gap-2"
						onValueChange={(label) => pickOption(item, label)}
						value={draft.selected[0] ?? ""}
					>
						{rows}
					</RadioGroup>
				)}

				<SettingsField
					label={t("toolQuestion.freeText")}
					onValueChange={(text) =>
						writeDraft(item.question, { selected: [], text })
					}
					placeholder={t("toolQuestion.freeTextPlaceholder")}
					value={draft.text}
				/>
			</div>

			<motion.div
				animate={{ y: 0 }}
				className="flex flex-wrap items-center gap-2 border-border border-t px-4 py-3"
				initial={reduce ? false : { y: 4 }}
				transition={{ duration: 0.22, ease: EASE_OUT }}
			>
				<Button
					disabled={!isComplete}
					onClick={() => onAnswer?.(answers)}
					size="sm"
				>
					<Icons.Send data-icon="inline-start" />
					{t("toolQuestion.submit")}
				</Button>
				<Button onClick={onDeny} size="sm" variant="outline">
					<Icons.Close data-icon="inline-start" />
					{t("toolQuestion.dismiss")}
				</Button>
			</motion.div>
		</div>
	)
}

type OptionRowProps = {
	option: ToolQuestionOption
	isSelected: boolean
	/** The control the row's label owns, given the id to answer to. It carries no
	 * text of its own — the whole row is its label, so every pixel of the box picks
	 * the option, description included. */
	render: (id: string) => ReactNode
}

const OptionRow = ({ option, isSelected, render }: OptionRowProps) => {
	const { t } = useTranslation("chat")
	const id = useId()

	return (
		<div
			className={cn(
				"rounded-xl border border-border transition-colors duration-150 has-focus-visible:border-ring/60 has-focus-visible:ring-3 has-focus-visible:ring-ring/30 motion-reduce:transition-none",
				isSelected
					? "border-primary/50 bg-muted/50"
					: "bg-background hover:border-muted-foreground/40 hover:bg-muted/40",
			)}
		>
			<label className="flex cursor-pointer items-start gap-3 p-3" htmlFor={id}>
				{render(id)}
				<span className="grid gap-0.5">
					<span className="font-medium text-foreground leading-5">
						{option.label}
					</span>
					<span className="text-muted-foreground text-xs">
						{option.description}
					</span>
				</span>
			</label>
			{isSelected && option.preview ? (
				<div className="mx-3 mb-3 grid gap-1 rounded-lg border border-border bg-muted/40 p-2">
					<span className="text-muted-foreground text-xs">
						{t("toolQuestion.preview")}
					</span>
					<div className="min-w-0 break-words font-mono text-foreground text-xs">
						{option.preview}
					</div>
				</div>
			) : null}
		</div>
	)
}

export { ToolQuestion }
