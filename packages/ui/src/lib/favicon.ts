/** One service answers for every host, and the host is never asked itself: a
 * link or a citation in a transcript must not tell the site it points at that
 * the message was read, from which address, at what time. The service also
 * answers for sites that serve no `/favicon.ico`, so an icon nearly always
 * arrives. */
const FAVICON_SERVICE = "https://www.google.com/s2/favicons?sz=64&domain="

export const getFaviconUrl = (value: string) => {
	try {
		return `${FAVICON_SERVICE}${new URL(value).host}`
	} catch {
		return null
	}
}
