import React, { useState, useEffect } from 'react';
import {
  Printer,
  X,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Building2,
  Wifi,
  WifiOff,
  Radio,
  Loader2,
  Lock,
  Unlock,
  Check,
} from 'lucide-react';
import { PrinterItem, PrintAnywhereJob } from '../types';
import { api } from '../api';

interface PrinterSelectModalProps {
  isOpen: boolean;
  onClose: () => void;
  exam: {
    id: string;
    name: string;
    examType: 'UNIVERSITY' | 'COMPETITIVE';
    unlockTimeDisplay: string;
    paperId?: string;
    isUnlocked: boolean;
  } | null;
  centreId?: string;
  operatorName?: string;
  onPrintSuccess?: (job: PrintAnywhereJob) => void;
}

export const PrinterSelectModal: React.FC<PrinterSelectModalProps> = ({
  isOpen,
  onClose,
  exam,
  centreId,
  operatorName,
  onPrintSuccess,
}) => {
  const [printers, setPrinters] = useState<PrinterItem[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [selectedPrinterId, setSelectedPrinterId] = useState<string | null>(null);
  const [copiesCount, setCopiesCount] = useState<number>(1);
  const [statusStep, setStatusStep] = useState<'IDLE' | 'PRINT_REQUESTED' | 'PRINTING' | 'SUCCESS' | 'ERROR'>('IDLE');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [jobResult, setJobResult] = useState<PrintAnywhereJob | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPrinters();
      setStatusStep('IDLE');
      setErrorMessage(null);
      setJobResult(null);
      setCopiesCount(1);
    }
  }, [isOpen]);

  const loadPrinters = async () => {
    setLoadingPrinters(true);
    try {
      const res = await api.getPrinters();
      const list = res.printers || [];
      setPrinters(list);
      // Auto-select the default online printer or first online printer
      const defaultPrn = list.find(p => p.isDefault && p.status === 'ONLINE') || list.find(p => p.status === 'ONLINE');
      if (defaultPrn) {
        setSelectedPrinterId(defaultPrn.id);
      }
    } catch (err: any) {
      console.error('Failed to load centre printers:', err);
      setErrorMessage(err.message || 'Could not load available printers.');
    } finally {
      setLoadingPrinters(false);
    }
  };

  if (!isOpen || !exam) return null;

  const selectedPrinter = printers.find(p => p.id === selectedPrinterId);

  const handlePrint = async () => {
    if (!selectedPrinter) {
      setErrorMessage('Please select an active printer.');
      return;
    }
    if (selectedPrinter.status !== 'ONLINE') {
      setErrorMessage(`Selected printer "${selectedPrinter.name}" is OFFLINE. Please choose an online printer.`);
      setStatusStep('ERROR');
      return;
    }
    if (!exam.isUnlocked) {
      setErrorMessage(`Paper Locked – Printing will be available at ${exam.unlockTimeDisplay}`);
      setStatusStep('ERROR');
      return;
    }

    setErrorMessage(null);
    setStatusStep('PRINT_REQUESTED');

    try {
      // Small simulated tick for live status visibility ("Print Requested" -> "Printing")
      await new Promise(r => setTimeout(r, 600));
      setStatusStep('PRINTING');

      const res = await api.executePrintAnywhere({
        exam_type: exam.examType,
        exam_id: exam.id,
        paper_id: exam.paperId || exam.id,
        printer_id: selectedPrinter.id,
        copies_count: copiesCount,
      });

      setStatusStep('SUCCESS');
      setJobResult(res.job);
      if (onPrintSuccess) {
        onPrintSuccess(res.job);
      }
    } catch (err: any) {
      console.error('Print Anywhere execution failed:', err);
      setStatusStep('ERROR');
      setErrorMessage(err.message || 'Failed to dispatch paper to selected printer.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/30 border border-indigo-400/30 text-indigo-300">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                  Centre Superintendent &amp; Operator Enclave
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] font-mono font-bold">
                  Print Anywhere
                </span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">Select Printer &amp; Dispatch Paper</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Exam Summary Banner */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-bold uppercase text-slate-400">Target Examination</span>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>{exam.name}</span>
                  <span className="px-2 py-0.2 rounded bg-indigo-100 text-indigo-900 text-[10px] font-bold">
                    {exam.examType}
                  </span>
                </div>
              </div>

              {/* Unlock Time Status */}
              <div>
                {exam.isUnlocked ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold shadow-2xs">
                    <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Paper Unlocked – Ready for Printing</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300 text-xs font-bold shadow-2xs">
                    <Lock className="w-3.5 h-3.5 text-rose-700" />
                    <span>Paper Locked – Printing available at {exam.unlockTimeDisplay}</span>
                  </span>
                )}
              </div>
            </div>

            <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-4 border-t border-slate-200 pt-2">
              <span>
                Enclave Centre: <strong>{centreId || 'CTR-101'}</strong>
              </span>
              <span>
                Authorized Operator: <strong>{operatorName || 'Centre Superintendent'}</strong>
              </span>
              <span>
                Unlock Time: <strong className="text-slate-800">{exam.unlockTimeDisplay}</strong>
              </span>
            </div>
          </div>

          {/* Success Result View */}
          {statusStep === 'SUCCESS' && jobResult ? (
            <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-300 space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-emerald-900 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span>Paper Dispatched &amp; Printed Successfully!</span>
              </div>
              <div className="p-3 bg-white rounded-lg border border-emerald-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans font-bold">Exam:</span>
                  <span className="font-bold text-slate-900">
                    {exam.examType} – {exam.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans font-bold">Printer:</span>
                  <span className="font-bold text-indigo-900">{jobResult.printerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans font-bold">Status:</span>
                  <span className="font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                    Printed Successfully
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans font-bold">Printed At:</span>
                  <span className="text-slate-800">
                    {jobResult.completedAt ? new Date(jobResult.completedAt).toLocaleTimeString() : 'Just now'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans font-bold">Copies:</span>
                  <span className="text-slate-800">{jobResult.copiesCount} copy(ies)</span>
                </div>
                {jobResult.txHash && (
                  <div className="flex justify-between pt-1 border-t border-slate-100">
                    <span className="text-slate-500 font-sans font-bold">Tx Reference:</span>
                    <span className="text-[10px] text-slate-600 truncate max-w-xs">{jobResult.txHash}</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-emerald-800">
                The printed copy has been recorded in the central audit ledger and notified to the Controller of
                Examination and Organization Owner.
              </p>
            </div>
          ) : (
            <>
              {/* Printers List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Select Printer</span>
                  </label>
                  <span className="text-[11px] text-slate-500">Only online printers can be selected</span>
                </div>

                {loadingPrinters ? (
                  <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>Querying centre network printers...</span>
                  </div>
                ) : printers.length === 0 ? (
                  <div className="p-4 rounded-xl bg-slate-50 border text-center text-xs text-slate-500">
                    No printers configured for this examination centre.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {printers.map(printer => {
                      const isOnline = printer.status === 'ONLINE';
                      const isSelected = selectedPrinterId === printer.id;

                      return (
                        <div
                          key={printer.id}
                          onClick={() => {
                            if (isOnline) {
                              setSelectedPrinterId(printer.id);
                              setErrorMessage(null);
                            }
                          }}
                          className={`p-3 rounded-xl border-2 transition-all flex items-center justify-between gap-3 ${
                            !isOnline
                              ? 'bg-slate-50 border-slate-200 opacity-60 cursor-not-allowed'
                              : isSelected
                              ? 'bg-indigo-50/70 border-indigo-600 shadow-xs cursor-pointer'
                              : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                isSelected && isOnline
                                  ? 'border-indigo-600 bg-indigo-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && isOnline && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>

                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-xs text-slate-900">{printer.name}</span>
                                {printer.isDefault && (
                                  <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[9px] font-bold">
                                    Default
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">{printer.location}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{printer.type}</div>
                            </div>
                          </div>

                          <div className="shrink-0 flex items-center gap-2">
                            {isOnline ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span>Online</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-300 text-[10px] font-bold">
                                <WifiOff className="w-3 h-3 text-slate-400" />
                                <span>Offline</span>
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Selected Printer Display */}
              {selectedPrinter && (
                <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-indigo-700 block">Selected Printer</span>
                    <span className="font-bold text-xs text-indigo-950">
                      Selected Printer: {selectedPrinter.name}
                    </span>
                    <span className="text-[11px] text-indigo-700 block mt-0.5">{selectedPrinter.location}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="text-[11px] font-bold text-slate-700">Copies:</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={copiesCount}
                      onChange={e => setCopiesCount(Math.max(1, Math.min(50, Number(e.target.value) || 1)))}
                      className="w-16 px-2.5 py-1 bg-white border border-indigo-300 rounded-lg text-xs font-mono font-bold text-slate-900 text-center"
                    />
                  </div>
                </div>
              )}

              {/* In-flight Status Indicator */}
              {(statusStep === 'PRINT_REQUESTED' || statusStep === 'PRINTING') && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 flex items-center gap-3 animate-in fade-in">
                  <Loader2 className="w-5 h-5 text-amber-600 animate-spin shrink-0" />
                  <div className="text-xs">
                    <span className="font-bold text-amber-900 block">
                      Status:{' '}
                      {statusStep === 'PRINT_REQUESTED'
                        ? 'Print Requested – Validating Centre Credentials'
                        : `Printing in Progress on ${selectedPrinter?.name}...`}
                    </span>
                    <span className="text-[11px] text-amber-700">
                      Authorizing paper decryption, applying watermarks, and minting serialized copies.
                    </span>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
          >
            {statusStep === 'SUCCESS' ? 'Close' : 'Cancel'}
          </button>

          {statusStep === 'SUCCESS' ? (
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-xs"
            >
              Done
            </button>
          ) : (
            <button
              onClick={handlePrint}
              disabled={
                !exam.isUnlocked ||
                !selectedPrinter ||
                selectedPrinter.status !== 'ONLINE' ||
                statusStep === 'PRINT_REQUESTED' ||
                statusStep === 'PRINTING'
              }
              className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-xs ${
                !exam.isUnlocked
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : !selectedPrinter || selectedPrinter.status !== 'ONLINE'
                  ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  : 'bg-indigo-700 hover:bg-indigo-600 text-white shadow-indigo-700/20'
              }`}
            >
              {!exam.isUnlocked ? (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Printing Locked Until {exam.unlockTimeDisplay}</span>
                </>
              ) : statusStep === 'PRINT_REQUESTED' || statusStep === 'PRINTING' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Sending to Printer...</span>
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  <span>Print Exam Paper</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
