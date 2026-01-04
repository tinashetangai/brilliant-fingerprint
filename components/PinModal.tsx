
import React, { useState, useEffect } from 'react';
import { X, Key, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Employee, AttendanceAction } from '../types';

interface PinModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (employee: Employee, duration?: string, action?: AttendanceAction) => void;
}

const PinModal: React.FC<PinModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [pin, setPin] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setError(null);
    }
  }, [isOpen]);

  useEffect(() => {
    const processPin = async () => {
      if (pin.length === 3) {
        setIsProcessing(true);
        setError(null);
        try {
          const employees = await dataService.getEmployees();
          const employee = employees.find(emp => emp.pin === pin);

          if (employee) {
            const result = await dataService.processInformalLog(employee);
            if (result.success) {
              onAuthSuccess(employee, result.duration, result.action);
              onClose();
            } else {
              setError(result.error || 'Gate pass denied.');
            }
          } else {
            setError('Invalid PIN');
          }
        } catch (err) {
          setError('An error occurred.');
        } finally {
          setIsProcessing(false);
          setPin('');
        }
      }
    };

    if (isOpen) {
      processPin();
    }
  }, [pin, isOpen, onAuthSuccess, onClose]);

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPin = e.target.value;
    if (/^\d*$/.test(newPin) && newPin.length <= 3) {
      setPin(newPin);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
      <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in-95 duration-300 border-4 border-white/20">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Gate Pass PIN</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>
        <div className="flex flex-col items-center gap-6">
          <div className="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center shadow-inner">
            <Key size={40} className="text-slate-400" />
          </div>
          <p className="text-sm font-bold text-slate-500 text-center">
            Enter your 3-digit PIN to record a gate pass.
          </p>
          <input
            type="password"
            value={pin}
            onChange={handlePinChange}
            maxLength={3}
            className="w-full text-center text-4xl font-black bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 tracking-[0.5em] focus:ring-2 focus:ring-blue-500 outline-none"
            autoFocus
          />
          {isProcessing && <Loader2 className="animate-spin text-blue-500" />}
          {error && <p className="text-red-500 font-bold">{error}</p>}
        </div>
      </div>
    </div>
  );
};

export default PinModal;
