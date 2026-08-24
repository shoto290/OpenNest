"use client"

import { forwardRef } from "react"

import { Button, type ButtonProps } from "./base"

import { Magnetic } from "../magnetic"

export interface MagneticButtonProps extends ButtonProps {
	strength?: number
	magneticClassName?: string
}

export const MagneticButton = forwardRef<
	HTMLButtonElement,
	MagneticButtonProps
>(function MagneticButton(
	{ strength = 0.25, magneticClassName, children, ...rest },
	ref,
) {
	return (
		<Magnetic strength={strength} className={magneticClassName}>
			<Button ref={ref} {...rest}>
				{children}
			</Button>
		</Magnetic>
	)
})
