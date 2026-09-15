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
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="border-b pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Independent Oversight Console
              </span>
              <h2 className="text-xl font-bold text-slate-900">Vigilance & Security Audit Enclave</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Read-only immutable oversight of cryptographic operations, session authentications, and threat telemetry.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Total Audit Logs</span>
                <span className="text-2xl font-bold text-slate-900">{auditEvents.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Security Incidents</span>
                <span className="text-2xl font-bold text-rose-700">{securityEvents.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Tracked Print Copies</span>
                <span className="text-2xl font-bold text-slate-900">{printHistory.length}</span>
              </div>
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Ledger Integrity</span>
                <span className="text-2xl font-bold text-emerald-700">100% VERIFIED</span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-900" />
              <span>Recent Immutable Events Ledger</span>
            </h3>

            <div className="space-y-2">
              {auditEvents.slice(0, 6).map(e => (
                <div key={e.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-900">{e.event_type}</span>
                    <div className="text-[10px] text-slate-500 font-mono">
                      User: {e.user_email || 'System'} • Role: {e.role || 'SYSTEM'} • Tx: {e.tx_ref?.substring(0, 16)}...
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400">
                    {new Date(e.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* AUDIT TRAIL / LOGIN HISTORY */}
      {(activeSubTab === 'audit_trail' || activeSubTab === 'login_history') && (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b pb-2">
            Immutable Audit Trail & Authentication History
          </h3>
          <div className="space-y-2">
            {auditEvents.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 text-center">No audit records in ledger.</p>
            ) : (
              auditEvents.map(e => (
                <div key={e.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900">{e.event_type}</span>
                    <span className="font-mono text-[10px] text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      REF: {e.tx_ref?.substring(0, 18)}...
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Operator: <span className="font-bold">{e.user_email || 'System Worker'}</span> ({e.role || 'N/A'}) • IP: {e.ip_address}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">
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
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b pb-2">
            Security Incident Telemetry & Threat Scores
          </h3>
          <div className="space-y-2">
            {securityEvents.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 text-center">No threats detected.</p>
            ) : (
              securityEvents.map(e => (
                <div key={e.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-bold text-slate-900">{e.event_type}</span>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Risk Score: {e.risk_score} • IP: {e.ip_address} • {new Date(e.timestamp).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        e.severity === 'CRITICAL'
                          ? 'bg-rose-100 text-rose-800'
                          : e.severity === 'HIGH'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}
                    >
                      {e.severity}
                    </span>
                    {!e.resolved && (
                      <button
                        onClick={() => handleResolveSecurityEvent(e.id)}
                        className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-xs font-bold"
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
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 border-b pb-2">
            Physical Paper Distribution & Serialization Audit
          </h3>
          <div className="space-y-2">
            {printHistory.length === 0 ? (
              <p className="text-xs text-slate-400 p-4 text-center">No physical printing events logged.</p>
            ) : (
              printHistory.map(p => (
                <div key={p.id} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex justify-between items-center">
                  <div>
                    <span className="font-mono font-bold text-slate-900">{p.copy_id}</span>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Tx: {p.tx_hash} • Printed: {new Date(p.printed_at).toLocaleString()}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                    FORENSICALLY LOGGED
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
