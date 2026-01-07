
import React from 'react';
import { X, Calendar, Clock, Briefcase, User, Hash } from 'lucide-react';
import { Employee, DailyWorkRecord, OvertimeStatus } from '../types';

interface EmployeeProfileProps {
  employee: Employee;
  records: DailyWorkRecord[];
  onClose: () => void;
}

const EmployeeProfile: React.FC<EmployeeProfileProps> = ({ employee, records, onClose }) => {
  const totalHours = records.reduce((acc, r) => acc + r.totalContributedHours, 0);
  const totalDays = records.reduce((acc, r) => acc + r.dayValue, 0);
  const totalOT = records.reduce((acc, r) => acc + (r.overtimeStatus === OvertimeStatus.APPROVED ? r.overtimeHours : 0), 0);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl h-[90vh] rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in duration-300">
        
        {/* Header */}
        <div className="p-8 border-b border-gray-100 bg-slate-50 flex justify-between items-start">
          <div className="flex gap-6">
            <div className="w-20 h-20 bg-black text-white rounded-3xl flex items-center justify-center text-2xl font-black shadow-xl">
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
          <button onClick={onClose} className="p-3 bg-white hover:bg-gray-100 rounded-2xl transition-all shadow-sm">
            <X size={20} />
          </button>
        </div>

        {/* Stats Strip */}
        <div className="flex divide-x divide-gray-100 border-b border-gray-100 bg-white">
          <div className="flex-1 p-6 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Days</p>
            <p className="text-2xl font-black text-slate-900">{totalDays.toFixed(2)}</p>
          </div>
          <div className="flex-1 p-6 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Hours</p>
            <p className="text-2xl font-black text-emerald-600">{totalHours.toFixed(2)}</p>
          </div>
          <div className="flex-1 p-6 text-center">
            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Approved OT</p>
            <p className="text-2xl font-black text-orange-600">{totalOT.toFixed(2)}</p>
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
            <tbody className="space-y-2">
              {records.map((rec, i) => (
                <tr key={i} className="bg-white border border-gray-100 rounded-xl hover:shadow-sm transition-all group">
                  <td className="p-4 rounded-l-xl text-sm font-bold text-slate-700">
                    {rec.date}
                    {rec.isNightShift && <span className="ml-2 text-[8px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-black uppercase">Night</span>}
                  </td>
                  <td className="p-4 text-center text-xs font-mono text-slate-500">
                    {rec.startTime} - {rec.endTime}
                  </td>
                  <td className="p-4 text-center font-bold text-slate-900">
                    {rec.regularHours.toFixed(2)}
                  </td>
                  <td className="p-4 text-center">
                    {rec.overtimeHours > 0 ? (
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        rec.overtimeStatus === OvertimeStatus.APPROVED ? 'bg-green-100 text-green-700' : 
                        rec.overtimeStatus === OvertimeStatus.DENIED ? 'bg-red-100 text-red-700 line-through' : 
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {rec.overtimeHours.toFixed(2)}
                      </span>
                    ) : '-'}
                  </td>
                  <td className="p-4 rounded-r-xl text-right">
                    <span className="text-xs font-black uppercase text-emerald-600">
                      {(rec.dayValue).toFixed(2)} Day
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {records.length === 0 && (
            <div className="py-20 text-center text-slate-300 font-black uppercase tracking-widest">No activity history found</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfile;
