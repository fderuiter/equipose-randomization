import { MathUtil } from '../../core/utils/math.util';

export function getTotalRatio<T extends { ratio: number }>(arms: T[]): number {
  let sum = 0;
  for (const arm of arms) sum += arm.ratio;
  return sum;
}

export function simplifyRatios<T extends { ratio: number }>(arms: T[]): T[] {
  const activeRatios = arms.map(a => a.ratio).filter(r => r > 0);
  if (activeRatios.length === 0) return arms;
  const ratioGcd = MathUtil.gcdArray(activeRatios);
  return arms.map(arm => ({
    ...arm,
    ratio: arm.ratio > 0 ? arm.ratio / ratioGcd : 0
  }));
}
