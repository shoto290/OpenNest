
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use super::{
	drafted, SkillDraft, SkillFront, LEARN_ID, MANIFEST_DIR, MANIFEST_NAME, MEMORY_CLOSE,
	MEMORY_OPEN, OPENNEST_KEY, PRELOAD_KEY, SKILLS_DIR, SKILL_NAME, VERSION,
};
use crate::private_files;

const DIR_NAME: &str = "system";

const PLUGIN_NAME: &str = "opennest";

const DESCRIPTION: &str = "What every bot in OpenNest knows how to do.";

const LEARN_DESCRIPTION: &str =
	"How you remember. Applies when the user corrects you, tells you a preference or a fact you would have needed earlier, or asks you to remember something.";

const REFERENCES_DIR: &str = "references";

const SKILLS_REFERENCE: &str = "skills.md";
const MCP_REFERENCE: &str = "mcp.md";
const DETERMINISM_REFERENCE: &str = "determinism.md";

const REFERENCES: [(&str, &str); 3] = [
	(SKILLS_REFERENCE, SKILLS_TEXT),
	(MCP_REFERENCE, MCP_TEXT),
	(DETERMINISM_REFERENCE, DETERMINISM_TEXT),
];

const SKILLS_TEXT: &str = r#"# Writing a skill

A skill is one directory. `SKILL.md` is the whole skill unless you bundle files beside it.

## The frontmatter

Two fields are required, and nothing else is.

`name` is the identifier: lowercase letters, digits and hyphens only, 64 characters at
most, and the same string as the directory it sits in.

`description` is 1024 characters at most, written in the third person about the skill and
not addressed to you. One sentence saying what the skill does, then the words and
situations that should make a session reach for it. The description is all that is read
before the skill is opened, so one that names the subject and not the trigger is a skill
that never fires.

Good: "Opens a pull request from the current branch. Use when the person asks to open a PR,
raise a pull request, or send a branch for review."

Bad: "Helps with pull requests."

## The body

Keep `SKILL.md` under 500 lines. It is read in full every time the skill fires, so it
carries what every run needs and nothing more. When a subject only some runs need starts to
crowd it, move that subject into a file beside the skill and name the file on one line
saying when to open it.

## What a skill may bundle

`references/` holds files meant to be read: prose, tables, schemas, examples. A file there
is opened by whoever needs it and stays one level deep, so a reference never sends the
reader on to another reference.

`scripts/` holds files meant to be executed: a script is run, not read into the answer. Its
worth is that it does the same thing every time without anyone retyping it.

The difference decides where a file goes. Ask what happens to it. If its content becomes
part of the reasoning, it is a reference. If only what it does and what it prints matter,
it is a script. A procedure written as prose in `scripts/` never gets run, and a program
dropped in `references/` burns the window it is read into.
"#;

const MCP_TEXT: &str = r#"# Naming a tool in a skill

## Write the whole name

An MCP tool has two parts, the server it comes from and the tool itself. Whenever a skill
names one, write it in full as `server:tool` — `github:create_pull_request`, never
`create_pull_request` on its own. The bare name matches nothing, and two servers can carry
the same tool name.

## Which servers you can reach

A session reaches the servers declared in your own `.mcp.json` and those declared in the
system plugin. Nothing else is reachable, whatever else is installed on the machine. Before
a skill names a tool, read those declarations and take the server name from there rather
than from memory.

## You never edit a `.mcp.json`

That file belongs to the person. Adding a server, changing a command, removing one: none of
it is yours, not in your own directory and not anywhere else. When a skill needs a server
that is not declared, say so in your answer and leave the file to the person.

## When the tool is not there

A run can open without the server a skill names, because it was never declared, is turned
off, or is down. Say what to do then on the step that names the tool: give the fallback
that reaches the same result, the command or the request that stands in, and where there is
none, say to stop and name the server that is missing. A skill that names a tool and says
nothing about its absence fails quietly.
"#;

const DETERMINISM_TEXT: &str = r#"# How much freedom to leave

## Three degrees

Choose one per step, by what changes between two runs.

A literal command, when the step is the same on every run. Write the command itself:
`git push --set-upstream origin "$BRANCH"`, never "push the branch upstream". Any step that
does not vary is written as the command rather than as a description of it, because a
described command is retyped from memory each run and drifts, while a written one cannot.

A template with named parameters, when the step keeps its shape and a few values change.
Write the command with those values as named placeholders, and declare every placeholder
under Inputs.

Open judgment, when the step cannot be written as a command because the right move depends
on what the run finds. Say what to reach and what to weigh, and leave the how alone. Keep
it for the steps that need it: reaching for it because writing the command is tedious turns
a procedure into a suggestion.

## The shape

Write a repeated procedure in three parts.

Inputs lists every value that differs from one run to the next, one line each, with where
it comes from. A value absent from that list is a constant, and a constant belongs written
into the Procedure.

Procedure is numbered steps in order, each one a literal command or a template whose
placeholders are all declared in Inputs.

Verify says how the run knows it worked: the command to run and the output that counts as
success.

## Opening a pull request

### Inputs

- `BRANCH`, the branch name, from the person or from the change being sent.
- `MESSAGE`, the commit message, one Conventional Commits line.
- `BODY`, the pull request body.

### Procedure

1. `git switch -c "$BRANCH"`
2. `git add -A`
3. `git commit -m "$MESSAGE"`
4. `git push --set-upstream origin "$BRANCH"`
5. `gh pr create --base main --head "$BRANCH" --title "$MESSAGE" --body "$BODY"`

### Verify

`gh pr view --json url,state` prints a state of `OPEN` and the address of the new pull
request.

Nothing else there varies. The base branch, the remote and the five commands are the same
on every run, so they are written out instead of described.
"#;

fn learn_body() -> String {
	format!(
		r#"Your own directory is the one your instructions name as the place your skills live.

## What is yours

Two places under that directory are yours. Your agent file, at `agents/agent.md`, holds
what you always know. The `skills/<name>/SKILL.md` files hold what a task calls for.
Nothing else there is yours: never edit `.claude-plugin/` or `.mcp.json`.

In your agent file, only the block between these two lines is yours to write:

{MEMORY_OPEN}
{MEMORY_CLOSE}

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

- `{REFERENCES_DIR}/{SKILLS_REFERENCE}`, whenever you write a `SKILL.md`: what its
  frontmatter must carry, how long it may run, and what it may bundle.
- `{REFERENCES_DIR}/{MCP_REFERENCE}`, when the skill you are writing names an MCP tool.
- `{REFERENCES_DIR}/{DETERMINISM_REFERENCE}`, when the skill carries steps meant to run the
  same way every time.

## What to say afterwards

After any write, overwrite `.learned.md` in the directory you wrote in, with a title line under
72 characters, a blank line, then one to three lines saying what changed and why. Write
it in the language of the conversation, for someone who does not read code.

## When it takes effect

What you write is loaded at your next message, not in the turn you wrote it. Answer the
turn from what you already know, and do not read the file back as if it were in force."#
	)
}

pub fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME).join(PLUGIN_NAME))
}

pub fn write(path: &Path) -> std::io::Result<()> {
	private_files::replace(&learn_file(path), learn()?.as_bytes())?;
	for (name, text) in REFERENCES {
		private_files::replace(&reference_dir(path).join(name), text.as_bytes())?;
	}
	private_files::replace(&manifest_file(path), manifest().as_bytes())
}

pub fn laid_down<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	path(app).filter(|path| manifest_file(path).is_file())
}

fn manifest_file(path: &Path) -> PathBuf {
	path.join(MANIFEST_DIR).join(MANIFEST_NAME)
}

fn learn_file(path: &Path) -> PathBuf {
	path.join(SKILLS_DIR).join(LEARN_ID).join(SKILL_NAME)
}

fn reference_dir(path: &Path) -> PathBuf {
	path.join(SKILLS_DIR).join(LEARN_ID).join(REFERENCES_DIR)
}

fn manifest() -> String {
	serde_json::json!({
		"name": PLUGIN_NAME,
		"version": VERSION,
		"description": DESCRIPTION,
	})
	.to_string()
}

fn learn() -> std::io::Result<String> {
	let draft = SkillDraft {
		name: LEARN_ID.to_owned(),
		description: LEARN_DESCRIPTION.to_owned(),
		body: learn_body(),
		front: SkillFront {
			metadata: Some(serde_json::json!({ OPENNEST_KEY: { PRELOAD_KEY: true } })),
			disable_model_invocation: Some(true),
			..SkillFront::default()
		},
	};
	drafted(None, &draft)
}

#[cfg(test)]
mod tests {
	use super::super::INVOCATION_KEY;
	use super::*;
	use std::fs;

	fn a_path(name: &str) -> PathBuf {
		let path = std::env::temp_dir().join(format!("opennest-system-{name}"));
		let _ = fs::remove_dir_all(&path);
		path
	}

	#[test]
	fn the_written_plugin_is_the_manifest_and_the_learn_skill() {
		let path = a_path("written");

		write(&path).expect("the plugin is written");

		let manifest: serde_json::Value =
			serde_json::from_str(&fs::read_to_string(manifest_file(&path)).expect("it reads"))
				.expect("the manifest is JSON");
		assert_eq!(manifest["name"], PLUGIN_NAME);
		assert_eq!(manifest["version"], VERSION);

		let text = fs::read_to_string(learn_file(&path)).expect("the skill reads");
		assert!(text.contains(&format!("{PRELOAD_KEY}: true")), "got {text}");
		assert!(text.contains(&format!("{INVOCATION_KEY}: true")), "got {text}");
		assert!(text.contains("`skills/<name>/SKILL.md`"), "got {text}");
		assert!(!text.contains("PLUGIN_ROOT"), "got {text}");

		let body = text.split("---\n").last().unwrap_or_default();
		assert!(body.lines().count() < 120, "got {} lines", body.lines().count());

		for (name, seeded) in REFERENCES {
			let reference = reference_dir(&path).join(name);
			assert_eq!(fs::read_to_string(&reference).expect("the reference reads"), seeded);
			assert_eq!(body.matches(name).count(), 1, "got {body}");
			for (other, _) in REFERENCES {
				assert!(other == name || !seeded.contains(other), "got {seeded}");
			}
			assert!(
				seeded.lines().count() <= 100 || seeded.contains("## Contents"),
				"got {} lines in {name}",
				seeded.lines().count()
			);
		}

		let _ = fs::remove_dir_all(&path);
	}

	#[test]
	fn a_second_write_lays_the_same_plugin_down_over_a_hand_edit() {
		let path = a_path("rewritten");
		write(&path).expect("the plugin is written");
		let first = fs::read_to_string(learn_file(&path)).expect("the skill reads");
		private_files::replace(&manifest_file(&path), b"{\"name\":\"mine\"}")
			.expect("the hand edit lands");
		private_files::replace(&reference_dir(&path).join(MCP_REFERENCE), b"mine")
			.expect("the hand edit lands");

		write(&path).expect("the plugin is written again");

		let manifest = fs::read_to_string(manifest_file(&path)).expect("it reads");
		assert!(manifest.contains(PLUGIN_NAME), "got {manifest}");
		for (name, seeded) in REFERENCES {
			assert_eq!(
				fs::read_to_string(reference_dir(&path).join(name))
					.expect("the reference reads"),
				seeded
			);
		}
		assert_eq!(fs::read_to_string(learn_file(&path)).expect("the skill reads"), first);

		let _ = fs::remove_dir_all(&path);
	}
}
