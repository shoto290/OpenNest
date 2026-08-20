import type { ComponentPropsWithoutRef } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

export type MarkdownTaskCheckboxProps = ComponentPropsWithoutRef<"input"> &
	ExtraProps

/** GFM emits a bare checkbox. A transcript is a record, so the box stays read-only
 * and names its own state: the item text sits beside it, never inside a label. */
export const MarkdownTaskCheckbox = ({
	node,
	...props
}: MarkdownTaskCheckboxProps) => {
	const { t } = useTranslation("chat")

	return (
		<input
			{...props}
			aria-label={props.checked ? t("task.done") : t("task.todo")}
			readOnly
		/>
	)
}
