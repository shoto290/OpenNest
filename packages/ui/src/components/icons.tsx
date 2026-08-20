import {
	ArrowDownIcon,
	ArrowUpIcon,
	BanIcon,
	BookmarkIcon,
	BookOpenTextIcon,
	BracesIcon,
	BrainIcon,
	CalendarIcon,
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	CircleCheckIcon,
	CircleIcon,
	CircleXIcon,
	CopyIcon,
	EllipsisIcon,
	ExternalLinkIcon,
	FileCodeIcon,
	FileTextIcon,
	FolderIcon,
	FolderOpenIcon,
	Globe2Icon,
	HouseIcon,
	ImageIcon,
	InfoIcon,
	LoaderCircleIcon,
	type LucideIcon,
	type LucideProps,
	MessageSquareIcon,
	MonitorIcon,
	MoonIcon,
	PanelLeftIcon,
	PencilIcon,
	PencilLineIcon,
	PlusIcon,
	RefreshCwIcon,
	RotateCwIcon,
	SearchIcon,
	SettingsIcon,
	ShieldIcon,
	SquareIcon,
	SquareTerminalIcon,
	SunIcon,
	TerminalIcon,
	ThumbsDownIcon,
	ThumbsUpIcon,
	Trash2Icon,
	TriangleAlertIcon,
	UserRoundIcon,
	WrenchIcon,
	XIcon,
} from "lucide-react"

type IconProps = LucideProps

type Icon = LucideIcon

const Claude = ({ size = 24, strokeWidth = 2, ...props }: IconProps) => (
	<svg
		aria-hidden="true"
		fill="none"
		height={size}
		stroke="currentColor"
		strokeLinecap="round"
		strokeLinejoin="round"
		strokeWidth={strokeWidth}
		viewBox="0 0 24 24"
		width={size}
		xmlns="http://www.w3.org/2000/svg"
		{...props}
	>
		<path d="M13 12L18.5 5M7.63965 3L12.5 12L13.6865 3M4.48381 6.71679L11.9872 12M3 12L11.9872 12.473M12.2244 13.177L7 20M4.84194 16.8682L11.2824 12.9758M11.5 21L12.665 13.177M21 14L13.1846 12.668M21 10.5788L13 12.3223M16.779 19.646L12.8876 13.3772M19.3566 18.207L13.313 12.9893" />
	</svg>
)

const Icons = {
	Add: PlusIcon,
	Alert: TriangleAlertIcon,
	ArrowDown: ArrowDownIcon,
	ArrowUp: ArrowUpIcon,
	Blocked: BanIcon,
	Bookmark: BookmarkIcon,
	Calendar: CalendarIcon,
	Check: CheckIcon,
	Claude,
	Close: XIcon,
	Command: SquareTerminalIcon,
	Copy: CopyIcon,
	DarkScheme: MoonIcon,
	Delete: Trash2Icon,
	Docs: BookOpenTextIcon,
	Edit: PencilIcon,
	Error: CircleXIcon,
	Expand: ChevronDownIcon,
	ExternalLink: ExternalLinkIcon,
	File: FileTextIcon,
	FileCode: FileCodeIcon,
	Folder: FolderIcon,
	FolderOpen: FolderOpenIcon,
	Home: HouseIcon,
	Image: ImageIcon,
	Info: InfoIcon,
	Json: BracesIcon,
	LightScheme: SunIcon,
	Loading: LoaderCircleIcon,
	Message: MessageSquareIcon,
	More: EllipsisIcon,
	Next: ChevronRightIcon,
	Pending: CircleIcon,
	Restart: RotateCwIcon,
	Retry: RefreshCwIcon,
	Search: SearchIcon,
	Send: ArrowUpIcon,
	Settings: SettingsIcon,
	Shield: ShieldIcon,
	Sidebar: PanelLeftIcon,
	Stop: SquareIcon,
	Success: CircleCheckIcon,
	SystemScheme: MonitorIcon,
	Terminal: TerminalIcon,
	Thinking: BrainIcon,
	ThumbsDown: ThumbsDownIcon,
	ThumbsUp: ThumbsUpIcon,
	Tool: WrenchIcon,
	User: UserRoundIcon,
	Web: Globe2Icon,
	Write: PencilLineIcon,
}

export { type Icon, type IconProps, Icons }
