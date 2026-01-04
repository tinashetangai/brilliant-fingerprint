
import React, { useMemo, useState } from 'react';
import { 
  Users, 
  UserCheck, 
  UserMinus, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar,
  Zap,
  Plus,
  Megaphone,
  Download,
  RefreshCw,
  Truck,
  X,
  Search,
  CheckCircle2
} from 'lucide-react';
import { Employee, AttendanceLog, AttendanceAction, SystemSettings, LogStatus } from '../types';

interface AdminOverviewProps {
  employees: Employee[];
  logs: AttendanceLog[];
  onQuickAction: (action: 'ADD_STAFF' | 'NOTICE' | 'REPORT' | 'SYNC') => void;
  settings: SystemSettings;
}

type ModalMode = 'TOTAL' | 'PRESENT' | 'ABSENT' | 'OUTSIDE' | null;

const AdminOverview: React.FC<AdminOverviewProps> = ({ employees, logs, onQuickAction, settings }) => {
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalSearch, setModalSearch] = useState('');

  const stats = useMemo(() => {
    const now = Date.now();

    // Normalization helper for varied data formats (Seconds, MS, Strings, Firestore)
    const normalizeTs = (ts: any): number => {
      if (!ts) return 0;
      if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
      if (typeof ts === 'string') return new Date(ts).getTime();
      if (ts?.seconds) return ts.seconds * 1000;
      return 0;
    };

    // Calculate local midnight for the threshold
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayThreshold = startOfToday.getTime();

    // 1. Find the last action for each employee today
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

    // 2. Categorize employees based on their last action
    const presentIds = new Set<string>();
    const fieldDutyIds = new Set<string>();
    const absentIds = new Set<string>();

    employees.forEach(emp => {
      const eid = String(emp.id).trim();
      const lastAction = employeeLastAction[eid];
      const isPresent = lastAction && lastAction.action === AttendanceAction.LOGIN;
      const isField = emp.outsideWorkUntil && normalizeTs(emp.outsideWorkUntil) > now;

      // Logic Hierarchy: Present (Last action is LOGIN) > Field Duty (Mission) > Absent (Missing)
      if (isPresent) {
        presentIds.add(eid);
      } else if (isField) {
        fieldDutyIds.add(eid);
      } else {
        absentIds.add(eid);
      }
    });

    const total = employees.length;

    // Reliability Check: Sum of categories must equal the total registry
    console.log(`[DASHBOARD_SYNC] Total Registry: ${total} | Present: ${presentIds.size} | Field: ${fieldDutyIds.size} | Absent: ${absentIds.size}`);

    // 3. Calculate active visitors
    const visitorLastAction: { [key: string]: { timestamp: number, action: AttendanceAction } } = {};
    logs.forEach(log => {
      if (log.status !== LogStatus.SUCCESS || log.type !== 'VISITOR') return;
      const ts = normalizeTs(log.timestamp);
      if (ts < todayThreshold) return;

      const visitorId = String(log.subjectId).trim();
      if (!visitorLastAction[visitorId] || ts > visitorLastAction[visitorId].timestamp) {
        visitorLastAction[visitorId] = { timestamp: ts, action: log.action };
      }
    });

    const activeVisitors = Object.values(visitorLastAction).filter(v => v.action === AttendanceAction.LOGIN).length;

    return {
      total,
      activeVisitors,
      present: presentIds.size,
      absent: absentIds.size,
      outside: fieldDutyIds.size,
      presentPct: total ? (presentIds.size / total) * 100 : 0,
      absentPct: total ? (absentIds.size / total) * 100 : 0,
      outsidePct: total ? (fieldDutyIds.size / total) * 100 : 0,
      presentIds,
      absentIds,
      fieldDutyIds,
      normalizeTs // Exported for use in chartData
    };
  }, [employees, logs]);

  const { dayChartData, nightChartData } = useMemo(() => {
    const dayHours = Array.from({ length: 12 }, (_, i) => i + 6); // 6:00 - 17:00
    const nightHours = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5]; // 18:00 - 05:00

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayThreshold = startOfToday.getTime();

    const todayLogs = logs.filter(l => {
      const ts = stats.normalizeTs(l.timestamp);
      return ts >= todayThreshold && l.action === AttendanceAction.LOGIN && l.status === LogStatus.SUCCESS;
    });

    const processShift = (hours: number[]) => {
      return hours.map(h => {
        const count = todayLogs.filter(l => {
          const logDate = new Date(stats.normalizeTs(l.timestamp));
          return logDate.getHours() === h;
        }).length;
        return { hour: `${String(h).padStart(2, '0')}:00`, count };
      });
    };

    return {
      dayChartData: processShift(dayHours),
      nightChartData: processShift(nightHours),
    };
  }, [logs, stats]);

  const modalList = useMemo(() => {
    let list = employees;
    if (modalMode === 'PRESENT') {
      list = employees.filter(e => stats.presentIds.has(String(e.id).trim()));
    } else if (modalMode === 'ABSENT') {
      list = employees.filter(e => stats.absentIds.has(String(e.id).trim()));
    } else if (modalMode === 'OUTSIDE') {
      list = employees.filter(e => stats.fieldDutyIds.has(String(e.id).trim()));
    } else if (modalMode === 'TOTAL') {
      list = employees;
    }

    if (modalSearch) {
      list = list.filter(e => e.name.toLowerCase().includes(modalSearch.toLowerCase()));
    }
    return list;
  }, [modalMode, employees, stats, modalSearch]);

  const chartHeight = 180;
  const chartWidth = 800;

  const Chart = ({ title, data, gradientId, gradientColor1, gradientColor2 }: { title: string, data: any[], gradientId: string, gradientColor1: string, gradientColor2: string }) => {
    const maxCount = Math.max(...data.map(d => d.count), 5);
    return (
      <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-16">
          <div>
            <h3 className="text-3xl font-black text-black uppercase tracking-tight">{title}</h3>
            <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">Clock-in Volume by Hour</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-5 py-2.5 bg-gray-50 rounded-xl text-sm font-black uppercase text-black flex items-center gap-2 border border-gray-100">
              <Calendar size={16} className="text-black" /> Today: {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
        </div>
        <div className="relative w-full h-[280px] mt-20">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={gradientColor1} />
                <stop offset="100%" stopColor={gradientColor2} />
              </linearGradient>
            </defs>
            {[0, 0.5, 1].map((p, i) => (
              <line key={i} x1="0" y1={p * chartHeight} x2={chartWidth} y2={p * chartHeight} stroke="#f3f4f6" strokeWidth="2" strokeDasharray="5" />
            ))}
            {data.map((d, i) => {
              const barWidth = 45;
              const x = (i / (data.length - 1)) * (chartWidth - barWidth);
              const barHeight = (d.count / maxCount) * chartHeight;
              const y = chartHeight - barHeight;
              return (
                <g key={i} className="group/bar">
                  <rect x={x} y={y} width={barWidth} height={barHeight} fill={`url(#${gradientId})`} className="transition-all duration-500 hover:opacity-80 cursor-pointer" rx="10" />
                  <foreignObject x={x - 27.5} y={y - 75} width="100" height="70" className="overflow-visible pointer-events-none opacity-0 group-hover/bar:opacity-100 transition-opacity duration-300">
                    <div className="flex flex-col items-center animate-bounce-callout">
                      <div className="bg-black text-white text-lg font-black px-4 py-2 rounded-xl shadow-2xl flex flex-col items-center justify-center min-w-[60px] border-4 border-white">
                        <span className="text-xs leading-none opacity-60 mb-1">{d.hour}</span>
                        <span className="leading-none">{d.count}</span>
                      </div>
                      <div className="w-3.5 h-3.5 bg-black transform rotate-45 -mt-2 border-r-4 border-b-4 border-white"></div>
                    </div>
                  </foreignObject>
                  <text x={x + barWidth / 2} y={chartHeight + 35} textAnchor="middle" className="text-base font-black fill-black uppercase tracking-wider">{d.hour}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12">
      <style>{`
        @keyframes bounce-callout {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-callout {
          animation: bounce-callout 1.5s cubic-bezier(0.45, 0, 0.55, 1) infinite;
        }
      `}</style>

      {modalMode && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-8 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl h-[85vh] flex flex-col shadow-2xl animate-in zoom-in duration-300 overflow-hidden border border-white/20">
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div>
                <h3 className="text-xl font-black text-black uppercase tracking-tight">
                  {modalMode === 'TOTAL' ? 'Registry Overview' : modalMode === 'PRESENT' ? 'Currently Logged In' : modalMode === 'OUTSIDE' ? 'Field Duty Staff' : 'Absent Personnel'}
                </h3>
                <p className="text-[10px] text-black font-bold uppercase tracking-widest mt-1">Found {modalList.length} results</p>
              </div>
              <button onClick={() => { setModalMode(null); setModalSearch(''); }} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-black">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 bg-slate-50 border-b border-gray-100">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  autoFocus
                  placeholder="Filter results..." 
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  className="w-full pl-12 pr-6 py-3.5 bg-white border border-gray-200 rounded-2xl text-sm font-semibold outline-none focus:ring-2 focus:ring-black transition-all"
                />
              </div>
            </div>

            <div className="flex-grow overflow-y-auto p-4 md:p-8">
              <div className="grid grid-cols-1 gap-3">
                {modalList.map(emp => {
                  const eid = String(emp.id).trim();
                  const isPresent = stats.presentIds.has(eid);
                  const isField = stats.fieldDutyIds.has(eid);
                  const status = isPresent ? 'PRESENT' : isField ? 'FIELD DUTY' : 'ABSENT';
                  
                  return (
                    <div key={emp.id} className="p-5 bg-white border border-gray-100 rounded-2xl flex items-center justify-between hover:border-black transition-all group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-xs ${isPresent ? 'bg-emerald-50 text-emerald-600' : isField ? 'bg-orange-50 text-orange-600' : 'bg-gray-50 text-gray-400'}`}>
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-black text-black uppercase text-sm leading-tight">{emp.name}</p>
                          <p className="text-[10px] text-black font-bold uppercase mt-0.5">{emp.department}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-black px-3 py-1 rounded-full uppercase tracking-widest ${isPresent ? 'bg-emerald-100 text-emerald-700' : isField ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-400'}`}>
                          {status}
                        </span>
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
        <button onClick={() => onQuickAction('ADD_STAFF')} className="flex items-center gap-2 px-6 py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl hover:scale-105 active:scale-95 transition-all">
          <Plus size={16} /> Add Employee
        </button>
        <button onClick={() => onQuickAction('NOTICE')} className="flex items-center gap-2 px-6 py-4 bg-white border-2 border-gray-100 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-black transition-all">
          <Megaphone size={16} /> Send Announcement
        </button>
        <button onClick={() => onQuickAction('REPORT')} className="flex items-center gap-2 px-6 py-4 bg-white border-2 border-gray-100 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-black transition-all">
          <Download size={16} /> Download Report
        </button>
        <button onClick={() => onQuickAction('SYNC')} className="flex items-center gap-2 px-6 py-4 bg-white border-2 border-gray-100 text-black rounded-2xl font-black uppercase text-[10px] tracking-widest hover:border-black transition-all ml-auto">
          <RefreshCw size={16} /> Refresh Data
        </button>
      </div>


      <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm">
        <div className="flex justify-between items-center mb-16">
          <div>
            <h3 className="text-2xl font-black text-black uppercase tracking-tight">Attendance Trend</h3>
            <p className="text-[10px] text-black font-bold uppercase tracking-widest mt-1">Clock-in volume by hour</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-5 py-2.5 bg-gray-50 rounded-xl text-[10px] font-black uppercase text-black flex items-center gap-2 border border-gray-100">
              <Calendar size={14} className="text-black" /> Today: {new Date().toLocaleDateString('en-GB')}
            </div>
          </div>
        </div>

        <div className="relative w-full h-[250px] mt-20">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#059669" />
              </linearGradient>
            </defs>

            {[0, 0.5, 1].map((p, i) => (
              <line key={i} x1="0" y1={p * chartHeight} x2={chartWidth} y2={p * chartHeight} stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4" />
            ))}
            
            {chartData.map((d, i) => {
              const barWidth = 40;
              const x = (i / (chartData.length - 1)) * (chartWidth - barWidth);
              const barHeight = (d.count / maxCount) * chartHeight;
              const y = chartHeight - barHeight;
              return (
                <g key={i} className="group/bar">
                  <rect x={x} y={y} width={barWidth} height={barHeight} className="bar-gradient transition-all duration-500 hover:opacity-80 cursor-pointer" rx="8" />
                  <foreignObject x={x - 20} y={y - 65} width="80" height="60" className="overflow-visible pointer-events-none">
                    <div className="flex flex-col items-center animate-bounce-callout">
                      <div className="bg-black text-white text-[11px] font-black px-3 py-1.5 rounded-xl shadow-2xl flex flex-col items-center justify-center min-w-[45px] border border-white/20">
                        <span className="text-[7px] leading-none opacity-60 mb-0.5">{d.hour}</span>
                        <span className="leading-none">{d.count}</span>
                      </div>
                      <div className="w-2.5 h-2.5 bg-black transform rotate-45 -mt-1.5 border-r border-b border-white/20"></div>
                    </div>
                  </foreignObject>
                  <text x={x + barWidth / 2} y={chartHeight + 25} textAnchor="middle" className="text-[12px] font-black fill-black uppercase tracking-tighter">{d.hour}</text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
