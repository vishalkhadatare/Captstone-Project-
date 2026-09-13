import React from 'react';
import { AlertTriangle, Laptop, Clock, User, Mail, X } from 'lucide-react';

interface DeviceApprovalModalProps {
  isOpen: boolean;
  userEmail?: string;
  userName?: string;
  deviceId?: string;
  onClose: () => void;
}

export const DeviceApprovalModal: React.FC<DeviceApprovalModalProps> = ({
  isOpen,
  userEmail,
  userName,
  deviceId,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-700" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Device Approval Required</h2>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-700 p-1 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-semibold mb-1">This Device is Pending Authorization</p>
              <p className="text-xs">
                Your device has been registered but requires approval from an authorized administrator before you can access protected operations.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <User className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-500 font-medium">Account</p>
                <p className="text-sm font-semibold text-slate-900">{userName || 'Loading...'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-500 font-medium">Email</p>
                <p className="text-sm font-mono text-slate-900">{userEmail || 'Loading...'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Laptop className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-slate-500 font-medium">Device ID</p>
                <p className="text-sm font-mono text-slate-900 break-all">{deviceId || 'Unknown'}</p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              <span className="font-semibold">Next Steps:</span>
              <br />
              1. Contact your Organization Owner or Security Auditor
              <br />
              2. Request approval for this device
              <br />
              3. Once approved, sign out and sign back in to continue
            </p>
          </div>

          <div className="bg-slate-100 rounded-lg p-3 border border-slate-200">
            <p className="text-xs text-slate-600">
              <span className="font-semibold block mb-1">Why This Security Check?</span>
              ZeroLeak requires cryptographic device binding for high-security roles. Each device must be explicitly authorized by administration before it can unlock sensitive examination papers.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-slate-900 text-white font-semibold rounded-lg hover:bg-slate-800 transition-colors text-sm"
          >
            Understood, Go Back
          </button>
        </div>
      </div>
    </div>
  );
};
