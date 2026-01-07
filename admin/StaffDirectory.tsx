
import React, { useState, useMemo, useEffect } from 'react';
import { Search, Trash2, Edit3, X, AlertCircle, Loader2, QrCode, Download, Fingerprint, Key, Filter, SortAsc, SortDesc, Cpu, Calendar, User } from 'lucide-react';
import { Employee, Department, AttendanceLog, SystemSettings } from '../types';
import { db } from '../backend/firebase';
import { collection, addDoc } from 'firebase/firestore';
import QRCode from 'qrcode';
import EmployeeProfile from './EmployeeProfile';
import { dataService } from '../services/dataService';

interface StaffDirectoryProps {
  employees: Employee[];
  departments: Department[];
  logs: AttendanceLog[];
  onAddEmployee: (emp: { name: string; email: string; department: string; pin: string; fingerprintHash: string; phoneNumber?: string; nextOfKin?: string; address?: string; }) => void;
  onUpdateEmployee: (id: string, emp: Partial<Employee>) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  highlightedId: string | null;
  handleSuggestionClick: (name: string) => void;
  activeEmployeeIds: Set<string>;
}

const StaffDirectory: React.FC<StaffDirectoryProps> = ({ 
  employees, 
  departments,
  logs,
  onAddEmployee, 
  onUpdateEmployee,
  onDeleteEmployee,
  searchQuery, 
  setSearchQuery, 
  highlightedId,
  handleSuggestionClick,
  activeEmployeeIds
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: '', email: '', department: '', pin: '', fingerprintHash: '', phoneNumber: '', nextOfKin: '', address: '' });
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
  
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [biometricStatus, setBiometricStatus] = useState<{msg: string, loading: boolean} | null>(null);

  // --- NEW: State for calculated data and loading ---
  const [calculatedData, setCalculatedData] = useState<{[empId: string]: { totalDaysWorked: number }}>({});
  const [isCalculating, setIsCalculating] = useState(true);

  useEffect(() => {
    const calculateAllAttendance = async () => {
      setIsCalculating(true);

      const settings = await dataService.getSettings();
      if (!settings) {
        setIsCalculating(false);
        return;
      }

      const [startH, startM] = settings.dayStart.split(':').map(Number);
      const [endH, endM] = settings.dayEnd.split(':').map(Number);
      let dayLengthHours = (endH - startH) + (endM - startM) / 60;
      if (dayLengthHours <= 0) dayLengthHours += 24;

      const allCalculatedData: {[empId: string]: { totalDaysWorked: number }} = {};

      for (const emp of employees) {
        const empLogs = logs.filter(log => log.subjectId === emp.id);
        const dailyAttendance = dataService.calculateEmployeeAttendance(empLogs, settings);

        const totalWorkedHours = Object.values(dailyAttendance).reduce((acc, day) => acc + day.workedHours, 0);
        const totalDaysWorked = dayLengthHours > 0 ? (totalWorkedHours / dayLengthHours) : 0;

        allCalculatedData[emp.id] = { totalDaysWorked };
      }

      setCalculatedData(allCalculatedData);
      setIsCalculating(false);
    };

    if (employees.length > 0) { // Logs might be empty, still need to show 0
        calculateAllAttendance();
    } else {
        setIsCalculating(false);
    }
  }, [employees, logs]);

  const availableDepartments = useMemo(() => {
    return departments.map(d => d.name).sort();
  }, [departments]);

  const filteredAndSortedEmployees = useMemo(() => {
    let result = employees.filter(emp => {
      const matchSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = selectedDeptFilter === 'ALL' || emp.department === selectedDeptFilter;
      return matchSearch && matchDept;
    });

    result.sort((a, b) => a.name.localeCompare(b.name) * (sortOrder === 'A-Z' ? 1 : -1));
    return result;
  }, [employees, searchQuery, selectedDeptFilter, sortOrder]);

  const handleDeviceEnroll = async (pin: string) => {
    // ... (existing code)
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddEmployee({...newEmp, email: `${newEmp.name.replace(/\s/g, '.').toLowerCase()}@knockout.co`});
    setNewEmp({ name: '', email: '', department: '', pin: '', fingerprintHash: '', phoneNumber: '', nextOfKin: '', address: '' });
    setShowAddForm(false);
  };

  const downloadQrCode = async (employee: Employee) => {
    // ... (existing code)
  };

  const handleOpenProfile = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsProfileOpen(true);
  };

  const handleCloseProfile = () => {
    setIsProfileOpen(false);
    setSelectedEmployee(null);
  };

  const generateMonthlyReport = async () => {
    const csvContent = await dataService.generateReport();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8,' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'monthly_attendance_report.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <EmployeeProfile
        employee={selectedEmployee}
        onClose={handleCloseProfile}
        logs={selectedEmployee ? logs.filter(log => log.subjectId === selectedEmployee.id) : []}
      />
      
       {/* ... (Header cards, edit form, etc. - existing code) ... */}
       <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-bold text-gray-500 uppercase">Total Employees</h4>
          <p className="text-2xl font-bold">{employees.length}</p>
        </div>
        <div className="p-4 bg-green-50 rounded-lg">
          <h4 className="text-xs font-bold text-green-500 uppercase">Active Today</h4>
          <p className="text-2xl font-bold">{activeEmployeeIds.size}</p>
        </div>
        <div className="p-4 bg-red-50 rounded-lg">
          <h4 className="text-xs font-bold text-red-500 uppercase">Inactive Today</h4>
          <p className="text-2xl font-bold">{employees.length - activeEmployeeIds.size}</p>
        </div>
      </div>


      {/* Main UI Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-2 rounded-2xl shadow-sm border border-slate-50">
        <div className="flex flex-wrap gap-4 items-center w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
            <input placeholder="Search Personnel..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all" />
          </div>
          
          <select 
            value={selectedDeptFilter} 
            onChange={(e) => setSelectedDeptFilter(e.target.value)}
            className="px-6 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-tight appearance-none focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="ALL">ALL UNITS</option>
            {availableDepartments.map(dept => <option key={dept} value={dept}>{dept.toUpperCase()}</option>)}
          </select>

          <button onClick={() => setSortOrder(prev => prev === 'A-Z' ? 'Z-A' : 'A-Z')} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase flex items-center gap-2">
            {sortOrder === 'A-Z' ? <SortAsc size={16} /> : <SortDesc size={16} />} {sortOrder}
          </button>
        </div>
        
        <div className="flex gap-2">
          <button onClick={generateMonthlyReport} className="px-8 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:scale-105 active:scale-95 transition-all tracking-wider">
            Generate Monthly Report
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)} className="px-8 py-3 bg-black text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:scale-105 active:scale-95 transition-all tracking-wider">
            {showAddForm ? 'Close' : 'Enroll'}
          </button>
        </div>
      </div>

      {/* ... (Add form - existing code) ... */}

      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden min-h-[300px]">
        {isCalculating ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="animate-spin text-slate-300" size={32} />
            <p className="ml-4 text-sm text-slate-400 font-semibold">Calculating attendance data...</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Identity</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Auth Data</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center">Days Worked</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center">QR Pass</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredAndSortedEmployees.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50/50 transition-all group">
                  <td className="px-8 py-5">
                    <div className="text-sm font-bold text-slate-900">{emp.name}</div>
                    <div className="text-xs text-slate-500">{emp.department}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
                        <Fingerprint size={14}/> {emp.fingerprintHash ? 'ACTIVE' : 'PENDING'}
                      </span>
                      <span className="flex items-center gap-2 text-xs font-semibold text-black">
                        <Key size={14}/> PIN: {emp.pin}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-bold">
                        <Calendar size={12}/>
                        {(calculatedData[emp.id]?.totalDaysWorked || 0).toFixed(2)} Days
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <button onClick={() => downloadQrCode(emp)} className="p-3 bg-slate-100 hover:bg-black hover:text-white rounded-2xl transition-all shadow-sm">
                      <QrCode size={18} />
                    </button>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleOpenProfile(emp)} title="View Profile" className="p-2.5 text-slate-400 hover:text-blue-500 rounded-xl"><User size={18} /></button>
                      <button onClick={() => setEditingEmployee(emp)} className="p-2.5 text-slate-400 hover:text-black rounded-xl"><Edit3 size={18} /></button>
                      <button onClick={() => setShowDeleteConfirm(emp.id)} className="p-2.5 text-slate-400 hover:text-red-500 rounded-xl"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default StaffDirectory;
