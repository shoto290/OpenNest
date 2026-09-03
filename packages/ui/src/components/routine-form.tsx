"use client"

import { type FormEvent, useEffect, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { SettingsField } from "@workspace/ui/components/settings-field"
import { SettingsSelect } from "@workspace/ui/components/settings-select"
import {
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	FIELD_LABEL_CLASS,
} from "@workspace/ui/components/settings-styles"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"
import { cn } from "@workspace/ui/lib/utils"

type RoutineTriggerKind = "schedule" | "fileWatch" | "localWebhook" | "plain"

type RoutineTriggerSource = {
	id: string
	title: string
	kind: RoutineTriggerKind
}

type RoutineFormValues = {
	title: string
	instruction: string
	triggerSourceId: string
	expression: string
	path: string
}

type RoutineWebhook = {
	url: string
	key: string
	header: string
}

type RoutineFormRefusal =
	| "blankTitle"
	| "blankInstruction"
	| "unreadableExpression"

type RoutineFormModel = {
	id: string | null
	values: RoutineFormValues
	webhook?: RoutineWebhook
	hasFailedToReadKey?: boolean
	refusal?: RoutineFormRefusal
}

type RoutineFormProps = RoutineFormModel & {
	sources: RoutineTriggerSource[]
	onSave: (values: RoutineFormValues) => void
}

const EMPTY_ROUTINE_VALUES: RoutineFormValues = {
	title: "",
	instruction: "",
	triggerSourceId: "",
	expression: "",
	path: "",
}

const INSTRUCTION_ROWS = 5

type WebhookFieldProps = {
	label: string
	value: string
}

const WebhookField = ({ label, value }: WebhookFieldProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(value)
	const id = useId()

	return (
		<div className="flex flex-col gap-1.5">
			<label className={FIELD_LABEL_CLASS} htmlFor={id}>
				{label}
			</label>
			<div className="flex items-center gap-1.5">
				<input
					className={cn(
						FIELD_CONTROL_CLASS,
						FIELD_CONTROL_READONLY_CLASS,
						"min-w-0 flex-1",
					)}
					id={id}
					readOnly
					value={value}
				/>
				{value ? (
					<Button
						aria-label={t("routines.form.webhook.copy", { field: label })}
						onClick={() => {
							void copy()
						}}
						size="icon-sm"
						variant="ghost"
					>
						{copied ? <Icons.Check /> : <Icons.Copy />}
					</Button>
				) : null}
			</div>
			<span aria-live="polite" className="sr-only">
				{copied ? t("routines.form.webhook.copied", { field: label }) : ""}
			</span>
		</div>
	)
}

type WebhookBlockProps = {
	webhook?: RoutineWebhook
	hasFailedToReadKey: boolean
	isWritten: boolean
}

type WebhookKeyLine = "failure" | "pending" | "reading"

const keyLineOf = ({
	webhook,
	hasFailedToReadKey,
	isWritten,
}: WebhookBlockProps): WebhookKeyLine | null => {
	if (hasFailedToReadKey) return "failure"
	if (!isWritten) return "pending"

	return webhook ? null : "reading"
}

const WebhookBlock = (props: WebhookBlockProps) => {
	const { t } = useTranslation("chat")
	const { webhook } = props
	const line = keyLineOf(props)

	return (
		<div className="flex flex-col gap-2" data-slot="routine-webhook">
			<WebhookField
				label={t("routines.form.webhook.url")}
				value={webhook?.url ?? ""}
			/>
			<WebhookField
				label={t("routines.form.webhook.key")}
				value={webhook?.key ?? ""}
			/>
			<WebhookField
				label={t("routines.form.webhook.header")}
				value={webhook?.header ?? ""}
			/>
			{line ? (
				<p
					className={cn(
						"text-xs",
						line === "failure" ? "text-destructive" : "text-muted-foreground",
					)}
				>
					{t(`routines.form.webhook.${line}`)}
				</p>
			) : null}
		</div>
	)
}

const RoutineForm = ({
	id,
	values,
	webhook,
	hasFailedToReadKey = false,
	refusal,
	sources,
	onSave,
}: RoutineFormProps) => {
	const { t } = useTranslation("chat")
	const [entered, setEntered] = useState(values)
	const form = useRef<HTMLFormElement>(null)

	useEffect(() => {
		form.current?.focus({ preventScroll: true })
	}, [])

	const isWritten = id !== null
	const source = sources.find(
		(candidate) => candidate.id === entered.triggerSourceId,
	)
	const kind = source?.kind ?? "plain"

	const answer = (field: keyof RoutineFormValues, value: string) =>
		setEntered((held) => ({ ...held, [field]: value }))

	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		onSave(entered)
	}

	return (
		<form
			aria-label={t(isWritten ? "routines.form.edit" : "routines.form.new")}
			className="flex flex-col gap-4 outline-none"
			data-slot="routine-form"
			onSubmit={save}
			ref={form}
			tabIndex={-1}
		>
			<SettingsField
				error={
					refusal === "blankTitle"
						? t("routines.form.error.blankTitle")
						: undefined
				}
				label={t("routines.form.title.label")}
				onValueChange={(value) => answer("title", value)}
				placeholder={t("routines.form.title.placeholder")}
				value={entered.title}
			/>
			<SettingsField
				error={
					refusal === "blankInstruction"
						? t("routines.form.error.blankInstruction")
						: undefined
				}
				label={t("routines.form.instruction.label")}
				onValueChange={(value) => answer("instruction", value)}
				placeholder={t("routines.form.instruction.placeholder")}
				rows={INSTRUCTION_ROWS}
				value={entered.instruction}
			/>
			{isWritten ? (
				<SettingsField
					hint={t("routines.form.source.tied")}
					label={t("routines.form.source.label")}
					readOnly
					value={source?.title ?? entered.triggerSourceId}
				/>
			) : (
				<SettingsSelect
					label={t("routines.form.source.label")}
					onValueChange={(value) => answer("triggerSourceId", value)}
					options={sources.map(({ id: value, title }) => ({
						label: title,
						value,
					}))}
					placeholder={t("routines.form.source.placeholder")}
					value={entered.triggerSourceId}
				/>
			)}
			{kind === "schedule" ? (
				<SettingsField
					error={
						refusal === "unreadableExpression"
							? t("routines.form.error.unreadableExpression")
							: undefined
					}
					label={t("routines.form.expression.label")}
					onValueChange={(value) => answer("expression", value)}
					placeholder={t("routines.form.expression.placeholder")}
					value={entered.expression}
				/>
			) : null}
			{kind === "fileWatch" ? (
				<SettingsField
					label={t("routines.form.path.label")}
					onValueChange={(value) => answer("path", value)}
					placeholder={t("routines.form.path.placeholder")}
					value={entered.path}
				/>
			) : null}
			{kind === "localWebhook" ? (
				<WebhookBlock
					hasFailedToReadKey={hasFailedToReadKey}
					isWritten={isWritten}
					webhook={webhook}
				/>
			) : null}
			<Button className="w-full" type="submit">
				{t("routines.form.save")}
			</Button>
		</form>
	)
}

export {
	EMPTY_ROUTINE_VALUES,
	RoutineForm,
	type RoutineFormModel,
	type RoutineFormProps,
	type RoutineFormRefusal,
	type RoutineFormValues,
	type RoutineTriggerKind,
	type RoutineTriggerSource,
	type RoutineWebhook,
}
