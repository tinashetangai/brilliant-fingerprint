
import React, { useState } from 'react';
import { X, Calendar, Clock, Briefcase, Hash, Download, Loader2 } from 'lucide-react';
import { Employee, DailyWorkRecord, OvertimeStatus } from '../types';
import { pdfReportGenerator } from '../services/pdfReport.generator';

interface EmployeeProfileProps {
  employee: Employee;
  records: DailyWorkRecord[];
  onClose: () => void;
}

const EmployeeProfile: React.FC<EmployeeProfileProps> = ({ employee, records, onClose }) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const now = new Date();
  const [reportMonth, setReportMonth] = useState(now.getMonth());
  const [reportYear, setReportYear] = useState(now.getFullYear());

  const totalHours = records.reduce((acc, r) => acc + r.totalContributedHours, 0);
  const totalDays = records.reduce((acc, r) => acc + r.dayValue, 0);
  const totalOT = records.reduce((acc, r) => acc + (r.overtimeStatus === OvertimeStatus.APPROVED ? r.overtimeHours : 0), 0);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      await pdfReportGenerator.generateUserMonthlyStatement(employee, records, reportMonth, reportYear);
    } finally {
      setIsDownloading(false);
    }
  };

  const formatDuration = (decimalHours: number) => {
    if (decimalHours <= 0) return '0h 0m 0s';
    const hours = Math.floor(decimalHours);
    const minutes = Math.floor((decimalHours - hours) * 60);
    const seconds = Math.round(((decimalHours - hours) * 60 - minutes) * 60);
    return `${hours}h ${minutes}m ${seconds}s`;
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-none flex flex-col shadow-none overflow-hidden animate-in zoom-in duration-300 border border-white/20">
        
        {/* Header */}
        <div className="p-8 border-b border-gray-100 bg-slate-50 flex flex-col md:flex-row justify-between items-start gap-4">
          <div className="flex gap-6">
            <div className="w-20 h-20 bg-black text-white rounded-none flex items-center justify-center text-2xl font-black">
              {employee.name.charAt(0)}
            </div>
            <div>
              <h2 className="text-3xl font-black uppercase text-slate-900 tracking-tight leading-none mb-2">{employee.name}</h2>
              <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                <span className="flex items-center gap-1"><Briefcase size={12}/> {employee.department}</span>
                <span className="flex items-center gap-1"><Hash size={12}/> ID: {employee.pin}</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 w-full md:w-auto">
             <div className="flex bg-white border border-slate-200 p-1 rounded-none">
                <select 
                  className="bg-transparent text-[10px] font-black uppercase px-2 outline-none"
                  value={reportMonth}
                  onChange={(e) => setReportMonth(parseInt(e.target.value))}
                >
                  {Array.from({length: 12}, (_, i) => (
                    <option key={i} value={i}>{new Date(2000, i).toLocaleString('default', {month: 'short'})}</option>
                  ))}
                </select>
                <input 
                  type="number" 
                  className="w-16 bg-transparent text-[10px] font-black px-2 outline-none border-l border-slate-100"
                  value={reportYear}
                  onChange={(e) => setReportYear(parseInt(e.target.value))}
                />
             </div>
             <button 
               onClick={handleDownload}
               disabled={isDownloading}
               className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-black uppercase text-[10px] shadow-lg hover:bg-emerald-700 transition-all disabled:opacity-50"
             >
               {isDownloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
               Statement
             </button>
             <button onClick={onClose} className="p-3 bg-white border border-slate-200 hover:bg-gray-100 rounded-none transition-all">
               <X size={20} />
             </button>
          </div>
        </div>

        {/* Stats Strip */}
        <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100 bg-white">
          <div className="p-6 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Days</p>
            <p className="text-2xl font-black text-slate-900">{totalDays.toFixed(2)}</p>
          </div>
          <div className="p-6 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Hours</p>
            <p className="text-2xl font-black text-emerald-600">{formatDuration(totalHours)}</p>
          </div>
          <div className="p-6 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Approved OT</p>
            <p className="text-2xl font-black text-orange-600">{formatDuration(totalOT)}</p>
          </div>
        </div>

        {/* History Table */}
        <div className="flex-grow overflow-y-auto p-8 bg-slate-50/50">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Date</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Shift</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">Reg. Hrs</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">OT Hrs</th>
                <th className="pb-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {records.map((rec, i) => (
                <tr key={i} className="bg-white border-b border-gray-100 hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-[11px] font-bold text-slate-700">
                    {rec.date}
                    {rec.isNightShift && <span className="ml-2 text-[8px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-none font-black uppercase">Night</span>}
                  </td>
                  <td className="p-4 text-center text-[10px] font-mono text-slate-500">
                    {rec.startTime} - {rec.endTime}
                  </td>
                  <td className="p-4 text-center font-black text-slate-900 text-xs">
                    {formatDuration(rec.regularHours)}
                  </td>
                  <td className="p-4 text-center">
                    {rec.overtimeHours > 0 ? (
                      <span className={`px-2 py-1 text-[10px] font-black uppercase ${
                        rec.overtimeStatus === OvertimeStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' : 
                        rec.overtimeStatus === OvertimeStatus.DENIED ? 'bg-rose-100 text-rose-700 line-through' : 
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {formatDuration(rec.overtimeHours)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-4 text-right">
                    <span className="text-[10px] font-black uppercase text-emerald-600">
                      {(rec.dayValue).toFixed(2)} Day
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && (
            <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest italic">No activity history found</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfile;
