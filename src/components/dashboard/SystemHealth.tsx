import React from 'react';
import { ShieldCheck, Cpu, Database, Cloud, Server, History, CheckCircle } from 'lucide-react';

export const SystemHealth: React.FC = () => {
  const protectionLayers = [
    {
      name: 'FIPS 140-2 Cryptographic Enclave',
      status: 'Hardware Sealed',
      metric: '100.0% Integrity',
      icon: ShieldCheck,
      type: 'Layer 1: Enclave',
    },
    {
      name: 'AI Question Synthesis Engine',
      status: 'Operational',
      metric: '99.98% Uptime',
      icon: Cpu,
      type: 'Layer 2: AI Core',
    },
    {
      name: 'ECDSA Hardware Device Binding',
      status: 'Dual-Custody OK',
      metric: 'P-256 Validated',
      icon: Server,
      type: 'Layer 3: Authentication',
    },
    {
      name: 'Zero-Leak Watermarking & Shuffling',
      status: 'Surveillance Active',
      metric: '0 Leaks Detected',
      icon: CheckCircle,
      type: 'Layer 4: DRM / Watermark',
    },
    {
      name: 'ZeroLeak Ledger Database',
      status: 'Immutable',
      metric: '100.0% Synchronized',
      icon: Database,
      type: 'Layer 5: Ledger',
    },
    {
      name: 'Cryptographic Audit Trail',
      status: 'Tamper-Proof',
      metric: '100.0% Recorded',
      icon: History,
      type: 'Layer 6: Audit Mesh',
    },
  ];

  return (
    <div className="rounded-xl bg-white border border-[#E4ECE9] p-5 shadow-[0_2px_10px_rgba(30,60,50,0.04)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#EEF3F1]">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6]">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#172A35]">
              ACTIVE PROTECTION LAYERS & ENCLAVE HEALTH
            </h3>
            <p className="text-[11px] text-[#5F7074]">
              Multi-tiered cryptographic isolation and real-time defense infrastructure
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono text-[#008A63] font-semibold bg-[#ECFBF5] border border-[#B8EBD6]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00B982]" />
          ALL PROTECTION LAYERS ACTIVE
        </span>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {protectionLayers.map((layer) => {
          const Icon = layer.icon;
          return (
            <div
              key={layer.name}
              className="p-3.5 rounded-lg bg-[#F8FAFA] border border-[#EDF2F0] flex flex-col justify-between gap-2 text-xs hover:bg-[#F0F5F3] hover:border-[#DCE5E8] transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="p-1.5 rounded-md bg-white border border-[#E4ECE9] text-[#008A63] shadow-2xs shrink-0">
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono font-semibold text-[#879598] uppercase block">
                      {layer.type}
                    </span>
                    <span className="text-xs font-semibold text-[#172A35] block truncate">
                      {layer.name}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-[#EDF2F0] text-[10px] font-mono">
                <span className="text-[#5F7074]">{layer.metric}</span>
                <span className="inline-flex items-center gap-1 font-bold text-[#008A63] bg-[#ECFBF5] px-1.5 py-0.5 rounded border border-[#B8EBD6]">
                  <span className="w-1 h-1 rounded-full bg-[#00B982]" />
                  {layer.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
