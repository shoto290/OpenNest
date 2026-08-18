import { type ComponentPropsWithoutRef, useState } from "react"
import type { ExtraProps } from "react-markdown"

import { getFaviconUrl } from "@workspace/ui/lib/favicon"

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

const bareHost = (host: string) => host.replace(/^www\./, "")

/** The text gives way, the destination never does. The anchor itself stays
 * inline so a link flows and breaks with the sentence around it, and so a
 * transcript copied out of a bubble reads as one line of prose. */
const TEXT_CLASS = "inline-block max-w-full truncate align-bottom"
const HOST_CLASS = "whitespace-nowrap font-normal"

/** The mark: the host initial, covered by the favicon once it arrives. Offline,
 * on a host without one, or with the service unreachable, the letter is what
 * stays — the box never collapses and the line never shifts. Decoration only,
 * and artwork the destination controls at that: the host spelled out beside it
 * carries the meaning, so the mark stays out of the accessible name and out of
 * anything copied from the transcript. */
const MARK_CLASS =
	"relative mr-1 inline-grid size-3.5 select-none place-items-center rounded-[3px] bg-current/10 align-middle text-[0.65em] uppercase leading-none"
const FAVICON_CLASS = "absolute inset-0 size-full rounded-[3px] object-contain"

interface HostMarkProps {
	destination: URL
}

/** A broken image paints a broken image, so the icon leaves the tree the moment
 * it fails and gives the letter back its place. */
const HostMark = ({ destination }: HostMarkProps) => {
	const [hasIcon, setHasIcon] = useState(true)
	const icon = getFaviconUrl(destination.href)

	return (
		<span aria-hidden="true" className={MARK_CLASS}>
			{bareHost(destination.host).charAt(0)}
			{icon && hasIcon ? (
				<img
					alt=""
					className={FAVICON_CLASS}
					decoding="async"
					loading="lazy"
					onError={() => setHasIcon(false)}
					referrerPolicy="no-referrer"
					src={icon}
				/>
			) : null}
		</span>
	)
}

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
			<HostMark key={destination.host} destination={destination} />
			<span data-slot="markdown-link-host" className={HOST_CLASS}>
				({destination.host})
			</span>
		</a>
	)
}
