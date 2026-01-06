
import React from 'react';
import { Check, X, Clock } from 'lucide-react';
import { OvertimeRequest } from '../types';

interface OvertimeRequestsProps {
  requests: OvertimeRequest[];
  onApprove: (id: string) => void;
  onDeny: (id: string) => void;
}

const OvertimeRequests: React.FC<OvertimeRequestsProps> = ({ requests, onApprove, onDeny }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Employee</th>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Date</th>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center">Hours</th>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center">Status</th>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {requests.map(req => (
              <tr key={req.id} className="hover:bg-slate-50/50 transition-all group">
                <td className="px-8 py-5">
                  <div className="text-sm font-semibold text-slate-900">{req.employeeName}</div>
                </td>
                <td className="px-8 py-5">
                  <div className="text-sm font-semibold text-slate-900">{req.date}</div>
                </td>
                <td className="px-8 py-5 text-center">
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-yellow-50 text-yellow-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                    <Clock size={12}/> {req.hours.toFixed(2)} hrs
                  </div>
                </td>
                <td className="px-8 py-5 text-center">
                  <span className={`px-3 py-1 text-[10px] font-black uppercase rounded-full ${
                    req.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
                    req.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {req.status}
                  </span>
                </td>
                <td className="px-8 py-5 text-right">
                  {req.status === 'PENDING' && (
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onApprove(req.id)} className="p-2.5 text-slate-400 hover:text-green-500 hover:bg-green-50 rounded-xl transition-all"><Check size={18} /></button>
                      <button onClick={() => onDeny(req.id)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><X size={18} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {requests.length === 0 && (
          <div className="text-center py-20 text-gray-400 font-semibold text-sm">
            No overtime requests found.
          </div>
        )}
      </div>
    </div>
  );
};

export default OvertimeRequests;
