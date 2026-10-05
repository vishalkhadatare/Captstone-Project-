import React from 'react';
import {
  ShieldCheck,
  Cpu,
  Database,
  Server,
  History,
  Lock,
  Clock,
  Send,
  UserCheck,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

export const SystemHealth: React.FC = () => {
  // 5 Connected Protection Layers (Specification 22)
  const protectionLayers = [
    {
      step: '01',
      title: 'IDENTITY',
      subtitle: 'FIDO2 & ECDSA P-256',
      desc: 'Hardware device binding & biometric controller auth',
      icon: UserCheck,
      color: 'text-[#00A878]',
      bg: 'bg-[#E8F8F2]',
      border: 'border-[#B8EBD6]',
    },
    {
      step: '02',
      title: 'INTEGRITY',
      subtitle: 'SHA-256 Merkle Root',
      desc: 'Immutable syllabus hashes & question entropy checks',
      icon: ShieldCheck,
      color: 'text-[#00B8D9]',
      bg: 'bg-[#EFFBFD]',
      border: 'border-[#BEE7F0]',
    },
    {
      step: '03',
      title: 'ENCRYPTION',
      subtitle: 'AES-256-GCM Hardware',
      desc: 'Ephemeral session keys sealed inside silicon enclave',
      icon: Lock,
      color: 'text-[#2672B8]',
      bg: 'bg-[#EEF5FF]',
      border: 'border-[#C5DCFA]',
    },
    {
      step: '04',
      title: 'TIME LOCK',
      subtitle: 'Dual-Custody Timer',
      desc: 'Cryptographic release locked until exam session zero',
      icon: Clock,
      color: 'text-[#635BFF]',
      bg: 'bg-[#F5F4FF]',
      border: 'border-[#DCDFF5]',
    },
    {
      step: '05',
      title: 'SECURE RELEASE',
      subtitle: 'Watermarked Spool',
      desc: 'Candidate-bound micro-dot tracking with zero leakage',
      icon: Send,
      color: 'text-[#00A878]',
      bg: 'bg-[#E8F8F2]',
      border: 'border-[#B8EBD6]',
    },
  ];

  // 5 Subsystems for System Health (Specification 21)
  const healthSubsystems = [
    { name: 'AI Engine', status: 'Online', latency: '1.24s', uptime: '99.99%', icon: Cpu },
    { name: 'Encryption', status: 'Online', latency: '0.12ms', uptime: '100.0%', icon: Lock },
    { name: 'Database', status: 'Online', latency: '4.8ms', uptime: '99.98%', icon: Database },
    { name: 'Authentication', status: 'Online', latency: '18ms', uptime: '100.0%', icon: Server },
    { name: 'Audit System', status: 'Online', latency: '2.1ms', uptime: '100.0%', icon: History },
  ];

  return (
    <div className="space-y-6">
      {/* ================= 22. ZEROLEAK PROTECTION LAYERS ================= */}
      <div className="rounded-[18px] bg-white border border-[#DCE5E9] p-6 lg:p-7 shadow-[0_4px_20px_rgba(20,50,65,0.06)] space-y-5">
        <div className="flex items-center justify-between pb-3.5 border-b border-[#EEF3F1]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#E8F8F2] text-[#00A878] border border-[#B8EBD6] flex items-center justify-center shadow-xs">
              <ShieldCheck className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#102A38] uppercase tracking-wider font-mono">
                ZEROLEAK PROTECTION LAYERS
              </h3>
              <p className="text-xs sm:text-[13px] text-[#61747E]">
                End-to-end multi-tiered cryptographic chain of custody
              </p>
            </div>
          </div>

          <span className="px-3 py-1 rounded-full text-[10.5px] font-mono font-bold text-[#008A63] bg-[#E8F8F2] border border-[#B8EBD6]">
            5 TIERS ENFORCED
          </span>
        </div>

        {/* Connected 5 Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 relative">
          {protectionLayers.map((layer, index) => {
            const Icon = layer.icon;
            return (
              <div
                key={layer.step}
                className="relative p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8EC] hover:bg-white hover:border-[#CBD8D5] hover:-translate-y-0.5 transition-all shadow-2xs flex flex-col justify-between space-y-3 group"
              >
                {/* Step badge and icon */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono font-black text-[#61747E]">
                    {layer.step}
                  </span>
                  <div className={`w-8 h-8 rounded-xl ${layer.bg} ${layer.border} border flex items-center justify-center ${layer.color} shadow-2xs`}>
                    <Icon className="w-4 h-4 stroke-[2]" />
                  </div>
                </div>

                {/* Layer details */}
                <div className="space-y-1">
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#102A38]">
                    {layer.title}
                  </h4>
                  <div className="text-[10px] font-mono font-bold text-[#008A63]">
                    {layer.subtitle}
                  </div>
                  <p className="text-[11px] text-[#61747E] leading-relaxed pt-0.5">
                    {layer.desc}
                  </p>
                </div>

                <div className="pt-2 border-t border-[#EEF3F1] flex items-center justify-between text-[10px] font-mono">
                  <span className="text-[#008A63] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Active</span>
                  </span>
                  {index < 4 && (
                    <ArrowRight className="w-3.5 h-3.5 text-slate-300 hidden lg:block" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ================= 21. SYSTEM HEALTH ================= */}
      <div className="rounded-[18px] bg-white border border-[#DCE5E9] p-6 lg:p-7 shadow-[0_4px_20px_rgba(20,50,65,0.06)] space-y-5">
        <div className="flex items-center justify-between pb-3.5 border-b border-[#EEF3F1]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#EFFBFD] text-[#008AA3] border border-[#BEE7F0] flex items-center justify-center shadow-xs">
              <Server className="w-5 h-5 stroke-[2]" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[#102A38] uppercase tracking-wider font-mono">
                SYSTEM HEALTH
              </h3>
              <p className="text-xs sm:text-[13px] text-[#61747E]">
                Operational telemetry and uptime indicators across core security infrastructure
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10.5px] font-mono font-bold text-[#008A63] bg-[#E8F8F2] border border-[#B8EBD6]">
            <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
            ALL SYSTEMS NORMAL
          </span>
        </div>

        {/* 5 Horizontal Health Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {healthSubsystems.map((sub) => {
            const Icon = sub.icon;
            return (
              <div
                key={sub.name}
                className="p-4 rounded-2xl bg-[#F8FAFC] border border-[#E2E8EC] flex flex-col justify-between space-y-3 hover:bg-white transition-all shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#102A38]">{sub.name}</span>
                  <Icon className="w-4 h-4 text-[#61747E]" />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#00A878] animate-pulse" />
                  <span className="text-xs font-mono font-bold text-[#008A63]">
                    ● {sub.status}
                  </span>
                </div>

                <div className="pt-2 border-t border-[#EEF3F1] flex items-center justify-between text-[10.5px] font-mono text-[#61747E]">
                  <span>{sub.latency}</span>
                  <span className="font-semibold text-[#102A38]">{sub.uptime}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
