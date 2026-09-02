"use client"

import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { useTranslation } from "react-i18next"

import { buttonVariants } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { POPUP_CLASS } from "@workspace/ui/components/settings-styles"
import { cn } from "@workspace/ui/lib/utils"

const Provider = ToastPrimitive.Provider
const Portal = ToastPrimitive.Portal

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

const Viewport = ({ className, ...props }: ToastPrimitive.Viewport.Props) => (
	<ToastPrimitive.Viewport
		className={cn(
			"fixed top-4 end-4 z-50 flex w-88 max-w-[calc(100vw-2rem)] flex-col gap-2 outline-none",
			className,
		)}
		data-slot="toast-viewport"
		{...props}
	/>
)

const Root = ({ className, ...props }: ToastPrimitive.Root.Props) => (
	<ToastPrimitive.Root
		aria-hidden={false}
		className={cn(
			POPUP_CLASS,
			"flex items-start gap-3 rounded-2xl p-3 transition-[opacity,translate] duration-150 ease-out focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 data-ending-style:opacity-0 data-limited:hidden data-starting-style:opacity-0 motion-safe:data-ending-style:translate-x-2 motion-safe:data-starting-style:translate-x-2",
			className,
		)}
		data-slot="toast"
		{...props}
	/>
)

const Title = ({ className, ...props }: ToastPrimitive.Title.Props) => (
	<ToastPrimitive.Title
		className={cn("break-words font-medium text-sm", className)}
		data-slot="toast-title"
		{...props}
	/>
)

const Description = ({
	className,
	...props
}: ToastPrimitive.Description.Props) => (
	<ToastPrimitive.Description
		className={cn("break-words text-muted-foreground text-sm", className)}
		data-slot="toast-description"
		{...props}
	/>
)

const Close = ({ className, ...props }: ToastPrimitive.Close.Props) => {
	const { t } = useTranslation("common")

	return (
		<ToastPrimitive.Close
			aria-hidden={false}
			aria-label={t("notice.close")}
			className={cn(
				buttonVariants({ variant: "ghost", size: "icon-sm" }),
				"shrink-0",
				className,
			)}
			data-slot="toast-close"
			{...props}
		>
			<Icons.Close aria-hidden="true" className="size-4" />
		</ToastPrimitive.Close>
	)
}

export {
	Close,
	createToastManager,
	Description,
	Portal,
	Provider,
	Root,
	Title,
	useToastManager,
	Viewport,
}
