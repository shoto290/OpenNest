"use client"

import { type ComponentProps, useRef, useState } from "react"

type PictureControlProps = ComponentProps<"button"> & {
	"data-dragging"?: true
}

type PicturePickerOptions = {
	label: string
	onPick: (file: File) => void
}

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
