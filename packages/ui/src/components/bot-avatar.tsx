"use client"

import {
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useId,
	useMemo,
	useRef,
} from "react"

import {
	ANIMALS,
	type BotAvatarAnimal,
	type BotAvatarEar,
	type BotAvatarShape,
} from "@workspace/ui/components/bot-avatar-animals"
import type { BotAvatarState } from "@workspace/ui/components/bot-avatar-data"
import {
	type BotAvatarEarLayer,
	BotAvatarEngine,
	type BotAvatarOrientation,
	PARTS,
} from "@workspace/ui/components/bot-avatar-engine"
import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

type BotAvatarInk = "regular" | "bold" | "heavy"

const INK_WEIGHTS: Record<BotAvatarInk, number> = {
	regular: 5.5,
	bold: 7.5,
	heavy: 9.25,
}

const AUTHORED_WEIGHT = 5.5
const REFERENCE_SIZE = 240
const MIN_RENDERED_WEIGHT = 2.4
const BOIL_DISPLACEMENT = 10

type InkWeight = { ink: BotAvatarInk; size: number }

const inkWeight = ({ ink, size }: InkWeight) =>
	Math.max(INK_WEIGHTS[ink], (MIN_RENDERED_WEIGHT * REFERENCE_SIZE) / size)

const STROKE_BASE = {
	stroke: "var(--bot-avatar-ink, currentColor)",
	strokeLinecap: "round",
	strokeLinejoin: "round",
} as const

const ROLE_PROPS = {
	outline: { ...STROKE_BASE, fill: "var(--background)" },
	line: { ...STROKE_BASE, fill: "none" },
	accent: { fill: "var(--bot-avatar-accent, #e36f3d)", stroke: "none" },
} as const

const DRAG_DEGREES_PER_PIXEL = 0.6
const DRAG_LIMIT = 60

const shapeKey = (shape: BotAvatarShape) =>
	shape.kind === "path"
		? `${shape.role}-${shape.d.slice(0, 24)}`
		: `${shape.kind}-${shape.role}-${shape.cx}-${shape.cy}`

const clamp = (value: number, limit: number) =>
	Math.max(-limit, Math.min(limit, value))

const round = (value: number) => Math.round(value * 100) / 100

type EarLayerProps = {
	animal: BotAvatarAnimal
	ears: BotAvatarEar[]
	layer: BotAvatarEarLayer
	weight: number
	splitId: string
}

function EarLayer({ animal, ears, layer, weight, splitId }: EarLayerProps) {
	return (
		<g data-part={layer === "front" ? PARTS.earsFront : PARTS.earsBack}>
			{ears.map((ear, index) => (
				<g data-part={PARTS.ear(index, layer)} key={`${animal}-ear-${ear.pivot[0]}`}>
					<g
						clipPath={
							layer === "front" ? `url(#${splitId}-${index})` : undefined
						}
					>
						{ear.shapes.map((shape) => (
							<Shape key={shapeKey(shape)} shape={shape} weight={weight} />
						))}
					</g>
				</g>
			))}
		</g>
	)
}

type ShapeProps = { shape: BotAvatarShape; weight: number }

function Shape({ shape, weight }: ShapeProps) {
	const authored =
		"strokeWidth" in shape && shape.strokeWidth !== undefined
			? shape.strokeWidth
			: AUTHORED_WEIGHT
	const props = {
		...ROLE_PROPS[shape.role],
		strokeWidth: round((authored * weight) / AUTHORED_WEIGHT),
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

type AvatarPointerEvent = ReactPointerEvent<SVGSVGElement>

type BotAvatarProps = {
	animal?: BotAvatarAnimal
	state?: BotAvatarState
	size?: number
	animated?: boolean
	yaw?: number
	pitch?: number
	roll?: number
	perspective?: number
	ink?: BotAvatarInk
	interactive?: boolean
	wireframe?: boolean
	onOrientationChange?: (orientation: BotAvatarOrientation) => void
	className?: string
}

function BotAvatar({
	animal = "cat",
	state = "waiting",
	size = 240,
	animated = true,
	yaw,
	pitch,
	roll,
	perspective = 0.55,
	ink = "bold",
	interactive = false,
	wireframe = false,
	onOrientationChange,
	className,
}: BotAvatarProps) {
	const svgRef = useRef<SVGSVGElement>(null)
	const dragRef = useRef({ x: 0, y: 0, yaw: 0, pitch: 0, roll: 0 })
	const id = useId()
	const filterId = `bot-avatar-sketch-${id}`
	const clipId = `bot-avatar-clip-${id}`
	const splitId = `bot-avatar-split-${id}`
	const definition = ANIMALS[animal]
	const weight = inkWeight({ ink, size })
	const boil = round((BOIL_DISPLACEMENT * INK_WEIGHTS[ink]) / weight)
	const prefersReducedMotion = usePrefersReducedMotion()
	const isAnimated = animated && !prefersReducedMotion

	const engine = useMemo(() => new BotAvatarEngine(definition), [definition])

	useEffect(() => {
		if (!svgRef.current) return
		engine.bind(svgRef.current)
		if (isAnimated) {
			engine.start()
			return () => engine.stop()
		}
		engine.renderStatic()
	}, [engine, isAnimated])

	useEffect(() => {
		engine.setState(state)
		if (!isAnimated) engine.renderStatic()
	}, [engine, state, isAnimated])

	useEffect(() => {
		engine.setPerspective(perspective)
		engine.setWireframe(wireframe)
		engine.setOrientation({ yaw, pitch, roll })
		if (!isAnimated) engine.renderStatic()
	}, [engine, yaw, pitch, roll, perspective, wireframe, isAnimated])

	const startDrag = (event: AvatarPointerEvent) => {
		if (!interactive) return
		event.currentTarget.setPointerCapture(event.pointerId)
		dragRef.current = {
			x: event.clientX,
			y: event.clientY,
			yaw: yaw ?? 0,
			pitch: pitch ?? 0,
			roll: roll ?? 0,
		}
	}

	const moveDrag = (event: AvatarPointerEvent) => {
		if (!interactive || !event.currentTarget.hasPointerCapture(event.pointerId))
			return
		const origin = dragRef.current
		onOrientationChange?.({
			yaw: clamp(
				origin.yaw + (event.clientX - origin.x) * DRAG_DEGREES_PER_PIXEL,
				DRAG_LIMIT,
			),
			pitch: clamp(
				origin.pitch - (event.clientY - origin.y) * DRAG_DEGREES_PER_PIXEL,
				DRAG_LIMIT,
			),
			roll: origin.roll,
		})
	}

	const endDrag = (event: AvatarPointerEvent) => {
		if (!interactive) return
		event.currentTarget.releasePointerCapture(event.pointerId)
	}

	return (
		<svg
			ref={svgRef}
			viewBox="0 0 240 240"
			width={size}
			height={size}
			role="img"
			aria-label={`Bot avatar ${animal}, ${state}`}
			onPointerDown={startDrag}
			onPointerMove={moveDrag}
			onPointerUp={endDrag}
			className={cn(
				"text-foreground",
				interactive && "cursor-grab touch-none active:cursor-grabbing",
				className,
			)}
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
					<feDisplacementMap in="SourceGraphic" in2="n" scale={boil} />
				</filter>
				<clipPath id={clipId}>
					<path data-part={PARTS.headClip} d={definition.head} />
				</clipPath>
				{definition.ears.map((ear, index) => (
					<clipPath
						clipPathUnits="userSpaceOnUse"
						id={`${splitId}-${index}`}
						key={`${animal}-split-${ear.pivot[0]}`}
					>
						<path data-part={PARTS.earSplit(index)} d="" />
					</clipPath>
				))}
			</defs>
			<g filter={`url(#${filterId})`}>
				<g data-part={PARTS.rig}>
					<EarLayer
						animal={animal}
						ears={definition.ears}
						layer="back"
						splitId={splitId}
						weight={weight}
					/>
					<g data-part={PARTS.head}>
						<path
							d={definition.head}
							{...ROLE_PROPS.outline}
							strokeWidth={round(weight)}
						/>
						{definition.extras.map((shape) => (
							<Shape key={shapeKey(shape)} shape={shape} weight={weight} />
						))}
					</g>
					<EarLayer
						animal={animal}
						ears={definition.ears}
						layer="front"
						splitId={splitId}
						weight={weight}
					/>
					<g
						data-part={PARTS.blush}
						opacity={0}
						style={{ transition: "opacity 0.5s ease" }}
					>
						<ellipse rx={9} ry={4.5} {...ROLE_PROPS.accent} />
						<ellipse rx={9} ry={4.5} {...ROLE_PROPS.accent} />
					</g>
					<g clipPath={`url(#${clipId})`}>
						<path data-part={PARTS.eye0} fill="currentColor" />
						<path data-part={PARTS.eye1} fill="currentColor" />
					</g>
					<path
						data-part={PARTS.wire}
						fill="none"
						stroke="var(--bot-avatar-accent, #e36f3d)"
						strokeWidth={1}
						opacity={0.55}
						style={{ display: wireframe ? undefined : "none" }}
					/>
				</g>
			</g>
		</svg>
	)
}

export {
	BotAvatar,
	type BotAvatarInk,
	type BotAvatarOrientation,
	type BotAvatarProps,
}
