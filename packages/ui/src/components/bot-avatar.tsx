"use client"

import {
	type CSSProperties,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useId,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react"

import { clamp, round2 } from "@workspace/ui/components/bot-avatar-3d"
import {
	ANIMALS,
	type BotAvatarAnimal,
	type BotAvatarEar,
	type BotAvatarShape,
} from "@workspace/ui/components/bot-avatar-animals"
import {
	BLOT_BOX,
	BLOT_PATH,
	blotTransform,
} from "@workspace/ui/components/bot-avatar-blot"
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
const MIN_RENDERED_WEIGHT = 1.25
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
	outline: { ...STROKE_BASE, fill: "none" },
	line: { ...STROKE_BASE, fill: "none" },
	accent: { fill: "var(--bot-avatar-accent, #e36f3d)", stroke: "none" },
} as const

const HEAD_MASK_BOUNDS = { x: -240, y: -240, width: 720, height: 720 } as const

const BLOT_TINTS = [
	"red",
	"yellow",
	"green",
	"cyan",
	"blue",
	"purple",
	"pink",
	"orange",
] as const

type BotAvatarBlot = (typeof BLOT_TINTS)[number]

const VIEW_BOX = 240
const BLOT_RATIO = 16 / 15
const BLOT_SPAN = VIEW_BOX * BLOT_RATIO
const BLOT_INSET = round2((VIEW_BOX - BLOT_SPAN) / 2)
const BLOT_PLACEMENT = `translate(${BLOT_INSET} ${BLOT_INSET}) scale(${round2(BLOT_SPAN / BLOT_BOX)})`

const BLOT_INK_STYLE = {
	color: "var(--bot-blot-ink)",
	"--bot-avatar-ink": "var(--bot-blot-ink)",
} as CSSProperties

const DRAG_DEGREES_PER_PIXEL = 0.6
const DRAG_LIMIT = 60

const shapeKey = (shape: BotAvatarShape) =>
	shape.kind === "path"
		? `${shape.role}-${shape.d.slice(0, 24)}`
		: `${shape.kind}-${shape.role}-${shape.cx}-${shape.cy}`

type EarLayerProps = {
	animal: BotAvatarAnimal
	ears: BotAvatarEar[]
	layer: BotAvatarEarLayer
	weight: number
	splitId: string
}

const EarLayer = ({ animal, ears, layer, weight, splitId }: EarLayerProps) => {
	return (
		<g>
			{ears.map((ear, index) => (
				<g
					data-part={PARTS.ear(index, layer)}
					key={`${animal}-ear-${ear.pivot[0]}`}
				>
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
		strokeWidth: round2((authored * weight) / AUTHORED_WEIGHT),
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
	blot?: BotAvatarBlot
	seed?: string
	interactive?: boolean
	wireframe?: boolean
	onOrientationChange?: (orientation: BotAvatarOrientation) => void
	className?: string
}

function BotAvatar({
	animal = "rabbit",
	state = "waiting",
	size = 240,
	animated = true,
	yaw,
	pitch,
	roll,
	perspective = 0.55,
	ink = "bold",
	blot,
	seed,
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
	const headPathId = `bot-avatar-head-${id}`
	const headMaskId = `bot-avatar-head-mask-${id}`
	const definition = ANIMALS[animal]
	const weight = inkWeight({ ink, size })
	const boil = round2((BOIL_DISPLACEMENT * INK_WEIGHTS[ink]) / weight)
	const prefersReducedMotion = usePrefersReducedMotion()
	const isAnimated = animated && !prefersReducedMotion

	const engine = useMemo(() => new BotAvatarEngine(definition), [definition])

	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-time setup — the effects below own every later change
	useLayoutEffect(() => {
		if (!svgRef.current) return
		engine.bind(svgRef.current)
		engine.setState(state)
		engine.setPerspective(perspective)
		engine.setWireframe(wireframe)
		engine.setOrientation({ yaw, pitch, roll })
		if (!isAnimated) {
			engine.renderStatic()
			return
		}
		engine.start()
		return () => engine.stop()
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
				-DRAG_LIMIT,
				DRAG_LIMIT,
			),
			pitch: clamp(
				origin.pitch - (event.clientY - origin.y) * DRAG_DEGREES_PER_PIXEL,
				-DRAG_LIMIT,
				DRAG_LIMIT,
			),
			roll: origin.roll,
		})
	}

	const endDrag = (event: AvatarPointerEvent) => {
		if (!interactive) return
		event.currentTarget.releasePointerCapture(event.pointerId)
	}

	const body = useMemo(
		() => (
			<>
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
					<path
						data-part={PARTS.headClip}
						d={definition.head}
						id={headPathId}
					/>
					<clipPath id={clipId}>
						<use href={`#${headPathId}`} />
					</clipPath>
					<mask
						id={headMaskId}
						maskUnits="userSpaceOnUse"
						{...HEAD_MASK_BOUNDS}
					>
						<rect fill="white" {...HEAD_MASK_BOUNDS} />
						<use fill="black" href={`#${headPathId}`} />
					</mask>
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
				{blot ? (
					<path
						d={BLOT_PATH}
						data-slot="bot-avatar-blot"
						fill={`var(--bot-blot-${blot})`}
						stroke="none"
						transform={`${BLOT_PLACEMENT} ${blotTransform(seed)}`}
					/>
				) : null}
				<g filter={`url(#${filterId})`}>
					<g data-part={PARTS.rig}>
						<g mask={`url(#${headMaskId})`}>
							<EarLayer
								animal={animal}
								ears={definition.ears}
								layer="back"
								splitId={splitId}
								weight={weight}
							/>
						</g>
						<g data-part={PARTS.head}>
							<path
								d={definition.head}
								{...ROLE_PROPS.outline}
								strokeWidth={round2(weight)}
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
						<g data-part={PARTS.blush} opacity={0}>
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
			</>
		),
		[
			animal,
			blot,
			boil,
			clipId,
			definition,
			filterId,
			headMaskId,
			headPathId,
			seed,
			splitId,
			weight,
			wireframe,
		],
	)

	return (
		<svg
			ref={svgRef}
			viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`}
			width={size}
			height={size}
			role="img"
			aria-label={`Bot avatar ${animal}, ${state}`}
			onPointerDown={startDrag}
			onPointerMove={moveDrag}
			onPointerUp={endDrag}
			style={blot ? BLOT_INK_STYLE : undefined}
			className={cn(
				"text-foreground",
				interactive && "cursor-grab touch-none active:cursor-grabbing",
				className,
			)}
		>
			{body}
		</svg>
	)
}

export {
	BLOT_TINTS,
	BotAvatar,
	type BotAvatarBlot,
	type BotAvatarInk,
	type BotAvatarOrientation,
	type BotAvatarProps,
}
