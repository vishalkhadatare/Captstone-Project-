import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer,
  RefreshCw,
  Clock,
  ShieldCheck,
  Building2,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Search,
  Filter,
  Lock,
  Unlock,
  Radio,
} from 'lucide-react';
import { PrintAnywhereJob } from '../types';
import { api } from '../api';

interface PrintAnywhereMonitorSectionProps {
  variant: 'CONTROLLER' | 'OWNER';
  title?: string;
  showHeaderBadge?: boolean;
}

export const PrintAnywhereMonitorSection: React.FC<PrintAnywhereMonitorSectionProps> = ({
  variant,
  title,
  showHeaderBadge = true,
}) => {
  const [jobs, setJobs] = useState<PrintAnywhereJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<'ALL' | 'UNIVERSITY' | 'COMPETITIVE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const loadJobs = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.getPrintAnywhereJobs();
      setJobs(res.jobs || []);
    } catch (err) {
      console.error('Failed to load print anywhere jobs:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
    const interval = setInterval(() => {
      loadJobs(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  const filteredJobs = jobs.filter(job => {
    if (filterType !== 'ALL' && job.examType !== filterType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = job.examName.toLowerCase().includes(q);
      const matchCentre = (job.centreName || job.centreId).toLowerCase().includes(q);
      const matchPrinter = job.printerName.toLowerCase().includes(q);
      const matchOperator = (job.operatorName || '').toLowerCase().includes(q);
      if (!matchName && !matchCentre && !matchPrinter && !matchOperator) {
        return false;
      }
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PRINTED_SUCCESSFULLY':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-[10px] font-bold">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            <span>Printed Successfully</span>
          </span>
        );
      case 'PRINTING':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-100 text-blue-900 border border-blue-300 text-[10px] font-bold animate-pulse">
            <Printer className="w-3 h-3 text-blue-600" />
            <span>Printing</span>
          </span>
        );
      case 'PRINT_REQUESTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold">
            <Clock className="w-3 h-3 text-amber-600" />
            <span>Print Requested</span>
          </span>
        );
      case 'PRINT_FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-[10px] font-bold">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            <span>Print Failed</span>
          </span>
        );
      case 'PRINTER_OFFLINE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200 text-slate-800 border border-slate-300 text-[10px] font-bold">
            <span>Printer Offline</span>
          </span>
        );
      case 'PRINTER_NOT_AVAILABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200 text-slate-800 border border-slate-300 text-[10px] font-bold">
            <span>Printer Not Available</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="space-y-0.5">
          {showHeaderBadge && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 text-[10px] font-bold uppercase tracking-wider">
                {variant === 'CONTROLLER' ? 'Controller of Examination Surveillance' : 'Organization Owner Monitoring'}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-mono font-bold">
                Print Anywhere Live Status
              </span>
            </div>
          )}
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 mt-1">
            <Printer className="w-5 h-5 text-indigo-600" />
            <span>{title || (variant === 'CONTROLLER' ? 'Examination Printing Status Monitoring' : 'Examination Print Anywhere Status')}</span>
          </h3>
          <p className="text-xs text-slate-500">
            Real-time audit tracking of paper release &amp; printing across all examination centres (University &amp; Competitive).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadJobs(false)}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setFilterType('ALL')}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
              filterType === 'ALL'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Exams ({jobs.length})
          </button>
          <button
            onClick={() => setFilterType('UNIVERSITY')}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
              filterType === 'UNIVERSITY'
                ? 'bg-white text-indigo-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            University ({jobs.filter(j => j.examType === 'UNIVERSITY').length})
          </button>
          <button
            onClick={() => setFilterType('COMPETITIVE')}
            className={`px-3 py-1 rounded-lg font-bold text-xs transition-all ${
              filterType === 'COMPETITIVE'
                ? 'bg-white text-emerald-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Competitive ({jobs.filter(j => j.examType === 'COMPETITIVE').length})
          </button>
        </div>

        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search exam, centre, printer..."
            className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 w-full sm:w-60 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
              <th className="py-2.5 px-3">Exam Name</th>
              <th className="py-2.5 px-3">Type</th>
              <th className="py-2.5 px-3">Centre</th>
              <th className="py-2.5 px-3">Unlock Time</th>
              <th className="py-2.5 px-3">Selected Printer</th>
              <th className="py-2.5 px-3">Printing Status</th>
              {variant === 'CONTROLLER' && (
                <>
                  <th className="py-2.5 px-3">Print Requested</th>
                  <th className="py-2.5 px-3">Print Completed</th>
                  <th className="py-2.5 px-3">Centre Superintendent</th>
                </>
              )}
              {variant === 'OWNER' && (
                <th className="py-2.5 px-3">Printed At</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredJobs.length === 0 ? (
              <tr>
                <td
                  colSpan={variant === 'CONTROLLER' ? 9 : 7}
                  className="py-8 text-center text-slate-400 text-xs"
                >
                  <Printer className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <p className="font-bold text-slate-600">No print anywhere transactions recorded yet.</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    When an authorized Centre Superintendent &amp; Operator dispatches a decrypted paper to a centre printer at unlock time, its live status will display here.
                  </p>
                </td>
              </tr>
            ) : (
              filteredJobs.map(job => (
                <tr key={job.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-3">
                    <span className="font-bold text-slate-900 block">{job.examName}</span>
                    <span className="text-[10px] text-slate-400 font-mono block">{job.paperId}</span>
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        job.examType === 'COMPETITIVE'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-indigo-100 text-indigo-900'
                      }`}
                    >
                      {job.examType}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-semibold text-slate-800 block">{job.centreName}</span>
                    <span className="text-[10px] text-slate-400 font-mono block">{job.centreId}</span>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                    {job.unlockTime || '—'}
                  </td>
                  <td className="py-3 px-3">
                    <span className="font-bold text-slate-900 block">{job.printerName}</span>
                    <span className="text-[10px] text-slate-400 block">{job.printerLocation}</span>
                  </td>
                  <td className="py-3 px-3 whitespace-nowrap">
                    {getStatusBadge(job.status)}
                    {job.failureReason && (
                      <span className="block text-[10px] text-rose-600 mt-1 max-w-xs truncate" title={job.failureReason}>
                        Reason: {job.failureReason}
                      </span>
                    )}
                  </td>
                  {variant === 'CONTROLLER' && (
                    <>
                      <td className="py-3 px-3 font-mono text-slate-500 whitespace-nowrap text-[11px]">
                        {new Date(job.requestedAt).toLocaleTimeString()}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap text-[11px]">
                        {job.completedAt ? new Date(job.completedAt).toLocaleTimeString() : '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-800 text-xs">
                        <span className="font-bold block">{job.operatorName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{job.operatorId}</span>
                      </td>
                    </>
                  )}
                  {variant === 'OWNER' && (
                    <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap text-[11px]">
                      {job.completedAt ? new Date(job.completedAt).toLocaleTimeString() : '—'}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

