"use client"

import {
	type FormEvent,
	type KeyboardEvent,
	type ReactNode,
	useId,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import {
	FIELD_CONTROL_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { Checkbox } from "@workspace/ui/components/ui/checkbox"
import {
	RadioGroup,
	RadioGroupItem,
} from "@workspace/ui/components/ui/radio-group"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/ui/tabs"
import { useAutoFocus } from "@workspace/ui/hooks/use-auto-focus"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

const QUESTION_TAB_LIST_CLASS =
	"h-fit max-w-full flex-wrap gap-1 bg-transparent p-0"

const QUESTION_TAB_CLASS =
	"h-fit min-w-0 whitespace-normal break-words px-2.5 py-1 text-start motion-reduce:transition-none motion-reduce:duration-0"

const QUESTION_FORM_CLASS =
	"grid w-full gap-3 rounded-2xl text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"

const QUESTION_GROUP_CLASS = "flex flex-col gap-1.5"

const QUESTION_MONO_LINE_CLASS = "truncate font-mono text-compact leading-5"

const QUESTION_LINK_ROW_CLASS =
	"flex items-center gap-2 rounded-lg border border-border bg-background py-1 pe-1 ps-3 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30"

export type ToolQuestionOption = {
	label: string
	description: string
	preview?: ReactNode
}

export type ToolQuestionLink = {
	label: string
	url: string
}

export type ToolQuestionEntry = {
	label: string
	placeholder?: string
	isSecret?: boolean
}

export type ToolQuestionFailure = {
	title: string
	detail?: string
}

export type ToolQuestionExit = {
	label: string
	onSelect: () => void
}

export type ToolQuestionItem = {
	question: string
	header: string
	multiSelect?: boolean
	options: ToolQuestionOption[]
	optionsOnly?: boolean
	link?: ToolQuestionLink
	entry?: ToolQuestionEntry
	exit?: ToolQuestionExit
	failure?: ToolQuestionFailure
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
	const failureId = useId()
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

	const writeTypedAnswer = (text: string) =>
		writeDraft(item.question, { selected: [], text })

	return (
		<form
			aria-describedby={item.failure ? failureId : undefined}
			aria-labelledby={askedId}
			className={cn(QUESTION_FORM_CLASS, className)}
			onKeyDown={readKey}
			onSubmit={submitForm}
			ref={cardRef}
			tabIndex={-1}
		>
			<Tabs onValueChange={setAsked} value={item.question}>
				<TabsList activateOnFocus className={QUESTION_TAB_LIST_CLASS}>
					{questions.map((candidate) => (
						<TabsTrigger
							className={QUESTION_TAB_CLASS}
							key={candidate.question}
							value={candidate.question}
						>
							{candidate.header}
							{answers[candidate.question] ? (
								<Icons.Check className="ml-1.5 size-3" />
							) : null}
						</TabsTrigger>
					))}
				</TabsList>
			</Tabs>

			<div className={cn("grid", item.entry ? "gap-3" : "gap-2")}>
				{item.failure ? (
					<FailureBlock failure={item.failure} titleId={failureId} />
				) : null}

				<p className="font-medium text-foreground" id={askedId}>
					{item.question}
				</p>

				{item.link ? <LinkField link={item.link} /> : null}

				{item.entry ? (
					<EntryField
						entry={item.entry}
						onSubmit={sendOrAdvance}
						onValueChange={writeTypedAnswer}
						value={draft.text}
					/>
				) : (
					<>
						{item.multiSelect ? (
							<div className="grid gap-2">{rows}</div>
						) : (
							<RadioGroup
								className="gap-2"
								onValueChange={(label: string) => pickOption(item, label)}
								value={draft.selected[0] ?? ""}
							>
								{rows}
							</RadioGroup>
						)}

						{item.optionsOnly ? null : (
							<SettingsField
								label={t("toolQuestion.freeText")}
								onValueChange={writeTypedAnswer}
								placeholder={t("toolQuestion.freeTextPlaceholder")}
								value={draft.text}
							/>
						)}
					</>
				)}
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
							{t(item.entry ? "toolQuestion.continue" : "toolQuestion.submit")}
						</>
					)}
				</Button>
				{item.exit ? (
					<Button
						className="text-muted-foreground leading-5"
						onClick={item.exit.onSelect}
						size="sm"
						type="button"
						variant="ghost"
					>
						{item.exit.label}
					</Button>
				) : null}
				{onDeny ? (
					<Button onClick={onDeny} size="sm" type="button" variant="outline">
						<Icons.Close data-icon="inline-start" />
						{t("toolQuestion.dismiss")}
					</Button>
				) : null}
			</div>
		</form>
	)
}

type FailureBlockProps = {
	failure: ToolQuestionFailure
	titleId: string
}

const FailureBlock = ({ failure, titleId }: FailureBlockProps) => (
	<div className={QUESTION_GROUP_CLASS} data-slot="tool-question-failure">
		<div className="flex gap-2">
			<span
				aria-hidden="true"
				className="mt-1.75 size-1.5 shrink-0 rounded-full bg-destructive"
				data-slot="tool-question-failure-dot"
			/>
			<p
				className="min-w-0 flex-1 wrap-break-word font-medium text-foreground text-sm leading-5"
				id={titleId}
			>
				{failure.title}
			</p>
		</div>
		{failure.detail ? (
			<p className="self-start wrap-break-word rounded-md bg-background px-2 py-1 text-start font-mono text-muted-foreground text-xs leading-4.5">
				{failure.detail}
			</p>
		) : null}
	</div>
)

type LinkFieldProps = {
	link: ToolQuestionLink
}

const LinkField = ({ link }: LinkFieldProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(link.url)
	const [hasFailedToCopy, setHasFailedToCopy] = useState(false)
	const id = useId()

	const hasCopied = copied && !hasFailedToCopy
	const CopyGlyph = hasCopied ? Icons.Check : Icons.Copy
	const failed = hasFailedToCopy ? t("toolQuestion.copyFailed") : null
	const announced = hasCopied ? t("toolQuestion.copyAnnounced") : null

	const copyLink = () => {
		setHasFailedToCopy(false)
		copy().catch(() => setHasFailedToCopy(true))
	}

	return (
		<div className={QUESTION_GROUP_CLASS}>
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{link.label}
			</label>
			<div className={QUESTION_LINK_ROW_CLASS}>
				<input
					className={cn(
						QUESTION_MONO_LINE_CLASS,
						"min-w-0 flex-1 bg-transparent text-foreground outline-none",
					)}
					id={id}
					readOnly
					value={link.url}
				/>
				<Button
					className="h-7 shrink-0 px-2.5 leading-5"
					onClick={copyLink}
					size="sm"
					type="button"
					variant="ghost"
				>
					<CopyGlyph className="size-3.5 text-muted-foreground" />
					{hasCopied ? t("toolQuestion.copied") : t("toolQuestion.copy")}
				</Button>
			</div>
			<span aria-live="polite" className="sr-only">
				{failed ?? announced}
			</span>
		</div>
	)
}

type EntryFieldProps = {
	entry: ToolQuestionEntry
	value: string
	onValueChange: (value: string) => void
	onSubmit: () => void
}

const EntryField = ({
	entry,
	value,
	onValueChange,
	onSubmit,
}: EntryFieldProps) => {
	const id = useId()

	const readKey = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter") return
		event.preventDefault()
		onSubmit()
	}

	return (
		<div className={QUESTION_GROUP_CLASS}>
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{entry.label}
			</label>
			<input
				autoComplete="off"
				className={cn(
					FIELD_CONTROL_CLASS,
					QUESTION_MONO_LINE_CLASS,
					"border-border",
				)}
				id={id}
				onChange={(event) => onValueChange(event.target.value)}
				onKeyDown={readKey}
				placeholder={entry.placeholder}
				spellCheck={false}
				type={entry.isSecret ? "password" : "text"}
				value={value}
			/>
		</div>
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
