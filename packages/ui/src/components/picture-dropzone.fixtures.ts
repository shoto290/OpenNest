/** A picture a reader picked, dropped or pasted. Fictional and fixed: the stories
 * only ever hand it to a spy, so what matters is that it is the same file object
 * on every run. */
export const PICKED_PICTURE_FILE = new File(["<svg />"], "portrait.svg", {
	type: "image/svg+xml",
})
