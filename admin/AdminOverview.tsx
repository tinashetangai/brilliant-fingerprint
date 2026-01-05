
import React, { useMemo, useState } from 'react';
import { 
  Calendar,
  Plus,
  Megaphone,
  Download,
  RefreshCw,
  X,
  Search,
} from 'lucide-react';
import { Employee, AttendanceLog, AttendanceAction, SystemSettings, LogStatus } from '../types';

interface AdminOverviewProps {
  employees: Employee[];
  logs: AttendanceLog[];
  onQuickAction: (action: 'ADD_STAFF' | 'NOTICE' | 'REPORT' | 'SYNC') => void;
  settings: SystemSettings;
}

type ModalMode = 'TOTAL' | 'PRESENT' | 'ABSENT' | 'OUTSIDE' | null;

// Normalization helper for varied data formats (Seconds, MS, Strings, Firestore)
const normalizeTs = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts?.seconds) return ts.seconds * 1000;
  return 0;
};

const AttendanceChart: React.FC<{title: string, data: {hour: string, count: number}[]}> = ({ title, data }) => {
  const chartHeight = 150;
  const chartWidth = 800;
  const maxCount = Math.max(...data.map(d => d.count), 5);

  return (
    <div className="bg-gray-800 p-10 rounded-[3rem] border border-gray-700 shadow-sm">
      <div className="flex justify-between items-center mb-16">
        <div>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">{title}</h3>
          <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest mt-1">Logins per hour</p>
        </div>
      </div>

      <div className="relative w-full h-[250px] mt-20">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="barGradientNight" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" />
              <stop offset="100%" stopColor="#6d28d9" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((p, i) => (
            <line key={i} x1="0" y1={p * chartHeight} x2={chartWidth} y2={p * chartHeight} stroke="#4a5568" strokeWidth="1" strokeDasharray="4" />
          ))}

          {data.map((d, i) => {
            const barWidth = 40;
            const x = (i / (data.length - 1)) * (chartWidth - barWidth);
            const barHeight = (d.count / maxCount) * chartHeight;
            const y = chartHeight - barHeight;
            return (
              <g key={i} className="group/bar">
                <rect
                  x={x} y={y}
                  width={barWidth}
                  height={barHeight}
                  className="transition-all duration-500 hover:opacity-80 cursor-pointer"
                  fill={`url(#${title === 'Day Shift' ? 'barGradient' : 'barGradientNight'})`}
                  rx="8"
                />
                <foreignObject x={x - 20} y={y - 65} width="80" height="60" className="overflow-visible pointer-events-none">
                  <div className="flex flex-col items-center animate-bounce-callout">
                    <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 rounded-xl shadow-2xl flex flex-col items-center justify-center min-w-[45px] border border-white/20">
                      <span className="text-[7px] leading-none opacity-60 mb-0.5">{d.hour}</span>
                      <span className="leading-none">{d.count}</span>
                    </div>
                    <div className="w-2.5 h-2.5 bg-black transform rotate-45 -mt-1.5 border-r border-b border-white/20"></div>
                  </div>
                </foreignObject>
                <text x={x + barWidth / 2} y={chartHeight + 35} textAnchor="middle" className="text-lg font-black fill-white uppercase tracking-tighter">{d.hour}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  )
}


const AdminOverview: React.FC<AdminOverviewProps> = ({ employees, logs, onQuickAction, settings }) => {
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalSearch, setModalSearch] = useState('');

  const stats = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayThreshold = startOfToday.getTime();

    const employeeLastAction: { [key: string]: { timestamp: number, action: AttendanceAction } } = {};
    logs.forEach(log => {
      if (log.status !== LogStatus.SUCCESS || log.type !== 'EMPLOYEE') return;
      const ts = normalizeTs(log.timestamp);
      if (ts < todayThreshold) return;

      const employeeId = String(log.subjectId).trim();
      if (!employeeLastAction[employeeId] || ts > employeeLastAction[employeeId].timestamp) {
        employeeLastAction[employeeId] = { timestamp: ts, action: log.action };
      }
    });

    const presentIds = new Set<string>();
    employees.forEach(emp => {
      const eid = String(emp.id).trim();
      const lastAction = employeeLastAction[eid];
      if (lastAction && lastAction.action === AttendanceAction.LOGIN) {
        presentIds.add(eid);
      }
    });

    return { presentIds };
  }, [employees, logs]);

  const dayChartData = useMemo(() => {
    const startH = parseInt(settings.dayStart.split(':')[0]) || 6;
    const endH = parseInt(settings.dayEnd.split(':')[0]) || 18;
    const hours = Array.from({ length: Math.max(1, endH - startH) }, (_, i) => i + startH);
    
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayThreshold = startOfToday.getTime();

    const todayLogs = logs.filter(l => {
      const ts = normalizeTs(l.timestamp);
      return ts >= todayThreshold && l.action === AttendanceAction.LOGIN && l.status === LogStatus.SUCCESS;
    });
    
    return hours.map(h => {
      const count = todayLogs.filter(l => new Date(normalizeTs(l.timestamp)).getHours() === h).length;
      return { hour: `${h}:00`, count };
    });
  }, [logs, settings.dayStart, settings.dayEnd]);

  const nightChartData = useMemo(() => {
    const nightHours = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const relevantLogs = logs.filter(l => {
      if (l.action !== AttendanceAction.LOGIN || l.status !== LogStatus.SUCCESS) return false;
      const logDate = new Date(normalizeTs(l.timestamp));
      const logHour = logDate.getHours();

      const isYesterdayNight = logDate.toDateString() === yesterday.toDateString() && logHour >= 18;
      const isTodayNight = logDate.toDateString() === today.toDateString() && logHour <= 6;

      return isYesterdayNight || isTodayNight;
    });

    return nightHours.map(h => {
      const count = relevantLogs.filter(l => new Date(normalizeTs(l.timestamp)).getHours() === h).length;
      return { hour: `${h}:00`, count };
    });
  }, [logs]);


  const modalList = useMemo(() => {
    let list = employees;
    if (modalMode === 'PRESENT') {
      list = employees.filter(e => stats.presentIds.has(String(e.id).trim()));
    }
    if (modalSearch) {
      list = list.filter(e => e.name.toLowerCase().includes(modalSearch.toLowerCase()));
    }
    return list;
  }, [modalMode, employees, stats, modalSearch]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12 bg-gray-900 text-white p-4 md:p-8 rounded-lg">
      <style>{`
        @keyframes bounce-callout {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .animate-bounce-callout {
          animation: bounce-callout 2s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
      `}</style>

      {modalMode && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-gray-800 rounded-[2.5rem] w-full max-w-2xl h-[85vh] flex flex-col shadow-2xl animate-in zoom-in duration-300 overflow-hidden border border-white/20">
            <div className="px-8 py-6 border-b border-gray-700 flex justify-between items-center bg-gray-800/50">
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-tight">
                  {modalMode === 'PRESENT' ? 'Currently Logged In' : 'Employee Details'}
                </h3>
                <p className="text-[10px] text-gray-300 font-bold uppercase tracking-widest mt-1">Found {modalList.length} results</p>
              </div>
              <button onClick={() => { setModalMode(null); setModalSearch(''); }} className="p-2 hover:bg-gray-700 rounded-full transition-colors text-white">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 bg-gray-800 border-b border-gray-700">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  autoFocus
                  placeholder="Filter results..." 
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 bg-gray-700 border border-gray-600 rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-white transition-all text-white"
                />
              </div>
            </div>

            <div className="flex-grow overflow-y-auto p-4 md:p-8">
              <div className="grid grid-cols-1 gap-3">
                {modalList.map(emp => {
                  const isPresent = stats.presentIds.has(String(emp.id).trim());
                  return (
                    <div key={emp.id} className="p-5 bg-gray-800 border border-gray-700 rounded-2xl flex items-center justify-between hover:border-white transition-all group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${isPresent ? 'bg-emerald-900 text-emerald-400' : 'bg-gray-700 text-gray-400'}`}>
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-white uppercase text-sm leading-tight">{emp.name}</p>
                          <p className="text-[10px] text-gray-300 font-bold uppercase mt-0.5">{emp.department}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex flex-wrap gap-4 items-center">
        <button onClick={() => onQuickAction('ADD_STAFF')} className="flex items-center gap-2 px-6 py-4 bg-white text-black rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all">
          <Plus size={16} /> Add Employee
        </button>
        <button onClick={() => onQuickAction('NOTICE')} className="flex items-center gap-2 px-6 py-4 bg-gray-800 border-2 border-gray-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-white transition-all">
          <Megaphone size={16} /> Send Announcement
        </button>
        <button onClick={() => onQuickAction('REPORT')} className="flex items-center gap-2 px-6 py-4 bg-gray-800 border-2 border-gray-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-white transition-all">
          <Download size={16} /> Download Report
        </button>
        <button onClick={() => onQuickAction('SYNC')} className="flex items-center gap-2 px-6 py-4 bg-gray-800 border-2 border-gray-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-white transition-all ml-auto">
          <RefreshCw size={16} /> Refresh Data
        </button>
      </div>

      <div className='px-5 py-2.5 bg-gray-700 rounded-xl text-[10px] font-black uppercase text-white flex items-center gap-2 border border-gray-600 w-fit'>
        <Calendar size={14} className="text-white" /> Today: {new Date().toLocaleDateString('en-GB')}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AttendanceChart title="Day Shift" data={dayChartData} />
        <AttendanceChart title="Night Shift" data={nightChartData} />
      </div>

    </div>
  );
};

export default AdminOverview;
