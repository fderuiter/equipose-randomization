import { SubjectRegistry } from './subject-registry';
import { describe, it, expect } from 'vitest';
import { generateMinimization, selectSiteWithWeights } from './minimization-algorithm';
import { MT19937Internal } from './mt19937';
import { RandomizationConfig } from '../../core/models/randomization.model';
import { StudyPresets } from '../../core/presets/study-presets';

const seedRng = (seed: string) => {
  const mt = new MT19937Internal(MT19937Internal.get31BitSeed(seed));
  return () => mt.random();
};

const baseConfig: RandomizationConfig = StudyPresets.extend(StudyPresets.Minimization, {
  protocolId: 'TEST-001',
  studyName: 'Test Study',
  phase: 'II',
  arms: [
    { id: 'A', name: 'Active', ratio: 1 },
    { id: 'B', name: 'Placebo', ratio: 1 }
  ],
  sites: ['Site1'],
  strata: [
    {
      id: 'sex',
      name: 'Sex',
      levels: ['Male', 'Female'],
      levelDetails: [
        { name: 'Male', expectedProbability: 0.5 },
        { name: 'Female', expectedProbability: 0.5 }
      ]
    }
  ],
  blockSizes: [],
  stratumCaps: [{ levelIds: { sex: 'Male' }, cap: 100 }, { levelIds: { sex: 'Female' }, cap: 100 }],
  seed: 'test123',
  subjectIdMask: '{SITE}-{SEQ:3}',
  randomizationMethod: 'MINIMIZATION',
  minimizationConfig: { p: 0.8, totalSampleSize: 100 }
});

describe('generateMinimization', () => {
  it('generates the correct number of subjects', () => {
    const rng = seedRng('test123');
    const schema = generateMinimization(baseConfig, rng, new SubjectRegistry(baseConfig));
    expect(schema.length).toBe(100);
  });

  it('assigns valid treatment arms only', () => {
    const rng = seedRng('test123');
    const schema = generateMinimization(baseConfig, rng, new SubjectRegistry(baseConfig));
    const validArms = new Set(baseConfig.arms.map(a => a.id));
    for (const row of schema) {
      expect(validArms.has(row.treatmentArmId)).toBe(true);
    }
  });

  it('produces deterministic results with the same seed', () => {
    const schema1 = generateMinimization(baseConfig, seedRng('abc'), new SubjectRegistry(baseConfig));
    const schema2 = generateMinimization(baseConfig, seedRng('abc'), new SubjectRegistry(baseConfig));
    expect(schema1.map(r => r.treatmentArmId)).toEqual(schema2.map(r => r.treatmentArmId));
  });

  it('achieves reasonable balance with p=1.0', () => {
    const config = { ...baseConfig, minimizationConfig: { p: 1.0, totalSampleSize: 200 } };
    const schema = generateMinimization(config, seedRng('balance'), new SubjectRegistry(config));
    const countA = schema.filter(r => r.treatmentArmId === 'A').length;
    const countB = schema.filter(r => r.treatmentArmId === 'B').length;
    expect(Math.abs(countA - countB)).toBeLessThanOrEqual(5);
  });

  it('respects sites: distributes subjects across sites', () => {
    const config = {
      ...baseConfig,
      sites: ['Site1', 'Site2'],
      minimizationConfig: { p: 0.8, totalSampleSize: 100 }
    };
    const schema = generateMinimization(config, seedRng('sites'), new SubjectRegistry(config));
    const site1Count = schema.filter(r => r.site === 'Site1').length;
    const site2Count = schema.filter(r => r.site === 'Site2').length;
    expect(site1Count).toBeGreaterThan(30);
    expect(site2Count).toBeGreaterThan(30);
  });

  it('throws when p is outside [0.5, 1.0]', () => {
    const rng = seedRng('test');
    expect(() => generateMinimization({ ...baseConfig, minimizationConfig: { p: 0.3, totalSampleSize: 100 } }, rng, new SubjectRegistry({ ...baseConfig, minimizationConfig: { p: 0.3, totalSampleSize: 100 } })))
      .toThrow('Minimization probability p must be between 0.5 and 1.0');
    expect(() => generateMinimization({ ...baseConfig, minimizationConfig: { p: 1.1, totalSampleSize: 100 } }, rng, new SubjectRegistry({ ...baseConfig, minimizationConfig: { p: 1.1, totalSampleSize: 100 } })))
      .toThrow('Minimization probability p must be between 0.5 and 1.0');
  });

  it('throws when totalSampleSize is not a positive integer', () => {
    const rng = seedRng('test');
    expect(() => generateMinimization({ ...baseConfig, minimizationConfig: { p: 0.8, totalSampleSize: 0 } }, rng, new SubjectRegistry({ ...baseConfig, minimizationConfig: { p: 0.8, totalSampleSize: 0 } })))
      .toThrow('Total sample size must be a positive integer');
    expect(() => generateMinimization({ ...baseConfig, minimizationConfig: { p: 0.8, totalSampleSize: -10 } }, rng, new SubjectRegistry({ ...baseConfig, minimizationConfig: { p: 0.8, totalSampleSize: -10 } })))
      .toThrow('Total sample size must be a positive integer');
  });


describe('Minimization Algorithm - Detailed Fixes', () => {
  const customConfig: RandomizationConfig = {
    protocolId: 'TEST-002',
    studyName: 'Detailed Test Study',
    phase: 'II',
    arms: [
      { id: 'A', name: 'Active', ratio: 2 },
      { id: 'B', name: 'Placebo', ratio: 1 }
    ],
    sites: ['Site1'],
    strata: [
      {
        id: 'sex',
        name: 'Sex',
        levels: ['Male', 'Female'],
        levelDetails: [
          { name: 'Male', expectedProbability: 0.5 },
          { name: 'Female', expectedProbability: 0.5 }
        ]
      }
    ],
    blockSizes: [],
    stratumCaps: [{ levelIds: { sex: 'Male' }, cap: 100 }, { levelIds: { sex: 'Female' }, cap: 100 }],
    seed: 'test1234',
    subjectIdMask: '{SITE}-{SEQ:3}',
    randomizationMethod: 'MINIMIZATION',
    minimizationConfig: { p: 1.0, totalSampleSize: 150 } // using p=1.0 makes it purely deterministic based on imbalance score
  };

  it('Issue 1: Imbalance score should evaluate variance against target proportions (2:1 ratio)', () => {
    // If Active has 4 and Placebo has 2, ratio is 2:1. Normalized should be 4/2 = 2 and 2/1 = 2.
    // The imbalance score should be exactly 0.
    // To test this we will mock the marginals within computeImbalanceScore or we can run the algorithm
    // and observe the generated balance.
    // Actually, with p=1.0 and 2:1 ratio, the final result should be exactly 100 A and 50 B.
    const rng = seedRng('test1234');
    const schema = generateMinimization(customConfig, rng, new SubjectRegistry(customConfig));

    const countA = schema.filter(r => r.treatmentArmId === 'A').length;

    // With 150 subjects and perfectly alternating to keep 2:1 ratio, we should get ~100 A and ~50 B.
    // Currently, it ignores ratio and forces 1:1 balance, yielding ~75 and ~75.
    expect(countA).toBeGreaterThanOrEqual(95);
    expect(countA).toBeLessThanOrEqual(105);
  });


  it('Issue 3: Probability Normalization - Under-allocated explicit probabilities', () => {
     // If explicit sum < 1.0, remaining should be divided equally among undefined.
     const configWithUndefinedLevels: RandomizationConfig = {
        ...customConfig,
        stratumCaps: [{ levelIds: { bloodType: 'A' }, cap: 150 }, { levelIds: { bloodType: 'B' }, cap: 150 }, { levelIds: { bloodType: 'O' }, cap: 150 }, { levelIds: { bloodType: 'AB' }, cap: 150 }],
        strata: [
          {
            id: 'bloodType',
            name: 'BloodType',
            levels: ['A', 'B', 'O', 'AB'],
            levelDetails: [
              { name: 'A', expectedProbability: 0.4 },
              { name: 'B', expectedProbability: undefined },
              { name: 'O', expectedProbability: undefined },
              { name: 'AB', expectedProbability: undefined }
            ]
          }
        ]
     };
     // Remaining 0.6 should be split 3 ways -> 0.2 each.
     const rng = seedRng('probtest');
     const schema = generateMinimization(configWithUndefinedLevels, rng, new SubjectRegistry(configWithUndefinedLevels));

     const countA = schema.filter(r => r.stratum['bloodType'] === 'A').length;
     const countB = schema.filter(r => r.stratum['bloodType'] === 'B').length;
     const countO = schema.filter(r => r.stratum['bloodType'] === 'O').length;
     const countAB = schema.filter(r => r.stratum['bloodType'] === 'AB').length;

     // Currently, B, O, AB will get 0%, A gets 100%.
     // The fix should result in ~40% A, ~20% B, ~20% O, ~20% AB.
     expect(countA).toBeLessThan(150); // Should not be all A
     expect(countB).toBeGreaterThan(0);
     expect(countO).toBeGreaterThan(0);
     expect(countAB).toBeGreaterThan(0);
  });

    it('Issue 3: Probability Normalization - Over-allocated explicit probabilities', () => {
       // If explicit sum > 1.0, normalize proportionally and assign 0 to undefined.
       const configOverAllocated: RandomizationConfig = {
          ...customConfig,
          stratumCaps: [{ levelIds: { bloodType: 'A' }, cap: 150 }, { levelIds: { bloodType: 'B' }, cap: 150 }, { levelIds: { bloodType: 'O' }, cap: 150 }, { levelIds: { bloodType: 'AB' }, cap: 150 }],
          strata: [
            {
              id: 'bloodType',
              name: 'BloodType',
              levels: ['A', 'B', 'O', 'AB'],
              levelDetails: [
                { name: 'A', expectedProbability: 0.8 },
                { name: 'B', expectedProbability: 0.4 },
                { name: 'O', expectedProbability: undefined },
                { name: 'AB', expectedProbability: undefined }
              ]
            }
          ]
       };
       // Sum = 1.2. A gets 0.8/1.2 = 0.666, B gets 0.4/1.2 = 0.333. O and AB get 0.
       const rng = seedRng('probtest_over');
       const schema = generateMinimization(configOverAllocated, rng, new SubjectRegistry(configOverAllocated));

       const countA = schema.filter(r => r.stratum['bloodType'] === 'A').length;
       const countB = schema.filter(r => r.stratum['bloodType'] === 'B').length;
       const countO = schema.filter(r => r.stratum['bloodType'] === 'O').length;
       const countAB = schema.filter(r => r.stratum['bloodType'] === 'AB').length;

       // Should be around 100 A, 50 B, 0 O, 0 AB.
       expect(countA).toBeGreaterThan(90);
       expect(countB).toBeGreaterThan(40);
       expect(countO).toBe(0);
       expect(countAB).toBe(0);
    });

    it('Issue 3: Probability Normalization - Exact sum of 1.0', () => {
       // If explicit sum == 1.0, undefined get 0.
       const configExactSum: RandomizationConfig = {
          ...customConfig,
          stratumCaps: [{ levelIds: { bloodType: 'A' }, cap: 150 }, { levelIds: { bloodType: 'B' }, cap: 150 }, { levelIds: { bloodType: 'O' }, cap: 150 }, { levelIds: { bloodType: 'AB' }, cap: 150 }],
          strata: [
            {
              id: 'bloodType',
              name: 'BloodType',
              levels: ['A', 'B', 'O', 'AB'],
              levelDetails: [
                { name: 'A', expectedProbability: 0.7 },
                { name: 'B', expectedProbability: 0.3 },
                { name: 'O', expectedProbability: undefined },
                { name: 'AB', expectedProbability: undefined }
              ]
            }
          ]
       };
       // A gets 0.7, B gets 0.3. O and AB get 0.
       const rng = seedRng('probtest_exact');
       const schema = generateMinimization(configExactSum, rng, new SubjectRegistry(configExactSum));

       const countA = schema.filter(r => r.stratum['bloodType'] === 'A').length;
       const countB = schema.filter(r => r.stratum['bloodType'] === 'B').length;
       const countO = schema.filter(r => r.stratum['bloodType'] === 'O').length;
       const countAB = schema.filter(r => r.stratum['bloodType'] === 'AB').length;

       // Should be around 105 A, 45 B, 0 O, 0 AB.
       expect(countA).toBeGreaterThan(95);
       expect(countB).toBeGreaterThan(35);
     expect(countO).toBe(0);
     expect(countAB).toBe(0);
  });

  it('Issue 2: Uniform Tie-Breaking should throw Error if tie-breaker total weight is 0', () => {
     const configZeroRatio: RandomizationConfig = {
        ...customConfig,
        arms: [
          { id: 'A', name: 'Active', ratio: 0 },
          { id: 'B', name: 'Placebo', ratio: 0 }
        ]
     };
     const rng = seedRng('probtest_zero_ratio');
     expect(() => generateMinimization(configZeroRatio, rng, new SubjectRegistry(configZeroRatio))).toThrow();
  });

  it('should exclude zero-ratio arms from minimization allocation and assign subjects only to positive-ratio arms', () => {
     const configWithZeroRatioArm: RandomizationConfig = {
        ...customConfig,
        arms: [
          { id: 'A', name: 'Active Arm A', ratio: 1 },
          { id: 'B', name: 'Active Arm B', ratio: 1 },
          { id: 'C', name: 'Observational Arm C', ratio: 0 }
        ],
        minimizationConfig: { p: 0.8, totalSampleSize: 50 }
     };
     const rng = seedRng('zero_ratio_minimization');
     const schema = generateMinimization(configWithZeroRatioArm, rng, new SubjectRegistry(configWithZeroRatioArm));

     expect(schema.length).toBe(50);
     const assignedC = schema.filter(s => s.treatmentArmId === 'C');
     expect(assignedC.length).toBe(0);
     const assignedA = schema.filter(s => s.treatmentArmId === 'A');
     const assignedB = schema.filter(s => s.treatmentArmId === 'B');
     expect(assignedA.length + assignedB.length).toBe(50);
  });
});

  describe('Regression Prevention Tests', () => {
    it('Issue 5: Returns a truncated schema when total caps sum to less than totalSampleSize', () => {
      const restrictedConfig = {
        ...baseConfig,
        minimizationConfig: { p: 0.8, totalSampleSize: 100 },
        capStrategy: 'MANUAL_MATRIX' as const,
        stratumCaps: [
          { levelIds: { sex: 'Male' }, cap: 20 },
          { levelIds: { sex: 'Female' }, cap: 20 }
        ]
      };

      const rng = seedRng('truncationTest');
      const schema = generateMinimization(restrictedConfig, rng, new SubjectRegistry(restrictedConfig));
      expect(schema.length).toBe(40);
    });

    it('Issue 5: Respects MARGINAL_ONLY caps exactly and dynamically recalculates probabilities', () => {
      const marginalConfig = {
        ...baseConfig,
        minimizationConfig: { p: 0.8, totalSampleSize: 50 },
        capStrategy: 'MARGINAL_ONLY' as const,
        strata: [
          {
            id: 'sex',
            name: 'Sex',
            levels: ['Male', 'Female'],
            levelDetails: [
              { name: 'Male', expectedProbability: 0.5, marginalCap: 5 },
              { name: 'Female', expectedProbability: 0.5 }
            ]
          }
        ]
      };

      const rng = seedRng('marginalTest');
      const start = performance.now();
      const schema = generateMinimization(marginalConfig, rng, new SubjectRegistry(marginalConfig));
      const end = performance.now();

      expect(end - start).toBeLessThan(100);

      const maleCount = schema.filter(r => r.stratum['sex'] === 'Male').length;
      const femaleCount = schema.filter(r => r.stratum['sex'] === 'Female').length;

      expect(maleCount).toBe(5);
      expect(femaleCount).toBe(45);
      expect(schema.length).toBe(50);
    });
  });

  describe('selectSiteWithWeights', () => {
    it('falls back to uniform selection if siteWeights is undefined', () => {
      const rng = () => 0.5;
      const site = selectSiteWithWeights(['SiteA', 'SiteB'], undefined, rng);
      expect(site).toBe('SiteB'); // 0.5 * 2 = 1.0 -> index 1
    });

    it('selects site correctly according to custom site recruitment weights', () => {
      // SiteA has weight 9, SiteB has weight 1.
      // SiteA should be selected for r <= 0.9, SiteB for r > 0.9.
      const rngSiteA = () => 0.4;
      const rngSiteB = () => 0.95;

      const siteWeights = { SiteA: 9, SiteB: 1 };

      expect(selectSiteWithWeights(['SiteA', 'SiteB'], siteWeights, rngSiteA)).toBe('SiteA');
      expect(selectSiteWithWeights(['SiteA', 'SiteB'], siteWeights, rngSiteB)).toBe('SiteB');
    });

    it('falls back to uniform selection if all site weights are zero', () => {
      const rng = () => 0.1;
      const siteWeights = { SiteA: 0, SiteB: 0 };
      const site = selectSiteWithWeights(['SiteA', 'SiteB'], siteWeights, rng);
      expect(site).toBe('SiteA'); // index 0
    });

    it('throws an error if any negative site weight is provided', () => {
      const rng = () => 0.5;
      const siteWeights = { SiteA: -1, SiteB: 2 };
      expect(() => selectSiteWithWeights(['SiteA', 'SiteB'], siteWeights, rng)).toThrow('Site weights must be non-negative.');
    });
  });
});
