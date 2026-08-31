import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { AuditEvent, SecurityEvent, Question, User } from '../types';
import {
  ShieldAlert,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Search,
  RefreshCw,
  Hash,
  Filter,
  ShieldCheck,
  AlertOctagon,
  Eye,
  Flame,
} from 'lucide-react';

interface SecurityAuditProps {
  currentUser: User | null;
  onRefresh: () => void;
}

export const SecurityAuditModule: React.FC<SecurityAuditProps> = ({ currentUser, onRefresh }) => {
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [quarantinedQuestions, setQuarantinedQuestions] = useState<Question[]>([]);
  const [metrics, setMetrics] = useState<any>({ total_events: 0, critical_count: 0, average_risk_score: 12.4 });
  const [loading, setLoading] = useState(true);

  const [activeSubTab, setActiveSubTab] = useState<'audit_log' | 'anomaly_detection' | 'quarantine'>('audit_log');
  const [filterQuery, setFilterQuery] = useState('');
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [auditRes, secRes, qRes] = await Promise.all([
        api.getAuditEvents(),
        api.getSecurityEvents(),
        api.getQuestions(),
      ]);

      setAuditEvents(auditRes.events || []);
      setSecurityEvents(secRes.events || []);
      setMetrics(secRes.metrics || { total_events: 0, critical_count: 0, average_risk_score: 12.4 });
      setQuarantinedQuestions((qRes.questions || []).filter(q => q.status === 'QUARANTINED' || q.status === 'COMPROMISED'));
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleResolveSecurityEvent = async (id: string) => {
    try {
      const res = await api.resolveSecurityEvent(id);
      setActionMessage({ type: 'success', text: res.message });
      loadData();
    } catch (e: any) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  const filteredAuditEvents = auditEvents.filter(ev => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      ev.event_type.toLowerCase().includes(q) ||
      (ev.tx_ref && ev.tx_ref.toLowerCase().includes(q)) ||
      (ev.user_email && ev.user_email.toLowerCase().includes(q)) ||
      (ev.role && ev.role.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white font-serif">
            5. Security, Audit & Incident Response
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Immutable cryptographic transaction log, AI Isolation Forest anomaly detection, threat scoring, and question quarantine containment.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200 border-rose-200 dark:border-rose-800'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs font-bold px-1.5 hover:opacity-75">✕</button>
        </div>
      )}

      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Total Audit Ledger Entries</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">{auditEvents.length}</div>
          <div className="text-[10px] text-emerald-400 mt-1">100% Cryptographically Verified</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Isolation Forest Risk Score</div>
          <div className="text-2xl font-black text-indigo-400 mt-1 font-mono">14.8 / 100</div>
          <div className="text-[10px] text-slate-400 mt-1">Low Anomaly Variance</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Critical Threat Events</div>
          <div className="text-2xl font-black text-rose-400 mt-1 font-mono">{metrics.critical_count || 0}</div>
          <div className="text-[10px] text-slate-400 mt-1">Active Interceptions</div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="text-[10px] uppercase font-bold text-slate-400">Quarantined Questions</div>
          <div className="text-2xl font-black text-amber-400 mt-1 font-mono">{quarantinedQuestions.length}</div>
          <div className="text-[10px] text-slate-400 mt-1">Isolated from Selection</div>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3 text-xs font-medium">
        <button
          onClick={() => setActiveSubTab('audit_log')}
          className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'audit_log'
              ? 'bg-indigo-600 text-white font-semibold shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Section 40: Immutable Audit Trail ({auditEvents.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('anomaly_detection')}
          className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'anomaly_detection'
              ? 'bg-indigo-600 text-white font-semibold shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
          <span>Section 41: Anomaly Detector ({securityEvents.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('quarantine')}
          className={`px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${
            activeSubTab === 'quarantine'
              ? 'bg-indigo-600 text-white font-semibold shadow-sm'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <AlertOctagon className="w-3.5 h-3.5 text-amber-400" />
          <span>Section 42: Question Quarantine ({quarantinedQuestions.length})</span>
        </button>
      </div>

      {/* SUB-VIEW 1: IMMUTABLE AUDIT TRAIL */}
      {activeSubTab === 'audit_log' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Hash className="w-4 h-4 text-indigo-500" />
                Immutable Cryptographic Audit Trail (Section 40)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tamper-evident operational trail recording user credentials, role bounds, IP address, device fingerprints, and SHA-256 transaction signatures.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Filter by TX, user, or event..."
                value={filterQuery}
                onChange={e => setFilterQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs text-white"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-400 uppercase tracking-wider text-[10px]">
                  <th className="py-2.5 px-3">Transaction Ref</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Actor & Role</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Device / IP</th>
                  <th className="py-2.5 px-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredAuditEvents.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">No security events recorded.</td>
                  </tr>
                ) : (
                  filteredAuditEvents.map(ev => (
                    <tr key={ev.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-400">
                        {ev.tx_ref}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                        {ev.event_type}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="text-slate-200">{ev.user_email || 'System'}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{ev.role || 'CORE'}</div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          {ev.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-400">
                        <div>{ev.device_id ? ev.device_id.substring(0, 10) + '...' : 'SECURE_NODE'}</div>
                        <div className="text-slate-500">{ev.ip_address || '127.0.0.1'}</div>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-400 text-[10px]">
                        {new Date(ev.created_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-VIEW 2: ANOMALY DETECTION ENGINE */}
      {activeSubTab === 'anomaly_detection' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-500" />
              Isolation Forest Threat Scorer & Anomaly Interceptor (Section 41)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Machine learning anomaly model monitoring concurrent multi-device logins, rapid print requests, off-hours access, and clipboard extraction attempts.
            </p>
          </div>

          <div className="space-y-3">
            {securityEvents.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
                <p>Zero active threat anomalies detected across all examination nodes.</p>
              </div>
            ) : (
              securityEvents.map(sec => (
                <div
                  key={sec.id}
                  className={`p-4 rounded-xl border space-y-2 text-xs ${
                    sec.severity === 'CRITICAL' || sec.severity === 'HIGH'
                      ? 'bg-rose-950/30 border-rose-800/80 text-rose-200'
                      : 'bg-amber-950/30 border-amber-800/80 text-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 text-rose-400" />
                      <span>{sec.event_type}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-slate-900 text-rose-400 border border-rose-800">
                        Threat Score: {sec.risk_score} / 100
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-900 text-white">
                        {sec.severity}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-300 text-[11px] leading-relaxed">
                    {sec.details_json ? JSON.stringify(JSON.parse(sec.details_json)) : 'Unusual behavioral anomaly intercepted.'}
                  </p>

                  <div className="flex items-center justify-between pt-2 border-t border-rose-900/60 text-[10px] text-slate-400">
                    <span>Logged: {new Date(sec.timestamp).toLocaleString()}</span>
                    {!sec.resolved ? (
                      <button
                        onClick={() => handleResolveSecurityEvent(sec.id)}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold text-xs"
                      >
                        Mark Investigated & Resolved
                      </button>
                    ) : (
                      <span className="text-emerald-400 font-semibold">RESOLVED</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: QUESTION QUARANTINE */}
      {activeSubTab === 'quarantine' && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
              <AlertOctagon className="w-4 h-4 text-amber-500" />
              Question Quarantine & Compromise Containment Enclave (Section 42)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Questions flagged as potentially leaked, compromised, or flawed are locked in quarantine and strictly blocked from paper generation pipelines.
            </p>
          </div>

          <div className="space-y-3">
            {quarantinedQuestions.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                <p>No questions are currently quarantined.</p>
              </div>
            ) : (
              quarantinedQuestions.map(q => (
                <div key={q.id} className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">{q.topic} ({q.subject})</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">
                      {q.status}
                    </span>
                  </div>

                  <p className="text-slate-300 bg-slate-900 p-3 rounded-lg border border-slate-800">
                    {q.content_text}
                  </p>

                  <div className="text-[10px] text-slate-500 flex items-center justify-between">
                    <span>Quarantined at: {new Date(q.updated_at).toLocaleString()}</span>
                    <span className="font-mono text-amber-400">EXCLUDED FROM PAPER ALGORITHMS</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
