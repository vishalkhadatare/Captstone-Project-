import React from 'react';
import { ShieldCheck, UserCheck, FileCheck, History, CheckCircle, ShieldAlert, Terminal } from 'lucide-react';

export const SecurityActivity: React.FC = () => {
  const events = [
    {
      id: 'sec-1',
      code: 'ENC-2026-049',
      title: 'Examination blueprint sealed in hardware enclave',
      actor: 'Enclave Cryptoprocessor',
      timestamp: '2 minutes ago',
      status: 'AES-256-GCM',
      icon: ShieldCheck,
      color: 'text-[#00D68F]',
      badgeBg: 'bg-[#00D68F]/15 border-[#00D68F]/30 text-[#00D68F]',
    },
    {
      id: 'sec-2',
      code: 'AUTH-2026-112',
      title: 'Controller biometrics & device key verified',
      actor: 'Hardware Key FIDO2',
      timestamp: '8 minutes ago',
      status: 'ECDSA P-256',
      icon: UserCheck,
      color: 'text-[#00D68F]',
      badgeBg: 'bg-[#00D68F]/15 border-[#00D68F]/30 text-[#00D68F]',
    },
    {
      id: 'sec-3',
      code: 'HASH-2026-884',
      title: 'Question batch integrity & entropy verified',
      actor: 'SHA-256 Pipeline',
      timestamp: '14 minutes ago',
      status: 'SHA-256 OK',
      icon: FileCheck,
      color: 'text-[#00D68F]',
      badgeBg: 'bg-[#00D68F]/15 border-[#00D68F]/30 text-[#00D68F]',
    },
    {
      id: 'sec-4',
      code: 'CFG-2026-003',
      title: 'Examination blueprint parameters re-synchronized',
      actor: 'Controller Session',
      timestamp: '21 minutes ago',
      status: 'Audit Logged',
      icon: History,
      color: 'text-[#38BDF8]',
      badgeBg: 'bg-[#38BDF8]/15 border-[#38BDF8]/30 text-[#38BDF8]',
    },
    {
      id: 'sec-5',
      code: 'SCAN-2026-091',
      title: 'Continuous anti-leak memory and perimeter scan clear',
      actor: 'Surveillance Daemon',
      timestamp: '32 minutes ago',
      status: 'No Threats',
      icon: CheckCircle,
      color: 'text-[#00D68F]',
      badgeBg: 'bg-[#00D68F]/15 border-[#00D68F]/30 text-[#00D68F]',
    },
  ];

  return (
    <div className="rounded-xl bg-[#091724] border border-white/[0.1] p-5 shadow-[0_4px_24px_rgba(9,23,36,0.35)] space-y-4 text-white">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#00D68F]/15 text-[#00D68F] border border-[#00D68F]/30">
            <ShieldAlert className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-white">
              SECURITY ACTIVITY & IMMUTABLE AUDIT LEDGER
            </h3>
            <p className="text-[11px] text-slate-300">
              Real-time enclave cryptographic verification & operator event streams
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/[0.06]">
            <Terminal className="w-3 h-3 text-[#00D68F]" />
            ENCLAVE LEDGER v4.1
          </span>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-mono text-[#00D68F] font-semibold bg-[#00D68F]/15 px-2.5 py-0.5 rounded-full border border-[#00D68F]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D68F] animate-pulse" />
            LIVE LEDGER
          </span>
        </div>
      </div>

      {/* Events List */}
      <div className="space-y-2">
        {events.map((ev) => {
          const Icon = ev.icon;
          return (
            <div
              key={ev.id}
              className="p-3 rounded-lg bg-[#0F2236] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-[#132B45] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className={`p-1.5 rounded-md bg-[#091724] border border-white/[0.1] shrink-0 ${ev.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#00D68F]/90 font-bold bg-[#00D68F]/10 px-1.5 py-0.2 rounded border border-[#00D68F]/20">
                      {ev.code}
                    </span>
                    <span className="text-xs font-semibold text-slate-100 truncate">
                      {ev.title}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Subsystem: <span className="text-slate-300">{ev.actor}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                <span className="text-[10px] text-slate-400 font-mono">
                  {ev.timestamp}
                </span>
                <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border uppercase shrink-0 ${ev.badgeBg}`}>
                  {ev.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
