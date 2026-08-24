import type { ComponentPropsWithoutRef } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

export type MarkdownTaskCheckboxProps = ComponentPropsWithoutRef<"input"> &
	ExtraProps

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
