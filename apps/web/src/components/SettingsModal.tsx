import { AccessibilitySettings } from '../hooks/useAccessibility';
import { Sliders, X, Check, Eye, Zap, Type, Sparkles } from 'lucide-react';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AccessibilitySettings;
  onUpdateSetting: <K extends keyof AccessibilitySettings>(
    key: K,
    value: AccessibilitySettings[K]
  ) => void;
}

export function SettingsModal({
  isOpen,
  onClose,
  settings,
  onUpdateSetting
}: SettingsModalProps) {
  if (!isOpen) return null;

  const textSizes: Array<{ value: AccessibilitySettings['textSize']; label: string }> = [
    { value: '100', label: '100% (Default 18px)' },
    { value: '125', label: '125% (Large 22.5px)' },
    { value: '150', label: '150% (Extra Large 27px)' },
    { value: '200', label: '200% (Maximum 36px)' }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-[#D1DCD6] max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#E7F0EC] text-[#397B68]">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h2 id="settings-title" className="text-xl font-bold text-[#1E2B28]">
                Accessibility &amp; Display
              </h2>
              <p className="text-xs text-gray-600">Tailor CareBuddy to your visual &amp; motor needs</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings dialog"
            className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Settings Form Controls */}
        <div className="space-y-6 overflow-y-auto flex-1 py-4 pr-1">
          {/* 1. Text Size Scaling (100% to 200%) */}
          <div className="space-y-2">
            <label className="text-sm font-bold text-[#1E2B28] flex items-center gap-2">
              <Type className="w-4 h-4 text-[#397B68]" /> Text Size Scaling
            </label>
            <div className="grid grid-cols-2 gap-2">
              {textSizes.map((ts) => (
                <button
                  key={ts.value}
                  type="button"
                  onClick={() => onUpdateSetting('textSize', ts.value)}
                  className={`p-3 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                    settings.textSize === ts.value
                      ? 'border-[#397B68] bg-[#E7F0EC] text-[#397B68] ring-2 ring-[#397B68]'
                      : 'border-gray-300 hover:bg-gray-50 text-gray-700'
                  }`}
                >
                  <span>{ts.label}</span>
                  {settings.textSize === ts.value && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Simplified Elderly Mode */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#F6F8F5] border border-gray-200">
            <div className="space-y-0.5 max-w-[80%]">
              <span className="text-sm font-bold text-[#1E2B28] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#D99B43]" /> Simplified Elderly Mode
              </span>
              <p className="text-xs text-gray-600 leading-normal">
                Enlarges all touch targets to 56px, emphasizes primary dose action, and requires confirmation.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.elderlyMode}
                onChange={(e) => onUpdateSetting('elderlyMode', e.target.checked)}
                className="sr-only peer"
                aria-label="Toggle Simplified Elderly Mode"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#397B68]"></div>
            </label>
          </div>

          {/* 3. High-Contrast Mode */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#F6F8F5] border border-gray-200">
            <div className="space-y-0.5 max-w-[80%]">
              <span className="text-sm font-bold text-[#1E2B28] flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-[#397B68]" /> High Contrast Theme
              </span>
              <p className="text-xs text-gray-600 leading-normal">
                Enforces maximum black-on-white text contrast and sharp 2px outlines for low-vision readability.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => onUpdateSetting('highContrast', e.target.checked)}
                className="sr-only peer"
                aria-label="Toggle High Contrast Theme"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#397B68]"></div>
            </label>
          </div>

          {/* 4. Reduced Motion */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#F6F8F5] border border-gray-200">
            <div className="space-y-0.5 max-w-[80%]">
              <span className="text-sm font-bold text-[#1E2B28] flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-[#A99AE8]" /> Reduced Motion
              </span>
              <p className="text-xs text-gray-600 leading-normal">
                Disables all animated transitions and continuous swaying or breathing effects.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.reducedMotion}
                onChange={(e) => onUpdateSetting('reducedMotion', e.target.checked)}
                className="sr-only peer"
                aria-label="Toggle Reduced Motion"
              />
              <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#397B68]"></div>
            </label>
          </div>
        </div>

        {/* Done Button */}
        <div className="pt-4 border-t border-gray-100 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3.5 px-4 rounded-xl bg-[#397B68] text-white font-bold text-sm hover:bg-[#2b6051] transition-all shadow-md focus:ring-4 focus:ring-[#8DB9A6]"
          >
            Save &amp; Apply Preferences
          </button>
        </div>
      </div>
    </div>
  );
}
