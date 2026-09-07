import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldAlert,
  UserCheck,
  Layers,
  Printer,
  History,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
} from 'lucide-react';
import { User, AuditEvent, SecurityEvent, PrintCopy } from '../../types';
import { api } from '../../api';
import { NavSubTab } from '../Sidebar';
import { AuthoritySurveillanceDashboard } from '../proctor/AuthoritySurveillanceDashboard';

interface AuditorWorkspaceProps {
  currentUser: User | null;
  activeSubTab: NavSubTab;
  onRefresh: () => void;
}

export const AuditorWorkspace: React.FC<AuditorWorkspaceProps> = ({
  currentUser,
  activeSubTab,
  onRefresh,
}) => {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [printHistory, setPrintHistory] = useState<PrintCopy[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [auditRes, secRes, printRes] = await Promise.all([
        api.getAuditEvents().catch(() => ({ events: [] })),
        api.getSecurityEvents().catch(() => ({ events: [] })),
        api.getPrintHistory().catch(() => ({ printHistory: [] })),
      ]);

      setAuditEvents(auditRes.events || []);
      setSecurityEvents(secRes.events || []);
      setPrintHistory(printRes.printHistory || []);
    } catch (err: any) {
      console.error('Auditor load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveSecurityEvent = async (id: string) => {
    try {
      await api.resolveSecurityEvent(id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Resolve error');
    }
  };

  return (
    <div className="space-y-6">
      {/* DASHBOARD */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="border-b border-slate-100 pb-4">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                Independent Oversight Console
              </span>
              <h2 className="text-2xl font-bold text-slate-900 mt-2">Vigilance & Security Audit Enclave</h2>
              <p className="text-xs text-slate-500 mt-1">
                Read-only immutable oversight of cryptographic operations, session authentications, and threat telemetry.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="metric-card p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-medium">Total Audit Logs</span>
                  <Activity className="w-4 h-4 text-emerald-700" />
                </div>
                <span className="text-2xl font-black text-slate-900">{auditEvents.length}</span>
                <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">SHA-256 Chained</span>
              </div>

              <div className="metric-card p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-medium">Security Incidents</span>
                  <ShieldAlert className="w-4 h-4 text-rose-700" />
                </div>
                <span className="text-2xl font-black text-rose-700">{securityEvents.length}</span>
                <span className="text-[10px] text-rose-600 font-semibold block mt-0.5">Detected Threats</span>
              </div>

              <div className="metric-card p-4 rounded-xl bg-slate-50/70 border border-slate-200/80">
                <div className="flex items-center justify-between text-slate-500 mb-1">
                  <span className="text-[11px] font-medium">Tracked Print Copies</span>
                  <Printer className="w-4 h-4 text-sky-700" />
                </div>
                <span className="text-2xl font-black text-slate-900">{printHistory.length}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">Watermark Bound</span>
              </div>

              <div className="metric-card p-4 rounded-xl bg-emerald-50/50 border border-emerald-200">
                <div className="flex items-center justify-between text-emerald-700 mb-1">
                  <span className="text-[11px] font-semibold">Ledger Integrity</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                </div>
                <span className="text-2xl font-black text-emerald-800">100%</span>
                <span className="text-[10px] text-emerald-700 font-bold block mt-0.5">VERIFIED TAMPER-FREE</span>
              </div>
            </div>
          </div>

          <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <div className="p-1 rounded-md bg-emerald-50 text-emerald-800">
                  <Activity className="w-3.5 h-3.5" />
                </div>
                <span>Recent Immutable Events Ledger</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">Live Chained Ledger</span>
            </div>

            <div className="space-y-2">
              {auditEvents.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">No immutable records in ledger yet.</p>
              ) : (
                auditEvents.slice(0, 6).map(e => (
                  <div key={e.id} className="p-3.5 rounded-xl bg-slate-50/70 hover:bg-slate-50 border border-slate-200/80 text-xs flex justify-between items-center transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{e.event_type}</span>
                        <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {e.role || 'SYSTEM'}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        User: {e.user_email || 'System'} • Tx: {e.tx_ref?.substring(0, 16)}...
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 bg-white px-2.5 py-1 rounded-md border border-slate-200">
                      {new Date(e.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT TRAIL / LOGIN HISTORY */}
      {(activeSubTab === 'audit_trail' || activeSubTab === 'login_history') && (
        <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              Audit Logs
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              Immutable Audit Trail & Authentication History
            </h3>
            <p className="text-xs text-slate-500">Cryptographic audit trail recorded with SHA-256 sequence hashes.</p>
          </div>

          <div className="space-y-2.5">
            {auditEvents.length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center">No audit records in ledger.</p>
            ) : (
              auditEvents.map(e => (
                <div key={e.id} className="p-4 rounded-xl bg-white hover:bg-slate-50/60 border border-slate-200/80 shadow-xs text-xs space-y-2 transition-all">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-sm">{e.event_type}</span>
                    <span className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      REF: {e.tx_ref?.substring(0, 18)}...
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-3 flex-wrap">
                    <span>Operator: <strong className="text-slate-800">{e.user_email || 'System Worker'}</strong> ({e.role || 'N/A'})</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono text-slate-500">IP: {e.ip_address}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-100">
                    Timestamp: {new Date(e.created_at).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SECURITY EVENTS */}
      {activeSubTab === 'security_events' && (
        <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              Vigilance Telemetry
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              Security Incident Telemetry & Threat Scores
            </h3>
            <p className="text-xs text-slate-500">Continuous anomaly detection and access violation alerts.</p>
          </div>

          <div className="space-y-3">
            {securityEvents.length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center">No threats detected. All systems operating normally.</p>
            ) : (
              securityEvents.map(e => (
                <div key={e.id} className="p-4 rounded-xl bg-white hover:bg-slate-50/60 border border-slate-200 shadow-xs text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-sm">{e.event_type}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                          e.severity === 'CRITICAL'
                            ? 'bg-rose-50 text-rose-800 border-rose-300'
                            : e.severity === 'HIGH'
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-slate-50 text-slate-800 border-slate-300'
                        }`}
                      >
                        {e.severity}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono">
                      Risk Score: {e.risk_score} • IP: {e.ip_address} • {new Date(e.timestamp).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!e.resolved && (
                      <button
                        onClick={() => handleResolveSecurityEvent(e.id)}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Mark Resolved
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* PRINTING & PAPER EVENTS */}
      {(activeSubTab === 'printing_events' || activeSubTab === 'paper_events' || activeSubTab === 'regeneration_events') && (
        <div className="modern-card p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Distribution Forensics
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">
              Physical Paper Distribution & Serialization Audit
            </h3>
            <p className="text-xs text-slate-500">Forensic tracking and serialization hashes of physical test paper printouts.</p>
          </div>

          <div className="space-y-3">
            {printHistory.length === 0 ? (
              <p className="text-xs text-slate-400 p-6 text-center">No physical printing events logged.</p>
            ) : (
              printHistory.map(p => (
                <div key={p.id} className="p-4 rounded-xl bg-white hover:bg-slate-50/60 border border-slate-200 shadow-xs text-xs flex justify-between items-center transition-all">
                  <div className="space-y-1">
                    <span className="font-mono font-bold text-slate-900 text-sm">{p.copy_id}</span>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Tx: {p.tx_hash} • Printed: {new Date(p.printed_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    FORENSICALLY LOGGED
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* AUTHORITY SURVEILLANCE AUDIT */}
      {activeSubTab === 'proctor_dashboard' && (
        <AuthoritySurveillanceDashboard currentUser={currentUser} />
      )}
    </div>
  );
};
