import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { PrintSecurityArmResult, PrintSecurityCheck } from '../types';
import {
  ShieldAlert,
  ShieldCheck,
  KeyRound,
  Lock,
  CheckCircle2,
  AlertTriangle,
  X,
  Printer,
  Loader2,
  Clock,
} from 'lucide-react';

interface PrintSecurityGateProps {
  examId: string;
  examName: string;
  copies: number;
  onClose: () => void;
  /** Fired only after the server actually minted the copies. */
  onReleased: (message: string) => void;
}

/**
 * The security gate in front of the "printing point option".
 *
 * Opening a printer is not authorisation to print an examination paper, so this
 * modal splits the release into two server-enforced steps: re-authenticate with
 * the operator's own account password, then read back the one-time code the
 * server mints. The server refuses an unarmed release and burns the arming on
 * first use, so a replayed request cannot manufacture extra copies.
 */
export const PrintSecurityGate: React.FC<PrintSecurityGateProps> = ({
  examId,
  examName,
  copies,
  onClose,
  onReleased,
}) => {
  const [password, setPassword] = useState('');
  const [armed, setArmed] = useState<PrintSecurityArmResult | null>(null);
  const [checks, setChecks] = useState<PrintSecurityCheck[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!armed) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.round((armed.expiresAt - Date.now()) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [armed]);

  const readChecks = (err: any): PrintSecurityCheck[] => {
    const fromDetails = err?.details?.securityChecks;
    if (Array.isArray(fromDetails)) return fromDetails as PrintSecurityCheck[];
    if (Array.isArray(err?.details?.details?.securityChecks)) return err.details.details.securityChecks;
    return [];
  };

  const handleArm = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.armPrintRelease({
        exam_id: examId,
        copies_count: copies,
        password,
      });
      setArmed(result);
      setChecks(result.securityChecks || []);
      setPassword('');
    } catch (err: any) {
      setError(err.message || 'Could not arm the print release.');
      const fromServer = readChecks(err);
      if (fromServer.length) setChecks(fromServer);
    } finally {
      setBusy(false);
    }
  };

  const handleRelease = async () => {
    if (!armed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.printAuthorizedCopy(examId, armed.paperVersionId, copies, armed.securityToken, code);
      const first = result.copies[0]?.copyId;
      const last = result.copies[result.copies.length - 1]?.copyId;
      onReleased(
        first && last
          ? `${result.message} Serialized ${first}${first === last ? '' : ` to ${last}`}.`
          : result.message
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'The release was refused.');
      setArmed(null);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const expired = armed !== null && secondsLeft <= 0;
  const allClear = checks.length > 0 && checks.every(check => check.status === 'PASS');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600 border border-indigo-200">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                Print security gate
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {examName} • {copies} serialized copy({copies === 1 ? '' : 'ies'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Security checklist, straight from the server's evaluation */}
          {checks.length > 0 && (
            <div className="space-y-2">
              {checks.map(check => (
                <div
                  key={check.id}
                  className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-[11px] ${
                    check.status === 'PASS'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                      : check.status === 'WARN'
                        ? 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                        : 'bg-rose-50 border-rose-200 text-rose-900 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
                  }`}
                >
                  {check.status === 'PASS' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  )}
                  <div>
                    <div className="font-bold">{check.label}</div>
                    <div className="opacity-90">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!armed ? (
            <form onSubmit={handleArm} className="space-y-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Releasing copies requires your own account password. The server then mints a one-time code
                that you must read back below, and the authorisation is bound to this examination, this
                copy count and this workstation.
              </p>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Operator password
              </label>
              <div className="relative">
                <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  placeholder="Your ZeroLeak account password"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-xs"
                />
              </div>
              <button
                type="submit"
                disabled={busy || !password}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold shadow-md transition-colors"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>{busy ? 'Verifying...' : 'Re-authenticate & arm release'}</span>
              </button>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-center">
                <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                  One-time print authorisation code
                </div>
                <div className="font-mono text-3xl font-black tracking-[0.3em] text-slate-900 dark:text-white mt-1">
                  {armed.code}
                </div>
                <div className="mt-1 flex items-center justify-center gap-1.5 text-[10px] text-slate-500">
                  <Clock className="w-3 h-3" />
                  <span>
                    {expired ? 'expired — re-authenticate' : `valid for ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`}
                  </span>
                </div>
              </div>

              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300">
                Type the code to release {copies} copy({copies === 1 ? '' : 'ies'})
              </label>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={event => setCode(event.target.value.replace(/\D+/g, ''))}
                placeholder="000000"
                className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white font-mono text-center text-lg tracking-[0.3em]"
              />

              <div className="flex items-center gap-2">
                <button
                  onClick={handleRelease}
                  disabled={busy || code.length !== 6 || expired}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold shadow-md transition-colors"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                  <span>{busy ? 'Releasing...' : 'Release serialized copies'}</span>
                </button>
                <button
                  onClick={() => {
                    setArmed(null);
                    setCode('');
                    setError(null);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  Restart
                </button>
              </div>

              {allClear && (
                <p className="text-[10px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3" />
                  Every security control passed. This arming can be spent exactly once.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
