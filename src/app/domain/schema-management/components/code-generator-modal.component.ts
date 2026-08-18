import { Component, signal, computed, inject, OnInit, ChangeDetectionStrategy, HostListener } from '@angular/core';
import { JsonPipe } from '@angular/common';
import { ButtonComponent } from '@core/components/ui/button.component';
import { RandomizationEngineFacade } from '@domain/randomization-engine/randomization-engine.facade';
import { CodeGeneratorService } from '../services/code-generator.service';
import { CodeGenerationError } from '../errors/code-generation-errors';
import { RandomizationResult } from '@domain/core/models/randomization.model';
import { FocusManagerDirective } from '@core/directives/focus-manager.directive';
import { AppTooltipDirective } from '@core/directives/tooltip.directive';
import { AnnouncementService } from '@core/services/announcement.service';
import { ThemeService } from '@core/services/theme.service';
import { SanitizingLogger } from '@core/utils/sanitizing-logger.util';

/**
 * ⚡ Bolt Performance Optimization:
 * Added ChangeDetectionStrategy.OnPush to minimize unnecessary re-renders.
 */
@Component({
  selector: 'app-code-generator-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [JsonPipe, FocusManagerDirective, ButtonComponent, AppTooltipDirective],
  templateUrl: './code-generator-modal.component.html'
})
export class CodeGeneratorModalComponent implements OnInit {
  public state = inject(RandomizationEngineFacade);
  private codeGenService = inject(CodeGeneratorService);
  private announcementService = inject(AnnouncementService);
  public domainTheme = inject(ThemeService);

  activeTab = signal<'R' | 'SAS' | 'Python' | 'STATA'>('R');
  exportMode = signal<'STATIC' | 'DYNAMIC' | 'BOTH'>('STATIC');
  copied = signal(false);
  errorState = signal<CodeGenerationError | null>(null);
  generatedCode = signal<string>('');

  isMinimization = computed(() => this.state.config()?.randomizationMethod === 'MINIMIZATION');

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.state.closeCodeGenerator();
  }

  async ngOnInit() {
    this.activeTab.set(this.state.codeLanguage());
    if (this.isMinimization() && this.exportMode() !== 'STATIC') {
      this.exportMode.set('STATIC');
      this.announcementService.announce(
        'Dynamic export is not yet available for Pocock-Simon minimization. Automatically falling back to Static Manifest.',
        'polite'
      );
    }
    await this.refreshCode();
  }

  get currentCode(): string {
    return this.generatedCode();
  }

  async setActiveTab(tab: 'R' | 'SAS' | 'Python' | 'STATA') {
    this.activeTab.set(tab);
    await this.refreshCode();
  }

  async setExportMode(mode: 'STATIC' | 'DYNAMIC' | 'BOTH') {
    if (this.isMinimization() && mode !== 'STATIC') {
      return;
    }
    this.exportMode.set(mode);
    await this.refreshCode();
  }

  private async refreshCode() {
    const config = this.state.config();
    this.errorState.set(null);
    if (!config) {
      this.generatedCode.set('');
      return;
    }
    if (this.isMinimization() && this.exportMode() !== 'STATIC') {
      this.exportMode.set('STATIC');
      this.announcementService.announce(
        'Dynamic export is not yet available for Pocock-Simon minimization. Automatically falling back to Static Manifest.',
        'polite'
      );
    }
    try {
      let metadata: RandomizationResult['metadata'];
      const currentResults = this.state.results();
      if (currentResults && currentResults.metadata.config.seed === config.seed) {
        metadata = currentResults.metadata;
      } else {
        const result = await this.state.generateSchemaAsync(config);
        metadata = result.metadata;
      }

      let code = '';
      if (this.exportMode() === 'BOTH') {
        // Pre-generate and cache/verify both outputs before enabling downloads!
        const staticCode = this.codeGenService.generateStatic(this.activeTab(), config, metadata);
        this.codeGenService.generateDynamic(this.activeTab(), config, metadata);

        code = `/* BOTH MODES SELECTED (ZIP BUNDLE) */\n\n`;
        code += `/* You have selected to export both the Static Data Manifest and the Dynamic Algorithmic Generator. */\n`;
        code += `/* Click the "Download ZIP" button at the top right to download the ZIP file containing both scripts. */\n\n`;
        code += `/* Preview of Static Manifest below: */\n`;
        code += `/* -------------------------------------------------- */\n\n`;
        code += staticCode;
      } else {
        if (this.exportMode() === 'STATIC') {
          code = this.codeGenService.generate(this.activeTab(), config, metadata);
        } else {
          code = this.codeGenService.generate(this.activeTab(), config, metadata, 'DYNAMIC');
        }
      }
      this.generatedCode.set(code);
    } catch (e) {
      SanitizingLogger.error('Error generating code:', e);
      if (e instanceof CodeGenerationError) {
        this.errorState.set(e);
      } else {
        // Wrap unexpected errors in a generic CodeGenerationError so the UI can display them.
        const causeMessage = e instanceof Error
          ? `${e.name}: ${e.message}`
          : String(e);
        const wrapped = new CodeGenerationError(
          `An unexpected error occurred during code generation. ${causeMessage}`,
          config
        );
        this.errorState.set(wrapped);
      }
      this.generatedCode.set('');
    }
  }

  onTabKeydown(event: KeyboardEvent) {
    const tabs: ('R' | 'SAS' | 'Python' | 'STATA')[] = ['R', 'SAS', 'Python', 'STATA'];
    const target = event.target as HTMLElement;
    
    let currentFocusedIndex = tabs.findIndex(t => 'tab-' + t === target.id);
    if (currentFocusedIndex === -1) {
      currentFocusedIndex = tabs.indexOf(this.activeTab());
    }

    let newIndex = currentFocusedIndex;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      newIndex = (currentFocusedIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      newIndex = (currentFocusedIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
      newIndex = 0;
    } else if (event.key === 'End') {
      newIndex = tabs.length - 1;
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.setActiveTab(tabs[currentFocusedIndex]);
      return;
    } else {
      return;
    }

    event.preventDefault();
    // Set focus to the new tab button
    setTimeout(() => {
      const btn = document.getElementById('tab-' + tabs[newIndex]);
      if (btn) btn.focus();
    }, 0);
  }

  copyCode() {
    navigator.clipboard.writeText(this.currentCode);
    this.copied.set(true);
    this.announcementService.announce('Copied to clipboard!', 'polite');
    setTimeout(() => this.copied.set(false), 2000);
  }

  copyErrorLog() {
    const err = this.errorState();
    if (!err) return;
    const payload = {
      errorName: err.name,
      message: err.message,
      context: err.context
    };
    navigator.clipboard.writeText(SanitizingLogger.copyRedactedPayload(payload));
    this.announcementService.announce('Copied error log to clipboard!', 'polite');
  }

  async downloadCode() {
    // Abort if errorState is set or configuration is missing
    if (this.errorState()) return;

    const config = this.state.config();
    if (!config) return;

    if (this.isMinimization()) {
      this.exportMode.set('STATIC');
    }

    const tab = this.activeTab();
    const extension = tab === 'R' ? 'R' : tab === 'SAS' ? 'sas' : tab === 'STATA' ? 'do' : 'py';

    let metadata: RandomizationResult['metadata'] | undefined;
    const currentResults = this.state.results();
    if (currentResults && currentResults.metadata.config.seed === config.seed) {
      metadata = currentResults.metadata;
    }

    try {
      const { ZipWriter } = await import('@core/utils/zip.util');
      const {
        generateTestDataCsv,
        generateCompanionTestFile,
        MT19937_R,
        MT19937_SAS,
        MT19937_DO
      } = await import('../utils/companion-package.util');
      const { generateRandomizationSchema } = await import('@domain/randomization-engine/core/randomization-algorithm');

      const zip = new ZipWriter();
      const encoder = new TextEncoder();

      // 1. Generate core schema to get subject assignments for the CSV
      const schemaResult = generateRandomizationSchema(config);

      // 2. Add primary scripts based on export mode
      if (this.exportMode() === 'BOTH') {
        const staticCode = this.codeGenService.generateStatic(tab, config, metadata);
        const dynamicCode = this.codeGenService.generateDynamic(tab, config, metadata);
        zip.addFile(`randomization_schema_static.${extension}`, encoder.encode(staticCode));
        zip.addFile(`randomization_schema_dynamic.${extension}`, encoder.encode(dynamicCode));
      } else if (this.exportMode() === 'STATIC') {
        const staticCode = this.currentCode;
        if (!staticCode) return;
        zip.addFile(`randomization_schema.${extension}`, encoder.encode(staticCode));
      } else {
        const dynamicCode = this.currentCode;
        if (!dynamicCode) return;
        zip.addFile(`randomization_schema_dynamic.${extension}`, encoder.encode(dynamicCode));
      }

      // 3. Add companion test file
      const testCode = generateCompanionTestFile(tab, config);
      zip.addFile(`test_randomization.${extension}`, encoder.encode(testCode));

      // 4. Add test_data.csv containing 100 mock trial assignments
      const csvContent = generateTestDataCsv(config, schemaResult.schema);
      zip.addFile(`test_data.csv`, encoder.encode(csvContent));

      // 5. Add MT19937 runtimes as dependencies
      if (tab === 'R') {
        zip.addFile(`mt19937_v1.0.0.r`, encoder.encode(MT19937_R));
      } else if (tab === 'SAS') {
        zip.addFile(`mt19937_v1.0.0.sas`, encoder.encode(MT19937_SAS));
      } else if (tab === 'STATA') {
        zip.addFile(`mt19937_v1.0.0.do`, encoder.encode(MT19937_DO));
      }

      const zipBytes = await zip.generateAsync();
      const blob = new Blob([zipBytes as any], { type: 'application/zip' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);

      let zipFilename = 'randomization_schema_bundle.zip';
      if (this.exportMode() === 'STATIC') {
        zipFilename = 'randomization_schema.zip';
      } else if (this.exportMode() === 'DYNAMIC') {
        zipFilename = 'randomization_schema_dynamic.zip';
      }
      link.setAttribute('download', zipFilename);

      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }, 100);
    } catch (e) {
      SanitizingLogger.error('Error downloading code:', e);
    }
  }
}
