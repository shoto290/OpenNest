"use client"

import { type FormEvent, useState } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@workspace/ui/components/button"
import type { ConversationBot } from "@workspace/ui/components/conversation-bots"
import {
	Content,
	Description,
	Root,
	Title,
} from "@workspace/ui/components/dialog"
import { BotPicker } from "@workspace/ui/components/new-conversation-dialog/bot-picker"
import { PickedBots } from "@workspace/ui/components/new-conversation-dialog/picked-bots"
import { SettingsField } from "@workspace/ui/components/settings-field"

type NewConversationDraft = {
	name: string
	botIds: string[]
}

type NewConversationFormProps = {
	bots: ConversationBot[]
	onCancel: () => void
	onCreate: (draft: NewConversationDraft) => void
}

const NewConversationForm = ({
	bots,
	onCancel,
	onCreate,
}: NewConversationFormProps) => {
	const { t } = useTranslation("chat")
	const [name, setName] = useState("")
	const [search, setSearch] = useState("")
	const [pickedIds, setPickedIds] = useState<string[]>([])

	const pickedBots = pickedIds.flatMap(
		(id) => bots.find((bot) => bot.id === id) ?? [],
	)
	const isCreatable = pickedIds.length > 0

	const dismiss = (id: string) =>
		setPickedIds((picked) => picked.filter((each) => each !== id))

	const pick = (id: string) =>
		pickedIds.includes(id)
			? dismiss(id)
			: setPickedIds((picked) => [...picked, id])

	const submit = (event: FormEvent) => {
		event.preventDefault()
		if (isCreatable) {
			onCreate({ name: name.trim(), botIds: pickedIds })
		}
	}

	return (
		<form className="flex min-h-0 flex-col gap-4" onSubmit={submit}>
			<SettingsField
				label={t("newConversation.name.label")}
				onValueChange={setName}
				placeholder={t("newConversation.name.placeholder")}
				value={name}
			/>

			<PickedBots bots={pickedBots} onDismiss={dismiss} />

			<BotPicker
				bots={bots}
				onPick={pick}
				onSearchChange={setSearch}
				pickedIds={pickedIds}
				search={search}
			/>

			<div className="flex justify-end gap-2">
				<Button onClick={onCancel} type="button" variant="outline">
					{t("confirm.cancel", { ns: "common" })}
				</Button>
				<Button disabled={!isCreatable} type="submit">
					{t("newConversation.create")}
				</Button>
			</div>
		</form>
	)
}

type NewConversationDialogProps = {
	open: boolean
	onClose: () => void
	bots: ConversationBot[]
	onCreate: (draft: NewConversationDraft) => void
}

const NewConversationDialog = ({
	open,
	onClose,
	bots,
	onCreate,
}: NewConversationDialogProps) => {
	const { t } = useTranslation("chat")

	return (
		<Root onOpenChange={(next) => !next && onClose()} open={open}>
			<Content>
				<Title>{t("newConversation.title")}</Title>
				<Description>{t("newConversation.description")}</Description>
				<NewConversationForm
					bots={bots}
					onCancel={onClose}
					onCreate={onCreate}
				/>
			</Content>
		</Root>
	)
}

export {
	type ConversationBot,
	NewConversationDialog,
	type NewConversationDialogProps,
	type NewConversationDraft,
}
