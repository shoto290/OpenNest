"use client"

import {
	AnimatePresence,
	motion,
	useReducedMotion,
	type Variants,
} from "motion/react"
import {
	forwardRef,
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { EASE_OUT, SPRING_SWAP } from "@workspace/ui/lib/ease"

import { Button, type ButtonProps } from "./base"

export type ButtonState = "idle" | "loading" | "success" | "error"

export interface StatefulButtonProps extends Omit<ButtonProps, "children"> {
	state?: ButtonState
	children: ReactNode
	loadingText?: ReactNode
	successText?: ReactNode
	errorText?: ReactNode
	icon?: ReactNode
}

const CASCADE_STAGGER = 0.025

const ROLL_IN = "105%"
const ROLL_OUT = "-105%"

const CASCADE_LETTER_VARIANTS: Variants = {
	initial: { y: ROLL_IN },
	animate: (delay: number = 0) => ({
		y: "0%",
		transition: { ...SPRING_SWAP, delay },
	}),
	exit: (delay: number = 0) => ({
		y: ROLL_OUT,
		transition: { duration: 0.16, ease: EASE_OUT, delay: delay * 0.5 },
	}),
}

const ICON_VARIANTS: Variants = {
	initial: { width: 0, scale: 0.7 },
	animate: {
		width: "1.5rem",
		scale: 1,
		transition: SPRING_SWAP,
	},
	exit: {
		width: 0,
		scale: 0.7,
		transition: { duration: 0.16, ease: EASE_OUT },
	},
}

function IconSlot({ keyId, children }: { keyId: string; children: ReactNode }) {
	const reduce = useReducedMotion()
	return (
		<motion.span
			key={keyId}
			variants={ICON_VARIANTS}
			initial={reduce ? false : "initial"}
			animate="animate"
			exit="exit"
			className="inline-grid shrink-0 place-items-center overflow-hidden"
		>
			{children}
		</motion.span>
	)
}

function TextSlot({ value, children }: { value: string; children: ReactNode }) {
	const reduce = useReducedMotion()
	const measureRef = useRef<HTMLSpanElement>(null)
	const [width, setWidth] = useState<number>()
	const label = typeof children === "string" ? children : null
	const cascade = label !== null && !reduce

	useLayoutEffect(() => {
		const nextWidth = measureRef.current?.offsetWidth
		if (!nextWidth) return
		setWidth((current) => (current === nextWidth ? current : nextWidth))
	})

	return (
		<motion.span
			initial={false}
			animate={{ width }}
			transition={reduce ? { duration: 0 } : SPRING_SWAP}
			className="relative inline-block overflow-hidden whitespace-nowrap align-bottom"
		>
			<span
				ref={measureRef}
				aria-hidden
				className="invisible inline-block whitespace-nowrap"
			>
				{cascade
					? label.split("").map((char, index) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: position is the slot identity.
								key={index}
								className="inline-block whitespace-pre"
							>
								{char}
							</span>
						))
					: children}
			</span>

			{cascade ? (
				<>
					<span className="sr-only">{label}</span>
					<AnimatePresence initial={false}>
						<motion.span
							key={`cascade-${value}`}
							aria-hidden
							initial="initial"
							animate="animate"
							exit="exit"
							className="absolute left-0 top-0 inline-block whitespace-pre"
						>
							{label.split("").map((char, index) => (
								<motion.span
									// biome-ignore lint/suspicious/noArrayIndexKey: position is the slot identity.
									key={index}
									custom={index * CASCADE_STAGGER}
									variants={CASCADE_LETTER_VARIANTS}
									className="inline-block whitespace-pre"
								>
									{char}
								</motion.span>
							))}
						</motion.span>
					</AnimatePresence>
				</>
			) : (
				<AnimatePresence initial={false}>
					<motion.span
						key={`text-${value}`}
						initial={reduce ? false : { y: ROLL_IN }}
						animate={{ y: "0%" }}
						exit={{ y: ROLL_OUT }}
						transition={reduce ? { duration: 0 } : SPRING_SWAP}
						className="absolute left-0 top-0 inline-block"
					>
						{children}
					</motion.span>
				</AnimatePresence>
			)}
		</motion.span>
	)
}

export const StatefulButton = forwardRef<
	HTMLButtonElement,
	StatefulButtonProps
>(function StatefulButton(
	{
		state = "idle",
		children,
		loadingText,
		successText,
		errorText,
		icon,
		disabled,
		...rest
	},
	ref,
) {
	const { t } = useTranslation("common")
	const isBusy = state === "loading"
	const override = {
		loading: loadingText,
		success: successText,
		error: errorText,
	}
	const stateText =
		state === "idle"
			? children
			: (override[state] ?? t(`statefulButton.${state}`))
	const textKey =
		typeof stateText === "string" ? `${state}-${stateText}` : state

	return (
		<Button
			ref={ref}
			disabled={disabled || isBusy}
			aria-busy={isBusy}
			whileHover={undefined}
			{...rest}
		>
			<span
				aria-live="polite"
				className="relative inline-flex items-center justify-center overflow-hidden"
			>
				<AnimatePresence initial={false}>
					{state === "loading" ? (
						<IconSlot keyId="loading-icon">
							<Icons.Loading className="h-4 w-4 animate-spin" />
						</IconSlot>
					) : null}
					{state === "success" ? (
						<IconSlot keyId="success-icon">
							<Icons.Check className="h-4 w-4" />
						</IconSlot>
					) : null}
					{state === "error" ? (
						<IconSlot keyId="error-icon">
							<Icons.Close className="h-4 w-4" />
						</IconSlot>
					) : null}
				</AnimatePresence>

				<TextSlot value={textKey}>{stateText}</TextSlot>

				<AnimatePresence initial={false}>
					{state === "idle" && icon ? (
						<IconSlot keyId="idle-icon">{icon}</IconSlot>
					) : null}
				</AnimatePresence>
			</span>
		</Button>
	)
})
