import { describe, it, expect } from 'vitest';
import { UnifiedValidationAuthority } from './unified-validator';
import { RandomizationConfig } from '../../core/models/randomization.model';

describe('UnifiedValidationAuthority - Seed Validation', () => {
  const baseConfig: Partial<RandomizationConfig> = {
    arms: [
      { id: 'A', name: 'Active', ratio: 1 },
      { id: 'B', name: 'Placebo', ratio: 1 }
    ],
    blockSizes: [4]
  };

  it('should pass validation with a valid seed (alphanumeric, >= 8 chars)', () => {
    const config = { ...baseConfig, seed: 'validSeed123' };
    const errors = UnifiedValidationAuthority.validate(config);
    expect(errors).toEqual([]);
  });

  it('should pass validation when seed is not provided or empty', () => {
    const config = { ...baseConfig, seed: '' };
    const errors = UnifiedValidationAuthority.validate(config);
    expect(errors).toEqual([]);

    const noSeedConfig = { ...baseConfig };
    const noSeedErrors = UnifiedValidationAuthority.validate(noSeedConfig);
    expect(noSeedErrors).toEqual([]);
  });

  it('should fail with ERR_SEED_LENGTH when seed is under 8 characters', () => {
    const config = { ...baseConfig, seed: 'short1' };
    const errors = UnifiedValidationAuthority.validate(config);
    expect(errors.length).toBe(1);
    expect(errors[0]).toEqual({
      code: 'ERR_SEED_LENGTH',
      property: 'seed',
      message: 'Seed must be at least 8 characters long.'
    });
  });

  it('should fail with ERR_SEED_ALPHANUMERIC when seed contains non-alphanumeric characters', () => {
    const config = { ...baseConfig, seed: 'validlength-with-hyphens' };
    const errors = UnifiedValidationAuthority.validate(config);
    expect(errors.length).toBe(1);
    expect(errors[0]).toEqual({
      code: 'ERR_SEED_ALPHANUMERIC',
      property: 'seed',
      message: 'Seed must contain only alphanumeric characters.'
    });
  });

  it('should fail with both ERR_SEED_LENGTH and ERR_SEED_ALPHANUMERIC when seed violates both constraints', () => {
    const config = { ...baseConfig, seed: 'sh-t' };
    const errors = UnifiedValidationAuthority.validate(config);
    expect(errors.length).toBe(2);
    expect(errors.some(e => e.code === 'ERR_SEED_LENGTH')).toBe(true);
    expect(errors.some(e => e.code === 'ERR_SEED_ALPHANUMERIC')).toBe(true);
  });

  it('should accept configurations with individual zero-ratio arms if active positive ratio exists', () => {
    const config: Partial<RandomizationConfig> = {
      arms: [
        { id: 'A', name: 'Active', ratio: 1 },
        { id: 'B', name: 'Observational', ratio: 0 }
      ],
      blockSizes: [2]
    };
    const errors = UnifiedValidationAuthority.validate(config);
    expect(errors).toEqual([]);
  });

  it('should fail with ERR_RATIO_ZERO when all arm ratios are zero', () => {
    const config: Partial<RandomizationConfig> = {
      arms: [
        { id: 'A', name: 'Arm A', ratio: 0 },
        { id: 'B', name: 'Arm B', ratio: 0 }
      ],
      blockSizes: [2]
    };
    const errors = UnifiedValidationAuthority.validate(config);
    expect(errors.length).toBe(1);
    expect(errors[0].code).toBe('ERR_RATIO_ZERO');
  });
});
