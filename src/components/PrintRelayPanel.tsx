import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Examination, PrintRelayDevice, PrintRelayStation } from '../types';
import {
  Wifi,
  Printer,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Lock,
  Unlock,
  Pause,
  Play,
  Power,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Laptop,
  KeyRound,
} from 'lucide-react';

interface PrintRelayPanelProps {
  exams: Examination[];
  /** Lets the parent refresh its print ledger when a relay releases a copy. */
  onActivity?: () => void;
}

const STATUS_STYLES: Record<PrintRelayStation['status'], string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  PAUSED: 'bg-amber-50 text-amber-800 border-amber-200',
  LOCKED: 'bg-rose-50 text-rose-800 border-rose-200',
  REVOKED: 'bg-slate-100 text-slate-600 border-slate-200',
  EXPIRED: 'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * The Wi-Fi print relay.
 *
 * Controlled printing used to live entirely on the operator's own workstation.
 * This panel opens the same controlled print path to every device on the
 * centre's Wi-Fi - a spare laptop at another desk, a phone, a tablet - without
 * giving anyone a file. Each device must know the six-digit pairing code and be
 * admitted here by hand, and every sheet it prints is stamped to that device and
 * written to the same serialized copy ledger.
 */
export const PrintRelayPanel: React.FC<PrintRelayPanelProps> = ({ exams, onActivity }) => {
  const [stations, setStations] = useState<PrintRelayStation[]>([]);
  const [lanAddresses, setLanAddresses] = useState<string[]>([]);
  const [beaconPort, setBeaconPort] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const [selectedExamId, setSelectedExamId] = useState('');
  const [label, setLabel] = useState('');
  const [requireApproval, setRequireApproval] = useState(true);
  const [ttlMinutes, setTtlMinutes] = useState(30);

  const load = useCallback(async () => {
    try {
      const res = await api.getPrintRelays();
      setStations(res.stations || []);
      setLanAddresses(res.lanAddresses || []);
      setBeaconPort(res.beaconPort ?? null);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not read the print relays.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // Devices appear and are admitted elsewhere, so the panel polls rather than
    // trusting the state it fetched when it mounted.
    const timer = window.setInterval(load, 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = async (key: string, action: () => Promise<any>, successText?: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successText) setNotice(successText);
      await load();
    } catch (err: any) {
      setError(err.message || 'The relay action failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleOpen = () => {
    if (!selectedExamId) {
      setError('Choose the examination this relay may release.');
      return;
    }
    const exam = exams.find(entry => entry.id === selectedExamId);
    run(
      'open',
      () =>
        api.openPrintRelay({
          exam_id: selectedExamId,
          label: label.trim() || undefined,
          require_device_approval: requireApproval,
          ttl_minutes: ttlMinutes,
        }),
      `Print relay open for ${exam?.name || 'the examination'}. Read the pairing code out to the printing desk.`
    );
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied(current => (current === value ? null : current)), 1500);
    } catch {
      setError('Clipboard is blocked in this window; select the link and copy it by hand.');
    }
  };

  const pendingDevices = stations.reduce(
    (total, station) => total + station.devices.filter(device => device.status === 'PENDING_APPROVAL').length,
    0
  );

  return (
    <div className="space-y-4">
      {/* OPEN A RELAY */}
      <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-indigo-600" />
              Wi-Fi Secure Print Relay
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Open the controlled print path to every device on this centre's Wi-Fi. No account and no install on
              the printing device: it opens a link in its own browser, types the pairing code you read out, waits
              for you to admit it, and prints. Each sheet is stamped with that device and logged as a serialized copy.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {pendingDevices > 0 && (
              <span className="px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold">
                {pendingDevices} device{pendingDevices === 1 ? '' : 's'} waiting
              </span>
            )}
            <button
              onClick={load}
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-xs font-medium hover:bg-slate-200 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Sync</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <label className="lg:col-span-2 block">
            <span className="text-slate-600 font-bold block mb-1">Examination to release</span>
            <select
              value={selectedExamId}
              onChange={event => setSelectedExamId(event.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
            >
              <option value="">-- Choose examination --</option>
              {exams.map(exam => (
                <option key={exam.id} value={exam.id}>
                  {exam.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-slate-600 font-bold block mb-1">Relay label (optional)</span>
            <input
              value={label}
              onChange={event => setLabel(event.target.value)}
              placeholder="e.g. Desk 2 printer"
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
            />
          </label>

          <label className="block">
            <span className="text-slate-600 font-bold block mb-1">Open for</span>
            <select
              value={ttlMinutes}
              onChange={event => setTtlMinutes(Number(event.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900"
            >
              {[10, 15, 30, 60, 120].map(minutes => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="flex items-start gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={event => setRequireApproval(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong className="text-slate-800">Require my approval per device.</strong> A device that knows the
              pairing code still prints nothing until you admit it in the list below. Turn this off only for a
              dedicated, attended printing desk.
            </span>
          </label>

          <button
            onClick={handleOpen}
            disabled={busy === 'open' || !selectedExamId}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors shrink-0"
          >
            {busy === 'open' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            <span>{busy === 'open' ? 'Opening...' : 'Open Wi-Fi print relay'}</span>
          </button>
        </div>

        {lanAddresses.length > 0 && (
          <p className="text-[11px] text-slate-500">
            Devices reach this terminal at{' '}
            <span className="font-mono text-slate-700">{lanAddresses.map(address => `http://${address}:3000`).join('  •  ')}</span>
            {beaconPort ? ` and the relay announces itself automatically on UDP ${beaconPort}.` : '.'}
          </p>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{notice}</span>
          </div>
        )}
      </div>

      {/* LIVE RELAYS */}
      {stations.length === 0 ? (
        <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs text-center text-xs text-slate-400">
          No print relay is open. Nothing on this Wi-Fi can reach an examination paper until you open one.
        </div>
      ) : (
        stations.map(station => (
          <div key={station.id} className="p-6 rounded-xl bg-white border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-slate-900">{station.label}</h4>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${STATUS_STYLES[station.status]}`}>
                    {station.status}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200">
                    {station.remaining}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  {station.examName} • {station.prints} of {station.maxPrints} copies released • {station.lastEvent}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {station.status === 'LOCKED' && (
                  <button
                    onClick={() => run(`unlock-${station.id}`, () => api.unlockPrintRelay(station.id), 'Relay unlocked.')}
                    disabled={busy === `unlock-${station.id}`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-[11px] font-bold"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock</span>
                  </button>
                )}
                {(station.status === 'ACTIVE' || station.status === 'PAUSED') && (
                  <button
                    onClick={() =>
                      run(
                        `pause-${station.id}`,
                        () => api.pausePrintRelay(station.id, station.status === 'ACTIVE'),
                        station.status === 'ACTIVE' ? 'Relay paused.' : 'Relay resumed.'
                      )
                    }
                    disabled={busy === `pause-${station.id}`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold"
                  >
                    {station.status === 'ACTIVE' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{station.status === 'ACTIVE' ? 'Pause' : 'Resume'}</span>
                  </button>
                )}
                <button
                  onClick={() => run(`close-${station.id}`, () => api.closePrintRelay(station.id), 'Relay closed and every device dropped.')}
                  disabled={busy === `close-${station.id}`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-bold"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Close relay</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* PAIRING CODE */}
              <div className="p-4 rounded-xl bg-slate-950 text-slate-100 space-y-2">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-slate-400 font-bold">
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Pairing code — read this to the printing desk</span>
                </div>
                <div className="font-mono text-4xl font-black tracking-[0.35em] text-white">{station.code}</div>
                <p className="text-[11px] text-slate-400">
                  {station.attemptsLeft} of 5 attempts left before this relay locks itself. The code is never sent to
                  any device; it only proves a human at the printing desk is allowed to ask.
                </p>
              </div>

              {/* HOW DEVICES REACH IT */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                  Open this on any device on the same Wi-Fi
                </div>
                {(station.urls && station.urls.length > 0 ? station.urls : []).map(url => (
                  <div key={url} className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-indigo-700 truncate flex-1">{url}</span>
                    <button
                      onClick={() => copy(url)}
                      className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:text-slate-800"
                      title="Copy link"
                    >
                      {copied === url ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                ))}
                <p className="text-[11px] text-slate-500">
                  Phones and tablets just open the link. Other ZeroLeak terminals discover the relay by themselves —
                  it announces itself on the local network, so nothing has to be typed in by hand.
                </p>
                <div className="flex items-start gap-2 text-[11px] text-slate-600 pt-1">
                  <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-emerald-600 shrink-0" />
                  <span>
                    {station.requireDeviceApproval
                      ? 'Every new device waits for your approval before it can print.'
                      : 'Devices are admitted automatically, without your approval step.'}
                  </span>
                </div>
              </div>
            </div>

            {/* ATTACHED DEVICES */}
            <div className="border-t border-slate-100 pt-3">
              <h5 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Laptop className="w-3.5 h-3.5 text-slate-400" />
                Devices on this relay ({station.devices.length})
              </h5>
              {station.devices.length === 0 ? (
                <p className="text-[11px] text-slate-400 mt-2">
                  Nothing has joined yet. Open the link above on the printing device and it will appear here.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {station.devices.map((device: PrintRelayDevice) => (
                    <div
                      key={device.fingerprint}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{device.label}</div>
                        <div className="text-[10px] text-slate-500 font-mono truncate">
                          {device.fingerprint} • {device.ip} • {device.prints} copy(ies)
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            device.status === 'APPROVED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : device.status === 'PENDING_APPROVAL'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {device.status.replace('_', ' ')}
                        </span>
                        {device.status === 'PENDING_APPROVAL' && (
                          <>
                            <button
                              onClick={() =>
                                run(`admit-${device.fingerprint}`, () => api.admitPrintRelayDevice(station.id, device.fingerprint), 'Device admitted.')
                              }
                              className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold"
                            >
                              Admit
                            </button>
                            <button
                              onClick={() =>
                                run(`deny-${device.fingerprint}`, () => api.refusePrintRelayDevice(station.id, device.fingerprint), 'Device refused.')
                              }
                              className="px-2.5 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold flex items-center gap-1"
                            >
                              <Ban className="w-3 h-3" />
                              Refuse
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))
      )}

      {/* WHAT PROTECTS IT */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-xs space-y-2">
        <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-indigo-600" />
          What guards a Wi-Fi print relay
        </h4>
        <ul className="text-[11px] text-slate-600 space-y-1 list-disc pl-5">
          <li>Only an authorised role on an approved workstation can open one, and only after the time-lock releases.</li>
          <li>A six-digit pairing code, compared in constant time, locks the whole relay after five wrong guesses.</li>
          <li>
            A device that knows the code still starts as <strong>PENDING APPROVAL</strong> and prints nothing until you
            admit it here.
          </li>
          <li>Copy quota and paper-version status are re-checked on every single sheet, not once when the relay opened.</li>
          <li>Each device has its own ceiling, each relay has its own ceiling, and the relay expires on its own.</li>
          <li>Every sheet carries the printing device's fingerprint, IP and timestamp, and lands in the same ledger as a workstation print.</li>
          <li>Closing the relay drops every attached device at once.</li>
        </ul>
      </div>
    </div>
  );
};
