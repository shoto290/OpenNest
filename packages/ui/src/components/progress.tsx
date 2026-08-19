import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "@workspace/ui/lib/utils"

/** The bare semantic root — `role="progressbar"` and its aria value, no track.
 * What a progress shaped as anything but a bar composes. */
const ProgressRoot = ProgressPrimitive.Root

const RING_BOX = 36
const RING_RADIUS = 16
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

interface ProgressRingProps
	extends Omit<ProgressPrimitive.Root.Props, "value"> {
	/** A ring has no indeterminate arc to draw, so it takes a number where the
	 * bar takes `number | null`. */
	value: number
}

/** The same progress closing as an arc instead of filling a bar — for the places
 * a bar cannot go, around a button or inside a badge. Size it from `className`
 * and the arc scales with it; anything passed as children sits in the middle. */
const ProgressRing = ({
	children,
	className,
	value,
	...props
}: ProgressRingProps) => (
	<ProgressRoot
		data-slot="progress-ring"
		value={value}
		className={cn(
			"relative inline-flex items-center justify-center",
			className,
		)}
		{...props}
	>
		<svg
			aria-hidden="true"
			className="-rotate-90 absolute inset-0 size-full"
			viewBox={`0 0 ${RING_BOX} ${RING_BOX}`}
		>
			<circle
				className="fill-none stroke-border"
				cx={RING_BOX / 2}
				cy={RING_BOX / 2}
				r={RING_RADIUS}
				strokeWidth="2"
			/>
			<circle
				className="fill-none stroke-primary transition-[stroke-dashoffset] duration-300 ease-out motion-reduce:transition-none"
				cx={RING_BOX / 2}
				cy={RING_BOX / 2}
				r={RING_RADIUS}
				strokeDasharray={RING_CIRCUMFERENCE}
				strokeDashoffset={RING_CIRCUMFERENCE * (1 - value / 100)}
				strokeLinecap="round"
				strokeWidth="2"
			/>
		</svg>
		{children}
	</ProgressRoot>
)

function Progress({
	className,
	children,
	value,
	...props
}: ProgressPrimitive.Root.Props) {
	return (
		<ProgressPrimitive.Root
			value={value}
			data-slot="progress"
			className={cn("flex flex-wrap gap-3", className)}
			{...props}
		>
			{children}
			<ProgressTrack>
				<ProgressIndicator />
			</ProgressTrack>
		</ProgressPrimitive.Root>
	)
}

function ProgressTrack({ className, ...props }: ProgressPrimitive.Track.Props) {
	return (
		<ProgressPrimitive.Track
			className={cn(
				"relative flex h-2 w-full items-center overflow-x-hidden rounded-2xl bg-muted",
				className,
			)}
			data-slot="progress-track"
			{...props}
		/>
	)
}

function ProgressIndicator({
	className,
	...props
}: ProgressPrimitive.Indicator.Props) {
	return (
		<ProgressPrimitive.Indicator
			data-slot="progress-indicator"
			className={cn("h-full bg-primary transition-all", className)}
			{...props}
		/>
	)
}

function ProgressLabel({ className, ...props }: ProgressPrimitive.Label.Props) {
	return (
		<ProgressPrimitive.Label
			className={cn("text-sm font-medium", className)}
			data-slot="progress-label"
			{...props}
		/>
	)
}

function ProgressValue({ className, ...props }: ProgressPrimitive.Value.Props) {
	return (
		<ProgressPrimitive.Value
			className={cn(
				"ml-auto text-sm text-muted-foreground tabular-nums",
				className,
			)}
			data-slot="progress-value"
			{...props}
		/>
	)
}

export {
	Progress,
	ProgressIndicator,
	ProgressLabel,
	ProgressRing,
	type ProgressRingProps,
	ProgressRoot,
	ProgressTrack,
	ProgressValue,
}
