import { TestBed, ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { CodeGeneratorModalComponent } from './code-generator-modal.component';
import { RandomizationEngineFacade } from '../../randomization-engine/randomization-engine.facade';
import { CodeGeneratorService } from '../services/code-generator.service';
import { CodeGenerationError } from '../errors/code-generation-errors';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { RandomizationConfig } from '../../core/models/randomization.model';

describe('CodeGeneratorModalComponent (domain)', () => {
  let component: CodeGeneratorModalComponent;
  let fixture: ComponentFixture<CodeGeneratorModalComponent>;
  let mockFacade: any;
  let mockCodeGeneratorService: any;

  beforeEach(async () => {
    mockFacade = {
      config: signal<RandomizationConfig | null>(null),
      results: signal(null),
      isGenerating: signal(false),
      error: signal(null),
      showCodeGenerator: signal(false),
      codeLanguage: signal('R'),
      generateSchema: vi.fn(),
      generateSchemaAsync: vi.fn().mockResolvedValue({
        metadata: {
          auditHash: 'fake_hash',
          generatedAt: new Date().toISOString(),
          config: { seed: 'fake_seed' }
        }
      }),
      openCodeGenerator: vi.fn(),
      closeCodeGenerator: vi.fn(),
      clearResults: vi.fn()
    };

    mockCodeGeneratorService = {
      generate: vi.fn().mockReturnValue('Mock Generated Code'),
      generateR: vi.fn().mockReturnValue('Mock R Code'),
      generatePython: vi.fn().mockReturnValue('Mock Python Code'),
      generateSas: vi.fn().mockReturnValue('Mock SAS Code'),
      generateStatic: vi.fn().mockReturnValue('Mock Static Code'),
      generateDynamic: vi.fn().mockReturnValue('Mock Dynamic Code')
    };

    await TestBed.configureTestingModule({
      imports: [CodeGeneratorModalComponent],
      providers: [
        { provide: RandomizationEngineFacade, useValue: mockFacade },
        { provide: CodeGeneratorService, useValue: mockCodeGeneratorService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(CodeGeneratorModalComponent);
    component = fixture.componentInstance;
  });

  describe('when config is fully populated', () => {
    let mockConfig: RandomizationConfig;

    beforeEach(async () => {
      mockConfig = {
        protocolId: 'TEST-123',
        studyName: 'Test Study',
        phase: 'Phase 1',
        arms: [
          { id: '1', name: 'Arm A', ratio: 1 },
          { id: '2', name: 'Arm B', ratio: 2 }
        ],
        sites: ['Site1', 'Site2'],
        strata: [
          { id: 'strata1', name: 'Strata 1', levels: ['Low', 'High'] },
          { id: 'strata2', name: 'Strata 2', levels: ['Yes', 'No'] }
        ],
        blockSizes: [3, 6],
        stratumCaps: [
          { levelIds: {}, cap: 10 },
          { levelIds: {}, cap: 15 },
          { levelIds: {}, cap: 5 },
          { levelIds: {}, cap: 20 }
        ],
        seed: 'test_seed',
        subjectIdMask: '[SiteID]-[StratumCode]-[001]'
      };
      mockFacade.config.set(mockConfig);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should generate valid R code', async () => {
      mockCodeGeneratorService.generate.mockReturnValue('Mock R Code');
      await component.setActiveTab('R');
      const code = component.currentCode;
      expect(mockCodeGeneratorService.generate).toHaveBeenCalledWith('R', mockConfig, expect.anything());
      expect(code).toBe('Mock R Code');
    });

    it('should generate valid Python code', async () => {
      mockCodeGeneratorService.generate.mockReturnValue('Mock Python Code');
      await component.setActiveTab('Python');
      const code = component.currentCode;
      expect(mockCodeGeneratorService.generate).toHaveBeenCalledWith('Python', mockConfig, expect.anything());
      expect(code).toBe('Mock Python Code');
    });

    it('should generate valid SAS code', async () => {
      mockCodeGeneratorService.generate.mockReturnValue('Mock SAS Code');
      await component.setActiveTab('SAS');
      const code = component.currentCode;
      expect(mockCodeGeneratorService.generate).toHaveBeenCalledWith('SAS', mockConfig, expect.anything());
      expect(code).toBe('Mock SAS Code');
    });
  });

  describe('when config properties are undefined', () => {
    beforeEach(() => {
      mockFacade.config.set(null);
      fixture.detectChanges();
    });

    it('should handle missing config gracefully', async () => {
      await component.setActiveTab('R');
      const code = component.currentCode;
      expect(code).toBe('');
      expect(mockCodeGeneratorService.generate).not.toHaveBeenCalled();
    });
  });

  describe('downloadCode()', () => {
    let mockConfig: RandomizationConfig;

    beforeEach(async () => {
      vi.useFakeTimers();
      globalThis.URL.createObjectURL = vi.fn(() => "mock://url") as unknown as (obj: Blob | MediaSource) => string;
      globalThis.URL.revokeObjectURL = vi.fn() as unknown as (url: string) => void;

      mockConfig = {
        protocolId: 'DL-TEST',
        studyName: 'Download Test',
        phase: 'Phase I',
        arms: [{ id: '1', name: 'Active', ratio: 1 }],
        sites: ['Site1'],
        strata: [],
        blockSizes: [2],
        stratumCaps: [],
        seed: 'dl_seed',
        subjectIdMask: '[SiteID]-[001]'
      };
      mockFacade.config.set(mockConfig);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    const verifyDownloadFilename = async (language: 'R' | 'SAS' | 'Python' | 'STATA', expectedFilename: string) => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      await component.setActiveTab(language);
      await component.downloadCode();

      const anchorEl = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
      expect(anchorEl.getAttribute('download')).toBe(expectedFilename);

      vi.advanceTimersByTime(100);

      appendSpy.mockRestore();
      removeSpy.mockRestore();
    };

    it('should use randomization_schema.zip as the filename for R code', async () => {
      await verifyDownloadFilename('R', 'randomization_schema.zip');
    });

    it('should use randomization_schema.zip as the filename for SAS code', async () => {
      await verifyDownloadFilename('SAS', 'randomization_schema.zip');
    });

    it('should use randomization_schema.zip as the filename for Python code', async () => {
      await verifyDownloadFilename('Python', 'randomization_schema.zip');
    });

    it('should use randomization_schema.zip as the filename for STATA code', async () => {
      await verifyDownloadFilename('STATA', 'randomization_schema.zip');
    });

    it('should call URL.createObjectURL with a Blob', async () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');

      await component.setActiveTab('R');
      await component.downloadCode();

      expect(globalThis.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));

      vi.advanceTimersByTime(100);

      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('should initiate ZIP file generation when exportMode is BOTH', async () => {
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');
      const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

      component.exportMode.set('BOTH');
      await component.setActiveTab('R');
      await component.downloadCode();

      expect(mockCodeGeneratorService.generateStatic).toHaveBeenCalledWith('R', mockConfig, undefined);
      expect(mockCodeGeneratorService.generateDynamic).toHaveBeenCalledWith('R', mockConfig, undefined);

      expect(appendSpy).toHaveBeenCalled();
      const anchorEl = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
      expect(anchorEl.getAttribute('download')).toBe('randomization_schema_bundle.zip');
      expect(clickSpy).toHaveBeenCalled();

      vi.advanceTimersByTime(100);

      appendSpy.mockRestore();
      removeSpy.mockRestore();
      clickSpy.mockRestore();
    });
  });

  describe('copyCode()', () => {
    let mockConfig: RandomizationConfig;

    beforeEach(async () => {
      mockConfig = {
        protocolId: 'COPY-TEST',
        studyName: 'Copy Test',
        phase: 'Phase I',
        arms: [{ id: '1', name: 'Active', ratio: 1 }],
        sites: ['Site1'],
        strata: [],
        blockSizes: [2],
        stratumCaps: [],
        seed: 'copy_seed',
        subjectIdMask: '[SiteID]-[001]'
      };
      mockFacade.config.set(mockConfig);
      mockCodeGeneratorService.generate.mockReturnValue('Mock R Code');
      fixture.detectChanges();
      await component.setActiveTab('R');
    });

    it('should write the current code to the clipboard', () => {
      const clipboardWriteSpy = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: clipboardWriteSpy },
        configurable: true,
        writable: true
      });

      component.copyCode();
      expect(clipboardWriteSpy).toHaveBeenCalledWith('Mock R Code');
    });

    it('should set the copied signal to true immediately after calling copyCode()', () => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
        writable: true
      });

      component.copyCode();
      expect(component.copied()).toBe(true);
    });
  });

  describe('error handling', () => {
    let mockConfig: RandomizationConfig;

    beforeEach(async () => {
      mockConfig = {
        protocolId: 'ERR-TEST',
        studyName: 'Error Test',
        phase: 'Phase I',
        arms: [{ id: '1', name: 'Active', ratio: 1 }],
        sites: ['Site1'],
        strata: [],
        blockSizes: [2],
        stratumCaps: [],
        seed: 'err_seed',
        subjectIdMask: '[SiteID]-[001]'
      };
      mockFacade.config.set(mockConfig);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should set errorState when the code generator throws a CodeGenerationError', async () => {
      const codeGenErr = new CodeGenerationError('Specific failure', mockConfig);
      mockCodeGeneratorService.generate.mockImplementation(() => { throw codeGenErr; });

      await component.setActiveTab('R');

      expect(component.errorState()).toBe(codeGenErr);
      expect(component.currentCode).toBe('');
    });

    it('should wrap non-CodeGenerationError exceptions in a CodeGenerationError', async () => {
      mockCodeGeneratorService.generate.mockImplementation(() => {
        throw new Error('raw failure');
      });

      await component.setActiveTab('R');

      const err = component.errorState();
      expect(err).toBeInstanceOf(CodeGenerationError);
      expect(err!.message).toContain('raw failure');
    });

    it('should clear errorState and show code when switching to a tab that succeeds', async () => {
      mockCodeGeneratorService.generate.mockImplementationOnce(() => { throw new CodeGenerationError('bad', mockConfig); });
      await component.setActiveTab('R');
      expect(component.errorState()).not.toBeNull();

      mockCodeGeneratorService.generate.mockReturnValue('Good SAS code');
      await component.setActiveTab('SAS');
      expect(component.errorState()).toBeNull();
      expect(component.currentCode).toBe('Good SAS code');
    });

    it('should copy a copyable, redacted JSON diagnostics payload replacing sensitive values with explicit redaction markers', async () => {
      const codeGenErr = new CodeGenerationError('Specific failure', mockConfig);
      mockCodeGeneratorService.generate.mockImplementation(() => { throw codeGenErr; });
      await component.setActiveTab('R');

      const clipboardWriteSpy = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: clipboardWriteSpy },
        configurable: true,
        writable: true
      });

      component.copyErrorLog();

      expect(clipboardWriteSpy).toHaveBeenCalled();
      const copiedText = clipboardWriteSpy.mock.calls[0][0];
      const parsed = JSON.parse(copiedText);
      expect(parsed.errorName).toBe('CodeGenerationError');
      expect(parsed.message).toBe('Specific failure');
      expect(parsed.context.seed).toBe('[REDACTED]');
      expect(parsed.context.blockSizes).toBe('[REDACTED]');
      expect(parsed.context.studyName).toBe('Error Test');
    });
  });

  describe('Pocock-Simon Minimization specific behavior', () => {
    let minConfig: RandomizationConfig;

    beforeEach(async () => {
      vi.useFakeTimers();
      minConfig = {
        protocolId: 'MIN-TEST',
        studyName: 'Minimization Study',
        phase: 'Phase II',
        arms: [{ id: '1', name: 'Active', ratio: 1 }],
        sites: ['Site1'],
        strata: [],
        blockSizes: [],
        stratumCaps: [],
        seed: 'min_seed',
        subjectIdMask: '[SiteID]-[001]',
        randomizationMethod: 'MINIMIZATION',
        minimizationConfig: { p: 0.8, totalSampleSize: 100 }
      };
      mockFacade.config.set(minConfig);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should detect minimization and set isMinimization to true', () => {
      expect(component.isMinimization()).toBe(true);
    });

    it('should normalize exportMode to STATIC on initialization for minimization', async () => {
      component.exportMode.set('DYNAMIC');
      await component.ngOnInit();
      expect(component.exportMode()).toBe('STATIC');
    });

    it('should NOT allow switching exportMode away from STATIC when isMinimization is true', async () => {
      await component.ngOnInit();
      expect(component.exportMode()).toBe('STATIC');

      await component.setExportMode('DYNAMIC');
      expect(component.exportMode()).toBe('STATIC');

      await component.setExportMode('BOTH');
      expect(component.exportMode()).toBe('STATIC');
    });

    it('should fall back to STATIC in downloadCode for minimization', async () => {
      component.exportMode.set('DYNAMIC');
      const appendSpy = vi.spyOn(document.body, 'appendChild');
      const removeSpy = vi.spyOn(document.body, 'removeChild');
      globalThis.URL.createObjectURL = vi.fn(() => "mock://url") as unknown as (obj: Blob | MediaSource) => string;
      globalThis.URL.revokeObjectURL = vi.fn() as unknown as (url: string) => void;

      await component.downloadCode();
      expect(component.exportMode()).toBe('STATIC');

      vi.advanceTimersByTime(100);

      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });
  });

  describe('PRNG Sequence Parity Warning Banner Rendering (DOM)', () => {
    let mockConfig: RandomizationConfig;

    beforeEach(async () => {
      mockConfig = {
        protocolId: 'TEST-BANNER',
        studyName: 'Banner Study',
        phase: 'Phase III',
        arms: [
          { id: '1', name: 'Arm A', ratio: 1 },
          { id: '2', name: 'Arm B', ratio: 1 }
        ],
        sites: ['Site1'],
        strata: [],
        blockSizes: [2],
        stratumCaps: [],
        seed: 'banner_seed',
        subjectIdMask: '[SiteID]-[001]'
      };
      mockFacade.config.set(mockConfig);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should render warning banner when activeTab is SAS', async () => {
      component.activeTab.set('SAS');
      fixture.detectChanges();
      const banner = fixture.debugElement.query(By.css('[data-testid="parity-warning-banner"]'));
      expect(banner).not.toBeNull();
      const text = banner.query(By.css('[data-testid="parity-warning-text"]')).nativeElement.textContent;
      expect(text).toContain('SAS script does not guarantee bit-for-bit sequence parity');
    });

    it('should render warning banner when activeTab is STATA', async () => {
      component.activeTab.set('STATA');
      fixture.detectChanges();
      const banner = fixture.debugElement.query(By.css('[data-testid="parity-warning-banner"]'));
      expect(banner).not.toBeNull();
      const text = banner.query(By.css('[data-testid="parity-warning-text"]')).nativeElement.textContent;
      expect(text).toContain('STATA script does not guarantee bit-for-bit sequence parity');
    });

    it('should NOT render warning banner when activeTab is R', async () => {
      component.activeTab.set('R');
      fixture.detectChanges();
      const banner = fixture.debugElement.query(By.css('[data-testid="parity-warning-banner"]'));
      expect(banner).toBeNull();
    });

    it('should NOT render warning banner when activeTab is Python', async () => {
      component.activeTab.set('Python');
      fixture.detectChanges();
      const banner = fixture.debugElement.query(By.css('[data-testid="parity-warning-banner"]'));
      expect(banner).toBeNull();
    });
  });

  describe('Minimization unsupported note and disabled options (DOM)', () => {
    let mockConfig: RandomizationConfig;

    beforeEach(async () => {
      mockConfig = {
        protocolId: 'TEST-BANNER-MIN',
        studyName: 'Banner Study Minimization',
        phase: 'Phase III',
        randomizationMethod: 'MINIMIZATION',
        arms: [
          { id: '1', name: 'Arm A', ratio: 1 },
          { id: '2', name: 'Arm B', ratio: 1 }
        ],
        sites: ['Site1'],
        strata: [],
        blockSizes: [2],
        stratumCaps: [],
        seed: 'banner_seed_min',
        subjectIdMask: '[SiteID]-[001]'
      };
      mockFacade.config.set(mockConfig);
      fixture.detectChanges();
      await fixture.whenStable();
    });

    it('should render minimization unsupported note', async () => {
      const note = fixture.debugElement.query(By.css('[data-testid="minimization-unsupported-note"]'));
      expect(note).not.toBeNull();
      expect(note.nativeElement.textContent).toContain('Dynamic export is not yet available');
    });

    it('should disable Dynamic and Both buttons', async () => {
      const buttons = fixture.debugElement.queryAll(By.css('app-button[variant="segmented"]'));
      // The buttons in nav are: Static, Dynamic, Both (segmented) and R, SAS, Python, Stata (segmented tablist)
      // Dynamic button should be disabled, Both button should be disabled
      const dynamicBtn = buttons.find(b => b.nativeElement.textContent.includes('Dynamic Generator'));
      const bothBtn = buttons.find(b => b.nativeElement.textContent.includes('Both (ZIP Bundle)'));
      const staticBtn = buttons.find(b => b.nativeElement.textContent.includes('Static Manifest'));

      expect(dynamicBtn?.componentInstance.disabled).toBe(true);
      expect(bothBtn?.componentInstance.disabled).toBe(true);
      expect(staticBtn?.componentInstance.disabled).toBe(false);
    });
  });
});
