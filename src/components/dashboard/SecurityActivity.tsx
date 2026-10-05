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
      color: 'text-[#00D68F]',
      badgeBg: 'bg-[#00D68F]/10 border-[#00D68F]/25 text-[#00D68F]',
    },
    {
      id: 'sec-2',
      title: 'Controller authentication verified',
      timestamp: '8 minutes ago',
      status: 'ECDSA P-256',
      icon: UserCheck,
      color: 'text-[#18C8B2]',
      badgeBg: 'bg-[#18C8B2]/10 border-[#18C8B2]/25 text-[#18C8B2]',
    },
    {
      id: 'sec-3',
      title: 'Question batch integrity verified',
      timestamp: '14 minutes ago',
      status: 'SHA-256 OK',
      icon: FileCheck,
      color: 'text-[#00D68F]',
      badgeBg: 'bg-[#00D68F]/10 border-[#00D68F]/25 text-[#00D68F]',
    },
    {
      id: 'sec-4',
      title: 'Examination configuration updated',
      timestamp: '21 minutes ago',
      status: 'Audit Logged',
      icon: History,
      color: 'text-[#4DA3FF]',
      badgeBg: 'bg-[#4DA3FF]/10 border-[#4DA3FF]/25 text-[#4DA3FF]',
    },
    {
      id: 'sec-5',
      title: 'Zero-leak surveillance scan clear',
      timestamp: '32 minutes ago',
      status: 'No Threats',
      icon: CheckCircle,
      color: 'text-[#00D68F]',
      badgeBg: 'bg-[#00D68F]/10 border-[#00D68F]/25 text-[#00D68F]',
    },
  ];

  return (
    <div className="rounded-xl bg-[#0D211E] border border-white/[0.08] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.3)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#00D68F]/10 text-[#00D68F] border border-[#00D68F]/20">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#F4F8F7]">
              SECURITY ACTIVITY FEED
            </h3>
            <p className="text-[11px] text-[#9AAEAA]">
              Immutable audit events and operational ledger
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 text-[9px] font-mono text-[#00D68F]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F] animate-pulse" />
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
              className="p-3 rounded-lg bg-[#102723]/60 border border-white/[0.04] flex items-center justify-between gap-3 text-xs hover:bg-[#102723] transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-1.5 rounded-md bg-[#06110F] border border-white/[0.06] shrink-0 ${ev.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#F4F8F7] truncate">
                    {ev.title}
                  </div>
                  <div className="text-[10px] text-[#617773] font-mono">
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
