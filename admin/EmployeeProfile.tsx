
import React, { useState, useEffect } from 'react';
import { X, Calendar, Briefcase, Clock, Download, Loader } from 'lucide-react';
import { Employee, AttendanceLog, SystemSettings } from '../types';
import { dataService } from '../services/dataService';

interface EmployeeProfileProps {
  employee: Employee | null;
  onClose: () => void;
  logs: AttendanceLog[];
}

interface DailyAttendance {
  date: string;
  workedHours: number;
  overtimeHours: number;
}

const EmployeeProfile: React.FC<EmployeeProfileProps> = ({ employee, onClose, logs }) => {
  const [dailyData, setDailyData] = useState<DailyAttendance[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const processAttendance = async () => {
      if (!employee) return;

      setIsLoading(true);
      const fetchedSettings = await dataService.getSettings();
      setSettings(fetchedSettings);

      const calculatedData = dataService.calculateEmployeeAttendance(logs, fetchedSettings);

      const structuredData: DailyAttendance[] = Object.entries(calculatedData).map(([date, data]) => ({
        date,
        workedHours: data.workedHours,
        overtimeHours: data.overtimeHours
      })).sort((a, b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime());

      setDailyData(structuredData);

      setIsLoading(false);
    };

    processAttendance();
  }, [employee, logs]);

  if (!employee) return null;

  const totalWorkedHours = dailyData.reduce((acc, day) => acc + day.workedHours, 0);
  const dayLengthHours = settings ? (() => {
    const [startH, startM] = settings.dayStart.split(':').map(Number);
    const [endH, endM] = settings.dayEnd.split(':').map(Number);
    let length = (endH - startH) + (endM - startM) / 60;
    return length <= 0 ? length + 24 : length;
  })() : 8;

  const totalDaysWorked = dayLengthHours > 0 ? (totalWorkedHours / dayLengthHours) : 0;

  const generateReportForEmployee = async () => {
    if (!employee || !settings) return;
    // This is a simplified approach. The main report generation is now centralized.
    // For a single employee, we can build a simple CSV.
    const headers = ["Date", "Hours Worked", "Overtime"];
    const rows = dailyData.map(d => [d.date, d.workedHours.toFixed(2), d.overtimeHours.toFixed(2)]);
    const csvContent = [headers.join(","), ...rows.map(row => row.join(","))].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8,' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${employee.name}_attendance_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
      <div className="bg-white rounded-[2rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in border border-white/20">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg">
              <Briefcase size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight text-black">{employee.name}</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">{employee.department}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {isLoading ? (
             <div className="flex justify-center items-center h-64">
                <Loader className="animate-spin" size={32} />
             </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-xs font-bold text-gray-500 uppercase">Total Days Worked</h4>
                  <p className="text-2xl font-bold">{totalDaysWorked.toFixed(2)}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h4 className="text-xs font-bold text-gray-500 uppercase">Total Hours Worked</h4>
                  <p className="text-2xl font-bold">{totalWorkedHours.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex justify-between items-center mb-4">
                <h4 className="text-sm font-bold uppercase text-gray-600 tracking-wider flex items-center gap-2">
                  <Calendar size={16} /> Attendance Logs
                </h4>
                <button
                  onClick={generateReportForEmployee}
                  className="px-4 py-2 bg-black text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:scale-105 active:scale-95 transition-all tracking-wider flex items-center gap-2"
                >
                  <Download size={12} />
                  Generate Report
                </button>
              </div>

              <div className="bg-white border border-slate-100 rounded-[1.5rem] shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black text-black uppercase tracking-widest">Date</th>
                      <th className="px-6 py-4 text-[10px] font-black text-black uppercase tracking-widest text-center">Hours Worked</th>
                      <th className="px-6 py-4 text-[10px] font-black text-black uppercase tracking-widest text-center">Overtime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {dailyData.map(day => (
                      <tr key={day.date} className="hover:bg-slate-50/50 transition-all group">
                        <td className="px-6 py-4">
                          <div className="text-sm font-semibold text-slate-900">{day.date}</div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-black uppercase tracking-widest">
                            <Clock size={12}/> {day.workedHours.toFixed(2)} hrs
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${day.overtimeHours > 0 ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {day.overtimeHours.toFixed(2)} hrs
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {dailyData.length === 0 && (
                  <div className="text-center py-10 text-gray-400 font-semibold text-sm">
                    No attendance logs found for this employee.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default EmployeeProfile;
