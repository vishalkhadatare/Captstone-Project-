import React from 'react';
import { ShieldCheck, UserCheck, FileCheck, History, CheckCircle, ShieldAlert } from 'lucide-react';

export const SecurityActivity: React.FC = () => {
  const events = [
    {
      id: 'sec-1',
      title: 'Examination blueprint encrypted',
      timestamp: '2 minutes ago',
      status: 'AES-256-GCM',
      icon: ShieldCheck,
      color: 'text-[#008A63]',
      badgeBg: 'bg-[#ECFBF5] border-[#B8EBD6] text-[#008A63]',
    },
    {
      id: 'sec-2',
      title: 'Controller authentication verified',
      timestamp: '8 minutes ago',
      status: 'ECDSA P-256',
      icon: UserCheck,
      color: 'text-[#008A63]',
      badgeBg: 'bg-[#ECFBF5] border-[#B8EBD6] text-[#008A63]',
    },
    {
      id: 'sec-3',
      title: 'Question batch integrity verified',
      timestamp: '14 minutes ago',
      status: 'SHA-256 OK',
      icon: FileCheck,
      color: 'text-[#008A63]',
      badgeBg: 'bg-[#ECFBF5] border-[#B8EBD6] text-[#008A63]',
    },
    {
      id: 'sec-4',
      title: 'Examination configuration updated',
      timestamp: '21 minutes ago',
      status: 'Audit Logged',
      icon: History,
      color: 'text-[#2474A6]',
      badgeBg: 'bg-[#E8F5FF] border-[#B8DEFF] text-[#186FAF]',
    },
    {
      id: 'sec-5',
      title: 'Zero-leak surveillance scan clear',
      timestamp: '32 minutes ago',
      status: 'No Threats',
      icon: CheckCircle,
      color: 'text-[#008A63]',
      badgeBg: 'bg-[#ECFBF5] border-[#B8EBD6] text-[#008A63]',
    },
  ];

  return (
    <div className="rounded-xl bg-white border border-[#E4ECE9] p-5 shadow-[0_2px_10px_rgba(30,60,50,0.04)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#EEF3F1]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6]">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#172A35]">
              SECURITY ACTIVITY FEED
            </h3>
            <p className="text-[11px] text-[#5F7074]">
              Immutable audit events and operational ledger
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 text-[9px] font-mono text-[#008A63] font-semibold bg-[#ECFBF5] px-2 py-0.5 rounded-full border border-[#B8EBD6]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00B982] animate-pulse" />
          LIVE LEDGER
        </span>
      </div>

      {/* Events List */}
      <div className="space-y-2.5">
        {events.map((ev) => {
          const Icon = ev.icon;
          return (
            <div
              key={ev.id}
              className="p-3 rounded-lg bg-[#F8FAFA] border border-[#EDF2F0] flex items-center justify-between gap-3 text-xs hover:bg-[#F0F5F3] transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-1.5 rounded-md bg-white border border-[#E4ECE9] shadow-2xs shrink-0 ${ev.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#172A35] truncate">
                    {ev.title}
                  </div>
                  <div className="text-[10px] text-[#879598] font-mono">
                    {ev.timestamp}
                  </div>
                </div>
              </div>

              <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border uppercase shrink-0 ${ev.badgeBg}`}>
                {ev.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
