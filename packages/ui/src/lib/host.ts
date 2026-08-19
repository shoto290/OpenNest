/** RFC 3492. A host arrives from `URL` in its punycode form, and the first
 * character of that form is `x` for every internationalized host on earth — one
 * mark for пример.рф, münchen.de and 中国.cn alike. Decoding is local
 * arithmetic, so the letter a reader recognizes costs no request. */
const BASE = 36
const T_MIN = 1
const T_MAX = 26
const SKEW = 38
const DAMP = 700
const INITIAL_BIAS = 72
const INITIAL_CODE_POINT = 128

const digitOf = (code: number) => {
	if (code >= 0x30 && code <= 0x39) return code - 0x30 + 26
	if (code >= 0x61 && code <= 0x7a) return code - 0x61
	if (code >= 0x41 && code <= 0x5a) return code - 0x41

	return BASE
}

const adaptBias = (delta: number, count: number, isFirst: boolean) => {
	let scaled = Math.floor(isFirst ? delta / DAMP : delta / 2)
	scaled += Math.floor(scaled / count)
	let shift = 0

	while (scaled > Math.floor(((BASE - T_MIN) * T_MAX) / 2)) {
		scaled = Math.floor(scaled / (BASE - T_MIN))
		shift += BASE
	}

	return shift + Math.floor(((BASE - T_MIN + 1) * scaled) / (scaled + SKEW))
}

/** The decoder inserts each code point at a computed position, so the first
 * character is only known once the whole label is decoded. Anything malformed
 * gives the label back as it came. */
const decodeLabel = (label: string) => {
	const boundary = label.lastIndexOf("-")
	const decoded = [...(boundary > 0 ? label.slice(0, boundary) : "")]
	let codePoint = INITIAL_CODE_POINT
	let bias = INITIAL_BIAS
	let position = 0
	let cursor = boundary > 0 ? boundary + 1 : 0

	while (cursor < label.length) {
		const previous = position
		let weight = 1

		for (let k = BASE; ; k += BASE) {
			const digit = digitOf(label.charCodeAt(cursor))
			cursor += 1
			if (digit >= BASE) return null

			position += digit * weight
			const threshold = k <= bias ? T_MIN : Math.min(k - bias, T_MAX)
			if (digit < threshold) break

			weight *= BASE - threshold
		}

		const size = decoded.length + 1
		bias = adaptBias(position - previous, size, previous === 0)
		codePoint += Math.floor(position / size)
		position %= size
		decoded.splice(position, 0, String.fromCodePoint(codePoint))
		position += 1
	}

	return decoded.join("")
}

const PUNYCODE_PREFIX = "xn--"

const readableLabel = (label: string) =>
	label.startsWith(PUNYCODE_PREFIX)
		? (decodeLabel(label.slice(PUNYCODE_PREFIX.length)) ?? label)
		: label

/** An address is not a name: `192.168.1.1` and `[2001:db8::1]` would mark
 * themselves with a digit or a bracket, which reads as a glyph the site chose
 * rather than as the place it is. They get the neutral dot instead. */
const NEUTRAL_MARK = "•"

const IS_LETTER = /\p{L}/u

/** A destination is named, never fetched. Asking anyone for its icon — the host
 * itself, or one service standing in for every host — would tell that party
 * which sites appear in a private transcript, from which address, at what time.
 * The initial is read off the href instead, so the mark costs no request. */
export const hostInitial = (value: string) => {
	try {
		const [label] = new URL(value).host.replace(/^www\./, "").split(".")
		const initial = readableLabel(label).charAt(0)

		return IS_LETTER.test(initial) ? initial : NEUTRAL_MARK
	} catch {
		return null
	}
}
