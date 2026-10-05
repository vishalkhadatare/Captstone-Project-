import React from 'react';
import { Activity, Server, Cpu, Database, Cloud, ShieldCheck, History } from 'lucide-react';

export const SystemHealth: React.FC = () => {
  const services = [
    {
      name: 'AI Question Synthesis Engine',
      status: 'Operational',
      uptime: '99.98%',
      icon: Cpu,
    },
    {
      name: 'FIPS 140-2 Encryption Service',
      status: 'Operational',
      uptime: '100.0%',
      icon: ShieldCheck,
    },
    {
      name: 'ZeroLeak Ledger Database',
      status: 'Operational',
      uptime: '100.0%',
      icon: Database,
    },
    {
      name: 'Encrypted Cloud Storage',
      status: 'Operational',
      uptime: '99.95%',
      icon: Cloud,
    },
    {
      name: 'ECDSA Device Authentication',
      status: 'Operational',
      uptime: '100.0%',
      icon: Server,
    },
    {
      name: 'Cryptographic Audit Trail',
      status: 'Operational',
      uptime: '100.0%',
      icon: History,
    },
  ];

  return (
    <div className="rounded-xl bg-white border border-[#E4ECE9] p-5 shadow-[0_2px_10px_rgba(30,60,50,0.04)] space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#EEF3F1]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-[#ECFBF5] text-[#008A63] border border-[#B8EBD6]">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#172A35]">
              SYSTEM HEALTH & SERVICE MESH
            </h3>
            <p className="text-[11px] text-[#5F7074]">
              Real-time enclave microservice availability
            </p>
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono text-[#008A63] font-semibold bg-[#ECFBF5] border border-[#B8EBD6]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00B982]" />
          ALL NODES HEALTHY
        </span>
      </div>

      {/* Services Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {services.map((svc) => {
          const Icon = svc.icon;
          return (
            <div
              key={svc.name}
              className="p-3 rounded-lg bg-[#F8FAFA] border border-[#EDF2F0] flex items-center justify-between gap-3 text-xs hover:bg-[#F0F5F3] transition-colors"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Icon className="w-3.5 h-3.5 text-[#2474A6] shrink-0" />
                <span className="text-xs text-[#172A35] font-medium truncate">{svc.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-[#879598] hidden lg:inline">
                  {svc.uptime}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-[#008A63]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00B982]" />
                  {svc.status}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
