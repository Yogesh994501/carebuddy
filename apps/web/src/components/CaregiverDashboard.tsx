import { useState } from 'react';
import { AssistantMark } from './AssistantMark';
import { Pill, CheckCircle2, Calendar, FileText, Flag, Send } from 'lucide-react';

export interface CaregiverDoseItem {
  id: string;
  medicationName: string;
  dosage: string;
  localTime: string;
  status: 'PENDING' | 'SNOOZED' | 'TAKEN' | 'SKIPPED' | 'MISSED';
  snoozeCount: number;
}

export interface CaregiverDashboardProps {
  elderlyName: string;
  doses: CaregiverDoseItem[];
  appointments: Array<{
    id: string;
    doctor: string;
    clinic: string;
    localDate: string;
    localTime: string;
    status: string;
  }>;
  onRecordDose: (doseId: string, state: 'TAKEN' | 'SNOOZED' | 'SKIPPED', reason?: string) => Promise<void>;
  onCreateNote: (note: string, isFlagged: boolean) => Promise<void>;
  onRescheduleAppointment?: (id: string, date: string, time: string) => Promise<void>;
  isRealTimeConnected?: boolean;
}

export function CaregiverDashboard({
  elderlyName,
  doses,
  appointments,
  onRecordDose,
  onCreateNote,
  onRescheduleAppointment,
  isRealTimeConnected = true
}: CaregiverDashboardProps) {
  const [newNote, setNewNote] = useState('');
  const [isFlagged, setIsFlagged] = useState(false);
  const [submittingNote, setSubmittingNote] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const handleNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSubmittingNote(true);
    try {
      await onCreateNote(newNote.trim(), isFlagged);
      setNewNote('');
      setIsFlagged(false);
    } finally {
      setSubmittingNote(false);
    }
  };

  const handleDoseAction = async (doseId: string, state: 'TAKEN' | 'SNOOZED' | 'SKIPPED') => {
    setActionLoadingId(doseId);
    try {
      await onRecordDose(doseId, state);
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-[#D1DCD6] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E7F0EC] text-[#397B68]">
              Caregiver Active Portal
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${isRealTimeConnected ? 'bg-green-500' : 'bg-amber-400'}`} />
              {isRealTimeConnected ? 'Live Synchronized' : 'Offline Mode'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-[#1E2B28]">{elderlyName} &mdash; Care Management</h2>
          <p className="text-sm text-gray-600">
            Record administrations, log vital caregiver observations, and monitor appointment schedules.
          </p>
        </div>

        <AssistantMark state="idle" size={52} label="CareBuddy Assistant" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Dose Administration (2 spans) */}
        <div className="md:col-span-2 space-y-6">
          {/* Dose Administration List */}
          <section className="bg-white rounded-2xl p-6 border border-[#D1DCD6] shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg text-[#1E2B28] flex items-center gap-2">
                <Pill className="w-5 h-5 text-[#397B68]" /> Dose Administration
              </h3>
              <span className="text-xs text-gray-500">{doses.length} total today</span>
            </div>

            {doses.length === 0 ? (
              <p className="text-sm text-gray-500 py-6 text-center">No doses scheduled for today.</p>
            ) : (
              <div className="space-y-3">
                {doses.map((dose) => (
                  <div
                    key={dose.id}
                    className="p-4 rounded-xl border border-gray-200 bg-[#F6F8F5] flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#1E2B28]">{dose.medicationName}</span>
                        <span className="text-xs font-medium text-gray-600">({dose.dosage})</span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded capitalize ${
                            dose.status === 'TAKEN'
                              ? 'bg-green-100 text-green-800'
                              : dose.status === 'MISSED'
                              ? 'bg-red-100 text-red-800'
                              : dose.status === 'SNOOZED'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {dose.status.toLowerCase()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Scheduled for: {dose.localTime}</p>
                    </div>

                    {/* Action buttons if not already acted */}
                    {(dose.status === 'PENDING' || dose.status === 'SNOOZED') && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={actionLoadingId === dose.id}
                          onClick={() => handleDoseAction(dose.id, 'TAKEN')}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#397B68] text-white hover:bg-[#2b6051] transition-all flex items-center gap-1 shadow-sm"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Taken
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === dose.id || dose.snoozeCount >= 3}
                          onClick={() => handleDoseAction(dose.id, 'SNOOZED')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                        >
                          Snooze
                        </button>
                        <button
                          type="button"
                          disabled={actionLoadingId === dose.id}
                          onClick={() => handleDoseAction(dose.id, 'SKIPPED')}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-gray-300 text-gray-500 hover:bg-gray-50"
                        >
                          Skip
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Quick Caregiver Note Composer */}
          <section className="bg-white rounded-2xl p-6 border border-[#D1DCD6] shadow-sm space-y-4">
            <h3 className="font-bold text-lg text-[#1E2B28] flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#397B68]" /> Add Caregiver Observation
            </h3>

            <form onSubmit={handleNoteSubmit} className="space-y-3">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Record vital signs, mood, appetite, or clinical notes..."
                rows={3}
                className="w-full p-3 rounded-xl border border-gray-300 text-sm focus:ring-2 focus:ring-[#397B68] focus:border-transparent outline-none"
              />

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={isFlagged}
                    onChange={(e) => setIsFlagged(e.target.checked)}
                    className="w-4 h-4 text-[#D99B43] rounded focus:ring-[#D99B43]"
                  />
                  <span className="flex items-center gap-1">
                    <Flag className="w-3.5 h-3.5 text-[#D99B43]" /> Flag as important for family/doctor
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submittingNote || !newNote.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#397B68] text-white hover:bg-[#2b6051] transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" /> Save Note
                </button>
              </div>
            </form>
          </section>
        </div>

        {/* Right Column: Appointments & Schedule (1 span) */}
        <div className="space-y-6">
          <section className="bg-white rounded-2xl p-6 border border-[#D1DCD6] shadow-sm space-y-4">
            <h3 className="font-bold text-lg text-[#1E2B28] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#D99B43]" /> Medical Calendar
            </h3>

            {appointments.length === 0 ? (
              <p className="text-xs text-gray-500 py-4 text-center">No appointments.</p>
            ) : (
              <div className="space-y-3">
                {appointments.map((apt) => (
                  <div key={apt.id} className="p-3 rounded-xl border border-gray-200 bg-[#F6F8F5] space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs text-[#1E2B28]">{apt.doctor}</p>
                      <span className="text-[10px] font-semibold text-[#397B68] bg-white px-2 py-0.5 rounded border border-[#D1DCD6]">
                        {apt.localTime}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-600">{apt.clinic} &bull; {apt.localDate}</p>
                    {onRescheduleAppointment && (
                      <button
                        type="button"
                        onClick={() => onRescheduleAppointment(apt.id, apt.localDate, apt.localTime)}
                        className="text-[10px] text-[#397B68] font-semibold hover:underline"
                      >
                        Reschedule
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
