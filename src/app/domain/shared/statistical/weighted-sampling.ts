import { PRECISION_EPSILON, PRECISION_SCALE } from '../../../core/constants/precision.config';

export function sampleLevel(
  levels: string[],
  expectedProbabilities: (number | undefined)[],
  rng: () => number
): string {
  if (levels.length === 0) {
    throw new Error('Cannot sample a level from an empty levels array.');
  }

  let explicitSum = 0;
  let undefinedCount = 0;

  for (const p of expectedProbabilities) {
    if (p !== undefined && p > 0) {
      explicitSum += p;
    } else if (p === undefined) {
      undefinedCount++;
    }
  }

  const probs = new Array<number>(expectedProbabilities.length);

  if (explicitSum > 1.0 + PRECISION_EPSILON) {
    for (let i = 0; i < expectedProbabilities.length; i++) {
      const p = expectedProbabilities[i];
      probs[i] = p !== undefined && p > 0 ? Math.round((p / explicitSum) * PRECISION_SCALE) : 0;
    }
  } else if (Math.abs(explicitSum - 1.0) <= PRECISION_EPSILON) {
    for (let i = 0; i < expectedProbabilities.length; i++) {
      const p = expectedProbabilities[i];
      probs[i] = p !== undefined && p > 0 ? Math.round(p * PRECISION_SCALE) : 0;
    }
  } else if (explicitSum > PRECISION_EPSILON && explicitSum < 1.0 - PRECISION_EPSILON) {
    if (undefinedCount > 0) {
      const remainder = 1.0 - explicitSum;
      const share = remainder / undefinedCount;
      for (let i = 0; i < expectedProbabilities.length; i++) {
        const p = expectedProbabilities[i];
        probs[i] = p !== undefined && p > 0 ? Math.round(p * PRECISION_SCALE) : (p === undefined ? Math.round(share * PRECISION_SCALE) : 0);
      }
    } else {
      for (let i = 0; i < expectedProbabilities.length; i++) {
        const p = expectedProbabilities[i];
        probs[i] = p !== undefined && p > 0 ? Math.round((p / explicitSum) * PRECISION_SCALE) : 0;
      }
    }
  } else {
    const share = 1.0 / levels.length;
    for (let i = 0; i < levels.length; i++) {
      probs[i] = Math.round(share * PRECISION_SCALE);
    }
  }

  let totalScaled = 0;
  for (const p of probs) totalScaled += p;

  const r = Math.floor(rng() * totalScaled);
  let cumulative = 0;
  for (let i = 0; i < levels.length; i++) {
    cumulative += probs[i];
    if (r < cumulative) return levels[i];
  }
  return levels[levels.length - 1];
}

export function selectWeightedArm<T extends { ratio: number }>(candidates: T[], rng: () => number): T {
  const activeCandidates = candidates.filter(arm => arm.ratio > 0);
  const totalWeight = activeCandidates.reduce((sum, arm) => sum + arm.ratio, 0);
  if (totalWeight === 0) {
    throw new Error('Total weight of tied arms is 0. Cannot select an arm.');
  }

  let rVal = Math.floor(rng() * totalWeight);
  for (const arm of activeCandidates) {
    rVal -= arm.ratio;
    if (rVal < 0) {
      return arm;
    }
  }
  return activeCandidates[activeCandidates.length - 1];
}
