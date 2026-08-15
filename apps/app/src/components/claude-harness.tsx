import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { describeTransportError } from "@/lib/claude/contract"
import { useClaudeTransport } from "@/lib/claude/use-claude-transport"

export function ClaudeHarness() {
	const { state, check, start, resumeCurrent, submit, cancel, respond, shutdown } =
		useClaudeTransport()
	const [draft, setDraft] = useState("")

	const busy = state.turn === "submitting" || state.turn === "running"
	const canSend = draft.trim().length > 0 && !busy
	const permission = state.permission

	const send = () => {
		if (!canSend) {
			return
		}
		submit(draft.trim())
		setDraft("")
	}

	return (
		<div className="flex min-h-svh flex-col gap-4 p-6 text-sm">
			<header className="flex flex-wrap items-center gap-2">
				<span className="font-medium">Claude transport</span>
				<code className="bg-muted rounded px-2 py-0.5 text-xs">{state.connection}</code>
				<code className="bg-muted rounded px-2 py-0.5 text-xs">{state.turn}</code>
				{state.binaryVersion ? (
					<code className="text-muted-foreground text-xs">v{state.binaryVersion}</code>
				) : null}
				{state.sessionId ? (
					<code className="text-muted-foreground text-xs">{state.sessionId}</code>
				) : null}
			</header>

			<div className="flex flex-wrap gap-2">
				<Button size="sm" variant="outline" onClick={() => check()}>
					Check
				</Button>
				<Button size="sm" variant="outline" onClick={() => start()}>
					Start
				</Button>
				<Button
					size="sm"
					variant="outline"
					disabled={!state.sessionId}
					onClick={() => resumeCurrent()}
				>
					Resume
				</Button>
				<Button size="sm" variant="outline" disabled={!busy} onClick={() => cancel()}>
					Stop
				</Button>
				<Button size="sm" variant="outline" onClick={() => shutdown()}>
					Shutdown
				</Button>
			</div>

			{permission ? (
				<div className="border-border flex flex-wrap items-center gap-3 rounded border p-3">
					<div className="min-w-0 flex-1">
						<p className="font-medium">{permission.title}</p>
						{permission.detail ? (
							<p className="text-muted-foreground truncate font-mono text-xs">
								{permission.detail}
							</p>
						) : null}
					</div>
					<Button size="sm" onClick={() => respond(permission.id, "allowOnce")}>
						Autoriser
					</Button>
					<Button size="sm" variant="outline" onClick={() => respond(permission.id, "deny")}>
						Refuser
					</Button>
				</div>
			) : null}

			<ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
				{state.messages.map((message) => (
					<li key={message.id} className="flex flex-col gap-1">
						<span className="text-muted-foreground text-xs uppercase">
							{message.role} · {message.completion}
						</span>
						<p className="whitespace-pre-wrap">{message.text}</p>
					</li>
				))}
			</ol>

			{state.activities.length > 0 ? (
				<ul className="text-muted-foreground flex flex-col gap-1 text-xs">
					{state.activities.map((activity) => (
						<li key={activity.id}>
							{activity.status} · {activity.title || activity.kind}
						</li>
					))}
				</ul>
			) : null}

			{state.errors.length > 0 ? (
				<ul className="text-destructive flex flex-col gap-1 text-xs">
					{state.errors.map((entry) => (
						<li key={entry.id}>{describeTransportError(entry.error)}</li>
					))}
				</ul>
			) : null}

			<div className="flex gap-2">
				<input
					className="border-border bg-background flex-1 rounded border px-3 py-2"
					value={draft}
					placeholder="Prompt"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault()
							send()
						}
					}}
				/>
				<Button disabled={!canSend} onClick={send}>
					Envoyer
				</Button>
			</div>
		</div>
	)
}
