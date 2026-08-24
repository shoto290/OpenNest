import type { PromptCommandOption } from "@workspace/ui/components/prompt-command-menu"

import type { AgentCommand } from "@/lib/agent/contract"

const COMMAND_DRAFT = /^\/(\S*)$/

export function commandOptionsFor(
	commands: AgentCommand[],
): PromptCommandOption[] {
	return commands.map((command) => ({ ...command, name: `/${command.name}` }))
}

export function commandQueryIn(
	prompt: string,
	commands: AgentCommand[],
): string | null {
	if (commands.length === 0) {
		return null
	}
	const draft = COMMAND_DRAFT.exec(prompt)
	return draft ? draft[1] : null
}

export function promptForCommand(option: string): string {
	return `${option} `
}

export function holdsDismissal(
	wasDismissed: boolean,
	query: string | null,
): boolean {
	return wasDismissed && query !== null
}
