import { useState, useEffect } from 'react';

export interface AccessibilitySettings {
  textSize: '100' | '125' | '150' | '200';
  elderlyMode: boolean;
  highContrast: boolean;
  reducedMotion: boolean;
}

const STORAGE_KEY = 'carebuddy_accessibility_settings';

export function useAccessibility() {
  const [settings, setSettings] = useState<AccessibilitySettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return {
      textSize: '100',
      elderlyMode: false,
      highContrast: false,
      reducedMotion: prefersReducedMotion
    };
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {}

    const root = document.documentElement;

    // 1. Text scaling
    root.classList.remove('text-size-100', 'text-size-125', 'text-size-150', 'text-size-200');
    root.classList.add(`text-size-${settings.textSize}`);

    // Set root font size scale
    if (settings.textSize === '100') root.style.fontSize = '18px';
    else if (settings.textSize === '125') root.style.fontSize = '22.5px';
    else if (settings.textSize === '150') root.style.fontSize = '27px';
    else if (settings.textSize === '200') root.style.fontSize = '36px';

    // 2. High contrast mode
    if (settings.highContrast) {
      root.classList.add('high-contrast');
    } else {
      root.classList.remove('high-contrast');
    }

    // 3. Simplified Elderly mode
    if (settings.elderlyMode) {
      root.classList.add('elderly-mode');
    } else {
      root.classList.remove('elderly-mode');
    }

    // 4. Reduced motion
    if (settings.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [settings]);

  const updateSetting = <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));

    // Sync to backend settings API in background
    fetch('/api/settings', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-carebuddy-request': '1'
      },
      body: JSON.stringify({ [key]: value })
    }).catch(() => {});
  };

  return {
    settings,
    updateSetting,
    setSettings
  };
}
