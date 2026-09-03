"use client"

import {
	type FormEvent,
	type RefCallback,
	useEffect,
	useId,
	useRef,
	useState,
} from "react"
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

const ROUTINE_FIELD_TYPES = ["string", "number", "boolean", "datetime"] as const

type RoutineFieldType = (typeof ROUTINE_FIELD_TYPES)[number]

const ROUTINE_FILTER_OPERATORS = [
	"exists",
	"not_exists",
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"starts_with",
	"ends_with",
	"gt",
	"lt",
] as const

type RoutineFilterOperator = (typeof ROUTINE_FILTER_OPERATORS)[number]

const ROUTINE_FILTER_MATCH_MODES = ["all", "any"] as const

type RoutineFilterMatchMode = (typeof ROUTINE_FILTER_MATCH_MODES)[number]

const ROUTINE_OPERATORS_BY_FIELD_TYPE: Record<
	RoutineFieldType,
	readonly RoutineFilterOperator[]
> = {
	string: [
		"exists",
		"not_exists",
		"equals",
		"not_equals",
		"contains",
		"not_contains",
		"starts_with",
		"ends_with",
	],
	number: ["exists", "not_exists", "equals", "not_equals", "gt", "lt"],
	boolean: ["exists", "not_exists", "equals", "not_equals"],
	datetime: ["exists", "not_exists", "gt", "lt"],
}

const ROUTINE_OPERATOR_TAKES_VALUE: Record<RoutineFilterOperator, boolean> = {
	exists: false,
	not_exists: false,
	equals: true,
	not_equals: true,
	contains: true,
	not_contains: true,
	starts_with: true,
	ends_with: true,
	gt: true,
	lt: true,
}

type RoutinePayloadField = {
	name: string
	type: RoutineFieldType
}

type RoutineTriggerSource = {
	id: string
	title: string
	kind: RoutineTriggerKind
	payload: RoutinePayloadField[]
}

type RoutineFilterReading = {
	operator: RoutineFilterOperator
	fieldType?: RoutineFieldType
}

type RoutineFilterRow = {
	field: string
	operator: RoutineFilterOperator
	value: string
	readAs?: RoutineFilterReading
}

type RoutineFilterValues = {
	matchMode: RoutineFilterMatchMode
	rows: RoutineFilterRow[]
}

type RoutineFormValues = {
	title: string
	instruction: string
	triggerSourceId: string
	expression: string
	path: string
	filter: RoutineFilterValues
}

type RoutineWebhook = {
	url: string
	key: string
	header: string
}

type RoutineOperatorRefusal = {
	row: number
	operator: RoutineFilterOperator
	fieldType: RoutineFieldType
}

type RoutineFormRefusal =
	| "blankTitle"
	| "blankInstruction"
	| "unreadableExpression"
	| RoutineOperatorRefusal

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

const EMPTY_ROUTINE_FILTER: RoutineFilterValues = { matchMode: "all", rows: [] }

const EMPTY_ROUTINE_VALUES: RoutineFormValues = {
	title: "",
	instruction: "",
	triggerSourceId: "",
	expression: "",
	path: "",
	filter: EMPTY_ROUTINE_FILTER,
}

const INSTRUCTION_ROWS = 5

type WebhookFieldProps = {
	label: string
	value: string
	describedBy?: string
}

const WebhookField = ({ label, value, describedBy }: WebhookFieldProps) => {
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
					aria-describedby={describedBy}
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
	const lineId = useId()
	const describedBy = line ? lineId : undefined

	return (
		<div className="flex flex-col gap-2" data-slot="routine-webhook">
			<WebhookField
				describedBy={describedBy}
				label={t("routines.form.webhook.url")}
				value={webhook?.url ?? ""}
			/>
			<WebhookField
				describedBy={describedBy}
				label={t("routines.form.webhook.key")}
				value={webhook?.key ?? ""}
			/>
			<WebhookField
				describedBy={describedBy}
				label={t("routines.form.webhook.header")}
				value={webhook?.header ?? ""}
			/>
			<p
				className={cn(
					"text-xs empty:absolute",
					line === "failure" ? "text-destructive" : "text-muted-foreground",
				)}
				id={lineId}
				role="status"
			>
				{line ? t(`routines.form.webhook.${line}`) : null}
			</p>
		</div>
	)
}

const OTHER_PATH = "__other_path__"

const typeOf = (fields: RoutinePayloadField[], field: string) =>
	fields.find((declared) => declared.name === field)?.type

const PRESENCE_OPERATORS: readonly RoutineFilterOperator[] = [
	"exists",
	"not_exists",
]

const operatorsOf = (fieldType: RoutineFieldType | undefined) =>
	fieldType ? ROUTINE_OPERATORS_BY_FIELD_TYPE[fieldType] : PRESENCE_OPERATORS

const offeredOperators = (
	fieldType: RoutineFieldType | undefined,
	row: RoutineFilterRow,
) => {
	const accepted = operatorsOf(fieldType)
	const read = fieldType ? row.operator : (row.readAs?.operator ?? row.operator)
	const kept = [row.operator, read].filter(
		(operator) => !accepted.includes(operator),
	)

	return kept.length === 0 ? accepted : [...new Set([...kept, ...accepted])]
}

const blankValueFor = (fieldType: RoutineFieldType | undefined) =>
	fieldType === "boolean" ? "true" : ""

const appended = (fields: RoutinePayloadField[]): RoutineFilterRow => {
	const field = fields[0]?.name ?? ""
	const fieldType = typeOf(fields, field)

	return {
		field,
		operator: operatorsOf(fieldType)[0],
		value: blankValueFor(fieldType),
	}
}

const carried = (
	row: RoutineFilterRow,
	field: string,
	held: RoutineFieldType | undefined,
	fieldType: RoutineFieldType | undefined,
): RoutineFilterRow => {
	const accepted = operatorsOf(fieldType)

	return {
		field,
		operator: accepted.includes(row.operator) ? row.operator : accepted[0],
		value: held === fieldType ? row.value : blankValueFor(fieldType),
	}
}

const naming = (
	fields: RoutinePayloadField[],
	row: RoutineFilterRow,
	field: string,
): RoutineFilterRow =>
	carried(row, field, typeOf(fields, row.field), typeOf(fields, field))

const retyped = (
	fields: RoutinePayloadField[],
	row: RoutineFilterRow,
	field: string,
): RoutineFilterRow =>
	typeOf(fields, field)
		? naming(fields, row, field)
		: { field, operator: row.operator, value: row.value }

const isSameRow = (row: RoutineFilterRow, held: RoutineFilterRow) =>
	row.field === held.field &&
	row.operator === held.operator &&
	row.value === held.value

const fieldsOf = (
	sources: RoutineTriggerSource[],
	triggerSourceId: string,
): RoutinePayloadField[] =>
	sources.find(({ id }) => id === triggerSourceId)?.payload ?? []

const rehomed = (
	values: RoutineFormValues,
	triggerSourceId: string,
	sources: RoutineTriggerSource[],
): RoutineFormValues => {
	const was = fieldsOf(sources, values.triggerSourceId)
	const now = fieldsOf(sources, triggerSourceId)
	const rows = values.filter.rows.map((row) =>
		carried(row, row.field, typeOf(was, row.field), typeOf(now, row.field)),
	)

	if (
		triggerSourceId === values.triggerSourceId &&
		rows.every((row, at) => isSameRow(row, values.filter.rows[at]))
	) {
		return values
	}

	return { ...values, triggerSourceId, filter: { ...values.filter, rows } }
}

const rowRefusalIn = (refusal: RoutineFormRefusal | undefined) =>
	typeof refusal === "object" ? refusal : null

const isMissingValue = (row: RoutineFilterRow) =>
	ROUTINE_OPERATOR_TAKES_VALUE[row.operator] && row.value.trim() === ""

type FilterRowProps = {
	row: RoutineFilterRow
	rank: number
	fields: RoutinePayloadField[]
	isOnAFreePath: boolean
	operatorError?: string
	valueError?: string
	fieldRef: RefCallback<HTMLButtonElement>
	onChange: (row: RoutineFilterRow) => void
	onFreePath: (isFree: boolean) => void
	onRemove: () => void
}

const FilterRow = ({
	row,
	rank,
	fields,
	isOnAFreePath,
	operatorError,
	valueError,
	fieldRef,
	onChange,
	onFreePath,
	onRemove,
}: FilterRowProps) => {
	const { t } = useTranslation("chat")
	const fieldType = typeOf(fields, row.field)
	const otherPath = t("routines.form.filter.field.otherPath")
	const isFree = isOnAFreePath || fieldType === undefined

	return (
		<div
			aria-label={t("routines.form.filter.row", { rank })}
			className="flex flex-col gap-2 rounded-xl border border-border p-2.5"
			data-slot="routine-filter-row"
			role="group"
		>
			<SettingsSelect
				label={t("routines.form.filter.field.label")}
				onValueChange={(picked) => {
					onFreePath(picked === OTHER_PATH)
					onChange(naming(fields, row, picked === OTHER_PATH ? "" : picked))
				}}
				options={[
					...fields.map(({ name }) => ({ label: name, value: name })),
					{ label: otherPath, value: OTHER_PATH },
				]}
				ref={fieldRef}
				value={isFree ? OTHER_PATH : row.field}
			/>
			{isFree ? (
				<SettingsField
					label={t("routines.form.filter.path.label")}
					onValueChange={(path) => onChange(retyped(fields, row, path))}
					placeholder={t("routines.form.filter.path.placeholder")}
					value={row.field}
				/>
			) : null}
			<SettingsSelect
				error={operatorError}
				label={t("routines.form.filter.operator.label")}
				onValueChange={(picked) =>
					onChange({ ...row, operator: picked as RoutineFilterOperator })
				}
				options={offeredOperators(fieldType, row).map((operator) => ({
					label: t(`routines.form.filter.operators.${operator}`),
					value: operator,
				}))}
				value={row.operator}
			/>
			{ROUTINE_OPERATOR_TAKES_VALUE[row.operator] ? (
				<ValueControl
					error={valueError}
					fieldType={fieldType ?? row.readAs?.fieldType}
					onValueChange={(value) => onChange({ ...row, value })}
					value={row.value}
				/>
			) : null}
			<Button
				aria-label={t("routines.form.filter.remove", {
					field: row.field || otherPath,
				})}
				className="self-end"
				onClick={onRemove}
				size="icon-sm"
				type="button"
				variant="ghost"
			>
				<Icons.Close aria-hidden="true" />
			</Button>
		</div>
	)
}

type ValueControlProps = {
	fieldType: RoutineFieldType | undefined
	value: string
	error?: string
	onValueChange: (value: string) => void
}

const ValueControl = ({
	fieldType,
	value,
	error,
	onValueChange,
}: ValueControlProps) => {
	const { t } = useTranslation("chat")
	const label = t("routines.form.filter.value.label")

	if (fieldType === "boolean") {
		return (
			<SettingsSelect
				error={error}
				label={label}
				onValueChange={onValueChange}
				options={[
					{ label: t("routines.form.filter.value.true"), value: "true" },
					{ label: t("routines.form.filter.value.false"), value: "false" },
				]}
				value={value}
			/>
		)
	}

	return (
		<SettingsField
			error={error}
			label={label}
			numeric={fieldType === "number"}
			onValueChange={onValueChange}
			value={value}
		/>
	)
}

type FilterFocus = { row: number } | "add"

type FilterBlockProps = {
	filter: RoutineFilterValues
	fields: RoutinePayloadField[]
	refusal: RoutineOperatorRefusal | null
	marksMissingValues: boolean
	onChange: (filter: RoutineFilterValues) => void
}

const FilterBlock = ({
	filter,
	fields,
	refusal,
	marksMissingValues,
	onChange,
}: FilterBlockProps) => {
	const { t } = useTranslation("chat")
	const labelId = useId()
	const [freePaths, setFreePaths] = useState(() =>
		filter.rows.map((row) => typeOf(fields, row.field) === undefined),
	)
	const requested = useRef<FilterFocus | null>(null)
	const fieldControls = useRef<(HTMLButtonElement | null)[]>([])
	const addControl = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		const focus = requested.current
		if (!focus) {
			return
		}

		requested.current = null
		const control =
			focus === "add" ? addControl.current : fieldControls.current[focus.row]
		control?.focus()
	})

	const append = () => {
		requested.current = { row: filter.rows.length }
		setFreePaths((held) => [...held, fields.length === 0])
		onChange({
			...filter,
			rows: [...filter.rows, appended(fields)],
		})
	}

	const remove = (index: number) => {
		const rows = filter.rows.filter((_, at) => at !== index)
		requested.current =
			rows.length === 0 ? "add" : { row: Math.min(index, rows.length - 1) }
		setFreePaths((held) => held.filter((_, at) => at !== index))
		onChange({ ...filter, rows })
	}

	const holdFreePath = (index: number, isFree: boolean) =>
		setFreePaths((held) =>
			held.map((wasFree, at) => (at === index ? isFree : wasFree)),
		)

	const operatorMessageFor = (index: number) =>
		refusal?.row === index
			? t("routines.form.error.unsupportedOperator", {
					fieldType: t(`routines.form.filter.fieldTypes.${refusal.fieldType}`),
					operator: t(`routines.form.filter.operators.${refusal.operator}`),
				})
			: undefined

	const valueMessageFor = (row: RoutineFilterRow) =>
		marksMissingValues && isMissingValue(row)
			? t("routines.form.error.blankValue")
			: undefined

	return (
		<div
			aria-labelledby={labelId}
			className="flex flex-col gap-2"
			data-slot="routine-filter"
			role="group"
		>
			<p className={FIELD_LABEL_CLASS} id={labelId}>
				{t("routines.form.filter.label")}
			</p>
			{filter.rows.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					{t("routines.form.filter.everyEvent")}
				</p>
			) : (
				<SettingsSelect
					label={t("routines.form.filter.matchMode.label")}
					onValueChange={(picked) =>
						onChange({ ...filter, matchMode: picked as RoutineFilterMatchMode })
					}
					options={ROUTINE_FILTER_MATCH_MODES.map((mode) => ({
						label: t(`routines.form.filter.matchMode.${mode}`),
						value: mode,
					}))}
					value={filter.matchMode}
				/>
			)}
			{filter.rows.map((row, index) => (
				<FilterRow
					fieldRef={(control) => {
						fieldControls.current[index] = control
					}}
					fields={fields}
					isOnAFreePath={freePaths[index] ?? false}
					// biome-ignore lint/suspicious/noArrayIndexKey: a row is identified by its rank, which is what the reader reorders it by
					key={index}
					onChange={(changed) =>
						onChange({
							...filter,
							rows: filter.rows.map((held, at) =>
								at === index ? changed : held,
							),
						})
					}
					onFreePath={(isFree) => holdFreePath(index, isFree)}
					onRemove={() => remove(index)}
					operatorError={operatorMessageFor(index)}
					rank={index + 1}
					row={row}
					valueError={valueMessageFor(row)}
				/>
			))}
			<Button
				className="w-full"
				onClick={append}
				ref={addControl}
				type="button"
				variant="outline"
			>
				<Icons.Add aria-hidden="true" />
				{t("routines.form.filter.add")}
			</Button>
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
	const [rowRefusal, setRowRefusal] = useState(() => rowRefusalIn(refusal))
	const [marksMissingValues, setMarksMissingValues] = useState(false)
	const readRefusal = useRef(refusal)
	const form = useRef<HTMLFormElement>(null)

	useEffect(() => {
		form.current?.focus({ preventScroll: true })
	}, [])

	if (readRefusal.current !== refusal) {
		readRefusal.current = refusal
		setRowRefusal(rowRefusalIn(refusal))
	}

	const isWritten = id !== null
	const source = sources.find(
		(candidate) => candidate.id === entered.triggerSourceId,
	)
	const kind = source?.kind ?? "plain"

	const answer = (field: keyof RoutineFormValues, value: string) =>
		setEntered((held) => ({ ...held, [field]: value }))

	const changeFilter = (filter: RoutineFilterValues) => {
		setRowRefusal(null)
		setEntered((held) => ({ ...held, filter }))
	}

	const pickSource = (triggerSourceId: string) => {
		setRowRefusal(null)
		setEntered((held) => rehomed(held, triggerSourceId, sources))
	}

	const save = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault()
		const isMissingAValue = entered.filter.rows.some(isMissingValue)
		setMarksMissingValues(isMissingAValue)

		if (!isMissingAValue) {
			onSave(entered)
		}
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
					onValueChange={pickSource}
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
			<FilterBlock
				fields={source?.payload ?? []}
				key={entered.triggerSourceId}
				filter={entered.filter}
				marksMissingValues={marksMissingValues}
				onChange={changeFilter}
				refusal={rowRefusal}
			/>
			<Button className="w-full" type="submit">
				{t("routines.form.save")}
			</Button>
		</form>
	)
}

export {
	EMPTY_ROUTINE_FILTER,
	EMPTY_ROUTINE_VALUES,
	ROUTINE_FIELD_TYPES,
	ROUTINE_FILTER_MATCH_MODES,
	ROUTINE_FILTER_OPERATORS,
	ROUTINE_OPERATOR_TAKES_VALUE,
	ROUTINE_OPERATORS_BY_FIELD_TYPE,
	type RoutineFieldType,
	type RoutineFilterMatchMode,
	type RoutineFilterOperator,
	type RoutineFilterReading,
	type RoutineFilterRow,
	type RoutineFilterValues,
	RoutineForm,
	type RoutineFormModel,
	type RoutineFormProps,
	type RoutineFormRefusal,
	type RoutineFormValues,
	type RoutinePayloadField,
	type RoutineTriggerKind,
	type RoutineTriggerSource,
	type RoutineWebhook,
}
