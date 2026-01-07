
import React, { useMemo, useState } from 'react';
import { 
  Calendar,
  Plus,
  Megaphone,
  Download,
  RefreshCw,
  X,
  Search,
  Filter,
  BarChart3,
  Clock,
  ChevronDown
} from 'lucide-react';
import { Employee, AttendanceLog, AttendanceAction, SystemSettings, LogStatus } from '../types';

interface AdminOverviewProps {
  employees: Employee[];
  logs: AttendanceLog[];
  onQuickAction: (action: 'ADD_STAFF' | 'NOTICE' | 'REPORT' | 'SYNC') => void;
  settings: SystemSettings;
}

type ModalMode = 'TOTAL' | 'PRESENT' | 'ABSENT' | 'OUTSIDE' | null;
type TimeFilter = 'TODAY' | 'YESTERDAY' | 'WEEK' | 'MONTH';

// Normalization helper
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
  const chartHeight = 250;
  const chartWidth = 900;
  const maxCount = Math.max(...data.map(d => d.count), 5);
  
  // Theme colors
  const gradientId = `gradient-${color}`;
  const stopColor1 = color === 'emerald' ? '#10b981' : '#8b5cf6';
  const stopColor2 = color === 'emerald' ? '#064e3b' : '#4c1d95';

  return (
    <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-[2.5rem] shadow-xl backdrop-blur-sm relative overflow-hidden">
      <div className="flex justify-between items-end mb-8 relative z-10">
        <div>
          <h3 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
            {color === 'emerald' ? <span className="text-emerald-400">☀</span> : <span className="text-violet-400">Cw</span>}
            {title}
          </h3>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Activity Distribution</p>
        </div>
        <div className="text-right">
           <span className="text-4xl font-black text-white">{data.reduce((a,b) => a + b.count, 0)}</span>
           <p className="text-[9px] text-gray-400 uppercase tracking-widest">Total Events</p>
        </div>
      </div>

      {/* Scrollable Container for Mobile */}
      <div className="overflow-x-auto pb-4 no-scrollbar">
        <div className="min-w-[600px] lg:min-w-full h-[280px]">
          <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full h-full overflow-visible">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stopColor1} stopOpacity="1" />
                <stop offset="100%" stopColor={stopColor2} stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Grid Lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
              <line key={i} x1="0" y1={p * chartHeight} x2={chartWidth} y2={p * chartHeight} stroke="white" strokeOpacity="0.05" strokeWidth="1" />
            ))}

            {data.map((d, i) => {
              const barWidth = 45;
              const gap = (chartWidth - (data.length * barWidth)) / (data.length + 1);
              const x = gap + (i * (barWidth + gap));
              const barHeight = (d.count / maxCount) * chartHeight;
              const y = chartHeight - barHeight;
              
              return (
                <g key={i} className="group/bar">
                  {/* Hover Background */}
                  <rect x={x - 5} y="0" width={barWidth + 10} height={chartHeight} fill="white" fillOpacity="0" className="group-hover/bar:fill-opacity-[0.03] transition-all duration-300" rx="10" />
                  
                  {/* The Bar */}
                  <rect
                    x={x} y={y}
                    width={barWidth}
                    height={Math.max(barHeight, 10)} // Min height for visibility
                    fill={`url(#${gradientId})`}
                    rx="12"
                    className="transition-all duration-500 ease-out group-hover/bar:brightness-110"
                  />

                  {/* Top Label (The big number) - Visible on Hover or if count > 0 */}
                  <foreignObject x={x - 20} y={y - 50} width={barWidth + 40} height="50" className="overflow-visible pointer-events-none">
                     <div className={`flex flex-col items-center transition-all duration-300 ${d.count > 0 ? 'opacity-100 transform translate-y-0' : 'opacity-0 translate-y-4 group-hover/bar:opacity-100 group-hover/bar:translate-y-0'}`}>
                        <span className="text-2xl font-black text-white drop-shadow-md">{d.count}</span>
                     </div>
                  </foreignObject>

                  {/* Axis Label */}
                  <text 
                    x={x + barWidth / 2} 
                    y={chartHeight + 30} 
                    textAnchor="middle" 
                    className="text-sm font-bold fill-gray-400 uppercase"
                  >
                    {d.hour}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
};

const AdminOverview: React.FC<AdminOverviewProps> = ({ employees, logs, onQuickAction, settings }) => {
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalSearch, setModalSearch] = useState('');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('TODAY');

  const getFilteredLogs = () => {
    const now = new Date();
    let startTime = 0;
    let endTime = now.getTime();

    // Reset to start of day for calculations
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    switch (timeFilter) {
      case 'TODAY':
        startTime = todayStart;
        break;
      case 'YESTERDAY':
        startTime = todayStart - 86400000;
        endTime = todayStart;
        break;
      case 'WEEK':
        const day = now.getDay(); 
        const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is sunday
        startTime = new Date(now.setDate(diff)).setHours(0,0,0,0);
        break;
      case 'MONTH':
        startTime = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        break;
    }

    return logs.filter(l => {
      const ts = normalizeTs(l.timestamp);
      return ts >= startTime && ts <= endTime;
    });
  };

  const filteredLogs = useMemo(() => getFilteredLogs(), [logs, timeFilter]);

  const stats = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    const todayLogs = logs.filter(l => normalizeTs(l.timestamp) >= todayStart.getTime());

    const employeeLastAction: { [key: string]: { timestamp: number, action: AttendanceAction } } = {};
    todayLogs.forEach(log => {
      if (log.status !== LogStatus.SUCCESS || log.type !== 'EMPLOYEE') return;
      const ts = normalizeTs(log.timestamp);
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
    
    // For aggregate views (Week/Month), we group by hour of day regardless of date
    return hours.map(h => {
      const count = filteredLogs.filter(l => {
        const d = new Date(normalizeTs(l.timestamp));
        return d.getHours() === h && l.action === AttendanceAction.LOGIN && l.status === LogStatus.SUCCESS;
      }).length;
      return { hour: `${h}:00`, count };
    });
  }, [filteredLogs, settings.dayStart, settings.dayEnd]);

  const nightChartData = useMemo(() => {
    const nightHours = [18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6];

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
      list = employees.filter(e => stats.presentIds.has(String(e.id).trim()));
    }
    if (modalSearch) {
      list = list.filter(e => e.name.toLowerCase().includes(modalSearch.toLowerCase()));
    }
    return list;
  }, [modalMode, employees, stats, modalSearch]);

  const QuickActionButton = ({ icon: Icon, label, action, style }: any) => (
    <button 
      onClick={() => onQuickAction(action)} 
      className={`relative p-6 rounded-[2rem] border transition-all duration-300 flex flex-col justify-between h-32 md:h-40 group active:scale-95 shadow-lg ${style}`}
    >
      <div className="absolute top-4 right-4 opacity-50 group-hover:opacity-100 transition-opacity">
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <ChevronDown size={14} className="-rotate-90" />
        </div>
      </div>
      <div className="mt-auto">
        <Icon size={32} className="mb-3" />
        <span className="text-[10px] font-black uppercase tracking-widest leading-tight block">{label}</span>
      </div>
    </button>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-700 pb-12 bg-slate-900 text-white rounded-[3rem]">
      
      {modalMode && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 md:p-8 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
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
      
      {/* Header & Filter */}
      <div className="flex flex-col lg:flex-row gap-6 justify-between items-end bg-gradient-to-r from-emerald-900/20 to-slate-900/20 p-6 rounded-[2.5rem] border border-white/5">
        <div>
          <h2 className="text-3xl font-black uppercase tracking-tighter text-white mb-2">System Overview</h2>
          <div className='inline-flex items-center gap-2 px-4 py-2 bg-white/10 rounded-xl text-[10px] font-black uppercase text-gray-300 border border-white/10'>
            <Calendar size={12} className="text-emerald-400" /> 
            {timeFilter === 'TODAY' && `Today: ${new Date().toLocaleDateString('en-GB')}`}
            {timeFilter === 'YESTERDAY' && `Yesterday`}
            {timeFilter === 'WEEK' && `Current Week`}
            {timeFilter === 'MONTH' && `Current Month`}
          </div>
        </div>

        <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/10 overflow-x-auto max-w-full">
          {[
            { id: 'TODAY', label: 'Today' },
            { id: 'YESTERDAY', label: 'Yesterday' },
            { id: 'WEEK', label: 'This Week' },
            { id: 'MONTH', label: 'This Month' }
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setTimeFilter(f.id as TimeFilter)}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${timeFilter === f.id ? 'bg-emerald-500 text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-2">
        <QuickActionButton 
          icon={Plus} 
          label="Enroll Staff" 
          action="ADD_STAFF" 
          style="bg-white text-black hover:bg-gray-100 border-white" 
        />
        <QuickActionButton 
          icon={Megaphone} 
          label="Announce" 
          action="NOTICE" 
          style="bg-gray-800 text-white hover:bg-gray-700 border-gray-700 hover:border-gray-600" 
        />
        <QuickActionButton 
          icon={Download} 
          label="Reports" 
          action="REPORT" 
          style="bg-gray-800 text-white hover:bg-gray-700 border-gray-700 hover:border-gray-600" 
        />
        <QuickActionButton 
          icon={RefreshCw} 
          label="Sync Data" 
          action="SYNC" 
          style="bg-emerald-900/40 text-emerald-400 hover:bg-emerald-900/60 border-emerald-900 hover:border-emerald-700" 
        />
      </div>

      <div className="space-y-8 px-2">
        <AttendanceChart title="Day Shift" data={dayChartData} color="emerald" />
        <AttendanceChart title="Night Shift" data={nightChartData} color="violet" />
      </div>

    </div>
  );
};

export default AdminOverview;
