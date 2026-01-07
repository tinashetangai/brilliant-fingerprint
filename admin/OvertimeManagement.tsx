
import React, { useState, useEffect } from 'react';
import { Check, X, Loader2 } from 'lucide-react';
import { dataService } from '../services/dataService';
import { OvertimeRequest } from '../types';

const OvertimeManagement: React.FC = () => {
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchOvertimeRequests();
  }, []);

  const fetchOvertimeRequests = async () => {
    setIsLoading(true);
    try {
      const requests = await dataService.getOvertimeRequests();
      setOvertimeRequests(requests);
    } catch (error) {
      console.error("Error fetching overtime requests:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await dataService.updateOvertimeRequestStatus(id, 'APPROVED');
      fetchOvertimeRequests();
    } catch (error) {
      console.error("Error approving overtime request:", error);
    }
  };

  const handleDeny = async (id: string) => {
    try {
      await dataService.updateOvertimeRequestStatus(id, 'DENIED');
      fetchOvertimeRequests();
    } catch (error) {
      console.error("Error denying overtime request:", error);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Overtime Management</h2>
      <div className="bg-white border border-slate-100 rounded-lg shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Employee</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Hours</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-center">Status</th>
              <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {overtimeRequests.map(request => (
              <tr key={request.id}>
                <td className="px-6 py-4 whitespace-nowrap">{request.employeeName}</td>
                <td className="px-6 py-4 whitespace-nowrap">{request.date}</td>
                <td className="px-6 py-4 whitespace-nowrap">{request.hours.toFixed(2)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-center">{request.status}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {request.status === 'PENDING' && (
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleApprove(request.id)} className="p-2 text-green-500 hover:bg-green-100 rounded-lg"><Check size={18} /></button>
                      <button onClick={() => handleDeny(request.id)} className="p-2 text-red-500 hover:bg-red-100 rounded-lg"><X size={18} /></button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default OvertimeManagement;
