"use client"

import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	useId,
	useState,
} from "react"
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
import { useAutoFocus } from "@workspace/ui/hooks/use-auto-focus"
import { cn } from "@workspace/ui/lib/utils"

const QUESTION_FORM_CLASS =
	"grid w-full gap-3 rounded-2xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"

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
	const cardRef = useAutoFocus<HTMLFormElement>()
	const askedId = useId()
	const [drafts, setDrafts] = useState<Record<string, Draft>>({})
	const [asked, setAsked] = useState(questions[0]?.question)

	const draftOf = (question: string) => drafts[question] ?? EMPTY_DRAFT

	const writeDraft = (question: string, draft: Draft) =>
		setDrafts((current) => ({ ...current, [question]: draft }))

	const answers = Object.fromEntries(
		questions.map(({ question }) => [question, answerOf(draftOf(question))]),
	)

	const waitingAfter = (answered: ToolQuestionItem) =>
		questions.find((item) => item !== answered && answers[item.question] === "")

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
		if (item.multiSelect || held) return

		const next = waitingAfter(item)
		if (next) setAsked(next.question)
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

	const isAnswered = answers[item.question] !== ""
	const waiting = waitingAfter(item)

	const sendOrAdvance = () => {
		if (!isAnswered) return
		if (waiting) {
			setAsked(waiting.question)
			return
		}
		onAnswer?.(answers)
	}

	const submitForm = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		sendOrAdvance()
	}

	const readKey = (event: KeyboardEvent<HTMLFormElement>) => {
		if (event.target !== event.currentTarget) return
		if (event.key !== "Enter" || event.shiftKey) return
		event.preventDefault()
		sendOrAdvance()
	}

	return (
		<form
			aria-labelledby={askedId}
			className={cn(QUESTION_FORM_CLASS, className)}
			onKeyDown={readKey}
			onSubmit={submitForm}
			ref={cardRef}
			tabIndex={-1}
		>
			<Tabs
				isAnimated={false}
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

			<div className="grid gap-2">
				<p className="font-medium text-foreground" id={askedId}>
					{item.question}
				</p>

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

			<div className="flex flex-wrap items-center gap-2">
				<Button disabled={!isAnswered} size="sm" type="submit">
					{waiting ? (
						<>
							{t("toolQuestion.next")}
							<Icons.Next data-icon="inline-end" />
						</>
					) : (
						<>
							<Icons.Send data-icon="inline-start" />
							{t("toolQuestion.submit")}
						</>
					)}
				</Button>
				<Button onClick={onDeny} size="sm" type="button" variant="outline">
					<Icons.Close data-icon="inline-start" />
					{t("toolQuestion.dismiss")}
				</Button>
			</div>
		</form>
	)
}

type OptionRowProps = {
	option: ToolQuestionOption
	isSelected: boolean
	render: (id: string) => ReactNode
}

const OptionRow = ({ option, isSelected, render }: OptionRowProps) => {
	const { t } = useTranslation("chat")
	const id = useId()

	return (
		<div
			className={cn(
				"grid gap-1 rounded-xl",
				isSelected
					? "bg-background"
					: "bg-background/50 hover:bg-background/75",
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
				<div className="grid gap-1 pb-3 pe-3 ps-11">
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
