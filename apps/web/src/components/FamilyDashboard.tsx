import { AssistantMark } from './AssistantMark';
import { Heart, Activity, Calendar, Bell, CheckCircle2 } from 'lucide-react';

export interface AdherenceSummary {
  rate: number | null;
  takenCount: number;
  skippedCount: number;
  missedCount: number;
  totalScheduled: number;
  statusText: string;
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  actorName?: string;
}

export interface FamilyDashboardProps {
  elderlyName: string;
  adherence: AdherenceSummary;
  upcomingAppointments: Array<{
    id: string;
    doctor: string;
    clinic: string;
    localDate: string;
    localTime: string;
    reason?: string;
  }>;
  recentActivity: ActivityItem[];
  unreadNotificationCount: number;
  isRealTimeConnected?: boolean;
}

export function FamilyDashboard({
  elderlyName,
  adherence,
  upcomingAppointments,
  recentActivity,
  unreadNotificationCount,
  isRealTimeConnected = true
}: FamilyDashboardProps) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl p-6 border border-[#D1DCD6] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F0EDFB] text-[#A99AE8]">
              Family Care View
            </span>
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className={`w-2 h-2 rounded-full ${isRealTimeConnected ? 'bg-green-500' : 'bg-amber-400'}`} />
              {isRealTimeConnected ? 'Live Synchronized' : 'Polling'}
            </span>
          </div>
          <h2 className="text-2xl font-bold text-[#1E2B28]">{elderlyName}'s Care Overview</h2>
          <p className="text-sm text-gray-600">
            Stay informed and connected with daily schedules, medications, and clinical appointments.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative p-2.5 bg-[#F6F8F5] rounded-xl border border-gray-200">
            <Bell className="w-5 h-5 text-[#397B68]" />
            {unreadNotificationCount > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#D99B43] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadNotificationCount}
              </span>
            )}
          </div>
          <AssistantMark state="idle" size={52} label="CareBuddy Sprig" />
        </div>
      </div>

      {/* Adherence & Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-[#D1DCD6] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>Adherence Rate</span>
            <Heart className="w-4 h-4 text-[#397B68]" />
          </div>
          <div className="text-3xl font-extrabold text-[#397B68]">
            {adherence.rate !== null ? `${Math.round(adherence.rate)}%` : 'No data yet'}
          </div>
          <p className="text-xs text-gray-500">{adherence.statusText}</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#D1DCD6] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>Doses Taken</span>
            <CheckCircle2 className="w-4 h-4 text-[#397B68]" />
          </div>
          <div className="text-3xl font-extrabold text-[#1E2B28]">
            {adherence.takenCount} <span className="text-sm font-normal text-gray-500">/ {adherence.totalScheduled}</span>
          </div>
          <p className="text-xs text-gray-500">
            {adherence.missedCount > 0 ? `${adherence.missedCount} missed` : 'Zero missed doses'}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-[#D1DCD6] shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs font-bold text-gray-500">
            <span>Next Appointment</span>
            <Calendar className="w-4 h-4 text-[#D99B43]" />
          </div>
          <div className="text-lg font-bold text-[#1E2B28] truncate">
            {upcomingAppointments[0]?.doctor || 'None scheduled'}
          </div>
          <p className="text-xs text-gray-500">
            {upcomingAppointments[0] ? `${upcomingAppointments[0].localDate} at ${upcomingAppointments[0].localTime}` : 'All caught up'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Appointments Section */}
        <section className="bg-white rounded-2xl p-6 border border-[#D1DCD6] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-[#1E2B28] flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#D99B43]" /> Medical Appointments
            </h3>
            <span className="text-xs text-gray-500">{upcomingAppointments.length} upcoming</span>
          </div>

          {upcomingAppointments.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No upcoming appointments scheduled.</p>
          ) : (
            <div className="space-y-3">
              {upcomingAppointments.map((apt) => (
                <div key={apt.id} className="p-3.5 rounded-xl border border-gray-200 bg-[#F6F8F5] space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-sm text-[#1E2B28]">{apt.doctor}</p>
                    <span className="text-xs font-semibold text-[#397B68] bg-white px-2 py-0.5 rounded border border-[#D1DCD6]">
                      {apt.localTime}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600">{apt.clinic} &bull; {apt.localDate}</p>
                  {apt.reason && <p className="text-xs text-gray-500 italic mt-0.5">{apt.reason}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Shared Activity Feed */}
        <section className="bg-white rounded-2xl p-6 border border-[#D1DCD6] shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-[#1E2B28] flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#397B68]" /> Shared Activity
            </h3>
            <span className="text-xs text-gray-500">Live Timeline</span>
          </div>

          {recentActivity.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No recent activities recorded.</p>
          ) : (
            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
              {recentActivity.map((act) => (
                <div key={act.id} className="p-3 rounded-xl border border-gray-100 bg-white flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#397B68] mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-xs text-[#1E2B28] truncate">{act.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{act.description}</p>
                    {act.actorName && (
                      <span className="text-[10px] font-medium text-[#397B68]">By {act.actorName}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
