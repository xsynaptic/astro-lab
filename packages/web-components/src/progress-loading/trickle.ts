const trickleCeiling = 0.95;
const trickleRate = 0.04;

export function getNextTrickle(progress: number, random: number) {
	if (progress >= trickleCeiling) return progress;

	return progress + (trickleCeiling - progress) * random * trickleRate;
}
