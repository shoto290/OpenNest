"use client"

import { useEffect, useId, useMemo, useRef } from "react"

import {
	ANIMALS,
	type BotAvatarAnimal,
	type BotAvatarShape,
} from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarState } from "@workspace/ui/components/bot-avatar-data"
import {
	BotAvatarEngine,
	PARTS,
} from "@workspace/ui/components/bot-avatar-engine"
import { cn } from "@workspace/ui/lib/utils"

const STROKE_BASE = {
	stroke: "currentColor",
	strokeWidth: 5.5,
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const

const ROLE_PROPS = {
	outline: { ...STROKE_BASE, fill: "var(--background)" },
	line: { ...STROKE_BASE, fill: "none" },
	accent: { fill: "var(--bot-avatar-accent, #e36f3d)", stroke: "none" },
} as const

const shapeKey = (shape: BotAvatarShape) =>
	shape.kind === "path"
		? `${shape.role}-${shape.d.slice(0, 24)}`
		: `${shape.kind}-${shape.role}-${shape.cx}-${shape.cy}`

function Shape({ shape }: { shape: BotAvatarShape }) {
	const props = {
		...ROLE_PROPS[shape.role],
		...("strokeWidth" in shape && shape.strokeWidth !== undefined
			? { strokeWidth: shape.strokeWidth }
			: {}),
	}
	if (shape.kind === "circle") {
		return <circle cx={shape.cx} cy={shape.cy} r={shape.r} {...props} />
	}
	if (shape.kind === "ellipse") {
		return (
			<ellipse
				cx={shape.cx}
				cy={shape.cy}
				rx={shape.rx}
				ry={shape.ry}
				{...props}
			/>
		)
	}
	return <path d={shape.d} {...props} />
}

type BotAvatarProps = {
	animal?: BotAvatarAnimal
	state?: BotAvatarState
	size?: number
	animated?: boolean
	className?: string
}

function BotAvatar({
	animal = "cat",
	state = "waiting",
	size = 240,
	animated = true,
	className,
}: BotAvatarProps) {
	const svgRef = useRef<SVGSVGElement>(null)
	const id = useId()
	const filterId = `bot-avatar-sketch-${id}`
	const clipId = `bot-avatar-clip-${id}`
	const definition = ANIMALS[animal]

	const engine = useMemo(() => new BotAvatarEngine(definition), [definition])

	useEffect(() => {
		if (!svgRef.current) return
		engine.bind(svgRef.current)
		if (animated) {
			engine.start()
			return () => engine.stop()
		}
	}, [engine, animated])

	useEffect(() => {
		engine.setState(state)
		if (!animated) engine.renderStatic()
	}, [engine, state, animated])

	return (
		<svg
			ref={svgRef}
			viewBox="0 0 240 240"
			width={size}
			height={size}
			role="img"
			aria-label={`Bot avatar ${animal}, ${state}`}
			className={cn("text-foreground", className)}
		>
			<defs>
				<filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
					<feTurbulence
						data-part={PARTS.noise}
						type="fractalNoise"
						baseFrequency="0.024"
						numOctaves="3"
						seed="3"
						result="n"
					/>
					<feDisplacementMap in="SourceGraphic" in2="n" scale="10" />
				</filter>
				<clipPath id={clipId}>
					<path d={definition.head} />
				</clipPath>
			</defs>
			<g filter={`url(#${filterId})`}>
				<g data-part={PARTS.rig}>
					{definition.ears.map((ear, i) => (
						<g data-part={PARTS.ear(i)} key={`${animal}-ear-${ear.pivot[0]}`}>
							{ear.shapes.map((shape) => (
								<Shape key={shapeKey(shape)} shape={shape} />
							))}
						</g>
					))}
					<path d={definition.head} {...ROLE_PROPS.outline} />
					{definition.extras.map((shape) => (
						<Shape key={shapeKey(shape)} shape={shape} />
					))}
					<g
						data-part={PARTS.blush}
						opacity={0}
						style={{ transition: "opacity 0.5s ease" }}
					>
						<ellipse rx={9} ry={4.5} {...ROLE_PROPS.accent} />
						<ellipse rx={9} ry={4.5} {...ROLE_PROPS.accent} />
					</g>
					<g clipPath={`url(#${clipId})`}>
						<g data-part={PARTS.faceMap}>
							<path data-part={PARTS.eye0} fill="currentColor" />
							<path data-part={PARTS.eye1} fill="currentColor" />
						</g>
					</g>
				</g>
			</g>
		</svg>
	)
}

export { BotAvatar, type BotAvatarProps }
