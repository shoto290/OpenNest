/** A prompt that is nothing but a slash and the start of a command name. The
 * moment a space lands the reader has moved on to writing the prompt itself. */
const COMMAND_DRAFT = /^\/(\S*)$/

/** The commands as the menu lists them: what the session named, wearing the slash
 * the reader types in front of it. */
export function commandOptionsFor(commands: string[]): string[] {
	return commands.map((command) => `/${command}`)
}

/** The query the menu opens on, or null while it stays shut — a prompt of any
 * other shape, and a session that announced nothing to offer. */
export function commandQueryIn(
	prompt: string,
	commands: string[],
): string | null {
	if (commands.length === 0) {
		return null
	}
	const draft = COMMAND_DRAFT.exec(prompt)
	return draft ? draft[1] : null
}

/** What a picked command leaves in the composer: the command, and the space the
 * reader would have typed next. */
export function promptForCommand(option: string): string {
	return `${option} `
}

/** Whether a dismissal still holds. It covers every draft that stays in the
 * command shape — one edited back to the shape it was dismissed on included — and
 * rearms the moment the draft leaves that shape. */
export function holdsDismissal(
	wasDismissed: boolean,
	query: string | null,
): boolean {
	return wasDismissed && query !== null
}
