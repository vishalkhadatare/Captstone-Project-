import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  Layers,
  Printer,
  History,
  CheckCircle2,
  AlertTriangle,
  FileCheck2,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  Search,
  FileText,
  BarChart3,
  Download,
  RefreshCw,
  Key,
  Laptop,
  Camera,
  AlertCircle,
  Clock,
  ExternalLink,
  X,
  ChevronRight,
  Fingerprint,
  Cpu,
  Shield,
  FileSpreadsheet,
} from 'lucide-react';
import {
  User,
  AuditEvent,
  SecurityEvent,
  PrintCopy,
  AuditorDashboardMetrics,
  UserSessionActivity,
  UserSecurityProfile,
  DeviceActivityItem,
  PaperSecurityOverview,
  SecurityEvidenceRecord,
  WatermarkInvestigationRecord,
  AuditReportSummary,
} from '../../types';
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
  // Common states
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Dashboard state
  const [metrics, setMetrics] = useState<AuditorDashboardMetrics | null>(null);
  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [integrityStatus, setIntegrityStatus] = useState<{ verified: boolean; chainedCount: number; status: string } | null>(null);

  // Audit Trail states
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedAuditEvent, setSelectedAuditEvent] = useState<AuditEvent | null>(null);

  // User Activity states
  const [userSessions, setUserSessions] = useState<UserSessionActivity[]>([]);
  const [selectedUserProfile, setSelectedUserProfile] = useState<UserSecurityProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Device Activity states
  const [devices, setDevices] = useState<DeviceActivityItem[]>([]);
  const [selectedDeviceHistory, setSelectedDeviceHistory] = useState<{ device: DeviceActivityItem; events: AuditEvent[]; securityEvents: SecurityEvent[] } | null>(null);
  const [loadingDeviceHistory, setLoadingDeviceHistory] = useState(false);

  // Paper Security states
  const [paperOverview, setPaperOverview] = useState<PaperSecurityOverview[]>([]);
  const [paperSubTab, setPaperSubTab] = useState<'status' | 'lifecycle' | 'encryption' | 'unlock' | 'printing' | 'watermark'>('status');

  // Security Events states
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [selectedSecurityEvent, setSelectedSecurityEvent] = useState<SecurityEvent | null>(null);
  const [transitionNotes, setTransitionNotes] = useState('');
  const [transitionStatus, setTransitionStatus] = useState<string>('INVESTIGATING');

  // Proctoring & Evidence states
  const [proctoringSubTab, setProctoringSubTab] = useState<'surveillance' | 'evidence'>('surveillance');
  const [evidenceList, setEvidenceList] = useState<SecurityEvidenceRecord[]>([]);
  const [selectedEvidence, setSelectedEvidence] = useState<SecurityEvidenceRecord | null>(null);

  // Watermark Investigation states
  const [investigations, setInvestigations] = useState<WatermarkInvestigationRecord[]>([]);
  const [leakSourceType, setLeakSourceType] = useState('LEAKED_PDF');
  const [inputReference, setInputReference] = useState('');
  const [extractedSignature, setExtractedSignature] = useState('');
  const [investigating, setInvestigating] = useState(false);
  const [latestInvestigationResult, setLatestInvestigationResult] = useState<WatermarkInvestigationRecord | null>(null);

  // Reports states
  const [reportSummary, setReportSummary] = useState<AuditReportSummary | null>(null);
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');

  // Initial load
  useEffect(() => {
    loadTabContent();
  }, [activeSubTab]);

  const showNotice = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadTabContent = async () => {
    setLoading(true);
    try {
      if (activeSubTab === 'dashboard') {
        const [metricRes, auditRes] = await Promise.all([
          api.getAuditorDashboardMetrics().catch(() => null),
          api.getAuditEvents({ limit: '10' }).catch(() => ({ events: [] })),
        ]);
        if (metricRes) {
          setMetrics(metricRes);
          setIntegrityStatus(metricRes.ledgerIntegrity);
        }
        setRecentEvents(auditRes.events || []);
      } else if (activeSubTab === 'audit_trail') {
        const res = await api.getAuditEvents({
          category: categoryFilter,
          severity: severityFilter,
          role: roleFilter,
          search: searchQuery,
          date_from: dateFrom,
          date_to: dateTo,
        });
        setAuditEvents(res.events || []);
      } else if (activeSubTab === 'user_activity' || activeSubTab === 'login_history') {
        const res = await api.getUserActivity();
        setUserSessions(res.users || []);
      } else if (activeSubTab === 'device_activity') {
        const res = await api.getDeviceActivity();
        setDevices(res.devices || []);
      } else if (activeSubTab === 'role_activity') {
        const res = await api.getAuditEvents({ category: 'ROLE' });
        setAuditEvents(res.events || []);
      } else if (activeSubTab === 'paper_security' || activeSubTab === 'paper_events' || activeSubTab === 'regeneration_events') {
        const res = await api.getPaperSecurityOverview();
        setPaperOverview(res.papers || []);
      } else if (activeSubTab === 'encryption_unlock') {
        const res = await api.getPaperSecurityOverview();
        setPaperOverview(res.papers || []);
        setPaperSubTab('encryption');
      } else if (activeSubTab === 'print_security' || activeSubTab === 'printing_events') {
        const res = await api.getPaperSecurityOverview();
        setPaperOverview(res.papers || []);
        setPaperSubTab('printing');
      } else if (activeSubTab === 'security_events') {
        const res = await api.getSecurityEvents();
        setSecurityEvents(res.events || []);
      } else if (activeSubTab === 'proctoring_evidence' || activeSubTab === 'proctor_dashboard') {
        const res = await api.getSecurityEvidence().catch(() => ({ evidence: [] }));
        setEvidenceList(res.evidence || []);
      } else if (activeSubTab === 'watermark_investigations') {
        const res = await api.getWatermarkInvestigations();
        setInvestigations(res.investigations || []);
      } else if (activeSubTab === 'security_reports' || activeSubTab === 'user_activity_reports') {
        const res = await api.getAuditReportSummary({ date_from: reportDateFrom, date_to: reportDateTo });
        setReportSummary(res);
      }
    } catch (err: any) {
      console.error('Error loading tab content:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyChain = async () => {
    setRefreshing(true);
    try {
      const res = await api.verifyAuditIntegrity();
      setIntegrityStatus(res);
      showNotice(res.verified ? 'success' : 'error', `Ledger verification: ${res.status} (${res.chainedCount} events chained)`);
    } catch (err: any) {
      showNotice('error', err.message || 'Verification failed');
    } finally {
      setRefreshing(false);
    }
  };

  const handleSearchAuditTrail = async () => {
    setLoading(true);
    try {
      const res = await api.getAuditEvents({
        category: categoryFilter,
        severity: severityFilter,
        role: roleFilter,
        search: searchQuery,
        date_from: dateFrom,
        date_to: dateTo,
      });
      setAuditEvents(res.events || []);
    } catch (err: any) {
      showNotice('error', err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenUserProfile = async (userId: string) => {
    setLoadingProfile(true);
    try {
      const profile = await api.getUserSecurityProfile(userId);
      setSelectedUserProfile(profile);
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to load user profile');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleOpenDeviceHistory = async (dev: DeviceActivityItem) => {
    setLoadingDeviceHistory(true);
    try {
      const history = await api.getDeviceHistory(dev.id);
      setSelectedDeviceHistory({
        device: dev,
        events: history.events || [],
        securityEvents: history.securityEvents || [],
      });
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to load device history');
    } finally {
      setLoadingDeviceHistory(false);
    }
  };

  const handleTransitionSecurityEvent = async (eventId: string, newStatus: string) => {
    try {
      const res = await api.transitionSecurityEvent(eventId, {
        status: newStatus,
        notes: transitionNotes,
      });
      showNotice('success', res.message);
      setSelectedSecurityEvent(null);
      setTransitionNotes('');
      // Reload security events
      const updated = await api.getSecurityEvents();
      setSecurityEvents(updated.events || []);
    } catch (err: any) {
      showNotice('error', err.message || 'Failed to update event');
    }
  };

  const handleInvestigateWatermark = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extractedSignature.trim()) {
      showNotice('error', 'Please enter a watermark payload or copy ID to verify');
      return;
    }
    setInvestigating(true);
    try {
      const res = await api.investigateWatermark({
        leak_source_type: leakSourceType,
        input_reference: inputReference,
        extracted_signature: extractedSignature,
      });
      setLatestInvestigationResult(res.investigation);
      showNotice(
        res.investigation.status === 'VERIFIED' ? 'success' : 'error',
        `Forensic result: ${res.investigation.status}`
      );
      // Reload list
      const invRes = await api.getWatermarkInvestigations();
      setInvestigations(invRes.investigations || []);
    } catch (err: any) {
      showNotice('error', err.message || 'Investigation error');
    } finally {
      setInvestigating(false);
    }
  };

  const handleExportReport = async (format: 'json' | 'csv') => {
    try {
      const res = await api.exportAuditReport({ date_from: reportDateFrom, date_to: reportDateTo });
      let dataStr = '';
      let filename = `zeroleak-audit-report-${Date.now()}`;

      if (format === 'json') {
        dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res, null, 2));
        filename += '.json';
      } else {
        const headers = ['id', 'event_type', 'category', 'severity', 'user_email', 'role', 'status', 'created_at', 'tx_ref'];
        const rows = res.data.map((r: any) =>
          headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(',')
        );
        const csvContent = [headers.join(','), ...rows].join('\n');
        dataStr = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
        filename += '.csv';
      }

      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', filename);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showNotice('success', `Exported ${res.data.length} records successfully.`);
    } catch (err: any) {
      showNotice('error', err.message || 'Export failed');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-sm transition-all animate-in fade-in ${
            notification.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
              : 'bg-rose-50 text-rose-800 border-rose-300'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* OVERVIEW: AUDITOR DASHBOARD */}
      {activeSubTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Header Card */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                  Chief Vigilance & Security Auditor Console
                </span>
                <h2 className="text-2xl font-black text-slate-900 mt-2">
                  Institutional Vigilance & Cryptographic Oversight
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time database surveillance for {currentUser?.org_id || 'Organization'}. SHA-256 chained audit integrity.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleVerifyChain}
                  disabled={refreshing}
                  className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <ShieldCheck className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                  <span>Verify Ledger Chain</span>
                </button>
                <button
                  onClick={loadTabContent}
                  disabled={loading}
                  className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* 12 Database-Driven KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 pt-2">
              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Total Audit Events</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.totalAuditEvents ?? 0}</p>
                <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">PostgreSQL Immutable</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Today's Events</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.todayEvents ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Since 00:00 UTC</span>
              </div>

              <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200">
                <span className="text-[11px] font-medium text-rose-700">High / Critical Events</span>
                <p className="text-2xl font-black text-rose-700 mt-1">{metrics?.highCriticalEvents ?? 0}</p>
                <span className="text-[10px] text-rose-600 font-semibold block mt-0.5">Urgent Attention</span>
              </div>

              <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200">
                <span className="text-[11px] font-medium text-amber-800">Active Security Incidents</span>
                <p className="text-2xl font-black text-amber-800 mt-1">{metrics?.activeSecurityEvents ?? 0}</p>
                <span className="text-[10px] text-amber-700 block mt-0.5">Open & Investigating</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Failed Login Attempts</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.failedLogins ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Credential Violations</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Unauthorized Attempts</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.unauthorizedAttempts ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Access Denied Hits</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Suspended / Revoked Devices</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.suspendedDevices ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Workstation Isolation</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Proctoring Incidents</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.proctoringIncidents ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Surveillance Alerts</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Pending Key Requests</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.pendingKeyRequests ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Shamir Quorum</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Pending Unlock Requests</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.pendingUnlockRequests ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Time-Lock Override</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Print Quota Violations</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.printViolations ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Excess Sheet Attempts</span>
              </div>

              <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200">
                <span className="text-[11px] font-medium text-slate-500">Watermark Investigations</span>
                <p className="text-2xl font-black text-slate-900 mt-1">{metrics?.watermarkInvestigations ?? 0}</p>
                <span className="text-[10px] text-slate-500 block mt-0.5">Forensic Audits</span>
              </div>
            </div>

            {/* Cryptographic Ledger Integrity Badge */}
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 rounded-lg text-emerald-800">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-900">
                    Cryptographic Ledger Integrity:{' '}
                    <span className="text-emerald-800 font-extrabold">{integrityStatus?.status || 'VERIFIED TAMPER-FREE'}</span>
                  </h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Every audit entry is sequentially chained via SHA-256 block hashing (<code>previous_event_hash</code> &rarr; <code>event_hash</code>).
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-mono text-emerald-800 bg-white px-3 py-1.5 rounded-lg border border-emerald-200 font-bold self-start sm:self-auto">
                {integrityStatus?.chainedCount ?? 0} Chained Blocks
              </span>
            </div>
          </div>

          {/* Recent Live Chained Ledger Table */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-700" />
                <span>Recent Live Chained Audit Events</span>
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">Live PostgreSQL Stream</span>
            </div>

            {recentEvents.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No audit events found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 font-semibold text-[11px]">
                      <th className="pb-2">Timestamp</th>
                      <th className="pb-2">Event Type</th>
                      <th className="pb-2">Category</th>
                      <th className="pb-2">Severity</th>
                      <th className="pb-2">Operator / Role</th>
                      <th className="pb-2">Tx Ref</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {recentEvents.map(e => (
                      <tr key={e.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 font-mono text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
                        <td className="py-2.5 font-bold text-slate-900">{e.event_type}</td>
                        <td className="py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                            {e.event_category || 'SYSTEM'}
                          </span>
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              e.severity === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : e.severity === 'HIGH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {e.severity || 'INFO'}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-700">
                          {e.user_email || 'System'} <span className="text-slate-400">({e.role || 'CORE'})</span>
                        </td>
                        <td className="py-2.5 font-mono text-[10px] text-slate-400">{e.tx_ref?.substring(0, 14)}...</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* AUDIT: AUDIT TRAIL / ROLE ACTIVITY */}
      {(activeSubTab === 'audit_trail' || activeSubTab === 'role_activity') && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                {activeSubTab === 'role_activity' ? 'Authority Governance' : 'Cryptographic Ledger'}
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                {activeSubTab === 'role_activity' ? 'Role & Authority Delegation Activity' : 'Immutable Forensic Audit Trail'}
              </h3>
              <p className="text-xs text-slate-500">
                Cryptographically hashed audit log with sequential integrity proofs.
              </p>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 text-xs">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search event, user, tx..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-2 py-2 rounded-lg bg-white border border-slate-200 text-xs focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs"
            >
              <option value="ALL">All Categories</option>
              <option value="AUTH">Authentication</option>
              <option value="SECURITY">Security Threats</option>
              <option value="ROLE">Role & Authority</option>
              <option value="EXAMINATION">Examinations</option>
              <option value="PAPER">Paper Lifecycle</option>
              <option value="PRINT">Printing</option>
              <option value="FORENSICS">Watermarks & Forensics</option>
              <option value="SYSTEM">System</option>
            </select>

            <select
              value={severityFilter}
              onChange={e => setSeverityFilter(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs"
            >
              <option value="ALL">All Severities</option>
              <option value="INFO">INFO</option>
              <option value="LOW">LOW</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="HIGH">HIGH</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>

            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="px-2.5 py-2 rounded-lg bg-white border border-slate-200 text-xs"
            >
              <option value="ALL">All Roles</option>
              <option value="ORG_OWNER">ORG_OWNER</option>
              <option value="EXAM_MANAGER">EXAM_MANAGER</option>
              <option value="AUDITOR">AUDITOR</option>
              <option value="TRANSLATOR">TRANSLATOR</option>
              <option value="CENTRE_OPERATOR">CENTRE_OPERATOR</option>
            </select>

            <button
              onClick={handleSearchAuditTrail}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg font-bold transition-colors cursor-pointer"
            >
              Apply Filter
            </button>
          </div>

          {/* Audit Events Table */}
          {auditEvents.length === 0 ? (
            <p className="text-xs text-slate-400 py-12 text-center">No audit events found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-semibold text-[11px]">
                    <th className="pb-2.5">Timestamp</th>
                    <th className="pb-2.5">Event Type</th>
                    <th className="pb-2.5">Category</th>
                    <th className="pb-2.5">Severity</th>
                    <th className="pb-2.5">Operator</th>
                    <th className="pb-2.5">Role</th>
                    <th className="pb-2.5">Tx Reference</th>
                    <th className="pb-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditEvents.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 font-mono text-slate-500 text-[11px]">
                        {new Date(e.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 font-bold text-slate-900">{e.event_type}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {e.event_category || 'SYSTEM'}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            e.severity === 'CRITICAL'
                              ? 'bg-rose-100 text-rose-800'
                              : e.severity === 'HIGH'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {e.severity || 'INFO'}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-800 font-medium">{e.user_email || 'System'}</td>
                      <td className="py-2.5 text-slate-500 font-mono text-[10px]">{e.role || 'SYSTEM'}</td>
                      <td className="py-2.5 font-mono text-[10px] text-slate-400">{e.tx_ref?.substring(0, 16)}...</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => setSelectedAuditEvent(e)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold cursor-pointer transition-colors"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AUDIT: USER & SESSION ACTIVITY */}
      {(activeSubTab === 'user_activity' || activeSubTab === 'login_history') && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              Identity Surveillance
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">User & Session Activity</h3>
            <p className="text-xs text-slate-500">Live PostgreSQL tracking of authentications, active sessions, and security violations.</p>
          </div>

          {userSessions.length === 0 ? (
            <p className="text-xs text-slate-400 py-12 text-center">No user session records found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-semibold text-[11px]">
                    <th className="pb-2.5">User</th>
                    <th className="pb-2.5">Role</th>
                    <th className="pb-2.5">Login Time</th>
                    <th className="pb-2.5">Logout Time</th>
                    <th className="pb-2.5">Duration</th>
                    <th className="pb-2.5">Auth Result</th>
                    <th className="pb-2.5">Security Alerts</th>
                    <th className="pb-2.5 text-right">Security Profile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {userSessions.map(s => (
                    <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5">
                        <div className="font-bold text-slate-900">{s.user_name || s.user_email}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{s.user_email}</div>
                      </td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {s.role}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-[11px] text-slate-600">
                        {new Date(s.login_time).toLocaleString()}
                      </td>
                      <td className="py-2.5 font-mono text-[11px] text-slate-400">
                        {s.logout_time ? new Date(s.logout_time).toLocaleString() : 'Active'}
                      </td>
                      <td className="py-2.5 text-slate-600">
                        {s.session_duration_seconds ? `${Math.round(s.session_duration_seconds / 60)} min` : s.logout_time ? '< 1 min' : 'Ongoing'}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            s.auth_result === 'SUCCESS'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {s.auth_result}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {Number(s.security_events_count || 0) > 0 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                            {s.security_events_count} Incidents
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">0</span>
                        )}
                      </td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => handleOpenUserProfile(s.user_id)}
                          className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          View Profile
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AUDIT: DEVICE ACTIVITY */}
      {activeSubTab === 'device_activity' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
              Hardware Enclave
            </span>
            <h3 className="text-lg font-bold text-slate-900 mt-1">Workstation & Device Activity</h3>
            <p className="text-xs text-slate-500">
              Hardware binding status, authentication failures, and historical device telemetry. Private keys never exposed.
            </p>
          </div>

          {devices.length === 0 ? (
            <p className="text-xs text-slate-400 py-12 text-center">No registered devices found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-semibold text-[11px]">
                    <th className="pb-2.5">Device</th>
                    <th className="pb-2.5">Assigned Operator</th>
                    <th className="pb-2.5">Role</th>
                    <th className="pb-2.5">OS / Browser</th>
                    <th className="pb-2.5">Status</th>
                    <th className="pb-2.5">First Seen</th>
                    <th className="pb-2.5">Last Seen</th>
                    <th className="pb-2.5">Failures</th>
                    <th className="pb-2.5 text-right">History</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {devices.map(d => (
                    <tr key={d.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 font-mono text-[11px]">
                        <div className="font-bold text-slate-900">{d.device_name || 'Enclave Terminal'}</div>
                        <div className="text-[10px] text-slate-400">{d.device_uuid?.substring(0, 16)}...</div>
                      </td>
                      <td className="py-2.5 font-medium text-slate-800">{d.user_email || 'Unassigned'}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {d.role || 'N/A'}
                        </span>
                      </td>
                      <td className="py-2.5 text-slate-600">
                        {d.operating_system || 'Desktop'} • {d.browser_info?.substring(0, 15) || 'Client'}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            d.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : d.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {d.status}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono text-[10px] text-slate-500">{new Date(d.first_seen).toLocaleDateString()}</td>
                      <td className="py-2.5 font-mono text-[10px] text-slate-500">{new Date(d.last_seen).toLocaleString()}</td>
                      <td className="py-2.5 font-mono text-rose-700 font-bold">{d.auth_failures}</td>
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => handleOpenDeviceHistory(d)}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* EXAM SECURITY: PAPER SECURITY / ENCRYPTION / PRINT SECURITY */}
      {(activeSubTab === 'paper_security' ||
        activeSubTab === 'paper_events' ||
        activeSubTab === 'encryption_unlock' ||
        activeSubTab === 'print_security' ||
        activeSubTab === 'printing_events' ||
        activeSubTab === 'regeneration_events') && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                Examination Security Enclave
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Paper Security & Cryptographic Lifecycle</h3>
              <p className="text-xs text-slate-500">Security metadata, encryption algorithms, Shamir key shares, and physical printing quotas.</p>
            </div>

            {/* Subtabs for Paper Security */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto text-xs font-bold">
              {(['status', 'lifecycle', 'encryption', 'unlock', 'printing', 'watermark'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setPaperSubTab(tab)}
                  className={`px-3 py-1.5 rounded-lg capitalize transition-colors cursor-pointer ${
                    paperSubTab === tab ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {paperOverview.length === 0 ? (
            <p className="text-xs text-slate-400 py-12 text-center">No examinations found in organization.</p>
          ) : (
            <div className="space-y-4">
              {paperSubTab === 'status' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-slate-500 font-semibold text-[11px]">
                        <th className="pb-2.5">Exam Name</th>
                        <th className="pb-2.5">Subject / Category</th>
                        <th className="pb-2.5">Status</th>
                        <th className="pb-2.5">Versions</th>
                        <th className="pb-2.5">Encrypted</th>
                        <th className="pb-2.5">Time-Lock State</th>
                        <th className="pb-2.5">Copies Printed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paperOverview.map(p => (
                        <tr key={p.examId} className="hover:bg-slate-50/70">
                          <td className="py-3 font-bold text-slate-900">{p.examName}</td>
                          <td className="py-3 text-slate-600">{p.subject} • {p.category}</td>
                          <td className="py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800">
                              {p.examStatus}
                            </span>
                          </td>
                          <td className="py-3 font-mono">{p.versionsCount}</td>
                          <td className="py-3">
                            {p.encrypted ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                AES-256-GCM
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">Unencrypted</span>
                            )}
                          </td>
                          <td className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                p.isUnlocked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {p.isUnlocked ? 'UNLOCKED' : 'TIME-LOCKED'}
                            </span>
                          </td>
                          <td className="py-3 font-mono">
                            {p.totalPrinted} / {p.maxCopies}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {paperSubTab === 'encryption' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paperOverview.map(p => (
                    <div key={p.examId} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex justify-between items-center">
                        <h4 className="font-bold text-slate-900 text-sm">{p.examName}</h4>
                        <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-200 font-bold">
                          {p.algorithm || 'AES-256-GCM'}
                        </span>
                      </div>
                      <div className="text-xs space-y-1 text-slate-600 font-mono">
                        <div>Checksum SHA-256: <span className="text-slate-800">{p.checksumSha256?.substring(0, 24) || 'Computed at packaging'}...</span></div>
                        <div>Encrypted At: <span className="text-slate-800">{p.encryptedAt ? new Date(p.encryptedAt).toLocaleString() : 'N/A'}</span></div>
                        <div>Shamir Secret Shares: <span className="text-emerald-800 font-bold">{p.shamirSharesCount} total (Threshold: {p.shamirThreshold})</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {paperSubTab === 'unlock' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paperOverview.map(p => (
                    <div key={p.examId} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">{p.examName}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.isUnlocked ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.isUnlocked ? 'DECRYPTABLE' : 'HARDWARE TIME-LOCKED'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-600 font-mono space-y-1">
                        <div>Exam Date: {p.examDate} at {p.examTime}</div>
                        <div>Scheduled Unlock Time: {p.unlockTime}</div>
                        <div>Early Unlock Requested: {p.earlyUnlockPending ? <strong className="text-amber-700">YES (PENDING REVIEW)</strong> : 'No'}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {paperSubTab === 'printing' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {paperOverview.map(p => (
                    <div key={p.examId} className="p-4 rounded-xl border border-slate-200 bg-white space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">{p.examName}</span>
                        <span className="text-[10px] font-bold text-slate-500">Quota Cap: {p.maxCopies}</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-emerald-600 h-full transition-all"
                          style={{ width: `${Math.min(100, (p.totalPrinted / (p.maxCopies || 1)) * 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-slate-600 font-mono flex justify-between">
                        <span>Printed: {p.totalPrinted} copies</span>
                        <span className="text-rose-700 font-bold">Quota Violations: {p.printQuotaViolations}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {paperSubTab === 'lifecycle' && (
                <div className="space-y-3">
                  {paperOverview.map(p => (
                    <div key={p.examId} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{p.examName}</div>
                        <div className="text-slate-500">{p.subject} • Status: {p.examStatus}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-mono text-[11px] font-bold text-slate-700">
                          {p.versionsCount} Versions Authored
                        </span>
                        <span className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-mono text-[11px] font-bold text-emerald-800">
                          {p.encrypted ? 'Encrypted' : 'Draft'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {paperSubTab === 'watermark' && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 text-slate-700">
                  <h4 className="font-bold text-slate-900 text-sm">Dynamic Multi-Layer Watermark Architecture</h4>
                  <p>
                    Every printed examination sheet embeds unique forensic identifiers:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-slate-600">
                    <li>Visible header/footer watermark: Organization ID, Centre Code, Operator Email, and Timestamp.</li>
                    <li>Steganographic dot matrix & Microtext: Serialized Copy ID and SHA-256 distribution hash.</li>
                    <li>Relay Verification: Scanned fragments can be forensic-matched under Watermark Investigations.</li>
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* THREATS & FORENSICS: SECURITY & THREAT EVENTS */}
      {activeSubTab === 'security_events' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                Threat Telemetry
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Security & Threat Incident Investigation</h3>
              <p className="text-xs text-slate-500">Anomaly detection, isolation forest risk scores, and audited incident resolution workflow.</p>
            </div>
          </div>

          {securityEvents.length === 0 ? (
            <p className="text-xs text-slate-400 py-12 text-center">No threats detected. All systems operating normally.</p>
          ) : (
            <div className="space-y-3">
              {securityEvents.map(e => (
                <div
                  key={e.id}
                  className="p-4 rounded-xl bg-white hover:bg-slate-50/60 border border-slate-200 shadow-xs text-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-all"
                >
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
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
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                        Status: {e.status || (e.resolved ? 'RESOLVED' : 'OPEN')}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 font-mono flex items-center gap-3 flex-wrap">
                      <span>Operator: <strong className="text-slate-800">{e.user_email || 'Anonymous'}</strong> ({e.role || 'N/A'})</span>
                      <span>•</span>
                      <span>Risk Score: {e.risk_score}</span>
                      <span>•</span>
                      <span>IP: {e.ip_address}</span>
                      <span>•</span>
                      <span>{new Date(e.timestamp).toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Investigation Pipeline Actions */}
                  <div className="flex items-center gap-2 self-start lg:self-center">
                    <button
                      onClick={() => setSelectedSecurityEvent(e)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Investigate
                    </button>
                    {!e.resolved && (
                      <button
                        onClick={() => handleTransitionSecurityEvent(e.id, 'RESOLVED')}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* THREATS & FORENSICS: PROCTORING & EVIDENCE */}
      {(activeSubTab === 'proctoring_evidence' || activeSubTab === 'proctor_dashboard') && (
        <div className="space-y-5">
          {/* Subtab Switcher */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setProctoringSubTab('surveillance')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  proctoringSubTab === 'surveillance'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Live Enclave Surveillance
              </button>
              <button
                onClick={() => setProctoringSubTab('evidence')}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  proctoringSubTab === 'evidence'
                    ? 'bg-emerald-700 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                Secure Evidence Vault
              </button>
            </div>
          </div>

          {proctoringSubTab === 'surveillance' ? (
            <AuthoritySurveillanceDashboard currentUser={currentUser} />
          ) : (
            <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                  Camera Evidence Vault
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">Cryptographic Camera Evidence Storage</h3>
                <p className="text-xs text-slate-500">
                  Tamper-verified photo evidence captured during legitimate proctoring sessions.
                </p>
              </div>

              {evidenceList.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 space-y-1">
                  <Camera className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="font-semibold text-slate-600">No camera evidence captured yet.</p>
                  <p>Evidence is only recorded when legitimate proctoring sessions are initiated with user camera permission.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {evidenceList.map(ev => (
                    <div key={ev.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-bold text-slate-900 text-xs">{ev.id}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                            ev.integrity_status === 'VALID'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          <span>{ev.integrity_status === 'VALID' ? 'INTEGRITY: VALID' : 'TAMPERED'}</span>
                        </span>
                      </div>

                      {ev.image_data && (
                        <div className="h-40 rounded-lg overflow-hidden bg-slate-200 border border-slate-200 flex items-center justify-center">
                          <img src={ev.image_data} alt="Evidence snapshot" className="h-full w-full object-cover" />
                        </div>
                      )}

                      <div className="text-[11px] font-mono text-slate-600 space-y-0.5">
                        <div>Operator: {ev.user_name || ev.user_email || 'Enclave Candidate'}</div>
                        <div>Exam: {ev.exam_name || 'Enclave Examination'}</div>
                        <div>Captured: {new Date(ev.captured_at).toLocaleString()}</div>
                        <div className="truncate text-slate-400 text-[10px]">SHA-256: {ev.hash}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* THREATS & FORENSICS: WATERMARK INVESTIGATIONS */}
      {activeSubTab === 'watermark_investigations' && (
        <div className="space-y-6">
          {/* Investigation Form Workbench */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                Anti-Leak Forensics
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">Watermark Leak Investigation Workbench</h3>
              <p className="text-xs text-slate-500">
                Resolve leaked question paper copies to the exact examination, printing center, and authorized operator.
              </p>
            </div>

            <form onSubmit={handleInvestigateWatermark} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">Leak Source Type</label>
                  <select
                    value={leakSourceType}
                    onChange={e => setLeakSourceType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  >
                    <option value="LEAKED_PDF">Leaked PDF</option>
                    <option value="LEAKED_IMAGE">Leaked Image</option>
                    <option value="LEAKED_PHOTO">Leaked Photograph</option>
                    <option value="VISIBLE_WATERMARK">Visible Watermark Text</option>
                    <option value="FORENSIC_WATERMARK">Forensic Serial Hash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Document Reference / Filename</label>
                  <input
                    type="text"
                    placeholder="e.g. photo_leak_hall_4.jpg"
                    value={inputReference}
                    onChange={e => setInputReference(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-slate-600 font-bold mb-1">Extracted Signature / Copy ID / Tx Hash</label>
                  <input
                    type="text"
                    placeholder="e.g. COPY-000001 or 0x..."
                    value={extractedSignature}
                    onChange={e => setExtractedSignature(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={investigating}
                className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold cursor-pointer transition-colors flex items-center gap-2"
              >
                <Search className="w-4 h-4" />
                <span>{investigating ? 'Analyzing Forensics...' : 'Execute Leak Investigation'}</span>
              </button>
            </form>

            {/* Latest Result Banner */}
            {latestInvestigationResult && (
              <div
                className={`p-4 rounded-xl border mt-4 text-xs space-y-2 ${
                  latestInvestigationResult.status === 'VERIFIED'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : latestInvestigationResult.status === 'TAMPERED'
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-slate-50 border-slate-300 text-slate-800'
                }`}
              >
                <div className="flex justify-between items-center font-bold">
                  <span>Investigation Result: {latestInvestigationResult.status}</span>
                  <span className="font-mono text-[10px]">{latestInvestigationResult.id}</span>
                </div>

                {latestInvestigationResult.status === 'VERIFIED' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px] pt-1 border-t border-emerald-200">
                    <div>Exam: <strong>{latestInvestigationResult.resolved_exam_name || 'N/A'}</strong></div>
                    <div>Copy ID: <strong>{latestInvestigationResult.resolved_copy_id || 'N/A'}</strong></div>
                    <div>Centre: <strong>{latestInvestigationResult.resolved_centre_name || 'N/A'}</strong></div>
                    <div>Operator: <strong>{latestInvestigationResult.resolved_operator_email || 'N/A'}</strong></div>
                  </div>
                ) : (
                  <p className="text-[11px]">
                    {latestInvestigationResult.status === 'TAMPERED'
                      ? 'The watermark signature or format was recognized, but the transaction proof is invalid or tampered.'
                      : 'No recorded print transaction matches this watermark payload.'}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Past Investigations Ledger */}
          <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-emerald-700" />
              <span>Historical Leak Investigation Ledger</span>
            </h3>

            {investigations.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No forensic investigations conducted yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 font-semibold text-[11px]">
                      <th className="pb-2.5">Date</th>
                      <th className="pb-2.5">Investigation ID</th>
                      <th className="pb-2.5">Type</th>
                      <th className="pb-2.5">Signature</th>
                      <th className="pb-2.5">Outcome</th>
                      <th className="pb-2.5">Resolved Copy</th>
                      <th className="pb-2.5">Centre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {investigations.map(inv => (
                      <tr key={inv.id} className="hover:bg-slate-50/70">
                        <td className="py-2.5 font-mono text-slate-500">{new Date(inv.created_at).toLocaleString()}</td>
                        <td className="py-2.5 font-mono font-bold text-slate-900">{inv.id}</td>
                        <td className="py-2.5 text-slate-600">{inv.leak_source_type}</td>
                        <td className="py-2.5 font-mono text-[10px] text-slate-500">{inv.extracted_signature || 'N/A'}</td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inv.status === 'VERIFIED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : inv.status === 'TAMPERED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="py-2.5 font-mono text-[11px]">{inv.resolved_copy_id || '—'}</td>
                        <td className="py-2.5 text-slate-600">{inv.resolved_centre_name || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* REPORTS: SECURITY REPORTS / USER ACTIVITY REPORTS */}
      {(activeSubTab === 'security_reports' || activeSubTab === 'user_activity_reports') && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-5">
          <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200">
                Auditor Intelligence
              </span>
              <h3 className="text-lg font-bold text-slate-900 mt-1">
                {activeSubTab === 'security_reports' ? 'Institutional Security & Threat Reports' : 'Comprehensive User & Session Activity Reports'}
              </h3>
              <p className="text-xs text-slate-500">Live aggregated statistics and downloadable forensic export.</p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleExportReport('json')}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export JSON</span>
              </button>
              <button
                onClick={() => handleExportReport('csv')}
                className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Date Filter */}
          <div className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200 flex items-center gap-3 text-xs flex-wrap">
            <span className="font-bold text-slate-700">Date Range:</span>
            <input
              type="date"
              value={reportDateFrom}
              onChange={e => setReportDateFrom(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={reportDateTo}
              onChange={e => setReportDateTo(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs"
            />
            <button
              onClick={loadTabContent}
              className="px-3.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg cursor-pointer"
            >
              Update Metrics
            </button>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500">Total Events Logged</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{reportSummary?.totalEvents ?? 0}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500">Successful Logins</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{reportSummary?.successfulLogins ?? 0}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500">Failed Logins</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{reportSummary?.failedLogins ?? 0}</p>
            </div>
            <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200">
              <span className="text-[11px] font-medium text-rose-700">High / Critical Alerts</span>
              <p className="text-2xl font-black text-rose-700 mt-1">{reportSummary?.highCriticalEvents ?? 0}</p>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <span className="text-[11px] font-medium text-slate-500">Print Events</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{reportSummary?.printEvents ?? 0}</p>
            </div>
          </div>

          {/* Category Breakdown */}
          {reportSummary?.byCategory && Object.keys(reportSummary.byCategory).length > 0 && (
            <div className="p-4 rounded-xl bg-white border border-slate-200 space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Breakdown by Event Category</h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                {Object.entries(reportSummary.byCategory).map(([cat, count]) => (
                  <div key={cat} className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                    <span className="text-[10px] text-slate-500 font-bold block">{cat}</span>
                    <span className="text-lg font-black text-slate-800">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* INSPECT AUDIT EVENT MODAL */}
      {selectedAuditEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                  {selectedAuditEvent.event_category || 'SYSTEM'}
                </span>
                <h3 className="text-base font-bold text-slate-900">{selectedAuditEvent.event_type}</h3>
              </div>
              <button onClick={() => setSelectedAuditEvent(null)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px]">
                <div>Event ID: <strong className="text-slate-800">{selectedAuditEvent.id}</strong></div>
                <div>Created: <strong className="text-slate-800">{new Date(selectedAuditEvent.created_at).toLocaleString()}</strong></div>
                <div>Operator: <strong className="text-slate-800">{selectedAuditEvent.user_email || 'System'}</strong></div>
                <div>Role: <strong className="text-slate-800">{selectedAuditEvent.role || 'CORE'}</strong></div>
                <div>IP Address: <strong className="text-slate-800">{selectedAuditEvent.ip_address}</strong></div>
                <div>Status: <strong className="text-slate-800">{selectedAuditEvent.status}</strong></div>
              </div>

              {/* Hashes */}
              <div className="p-3.5 rounded-xl bg-emerald-50/50 border border-emerald-200 font-mono text-[10px] space-y-1 text-slate-700">
                <div>Previous Hash: <span className="text-slate-500 break-all">{selectedAuditEvent.previous_event_hash || 'GENESIS'}</span></div>
                <div>Event Hash: <span className="text-emerald-800 font-bold break-all">{selectedAuditEvent.event_hash || selectedAuditEvent.tx_ref}</span></div>
              </div>

              {/* Details JSON */}
              {selectedAuditEvent.details_json && (
                <div className="space-y-1">
                  <span className="font-bold text-slate-700 text-[11px]">Metadata Details:</span>
                  <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 font-mono text-[10px] overflow-x-auto max-h-48">
                    {JSON.stringify(JSON.parse(selectedAuditEvent.details_json), null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedAuditEvent(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl cursor-pointer text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USER SECURITY PROFILE MODAL */}
      {selectedUserProfile && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  User Security Profile
                </span>
                <h3 className="text-lg font-black text-slate-900 mt-1">{selectedUserProfile.user.full_name}</h3>
                <p className="text-xs text-slate-500 font-mono">{selectedUserProfile.user.email} • Role: {selectedUserProfile.user.role}</p>
              </div>
              <button onClick={() => setSelectedUserProfile(null)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bound Devices */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Registered Workstations</h4>
              {selectedUserProfile.devices.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No devices bound to this user.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {selectedUserProfile.devices.map(d => (
                    <div key={d.id} className="p-3 rounded-lg border border-slate-200 bg-slate-50 font-mono text-[11px] space-y-0.5">
                      <div>Name: <strong>{d.device_name || 'Enclave Terminal'}</strong></div>
                      <div>Status: <span className="font-bold text-emerald-800">{d.status}</span></div>
                      <div className="text-[10px] text-slate-400 truncate">UUID: {d.device_uuid}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Sessions */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Recent Login Sessions</h4>
              {selectedUserProfile.recentSessions.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No login sessions recorded.</p>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 text-[10px]">
                      <tr>
                        <th className="p-2">Login</th>
                        <th className="p-2">Logout</th>
                        <th className="p-2">Result</th>
                        <th className="p-2">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                      {selectedUserProfile.recentSessions.map(s => (
                        <tr key={s.id}>
                          <td className="p-2">{new Date(s.login_time).toLocaleString()}</td>
                          <td className="p-2">{s.logout_time ? new Date(s.logout_time).toLocaleString() : 'Active'}</td>
                          <td className="p-2 font-bold">{s.auth_result}</td>
                          <td className="p-2 text-slate-400">{s.ip_address}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Security Incidents Involving User */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Security Alerts</h4>
              {selectedUserProfile.securityIncidents.length === 0 ? (
                <p className="text-xs text-emerald-700 italic">No security incidents associated with this user.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedUserProfile.securityIncidents.map(inc => (
                    <div key={inc.id} className="p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs flex justify-between items-center">
                      <div>
                        <strong className="text-rose-900">{inc.event_type}</strong>
                        <span className="text-[10px] text-slate-500 ml-2 font-mono">{new Date(inc.timestamp).toLocaleString()}</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-200 text-rose-900">
                        {inc.severity}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedUserProfile(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl cursor-pointer text-xs"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEVICE AUDIT HISTORY MODAL */}
      {selectedDeviceHistory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  Device Forensic History
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedDeviceHistory.device.device_name || 'Enclave Terminal'}</h3>
                <p className="text-xs text-slate-500 font-mono">UUID: {selectedDeviceHistory.device.device_uuid}</p>
              </div>
              <button onClick={() => setSelectedDeviceHistory(null)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Device Audit Events</h4>
              {selectedDeviceHistory.events.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No specific audit entries recorded for this device.</p>
              ) : (
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {selectedDeviceHistory.events.map(ev => (
                    <div key={ev.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs flex justify-between items-center">
                      <div>
                        <strong className="text-slate-900">{ev.event_type}</strong>
                        <span className="text-[10px] text-slate-500 font-mono ml-2">{new Date(ev.created_at).toLocaleString()}</span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-400">{ev.tx_ref?.substring(0, 12)}...</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedDeviceHistory(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl cursor-pointer text-xs"
              >
                Close History
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SECURITY EVENT INVESTIGATION / TRANSITION MODAL */}
      {selectedSecurityEvent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                  Incident Investigation
                </span>
                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedSecurityEvent.event_type}</h3>
              </div>
              <button onClick={() => setSelectedSecurityEvent(null)} className="cursor-pointer text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-[11px] space-y-1 text-slate-700">
                <div>Severity: <strong className="text-rose-700">{selectedSecurityEvent.severity}</strong></div>
                <div>Risk Score: <strong className="text-slate-900">{selectedSecurityEvent.risk_score}</strong></div>
                <div>Operator: <strong>{selectedSecurityEvent.user_email || 'Anonymous'}</strong></div>
                <div>Current Status: <strong className="text-emerald-800">{selectedSecurityEvent.status || (selectedSecurityEvent.resolved ? 'RESOLVED' : 'OPEN')}</strong></div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Update Status Pipeline:</label>
                <div className="grid grid-cols-3 gap-2">
                  {['INVESTIGATING', 'ACTION_TAKEN', 'RESOLVED', 'DISMISSED'].map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setTransitionStatus(st)}
                      className={`py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        transitionStatus === st
                          ? 'bg-emerald-700 text-white border-emerald-800'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">Investigation Notes & Remarks:</label>
                <textarea
                  rows={3}
                  value={transitionNotes}
                  onChange={e => setTransitionNotes(e.target.value)}
                  placeholder="Record forensic actions taken or rationale for resolution..."
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2 text-xs">
              <button
                onClick={() => setSelectedSecurityEvent(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleTransitionSecurityEvent(selectedSecurityEvent.id, transitionStatus)}
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl cursor-pointer transition-colors"
              >
                Commit Status Transition
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

