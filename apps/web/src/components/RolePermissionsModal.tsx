import { ShieldCheck, UserCheck, Users, Stethoscope, Check, X, Lock } from 'lucide-react';

export interface RolePermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeRole: 'elderly' | 'family' | 'caregiver';
  onSelectRole: (role: 'elderly' | 'family' | 'caregiver') => void;
}

export function RolePermissionsModal({
  isOpen,
  onClose,
  activeRole,
  onSelectRole
}: RolePermissionsModalProps) {
  if (!isOpen) return null;

  const permissionsMatrix = [
    {
      name: 'View Medication List & Details',
      key: 'viewMedications',
      elderly: true,
      family: true,
      caregiver: true,
      description: 'See all active prescription names, dosages, and food instructions'
    },
    {
      name: 'Record / Take Doses',
      key: 'recordDoses',
      elderly: true,
      family: false,
      caregiver: true,
      description: 'Mark doses as TAKEN, SNOOZED, or SKIPPED with clinical reason'
    },
    {
      name: 'Manage Medications (Add / Edit / Discontinue)',
      key: 'manageMedications',
      elderly: true,
      family: false,
      caregiver: false,
      description: 'Prescription authority restricted to Owner or Primary Delegate'
    },
    {
      name: 'View Adherence Analytics & Trends',
      key: 'viewAdherence',
      elderly: true,
      family: true,
      caregiver: true,
      description: 'View 7-day and 30-day percentage adherence statistics'
    },
    {
      name: 'Add Clinical & Caregiver Shift Notes',
      key: 'addNotes',
      elderly: true,
      family: false,
      caregiver: true,
      description: 'Record notes, observations, and flag urgent concerns'
    },
    {
      name: 'Manage Doctor Appointments',
      key: 'manageAppointments',
      elderly: true,
      family: false,
      caregiver: true,
      description: 'Schedule, reschedule, or cancel clinical consultations'
    },
    {
      name: 'AI Record-Sharing Consent (DPDP Act)',
      key: 'aiConsent',
      elderly: true,
      family: false,
      caregiver: false,
      description: 'Grant or revoke permission for Sprig Assistant to access medical records'
    },
    {
      name: 'Manage Care Network & Invitations',
      key: 'manageNetwork',
      elderly: true,
      family: false,
      caregiver: false,
      description: 'Invite new family/caregivers and edit access permissions'
    }
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-[#D1DCD6] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#E7F0EC] text-[#397B68]">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 id="role-modal-title" className="text-xl font-bold text-[#1E2B28]">
                Role-Based Permissions Matrix (Gate 5 RBAC)
              </h2>
              <p className="text-xs text-gray-600">
                HIPAA &amp; DPDP Compliant Access Control for Care Networks
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close role permissions dialog"
            className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Role Selector Tabs */}
        <div className="pt-4 pb-2 shrink-0">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block mb-2">
            Active Role Perspective (Switch to test permissions):
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onSelectRole('elderly')}
              className={`p-3 rounded-2xl border text-left transition-all flex flex-col gap-1 ${
                activeRole === 'elderly'
                  ? 'border-[#397B68] bg-[#E7F0EC] text-[#1E2B28] ring-2 ring-[#397B68]'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#397B68]">
                <UserCheck className="w-4 h-4" /> Elderly (Owner)
              </div>
              <p className="text-[11px] text-gray-500 leading-tight">Ramesh Patel (72yo)</p>
            </button>

            <button
              type="button"
              onClick={() => onSelectRole('family')}
              className={`p-3 rounded-2xl border text-left transition-all flex flex-col gap-1 ${
                activeRole === 'family'
                  ? 'border-[#397B68] bg-[#E7F0EC] text-[#1E2B28] ring-2 ring-[#397B68]'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#397B68]">
                <Users className="w-4 h-4" /> Family Member
              </div>
              <p className="text-[11px] text-gray-500 leading-tight">Priya Patel (Daughter)</p>
            </button>

            <button
              type="button"
              onClick={() => onSelectRole('caregiver')}
              className={`p-3 rounded-2xl border text-left transition-all flex flex-col gap-1 ${
                activeRole === 'caregiver'
                  ? 'border-[#397B68] bg-[#E7F0EC] text-[#1E2B28] ring-2 ring-[#397B68]'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#397B68]">
                <Stethoscope className="w-4 h-4" /> Caregiver Nurse
              </div>
              <p className="text-[11px] text-gray-500 leading-tight">Anita Sharma, RN</p>
            </button>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-y-auto flex-1 py-3 pr-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-bold">
                <th className="py-2.5 pr-2">Operation / Capability</th>
                <th className="py-2.5 px-2 text-center">Elderly Owner</th>
                <th className="py-2.5 px-2 text-center">Family</th>
                <th className="py-2.5 px-2 text-center">Caregiver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {permissionsMatrix.map((item) => (
                <tr key={item.key} className="hover:bg-gray-50">
                  <td className="py-3 pr-2">
                    <p className="font-bold text-[#1E2B28]">{item.name}</p>
                    <p className="text-[11px] text-gray-500">{item.description}</p>
                  </td>
                  <td className="py-3 px-2 text-center">
                    {item.elderly ? (
                      <span className="inline-flex p-1 bg-green-100 text-green-700 rounded-full">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="inline-flex p-1 bg-gray-100 text-gray-400 rounded-full">
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-center">
                    {item.family ? (
                      <span className="inline-flex p-1 bg-green-100 text-green-700 rounded-full">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="inline-flex p-1 bg-amber-100 text-amber-700 rounded-full" title="Restricted for Family">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-2 text-center">
                    {item.caregiver ? (
                      <span className="inline-flex p-1 bg-green-100 text-green-700 rounded-full">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="inline-flex p-1 bg-amber-100 text-amber-700 rounded-full" title="Restricted for Caregiver">
                        <Lock className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            Current view active: <strong>{activeRole.toUpperCase()}</strong>
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-[#397B68] text-white font-bold text-xs hover:bg-[#2b6051] transition-all shadow-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
