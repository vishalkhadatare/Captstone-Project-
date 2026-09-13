import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Building2,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Printer,
  User,
  Phone,
  Mail,
  MapPin,
  FileSpreadsheet,
  Hash,
  Info,
} from 'lucide-react';
import { Examination, AddCentrePayload, AddCentreResponse } from '../../types';
import { api } from '../../api';

interface AddCentreModalProps {
  exam: Examination;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (result: AddCentreResponse) => void;
}

export const AddCentreModal: React.FC<AddCentreModalProps> = ({
  exam,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const managerAuthorized = Number(exam.max_copies || 500);

  const [centreName, setCentreName] = useState('');
  const [centreCode, setCentreCode] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [email, setEmail] = useState('');
  const [maxCopies, setMaxCopies] = useState<number | ''>(managerAuthorized);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Background page scroll locking & Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  const requestedCopies = typeof maxCopies === 'number' ? maxCopies : 0;
  const finalAllowedCopies = Math.min(managerAuthorized, requestedCopies > 0 ? requestedCopies : 0);
  const hasMismatch = requestedCopies > 0 && requestedCopies !== managerAuthorized;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Validate required fields
    if (
      !centreName.trim() ||
      !centreCode.trim() ||
      !address.trim() ||
      !city.trim() ||
      !state.trim() ||
      !contactPerson.trim() ||
      !contactNumber.trim() ||
      !email.trim() ||
      maxCopies === '' ||
      maxCopies === undefined ||
      maxCopies === null
    ) {
      setErrorMessage('All 9 fields are mandatory: Centre Name, Centre Code, Address, City, State, Contact Person, Contact Number, Email, and Required Copies.');
      return;
    }

    // 2. Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage('Please provide a valid email address (e.g. centre@institution.org).');
      return;
    }

    // 3. Validate contact number format
    const phoneDigits = contactNumber.replace(/[^0-9]/g, '');
    if (phoneDigits.length < 7 || phoneDigits.length > 15) {
      setErrorMessage('Please provide a valid contact number (7-15 digits).');
      return;
    }

    // 4. Validate copies
    const copiesNum = Number(maxCopies);
    if (!Number.isInteger(copiesNum) || copiesNum <= 0) {
      setErrorMessage('Required / Maximum Copies must be a positive integer greater than 0.');
      return;
    }

    setLoading(true);

    try {
      const payload: AddCentrePayload = {
        centre_name: centreName.trim(),
        centre_code: centreCode.trim().toUpperCase(),
        address: address.trim(),
        city: city.trim(),
        state: state.trim(),
        contact_person: contactPerson.trim(),
        contact_number: contactNumber.trim(),
        email: email.trim().toLowerCase(),
        max_copies: copiesNum,
      };

      const res = await api.addCentre(exam.id, payload);
      onSuccess(res);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to register examination centre.');
    } finally {
      setLoading(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-centre-title"
      className="fixed inset-x-0 bottom-0 z-50 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-start p-4 sm:p-6 overflow-hidden"
      style={{ top: 'var(--header-height, 4rem)' }}
      onClick={e => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150"
        style={{ maxHeight: 'calc(100dvh - var(--header-height, 4rem) - 2rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header - Pinned at top of modal */}
        <div className="shrink-0 px-6 py-4 border-b border-slate-100 bg-linear-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 id="add-centre-title" className="font-bold text-base leading-tight">Add Examination Centre</h3>
              <p className="text-xs text-slate-300">
                Register delivery centre for <span className="text-white font-semibold">{exam.name}</span> ({exam.subject})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700/50 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form with scrollable body and pinned footer */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Error Alert */}
            {errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2.5 text-xs">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium">{errorMessage}</div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Centre Name */}
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  Centre Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={centreName}
                  onChange={e => setCentreName(e.target.value)}
                  placeholder="e.g. National Institute of Technology - Campus A"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs text-slate-900 transition-colors"
                />
              </div>

              {/* Centre Code */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 text-slate-400" />
                  Centre Code <span className="text-rose-500">*</span>
                  <span className="text-[10px] text-slate-400 font-normal">(unique in organization)</span>
                </label>
                <input
                  type="text"
                  value={centreCode}
                  onChange={e => setCentreCode(e.target.value.toUpperCase())}
                  placeholder="e.g. CTR-DELHI-101"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs font-mono font-bold text-slate-900 uppercase transition-colors"
                />
              </div>

              {/* City */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  City <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={e => setCity(e.target.value)}
                  placeholder="e.g. New Delhi"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs text-slate-900 transition-colors"
                />
              </div>

              {/* State */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  State <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={e => setState(e.target.value)}
                  placeholder="e.g. Delhi"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs text-slate-900 transition-colors"
                />
              </div>

              {/* Contact Person */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Contact Person <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={contactPerson}
                  onChange={e => setContactPerson(e.target.value)}
                  placeholder="e.g. Dr. Rajesh Sharma (Chief Superintendent)"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs text-slate-900 transition-colors"
                />
              </div>

              {/* Contact Number */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400" />
                  Contact Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  value={contactNumber}
                  onChange={e => setContactNumber(e.target.value)}
                  placeholder="e.g. +91 98765 43210"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs text-slate-900 transition-colors"
                />
              </div>

              {/* Email */}
              <div>
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="e.g. centre.delhi101@institute.edu"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs text-slate-900 transition-colors"
                />
              </div>

              {/* Address */}
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" />
                  Full Centre Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="e.g. Sector 12, Dwarka Expressway, Institutional Area"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs text-slate-900 transition-colors"
                />
              </div>

              {/* Required / Maximum Copies */}
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  Required / Maximum Copies <span className="text-rose-500">*</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    (Manager Authorized Cap: <span className="font-bold text-slate-700">{managerAuthorized}</span>)
                  </span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={maxCopies}
                  onChange={e => setMaxCopies(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="e.g. 500"
                  required
                  disabled={loading}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-xs font-bold text-slate-900 transition-colors"
                />
              </div>
            </div>

            {/* COPY CONTROL ENGINE PREVIEW */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-emerald-700" />
                  Copy Control Enforcement Rule
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  MIN(Manager Cap, Centre Quota)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-medium">Manager Cap</span>
                  <span className="text-sm font-bold text-slate-800">{managerAuthorized}</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-slate-200">
                  <span className="block text-[10px] text-slate-500 font-medium">Centre Quota</span>
                  <span className="text-sm font-bold text-slate-800">
                    {requestedCopies > 0 ? requestedCopies : '—'}
                  </span>
                </div>
                <div className={`p-2 rounded-lg border ${
                  hasMismatch
                    ? 'bg-amber-50/80 border-amber-300 text-amber-900'
                    : 'bg-emerald-50/80 border-emerald-300 text-emerald-900'
                }`}>
                  <span className="block text-[10px] font-medium opacity-80">Final Authorized</span>
                  <span className="text-sm font-black">
                    {requestedCopies > 0 ? finalAllowedCopies : '—'}
                  </span>
                </div>
              </div>

              {/* Mismatch Alert Notice */}
              {hasMismatch && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Quota Mismatch Detected: </span>
                    Requested ({requestedCopies}) differs from Manager Cap ({managerAuthorized}).
                    Backend enforcement strictly locks maximum print copies to{' '}
                    <span className="font-bold underline">{finalAllowedCopies}</span>. An alert event (
                    <code className="text-[10px] bg-amber-100 px-1 rounded">CENTRE_COPY_QUANTITY_MISMATCH</code>
                    ) will be logged and dispatched to the Chief Vigilance Auditor.
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons - Pinned at bottom of modal */}
          <div className="shrink-0 px-6 py-3.5 flex items-center justify-end gap-2.5 border-t border-slate-100 bg-slate-50/80">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-900 hover:bg-emerald-800 text-white shadow-sm flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Registering Centre...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Add Centre</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }

  return modalContent;
};
