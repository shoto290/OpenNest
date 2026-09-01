const STIFFNESS = 0.05
const DAMPING = 0.7
const MASS = 1.25

const REST_DISTANCE = 0.5
const REST_VELOCITY = 0.2

export type ScrollSpringState = {
	position: number
	velocity: number
}

export const stepScrollSpring = (
	{ position, velocity }: ScrollSpringState,
	target: number,
): ScrollSpringState => {
	const pull = (target - position) * STIFFNESS
	const damper = -velocity * DAMPING
	const nextVelocity = velocity + (pull + damper) / MASS

	return { position: position + nextVelocity, velocity: nextVelocity }
}

export const isScrollSpringAtRest = (
	{ position, velocity }: ScrollSpringState,
	target: number,
) =>
	Math.abs(target - position) <= REST_DISTANCE &&
	Math.abs(velocity) <= REST_VELOCITY
