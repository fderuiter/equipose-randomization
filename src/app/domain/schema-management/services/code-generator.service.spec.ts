import { TestBed } from '@angular/core/testing';
import { CodeGeneratorService } from './code-generator.service';
import { MethodologySpecificationService } from './methodology-specification.service';
import { RandomizationConfig } from '../../core/models/randomization.model';
import { generateRandomizationSchema } from '../../randomization-engine/core/randomization-algorithm';
import { CodeTranspiler } from './generation/ir/transpiler';
import { vi } from 'vitest';
import { execFileSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('CodeGeneratorService Dual-Mode', () => {
  let service: CodeGeneratorService;

  const standardBlockConfig: RandomizationConfig = {
    protocolId: 'PRT-BLOCK',
    studyName: 'Standard Block',
    phase: 'Phase III',
    arms: [
      { id: 'A', name: 'Active', ratio: 1 },
      { id: 'B', name: 'Placebo', ratio: 1 }
    ],
    sites: ['Site1', 'Site2'],
    strata: [{ id: 'age', name: 'Age', levels: ['<65', '>=65'] }],
    blockSizes: [4],
    stratumCaps: [
      { levelIds: { age: '<65' }, cap: 10 },
      { levelIds: { age: '>=65' }, cap: 10 }
    ],
    seed: 'standardseed',
    subjectIdMask: '{SITE}-{SEQ:3}',
    randomizationMethod: 'BLOCK',
    capStrategy: 'MANUAL_MATRIX'
  };

  const minimizationConfig: RandomizationConfig = {
    protocolId: 'PRT-MIN',
    studyName: 'Minimization',
    phase: 'Phase II',
    arms: [
      { id: 'A', name: 'Active', ratio: 1 },
      { id: 'B', name: 'Placebo', ratio: 1 }
    ],
    sites: ['Site1'],
    strata: [{ id: 'age', name: 'Age', levels: ['<65', '>=65'] }],
    blockSizes: [],
    stratumCaps: [],
    seed: 'minseed123',
    subjectIdMask: '{SITE}-{SEQ:3}',
    randomizationMethod: 'MINIMIZATION',
    capStrategy: 'MANUAL_MATRIX',
    minimizationConfig: { p: 0.8, totalSampleSize: 100 }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CodeGeneratorService,
        MethodologySpecificationService
      ]
    });
    service = TestBed.inject(CodeGeneratorService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Static Manifest (Mode 1)', () => {
    it('should generate static code for R', () => {
      const code = service.generateStatic('R', standardBlockConfig);
      expect(code).toContain('schema_list[[1]] <- data.frame(');
      expect(code).toContain('"SubjectID" = c(');
      expect(code).not.toContain('build_block <- function');
    });

    it('should generate static code for Python', () => {
      const code = service.generateStatic('Python', standardBlockConfig);
      expect(code).toContain('schema = {');
      expect(code).toContain('"SubjectID": [');
      expect(code).not.toContain('def build_block');
    });

    it('should generate static code for SAS', () => {
      const code = service.generateStatic('SAS', standardBlockConfig);
      expect(code).toContain('array arr_SubjectID');
      expect(code).toContain('do i = 1 to');
      expect(code).not.toContain('link build_block;');
      expect(code).toContain('WARNING: This generated SAS script does not guarantee bit-for-bit sequence parity');
    });

    it('should generate static code for SAS with minimization config', () => {
      const configWithCaps = {
        ...minimizationConfig,
        stratumCaps: [
          { levelIds: { age: '<65' }, cap: 50 },
          { levelIds: { age: '>=65' }, cap: 50 }
        ]
      };
      const code = service.generateStatic('SAS', configWithCaps);
      expect(code).toContain('array arr_SubjectID');
    });

    it('should generate static code for STATA', () => {
      const code = service.generateStatic('STATA', standardBlockConfig);
      expect(code).toContain('schema_out = J(');
      expect(code).toContain('st_addvar("str100", "SubjectID")');
      expect(code).not.toContain('build_block(real scalar size)');
      expect(code).toContain('WARNING: This generated Stata script does not guarantee bit-for-bit sequence parity');
    });
  });

  describe('Dynamic Generator (Mode 2)', () => {
    it('should generate dynamic code for R', () => {
      const code = service.generateDynamic('R', standardBlockConfig);
      expect(code).toContain('build_block <- function');
      expect(code).toContain('tasks <- list()');
      expect(code).not.toContain('schema_list[[1]] <- data.frame(');
    });

    it('should generate secure R strata logic using native nesting and zero eval(parse)', () => {
      const complexStrataConfig: RandomizationConfig = {
        ...standardBlockConfig,
        strata: [{ id: 'cohort', name: 'Cohort', levels: ["Patient's \"Cohort\" \\ Label"] }],
        stratumCaps: [
          { levelIds: { cohort: "Patient's \"Cohort\" \\ Label" }, cap: 10 }
        ]
      };
      
      const code = service.generateDynamic('R', complexStrataConfig);
      
      // Zero instances of eval(parse(text=...))
      expect(code).not.toContain('eval(parse(text=');
      
      // Native nested R lists represent strata configuration
      expect(code).toContain('strata=list("cohort"="Patient\'s \\"Cohort\\" \\\\ Label")');
      
      // Direct assignment instead of parse/evaluation
      expect(code).toContain('strata_eval <- tasks[[t_idx]]$strata');
    });

    it('should generate dynamic code for Python', () => {
      const code = service.generateDynamic('Python', standardBlockConfig);
      expect(code).toContain('def build_block');
      expect(code).toContain('tasks = [');
      expect(code).not.toContain('"SubjectID": [');
      expect(code).toContain('import threading');
      expect(code).toContain('lock = threading.Lock()');
    });

    it('should generate dynamic code for SAS', () => {
      const code = service.generateDynamic('SAS', standardBlockConfig);
      expect(code).toContain('build_block:');
      expect(code).toContain('link build_block;');
      expect(code).not.toContain('array arr_SubjectID');
      expect(code).toContain('WARNING: This generated SAS script does not guarantee bit-for-bit sequence parity');
      expect(code).toContain('declare hash site_counts()');
      expect(code).toContain("site_counts.defineKey('Site')");
      expect(code).toContain('site_counts.find()');
      expect(code).toContain('site_counts.delete()');
      expect(code).toContain('drop rc site_seq_count;');
      expect(code).not.toContain('site_idx');
      expect(code).not.toContain('array site_counts');
    });

    it('should generate dynamic code for STATA', () => {
      const code = service.generateDynamic('STATA', standardBlockConfig);
      expect(code).toContain('build_block(real scalar size)');
      expect(code).toContain('task_caps = (');
      expect(code).not.toContain('schema_out[1, .] =');
      expect(code).toContain('WARNING: This generated Stata script does not guarantee bit-for-bit sequence parity');
    });
  });

  describe('Dynamic Minimization (Mode 2)', () => {
    it('should generate dynamic minimization code for R', () => {
      const code = service.generateDynamic('R', minimizationConfig);
      expect(code).toContain('p_minimization <- 0.8');
      expect(code).toContain('total_sample_size <- 100');
      expect(code).toContain('sample_level <- function');
      expect(code).toContain('compute_imbalance_score <- function');
    });

    it('should generate dynamic minimization code for Python', () => {
       const code = service.generateDynamic('Python', minimizationConfig);
       expect(code).toContain('p_minimization = 0.8');
       expect(code).toContain('total_sample_size = 100');
       expect(code).toContain('def sample_level');
       expect(code).toContain('def compute_imbalance_score');
       expect(code).toContain('import threading');
       expect(code).toContain('lock = threading.Lock()');
       expect(code).toContain('with lock:');
    });

    it('should generate dynamic minimization code for SAS', () => {
      const code = service.generateDynamic('SAS', minimizationConfig);
      expect(code).toContain('round(&p_minimization * &PRECISION_SCALE)');
      expect(code).toContain('marginals_hash');
      expect(code).toContain('intersection_counts[');
    });

    it('should generate dynamic minimization code for STATA', () => {
      const code = service.generateDynamic('STATA', minimizationConfig);
      expect(code).toContain('p_minimization = ');
      expect(code).toContain('real scalar sample_level(');
      expect(code).toContain('real scalar compute_imbalance_score(');
    });

    it('should maintain perfect behavioral parity between Python and TypeScript generated schemas', () => {
      const config = {
        ...minimizationConfig,
        stratumCaps: [
          { levelIds: { age: '<65' }, cap: 50 },
          { levelIds: { age: '>=65' }, cap: 50 }
        ]
      };

      const tsResult = generateRandomizationSchema(config);
      const tsSchema = tsResult.schema;

      const pyCode = service.generateDynamic('Python', config);

      const tempFile = join(tmpdir(), `test_minimization_parity_${Date.now()}.py`);
      writeFileSync(tempFile, pyCode, 'utf-8');

      try {
        const pythonExecutable = process.env['PYTHON'] || 'python';
        const stdout = execFileSync(pythonExecutable, [tempFile], { encoding: 'utf-8' });
        const lines = stdout.trim().split('\n');
        const headers = lines[0].split(',');
        const pySchema = lines.slice(1).map(line => {
          const vals = line.split(',');
          const row: any = {};
          headers.forEach((h, idx) => {
            row[h] = vals[idx];
          });
          return row;
        });

        expect(pySchema.length).toBe(tsSchema.length);
        for (let i = 0; i < tsSchema.length; i++) {
          const tsRow = tsSchema[i];
          const pyRow = pySchema[i];
          expect(pyRow['SubjectID']).toBe(tsRow.subjectId);
          expect(pyRow['Site']).toBe(tsRow.site);
          expect(pyRow['Treatment']).toBe(tsRow.treatmentArm);
          expect(pyRow['StratumCode']).toBe(tsRow.stratumCode);
          expect(pyRow['age']).toBe(tsRow.stratum['age']);
        }

        const auditFile = join(process.cwd(), 'audit_trail.csv');
        expect(existsSync(auditFile)).toBe(true);
        const auditContent = readFileSync(auditFile, 'utf-8');
        const auditLines = auditContent.trim().replace(/\r/g, '').split('\n');
        expect(auditLines[0]).toBe('SubjectID,Site,StratumCode,AllocatedArm,ImbalanceScores,PreferredArmProb,RandomValue');
        expect(auditLines.length - 1).toBe(tsSchema.length);
        unlinkSync(auditFile);
      } finally {
        unlinkSync(tempFile);
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw an error when generating dynamic code with marginal caps for Block Randomization', () => {
      const marginalConfig = { ...standardBlockConfig, capStrategy: 'MARGINAL_ONLY' as const };
      expect(() => {
        service.generateDynamic('Python', marginalConfig);
      }).toThrow('Dynamic simulation engine is not supported for MARGINAL_ONLY cap strategy. Please use Static Manifest mode.');
    });

    it('should throw an error when generating dynamic code with marginal caps for Minimization', () => {
      const marginalMinConfig = { ...minimizationConfig, capStrategy: 'MARGINAL_ONLY' as const };
      expect(() => {
        service.generateDynamic('Python', marginalMinConfig);
      }).toThrow('Dynamic simulation engine is not supported for MARGINAL_ONLY cap strategy. Please use Static Manifest mode.');
    });

    it('should throw StrataParsingError when strata configurations are invalid', () => {
      const malformedConfig = {
        ...standardBlockConfig,
        strata: [{ id: 'age', name: 'Age' }] // Missing levels array
      } as unknown as RandomizationConfig;
      
      expect(() => {
        service.generateStatic('Python', malformedConfig);
      }).toThrow(/Failed to parse strata levels/);
    });

    it('should throw TemplateCompilationError when template rendering fails', () => {
      const renderSpy = vi.spyOn(CodeTranspiler, 'renderTemplate').mockImplementation(() => {
        throw new Error('Mock render failure');
      });
      
      try {
        expect(() => {
          service.generateStatic('Python', standardBlockConfig);
        }).toThrow(/Failed to compile Python template/);
      } finally {
        renderSpy.mockRestore();
      }
    });
  });

  describe('Standardized Concurrency & Sequence-Parity Warning', () => {
    it('should include warning comment block for R', () => {
      const code = service.generateStatic('R', standardBlockConfig);
      expect(code).toContain('WARNING: SEQUENCE-PARITY & MULTI-USER INTEGRATION SAFETY');
    });
    it('should include warning comment block for Python', () => {
      const code = service.generateStatic('Python', standardBlockConfig);
      expect(code).toContain('WARNING: SEQUENCE-PARITY & MULTI-USER INTEGRATION SAFETY');
    });
    it('should include warning comment block for SAS', () => {
      const code = service.generateStatic('SAS', standardBlockConfig);
      expect(code).toContain('WARNING: SEQUENCE-PARITY & MULTI-USER INTEGRATION SAFETY');
    });
    it('should include warning comment block for STATA', () => {
      const code = service.generateStatic('STATA', standardBlockConfig);
      expect(code).toContain('WARNING: SEQUENCE-PARITY & MULTI-USER INTEGRATION SAFETY');
    });
  });

  describe('Zero-Ratio Arms Code Export & Pre-flight Guards', () => {
    const zeroRatioConfig: RandomizationConfig = {
      ...minimizationConfig,
      arms: [
        { id: 'A', name: 'Active Arm', ratio: 1 },
        { id: 'B', name: 'Observational Arm', ratio: 0 }
      ]
    };

    it('should generate valid dynamic minimization scripts for Python, R, SAS, and STATA when zero-ratio arms exist', () => {
      const pyCode = service.generateDynamic('Python', zeroRatioConfig);
      expect(pyCode).toContain('active_candidates = [a for a in candidates if a["ratio"] > 0]');
      expect(pyCode).toContain('active_arms = [a for a in arms if a["ratio"] > 0]');

      const rCode = service.generateDynamic('R', zeroRatioConfig);
      expect(rCode).toContain('active_candidates <- Filter(function(a) a$ratio > 0, candidates)');
      expect(rCode).toContain('active_arms <- Filter(function(a) a$ratio > 0, arms)');

      const sasCode = service.generateDynamic('SAS', zeroRatioConfig);
      expect(sasCode).toContain('if arm_ratios[arm_idx] > 0 then do;');

      const stataCode = service.generateDynamic('STATA', zeroRatioConfig);
      expect(stataCode).toContain('active_candidates = active_candidates, candidates_indices[i]');
    });

    it('should trigger pre-flight validation error when all arm ratios are zero before code emission', () => {
      const allZeroConfig: RandomizationConfig = {
        ...minimizationConfig,
        arms: [
          { id: 'A', name: 'Arm A', ratio: 0 },
          { id: 'B', name: 'Arm B', ratio: 0 }
        ]
      };

      expect(() => service.generateDynamic('Python', allZeroConfig)).toThrow();
    });
  });
});
