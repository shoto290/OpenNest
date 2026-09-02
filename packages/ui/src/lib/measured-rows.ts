export type MeasuredRow = {
	key: string
	content: string
	length: number
	height: number
}

export const ONE_LINE_REPLY: MeasuredRow = {
	key: "one-line-reply",
	content: "Queued behind the index build.",
	length: 30,
	height: 44,
}

export const USER_MESSAGE: MeasuredRow = {
	key: "user-message",
	content: "Can you walk me through what the migration script touches?",
	length: 58,
	height: 44,
}

export const CODE_ANSWER: MeasuredRow = {
	key: "code-answer",
	content: [
		"```ts",
		"export const migrate = async (db: Database) => {",
		'  await db.addColumn("accounts", "region", "text")',
		'  await db.copyColumn("memberships", "role", "role_id")',
		'  await db.dropColumn("memberships", "role")',
		"}",
		"```",
	].join("\n"),
	length: 202,
	height: 185,
}

export const MARKDOWN_ANSWER: MeasuredRow = {
	key: "markdown-answer",
	content: [
		"It rewrites three tables: accounts, memberships and invites. Accounts gains a nullable region column, memberships loses the legacy role string, and invites moves its expiry to a timestamptz.",
		"The legacy role string is copied into role_id before the column is dropped, so the drop is the last statement of the transaction and a failure halfway rolls every statement back.",
		"The down migration recreates the role string from role_id, which is lossless for every row the up migration wrote, so the rollback path stays open once it has shipped.",
	].join("\n\n"),
	length: 537,
	height: 252,
}

export const MEASURED_ROWS: MeasuredRow[] = [
	ONE_LINE_REPLY,
	USER_MESSAGE,
	CODE_ANSWER,
	MARKDOWN_ANSWER,
]
