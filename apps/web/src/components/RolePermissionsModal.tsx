import { useState } from 'react';
import { ShieldCheck, UserCheck, Users, Stethoscope, Check, X, Lock, AlertCircle, Info, Sparkles } from 'lucide-react';

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
  const [familyPermissions, setFamilyPermissions] = useState<Record<string, boolean>>({
    viewMedications: true,
    recordDoses: false,
    manageMedications: false,
    viewAdherence: true,
    addNotes: false,
    manageAppointments: false,
    aiConsent: false,
    manageNetwork: false
  });

  const [caregiverPermissions, setCaregiverPermissions] = useState<Record<string, boolean>>({
    viewMedications: true,
    recordDoses: true,
    manageMedications: false,
    viewAdherence: true,
    addNotes: true,
    manageAppointments: true,
    aiConsent: false,
    manageNetwork: false
  });

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const isOwner = activeRole === 'elderly';

  const togglePermission = (roleType: 'family' | 'caregiver', permKey: string, permName: string) => {
    if (!isOwner) {
      setToastMessage('Only the Elderly Owner (Ramesh Patel) can allot or revoke permissions.');
      setTimeout(() => setToastMessage(null), 3500);
      return;
    }

    if (roleType === 'family') {
      const nextVal = !familyPermissions[permKey];
      setFamilyPermissions((prev) => ({ ...prev, [permKey]: nextVal }));
      setToastMessage(`${nextVal ? 'Granted' : 'Revoked'} "${permName}" for Family Members.`);
    } else {
      const nextVal = !caregiverPermissions[permKey];
      setCaregiverPermissions((prev) => ({ ...prev, [permKey]: nextVal }));
      setToastMessage(`${nextVal ? 'Granted' : 'Revoked'} "${permName}" for Caregivers.`);
    }
    setTimeout(() => setToastMessage(null), 3000);
  };

  const permissionsList = [
    {
      key: 'viewMedications',
      name: 'View Medication List & Schedules',
      description: 'See all active prescription names, dosages, and food instructions'
    },
    {
      key: 'recordDoses',
      name: 'Take / Record Doses',
      description: 'Mark doses as TAKEN, SNOOZED, or SKIPPED with clinical reason'
    },
    {
      key: 'manageMedications',
      name: 'Manage Medications (Add / Edit / Prescribe)',
      description: 'Add new prescriptions and adjust daily dosage schedules'
    },
    {
      key: 'viewAdherence',
      name: 'View Adherence Analytics & Trends',
      description: 'Access 7-day and 30-day percentage adherence and missed dose counts'
    },
    {
      key: 'addNotes',
      name: 'Add Clinical & Caregiver Shift Notes',
      description: 'Record observation logs, shift summaries, and flag vital alerts'
    },
    {
      key: 'manageAppointments',
      name: 'Manage Doctor Appointments',
      description: 'Schedule, reschedule, or cancel consultations with clinicians'
    },
    {
      key: 'aiConsent',
      name: 'AI Record Consent (DPDP Act)',
      description: 'Authorize Sprig AI Assistant to access medical records'
    },
    {
      key: 'manageNetwork',
      name: 'Invite & Manage Care Network',
      description: 'Generate invitation codes and grant/revoke access for members'
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
                Role Permissions Manager (Gate 5 RBAC)
              </h2>
              <p className="text-xs text-gray-600">
                Grant or restrict operations for each member in your care circle
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

        {/* Informative Explanation Banner */}
        <div className="py-3 px-4 my-2 rounded-2xl bg-[#F6F8F5] border border-gray-200 text-xs text-gray-700 space-y-1 shrink-0">
          <p className="font-bold text-[#1E2B28] flex items-center gap-1.5">
            <Info className="w-4 h-4 text-[#397B68]" /> Who assigns permissions?
          </p>
          <p className="text-[11px] leading-relaxed">
            By default, CareBuddy initializes clinical safety presets (e.g. family cannot alter prescriptions to prevent accidental overdoses).
            As the <strong>Elderly Owner (Ramesh Patel)</strong>, you can <strong>click any switch below to grant or revoke</strong> permissions for family and caregivers.
          </p>
        </div>

        {/* Feedback Toast */}
        {toastMessage && (
          <div className="p-2.5 rounded-xl bg-[#E7F0EC] text-[#397B68] text-xs font-bold border border-[#8DB9A6] flex items-center gap-2 shrink-0 animate-fade-in">
            <Check className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Role Perspective Switcher */}
        <div className="pt-2 pb-1 shrink-0">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Currently Viewing &amp; Editing As:
            </label>
            {!isOwner && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-3 h-3" /> Read-Only (Switch to Elderly View to edit)
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onSelectRole('elderly')}
              className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col gap-0.5 ${
                activeRole === 'elderly'
                  ? 'border-[#397B68] bg-[#E7F0EC] text-[#1E2B28] ring-2 ring-[#397B68]'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#397B68]">
                <UserCheck className="w-3.5 h-3.5" /> Elderly (Owner)
              </div>
              <p className="text-[10px] text-gray-500 leading-tight">Ramesh Patel (Sovereign)</p>
            </button>

            <button
              type="button"
              onClick={() => onSelectRole('family')}
              className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col gap-0.5 ${
                activeRole === 'family'
                  ? 'border-[#397B68] bg-[#E7F0EC] text-[#1E2B28] ring-2 ring-[#397B68]'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#397B68]">
                <Users className="w-3.5 h-3.5" /> Family Member
              </div>
              <p className="text-[10px] text-gray-500 leading-tight">Priya Patel (Daughter)</p>
            </button>

            <button
              type="button"
              onClick={() => onSelectRole('caregiver')}
              className={`p-2.5 rounded-2xl border text-left transition-all flex flex-col gap-0.5 ${
                activeRole === 'caregiver'
                  ? 'border-[#397B68] bg-[#E7F0EC] text-[#1E2B28] ring-2 ring-[#397B68]'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs text-[#397B68]">
                <Stethoscope className="w-3.5 h-3.5" /> Caregiver Nurse
              </div>
              <p className="text-[10px] text-gray-500 leading-tight">Anita Sharma, RN</p>
            </button>
          </div>
        </div>

        {/* Matrix Table with Interactive Toggles */}
        <div className="overflow-y-auto flex-1 py-2 pr-1">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500 font-bold sticky top-0 bg-white z-10">
                <th className="py-2 pr-2">Permission / Operation</th>
                <th className="py-2 px-2 text-center">Elderly Owner</th>
                <th className="py-2 px-2 text-center">Family (Priya)</th>
                <th className="py-2 px-2 text-center">Caregiver (Anita)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {permissionsList.map((item) => {
                const familyAllowed = familyPermissions[item.key] ?? false;
                const caregiverAllowed = caregiverPermissions[item.key] ?? false;

                return (
                  <tr key={item.key} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 pr-2">
                      <p className="font-bold text-[#1E2B28]">{item.name}</p>
                      <p className="text-[11px] text-gray-500">{item.description}</p>
                    </td>

                    {/* Owner Column: Always has all sovereign permissions */}
                    <td className="py-3 px-2 text-center">
                      <span className="inline-flex items-center justify-center w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full" title="Owner Sovereignty">
                        <Check className="w-4 h-4" />
                      </span>
                    </td>

                    {/* Family Column: Interactive Toggle */}
                    <td className="py-3 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => togglePermission('family', item.key, item.name)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                          familyAllowed
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        } ${!isOwner ? 'cursor-not-allowed opacity-80' : 'cursor-pointer shadow-xs'}`}
                        title={isOwner ? `Click to ${familyAllowed ? 'revoke' : 'grant'} for Family` : 'Owner only'}
                      >
                        {familyAllowed ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" /> Allowed
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3 text-amber-700" /> Locked
                          </>
                        )}
                      </button>
                    </td>

                    {/* Caregiver Column: Interactive Toggle */}
                    <td className="py-3 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => togglePermission('caregiver', item.key, item.name)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
                          caregiverAllowed
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                        } ${!isOwner ? 'cursor-not-allowed opacity-80' : 'cursor-pointer shadow-xs'}`}
                        title={isOwner ? `Click to ${caregiverAllowed ? 'revoke' : 'grant'} for Caregiver` : 'Owner only'}
                      >
                        {caregiverAllowed ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-700" /> Allowed
                          </>
                        ) : (
                          <>
                            <Lock className="w-3 h-3 text-amber-700" /> Locked
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {isOwner
              ? '💡 Tip: Click any "Allowed" or "Locked" badge to toggle permissions in real time.'
              : 'Switch to Elderly View to allot or revoke permissions.'}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-[#397B68] text-white font-bold text-xs hover:bg-[#2b6051] transition-all shadow-sm"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
