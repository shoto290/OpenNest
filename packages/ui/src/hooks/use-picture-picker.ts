"use client"

import { type ComponentProps, useRef, useState } from "react"

/** The control the props go on, and the state it is drawn in: the drag lands as an
 * attribute the class picks up, so nothing that wires this hook holds it. */
type PictureControlProps = ComponentProps<"button"> & {
	"data-dragging"?: true
}

type PicturePickerOptions = {
	/** The accessible name of the file input behind the control — what picture this
	 * one takes, since a dialog may hold more than one. */
	label: string
	/** Receives the dropped, pasted or browsed file. The caller holds nothing: the
	 * host turns it into a URL and writes it back. */
	onPick: (file: File) => void
}

/**
 * The three ways a picture gets in — dropped, pasted, browsed — as props to spread
 * on the control that takes it and on the input behind it. Every surface that takes
 * an image wires these, so a dashed zone and a round avatar behave the same.
 *
 * The input lives outside the control it belongs to: a button may not hold an
 * input, and this one is only ever opened by that button.
 */
export const usePicturePicker = ({ label, onPick }: PicturePickerOptions) => {
	const fileRef = useRef<HTMLInputElement>(null)
	const [isDragging, setIsDragging] = useState(false)

	const emitFile = (file: File | undefined) => {
		if (file) onPick(file)
	}

	const controlProps: PictureControlProps = {
		"data-dragging": isDragging || undefined,
		onClick: () => fileRef.current?.click(),
		onDragLeave: () => setIsDragging(false),
		onDragOver: (event) => {
			event.preventDefault()
			setIsDragging(true)
		},
		onDrop: (event) => {
			event.preventDefault()
			setIsDragging(false)
			emitFile(event.dataTransfer.files[0])
		},
		onPaste: (event) => emitFile(event.clipboardData.files[0]),
		type: "button",
	}

	/** Hidden the accessible way rather than with `display: none`: a webview that
	 * hosts the app presents no file panel for an input it is not laying out, so the
	 * press on the control would do nothing. Out of the tab order, since the control
	 * in front of it is the stop.
	 *
	 * Clearing the input lets the same file be picked twice in a row. */
	const inputProps: ComponentProps<"input"> = {
		accept: "image/*",
		"aria-label": label,
		className: "sr-only",
		onChange: (event) => {
			emitFile(event.target.files?.[0])
			event.target.value = ""
		},
		ref: fileRef,
		tabIndex: -1,
		type: "file",
	}

	return { controlProps, inputProps }
}
