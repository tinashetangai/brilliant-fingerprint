import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  User,
  X,
  CheckCircle,
  AlertCircle,
  LogIn,
  LogOut,
  Search,
  ArrowRight,
  Camera,
  RefreshCcw,
  Loader2
} from 'lucide-react';
import { dataService } from '../services/dataService';
import { LogStatus, AttendanceAction } from '../types';

interface VisitorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type VisitorStep = 'action' | 'form' | 'capture' | 'success';

interface ActiveVisitor {
  id: string;
  name: string;
}

const VisitorModal: React.FC<VisitorModalProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<VisitorStep>('action');
  const [action, setAction] = useState<AttendanceAction>(AttendanceAction.LOGIN);

  // Visitor form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [identityNumber, setIdentityNumber] = useState('');
  const [reason, setReason] = useState('Meeting');

  // Search (checkout)
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVisitors, setActiveVisitors] = useState<ActiveVisitor[]>([]);
  const [selectedVisitorId, setSelectedVisitorId] = useState<string | null>(null);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Camera
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);

  /* ===================== EFFECTS ===================== */

  useEffect(() => {
    if (!isOpen) {
      reset();
      stopCamera();
      return;
    }

    if (action === AttendanceAction.LOGOUT) {
      loadActiveVisitors();
    }
  }, [isOpen, action]);

  useEffect(() => {
    if (step === 'capture' && !capturedPhoto) {
      startCamera();
    }
  }, [step, capturedPhoto]);

  /* ===================== DATA ===================== */

  const loadActiveVisitors = async () => {
    const list = await dataService.getActiveVisitors();

    setActiveVisitors(
      list.map((v: any) => ({
        id: v.subjectId || v.id,
        name:
          v.subjectName ||
          v.name ||
          `${v.firstName ?? ''} ${v.lastName ?? ''}`.trim(),
      }))
    );
  };

  /* ===================== CAMERA ===================== */

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });
      setStream(mediaStream);
      if (videoRef.current) videoRef.current.srcObject = mediaStream;
    } catch {
      setValidationError('Camera access denied. Photo is mandatory.');
    }
  };

  const stopCamera = () => {
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    canvas.getContext('2d')?.drawImage(videoRef.current, 0, 0);
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.85));
    stopCamera();
  };

  /* ===================== SEARCH ===================== */

  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase();

    return activeVisitors.filter((v) =>
      v.name.toLowerCase().includes(q)
    );
  }, [searchQuery, activeVisitors]);

  /* ===================== SUBMIT ===================== */

  const handleSubmit = async () => {
    if (action === AttendanceAction.LOGOUT && !selectedVisitorId) {
      setValidationError('Please select a visitor from the list.');
      return;
    }

    if (
      action === AttendanceAction.LOGIN &&
      (!firstName || !lastName || !identityNumber)
    ) {
      setValidationError('All fields are mandatory.');
      return;
    }

    if (action === AttendanceAction.LOGIN && !capturedPhoto) {
      setValidationError('Visitor photo is mandatory.');
      setStep('capture');
      return;
    }

    setIsSubmitting(true);
    setValidationError(null);

    try {
      await dataService.addLog({
        subjectId:
          action === AttendanceAction.LOGIN
            ? `visitor-${identityNumber.toUpperCase()}`
            : selectedVisitorId!,
        subjectName:
          action === AttendanceAction.LOGIN
            ? `${firstName} ${lastName}`
            : searchQuery,
        timestamp: Date.now(),
        status: LogStatus.SUCCESS,
        action,
        confidence: 1,
        type: 'VISITOR',
      });

      setStep('success');
      setTimeout(() => {
        onClose();
        reset();
      }, 2500);
    } catch {
      setValidationError('System error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /* ===================== RESET ===================== */

  const reset = () => {
    setStep('action');
    setAction(AttendanceAction.LOGIN);
    setFirstName('');
    setLastName('');
    setIdentityNumber('');
    setReason('Meeting');
    setSearchQuery('');
    setSelectedVisitorId(null);
    setCapturedPhoto(null);
    setValidationError(null);
  };

  if (!isOpen) return null;

  /* ===================== UI ===================== */

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 flex justify-between items-center border-b">
          <h3 className="font-black uppercase">Visitor Protocol</h3>
          <button onClick={onClose}><X /></button>
        </div>

        <div className="p-6 min-h-[420px]">

          {step === 'action' && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => { setAction(AttendanceAction.LOGIN); setStep('capture'); }}
                className="p-6 rounded-2xl bg-emerald-100 font-black"
              >
                <LogIn /> Check In
              </button>

              <button
                onClick={() => { setAction(AttendanceAction.LOGOUT); setStep('form'); }}
                className="p-6 rounded-2xl bg-orange-100 font-black"
              >
                <LogOut /> Check Out
              </button>
            </div>
          )}

          {step === 'form' && action === AttendanceAction.LOGOUT && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setSelectedVisitorId(null);
                  }}
                  placeholder="Search active visitor..."
                  className="w-full pl-12 pr-4 py-4 rounded-xl border"
                />
              </div>

              {filteredSuggestions.length > 0 && !selectedVisitorId && (
                <div className="border rounded-xl overflow-hidden">
                  {filteredSuggestions.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => {
                        setSelectedVisitorId(v.id);
                        setSearchQuery(v.name);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-emerald-50 flex justify-between"
                    >
                      <span>{v.name}</span>
                      <ArrowRight />
                    </button>
                  ))}
                </div>
              )}

              {validationError && (
                <div className="text-red-600 flex gap-2 items-center">
                  <AlertCircle /> {validationError}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!selectedVisitorId || isSubmitting}
                className="w-full py-4 bg-orange-600 text-white rounded-xl font-black"
              >
                {isSubmitting ? <Loader2 className="animate-spin mx-auto" /> : 'Record Exit'}
              </button>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-16">
              <CheckCircle size={64} className="mx-auto text-emerald-600" />
              <h4 className="font-black uppercase mt-4">Registry Updated</h4>
            </div>
          )}
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

export default VisitorModal;
