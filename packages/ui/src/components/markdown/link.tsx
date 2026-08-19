import type { ComponentPropsWithoutRef } from "react"
import type { ExtraProps } from "react-markdown"

import { hostInitial } from "@workspace/ui/lib/host"

export type MarkdownLinkProps = ComponentPropsWithoutRef<"a"> & ExtraProps

const EXTERNAL_SCHEMES = new Set(["http:", "https:"])
const IN_PLACE_SCHEMES = new Set(["mailto:", "tel:"])

/** A protocol-relative href resolves against the app itself, so it is read as
 * the web address it really is instead of as a route of this window. The parser
 * also answers the questions reading cannot: it drops userinfo before the host
 * and returns an internationalized host in its punycode form. */
const linkUrl = (href: string) => {
	try {
		return new URL(href.startsWith("//") ? `https:${href}` : href)
	} catch {
		return null
	}
}

/** The text gives way, the destination never does. The anchor itself stays
 * inline so a link flows and breaks with the sentence around it, and so a
 * transcript copied out of a bubble reads as one line of prose. */
const TEXT_CLASS = "inline-block max-w-full truncate align-bottom"
const HOST_CLASS = "whitespace-nowrap font-normal"

/** The mark: the host initial, drawn from the href and from nothing fetched.
 * Rendering a transcript sends no request derived from a link, so no site — nor
 * a service answering for every site — learns which hosts a private message
 * names. Tinted from the text, it holds its box in both themes and on any
 * bubble. Decoration only: the host spelled out beside it carries the meaning,
 * so the mark stays out of the accessible name and out of anything copied from
 * the transcript. */
const MARK_CLASS =
	"mr-1 inline-grid size-3.5 select-none place-items-center rounded-[3px] bg-current/10 align-middle text-[0.65em] uppercase leading-none"

/** Link text is authored — by a reader or by an agent — and no amount of reading
 * it says where it goes: userinfo, a homograph, a missing scheme all read as one
 * host and resolve to another. So the text is never questioned and the host is
 * always shown, taken from the href and from nothing else. Only http(s), mailto,
 * tel and a same-document fragment stay clickable; any other scheme, and any
 * path that would resolve against this window, renders as plain text. */
export const MarkdownLink = ({
	node,
	children,
	className,
	href,
	title,
	...props
}: MarkdownLinkProps) => {
	const url = href ? linkUrl(href) : null
	const destination = url && EXTERNAL_SCHEMES.has(url.protocol) ? url : null
	const isAnchored =
		href?.startsWith("#") ||
		destination !== null ||
		(url !== null && IN_PLACE_SCHEMES.has(url.protocol))

	if (!isAnchored) return <>{children}</>

	if (destination === null) {
		return (
			<a {...props} href={href} title={title} className={className}>
				{children}
			</a>
		)
	}

	return (
		<a
			{...props}
			href={href}
			title={title ?? href}
			className={className}
			target="_blank"
			rel="noreferrer noopener"
		>
			<span className={TEXT_CLASS}>{children}</span>{" "}
			<span
				aria-hidden="true"
				data-slot="markdown-link-mark"
				className={MARK_CLASS}
			>
				{hostInitial(destination.href)}
			</span>
			<span data-slot="markdown-link-host" className={HOST_CLASS}>
				({destination.host})
			</span>
		</a>
	)
}
