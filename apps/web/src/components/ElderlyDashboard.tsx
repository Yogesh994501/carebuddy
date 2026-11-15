import { useState } from 'react';
import { AssistantMark } from './AssistantMark';
import { CheckCircle2, Clock, Calendar, AlertCircle } from 'lucide-react';

export interface DoseItem {
  id: string;
  medicationName: string;
  dosage: string;
  localTime: string;
  status: 'PENDING' | 'SNOOZED' | 'TAKEN' | 'SKIPPED' | 'MISSED';
  instructions?: string;
  foodInstructions?: string;
  snoozeCount: number;
}

export interface AppointmentItem {
  id: string;
  doctor: string;
  clinic: string;
  localDate: string;
  localTime: string;
}

export interface ElderlyDashboardProps {
  elderlyName: string;
  doses: DoseItem[];
  nextAppointment?: AppointmentItem;
  onTakeDose: (doseId: string) => Promise<void>;
  onSnoozeDose: (doseId: string) => Promise<void>;
  onSkipDose: (doseId: string, reason: string) => Promise<void>;
  isRealTimeConnected?: boolean;
}

export function ElderlyDashboard({
  elderlyName,
  doses,
  nextAppointment,
  onTakeDose,
  onSnoozeDose,
  onSkipDose,
  isRealTimeConnected = true
}: ElderlyDashboardProps) {
  const [skipDialogOpen, setSkipDialogOpen] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState<string>('Doctor advised');
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const pendingDoses = doses.filter((d) => d.status === 'PENDING' || d.status === 'SNOOZED');
  const completedDoses = doses.filter((d) => d.status === 'TAKEN' || d.status === 'SKIPPED' || d.status === 'MISSED');

  const sprigState = pendingDoses.some((d) => d.status === 'PENDING') ? 'alert' : 'idle';

  const handleTake = async (id: string) => {
    setSubmittingId(id);
    try {
      await onTakeDose(id);
    } finally {
      setSubmittingId(null);
    }
  };

  const handleSnooze = async (id: string) => {
    setSubmittingId(id);
    try {
      await onSnoozeDose(id);
    } finally {
      setSubmittingId(null);
    }
  };

  const handleSkipConfirm = async (id: string) => {
    setSubmittingId(id);
    try {
      await onSkipDose(id, skipReason);
      setSkipDialogOpen(null);
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Top Greeting Card */}
      <section className="bg-white rounded-3xl p-6 border-2 border-[#D1DCD6] shadow-sm flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-[#397B68]">Welcome back</p>
          <h2 className="text-3xl font-extrabold text-[#1E2B28] tracking-tight">{elderlyName}</h2>
          <p className="text-base text-gray-600">
            {pendingDoses.length === 0
              ? 'You have taken all your scheduled medications for now.'
              : `You have ${pendingDoses.length} dose${pendingDoses.length > 1 ? 's' : ''} to take today.`}
          </p>
        </div>
        <div className="flex-shrink-0">
          <AssistantMark state={sprigState} size={64} label="Sprig Companion" />
        </div>
      </section>

      {/* Due / Upcoming Medications */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold text-[#1E2B28] flex items-center gap-2">
          <Clock className="w-6 h-6 text-[#397B68]" /> Today's Medications
        </h3>

        {pendingDoses.length === 0 ? (
          <div className="bg-[#E7F0EC] p-6 rounded-2xl border border-[#8DB9A6] text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-[#397B68] mx-auto" />
            <h4 className="text-lg font-bold text-[#1E2B28]">All clear!</h4>
            <p className="text-sm text-gray-700">No pending doses right now. Relax and have a lovely day.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingDoses.map((dose) => (
              <div
                key={dose.id}
                className="bg-white p-6 rounded-2xl border-2 border-[#397B68] shadow-md space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-bold bg-[#E7F0EC] text-[#397B68] mb-2">
                      Scheduled for {dose.localTime}
                    </span>
                    <h4 className="text-2xl font-black text-[#1E2B28]">{dose.medicationName}</h4>
                    <p className="text-base font-semibold text-gray-700 mt-0.5">{dose.dosage}</p>
                    {dose.foodInstructions && (
                      <p className="text-xs font-medium text-[#397B68] mt-1 bg-[#F6F8F5] px-2.5 py-1 rounded-md inline-block">
                        {dose.foodInstructions}
                      </p>
                    )}
                  </div>
                  {dose.status === 'SNOOZED' && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FEF4E8] text-[#D99B43] flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Snoozed ({dose.snoozeCount}/3)
                    </span>
                  )}
                </div>

                {/* Big Action Buttons (Touch targets >= 48px) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <button
                    type="button"
                    disabled={submittingId === dose.id}
                    onClick={() => handleTake(dose.id)}
                    className="min-h-[48px] py-3 px-4 rounded-xl font-bold text-base bg-[#397B68] text-white hover:bg-[#2b6051] active:scale-[0.98] transition-all shadow-sm flex items-center justify-center gap-2 focus:ring-4 focus:ring-[#8DB9A6]"
                  >
                    <CheckCircle2 className="w-5 h-5" /> Take Now
                  </button>

                  <button
                    type="button"
                    disabled={submittingId === dose.id || dose.snoozeCount >= 3}
                    onClick={() => handleSnooze(dose.id)}
                    className="min-h-[48px] py-3 px-4 rounded-xl font-bold text-sm bg-white text-[#1E2B28] border-2 border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 focus:ring-4 focus:ring-gray-200"
                  >
                    <Clock className="w-4 h-4 text-[#D99B43]" />
                    {dose.snoozeCount >= 3 ? 'Max Snoozed' : 'Snooze 10m'}
                  </button>

                  <button
                    type="button"
                    disabled={submittingId === dose.id}
                    onClick={() => setSkipDialogOpen(dose.id)}
                    className="min-h-[48px] py-3 px-4 rounded-xl font-bold text-sm bg-white text-gray-600 border-2 border-gray-200 hover:bg-gray-50 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5 focus:ring-4 focus:ring-gray-200"
                  >
                    Skip
                  </button>
                </div>

                {/* Inline Skip Dialog */}
                {skipDialogOpen === dose.id && (
                  <div className="p-4 bg-[#F6F8F5] rounded-xl border border-gray-300 space-y-3">
                    <p className="text-xs font-bold text-gray-700">Please choose a reason for skipping:</p>
                    <div className="flex flex-wrap gap-2">
                      {['Doctor advised', 'Felt unwell', 'Ran out of medicine', 'Other'].map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          onClick={() => setSkipReason(reason)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                            skipReason === reason
                              ? 'bg-[#397B68] text-white border-[#397B68]'
                              : 'bg-white text-gray-700 border-gray-300'
                          }`}
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        type="button"
                        onClick={() => setSkipDialogOpen(null)}
                        className="px-3 py-1.5 text-xs font-bold text-gray-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSkipConfirm(dose.id)}
                        className="px-4 py-1.5 text-xs font-bold bg-red-600 text-white rounded-lg hover:bg-red-700"
                      >
                        Confirm Skip
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Next Appointment Card */}
      {nextAppointment && (
        <section className="bg-white rounded-2xl p-5 border border-[#D1DCD6] shadow-sm flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#FEF4E8] text-[#D99B43] flex items-center justify-center flex-shrink-0 font-bold">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-bold text-[#D99B43] uppercase tracking-wide">Next Appointment</span>
            <h4 className="text-lg font-bold text-[#1E2B28]">{nextAppointment.doctor}</h4>
            <p className="text-xs text-gray-600">{nextAppointment.clinic}</p>
            <p className="text-xs font-semibold text-[#397B68] mt-1">
              {nextAppointment.localDate} at {nextAppointment.localTime}
            </p>
          </div>
        </section>
      )}

      {/* Completed Doses Feed */}
      {completedDoses.length > 0 && (
        <section className="space-y-2">
          <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider">Earlier Today</h4>
          <div className="space-y-2">
            {completedDoses.map((dose) => (
              <div
                key={dose.id}
                className="bg-white p-3.5 rounded-xl border border-gray-200 flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-3">
                  {dose.status === 'TAKEN' ? (
                    <CheckCircle2 className="w-5 h-5 text-[#397B68]" />
                  ) : dose.status === 'SKIPPED' ? (
                    <AlertCircle className="w-5 h-5 text-gray-400" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-500" />
                  )}
                  <div>
                    <p className="font-bold text-[#1E2B28]">{dose.medicationName} ({dose.dosage})</p>
                    <p className="text-xs text-gray-500">Scheduled: {dose.localTime}</p>
                  </div>
                </div>
                <span
                  className={`text-xs font-bold px-2.5 py-1 rounded-md capitalize ${
                    dose.status === 'TAKEN'
                      ? 'bg-[#E7F0EC] text-[#397B68]'
                      : dose.status === 'SKIPPED'
                      ? 'bg-gray-100 text-gray-600'
                      : 'bg-red-50 text-red-600'
                  }`}
                >
                  {dose.status.toLowerCase()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Live sync pill */}
      <footer className="text-center text-xs text-gray-500 flex items-center justify-center gap-1.5 pt-2">
        <span className={`w-2 h-2 rounded-full ${isRealTimeConnected ? 'bg-green-500' : 'bg-amber-400'}`} />
        {isRealTimeConnected ? 'Connected & synchronized live' : 'Offline / Polling mode'}
      </footer>
    </div>
  );
}
