import React, { useState } from 'react';
import { api, getDeviceFingerprint, setStoredAuth } from '../api';
import { User } from '../types';
import { KeyRound, ShieldCheck, Laptop, Lock, Mail, UserCheck, X } from 'lucide-react';

interface AuthModalProps {
  onClose: () => void;
  onAuthSuccess: (user: User, token: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [identifier, setIdentifier] = useState('owner@nbte.edu.in');
  const [password, setPassword] = useState('Password123!');
  const [fullName, setFullName] = useState('Dr. Alok Verma');
  const [email, setEmail] = useState('owner@nbte.edu.in');
  const [username, setUsername] = useState('alok_verma');
  const [role, setRole] = useState<string>('ORG_OWNER');
  const [deviceName, setDeviceName] = useState('Primary Examination Workstation');

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deviceFp = getDeviceFingerprint();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.login({ identifier, password, device_name: deviceName });
      setStoredAuth(res.token, res.user);
      onAuthSuccess(res.user, res.token);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await api.register({
        email,
        username,
        password,
        full_name: fullName,
        role,
        device_name: deviceName,
      });
      setStoredAuth(res.token, res.user);
      onAuthSuccess(res.user, res.token);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 text-slate-900 rounded-xl w-full max-w-md p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">
              {mode === 'login' ? 'ZeroLeak Operator Sign In' : 'Register Authorized Credentials'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-sm">
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
            {errorMessage}
          </div>
        )}

        {/* Hardware Binding Indicator */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] flex items-center gap-2 text-slate-600">
          <Laptop className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
          <div className="truncate">
            Hardware Binding: <span className="font-mono text-indigo-600 font-bold">{deviceFp}</span>
          </div>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Official Email / Username</label>
              <input
                type="text"
                value={identifier}
                onChange={e => setIdentifier(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            <div>
              <label className="block text-slate-700 font-semibold mb-1">Passphrase</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors text-xs"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{loading ? 'Validating Token...' : 'Authenticate Terminal'}</span>
            </button>

            <div className="text-center pt-2 text-slate-500 text-[11px]">
              Need to register a new organizational authority?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                className="text-indigo-600 hover:underline font-semibold"
              >
                Register
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-700 font-semibold mb-1">Full Legal Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Role Type</label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="ORG_OWNER">1. Organization Owner</option>
                  <option value="EXAM_MANAGER">2. Examination Manager</option>
                  <option value="TRANSLATOR">3. Linguistic Translator</option>
                  <option value="CENTRE_OPERATOR">4. Centre Operator</option>
                  <option value="AUDITOR">5. Security Auditor</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:bg-white focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors text-xs"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>{loading ? 'Creating Credentials...' : 'Register Authority'}</span>
            </button>

            <div className="text-center pt-2 text-slate-500 text-[11px]">
              Already registered?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                className="text-indigo-600 hover:underline font-semibold"
              >
                Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
