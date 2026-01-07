
import React, { useState, useMemo } from 'react';
import { Search, Trash2, Edit3, X, QrCode, Download, Fingerprint, Key, SortAsc, SortDesc, Calendar, User, Plus } from 'lucide-react';
import { Employee, Department, AttendanceLog } from '../types';
import QRCode from 'qrcode';
import EmployeeProfile from './EmployeeProfile';
import { CalculatedAttendance } from '../pages/AdminDashboard';

interface StaffDirectoryProps {
  employees: Employee[];
  departments: Department[];
  logs: AttendanceLog[];
  calculatedAttendance: CalculatedAttendance;
  onAddEmployee: (emp: any) => void;
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
  calculatedAttendance,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  searchQuery,
  setSearchQuery,
  activeEmployeeIds,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: '', email: '', department: '', pin: '', fingerprintHash: '', phoneNumber: '', nextOfKin: '', address: '' });
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const availableDepartments = useMemo(() => departments.map(d => d.name).sort(), [departments]);

  const filteredAndSortedEmployees = useMemo(() => {
    let result = employees.filter(emp =>
      (emp.name.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (selectedDeptFilter === 'ALL' || emp.department === selectedDeptFilter)
    );
    result.sort((a, b) => a.name.localeCompare(b.name) * (sortOrder === 'A-Z' ? 1 : -1));
    return result;
  }, [employees, searchQuery, selectedDeptFilter, sortOrder]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddEmployee(newEmp);
    setNewEmp({ name: '', email: '', department: '', pin: '', fingerprintHash: '', phoneNumber: '', nextOfKin: '', address: '' });
    setShowAddForm(false);
  };

  const handleOpenProfile = (employee: Employee) => {
    setSelectedEmployee(employee);
    setIsProfileOpen(true);
  };

  const handleCloseProfile = () => {
    setIsProfileOpen(false);
    setSelectedEmployee(null);
  };

  const downloadQrCode = async (employee: Employee) => { /* ... implementation ... */ };

  return (
    <div className="space-y-6">
      <EmployeeProfile
        employee={selectedEmployee}
        onClose={handleCloseProfile}
        logs={selectedEmployee ? logs.filter(log => log.subjectId === selectedEmployee.id) : []}
      />

      {editingEmployee && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
           <div className="bg-white rounded-[2rem] w-full max-w-lg p-8 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-black uppercase tracking-tight">Edit Personnel</h3>
                <button onClick={() => setEditingEmployee(null)} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); onUpdateEmployee(editingEmployee.id, editingEmployee); setEditingEmployee(null); }} className="space-y-4">
                 {/* ... form fields for editing ... */}
                 <button type="submit" className="w-full py-4 bg-black text-white rounded-xl font-bold uppercase text-sm mt-4">Commit Changes</button>
              </form>
           </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-red-900/20 backdrop-blur-md">
            <div className="bg-white p-10 rounded-[2rem] shadow-2xl max-w-sm text-center">
                <h3 className="text-lg font-black uppercase mb-4">Confirm Deletion</h3>
                <p className="text-sm text-gray-600 mb-6">Are you sure you want to permanently delete this employee? This action cannot be undone.</p>
                <div className="flex gap-4">
                    <button onClick={() => setShowDeleteConfirm(null)} className="flex-1 py-3 bg-gray-200 text-gray-800 rounded-xl font-bold">Cancel</button>
                    <button onClick={() => { onDeleteEmployee(showDeleteConfirm); setShowDeleteConfirm(null); }} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold">Delete</button>
                </div>
            </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ... header cards ... */}
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* ... search and filter UI ... */}
        <button onClick={() => setShowAddForm(!showAddForm)} className="px-6 py-3 bg-black text-white rounded-xl text-xs font-bold uppercase flex items-center gap-2">
          <Plus size={16} /> New Enrollment
        </button>
      </div>

      {showAddForm && (
        <div className="p-8 bg-slate-50 rounded-[2rem] border">
            <h3 className="text-lg font-black uppercase mb-6">New Employee Enrollment</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* ... form fields for adding new employee ... */}
                <div className="md:col-span-2">
                    <button type="submit" className="w-full py-4 bg-black text-white rounded-xl font-bold uppercase">Register User</button>
                </div>
            </form>
        </div>
      )}

      <div className="bg-white border rounded-[2rem] overflow-hidden">
        <table className="w-full text-left">
          {/* ... table headers ... */}
          <tbody className="divide-y divide-gray-100">
            {filteredAndSortedEmployees.map(emp => (
              <tr key={emp.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">{emp.name}</td>
                <td className="px-6 py-4">PIN: {emp.pin}</td>
                <td className="px-6 py-4 text-center">{(calculatedAttendance[emp.id]?.totalDaysWorked || 0).toFixed(2)} Days</td>
                <td className="px-6 py-4 text-center">
                  <button onClick={() => downloadQrCode(emp)} className="p-2 bg-gray-100 rounded-lg"><QrCode size={16} /></button>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => handleOpenProfile(emp)} className="p-2 hover:bg-gray-100 rounded-lg"><User size={16} /></button>
                  <button onClick={() => setEditingEmployee(emp)} className="p-2 hover:bg-gray-100 rounded-lg"><Edit3 size={16} /></button>
                  <button onClick={() => setShowDeleteConfirm(emp.id)} className="p-2 hover:bg-red-100 text-red-600 rounded-lg"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StaffDirectory;
