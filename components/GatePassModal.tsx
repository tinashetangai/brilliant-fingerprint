
import React, { useEffect, useState } from 'react';
import { X, Cpu } from 'lucide-react';
import { dataService } from '../services/dataService';
import { AttendanceAction, Employee } from '../types';

interface GatePassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess?: (employee: Employee, duration?: string, actualAction?: AttendanceAction) => void;
}

const GatePassModal: React.FC<GatePassModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
}) => {
  const [pin, setPin] = useState('');
  const [authStatus, setAuthStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (isOpen) {
      resetAuth();
    }
  }, [isOpen]);

  useEffect(() => {
    if (pin.length === 4 && authStatus === 'idle') {
      handleVerification(pin);
    }
  }, [pin]);

  const resetAuth = () => {
    setPin('');
    setAuthStatus('idle');
    setFeedback('');
  };

  const handleVerification = async (value: string) => {
    if (!value || value.length < 4) return;
    setAuthStatus('processing');
    setFeedback('Checking Credentials...');
    try {
      const employees = await dataService.getEmployees();
      const emp = employees.find(e => String(e.pin).trim() === String(value).trim());
      if (!emp) {
        setAuthStatus('error');
        setFeedback("Incorrect PIN");
        setPin('');
        setTimeout(() => setAuthStatus('idle'), 3000);
        return;
      }
      await processAuth(emp);
    } catch (e) {
      setAuthStatus('error');
      setFeedback("Cloud Link Offline");
    }
  };

  const processAuth = async (employee: Employee) => {
    const res = await dataService.processInformalLog(employee);
    const action = (res as any).action || AttendanceAction.GATE_OUT;

    if (res?.success) {
       setAuthStatus('success');
       if (onAuthSuccess) onAuthSuccess(employee, (res as any).duration, action);
    } else {
       setAuthStatus('error');
       setFeedback(res?.error || "Registry Access Denied");
       setTimeout(() => setAuthStatus('idle'), 4000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
      <div className="bg-white rounded-[3rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in duration-300 flex flex-col border border-white/10">

        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Cpu size={14} className="text-emerald-500" />
            GATE PASS AUTH
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-400"><X size={20}/></button>
        </div>

        <div className="px-8 py-12 flex flex-col items-center justify-center min-h-[450px]">
            <div className="flex flex-col items-center w-full animate-in slide-in-from-bottom-4">
              <div className="flex gap-3 mb-10">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${pin.length > i ? 'bg-black border-black scale-110 shadow-lg' : 'border-gray-200'}`}></div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3 w-full max-w-[280px] mb-8">
                {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map(k => (
                  <button
                    key={k}
                    onClick={() => {
                      if (k === 'C') setPin('');
                      else if (k === '⌫') setPin(pin.slice(0, -1));
                      else if (pin.length < 4) setPin(p => p + k);
                    }}
                    className="aspect-square rounded-2xl bg-gray-50 hover:bg-black hover:text-white text-xl font-black transition-all active:scale-90 border border-gray-100 flex items-center justify-center shadow-sm"
                  >
                    {k}
                  </button>
                ))}
              </div>
              <div className="flex flex-col items-center gap-4">
                <p className={`text-[11px] font-black uppercase tracking-widest ${authStatus === 'error' ? 'text-red-600' : 'text-slate-400'}`}>
                  {feedback || "Enter Secure Registry PIN"}
                </p>
              </div>
            </div>
        </div>

        <div className="p-6 bg-slate-50 text-center border-t border-gray-100">
          <p className="text-[9px] font-black text-slate-300 uppercase tracking-[0.4em]">Biometric Station v4.2</p>
        </div>
      </div>
    </div>
  );
};

export default GatePassModal;
