import type {
	FieldType,
	FilterMatchMode,
	FilterOperator,
} from "./filter-vocabulary"

export type PayloadField = {
	name: string
	type: FieldType
}

export type TriggerSource = {
	id: string
	title: string
	payload: PayloadField[]
	dedupeKey: string
	header?: string
}

export type FilterRow = {
	field: string
	operator: FilterOperator
	value?: string | number | boolean
}

export type Filter = {
	matchMode: FilterMatchMode
	rows: FilterRow[]
}
