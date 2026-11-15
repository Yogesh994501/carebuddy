import { useState } from 'react';
import { AssistantMark } from './components/AssistantMark';
import { ShieldCheck, Heart, Clock, Bell } from 'lucide-react';

export function App() {
  const [assistantState, setAssistantState] = useState<'idle' | 'thinking' | 'alert'>('idle');

  return (
    <div className="min-h-screen bg-[#F6F8F5] text-[#1E2B28] flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-[#D1DCD6] px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <AssistantMark state={assistantState} size={44} label="CareBuddy Sprig" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#1E2B28]">CareBuddy</h1>
            <p className="text-xs text-[#397B68] font-medium">Elderly Care & Medication Companion</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E7F0EC] text-[#397B68]">
            <ShieldCheck className="w-3.5 h-3.5" /> Secure Platform
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-6 space-y-6">
        {/* Welcome Card */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-[#D1DCD6] space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#1E2B28]">Welcome to CareBuddy</h2>
              <p className="text-sm text-gray-600 mt-1">
                Calm, accessible elderly care and medication management. You are always in control of your health data.
              </p>
            </div>
          </div>

          {/* Interactive Sprig Preview */}
          <div className="p-4 bg-[#F6F8F5] rounded-xl border border-[#D1DCD6] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <AssistantMark state={assistantState} size={56} label="Sprig Assistant Avatar" />
              <div>
                <p className="font-semibold text-[#1E2B28]">Sprig the CareBuddy Assistant</p>
                <p className="text-xs text-gray-500">
                  Current state: <span className="font-medium text-[#397B68] capitalize">{assistantState}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAssistantState('idle')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  assistantState === 'idle'
                    ? 'bg-[#397B68] text-white border-[#397B68]'
                    : 'bg-white text-[#1E2B28] border-gray-300 hover:bg-gray-50'
                }`}
              >
                Idle
              </button>
              <button
                type="button"
                onClick={() => setAssistantState('thinking')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  assistantState === 'thinking'
                    ? 'bg-[#397B68] text-white border-[#397B68]'
                    : 'bg-white text-[#1E2B28] border-gray-300 hover:bg-gray-50'
                }`}
              >
                Thinking
              </button>
              <button
                type="button"
                onClick={() => setAssistantState('alert')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  assistantState === 'alert'
                    ? 'bg-[#D99B43] text-white border-[#D99B43]'
                    : 'bg-white text-[#1E2B28] border-gray-300 hover:bg-gray-50'
                }`}
              >
                Alert
              </button>
            </div>
          </div>
        </section>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-[#D1DCD6] shadow-sm space-y-2">
            <div className="w-9 h-9 rounded-lg bg-[#E7F0EC] text-[#397B68] flex items-center justify-center font-bold">
              <Heart className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-[#1E2B28]">Elderly Centred</h3>
            <p className="text-xs text-gray-600">
              Profiles belong to the elderly individual, with complete control over family and caregiver access.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-[#D1DCD6] shadow-sm space-y-2">
            <div className="w-9 h-9 rounded-lg bg-[#FEF4E8] text-[#D99B43] flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-[#1E2B28]">Accurate Schedules</h3>
            <p className="text-xs text-gray-600">
              Luxon-powered timezone and DST-safe dose generation with deterministic schedules.
            </p>
          </div>

          <div className="bg-white p-5 rounded-xl border border-[#D1DCD6] shadow-sm space-y-2">
            <div className="w-9 h-9 rounded-lg bg-[#F0EDFB] text-[#A99AE8] flex items-center justify-center font-bold">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="font-bold text-[#1E2B28]">In-App Alerts</h3>
            <p className="text-xs text-gray-600">
              Timely reminders and notifications across synchronized real-time web dashboards.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#D1DCD6] py-4 px-6 text-center text-xs text-gray-500">
        CareBuddy Platform &copy; 2026 &mdash; Built with React, TypeScript, Tailwind, Express &amp; PostgreSQL.
      </footer>
    </div>
  );
}

export default App;
