import { sampleLevel, selectWeightedArm } from "../../shared/statistical/weighted-sampling";
import { RandomizationConfig, GeneratedSchema, TreatmentArm } from '../../core/models/randomization.model';
import { PRECISION_SCALE } from '../../../core/constants/precision.config';
import { generateSubjectId } from './subject-id-engine';
import { SubjectRegistry } from './subject-registry';
import { MT19937Internal } from './mt19937';

import { MathUtil } from '../../core/utils/math.util';

function computeImbalanceScore(
  candidateArmId: string,
  activeArms: TreatmentArm[],
  subjectProfile: Record<string, string>,
  marginals: Map<string, Map<string, Map<string, number>>>,
  strata: { id: string }[],
  ratioMultipliers: Map<string, number>
): number {
  let totalScore = 0;
  // Performance optimization: Avoid Object.entries(subjectProfile) to prevent
  // intermediate array allocations in this hot loop. Iterating over the strata
  // array directly provides a ~50% speedup for the imbalance calculation.
  for (const factor of strata) {
    const factorId = factor.id;
    const levelValue = subjectProfile[factorId];
    if (!levelValue) continue;

    const factorMarginals = marginals.get(factorId);
    if (!factorMarginals) continue;
    const levelMarginals = factorMarginals.get(levelValue);
    if (!levelMarginals) continue;

    let min: number | null = null;
    let max: number | null = null;
    for (const arm of activeArms) {
      const count = (levelMarginals.get(arm.id) ?? 0) + (arm.id === candidateArmId ? 1 : 0);
      const mult = ratioMultipliers.get(arm.id) ?? 1;
      const normalizedCount = count * mult;
      if (min === null || normalizedCount < min) min = normalizedCount;
      if (max === null || normalizedCount > max) max = normalizedCount;
    }
    if (min !== null && max !== null) {
      totalScore += (max - min);
    }
  }
  return totalScore;
}

export function selectSiteWithWeights(
  sites: string[],
  siteWeights: Record<string, number> | undefined,
  rng: () => number
): string {
  if (!siteWeights) {
    const siteIdx = Math.floor(rng() * sites.length);
    return sites[siteIdx];
  }

  const weights = sites.map(site => siteWeights[site] ?? 1.0);

  if (weights.some(w => w < 0)) {
    throw new Error('Site weights must be non-negative.');
  }

  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    const siteIdx = Math.floor(rng() * sites.length);
    return sites[siteIdx];
  }

  const cumulativeProbabilities: number[] = [];
  let cumulativeSum = 0;
  for (const w of weights) {
    cumulativeSum += w / sum;
    cumulativeProbabilities.push(cumulativeSum);
  }

  const r = rng();
  for (let i = 0; i < sites.length; i++) {
    if (r <= cumulativeProbabilities[i]) {
      return sites[i];
    }
  }

  return sites[sites.length - 1];
}

export function generateMinimization(
  config: RandomizationConfig,
  rng: () => number,
  registry: SubjectRegistry,
  siteWeights?: Record<string, number>,
  rngId?: () => number
): GeneratedSchema[] {
  const resolvedRngId = rngId ?? (config.seed ? (() => {
    const secondarySeed = config.seed + '-id';
    const mtSecondary = new MT19937Internal(MT19937Internal.get31BitSeed(secondarySeed));
    return () => mtSecondary.random();
  })() : rng);

  const { arms, strata, sites, minimizationConfig } = config;
  const p = minimizationConfig?.p ?? 0.8;
  const totalSampleSize = minimizationConfig?.totalSampleSize ?? 100;

  if (!Number.isFinite(p) || p < 0.5 || p > 1.0) {
    throw new Error(`Minimization probability p must be between 0.5 and 1.0, got: ${p}`);
  }
  if (!Number.isFinite(totalSampleSize) || totalSampleSize <= 0 || !Number.isInteger(totalSampleSize)) {
    throw new Error(`Total sample size must be a positive integer, got: ${totalSampleSize}`);
  }

  if (arms.length === 0 || sites.length === 0) return [];

  for (const arm of arms) {
    if (arm.ratio < 0) {
      throw new Error(`Arm ratio must be non-negative. Arm "${arm.name}" has ratio ${arm.ratio}`);
    }
  }

  const activeArms = arms.filter(a => a.ratio > 0);
  if (activeArms.length === 0) {
    throw new Error('At least one treatment arm must have a positive allocation ratio.');
  }

  let armRatioLcm = 1;
  for (const arm of activeArms) {
    armRatioLcm = MathUtil.lcm(armRatioLcm, arm.ratio);
  }
  const ratioMultipliers = new Map<string, number>();
  for (const arm of arms) {
    if (arm.ratio > 0) {
      ratioMultipliers.set(arm.id, armRatioLcm / arm.ratio);
    } else {
      ratioMultipliers.set(arm.id, 0);
    }
  }

  const schema: GeneratedSchema[] = [];
  const usedSubjectIds = new Set<string>();

  // Precompute expected probabilities from config.
  const baseProbabilities = new Map<string, Map<string, number | undefined>>();
  for (const factor of strata) {
    const pMap = new Map<string, number | undefined>();
    const detailsMap = new Map<string, NonNullable<typeof factor.levelDetails>[number]>();
    if (factor.levelDetails) {
      for (const d of factor.levelDetails) {
        detailsMap.set(d.name, d);
      }
    }
    for (const level of factor.levels) {
      const details = detailsMap.get(level);
      pMap.set(level, details?.expectedProbability);
    }
    baseProbabilities.set(factor.id, pMap);
  }

  const isMarginal = registry.isMarginal;

  // Precompute all strata combinations to form the initial valid pool for intersection caps.
  type PoolCombination = Record<string, string> & { _key?: string };
  let activePool: PoolCombination[] = [{}];
  if (!isMarginal) {
    for (const factor of strata) {
      const newCombinations: PoolCombination[] = [];
      for (const combo of activePool) {
        for (const level of factor.levels) {
          newCombinations.push({ ...combo, [factor.id]: level });
        }
      }
      activePool = newCombinations;
    }

    // Filter activePool immediately for any combinations that have a cap of 0
    // Precalculate invariant key for filtering and sampling arrays and filter immediately
    const validPool: PoolCombination[] = [];
    for (const combo of activePool) {
      const key = SubjectRegistry.getIntersectionKey(combo);
      combo._key = key;
      const cap = registry.getIntersectionCap(combo);
      if (cap === undefined || cap > 0) {
        validPool.push(combo);
      }
    }
    activePool = validPool;
  }

  const siteSubjectCounts = new Map<string, number>();
  for (const site of sites) {
    siteSubjectCounts.set(site, 0);
  }

  // marginals[site][factorId][levelValue][armId] = count (for imbalance score calculation per site)
  // Or is minimization global or per-site? Usually minimization balances per site by adding Site as a factor or tracking marginals per site.
  // The original code reset marginals PER SITE loop, which implies imbalance is tracked purely PER SITE.
  // We'll maintain a Map of marginals per site.
  const siteMarginals = new Map<string, Map<string, Map<string, Map<string, number>>>>();
  for (const site of sites) {
    const marginals = new Map<string, Map<string, Map<string, number>>>();
    for (const factor of strata) {
      const factorMap = new Map<string, Map<string, number>>();
      for (const level of factor.levels) {
        const armMap = new Map<string, number>();
        for (const arm of arms) {
          armMap.set(arm.id, 0);
        }
        factorMap.set(level, armMap);
      }
      marginals.set(factor.id, factorMap);
    }
    siteMarginals.set(site, marginals);
  }

  let poolNeedsFilter = true;

  // Generate subjects one by one up to totalSampleSize
  for (let s = 0; s < totalSampleSize; s++) {
    // Determine active pool dynamically. If MARGINAL_ONLY, filter based on marginal counts.
    if (isMarginal) {
      if (registry.isMarginalExhausted()) {
        break;
      }
    } else {
      if (poolNeedsFilter) {
        const newPool: PoolCombination[] = [];
        for (const combo of activePool) {
          if (registry.canAddSubject(combo)) {
            newPool.push(combo);
          }
        }
        activePool = newPool;
        poolNeedsFilter = false;
      }

      if (activePool.length === 0) {
        // No more valid combinations exist; exhaustion reached.
        break;
      }
    }

    // Determine available sites (all sites are uniformly available for now, since no site caps exist)
    // Select site using weights if configured
    const site = selectSiteWithWeights(sites, siteWeights, rng);

    const subjectProfile: Record<string, string> = {};
    const stratum: Record<string, string> = {};

    const currentCombinationPrefix: Record<string, string> = {};

    let validSubject = true;

    // Sample each factor sequentially, dynamically adjusting probabilities based on active pool
    for (const factor of strata) {
      let availableLevels: string[];

      if (isMarginal) {
        availableLevels = registry.getValidLevels(factor.id);
      } else {
        // Find levels that are still present in at least one combination in the activePool
        // that matches the already sampled prefix.
        const prefixKeys = Object.keys(currentCombinationPrefix);
        const activeLevels = new Set<string>();
        for (const combo of activePool) {

          // Optimization: Check the specific target factor level first before doing the full prefix check.
          // This allows us to skip the entire inner loop if we already know this level is valid.
          const levelVal = combo[factor.id];
          if (activeLevels.has(levelVal)) continue;

          let match = true;
          for (const k of prefixKeys) {

            if (combo[k] !== currentCombinationPrefix[k]) {
              match = false;
              break;
            }
          }
          if (match) {
            activeLevels.add(levelVal);
            if (activeLevels.size === factor.levels.length) break;
          }
        }
        availableLevels = factor.levels.filter(level => activeLevels.has(level));
      }

      if (availableLevels.length === 0) {
        validSubject = false;
        break;
      }

      const expectedProbs = availableLevels.map(lvl => baseProbabilities.get(factor.id)?.get(lvl));

      const level = sampleLevel(availableLevels, expectedProbs, rng);
      subjectProfile[factor.id] = level;
      stratum[factor.id] = level;
      currentCombinationPrefix[factor.id] = level;
    }

    if (!validSubject) break;

    // We have a valid subject profile. Now calculate Imbalance Score per site.
    const marginals = siteMarginals.get(site)!;

    let minScore: number | null = null;
    const armScores: number[] = [];
    for (const arm of activeArms) {
      const score = computeImbalanceScore(arm.id, activeArms, subjectProfile, marginals, strata, ratioMultipliers);
      armScores.push(score);
      if (minScore === null || score < minScore) minScore = score;
    }

    const preferred: TreatmentArm[] = [];
    const nonPreferred: TreatmentArm[] = [];
    for (let j = 0; j < activeArms.length; j++) {
      const arm = activeArms[j];
      if (armScores[j] === minScore!) {
        preferred.push(arm);
      } else {
        nonPreferred.push(arm);
      }
    }

    let assignedArm: TreatmentArm;

    if (preferred.length === activeArms.length || nonPreferred.length === 0) {
      assignedArm = selectWeightedArm(preferred, rng);
    } else {
      const r = Math.floor(rng() * PRECISION_SCALE);
      const pScaled = Math.round(p * PRECISION_SCALE);
      if (r < pScaled) {
        assignedArm = selectWeightedArm(preferred, rng);
      } else {
        assignedArm = selectWeightedArm(nonPreferred, rng);
      }
    }

    // Update marginals for imbalance tracking
    for (const factor of strata) {
      const levelValue = subjectProfile[factor.id];
      if (levelValue) {
        marginals.get(factor.id)?.get(levelValue)?.set(
          assignedArm.id,
          (marginals.get(factor.id)?.get(levelValue)?.get(assignedArm.id) ?? 0) + 1
        );
      }
    }

    // Update state tracking
    registry.registerSubject(subjectProfile);
    if (!isMarginal) {
      poolNeedsFilter = true;
    }

    siteSubjectCounts.set(site, siteSubjectCounts.get(site)! + 1);
    const siteSeq = siteSubjectCounts.get(site)!;

    const stratumCode = registry.getStratumCode(stratum);

    const subjectId = generateSubjectId(
      config.subjectIdMask,
      { site, stratumCode, sequence: siteSeq },
      usedSubjectIds,
      resolvedRngId
    );

    schema.push({
      subjectId,
      site,
      stratum,
      stratumCode,
      blockNumber: 0,
      blockSize: 0,
      treatmentArm: assignedArm.name,
      treatmentArmId: assignedArm.id
    });
  }

  return schema;
}
