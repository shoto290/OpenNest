import type { BotCommitItem } from "@workspace/ui/components/bot-settings"

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const ago = (ms: number) => Date.now() - ms

const INSTRUCTIONS_DIFF = `diff --git a/AGENTS.md b/AGENTS.md
index 3c1f7a2..8b40d19 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -12,7 +12,8 @@
 You are the Nest Keeper.

-Answer with the file you would touch.
+Answer with the file you would touch, then the change.
+Search the package for a component that already does the job first.

 Every visual belongs to packages/ui.`

const SKILL_DIFF = `diff --git a/skills/release-notes/SKILL.md b/skills/release-notes/SKILL.md
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/skills/release-notes/SKILL.md
@@ -0,0 +1,5 @@
+---
+name: release-notes
+description: How this project words a changelog entry
+---
+One line per change, in the past tense.`

const BUNDLE_DIFF = `diff --git a/bot.json b/bot.json
new file mode 100644
index 0000000..9f2ad41
--- /dev/null
+++ b/bot.json
@@ -0,0 +1,4 @@
+{
+  "name": "Nest Keeper",
+  "model": "haiku-4-5"
+}`

const MODEL_DIFF = `diff --git a/bot.json b/bot.json
index 9f2ad41..6d5be07 100644
--- a/bot.json
+++ b/bot.json
@@ -1,5 +1,5 @@
 {
   "name": "Nest Keeper",
-  "model": "haiku-4-5",
+  "model": "sonnet-4-5",
   "changesNothing": false
 }`

const WIDE_LINE_DIFF = `diff --git a/AGENTS.md b/AGENTS.md
index 8b40d19..a71c904 100644
--- a/AGENTS.md
+++ b/AGENTS.md
@@ -1,3 +1,3 @@
 You are the Nest Keeper.
-Answer with the file you would touch.
+Answer with the file you would touch, then the change it needs, then the one sentence a reader who has never opened this repository would need in order to understand why that file and not another one, written without a single abbreviation.`

const UNREADABLE_DIFF = `The bundle was restored from a snapshot rather than from a commit, so there is no patch to read here — only the note the host wrote in its place.`

export const ADDED_SKILL_COMMIT: BotCommitItem = {
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
	ADDED_SKILL_COMMIT,
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
	...ADDED_SKILL_COMMIT,
	diff: undefined,
}

export const WIDE_LINE_COMMIT: BotCommitItem = {
	id: "commit-wide",
	at: ago(2 * HOUR),
	author: "user",
	title: "Spelled the answer out in full",
	body: "One sentence, and no room left on the line for it.",
	diff: WIDE_LINE_DIFF,
}

export const UNREADABLE_DIFF_COMMIT: BotCommitItem = {
	id: "commit-unreadable",
	at: ago(30 * MINUTE),
	author: "bot",
	title: "Restored the bundle from a snapshot",
	body: "There is no patch behind this one.",
	diff: UNREADABLE_DIFF,
}
