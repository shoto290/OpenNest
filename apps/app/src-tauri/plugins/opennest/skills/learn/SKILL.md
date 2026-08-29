---
name: "learn"
description: "How you remember. Applies when the user corrects you, tells you a preference or a fact you would have needed earlier, or asks you to remember something."
disable-model-invocation: true
metadata:
  opennest:
    preload: true
---

Your own directory is the one your instructions name as the place your skills live.

## What is yours

Two places under that directory are yours. Your agent file, at `agents/agent.md`, holds
what you always know. The `skills/<name>/SKILL.md` files hold what a task calls for.
Nothing else there is yours: never edit `.claude-plugin/` or `.mcp.json`.

In your agent file, only the block between these two lines is yours to write:

<!-- opennest: what the bot learned, the bot keeps this -->
<!-- opennest: end of what the bot learned -->

Everything above the opening line is who you are and what you were told. It belongs to
the person you are talking to and you never edit it. Everything below the block is
generated and gets overwritten. If the block is not there, write it in yourself, after
the text you were given and before anything else.

## When to write

- They corrected you.
- They told you a preference or a fact that would have saved a round-trip had you known it.
- They asked you to remember something. That one you always keep.

Write nothing else. Anything only this conversation needs is not memory.

## Yours, the space's or the person's

Your instructions name two other directories, and each one takes a different kind of fact.

The space's directory holds the project this space is for: how it is laid out, how it is
built and shipped, the words it uses for its own things, a decision that stands. A fact
about the project that every bot of this space would need goes there.

The person's directory holds the person: who they are, what they prefer, how they want to
be answered, a way of working that is not tied to one project. A fact about them goes
there.

Your own directory holds your job: the steps of a task only you carry out. That stays with
you and goes nowhere else.

Read a file of the space's directory again, as it stands on disk, immediately before you
write it: every bot of this space writes there, and one of them may have changed it since
your session opened. Then merge your line into what is there instead of writing over it.
Do the same in the person's directory, which every bot reads. Where what you find in
either contradicts what your own memory says, your own memory holds, and you leave their
file alone.

## Which of the two

Something true whatever you are asked — who they are, how they want you to answer, a
standing fact about their work — goes in the block, in a line or two. A procedure a task
triggers — the steps of a job you only do when it comes up — goes in a skill.

## How to write

Read what the block already says, and the skills you already have. Then rewrite the line
that covers the subject rather than adding beside it, and keep the block short enough to
read at a glance. For a skill, update the one that covers the subject, merge two that
overlap into one, and create one only when none of them covers it. Keep each skill's
`description` naming when it applies, so the next session knows when to reach for it.

Three files sit next to this one, and you read the ones that match before you create a
skill and before you rewrite one that already exists.

- `references/skills.md`, whenever you write a `SKILL.md`: what its
  frontmatter must carry, how long it may run, and what it may bundle.
- `references/mcp.md`, when the skill you are writing names an MCP tool.
- `references/determinism.md`, when the skill carries steps meant to run the
  same way every time.

## What to say afterwards

After any write, overwrite `.learned.md` in the directory you wrote in, with a title line under
72 characters, a blank line, then one to three lines saying what changed and why. Write
it in the language of the conversation, for someone who does not read code.

## When it takes effect

What you write is loaded at your next message, not in the turn you wrote it. Answer the
turn from what you already know, and do not read the file back as if it were in force.
