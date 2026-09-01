const STIFFNESS = 0.05
const DAMPING = 0.7
const MASS = 1.25

const REST_DISTANCE = 0.5
const REST_VELOCITY = 0.2

export const SPRING_STEP_MS = 1000 / 60

export const SPRING_MAX_ADVANCE_MS = 64

const STEP_TOLERANCE_MS = 1e-6

export type ScrollSpringState = {
	position: number
	velocity: number
	pending: number
}

export const SCROLL_SPRING_AT_REST: ScrollSpringState = {
	position: 0,
	velocity: 0,
	pending: 0,
}

export const stepScrollSpring = (
	{ position, velocity, pending }: ScrollSpringState,
	target: number,
	elapsed: number,
): ScrollSpringState => {
	let carried = Math.min(pending + Math.max(0, elapsed), SPRING_MAX_ADVANCE_MS)
	let advanced = position
	let speed = velocity

	while (carried >= SPRING_STEP_MS - STEP_TOLERANCE_MS) {
		const pull = (target - advanced) * STIFFNESS
		const damper = -speed * DAMPING
		speed += (pull + damper) / MASS
		advanced += speed
		carried = Math.max(0, carried - SPRING_STEP_MS)
	}

	return { position: advanced, velocity: speed, pending: carried }
}

export const isScrollSpringAtRest = (
	{ position, velocity }: ScrollSpringState,
	target: number,
) =>
	Math.abs(target - position) <= REST_DISTANCE &&
	Math.abs(velocity) <= REST_VELOCITY
