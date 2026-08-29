import { $ } from "bun"

const ROOT = new URL("..", import.meta.url).pathname

const FILES = {
	tauriConf: `${ROOT}apps/app/src-tauri/tauri.conf.json`,
	appPkg: `${ROOT}apps/app/package.json`,
	cargoToml: `${ROOT}apps/app/src-tauri/Cargo.toml`,
	cargoLock: `${ROOT}apps/app/src-tauri/Cargo.lock`,
	systemPlugin: `${ROOT}apps/app/src-tauri/plugins/opennest/.claude-plugin/plugin.json`,
	bunLock: `${ROOT}bun.lock`,
}

const SEMVER = /^\d+\.\d+\.\d+$/
const BUMP_TYPES = ["patch", "minor", "major"] as const

type BumpType = (typeof BUMP_TYPES)[number]

const isBumpType = (value: string): value is BumpType =>
	(BUMP_TYPES as readonly string[]).includes(value)

const usage =
	"Usage: bun run release <patch|minor|major|X.Y.Z> [--notes <path>] [--dry-run]"

const readNotes = async (path: string) => {
	const file = Bun.file(path)
	if (!(await file.exists())) throw new Error(`Notes file not found: ${path}`)
	const notes = (await file.text()).trim()
	if (!notes) throw new Error(`Notes file is empty: ${path}`)
	return notes
}

const buildTagMessage = (tag: string, notes?: string) =>
	notes ? `Release ${tag}\n\n${notes}` : `Release ${tag}`

const readCurrentVersion = async () => {
	const text = await Bun.file(FILES.tauriConf).text()
	const match = text.match(/"version":\s*"([^"]+)"/)
	if (!match) throw new Error("Could not read version from tauri.conf.json")
	return match[1]
}

const computeNext = (current: string, input: string) => {
	if (SEMVER.test(input)) return input
	if (!isBumpType(input))
		throw new Error(`Invalid argument "${input}".\n${usage}`)
	const [major, minor, patch] = current.split(".").map(Number)
	if (input === "major") return `${major + 1}.0.0`
	if (input === "minor") return `${major}.${minor + 1}.0`
	return `${major}.${minor}.${patch + 1}`
}

const bumpJsonVersion = (text: string, next: string) =>
	text.replace(/("version":\s*)"[^"]+"/, `$1"${next}"`)

const bumpCargoToml = (text: string, next: string) =>
	text.replace(/^version = "[^"]+"/m, `version = "${next}"`)

const bumpCargoLock = (text: string, next: string) =>
	text.replace(/(name = "opennest-app"\nversion = ")[^"]+(")/, `$1${next}$2`)

const writeFile = async (path: string, transform: (text: string) => string) => {
	const text = await Bun.file(path).text()
	await Bun.write(path, transform(text))
}

const run = async () => {
	const args = Bun.argv.slice(2)
	const dryRun = args.includes("--dry-run")
	const notesIndex = args.indexOf("--notes")
	const notesValueIndex = notesIndex === -1 ? -1 : notesIndex + 1
	const notesPath = args[notesValueIndex]
	const input = args.find(
		(arg, index) => !arg.startsWith("--") && index !== notesValueIndex,
	)

	if (!input || (notesIndex !== -1 && !notesPath)) {
		console.error(usage)
		process.exit(1)
	}

	const notes = notesPath ? await readNotes(notesPath) : undefined

	const current = await readCurrentVersion()
	const next = computeNext(current, input)
	const tag = `v${next}`

	console.log(`Release: ${current} -> ${next} (${tag})`)
	if (notesPath) console.log(`Release notes: ${notesPath}`)

	if (dryRun) {
		console.log("Dry run — no files changed, no git operations.")
		return
	}

	const branch = (await $`git rev-parse --abbrev-ref HEAD`.text()).trim()
	if (branch === "main")
		throw new Error("Refusing to release from main. Run from a release branch.")

	const status = (await $`git status --porcelain`.text()).trim()
	if (status)
		throw new Error("Working tree is not clean. Commit or stash first.")

	await writeFile(FILES.tauriConf, (text) => bumpJsonVersion(text, next))
	await writeFile(FILES.appPkg, (text) => bumpJsonVersion(text, next))
	await writeFile(FILES.cargoToml, (text) => bumpCargoToml(text, next))
	await writeFile(FILES.cargoLock, (text) => bumpCargoLock(text, next))
	await writeFile(FILES.systemPlugin, (text) => bumpJsonVersion(text, next))

	await $`bun install`

	await $`git add ${FILES.tauriConf} ${FILES.appPkg} ${FILES.cargoToml} ${FILES.cargoLock} ${FILES.systemPlugin} ${FILES.bunLock}`
	await $`git commit -m ${`chore(app): release ${tag}`}`
	await $`git tag -a ${tag} --cleanup=verbatim -m ${buildTagMessage(tag, notes)}`
	await $`git push -u origin ${branch}`
	await $`git push origin ${tag}`

	const remote = (await $`git remote get-url origin`.text()).trim()
	const repoUrl = remote
		.replace(/\.git$/, "")
		.replace(/^git@github\.com:/, "https://github.com/")
	console.log(`Pushed ${tag}. CI: ${repoUrl}/actions`)
}

await run()
