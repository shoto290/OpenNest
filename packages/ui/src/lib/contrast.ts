export type Rgb = [number, number, number]

const toLinear = (channel: number) =>
	channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4

const relativeLuminance = ([red, green, blue]: Rgb) =>
	0.2126 * toLinear(red / 255) +
	0.7152 * toLinear(green / 255) +
	0.0722 * toLinear(blue / 255)

export const contrastRatio = (a: Rgb, b: Rgb) => {
	const luminances = [relativeLuminance(a), relativeLuminance(b)]
	return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05)
}
