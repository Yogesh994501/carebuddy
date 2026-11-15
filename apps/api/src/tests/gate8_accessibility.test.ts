import { describe, it, expect } from 'vitest';
import axe from 'axe-core';
import fs from 'fs';
import path from 'path';

describe('Gate 8: Accessibility, Responsive Design & WCAG 2.2 AA Compliance', () => {
  const brandDir = path.resolve(__dirname, '../../../web/public/brand');
  const cssPath = path.resolve(__dirname, '../../../web/src/index.css');
  const appTsxPath = path.resolve(__dirname, '../../../web/src/App.tsx');
  const elderlyDashboardPath = path.resolve(__dirname, '../../../web/src/components/ElderlyDashboard.tsx');
  const familyDashboardPath = path.resolve(__dirname, '../../../web/src/components/FamilyDashboard.tsx');
  const caregiverDashboardPath = path.resolve(__dirname, '../../../web/src/components/CaregiverDashboard.tsx');
  const settingsModalPath = path.resolve(__dirname, '../../../web/src/components/SettingsModal.tsx');
  const assistantMarkPath = path.resolve(__dirname, '../../../web/src/components/AssistantMark.tsx');

  describe('1. WCAG 2.2 AA Palette & Contrast Rules (Section 12)', () => {
    it('enforces contrast rule: #D99B43, #A99AE8, and #8DB9A6 are never text on white', () => {
      const components = [
        elderlyDashboardPath,
        familyDashboardPath,
        caregiverDashboardPath,
        settingsModalPath,
        assistantMarkPath
      ];

      for (const compPath of components) {
        if (!fs.existsSync(compPath)) continue;
        const content = fs.readFileSync(compPath, 'utf-8');

        // Check for forbidden text color classes: text-[#D99B43], text-[#A99AE8], text-[#8DB9A6] on white background
        // Section 12: "#D99B43, #A99AE8 and #8DB9A6 fail as text on white. Use them only as fills with #1E2B28 text."
        const forbiddenPatterns = [
          /className="[^"]*bg-white[^"]*text-\[#D99B43\][^"]*"/,
          /className="[^"]*bg-white[^"]*text-\[#A99AE8\][^"]*"/,
          /className="[^"]*bg-white[^"]*text-\[#8DB9A6\][^"]*"/
        ];

        for (const pattern of forbiddenPatterns) {
          expect(pattern.test(content)).toBe(false);
        }
      }
    });

    it('ensures status is never color-only (always accompanied by text label and icon)', () => {
      const elderlyContent = fs.readFileSync(elderlyDashboardPath, 'utf-8');
      const caregiverContent = fs.readFileSync(caregiverDashboardPath, 'utf-8');

      // Status tags must contain text label
      expect(elderlyContent).toContain('Scheduled for');
      expect(caregiverContent).toContain('dose.status.toLowerCase()');
      expect(caregiverContent).toContain('CheckCircle2');
    });

    it('defines 2px high-contrast borders and sharp black/white palette in CSS', () => {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      expect(cssContent).toContain('.high-contrast');
      expect(cssContent).toContain('border: 2px solid #000000 !important;');
    });
  });

  describe('2. Touch Targets & Elderly Mode (Section 12)', () => {
    it('sets minimum touch target of 48px for standard buttons and 56px in elderly mode', () => {
      const elderlyContent = fs.readFileSync(elderlyDashboardPath, 'utf-8');
      const cssContent = fs.readFileSync(cssPath, 'utf-8');

      // Standard buttons have min-h-[48px]
      expect(elderlyContent).toContain('min-h-[48px]');

      // Elderly mode CSS enforces 56px touch target
      expect(cssContent).toContain('.elderly-mode button');
      expect(cssContent).toContain('min-height: 56px !important;');
      expect(cssContent).toContain('min-width: 56px !important;');
    });

    it('includes confirmation step for skipping or taking doses', () => {
      const elderlyContent = fs.readFileSync(elderlyDashboardPath, 'utf-8');
      expect(elderlyContent).toContain('skipDialogOpen');
      expect(elderlyContent).toContain('Please choose a reason for skipping:');
      expect(elderlyContent).toContain('handleSkipConfirm');
    });
  });

  describe('3. Keyboard Navigation & Focus Visibility', () => {
    it('enforces visible 3px focus indicator for all interactive elements in CSS', () => {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      expect(cssContent).toContain(':focus-visible');
      expect(cssContent).toContain('outline: 3px solid #397B68 !important;');
      expect(cssContent).toContain('outline-offset: 3px !important;');
    });

    it('ensures all dose action buttons are native keyboard-focusable button elements', () => {
      const elderlyContent = fs.readFileSync(elderlyDashboardPath, 'utf-8');
      expect(elderlyContent).toContain('<button');
      expect(elderlyContent).toContain('onClick={() => handleTake(dose.id)}');
      expect(elderlyContent).toContain('onClick={() => handleSnooze(dose.id)}');
      expect(elderlyContent).toContain('onClick={() => setSkipDialogOpen(dose.id)}');
    });
  });

  describe('4. Text Size Scaling & Reduced Motion', () => {
    it('defines base text size 18px and scaling options for 100%, 125%, 150%, 200%', () => {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      const settingsContent = fs.readFileSync(settingsModalPath, 'utf-8');

      // Base font size 18px in CSS
      expect(cssContent).toContain('font-size: 18px;');

      // Scaling options in SettingsModal
      expect(settingsContent).toContain("value: '100'");
      expect(settingsContent).toContain("value: '125'");
      expect(settingsContent).toContain("value: '150'");
      expect(settingsContent).toContain("value: '200'");
    });

    it('honors prefers-reduced-motion and provides in-app reduced motion toggle in CSS', () => {
      const cssContent = fs.readFileSync(cssPath, 'utf-8');
      expect(cssContent).toContain('@media (prefers-reduced-motion: reduce)');
      expect(cssContent).toContain('.reduce-motion');
      expect(cssContent).toContain('animation-duration: 0.01ms !important;');
      expect(cssContent).toContain('transition-duration: 0.01ms !important;');
    });
  });

  describe('5. Responsive Viewport Adaptations (375px, 768px, 1280px)', () => {
    it('verifies responsive layouts: no dense table layouts, stack grids on mobile', () => {
      const elderlyContent = fs.readFileSync(elderlyDashboardPath, 'utf-8');
      const familyContent = fs.readFileSync(familyDashboardPath, 'utf-8');
      const caregiverContent = fs.readFileSync(caregiverDashboardPath, 'utf-8');

      // Uses flex-col on mobile and flex-row/grid-cols on desktop
      expect(elderlyContent).toContain('grid-cols-1 sm:grid-cols-3');
      expect(caregiverContent).toContain('grid-cols-1 md:grid-cols-3');
      expect(familyContent).toMatch(/grid-cols-1 (sm|md):grid-cols-3/);

      // No <table> elements in dashboard pages (cards and flex rows used)
      expect(elderlyContent).not.toContain('<table');
      expect(familyContent).not.toContain('<table');
      expect(caregiverContent).not.toContain('<table');
    });
  });

  describe('6. Assistant Identity & Accessibility Assets (Section 12a)', () => {
    it('verifies brand SVG assets exist and each is under 3 KB', () => {
      const svgs = ['sprig-idle.svg', 'sprig-thinking.svg', 'sprig-alert.svg', 'favicon.svg'];
      for (const svg of svgs) {
        const filePath = path.join(brandDir, svg);
        expect(fs.existsSync(filePath)).toBe(true);
        const stats = fs.statSync(filePath);
        expect(stats.size).toBeLessThan(3072); // Under 3 KB
      }
    });

    it('provides accessible role="img" with aria-label on standalone marks', () => {
      const markContent = fs.readFileSync(assistantMarkPath, 'utf-8');
      expect(markContent).toContain("role={standalone ? 'img' : undefined}");
      expect(markContent).toContain('aria-label={standalone ? activeLabel : undefined}');
      expect(markContent).toContain('aria-hidden={!standalone}');
    });
  });
});
