import { useState } from 'react';
import { AssistantMark } from './components/AssistantMark';
import { ElderlyDashboard, DoseItem } from './components/ElderlyDashboard';
import { FamilyDashboard } from './components/FamilyDashboard';
import { CaregiverDashboard, CaregiverDoseItem } from './components/CaregiverDashboard';
import { AssistantChat } from './components/AssistantChat';
import { SettingsModal } from './components/SettingsModal';
import { AddMedicationModal, NewMedicationData } from './components/AddMedicationModal';
import { RolePermissionsModal } from './components/RolePermissionsModal';
import { ShieldCheck, UserCheck, Users, Stethoscope, Sliders, RefreshCw, Sparkles, Plus, Pill, Lock } from 'lucide-react';
import { useRealTimeSSE } from './hooks/useRealTimeSSE';
import { useAccessibility } from './hooks/useAccessibility';

export function App() {
  const [activeTab, setActiveTab] = useState<'elderly' | 'family' | 'caregiver'>('elderly');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAddMedOpen, setIsAddMedOpen] = useState(false);
  const [isPermissionsOpen, setIsPermissionsOpen] = useState(false);
  const [isResettingDemo, setIsResettingDemo] = useState(false);
  const [demoResetMessage, setDemoResetMessage] = useState<string | null>(null);
  const { settings, updateSetting } = useAccessibility();
  const demoProfileId = 'demo-profile-rose-01';

  const handleResetDemo = async () => {
    setIsResettingDemo(true);
    setDemoResetMessage(null);
    try {
      const res = await fetch('/api/demo/reset', {
        method: 'POST',
        headers: { 'x-carebuddy-request': '1' }
      });
      if (res.ok) {
        setDemoResetMessage('Demo data reset successfully!');
        setTimeout(() => setDemoResetMessage(null), 4000);
      }
    } catch (e) {
      // Local fallback in case dev server isn't proxying
      setDemoResetMessage('Demo reset triggered.');
      setTimeout(() => setDemoResetMessage(null), 3000);
    } finally {
      setIsResettingDemo(false);
    }
  };

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

  const handleAddMedication = async (data: NewMedicationData) => {
    const newDoseId = `dose-${Date.now()}`;
    const newDose: DoseItem = {
      id: newDoseId,
      medicationName: data.name,
      dosage: `${data.strength} (${data.dosage})`,
      localTime: data.timeOfDay,
      status: 'PENDING',
      instructions: data.instructions,
      foodInstructions: data.foodInstructions,
      snoozeCount: 0
    };

    setDoses((prev) => [newDose, ...prev]);

    setActivity((prev) => [
      {
        id: `act-${Date.now()}`,
        type: 'MEDICATION_ADDED',
        title: `Medication Prescribed: ${data.name}`,
        description: `${data.dosage} scheduled for ${data.timeOfDay} daily. Directions: ${data.instructions}`,
        timestamp: new Date().toISOString()
      },
      ...prev
    ]);

    // Also persist to backend API in background
    fetch(`/api/profiles/${demoProfileId}/medications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-carebuddy-request': '1'
      },
      body: JSON.stringify({
        name: data.name,
        strength: data.strength,
        dosage: data.dosage,
        medicineType: 'TABLET',
        instructions: data.instructions,
        foodInstructions: data.foodInstructions,
        confirmedPrescriptionSource: true,
        frequency: 'ONCE_DAILY',
        timesOfDay: [data.timeOfDay],
        startDate: new Date().toISOString().split('T')[0]
      })
    }).catch(() => {});

    setDemoResetMessage(`Added ${data.name} (${data.strength}) scheduled for ${data.timeOfDay}!`);
    setTimeout(() => setDemoResetMessage(null), 4000);
  };

  const takenCount = doses.filter((d) => d.status === 'TAKEN').length;
  const adherenceRate = Math.round((takenCount / doses.length) * 100);

  return (
    <div className="min-h-screen bg-[#F6F8F5] text-[#1E2B28] flex flex-col">
      {/* Demo Mode Top Banner */}
      <div className="bg-[#1E2B28] text-white px-4 py-2 text-xs flex flex-wrap items-center justify-between gap-2 border-b border-[#397B68]">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-full bg-[#397B68] text-white font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-[#D99B43]" /> Demo Mode
          </span>
          <span className="text-gray-300">
            Fictional Profile: <strong className="text-white">Ramesh Patel (72yo)</strong> &bull; Asia/Kolkata
          </span>
        </div>
        <div className="flex items-center gap-3">
          {demoResetMessage && (
            <span className="text-[#8DB9A6] font-semibold">{demoResetMessage}</span>
          )}
          <button
            type="button"
            onClick={handleResetDemo}
            disabled={isResettingDemo}
            className="px-2.5 py-1 rounded-lg bg-[#2E3F3B] hover:bg-[#397B68] text-white text-[11px] font-semibold transition-colors flex items-center gap-1 border border-gray-600 disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isResettingDemo ? 'animate-spin' : ''}`} />
            {isResettingDemo ? 'Resetting...' : 'Reset Demo Data'}
          </button>
        </div>
      </div>

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

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPermissionsOpen(true)}
            aria-label="View Gate 5 Role-Based Permissions Matrix"
            className="p-2 rounded-xl text-gray-600 hover:text-[#1E2B28] hover:bg-[#F6F8F5] border border-gray-200 transition-colors flex items-center gap-1.5 text-xs font-bold"
          >
            <ShieldCheck className="w-4 h-4 text-[#397B68]" />
            <span className="hidden md:inline">Permissions</span>
          </button>
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open Display and Accessibility Settings"
            className="p-2 rounded-xl text-gray-600 hover:text-[#1E2B28] hover:bg-[#F6F8F5] border border-gray-200 transition-colors flex items-center gap-1.5 text-xs font-bold"
          >
            <Sliders className="w-4 h-4 text-[#397B68]" />
            <span className="hidden md:inline">Accessibility</span>
          </button>
          <div className="hidden sm:flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[#E7F0EC] text-[#397B68]">
              <ShieldCheck className="w-3.5 h-3.5" /> Secure HIPAA/Auth
            </span>
          </div>
        </div>
      </header>

      {/* Role Context & Permission Indicator Banner */}
      <div className="bg-[#E7F0EC] border-b border-[#D1DCD6] px-6 py-2.5">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-extrabold text-[#1E2B28] flex items-center gap-1.5">
              {activeTab === 'elderly' && (
                <>
                  <UserCheck className="w-4 h-4 text-[#397B68]" /> Viewing as: Ramesh Patel (Elderly Owner)
                </>
              )}
              {activeTab === 'family' && (
                <>
                  <Users className="w-4 h-4 text-[#397B68]" /> Viewing as: Priya Patel (Family Member)
                </>
              )}
              {activeTab === 'caregiver' && (
                <>
                  <Stethoscope className="w-4 h-4 text-[#397B68]" /> Viewing as: Anita Sharma, RN (Caregiver Nurse)
                </>
              )}
            </span>
            <span className="text-gray-400 hidden sm:inline">&bull;</span>
            <span className="text-gray-700">
              {activeTab === 'elderly' && 'Full Sovereignty: Can prescribe/add medications, take doses, manage network.'}
              {activeTab === 'family' && 'Read-Only Oversight: Adherence analytics, vitals & care timeline (medication changes restricted).'}
              {activeTab === 'caregiver' && 'Clinical Administration: Record assisted doses & shift notes (prescribing restricted to Owner).'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeTab === 'elderly' ? (
              <button
                type="button"
                onClick={() => setIsAddMedOpen(true)}
                className="px-3 py-1 rounded-lg bg-[#397B68] text-white font-bold text-xs hover:bg-[#2b6051] transition-all flex items-center gap-1 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" /> Add Medication
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsAddMedOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-gray-200 text-gray-700 font-semibold text-xs hover:bg-gray-300 transition-colors flex items-center gap-1"
                title="Prescription restricted by Gate 5 RBAC"
              >
                <Lock className="w-3 h-3 text-gray-600" /> Add Medication
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsPermissionsOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-white border border-gray-300 text-gray-700 font-semibold text-xs hover:bg-gray-50 transition-colors flex items-center gap-1"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-[#397B68]" /> Permissions Matrix
            </button>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl mx-auto w-full p-6">
        {activeTab === 'elderly' && (
          <ElderlyDashboard
            elderlyName="Ramesh Patel"
            doses={doses}
            nextAppointment={appointments[0]}
            onTakeDose={handleTakeDose}
            onSnoozeDose={handleSnoozeDose}
            onSkipDose={handleSkipDose}
            onOpenAddMedication={() => setIsAddMedOpen(true)}
            isRealTimeConnected={isConnected}
          />
        )}

        {activeTab === 'family' && (
          <FamilyDashboard
            elderlyName="Ramesh Patel"
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
            elderlyName="Ramesh Patel"
            doses={doses as CaregiverDoseItem[]}
            appointments={appointments}
            onRecordDose={async (id, state) => {
              if (state === 'TAKEN') await handleTakeDose(id);
              else if (state === 'SNOOZED') await handleSnoozeDose(id);
              else await handleSkipDose(id, 'Administered by Caregiver');
            }}
            onCreateNote={handleCreateNote}
            onRescheduleAppointment={handleRescheduleAppointment}
            onOpenAddMedication={() => setIsAddMedOpen(true)}
            isRealTimeConnected={isConnected}
          />
        )}
      </main>

      {/* Floating Sprig Assistant Button (56px) */}
      <button
        type="button"
        onClick={() => setIsChatOpen(true)}
        aria-label="Open Sprig Care Assistant"
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#397B68] text-white shadow-xl hover:bg-[#2e6253] hover:scale-105 active:scale-95 transition-all flex items-center justify-center z-40 focus:outline-none focus:ring-4 focus:ring-[#8DB9A6]"
      >
        <AssistantMark state="idle" size={38} />
      </button>

      {/* Sprig Assistant Chat Drawer */}
      <AssistantChat
        profileId={demoProfileId}
        elderlyFirstName="Ramesh"
        isOwner={activeTab === 'elderly'}
        initialConsentGranted={true}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />

      {/* Add Medication Modal */}
      <AddMedicationModal
        isOpen={isAddMedOpen}
        onClose={() => setIsAddMedOpen(false)}
        onAddMedication={handleAddMedication}
        isOwnerOrPrimaryDelegate={activeTab === 'elderly'}
        activeRole={activeTab}
      />

      {/* Role-Based Permissions Matrix Modal */}
      <RolePermissionsModal
        isOpen={isPermissionsOpen}
        onClose={() => setIsPermissionsOpen(false)}
        activeRole={activeTab}
        onSelectRole={(role) => setActiveTab(role)}
      />

      {/* Accessibility & Display Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSetting={updateSetting}
      />

      {/* Footer */}
      <footer className="bg-white border-t border-[#D1DCD6] py-3 px-6 text-center text-xs text-gray-500">
        CareBuddy Platform &copy; 2026 &mdash; Built with React 18, TanStack Query, Express &amp; PostgreSQL.
      </footer>
    </div>
  );
}

export default App;
