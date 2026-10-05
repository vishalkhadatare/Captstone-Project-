import React from 'react';
import { ShieldCheck, UserCheck, FileCheck, History, CheckCircle, ShieldAlert, Terminal, AlertTriangle } from 'lucide-react';

export const SecurityActivity: React.FC = () => {
  const events = [
    {
      id: 'sec-1',
      code: '14:32:18',
      title: 'Blueprint encrypted',
      detail: 'DBMS Examination (Set A & B sealed with AES-256)',
      actor: 'Enclave Cryptoprocessor',
      status: 'VERIFIED',
      type: 'success',
      icon: ShieldCheck,
    },
    {
      id: 'sec-2',
      code: '14:28:41',
      title: 'Controller authenticated',
      detail: 'MFA + Secure Enclave Workstation bound',
      actor: 'Hardware Key FIDO2',
      status: 'VERIFIED',
      type: 'success',
      icon: UserCheck,
    },
    {
      id: 'sec-3',
      code: '14:22:09',
      title: 'Copy quota mismatch',
      detail: 'Centre #MU-4029 requested unauthorized test reprint',
      actor: 'Print Spool Daemon',
      status: 'REVIEW REQUIRED',
      type: 'warning',
      icon: AlertTriangle,
    },
    {
      id: 'sec-4',
      code: '14:15:30',
      title: 'Question batch integrity & entropy verified',
      detail: 'SHA-256 hash tree matches root ledger',
      actor: 'SHA-256 Pipeline',
      status: 'VERIFIED',
      type: 'success',
      icon: FileCheck,
    },
    {
      id: 'sec-5',
      code: '14:02:11',
      title: 'Watermark profile generated',
      detail: 'Candidate-bound micro-dot steganography seeded',
      actor: 'DRM Watermark Engine',
      status: 'VERIFIED',
      type: 'info',
      icon: CheckCircle,
    },
  ];

  return (
    <div className="rounded-[18px] bg-white border border-[#DCE5E9] p-6 lg:p-7 shadow-[0_4px_20px_rgba(20,50,65,0.06)] space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between pb-3.5 border-b border-[#EEF3F1]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E8F8F2] text-[#00A878] border border-[#B8EBD6] flex items-center justify-center shadow-xs">
            <ShieldAlert className="w-5 h-5 stroke-[2]" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#102A38] uppercase tracking-wider font-mono">
              LIVE SECURITY ACTIVITY
            </h3>
            <p className="text-xs sm:text-[13px] text-[#61747E]">
              Real-time enclave cryptographic verification & operator event streams
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-[#61747E] bg-[#F5F8FA] px-2.5 py-1 rounded-lg border border-[#DCE5E8]">
            <Terminal className="w-3.5 h-3.5 text-[#00A878]" />
            ENCLAVE LEDGER v4.1
          </span>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold text-[#008A63] bg-[#E8F8F2] px-3 py-1 rounded-full border border-[#B8EBD6]">
            <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
            LIVE AUDIT
          </span>
        </div>
      </div>

      {/* Vertical Timeline Events (Specification 20) */}
      <div className="space-y-3 relative before:absolute before:left-5 before:top-3 before:bottom-3 before:w-0.5 before:bg-[#E2E8EC]">
        {events.map((ev) => {
          const Icon = ev.icon;
          const isWarning = ev.type === 'warning';
          const isInfo = ev.type === 'info';

          return (
            <div
              key={ev.id}
              className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 pl-11 p-3.5 rounded-xl bg-[#F8FAFC] border border-[#E2E8EC] hover:bg-white hover:border-[#CBD8D5] transition-all group shadow-2xs"
            >
              {/* Colored Timeline Dot */}
              <div
                className={`absolute left-3.5 top-4.5 sm:top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs z-10 ${
                  isWarning ? 'bg-[#F59E0B]' : isInfo ? 'bg-[#00B8D9]' : 'bg-[#00A878]'
                }`}
              />

              <div className="flex items-start gap-3 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono font-bold text-[#102A38]">
                      {ev.code}
                    </span>
                    <span className="text-slate-300">&bull;</span>
                    <span className="text-xs sm:text-[13px] font-bold text-[#102A38]">
                      {ev.title}
                    </span>
                    <span className="text-slate-300">&bull;</span>
                    <span className="text-xs text-[#61747E] font-medium truncate">
                      {ev.detail}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#61747E] font-mono mt-0.5">
                    Subsystem: <span className="text-[#102A38] font-semibold">{ev.actor}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 self-end sm:self-auto">
                {isWarning ? (
                  <span className="px-2.5 py-1 rounded-full text-[10.5px] font-mono font-bold bg-[#FFF7E5] text-[#A66A00] border border-[#F5E0B3]">
                    ⚠ {ev.status}
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-[10.5px] font-mono font-bold bg-[#E8F8F2] text-[#008A63] border border-[#B8EBD6]">
                    ✓ {ev.status}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
