import type { BotSkillItem } from "@workspace/ui/components/bot-settings"

/** A bundle with both marks in it: one skill carried in every prompt, two the bot
 * would have to go and read. */
export const BOT_SKILLS: BotSkillItem[] = [
	{
		id: "release-notes",
		name: "Release notes",
		description: "How this project words a changelog entry",
		body: "# Release notes\n\nOne line per change, in the past tense, naming what a reader gains rather than what moved in the code.",
		isPreloaded: true,
	},
	{
		id: "commit-style",
		name: "Commit style",
		description: "Conventional commits, one concern per commit",
		body: "# Commit style\n\n`type(scope): subject` in the imperative. One concern per commit — a commit that needs an `and` is two commits.",
		isPreloaded: false,
	},
	{
		id: "review-checklist",
		name: "Review checklist",
		description: "",
		body: "# Review checklist\n\nEvery changed line traces to the request. No refactor rides along.",
		isPreloaded: false,
	},
]

/** One skill written long enough to wrap its name, run past its description and
 * fill the body field several times over. */
export const LONG_SKILL: BotSkillItem = {
	id: "incident-response-runbook",
	name: "Incident response runbook for the nightly ingestion pipeline",
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
}
