"use client"

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import {
	BACKDROP_CLASS,
	POPUP_CLASS,
} from "@workspace/ui/components/bot-settings-panel/styles"
import { buttonVariants } from "@workspace/ui/components/button"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const Root = DialogPrimitive.Root
const Trigger = DialogPrimitive.Trigger
const Close = DialogPrimitive.Close

type DialogContentProps = Omit<
	DialogPrimitive.Popup.Props,
	"initialFocus" | "finalFocus"
>

const Content = ({ children, className, ...props }: DialogContentProps) => (
	<DialogPrimitive.Portal>
		<DialogPrimitive.Backdrop
			className={BACKDROP_CLASS}
			data-slot="dialog-backdrop"
		/>
		<DialogPrimitive.Popup
			className={cn(
				POPUP_CLASS,
				"-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-3rem)] w-128 max-w-[calc(100vw-3rem)] flex-col gap-4 overflow-y-auto rounded-2xl p-6",
				"[&>[data-slot=dialog-title]+[data-slot=dialog-description]]:-mt-3",
				className,
			)}
			data-slot="dialog-content"
			{...props}
		>
			<Close
				aria-label="Close"
				className={cn(
					buttonVariants({ variant: "ghost", size: "icon-sm" }),
					"absolute top-4 right-4",
				)}
			>
				<Icons.Close aria-hidden="true" className="size-4" />
			</Close>
			{children}
		</DialogPrimitive.Popup>
	</DialogPrimitive.Portal>
)

const Title = ({ className, ...props }: DialogPrimitive.Title.Props) => (
	<DialogPrimitive.Title
		className={cn("pr-8 font-medium text-base", className)}
		data-slot="dialog-title"
		{...props}
	/>
)

const Description = ({
	className,
	...props
}: DialogPrimitive.Description.Props) => (
	<DialogPrimitive.Description
		className={cn("text-muted-foreground text-sm", className)}
		data-slot="dialog-description"
		{...props}
	/>
)

export { Close, Content, Description, Root, Title, Trigger }
