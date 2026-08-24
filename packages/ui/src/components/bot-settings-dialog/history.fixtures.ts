import type { BotCommitItem } from "@workspace/ui/components/bot-settings"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const ago = (ms: number) => Date.now() - ms

const INSTRUCTIONS_DIFF = `--- a/AGENTS.md
+++ b/AGENTS.md
@@ -12,7 +12,8 @@
 You are the Nest Keeper.

-Answer with the file you would touch.
+Answer with the file you would touch, then the change.
+Search the package for a component that already does the job first.

 Every visual belongs to packages/ui.`

const SKILL_DIFF = `--- /dev/null
+++ b/skills/release-notes/SKILL.md
@@ -0,0 +1,5 @@
+---
+name: release-notes
+description: How this project words a changelog entry
+---
+One line per change, in the past tense.`

const BUNDLE_DIFF = `--- /dev/null
+++ b/bot.json
@@ -0,0 +1,4 @@
+{
+  "name": "Nest Keeper",
+  "model": "haiku-4-5"
+}`

const MODEL_DIFF = `--- a/bot.json
+++ b/bot.json
@@ -3,5 +3,5 @@
   "name": "Nest Keeper",
-  "model": "haiku-4-5",
+  "model": "sonnet-4-5",
   "changesNothing": false`

const ADDED_SKILL: BotCommitItem = {
	id: "commit-3",
	at: ago(5 * HOUR),
	author: "user",
	title: "Added the release-notes skill",
	body: "How this project words a changelog entry, carried in every prompt.",
	diff: SKILL_DIFF,
}

export const BOT_COMMITS: BotCommitItem[] = [
	{
		id: "commit-4",
		at: ago(8 * MINUTE),
		author: "bot",
		title: "Switched the model to Claude Sonnet 4.5",
		body: "The runs were being cut short on the smaller model.",
		diff: MODEL_DIFF,
	},
	ADDED_SKILL,
	{
		id: "commit-2",
		at: ago(3 * DAY),
		author: "user",
		title: "Rewrote the instructions",
		body: "The bot now names the file it would touch before it proposes anything.",
		diff: INSTRUCTIONS_DIFF,
	},
	{
		id: "commit-1",
		at: ago(21 * DAY),
		author: "bot",
		title: "Created the bundle",
		body: "",
		diff: BUNDLE_DIFF,
	},
]

export const AWAITING_DIFF_COMMIT: BotCommitItem = {
	...ADDED_SKILL,
	diff: undefined,
}
