import { useState } from 'react';
import { AssistantMark } from './components/AssistantMark';
import { ElderlyDashboard, DoseItem } from './components/ElderlyDashboard';
import { FamilyDashboard } from './components/FamilyDashboard';
import { CaregiverDashboard, CaregiverDoseItem } from './components/CaregiverDashboard';
import { ShieldCheck, UserCheck, Users, Stethoscope } from 'lucide-react';
import { useRealTimeSSE } from './hooks/useRealTimeSSE';

export function App() {
  const [activeTab, setActiveTab] = useState<'elderly' | 'family' | 'caregiver'>('elderly');
  const demoProfileId = 'demo-profile-rose-01';

  // Real-time SSE hook (listens to /api/profiles/:profileId/events and refetches via REST)
  const { isConnected } = useRealTimeSSE(demoProfileId);

  // Sample interactive state demonstrating live synchronized reactivity
  const [doses, setDoses] = useState<DoseItem[]>([
    {
      id: 'dose-1',
      medicationName: 'Lisinopril',
      dosage: '10mg',
      localTime: '09:00',
      status: 'PENDING',
      instructions: 'Take 1 tablet daily with water',
      foodInstructions: 'Take with or without food',
      snoozeCount: 0
    },
    {
      id: 'dose-2',
      medicationName: 'Metformin',
      dosage: '500mg',
      localTime: '13:00',
      status: 'PENDING',
      instructions: 'Take 1 tablet with meal',
      foodInstructions: 'Must be taken with food',
      snoozeCount: 0
    },
    {
      id: 'dose-3',
      medicationName: 'Atorvastatin',
      dosage: '20mg',
      localTime: '20:00',
      status: 'PENDING',
      instructions: 'Take 1 tablet in evening',
      snoozeCount: 0
    }
  ]);

  const [appointments, setAppointments] = useState([
    {
      id: 'apt-1',
      doctor: 'Dr. Sarah Connor',
      clinic: 'Heart Care Center',
      localDate: '2026-11-20',
      localTime: '10:30',
      reason: 'Routine quarterly cardiology checkup',
      status: 'SCHEDULED'
    }
  ]);

  const [activity, setActivity] = useState([
    {
      id: 'act-1',
      type: 'CARE_NETWORK',
      title: 'Care Network Active',
      description: 'Family and caregivers connected to Martha’s care network.',
      timestamp: new Date().toISOString()
    }
  ]);

  const handleTakeDose = async (doseId: string) => {
    setDoses((prev) =>
      prev.map((d) => (d.id === doseId ? { ...d, status: 'TAKEN' } : d))
    );
    setActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        type: 'DOSE',
        title: 'Medication Taken',
        description: `Dose recorded as taken.`,
        timestamp: new Date().toISOString()
      },
      ...prev
    ]);
  };

  const handleSnoozeDose = async (doseId: string) => {
    setDoses((prev) =>
      prev.map((d) =>
        d.id === doseId
          ? { ...d, status: 'SNOOZED', snoozeCount: d.snoozeCount + 1 }
          : d
      )
    );
  };

  const handleSkipDose = async (doseId: string, reason: string) => {
    setDoses((prev) =>
      prev.map((d) => (d.id === doseId ? { ...d, status: 'SKIPPED' } : d))
    );
    setActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        type: 'DOSE',
        title: 'Dose Skipped',
        description: `Reason: ${reason}`,
        timestamp: new Date().toISOString()
      },
      ...prev
    ]);
  };

  const handleCreateNote = async (note: string, isFlagged: boolean) => {
    setActivity((prev) => [
      {
        id: `note-${Date.now()}`,
        type: 'NOTE',
        title: isFlagged ? 'Important Caregiver Note' : 'Caregiver Note Added',
        description: note,
        actorName: 'Nurse John',
        timestamp: new Date().toISOString()
      },
      ...prev
    ]);
  };

  const handleRescheduleAppointment = async (id: string, date: string, time: string) => {
    setAppointments((prev) =>
      prev.map((apt) => (apt.id === id ? { ...apt, localDate: date, localTime: time } : apt))
    );
    setActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        type: 'APPOINTMENT',
        title: 'Appointment Rescheduled',
        description: `Rescheduled to ${date} at ${time}`,
        timestamp: new Date().toISOString()
      },
      ...prev
    ]);
  };

  const takenCount = doses.filter((d) => d.status === 'TAKEN').length;
  const adherenceRate = Math.round((takenCount / doses.length) * 100);

  return (
    <div className="min-h-screen bg-[#F6F8F5] text-[#1E2B28] flex flex-col">
      {/* Top Navigation */}
      <header className="bg-white border-b border-[#D1DCD6] px-6 py-3.5 flex items-center justify-between shadow-sm sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <AssistantMark state="idle" size={40} label="CareBuddy Sprig" />
          <div>
            <h1 className="text-xl font-bold tracking-tight text-[#1E2B28]">CareBuddy</h1>
            <p className="text-[11px] text-[#397B68] font-semibold">Elderly Care & Medication Companion</p>
          </div>
        </div>

        {/* Role Dashboard Switcher */}
        <div className="flex items-center p-1 bg-[#F6F8F5] rounded-xl border border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab('elderly')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'elderly'
              ? 'bg-[#397B68] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            <UserCheck className="w-3.5 h-3.5" /> Elderly View
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('family')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'family'
              ? 'bg-[#397B68] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            <Users className="w-3.5 h-3.5" /> Family View
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('caregiver')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeTab === 'caregiver'
              ? 'bg-[#397B68] text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
              }`}
          >
            <Stethoscope className="w-3.5 h-3.5" /> Caregiver View
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E7F0EC] text-[#397B68]">
            <ShieldCheck className="w-3.5 h-3.5" /> Secure HIPAA/Auth
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-6">
        {activeTab === 'elderly' && (
          <ElderlyDashboard
            elderlyName="Grandma Martha"
            doses={doses}
            nextAppointment={appointments[0]}
            onTakeDose={handleTakeDose}
            onSnoozeDose={handleSnoozeDose}
            onSkipDose={handleSkipDose}
            isRealTimeConnected={isConnected}
          />
        )}

        {activeTab === 'family' && (
          <FamilyDashboard
            elderlyName="Martha Stewart"
            adherence={{
              rate: adherenceRate,
              takenCount,
              skippedCount: doses.filter((d) => d.status === 'SKIPPED').length,
              missedCount: doses.filter((d) => d.status === 'MISSED').length,
              totalScheduled: doses.length,
              statusText: `${takenCount} of ${doses.length} doses taken today`
            }}
            upcomingAppointments={appointments}
            recentActivity={activity}
            unreadNotificationCount={1}
            isRealTimeConnected={isConnected}
          />
        )}

        {activeTab === 'caregiver' && (
          <CaregiverDashboard
            elderlyName="Martha Stewart"
            doses={doses as CaregiverDoseItem[]}
            appointments={appointments}
            onRecordDose={async (id, state) => {
              if (state === 'TAKEN') await handleTakeDose(id);
              else if (state === 'SNOOZED') await handleSnoozeDose(id);
              else await handleSkipDose(id, 'Administered by Caregiver');
            }}
            onCreateNote={handleCreateNote}
            onRescheduleAppointment={handleRescheduleAppointment}
            isRealTimeConnected={isConnected}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-[#D1DCD6] py-3 px-6 text-center text-xs text-gray-500">
        CareBuddy Platform &copy; 2026 &mdash; Built with React 18, TanStack Query, Express &amp; PostgreSQL.
      </footer>
    </div>
  );
}

export default App;
