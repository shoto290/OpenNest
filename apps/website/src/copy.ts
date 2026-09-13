export const WEBSITE_COPY = {
	headline: "Your team of companions.",
	lead: "They live on your machine, work in your tools, and keep going while you do something else.",
	downloadAction: "Download",
	downloadActionMacOS: "Download for macOS",
	downloadActionWindows: "Download for Windows",
	downloadActionLinux: "Download for Linux",
	githubAction: "View on GitHub",
	mobileNote:
		"Desktop today, mobile soon. Open this page on your computer to download.",
	fineprintRuns: "RUNS ON YOUR",
	fineprintSubscription: "CLAUDE SUBSCRIPTION",
	fineprintSeparator: "·",
	fineprintLicense: "MIT",
	credit: "Made by Shoto",
	creditHandle: "@shoto290",
}

const AUTHOR_SLUG = "shoto290"

const REPOSITORY_SLUG = `${AUTHOR_SLUG}/kiroshi-monorepo`

export const AUTHOR_URL = `https://github.com/${AUTHOR_SLUG}`

export const AUTHOR_X_URL = `https://x.com/${AUTHOR_SLUG}`

export const AUTHOR_X_AVATAR_URL = `https://unavatar.io/x/${AUTHOR_SLUG}`

export const REPOSITORY_URL = `https://github.com/${REPOSITORY_SLUG}`

export const RELEASES_URL = `${REPOSITORY_URL}/releases`

export const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPOSITORY_SLUG}/releases/latest`

export const SCENE_COPY = {
	sceneLabel: "Live demonstration of the Kiroshi app",
	reader: "Steve",
	composerPlaceholder: "Message the room, or @ a companion...",
	spaces: {
		personal: "Personal",
		work: "Work",
	},
	bots: {
		mochi: {
			name: "Mochi",
			title: "Home",
			preview: "Rent's out Friday. Nothing else is due this week.",
			timestamp: "2m",
		},
		olive: {
			name: "Olive",
			title: "Meals",
			preview: "Dinner's set through Sunday. You're out of olive oil.",
			timestamp: "18m",
		},
		pip: {
			name: "Pip",
			title: "Inbox",
			preview: "Inbox's at four. Two need an answer today.",
			timestamp: "1h",
		},
		tomo: {
			name: "Tomo",
			title: "Money",
			preview: "You're 60 € over on food, and it's the 11th.",
			timestamp: "3h",
		},
		ash: {
			name: "Ash",
			title: "Reading",
			preview: "Nine articles saved. Two are worth your evening.",
			timestamp: "1d",
		},
		wren: {
			name: "Wren",
			title: "Lead",
			preview: "Both reviews are in. The release note's waiting on you.",
			timestamp: "4m",
		},
		ivy: {
			name: "Ivy",
			title: "Front-end",
			preview: "Settings is on staging. It needs your eyes before Thursday.",
			timestamp: "9m",
		},
		sable: {
			name: "Sable",
			title: "Design",
			preview: "Three screens are drawn. Five still have no empty state.",
			timestamp: "40m",
		},
		juno: {
			name: "Juno",
			title: "Support",
			preview: "Nine came in overnight. Seven are the same bug.",
			timestamp: "2h",
		},
	},
	conversations: {
		lisbon: {
			name: "Lisbon in May",
			speaker: "Tomo",
			preview: "thinking…",
			timestamp: "now",
		},
		move: {
			name: "The move",
			speaker: "Mochi",
			preview: "The lease is signed. The deposit clears Tuesday.",
			timestamp: "2d",
		},
		release: {
			name: "Release 4.2",
			speaker: "Ivy",
			preview: "thinking…",
			timestamp: "now",
		},
		triage: {
			name: "Support triage",
			speaker: "Ivy",
			preview: "I've got the export seven. It's the retry, not the queue.",
			timestamp: "20m",
		},
	},
	missions: {
		personal: {
			flat: {
				objective: "Find a flat in Graça for four nights, under 600 €.",
				timestamp: "now",
			},
			flights: {
				objective:
					"Hold the flights at 180 € and tell me the moment they move.",
				timestamp: "12m",
			},
		},
		work: {
			emptyStates: {
				objective: "Take the empty state through the five screens without one.",
				externalId: "APP-215",
				timestamp: "now",
			},
			settings: {
				objective: "Ship the settings screen behind the flag.",
				externalId: "APP-212",
				timestamp: "9m",
			},
			exportQueue: {
				objective: "Cut the export queue in half.",
				externalId: "APP-209",
				timestamp: "1h",
			},
		},
	},
	routines: {
		fare: {
			title: "Every evening at 19:00, check the fare and say if it moved",
			trigger: "Schedule",
		},
		booking: {
			title: "Every Monday at 9, list what's still not booked",
			trigger: "Schedule",
		},
		merged: {
			title: "Every weekday at 9, say what merged overnight",
			trigger: "Schedule",
		},
		build: {
			title: "When a build fails, name the test that broke",
			trigger: "Webhook",
		},
	},
	loops: {
		personal: {
			request:
				"<@tomo> <@ash> four nights in Lisbon in May, under 900 € for two. Take it between you.",
			firstAnswer:
				"Flights are 180 € return if we book before Friday, and they've only moved once this month.",
			secondAnswer:
				"Alfama and Graça are both walking distance from everything, and Graça's the quiet one.",
			missionObjective: "Find a flat in Graça for four nights, under 600 €.",
		},
		work: {
			request:
				"<@ivy> <@sable> the settings screen ships Thursday. Split it between you.",
			firstAnswer:
				"It's on staging behind the flag, and the two fields you flagged save on blur now.",
			secondAnswer:
				"The empty state's drawn: a sentence and a button, not a blank panel.",
			missionObjective:
				"Take that empty state through the five screens that still don't have one.",
		},
	},
	exchanges: {
		mochi: {
			ask: "The rent went out twice this month.",
			answer:
				"It did, on the 3rd and the 9th. The second one's a standing order you set up in March. <@tomo> knows what it's cost you since.",
			handoff:
				"Six months at 840 €. I've drafted the message to the bank, it's three lines and it asks for the money back.",
		},
		olive: {
			ask: "We don't eat meat on weekdays.",
			answer:
				"Kept. Weekday dinners are meat-free from now on, and Thursday's redone.",
			note: "Olive kept a skill. You can read it, and undo it, in its History.",
		},
		pip: {
			cause: "Every morning at 8",
			report:
				"Four came in overnight. The landlord wants an answer on the boiler by Friday, the rest can wait for the weekend.",
			ask: "Draft the boiler one.",
			answer: "Drafted. Three lines, and it asks him for a date.",
		},
		tomo: {
			ask: "Find what I'm paying for and never use.",
			missionObjective: "List every subscription nothing's touched in 90 days.",
			answer:
				"Seven so far. Two of them renew this week, so I'll be back before Thursday.",
		},
		ash: {
			ask: "Anything worth reading tonight?",
			answer:
				"Two of the nine you saved. One's twenty minutes on the metro, the other one's for a Sunday.",
		},
		move: {
			answer: "The lease is signed. The deposit clears Tuesday.",
		},
		wren: {
			ask: "What's left before Thursday?",
			missionObjective: "Write the release note from what merged this week.",
			missionTicket: "APP-217",
			answer: "Two tickets and this note. You'll have it first thing tomorrow.",
		},
		ivy: {
			ask: "Settings saves twice on Safari.",
			answer:
				"It does, on blur and on submit. That's the form, not the screen, so <@sable>'s draft needs one save and not two. I've asked her.",
			handoff:
				"One save, on blur. The screen's redrawn and the second button's gone.",
		},
		sable: {
			ask: "Empty states always say what to do next, never just that it's empty.",
			answer: "Kept. I've redone the three empty states in the file to say it.",
			note: "Sable kept a skill. You can read it, and undo it, in its History.",
		},
		juno: {
			cause: "Every weekday at 9",
			report:
				"Nine came in overnight. Seven are the same export bug, so I've merged them into one. The other two are password resets.",
			ask: "Send the export one to Ivy.",
			answer: "Sent. <@ivy> has the seven, with the account ids.",
		},
		triage: {
			answer: "I've got the export seven. It's the retry, not the queue.",
		},
	},
}

export const TICKET_PLATFORM = "linear"

export const ROUTINE_TRIGGER_SOURCE = "schedule"
