import React, { useEffect, useState } from 'react';
import {
  X,
  RefreshCcw,
  Cpu,
  Fingerprint,
  Keyboard,
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { fingerprintService } from '../services/fingerprintService';
import { AttendanceAction, Employee } from '../types';

interface CameraModalProps {
  isOpen: boolean;
  action: AttendanceAction; // ✅ SOURCE OF TRUTH
  onClose: () => void;
  onAuthSuccess?: (
    employee: Employee,
    duration?: string,
    actualAction?: AttendanceAction,
    autoClosedGatePass?: boolean
  ) => void;
  title: string;
}

type AuthMode = 'PIN' | 'BIO';

const CameraModal: React.FC<CameraModalProps> = ({
  isOpen,
  action,
  onClose,
  onAuthSuccess,
  title,
}) => {
  const isGatePass = action === AttendanceAction.GATE_OUT;

  const [authMode, setAuthMode] = useState<AuthMode>(isGatePass ? 'PIN' : 'BIO');
  const [pin, setPin] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');

 
  useEffect(() => {
    if (isOpen) {
      resetAuth();
      // Auto-initiate biometric scan when modal opens, but do it silently
      handleBiometricAuth(true);
 
  /* ================= RESET ================= */
  useEffect(() => {
    if (isOpen) {
      resetAuth();
      if (!isGatePass) handleBiometricAuth(true);
 
    } else {
      resetAuth();
    }
  }, [isOpen]);

  useEffect(() => {
    if (pin.length === 4 && authStatus === 'idle') {
      handlePinVerification(pin);
    }
  }, [pin]);

  const resetAuth = () => {
    setPin('');
    setAuthStatus('idle');
    setFeedback('');
    setAuthMode('BIO');
  };

  /* ================= BIOMETRIC ================= */
  const handleBiometricAuth = async (silent = false) => {
    setAuthStatus('processing');
    setFeedback(silent ? '' : 'Awaiting hardware scan...');

    const result = await fingerprintService.captureTemplate();

    if (result.success && result.template) {
      const employees = await dataService.getEmployees();
      const emp = employees.find(
        e => String(e.fingerprintHash).trim() === String(result.template).trim()
      );

      if (emp) {
        await processAuth(emp);
      } else {
        fail('Personnel Not Found');
      }
    } else if (!silent) {
      fail(result.error || 'Biometric Error');
    }
  };

  /* ================= PIN ================= */
  const handlePinVerification = async (value: string) => {
    setAuthStatus('processing');
    setFeedback('Checking Credentials...');

    try {
      const employees = await dataService.getEmployees();
      const emp = employees.find(e => String(e.pin).trim() === value.trim());

      if (!emp) {
        fail('Incorrect PIN');
        setPin('');
        return;
      }

      await processAuth(emp);
    } catch {
      fail('Cloud Link Offline');
    }
  };

  /* ================= CORE AUTH ================= */
  const processAuth = async (employee: Employee) => {
    let res;
    let resolvedAction: AttendanceAction = action;

    const last = await dataService.getUserLastAction(employee.id);
    action = last === AttendanceAction.LOGIN ? AttendanceAction.LOGOUT : AttendanceAction.LOGIN;
    res = await dataService.processVerification(employee, action, 1.0);

    if (res?.success) {
      setAuthStatus('success');
      onAuthSuccess?.(employee, res.duration, resolvedAction);
    } else {
      fail(res?.error || 'Registry Access Denied');
    }
  };

  const fail = (msg: string) => {
    setAuthStatus('error');
    setFeedback(msg);
    setTimeout(() => setAuthStatus('idle'), 3500);
  };

  if (!isOpen) return null;

  /* ================= UI ================= */
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 backdrop-blur">
      <div className="bg-white w-full max-w-sm rounded-[3rem] overflow-hidden shadow-2xl">

        {/* HEADER */}
        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex gap-2">
            <Cpu size={14} className="text-emerald-500" />
            {title}
          </h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200">
            <X size={18} />
          </button>
        </div>

        <div className="px-8 py-12 flex flex-col items-center justify-center min-h-[450px]">
          {authMode === 'BIO' ? (
             <div className="flex flex-col items-center justify-center space-y-12 animate-in fade-in zoom-in">
                <div className={`relative w-44 h-44 rounded-full flex items-center justify-center border-4 transition-all duration-700 ${authStatus === 'processing' ? 'border-emerald-500 bg-emerald-50 shadow-[0_0_40px_-10px_rgba(16,185,129,0.5)]' : authStatus === 'error' ? 'border-red-500 bg-red-50 shadow-[0_0_40px_-10px_rgba(239,68,68,0.5)]' : 'border-slate-100 bg-slate-50'}`}>
                   <Fingerprint size={96} className={`transition-colors duration-500 ${authStatus === 'processing' ? 'text-emerald-500 animate-pulse' : authStatus === 'error' ? 'text-red-500' : 'text-slate-200'}`} />
                   {authStatus === 'processing' && <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-ping"></div>}
                </div>
                
                <div className="text-center space-y-3">
                   <h2 className="text-3xl font-black uppercase text-black leading-tight">
                      PLACE THUMB
                   </h2>
                   <p className={`text-[11px] font-black uppercase tracking-[0.2em] transition-colors ${authStatus === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                      {feedback || "On Hardware Scanner"}
                   </p>
                </div>

                <div className="flex flex-col gap-4 w-full">
                  {authStatus === 'error' && (
                     <button onClick={() => handleBiometricAuth(false)} className="py-4 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all">
                        <RefreshCcw size={14}/> Retry Biometric Scan
                     </button>
                  )}
                  <button 
                    onClick={() => setAuthMode('PIN')}
                    className="flex items-center justify-center gap-2 py-4 border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase text-slate-400 hover:text-black hover:border-black transition-all"
                  >
                    <Keyboard size={16}/> Use PIN Fallback
                  </button>
                </div>
             </div>
          ) : (
            <>
              <div className="flex gap-3 mb-10">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`w-4 h-4 rounded-full border-2 ${
                      pin.length > i ? 'bg-black border-black' : 'border-gray-200'
                    }`}
                  />
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
                {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k => (
                  <button
                    key={k}
                    onClick={() => {
                      if (k === 'C') setPin('');
                      else if (k === '⌫') setPin(p => p.slice(0, -1));
                      else if (pin.length < 4) setPin(p => p + k);
                    }}
                    className="aspect-square rounded-xl bg-gray-100 font-black text-xl"
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="flex flex-col items-center gap-4">
                <p className={`text-[11px] font-black uppercase tracking-widest ${authStatus === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                  {feedback || "Enter Secure Registry PIN"}
                </p>
                <button onClick={() => { setAuthMode('BIO'); handleBiometricAuth(true); }} className="text-[10px] font-black uppercase text-emerald-600 underline">Switch back to Fingerprint</button>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="p-4 border-t text-center text-[9px] uppercase tracking-widest text-slate-300">
          Biometric Station v4.2
        </div>
      </div>
    </div>
  );
};

export default CameraModal;
