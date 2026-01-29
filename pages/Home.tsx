
import React, { useState, useEffect, useMemo } from 'react';
import {
  UserPlus,
  Fingerprint,
  Keyboard,
  Megaphone,
  ShieldCheck,
  Lock,
  DoorOpen
} from 'lucide-react';

import CameraModal from '../components/CameraModal';
import GatePassModal from '../components/GatePassModal';
import VisitorModal from '../components/VisitorModal';
import Notification from '../components/Notification';
import SuccessModal from '../components/SuccessModal';
import { dataService } from '../services/dataService';
import { AttendanceAction, Notice } from '../types';

const Home: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGatePassOpen, setIsGatePassOpen] = useState(false);
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

  // Rotating Instruction State
  const [instructionText, setInstructionText] = useState("Put your fingerprint on the device");

  // Visitor Modal State
  const [visitorFirstName, setVisitorFirstName] = useState('');
  const [visitorLastName, setVisitorLastName] = useState('');
  const [visitorReason, setVisitorReason] = useState('Meeting');
  const [visitorIdentityType, setVisitorIdentityType] = useState<'ZIM_ID' | 'PASSPORT'>('ZIM_ID');
  const [visitorIdentityNumber, setVisitorIdentityNumber] = useState('');

  const LOGOS = [
    { name: 'Matina', src: 'https://i.ibb.co/YM5b3Ny/matina.png' },
    { name: 'Knockout', src: 'https://i.ibb.co/DPPY7V1y/knockout-brand-logo-new-ped9bkln64voz9pspi7vvchdoed9chy3bbtm7aviee.png' },
    { name: 'Brilliant', src: 'https://i.ibb.co/KRGPG28/brilliant-chemical-logo-ollk04m5z92plr7shhb2ucypq3dw4edq2t01ppwfl0.png' }
  ];

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

    // Text Rotation Timer
    const messages = [
      "Put your fingerprint on the device",
      "Isa chigunwe pa finger print scanner",
      "Don't forget to Clock Out when you leave"
    ];
    let msgIndex = 0;
    const rotationTimer = setInterval(() => {
      msgIndex = (msgIndex + 1) % messages.length;
      setInstructionText(messages[msgIndex]);
    }, 4000);

    return () => {
      clearInterval(timer);
      clearInterval(noticeTimer);
      clearInterval(rotationTimer);
      unsubscribe();
    };
  }, []);

  const loadNotices = async () => {
    try {
      const list = await dataService.getNotices();
      setActiveNotices(list.filter((n) => n.isActive && n.content.trim()));
    } catch {}
  };

  const triggerAuthModal = () => {
    setModalAction(AttendanceAction.LOGIN);
    setIsModalOpen(true);
  };

  /* ===================== TIME FORMAT ===================== */
  const timeString = useMemo(() => {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Harare',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(currentTime);
  }, [currentTime]);

  const dateString = useMemo(() => {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Harare',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(currentTime);
  }, [currentTime]);

  const currentNotice = activeNotices[noticeIndex];

  return (
    <div className="h-screen w-screen bg-white flex flex-col relative overflow-hidden font-sans select-none">
      {notification && (
        <Notification 
          message={notification.msg} 
          subtext={notification.sub} 
          type={notification.type} 
          onClose={() => setNotification(null)} 
        />
      )}

      <SuccessModal
        isOpen={showSuccessModal}
        name={lastUser?.name || ''}
        action={modalAction}
        duration={lastDuration}
        onClose={() => setShowSuccessModal(false)}
      />

      {/* NOTICE BANNER - Overlays top to save space */}
      {currentNotice && (
        <div className="absolute top-0 left-0 right-0 bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-3 shadow-xl z-50 animate-pulse">
           <Megaphone size={20} className="shrink-0 animate-bounce" />
           <p className="text-sm md:text-lg font-black uppercase tracking-widest text-center leading-none drop-shadow-md truncate">
             {currentNotice.content}
           </p>
        </div>
      )}

      {/* MAIN CONTENT - Grow to fill space, justify-evenly to distribute */}
      <main className="flex-grow flex flex-col items-center justify-evenly p-4 pb-0 relative z-10 w-full max-w-5xl mx-auto">
        
        {/* Header Section - Responsive Massive Time */}
        <div className="text-center w-full mt-4">
           <div className="flex items-center justify-center gap-2 mb-1 opacity-40">
              <ShieldCheck size={14} />
              <span className="text-[10px] font-black uppercase tracking-[0.3em]">Secure Terminal</span>
           </div>
           <h1 className="text-[15vw] md:text-[10rem] font-black text-slate-900 font-mono tracking-tighter leading-[0.8] select-none">
             {timeString}
           </h1>
           <p className="text-lg md:text-3xl font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">{dateString}</p>
        </div>

        {/* Interaction Zone - Scanner */}
        <div className="flex flex-col items-center justify-center w-full gap-4">
           
           {/* Primary Scan Button */}
           <div className="relative group cursor-pointer mx-auto" onClick={triggerAuthModal}>
              <div className="absolute inset-0 bg-emerald-100 rounded-full scale-90 opacity-0 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700 blur-2xl"></div>
              <div className="w-[45vw] h-[45vw] max-w-[240px] max-h-[240px] bg-white border-[6px] border-slate-100 rounded-full flex flex-col items-center justify-center shadow-2xl relative z-10 transition-transform active:scale-95 group-hover:border-emerald-500">
                 <Fingerprint className="w-1/2 h-1/2 text-slate-900 group-hover:text-emerald-600 transition-colors" strokeWidth={1.5} />
                 <span className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-300 group-hover:text-emerald-600 mt-2">Scan</span>
              </div>
           </div>

           {/* Rotating Instructions - Fixed height to prevent layout jump */}
           <div className="h-10 md:h-12 flex items-center justify-center w-full px-4">
             <p 
               key={instructionText} 
               className="text-sm md:text-xl font-black uppercase tracking-widest text-slate-600 text-center animate-in fade-in slide-in-from-bottom-2 duration-500 leading-tight"
             >
               {instructionText}
             </p>
           </div>
        </div>

        {/* Primary Buttons Grid - Updated to 3 columns to include Admin */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-lg px-2">
            <button 
              onClick={() => setIsGatePassOpen(true)}
              className="py-5 bg-slate-50 hover:bg-slate-100 rounded-[1.5rem] border-2 border-slate-100 transition-all flex flex-col items-center justify-center gap-2 group active:scale-95 shadow-sm"
            >
              <Keyboard size={24} className="text-slate-400 group-hover:text-black" />
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-black">Gate Pass</span>
            </button>

            <button 
              onClick={() => window.location.hash = '#admin'}
              className="py-5 bg-slate-900 hover:bg-black rounded-[1.5rem] border-2 border-slate-800 transition-all flex flex-col items-center justify-center gap-2 group active:scale-95 shadow-xl"
            >
              <Lock size={24} className="text-emerald-400 group-hover:scale-110 transition-transform" />
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-emerald-50 group-hover:text-white">Admin Access</span>
            </button>

            <button 
              onClick={() => setIsVisitorModalOpen(true)}
              className="py-5 bg-slate-50 hover:bg-slate-100 rounded-[1.5rem] border-2 border-slate-100 transition-all flex flex-col items-center justify-center gap-2 group active:scale-95 shadow-sm"
            >
              <UserPlus size={24} className="text-slate-400 group-hover:text-black" />
              <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-500 group-hover:text-black">Visitor Log</span>
            </button>
        </div>
      </main>

      {/* Footer - Logos & Status */}
      <footer className="flex-shrink-0 w-full bg-slate-50 border-t border-slate-100 p-3 pb-safe z-20">
         <div className="max-w-4xl mx-auto flex flex-col gap-3">
            
            {/* Status Line */}
            <div className="flex justify-between items-center px-2">
               <div className="flex items-center gap-2 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  <div className={`w-2 h-2 rounded-full ${isSynced ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`}></div>
                  {isSynced ? 'System Online' : 'Connecting...'}
               </div>
               <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-300 tracking-tighter">
                  BIO-SECURE v4.2.0
               </div>
            </div>

            {/* Logos Row */}
            <div className="flex justify-center items-center gap-6 md:gap-10 opacity-70 hover:opacity-100 transition-opacity pb-1">
               {LOGOS.map((logo, i) => (
                  <img 
                    key={i} 
                    src={logo.src} 
                    alt={logo.name} 
                    className="h-6 md:h-8 object-contain grayscale hover:grayscale-0 transition-all duration-300" 
                  />
               ))}
            </div>
         </div>
      </footer>

      {/* Background Decor */}
      <div className="absolute top-0 right-0 w-[50vw] h-[50vw] bg-gradient-to-b from-gray-50 to-transparent rounded-bl-full -z-10 opacity-50 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-[40vw] h-[40vw] bg-gradient-to-t from-gray-50 to-transparent rounded-tr-full -z-10 opacity-50 pointer-events-none"></div>

      {/* MODALS */}
      <CameraModal
        isOpen={isModalOpen}
        action={modalAction}
        onClose={() => setIsModalOpen(false)}
        onAuthSuccess={(emp, dur, act) => {
          setLastUser(emp);
          setLastDuration(dur);
          setModalAction(act || modalAction);
          setShowSuccessModal(true);
          setIsModalOpen(false);
        }}
        title="STAFF AUTHENTICATION"
      />

      <GatePassModal
        isOpen={isGatePassOpen}
        onClose={() => setIsGatePassOpen(false)}
        onAuthSuccess={(emp, dur, act) => {
          setLastUser(emp);
          setLastDuration(dur);
          setModalAction(act || AttendanceAction.GATE_OUT);
          setShowSuccessModal(true);
          setIsGatePassOpen(false);
        }}
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
