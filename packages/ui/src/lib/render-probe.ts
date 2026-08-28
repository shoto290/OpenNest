export type RenderProbe = (name: string, key?: string) => void

let probe: RenderProbe | null = null

export const setRenderProbe = (next: RenderProbe | null) => {
	probe = next
}

export const probeRender: RenderProbe = (name, key) => {
	probe?.(name, key)
}
