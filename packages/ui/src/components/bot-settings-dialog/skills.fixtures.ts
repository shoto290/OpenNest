import type { BotSkillItem } from "@workspace/ui/components/bot-settings"

/** A bundle with both marks in it: one skill carried in every prompt, two the bot
 * would have to go and read. */
export const BOT_SKILLS: BotSkillItem[] = [
	{
		id: "release-notes",
		name: "release-notes",
		description: "How this project words a changelog entry",
		body: "# Release notes\n\nOne line per change, in the past tense, naming what a reader gains rather than what moved in the code.",
		isPreloaded: true,
		isSystem: false,
	},
	{
		id: "commit-style",
		name: "commit-style",
		description: "Conventional commits, one concern per commit",
		body: "# Commit style\n\n`type(scope): subject` in the imperative. One concern per commit — a commit that needs an `and` is two commits.",
		isPreloaded: false,
		isSystem: false,
	},
	{
		id: "review-checklist",
		name: "review-checklist",
		description: "",
		body: "# Review checklist\n\nEvery changed line traces to the request. No refactor rides along.",
		isPreloaded: false,
		isSystem: false,
	},
]

/** One skill written long enough to wrap its name, run past its description and
 * fill the body field several times over. */
export const LONG_SKILL: BotSkillItem = {
	id: "incident-response-runbook",
	name: "incident-response-runbook-for-the-nightly-ingestion-pipeline",
	description:
		"Everything to do, in order, when the nightly ingestion pipeline stops answering — who to tell, what to read first, and what may never be replayed twice",
	body: `# Incident response runbook

## Before anything

Read the last checkpoint before replaying a batch: a batch replayed twice is counted twice, and nothing downstream can tell the difference.

## Who to tell

The on-call reader first, in the incident channel, with the batch id and the hour it stopped. Nobody else until the batch id is known — a page with no id in it is a page that gets asked for one.

## What to read first

1. The scheduler's own log, for the batch that never closed.
2. The checkpoint table, for the last sequence it wrote.
3. The dead letter queue, for rows that were refused rather than lost.

## What may never be replayed twice

Anything that emits: a mail, an invoice, a webhook. Replaying those is a second real-world event, not a second copy of the first one.

## After it answers again

Write the incident down the same day. A runbook that grows after every incident is the only kind worth reading before one.`,
	isPreloaded: true,
	isSystem: false,
}

/** A skill that answers everything its format lets it answer, forked context
 * included, so a section is never reviewed on empty fields. */
export const DETAILED_SKILL: BotSkillItem = {
	id: "changelog-release",
	name: "changelog-release",
	description:
		"Writes the changelog entry for a release from the merged pull requests",
	body: "# Changelog\n\nOne line per change, in the past tense, naming what a reader gains.",
	whenToUse:
		"A release is being cut and the merged pull requests since the last tag have to become one readable entry.",
	argumentHint: "[version] [--draft]",
	arguments: "version\ndraft",
	isPreloaded: false,
	isSystem: false,
	isModelInvocationDisabled: false,
	isUserInvocable: true,
	paths: "CHANGELOG.md\ndocs/releases/**/*.md",
	model: "claude-sonnet",
	effort: "medium",
	context: "fork",
	shell: "/bin/zsh",
	agent: "release-writer",
	isBackground: true,
	allowedTools: "Read\nGrep\nWrite",
	disallowedTools: "Bash",
	hooks: '{\n  "PreToolUse": []\n}',
	license: "MIT",
	compatibility: ">=1.4",
	metadata: '{\n  "author": "Ada Martin"\n}',
}

/** A description and a `when_to_use` that together run past the 1536 characters the
 * two share, so the budget under the field is over rather than near. */
export const OVER_BUDGET_SKILL: BotSkillItem = {
	...DETAILED_SKILL,
	id: "over-budget",
	description: "Writes the changelog entry for a release. ".repeat(20),
	whenToUse:
		"A release is being cut and nobody wants to read the diff. ".repeat(20),
}

/** A skill the host wrote: listed and opened like the others, tagged as its own, and
 * read rather than edited — its body is regenerated from what the machine answers. */
export const SYSTEM_SKILL: BotSkillItem = {
	id: "environment",
	name: "environment",
	description: "What this machine is, as the host reads it",
	body: "# Environment\n\nPlatform: darwin 24.5.0\nShell: /bin/zsh\nGit: 2.45.2\nNode: 22.11.0\n\nThe working tree is a Turborepo monorepo. Every path below is read from the machine each time this bot starts, so nothing here is worth writing by hand.",
	isPreloaded: true,
	isSystem: true,
}
