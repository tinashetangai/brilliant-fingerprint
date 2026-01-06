
import React, { useState, useEffect, useMemo } from 'react';
import {
  UserPlus,
  Flag,
  Bell,
  Calendar,
  DoorOpen,
  Fingerprint,
  Keyboard,
  Globe,
  CheckCircle2,
  Megaphone,
} from 'lucide-react';

import CameraModal from '../components/CameraModal';
import VisitorModal from '../components/VisitorModal';
import Notification from '../components/Notification';
import SuccessModal from '../components/SuccessModal';
import { dataService } from '../services/dataService';
import { AttendanceAction, Notice } from '../types';

const Home: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAction, setModalAction] = useState<AttendanceAction>(AttendanceAction.LOGIN);
  const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSynced, setIsSynced] = useState(false);

  const [activeNotices, setActiveNotices] = useState<Notice[]>([]);
  const [noticeIndex] = useState(0);

  const [lastUser, setLastUser] = useState<{ name: string; id: string } | null>(null);
  const [lastDuration, setLastDuration] = useState<string | undefined>();
  const [notification, setNotification] = useState<{
    id: number;
    msg: string;
    sub: string;
    type: 'success' | 'error';
  } | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);

  // Visitor Modal State
  const [visitorFirstName, setVisitorFirstName] = useState('');
  const [visitorLastName, setVisitorLastName] = useState('');
  const [visitorReason, setVisitorReason] = useState('Meeting');
  const [visitorIdentityType, setVisitorIdentityType] = useState<'ZIM_ID' | 'PASSPORT'>('ZIM_ID');
  const [visitorIdentityNumber, setVisitorIdentityNumber] = useState('');

  /* ===================== TIME + SYNC ===================== */
  useEffect(() => {
    const syncTime = async () => {
      const netTime = await dataService.getHarareTime();
      setCurrentTime(netTime);
      setIsSynced(true);
    };

    syncTime();
    const timer = setInterval(
      () => setCurrentTime((prev) => new Date(prev.getTime() + 1000)),
      1000
    );

    const unsubscribe = dataService.subscribeToLiveScans((log: any) => {
      setLastUser({ name: log.subjectName || log.name, id: log.subjectId });
      setModalAction(log.action);
      setLastDuration(log.duration);
      setShowSuccessModal(true);
      setTimeout(() => setShowSuccessModal(false), 6000);
    });

    loadNotices();
    const noticeTimer = setInterval(loadNotices, 30000);

    return () => {
      clearInterval(timer);
      clearInterval(noticeTimer);
      unsubscribe();
    };
  }, []);

  const loadNotices = async () => {
    try {
      const list = await dataService.getNotices();
      setActiveNotices(list.filter((n) => n.isActive && n.content.trim()));
    } catch {}
  };

  const triggerAuthModal = (action?: AttendanceAction) => {
    setModalAction(action || AttendanceAction.LOGIN);
    setIsModalOpen(true);
  };

  /* ===================== TIME FORMAT ===================== */
  const harareTimeParts = useMemo(() => {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Harare',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const [hh, mm] = f.format(currentTime).split(':');
    return { hh, mm };
  }, [currentTime]);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Harare',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(currentTime);
  }, [currentTime]);

  const currentNotice = activeNotices[noticeIndex];
  const gradient =
    noticeIndex % 2 === 0
      ? 'from-emerald-700 via-emerald-600 to-teal-600'
      : 'from-amber-600 via-amber-500 to-orange-500';

  /* ===================== UI ===================== */
  return (
    <div className="min-h-screen w-full bg-slate-50 overflow-y-auto overflow-x-hidden p-3 sm:p-4 md:p-6 lg:p-8 select-none">
      {notification && (
        <Notification {...notification} onClose={() => setNotification(null)} />
      )}

      <SuccessModal
        isOpen={showSuccessModal}
        name={lastUser?.name || ''}
        action={modalAction}
        duration={lastDuration}
        onClose={() => setShowSuccessModal(false)}
      />

      {/* ================= HEADER ================= */}
      <header className="flex flex-col sm:flex-row sm:justify-between gap-3 mb-4">
        <div className="flex flex-wrap justify-center items-center gap-3 bg-white/60 px-3 py-2 rounded-2xl border shadow-sm">
          <img src="https://i.ibb.co/YM5b3Ny/matina.png" className="h-6 sm:h-8" />
          <img src="https://i.ibb.co/DPPY7V1y/knockout-brand-logo-new-ped9bkln64voz9pspi7vvchdoed9chy3bbtm7aviee.png" className="h-6 sm:h-8" />
          <img src="https://i.ibb.co/KRGPG28/brilliant-chemical-logo-ollk04m5z92plr7shhb2ucypq3dw4edq2t01ppwfl0.png" className="h-6 sm:h-8" />
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white rounded-full border text-[10px] font-black uppercase">
            <Calendar size={12} /> {formattedDate}
          </div>
          {isSynced && (
            <div className="mt-1 text-[8px] uppercase tracking-widest text-slate-400 flex justify-end items-center gap-1">
              <Globe size={10} className="text-emerald-500" /> Live
            </div>
          )}
        </div>
      </header>

      {/* ================= MAIN ================= */}
      <main className="flex flex-col lg:flex-row gap-4 lg:gap-8">
        {/* ===== LEFT (CLOCK + SCANNER) ===== */}
        <section className="bg-white rounded-3xl border shadow-xl p-4 sm:p-6 flex flex-col items-center gap-6 flex-1">
          {/* CLOCK */}
          <div className="flex items-center gap-2 font-black text-emerald-600">
            {[harareTimeParts.hh[0], harareTimeParts.hh[1]].map((d, i) => (
              <div key={i} className="w-12 h-16 sm:w-16 sm:h-20 flex items-center justify-center bg-slate-50 border rounded-xl text-4xl sm:text-6xl">
                {d}
              </div>
            ))}
            <span className="text-emerald-300 text-4xl sm:text-6xl">:</span>
            {[harareTimeParts.mm[0], harareTimeParts.mm[1]].map((d, i) => (
              <div key={i} className="w-12 h-16 sm:w-16 sm:h-20 flex items-center justify-center bg-slate-50 border rounded-xl text-4xl sm:text-6xl">
                {d}
              </div>
            ))}
          </div>

          {/* SCANNER */}
          <div className="w-full max-w-xs bg-emerald-50/40 border rounded-3xl p-6 flex flex-col items-center gap-5">
            <div className="w-28 h-28 rounded-full bg-white border-4 border-emerald-500 flex items-center justify-center shadow-xl">
              <Fingerprint size={56} className="text-emerald-500 animate-pulse" />
            </div>

            <div className="text-center">
              <span className="inline-flex items-center gap-2 px-3 py-1 text-[10px] uppercase font-black bg-emerald-100 text-emerald-600 rounded-full">
                <CheckCircle2 size={12} /> Ready
              </span>
              <h3 className="mt-2 font-black text-xl uppercase">Place Thumb</h3>
              <p className="text-[10px] tracking-widest uppercase text-emerald-600">
                Hardware Scanner
              </p>
            </div>

            <button
              onClick={() => triggerAuthModal()}
              className="w-full bg-black text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2"
            >
              <Keyboard size={16} /> PIN Fallback
            </button>
          </div>
        </section>

        {/* ===== RIGHT PANEL ===== */}
        <section className="flex flex-col gap-3 flex-1">
          {/* NOTICE */}
          <div className="bg-white rounded-2xl border shadow-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Bell size={14} />
              <h3 className="text-[10px] uppercase font-black">Broadcast</h3>
            </div>

            {currentNotice ? (
              <div className={`bg-gradient-to-br ${gradient} p-4 rounded-xl text-white text-xs font-black uppercase`}>
                {currentNotice.content}
              </div>
            ) : (
              <div className="border-dashed border-2 rounded-xl p-4 text-center text-[9px] uppercase text-slate-400">
                No active notices
              </div>
            )}
          </div>

          {/* ACTIONS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => triggerAuthModal(AttendanceAction.GATE_OUT)}
              className="bg-blue-600 text-white rounded-2xl p-4 flex flex-col items-center gap-2"
            >
              <DoorOpen size={20} />
              <span className="text-[11px] font-black uppercase">Gate Pass</span>
            </button>

            <button
              onClick={() => setIsVisitorModalOpen(true)}
              className="bg-emerald-800 text-white rounded-2xl p-4 flex flex-col items-center gap-2"
            >
              <UserPlus size={20} />
              <span className="text-[11px] font-black uppercase">Visitor</span>
            </button>

            <button
              onClick={() => (window.location.hash = '#admin')}
              className="col-span-full bg-white border rounded-2xl p-4 flex items-center gap-3"
            >
              <Flag size={18} />
              <div>
                <div className="text-[11px] font-black uppercase">Administration</div>
                <div className="text-[8px] uppercase text-slate-400">Manager Access</div>
              </div>
            </button>
          </div>

          <footer className="text-center text-[8px] uppercase tracking-widest text-slate-300 pt-2">
            Knockout Intelligence Systems v4.2
          </footer>
        </section>
      </main>

      {/* MODALS */}
      <CameraModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCapture={() => {}}
        onAuthSuccess={(emp, dur, act) => {
          setLastUser(emp);
          setLastDuration(dur);
          setModalAction(act || modalAction);
          setShowSuccessModal(true);
          setIsModalOpen(false);
        }}
        title="STAFF AUTHENTICATION"
        isProcessing={false}
        status="idle"
      />

      <VisitorModal
        isOpen={isVisitorModalOpen}
        onClose={() => setIsVisitorModalOpen(false)}
        firstName={visitorFirstName}
        setFirstName={setVisitorFirstName}
        lastName={visitorLastName}
        setLastName={setVisitorLastName}
        reason={visitorReason}
        setReason={setVisitorReason}
        identityType={visitorIdentityType}
        setIdentityType={setVisitorIdentityType}
        identityNumber={visitorIdentityNumber}
        setIdentityNumber={setVisitorIdentityNumber}
      />
    </div>
  );
};

export default Home;
