"use client"

import { useState } from "react"
import { useTranslation } from "react-i18next"

import {
	ApplicationCard,
	type ApplicationCardProps,
} from "@workspace/ui/components/application-card"
import {
	MessageBubble,
	MessageBubbleContent,
} from "@workspace/ui/components/message-bubble"
import type {
	ToolQuestionAction,
	ToolQuestionExit,
} from "@workspace/ui/components/tool-question"
import { Button } from "@workspace/ui/components/ui/button"
import { useCopyText } from "@workspace/ui/hooks/use-copy-text"

const INSTALL_CONTROL = {
	primary: { variant: "default" },
	outline: { variant: "outline", className: "rounded-full px-3.5 leading-4.5" },
	quiet: { variant: "ghost", className: "text-muted-foreground leading-4.5" },
} as const

type ApplicationInstallControl =
	| (ToolQuestionAction & { emphasis: "primary" })
	| (ToolQuestionExit & { emphasis: "outline" | "quiet" })

type ApplicationInstallProps = {
	application: Omit<ApplicationCardProps, "footnote">
	address?: string
	leading: ApplicationInstallControl
	trailing?: ApplicationInstallControl
}

const ApplicationInstall = ({
	application,
	address,
	leading,
	trailing,
}: ApplicationInstallProps) => (
	<MessageBubble variant="soft">
		<MessageBubbleContent className="w-full">
			<div className="grid gap-3" data-slot="application-install">
				<ApplicationCard {...application} />
				{address ? <AddressRow address={address} /> : null}
				<div className="flex flex-wrap items-center gap-2">
					<InstallControl control={leading} />
					{trailing ? <InstallControl control={trailing} /> : null}
				</div>
			</div>
		</MessageBubbleContent>
	</MessageBubble>
)

type InstallControlProps = {
	control: ApplicationInstallControl
}

const InstallControl = ({ control }: InstallControlProps) => (
	<Button
		{...INSTALL_CONTROL[control.emphasis]}
		onClick={control.onSelect}
		type="button"
	>
		{control.emphasis === "primary" ? (
			<control.icon className="size-3.5" data-icon="inline-start" />
		) : null}
		{control.label}
	</Button>
)

type AddressRowProps = {
	address: string
}

const AddressRow = ({ address }: AddressRowProps) => {
	const { t } = useTranslation("chat")
	const { copied, copy } = useCopyText(address)
	const [hasFailedToCopy, setHasFailedToCopy] = useState(false)

	const hasCopied = copied && !hasFailedToCopy
	const copyLabel = hasFailedToCopy
		? t("applicationInstall.copyFailed")
		: hasCopied
			? t("toolQuestion.copied")
			: t("toolQuestion.copy")
	const announced = hasFailedToCopy
		? t("toolQuestion.copyFailed")
		: hasCopied
			? t("toolQuestion.copyAnnounced")
			: null

	const copyAddress = () => {
		setHasFailedToCopy(false)
		copy().catch(() => setHasFailedToCopy(true))
	}

	return (
		<div
			className="flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background py-1 pe-1.5 ps-3 has-[input:focus-visible]:border-ring has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/30"
			data-slot="application-install-address"
		>
			<input
				aria-label={t("applicationInstall.address")}
				className="min-w-0 flex-1 truncate bg-transparent font-mono text-compact text-muted-foreground leading-4.5 outline-none"
				readOnly
				value={address}
			/>
			<Button
				className="h-6.5 rounded-full px-2.5"
				onClick={copyAddress}
				size="xs"
				type="button"
				variant="secondary"
			>
				{copyLabel}
			</Button>
			<span aria-live="polite" className="sr-only">
				{announced}
			</span>
		</div>
	)
}

export {
	ApplicationInstall,
	type ApplicationInstallControl,
	type ApplicationInstallProps,
}
