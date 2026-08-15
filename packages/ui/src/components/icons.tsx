import {
	Add01Icon,
	Alert02Icon,
	ArrowDown01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	ArrowUp02Icon,
	Calendar01Icon,
	Cancel01Icon,
	CheckmarkCircle02Icon,
	ClaudeIcon,
	Copy01Icon,
	Delete02Icon,
	Download01Icon,
	Home01Icon,
	InformationCircleIcon,
	Loading03Icon,
	MoreHorizontalIcon,
	PencilEdit01Icon,
	RefreshIcon,
	Search01Icon,
	Settings01Icon,
	Shield01Icon,
	StopIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
} from "@hugeicons/core-free-icons"
import {
	HugeiconsIcon,
	type HugeiconsIconProps,
	type IconSvgElement,
} from "@hugeicons/react"

type IconProps = Omit<HugeiconsIconProps, "icon">

const createIcon = (icon: IconSvgElement) => {
	const Icon = (props: IconProps) => <HugeiconsIcon icon={icon} {...props} />
	return Icon
}

const Icons = {
	Add: createIcon(Add01Icon),
	Alert: createIcon(Alert02Icon),
	ArrowDown: createIcon(ArrowDown01Icon),
	ArrowLeft: createIcon(ArrowLeft01Icon),
	ArrowRight: createIcon(ArrowRight01Icon),
	Calendar: createIcon(Calendar01Icon),
	Claude: createIcon(ClaudeIcon),
	Close: createIcon(Cancel01Icon),
	Copy: createIcon(Copy01Icon),
	Delete: createIcon(Delete02Icon),
	Download: createIcon(Download01Icon),
	Edit: createIcon(PencilEdit01Icon),
	Home: createIcon(Home01Icon),
	Info: createIcon(InformationCircleIcon),
	Loading: createIcon(Loading03Icon),
	More: createIcon(MoreHorizontalIcon),
	Retry: createIcon(RefreshIcon),
	Search: createIcon(Search01Icon),
	Send: createIcon(ArrowUp02Icon),
	Settings: createIcon(Settings01Icon),
	Shield: createIcon(Shield01Icon),
	Stop: createIcon(StopIcon),
	Success: createIcon(CheckmarkCircle02Icon),
	ThumbsDown: createIcon(ThumbsDownIcon),
	ThumbsUp: createIcon(ThumbsUpIcon),
}

export { type IconProps, Icons }
