
import React, { useMemo, useState } from 'react';
import { 
  Calendar,
  Plus,
  Megaphone,
  Download,
  RefreshCw,
  X,
  Search,
  ChevronDown,
  Users,
  UserCheck,
  Clock,
  User,
  Briefcase,
  UserPlus,
  CheckCircle2
} from 'lucide-react';
import { Employee, AttendanceLog, AttendanceAction, SystemSettings, LogStatus } from '../types';
import { dataService } from '../services/dataService';
import { formatDate } from '../services/dateUtils';

interface AdminOverviewProps {
  employees: Employee[];
  logs: AttendanceLog[];
  onQuickAction: (action: 'ADD_STAFF' | 'NOTICE' | 'REPORT' | 'SYNC') => void;
  settings: SystemSettings;
}

type ModalMode = 'TOTAL' | 'PRESENT' | 'LATE' | 'VISITOR' | 'SALES' | null;
type TimeFilter = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH';

const normalizeTs = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts?.seconds) return ts.seconds * 1000;
  return 0;
};

const AttendanceChart: React.FC<{
  title: string, 
  data: {hour: string, count: number}[], 
  color: 'emerald' | 'violet'
}> = ({ title, data, color }) => {
  const chartHeight = 220;
  const chartWidth = 800;
  const padding = { top: 20, right: 20, bottom: 40, left: 40 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;
  
  const maxCount = Math.max(...data.map(d => d.count), 5);
  const gradientId = `gradient-${color}`;
  const stopColor1 = color === 'emerald' ? '#10b981' : '#8b5cf6';
  const stopColor2 = color === 'emerald' ? '#34d399' : '#a78bfa';

  return (
    <div className="bg-white p-4 md:p-6 rounded-none shadow-none border border-slate-200 relative overflow-hidden flex flex-col h-full">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-sm md:text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            {color === 'emerald' ? <span className="text-emerald-500">☀️</span> : <span className="text-violet-500">🌙</span>}
            {title}
          </h3>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Hourly Volume</p>
        </div>
        <div className="text-right">
           <span className={`text-xl font-black ${color === 'emerald' ? 'text-emerald-600' : 'text-violet-600'}`}>
             {data.reduce((a,b) => a + b.count, 0)}
           </span>
        </div>
      </div>

      <div className="flex-grow w-full overflow-hidden">
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-auto max-h-full overflow-visible" preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stopColor1} stopOpacity="0.8" />
              <stop offset="100%" stopColor={stopColor2} stopOpacity="0.3" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
            const y = padding.top + (graphHeight * p);
            const value = Math.round(maxCount * (1 - p));
            return (
              <g key={i}>
                <line x1={padding.left} y1={y} x2={chartWidth - padding.right} y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="4 4" />
                <text x={padding.left - 10} y={y + 4} textAnchor="end" className="text-[10px] font-bold fill-slate-400">{value}</text>
              </g>
            );
          })}
          <line x1={padding.left} y1={chartHeight - padding.bottom} x2={chartWidth - padding.right} y2={chartHeight - padding.bottom} stroke="#cbd5e1" strokeWidth="2" />
          {data.map((d, i) => {
            const barWidth = (graphWidth / data.length) * 0.6;
            const x = padding.left + (i * (graphWidth / data.length)) + ((graphWidth / data.length - barWidth) / 2);
            const barHeight = (d.count / maxCount) * graphHeight;
            const y = (chartHeight - padding.bottom) - barHeight;
            return (
              <g key={i}>
                <rect x={x} y={y} width={barWidth} height={Math.max(barHeight, 2)} fill={`url(#${gradientId})`} />
                <text x={x + barWidth / 2} y={chartHeight - padding.bottom + 16} textAnchor="middle" className="text-[9px] font-bold fill-slate-400 uppercase">{d.hour.split(':')[0]}</text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  label: string;
  value: number | string;
  subtext: string;
  icon: any;
  bgClass: string;
  textClass: string;
  onClick: () => void;
}> = ({ label, value, subtext, icon: Icon, bgClass, textClass, onClick }) => (
  <button 
    onClick={onClick}
    className={`p-5 md:p-6 rounded-none border transition-all duration-300 text-left h-full flex flex-col justify-between ${bgClass}`}
  >
    <div className="flex justify-between items-start w-full">
      <div className={`w-10 h-10 rounded-none flex items-center justify-center border ${textClass} bg-white/50`}>
        <Icon size={18} />
      </div>
      <div className="px-2 py-0.5 border border-slate-200 bg-white/80 rounded-none text-[8px] font-black uppercase tracking-widest text-slate-600">
        Today
      </div>
    </div>
    <div className="mt-4">
      <h4 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter leading-none">{value}</h4>
      <p className={`text-[9px] md:text-[10px] font-black uppercase tracking-widest mt-1.5 ${textClass}`}>{label}</p>
      <p className="text-[8px] font-bold text-slate-400 mt-2 uppercase tracking-tighter">{subtext}</p>
    </div>
  </button>
);

const AdminOverview: React.FC<AdminOverviewProps> = ({ employees, logs, onQuickAction, settings }) => {
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('TODAY');
  
  // Sales Modal State
  const [salesSearch, setSalesSearch] = useState('');

  const getFilteredLogs = () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let startTime = 0;
    let endTime = now.getTime();

    switch (timeFilter) {
      case 'TODAY': startTime = todayStart; break;
      case 'YESTERDAY': 
        startTime = todayStart - 86400000; 
        endTime = todayStart;
        break;
      case 'WEEK': 
        const day = now.getDay(); 
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now);
        monday.setDate(diff);
        monday.setHours(0,0,0,0);
        startTime = monday.getTime();
        break;
      case 'MONTH': startTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime(); break;
    }

    return logs.filter(l => {
      const ts = normalizeTs(l.timestamp);
      return ts >= startTime && ts < endTime;
    });
  };

  const filteredLogs = useMemo(() => getFilteredLogs(), [logs, timeFilter]);

  const stats = useMemo(() => {
    // Determine current state of each employee based on logs in the filtered range
    // Logic: Sort by time, if last action is LOGIN -> Present.
    
    // Sort logs ascending for chronological processing
    const sortedLogs = [...filteredLogs].sort((a,b) => normalizeTs(a.timestamp) - normalizeTs(b.timestamp));
    
    const employeeStatus = new Map<string, AttendanceAction>();
    const visitorStatus = new Map<string, AttendanceAction>();
    const firstLoginTimes = new Map<string, number>();

    sortedLogs.forEach(l => {
      if (l.status === LogStatus.SUCCESS) {
        if (l.type === 'EMPLOYEE') {
          // Track current status (toggle)
          employeeStatus.set(l.subjectId, l.action);
          
          // Track first login for Late calculation
          if (l.action === AttendanceAction.LOGIN && !firstLoginTimes.has(l.subjectId)) {
            firstLoginTimes.set(l.subjectId, normalizeTs(l.timestamp));
          }
        } else if (l.type === 'VISITOR') {
          visitorStatus.set(l.subjectId, l.action);
        }
      }
    });

    let presentCount = 0;
    employeeStatus.forEach((action, empId) => {
      // CRITICAL: Exclude Sales personnel from "Active Today" count
      const emp = employees.find(e => e.id === empId);
      if (action === AttendanceAction.LOGIN && (!emp || !emp.isSales)) {
        presentCount++;
      }
    });

    let visitorCount = 0;
    visitorStatus.forEach((action) => {
      if (action === AttendanceAction.LOGIN) visitorCount++;
    });

    let lateCount = 0;
    if (settings.lateThreshold) {
      const [thH, thM] = settings.lateThreshold.split(':').map(Number);
      firstLoginTimes.forEach((ts) => {
        const logDate = new Date(ts);
        const threshold = new Date(logDate);
        threshold.setHours(thH, thM, 0, 0);
        if (logDate > threshold) lateCount++;
      });
    }

    const salesCount = employees.filter(e => e.isSales).length;

    return {
      present: presentCount,
      late: lateCount,
      visitors: visitorCount, // Currently onsite visitors
      totalVisitors: new Set(filteredLogs.filter(l => l.type === 'VISITOR').map(l => l.subjectId)).size, // Historical visitor count if needed
      totalStaff: employees.length,
      sales: salesCount
    };
  }, [filteredLogs, employees, settings.lateThreshold]);

  const dayChartData = useMemo(() => {
    const startH = parseInt(settings.dayStart.split(':')[0]) || 6;
    const endH = parseInt(settings.dayEnd.split(':')[0]) || 18;
    const hours = Array.from({ length: Math.max(1, endH - startH) }, (_, i) => i + startH);
    
    return hours.map(h => {
      const count = filteredLogs.filter(l => {
        const d = new Date(normalizeTs(l.timestamp));
        return d.getHours() === h && l.action === AttendanceAction.LOGIN && l.status === LogStatus.SUCCESS;
      }).length;
      return { hour: `${h}:00`, count };
    });
  }, [filteredLogs, settings.dayStart, settings.dayEnd]);

  const nightChartData = useMemo(() => {
    // UPDATED: Strictly 18:00 to 05:00 (i.e., hours 18-23 and 0-5)
    // Removed hour 6 (06:00) as per request "to 5 morning"
    const nightHours = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
    return nightHours.map(h => {
      const count = filteredLogs.filter(l => {
        const d = new Date(normalizeTs(l.timestamp));
        return d.getHours() === h && l.action === AttendanceAction.LOGIN && l.status === LogStatus.SUCCESS;
      }).length;
      return { hour: `${h}:00`, count };
    });
  }, [filteredLogs]);

  const modalList = useMemo(() => {
    let list = employees;
    if (modalMode === 'PRESENT') {
      // Re-calculate present IDs specifically for the modal
      const sortedLogs = [...filteredLogs].sort((a,b) => normalizeTs(a.timestamp) - normalizeTs(b.timestamp));
      const presentIds = new Set<string>();
      sortedLogs.forEach(l => {
        if (l.type === 'EMPLOYEE' && l.status === LogStatus.SUCCESS) {
          if (l.action === AttendanceAction.LOGIN) presentIds.add(l.subjectId);
          else if (l.action === AttendanceAction.LOGOUT) presentIds.delete(l.subjectId);
        }
      });
      // Exclude Sales from "Present" list view as well
      list = employees.filter(e => presentIds.has(e.id) && !e.isSales);
    }
    else if (modalMode === 'LATE') {
       // Filter employees who were late today
       if (settings.lateThreshold) {
         const [thH, thM] = settings.lateThreshold.split(':').map(Number);
         // Get first login per employee
         const firstLogins = new Map<string, number>();
         filteredLogs.forEach(l => {
            if (l.type === 'EMPLOYEE' && l.action === AttendanceAction.LOGIN && l.status === LogStatus.SUCCESS) {
               const ts = normalizeTs(l.timestamp);
               if (!firstLogins.has(l.subjectId) || ts < firstLogins.get(l.subjectId)!) {
                  firstLogins.set(l.subjectId, ts);
               }
            }
         });
         
         const lateIds = new Set<string>();
         firstLogins.forEach((ts, id) => {
            const d = new Date(ts);
            const th = new Date(d);
            th.setHours(thH, thM, 0, 0);
            if (d > th) lateIds.add(id);
         });
         
         list = employees.filter(e => lateIds.has(e.id));
       } else {
         list = [];
       }
    }

    if (modalSearch) {
      list = list.filter(e => e.name.toLowerCase().includes(modalSearch.toLowerCase()));
    }
    return list;
  }, [modalMode, employees, filteredLogs, modalSearch, settings.lateThreshold]);

  // Specific Lists for Sales Modal
  const salesTeamList = useMemo(() => employees.filter(e => e.isSales), [employees]);
  const availableForSales = useMemo(() => {
    return employees.filter(e => !e.isSales && (
      e.name.toLowerCase().includes(salesSearch.toLowerCase()) || 
      e.department.toLowerCase().includes(salesSearch.toLowerCase())
    ));
  }, [employees, salesSearch]);

  const QuickActionButton = ({ icon: Icon, label, action, colorClass }: any) => (
    <button 
      onClick={() => onQuickAction(action)} 
      className={`relative p-5 rounded-none border border-slate-200 transition-all bg-white group text-left flex flex-col justify-between h-24 hover:border-black ${colorClass}`}
    >
      <div className="mb-2 text-slate-700 group-hover:text-black">
          <Icon size={20} strokeWidth={2} />
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-black">{label}</span>
    </button>
  );

  return (
    <div className="space-y-6 md:space-y-10 pb-12 animate-in fade-in duration-500">
      
      {modalMode && modalMode !== 'SALES' && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-none">
          <div className="bg-white rounded-none w-full max-w-2xl h-[85vh] flex flex-col shadow-none border border-slate-300 animate-in zoom-in duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-widest">
                {modalMode === 'PRESENT' ? 'Present Staff' : modalMode === 'LATE' ? 'Late Arrivals' : 'Total Staff'}
              </h3>
              <button onClick={() => { setModalMode(null); setModalSearch(''); }} className="p-1 hover:bg-slate-200 rounded-none"><X size={20} /></button>
            </div>
            
            <div className="p-4 bg-white border-b border-slate-100">
              <input 
                autoFocus
                placeholder="Filter name..." 
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-none text-xs font-bold outline-none focus:border-black transition-all"
              />
            </div>

            <div className="flex-grow overflow-y-auto p-4 space-y-2 bg-slate-50">
              {modalList.map(emp => (
                <div key={emp.id} className="p-3 bg-white border border-slate-200 rounded-none flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-900 text-white rounded-none flex items-center justify-center font-black text-[10px]">
                    {emp.name.charAt(0)}
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-[11px] uppercase tracking-tight">{emp.name}</p>
                    <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{emp.department}</p>
                  </div>
                </div>
              ))}
              {modalList.length === 0 && <div className="text-center py-10 text-slate-400 text-xs font-bold uppercase">No records found</div>}
            </div>
          </div>
        </div>
      )}

      {/* SALES MODAL */}
      {modalMode === 'SALES' && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-none">
          <div className="bg-white rounded-[2rem] w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl border border-slate-300 animate-in zoom-in duration-150 overflow-hidden">
            <div className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-lg font-black text-indigo-900 uppercase tracking-tight">Sales Team Management</h3>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                  Auto-Logging 06:30 - 18:00
                </p>
              </div>
              <button onClick={() => setModalMode(null)} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
              {/* Left: Current Team */}
              <div className="w-full md:w-1/2 border-r border-gray-100 flex flex-col bg-indigo-50/30">
                <div className="p-4 border-b border-gray-100 bg-white">
                  <h4 className="text-xs font-black uppercase text-indigo-900 tracking-widest flex items-center gap-2">
                    <Briefcase size={14}/> Active Sales Staff ({salesTeamList.length})
                  </h4>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-2">
                  {salesTeamList.map(emp => (
                    <div key={emp.id} className="p-3 bg-white border border-indigo-100 rounded-xl flex items-center justify-between shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-100 text-indigo-700 rounded-lg flex items-center justify-center font-bold text-xs">
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-xs uppercase">{emp.name}</p>
                          <p className="text-[9px] text-gray-400 font-bold uppercase">{emp.department}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => dataService.toggleSalesStatus(emp.id, false)}
                        className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
                        title="Remove from Sales"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  {salesTeamList.length === 0 && (
                    <div className="py-10 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                      No staff assigned
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Add New */}
              <div className="w-full md:w-1/2 flex flex-col bg-white">
                <div className="p-4 border-b border-gray-100 bg-gray-50/50">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                    <input 
                      placeholder="Search to add..." 
                      value={salesSearch}
                      onChange={(e) => setSalesSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
                <div className="flex-grow overflow-y-auto p-4 space-y-2">
                  {availableForSales.map(emp => (
                    <div key={emp.id} className="p-3 border border-gray-100 rounded-xl flex items-center justify-between hover:bg-gray-50 transition-colors group">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center font-bold text-xs group-hover:bg-white">
                          {emp.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-xs uppercase">{emp.name}</p>
                          <p className="text-[9px] text-gray-400 font-bold uppercase">{emp.department}</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => { dataService.toggleSalesStatus(emp.id, true); setSalesSearch(''); }}
                        className="px-3 py-1.5 bg-black text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-colors flex items-center gap-1"
                      >
                        <Plus size={10} /> Add
                      </button>
                    </div>
                  ))}
                  {availableForSales.length === 0 && (
                    <div className="py-10 text-center text-gray-400 text-[10px] font-bold uppercase tracking-widest">
                      No matching employees found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="flex flex-col gap-6 lg:flex-row lg:justify-between lg:items-end">
        <div className="space-y-4">
          <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tighter leading-none">Management</h2>
          <div className='inline-flex items-center gap-2 px-3 py-1 bg-white rounded-none text-[9px] font-black uppercase tracking-widest text-slate-400 border border-slate-200'>
            <Calendar size={12} className="text-emerald-500" /> 
            {timeFilter}: {formatDate(new Date())}
          </div>
        </div>

        <div className="flex bg-slate-100 p-1 rounded-none border border-slate-200 overflow-x-auto no-scrollbar">
          {['TODAY', 'YESTERDAY', 'WEEK', 'MONTH'].map((f) => (
            <button
              key={f}
              onClick={() => setTimeFilter(f as TimeFilter)}
              className={`flex-shrink-0 px-5 py-2 rounded-none text-[9px] font-black uppercase tracking-widest transition-all ${timeFilter === f ? 'bg-black text-white shadow-none' : 'text-slate-400 hover:text-slate-900'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Update to include Sales Card */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard label="Total Staff" value={stats.totalStaff} subtext="System Registry" icon={Users} bgClass="bg-white border-slate-200" textClass="text-blue-600" onClick={() => setModalMode('TOTAL')} />
        <StatCard label="Present" value={stats.present} subtext="Active On-Site" icon={UserCheck} bgClass="bg-white border-slate-200" textClass="text-emerald-600" onClick={() => setModalMode('PRESENT')} />
        <StatCard label="Sales Team" value={stats.sales} subtext="Auto-Logged Staff" icon={Briefcase} bgClass="bg-indigo-50 border-indigo-100" textClass="text-indigo-600" onClick={() => setModalMode('SALES')} />
        <StatCard label="Late Arrivals" value={stats.late} subtext={`Past ${settings.lateThreshold}`} icon={Clock} bgClass="bg-white border-slate-200" textClass="text-rose-600" onClick={() => setModalMode('LATE')} />
        <StatCard label="Visitors" value={stats.visitors} subtext="Active Entries" icon={User} bgClass="bg-white border-slate-200" textClass="text-violet-600" onClick={() => {}} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-[250px] md:h-[300px]">
          <AttendanceChart title="Day Operations" data={dayChartData} color="emerald" />
        </div>
        <div className="h-[250px] md:h-[300px]">
          <AttendanceChart title="Night Operations" data={nightChartData} color="violet" />
        </div>
      </div>

      <div>
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4 px-1">Utility Panel</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <QuickActionButton icon={Plus} label="Enrollment" action="ADD_STAFF" colorClass="hover:bg-blue-50" />
          <QuickActionButton icon={Megaphone} label="Broadcast" action="NOTICE" colorClass="hover:bg-orange-50" />
          <QuickActionButton icon={Download} label="Reports" action="REPORT" colorClass="hover:bg-emerald-50" />
          <QuickActionButton icon={RefreshCw} label="Force Sync" action="SYNC" colorClass="hover:bg-purple-50" />
        </div>
      </div>
    </div>
  );
};

export default AdminOverview;
