import { useState } from 'react';
import { Users, UserPlus, X, ShieldCheck, Check, Copy, AlertCircle, Key, Heart } from 'lucide-react';

export interface CareMember {
  id: string;
  name: string;
  role: 'OWNER' | 'FAMILY' | 'CAREGIVER';
  relationship: string;
  email: string;
}

export interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: CareMember[];
  onAddMember: (member: CareMember) => void;
  isOwner: boolean;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  members,
  onAddMember,
  isOwner
}: InviteMemberModalProps) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<'FAMILY' | 'CAREGIVER'>('FAMILY');
  const [relationship, setRelationship] = useState('Son');
  const [email, setEmail] = useState('');
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  if (!isOpen) return null;

  const handleGenerateInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Generate 10-char unambiguous CareBuddy invitation code
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = 'CB-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    code += '-';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];

    setGeneratedCode(code);

    const newMember: CareMember = {
      id: `member-${Date.now()}`,
      name: name.trim(),
      role,
      relationship: relationship.trim() || (role === 'FAMILY' ? 'Family Member' : 'Caregiver'),
      email: email.trim() || `${name.toLowerCase().replace(/\s+/g, '')}@demo.carebuddy.local`
    };

    onAddMember(newMember);
    setIsSuccess(true);
  };

  const handleCopyCode = () => {
    if (generatedCode) {
      navigator.clipboard.writeText(generatedCode).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const resetForm = () => {
    setName('');
    setEmail('');
    setGeneratedCode(null);
    setIsSuccess(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs overflow-y-auto"
    >
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl border border-[#D1DCD6] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#E7F0EC] text-[#397B68]">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h2 id="invite-modal-title" className="text-xl font-bold text-[#1E2B28]">
                Care Network &amp; Family Invitations
              </h2>
              <p className="text-xs text-gray-600">Connect family members &amp; licensed caregivers</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close care network dialog"
            className="p-2 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6 overflow-y-auto flex-1 py-4 pr-1">
          {/* Active Members List */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Connected Care Network ({members.length} Members)
            </h3>
            <div className="space-y-2">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="p-3.5 rounded-2xl border border-gray-200 bg-[#F6F8F5] flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-[#1E2B28]">{m.name}</span>
                      <span className="text-xs text-gray-500">({m.relationship})</span>
                    </div>
                    <p className="text-[11px] text-gray-500">{m.email}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      m.role === 'OWNER'
                        ? 'bg-emerald-100 text-emerald-800'
                        : m.role === 'FAMILY'
                        ? 'bg-purple-100 text-purple-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Invitation Form (Gate 5 RBAC: Owner Only) */}
          <div className="pt-2 border-t border-gray-200">
            {!isOwner ? (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 space-y-1.5">
                <div className="flex items-center gap-2 font-bold text-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Invitation Restricted to Elderly Owner</span>
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Under CareBuddy safety rules, only <strong>Ramesh Patel (Elderly Owner)</strong> can invite new members to the Care Network or grant permissions.
                </p>
                <p className="text-[11px] text-amber-700">
                  Switch to the <strong>Elderly View</strong> to invite family members.
                </p>
              </div>
            ) : isSuccess && generatedCode ? (
              <div className="p-5 rounded-2xl bg-[#E7F0EC] border-2 border-[#397B68] space-y-3">
                <div className="flex items-center gap-2 text-[#397B68] font-bold text-sm">
                  <Check className="w-5 h-5" />
                  <span>Family Member Added &amp; Invitation Code Generated!</span>
                </div>
                <p className="text-xs text-gray-700">
                  Share this secure 10-character code with your family member so they can connect their CareBuddy app:
                </p>
                <div className="p-3 bg-white rounded-xl border border-[#8DB9A6] flex items-center justify-between">
                  <span className="font-mono text-base font-extrabold text-[#1E2B28] tracking-widest">
                    {generatedCode}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="px-3 py-1.5 rounded-lg bg-[#397B68] text-white text-xs font-bold hover:bg-[#2e6253] transition-colors flex items-center gap-1"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy Code'}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500">
                  Code expires in 48 hours &bull; Up to 3 entry attempts &bull; Single-use security token
                </p>
                <button
                  type="button"
                  onClick={resetForm}
                  className="w-full py-2 rounded-xl bg-white border border-gray-300 text-xs font-bold text-gray-700 hover:bg-gray-50"
                >
                  Invite Another Member
                </button>
              </div>
            ) : (
              <form onSubmit={handleGenerateInvite} className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4 text-[#397B68]" /> Invite New Member
                  </h3>
                  <span className="text-[10px] font-bold text-[#397B68] bg-[#E7F0EC] px-2 py-0.5 rounded-full">
                    Gate 5 RBAC
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1E2B28]">Role *</label>
                    <select
                      value={role}
                      onChange={(e) => {
                        const r = e.target.value as 'FAMILY' | 'CAREGIVER';
                        setRole(r);
                        setRelationship(r === 'FAMILY' ? 'Son' : 'Visiting Nurse');
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-semibold focus:ring-2 focus:ring-[#397B68]"
                    >
                      <option value="FAMILY">Family Member (Read-Only Care Feed)</option>
                      <option value="CAREGIVER">Caregiver Nurse (Assisted Doses)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[#1E2B28]">Relationship *</label>
                    {role === 'FAMILY' ? (
                      <select
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-semibold focus:ring-2 focus:ring-[#397B68]"
                      >
                        <option value="Daughter">Daughter</option>
                        <option value="Son">Son</option>
                        <option value="Spouse">Spouse / Partner</option>
                        <option value="Grandchild">Granddaughter / Grandson</option>
                        <option value="Sibling">Sister / Brother</option>
                        <option value="Other Relative">Other Relative</option>
                      </select>
                    ) : (
                      <select
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-gray-300 text-xs font-semibold focus:ring-2 focus:ring-[#397B68]"
                      >
                        <option value="Visiting RN">Visiting Registered Nurse (RN)</option>
                        <option value="Home Health Aide">Home Health Aide</option>
                        <option value="Private Duty Caregiver">Private Duty Caregiver</option>
                      </select>
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1E2B28]">Member Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Patel, Sunita, Dr. Miller"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-[#397B68]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-[#1E2B28]">Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="e.g. rahul@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-xs focus:ring-2 focus:ring-[#397B68]"
                  />
                </div>

                <div className="p-3 bg-[#F6F8F5] rounded-xl border border-gray-200 text-xs text-gray-600 space-y-1">
                  <p className="font-bold text-[#1E2B28] flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-[#397B68]" />
                    {role === 'FAMILY' ? 'Family Member Permissions' : 'Caregiver Nurse Permissions'}
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    {role === 'FAMILY'
                      ? 'Will receive read-only access to view daily adherence percentages, vitals timeline, and doctor appointments. Cannot alter medication prescriptions.'
                      : 'Will receive permissions to administer doses, mark assisted administrations, write clinical shift notes, and reschedule appointments.'}
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 px-4 rounded-xl bg-[#397B68] text-white font-bold text-xs hover:bg-[#2b6051] transition-all shadow-md flex items-center justify-center gap-1.5 focus:ring-4 focus:ring-[#8DB9A6]"
                >
                  <Key className="w-4 h-4" /> Generate 10-Char Invitation Code &amp; Add Member
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <span className="text-[11px] text-gray-500">
            Care Network: <strong>Ramesh Patel's Circle of Care</strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
