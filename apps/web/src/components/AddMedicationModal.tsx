import { useState } from 'react';
import { Pill, Plus, X, Clock, Check, ShieldCheck, AlertCircle } from 'lucide-react';

export interface NewMedicationData {
  name: string;
  strength: string;
  dosage: string;
  timeOfDay: string;
  foodInstructions: string;
  instructions: string;
  confirmedPrescription: boolean;
}

export interface AddMedicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMedication: (data: NewMedicationData) => Promise<void>;
  isOwnerOrPrimaryDelegate: boolean;
  activeRole: 'elderly' | 'family' | 'caregiver';
}

export function AddMedicationModal({
  isOpen,
  onClose,
  onAddMedication,
  isOwnerOrPrimaryDelegate,
  activeRole
}: AddMedicationModalProps) {
  const [name, setName] = useState('');
  const [strength, setStrength] = useState('10 mg');
  const [dosage, setDosage] = useState('1 Tablet');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [foodInstructions, setFoodInstructions] = useState('Take with or without food');
  const [instructions, setInstructions] = useState('Take daily with water');
  const [confirmed, setConfirmed] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwnerOrPrimaryDelegate) return;
    if (!name.trim()) {
      setError('Medication name is required.');
      return;
    }
    if (!confirmed) {
      setError('You must confirm prescription directions.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onAddMedication({
        name: name.trim(),
        strength: strength.trim(),
        dosage: dosage.trim(),
        timeOfDay,
        foodInstructions,
        instructions,
        confirmedPrescription: confirmed
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add medication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-med-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-[#D1DCD6] max-h-[90vh] flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#E7F0EC] text-[#397B68]">
              <Pill className="w-6 h-6" />
            </div>
            <div>
              <h2 id="add-med-title" className="text-xl font-bold text-[#1E2B28]">
                Add New Medication
              </h2>
              <p className="text-xs text-gray-600">Prescription schedule &amp; automated dose generation</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close add medication dialog"
            className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Permission Check Warning (Gate 5 RBAC) */}
        {!isOwnerOrPrimaryDelegate ? (
          <div className="py-6 space-y-4 flex-1">
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>Permission Restricted (Gate 5 RBAC)</span>
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                You are currently viewing as <strong>{activeRole === 'family' ? 'Family Member (Priya)' : 'Caregiver Nurse (Anita)'}</strong>.
                Under CareBuddy safety rules, only the <strong>Elderly Owner (Ramesh Patel)</strong> or a designated Primary Delegate can prescribe or add new medications.
              </p>
              <p className="text-xs text-amber-700">
                To add a medication, please switch to the <strong>Elderly View</strong> or request Primary Delegate authorization.
              </p>
            </div>
            <div className="pt-4">
              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 py-4 pr-1">
            {error && (
              <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs font-semibold border border-red-200">
                {error}
              </div>
            )}

            {/* Medicine Name */}
            <div className="space-y-1">
              <label htmlFor="med-name" className="text-xs font-bold text-[#1E2B28]">
                Medication Name *
              </label>
              <input
                id="med-name"
                type="text"
                required
                placeholder="e.g. Lisinopril, Metformin, Vitamin D3"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#397B68]"
              />
            </div>

            {/* Strength and Dosage */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="med-strength" className="text-xs font-bold text-[#1E2B28]">
                  Strength *
                </label>
                <input
                  id="med-strength"
                  type="text"
                  required
                  placeholder="e.g. 10 mg, 500 mg"
                  value={strength}
                  onChange={(e) => setStrength(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#397B68]"
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="med-dosage" className="text-xs font-bold text-[#1E2B28]">
                  Form / Unit *
                </label>
                <input
                  id="med-dosage"
                  type="text"
                  required
                  placeholder="e.g. 1 Tablet, 2 Capsules"
                  value={dosage}
                  onChange={(e) => setDosage(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#397B68]"
                />
              </div>
            </div>

            {/* Schedule Time */}
            <div className="space-y-1">
              <label htmlFor="med-time" className="text-xs font-bold text-[#1E2B28] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-[#397B68]" /> Dose Time *
              </label>
              <input
                id="med-time"
                type="time"
                required
                value={timeOfDay}
                onChange={(e) => setTimeOfDay(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#397B68]"
              />
              <p className="text-[11px] text-gray-500">Scheduled in local timezone (Asia/Kolkata)</p>
            </div>

            {/* Food Instructions */}
            <div className="space-y-1">
              <label htmlFor="med-food" className="text-xs font-bold text-[#1E2B28]">
                Food Instructions
              </label>
              <select
                id="med-food"
                value={foodInstructions}
                onChange={(e) => setFoodInstructions(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#397B68]"
              >
                <option value="Take with or without food">Take with or without food</option>
                <option value="Must be taken with food">Must be taken with food</option>
                <option value="Take on an empty stomach">Take on an empty stomach</option>
                <option value="Take 30 minutes before meal">Take 30 minutes before meal</option>
              </select>
            </div>

            {/* Clinical Directions */}
            <div className="space-y-1">
              <label htmlFor="med-instructions" className="text-xs font-bold text-[#1E2B28]">
                Instructions / Notes
              </label>
              <input
                id="med-instructions"
                type="text"
                placeholder="e.g. Swallow whole with full glass of water"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#397B68]"
              />
            </div>

            {/* Safety Confirmation Checkbox */}
            <div className="p-3 bg-[#F6F8F5] rounded-xl border border-gray-200 flex items-start gap-2.5">
              <input
                id="med-confirmed"
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-0.5 rounded text-[#397B68] focus:ring-[#397B68]"
              />
              <label htmlFor="med-confirmed" className="text-xs text-gray-700 leading-normal cursor-pointer">
                <strong>Prescription verification:</strong> I confirm that these directions match the physician's prescription or the medication package label.
              </label>
            </div>

            {/* Submit Action */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-xl bg-[#397B68] text-white font-bold text-sm hover:bg-[#2b6051] transition-all shadow-md focus:ring-4 focus:ring-[#8DB9A6] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <span>Saving medication...</span>
                ) : (
                  <>
                    <Plus className="w-4 h-4" /> Add &amp; Schedule Medication
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
