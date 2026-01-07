
import React, { useMemo, useState } from 'react';
import { Check, X, Clock, AlertCircle } from 'lucide-react';
import { Employee, DailyWorkRecord, OvertimeStatus } from '../types';
import { dataService } from '../services/dataService';

interface OvertimeManagerProps {
  employees: Employee[];
  allRecords: DailyWorkRecord[]; // All calculated records from dashboard
  onRefresh: () => void;
}

const OvertimeManager: React.FC<OvertimeManagerProps> = ({ employees, allRecords, onRefresh }) => {
  const [processingId, setProcessingId] = useState<string | null>(null);

  const pendingOvertime = useMemo(() => {
    return allRecords.filter(r => r.overtimeStatus === OvertimeStatus.PENDING && r.overtimeHours > 0);
  }, [allRecords]);

  const handleDecision = async (record: DailyWorkRecord, status: OvertimeStatus) => {
    setProcessingId(`${record.employeeId}-${record.date}`);
    try {
      await dataService.saveOvertimeDecision({
        employeeId: record.employeeId,
        date: record.date,
        hours: record.overtimeHours,
        status: status,
        timestamp: Date.now()
      });
      onRefresh();
    } catch (e) {
      console.error(e);
      alert("Failed to save decision");
    } finally {
      setProcessingId(null);
    }
  };

  const getEmpName = (id: string) => employees.find(e => e.id === id)?.name || "Unknown";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-orange-50 text-orange-600 rounded-2xl flex items-center justify-center shadow-sm">
          <Clock size={24} />
        </div>
        <div>
          <h3 className="text-xl font-black text-black uppercase tracking-tight">Overtime Approval</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Review extra hours claims</p>
        </div>
      </div>

      {pendingOvertime.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed border-gray-100 rounded-[2.5rem] bg-gray-50/50">
          <div className="flex flex-col items-center gap-3 opacity-30">
            <Clock size={40} />
            <span className="text-sm font-black uppercase tracking-widest">No pending approvals</span>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-[2rem] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-gray-100">
              <tr>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Date</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500">Employee</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Shift End</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-center">Extra Hours</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest text-slate-500 text-right">Decision</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pendingOvertime.map((record, idx) => {
                const isProcessing = processingId === `${record.employeeId}-${record.date}`;
                return (
                  <tr key={idx} className="group hover:bg-orange-50/20 transition-colors">
                    <td className="px-8 py-5 text-sm font-bold text-slate-700">{record.date}</td>
                    <td className="px-8 py-5">
                      <div className="font-black text-black uppercase tracking-tight">{getEmpName(record.employeeId)}</div>
                    </td>
                    <td className="px-8 py-5 text-center text-xs font-bold text-slate-500">{record.endTime}</td>
                    <td className="px-8 py-5 text-center">
                      <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-black">
                        +{record.overtimeHours.toFixed(2)} hrs
                      </span>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <div className="flex justify-end gap-2">
                        <button 
                          onClick={() => handleDecision(record, OvertimeStatus.APPROVED)}
                          disabled={isProcessing}
                          className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all disabled:opacity-30"
                          title="Approve"
                        >
                          <Check size={18} />
                        </button>
                        <button 
                          onClick={() => handleDecision(record, OvertimeStatus.DENIED)}
                          disabled={isProcessing}
                          className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-600 hover:text-white transition-all disabled:opacity-30"
                          title="Deny"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default OvertimeManager;
