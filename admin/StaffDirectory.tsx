
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, Trash2, Edit3, X, QrCode, ShieldAlert, ChevronRight, Phone, MapPin, Heart, Clock, Users, UserMinus, UserCheck, Briefcase, Hash, Loader2 } from 'lucide-react';
import { Employee, Department } from '../types';
import QRCode from 'qrcode';
import EmployeeProfile from './EmployeeProfile';

interface StaffDirectoryProps {
  employees: Employee[];
  departments: Department[];
  onAddEmployee: (emp: { name: string; email: string; department: string; pin: string; fingerprintHash: string; phoneNumber?: string; nextOfKin?: string; address?: string; }) => Promise<void>;
  onUpdateEmployee: (id: string, emp: Partial<Employee>) => Promise<void>;
  onDeleteEmployee: (id: string) => Promise<void>;
  onResetDaysWorked: (id: string) => Promise<void>;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  highlightedId: string | null;
  handleSuggestionClick: (name: string) => void;
  activeEmployeeIds: Set<string>;
  getEmployeeRecords: (id: string) => any[];
  adminPassword?: string;
}

const CountdownDisplay = ({ target }: { target: number }) => {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = target - Date.now();
      if (diff <= 0) {
        setTimeLeft('Expired');
        return;
      }
      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft(`${d}d ${h}h ${m}m ${s}s`);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [target]);

  return <span className="font-mono tabular-nums">{timeLeft}</span>;
};

const StaffDirectory: React.FC<StaffDirectoryProps> = ({ 
  employees, 
  departments,
  onAddEmployee, 
  onUpdateEmployee,
  onDeleteEmployee,
  onResetDaysWorked,
  searchQuery, 
  setSearchQuery, 
  activeEmployeeIds,
  getEmployeeRecords,
  adminPassword
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmp, setNewEmp] = useState({ name: '', email: '', department: '', pin: '', fingerprintHash: '', phoneNumber: '', nextOfKin: '', address: '' });
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>('ALL');
  const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [viewingProfile, setViewingProfile] = useState<Employee | null>(null);
  
  // Status Modal State
  const [statusModal, setStatusModal] = useState<'ACTIVE' | 'ABSENT' | 'OUTSIDE' | null>(null);
  const [modalDeptFilter, setModalDeptFilter] = useState('ALL');
  
  // Delete Confirmation State
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deletePasswordInput, setDeletePasswordInput] = useState('');

  const availableDepartments = useMemo(() => {
    return Array.from(new Set(departments.map(d => d.name))).sort();
  }, [departments]);

  // Derived Lists
  const activeList = useMemo(() => employees.filter(e => activeEmployeeIds.has(e.id)), [employees, activeEmployeeIds]);
  const outsideList = useMemo(() => employees.filter(e => e.outsideWorkUntil && e.outsideWorkUntil > Date.now()), [employees]);
  const absentList = useMemo(() => employees.filter(e => !activeEmployeeIds.has(e.id) && (!e.outsideWorkUntil || e.outsideWorkUntil <= Date.now())), [employees, activeEmployeeIds]);

  const filteredAndSortedEmployees = useMemo(() => {
    let result = employees.filter(emp => {
      const lowerQuery = searchQuery.toLowerCase();
      // Search by Name, Email, or PIN
      const matchSearch = emp.name.toLowerCase().includes(lowerQuery) || 
                          emp.email.toLowerCase().includes(lowerQuery) ||
                          emp.pin.includes(lowerQuery);
      
      const matchDept = selectedDeptFilter === 'ALL' || emp.department === selectedDeptFilter;
      return matchSearch && matchDept;
    });

    result.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (sortOrder === 'A-Z') return nameA.localeCompare(nameB);
      return nameB.localeCompare(nameA);
    });

    return result;
  }, [employees, searchQuery, selectedDeptFilter, sortOrder]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmp.name || !newEmp.department || !newEmp.pin) return;
    
    setIsSubmitting(true);
    try {
      await onAddEmployee(newEmp);
      setNewEmp({ name: '', email: '', department: '', pin: '', fingerprintHash: '', phoneNumber: '', nextOfKin: '', address: '' });
      setShowAddForm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!showDeleteConfirm) return;
    if (deletePasswordInput !== 'admin111') {
      alert("Incorrect Admin Password");
      return;
    }
    await onDeleteEmployee(showDeleteConfirm);
    setShowDeleteConfirm(null);
    setDeletePasswordInput('');
  };

  const downloadQrCode = async (employee: Employee) => {
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 650;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#f3f4f6';
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, 480, 630);

    const qrDataUrl = await QRCode.toDataURL(employee.qrCodeData, {
      width: 400,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' }
    });

    const qrImg = new Image();
    qrImg.src = qrDataUrl;
    await new Promise(r => qrImg.onload = r);
    ctx.drawImage(qrImg, 50, 50);

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.font = '700 28px Inter';
    ctx.fillText(employee.name.toUpperCase(), 250, 510);
    ctx.font = '600 16px Inter';
    ctx.fillStyle = '#6b7280';
    ctx.fillText(employee.department.toUpperCase(), 250, 540);
    ctx.fillStyle = '#059669';
    ctx.font = '700 14px Inter';
    ctx.fillText(`ID: ${employee.pin}`, 250, 575);
    ctx.fillStyle = '#000000';
    ctx.font = '600 10px Inter';
    ctx.fillText("KNOCKOUT SECURE BIOMETRIC ACCESS", 250, 610);

    const link = document.createElement('a');
    link.download = `BIO_PASS_${employee.name.replace(/\s/g, '_')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const getModalList = () => {
    let list: Employee[] = [];
    switch(statusModal) {
        case 'ACTIVE': list = activeList; break;
        case 'ABSENT': list = absentList; break;
        case 'OUTSIDE': list = outsideList; break;
        default: list = [];
    }
    if (modalDeptFilter !== 'ALL') {
        list = list.filter(e => e.department === modalDeptFilter);
    }
    return list;
  };

  return (
    <>
      {/* MODALS RENDERED VIA PORTAL TO BODY TO FIX STACKING CONTEXT ISSUES */}
      
      {viewingProfile && createPortal(
        <EmployeeProfile 
          employee={viewingProfile}
          records={getEmployeeRecords(viewingProfile.id)}
          onClose={() => setViewingProfile(null)}
        />,
        document.body
      )}

      {/* Status Detail Modal */}
      {statusModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in duration-300 border border-white/20">
             <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/80 backdrop-blur sticky top-0 z-10">
                <div>
                   <h3 className="text-xl font-black uppercase text-black tracking-tight">{statusModal === 'ACTIVE' ? 'Active Personnel' : statusModal === 'ABSENT' ? 'Absent Today' : 'Outside Workers'}</h3>
                   <p className="text-[10px] font-bold uppercase text-gray-400 tracking-widest">
                     {getModalList().length} Staff Found
                   </p>
                </div>
                <div className="flex gap-2">
                   <select 
                     className="px-4 py-2 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-black"
                     value={modalDeptFilter}
                     onChange={e => setModalDeptFilter(e.target.value)}
                   >
                     <option value="ALL">All Depts</option>
                     {availableDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                   </select>
                   <button onClick={() => { setStatusModal(null); setModalDeptFilter('ALL'); }} className="p-2 hover:bg-gray-200 rounded-full transition-colors"><X size={20}/></button>
                </div>
             </div>
             
             <div className="flex-grow overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {getModalList().map(emp => (
                   <div key={emp.id} className="p-4 bg-white rounded-2xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between hover:border-black/10 transition-colors shadow-sm gap-3">
                      <div>
                         <p className="font-black text-sm uppercase text-slate-900">{emp.name}</p>
                         <div className="flex flex-wrap gap-3 mt-1">
                            <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1"><Briefcase size={10}/> {emp.department}</span>
                            {statusModal === 'ACTIVE' && <span className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1"><UserCheck size={10}/> On Site</span>}
                         </div>
                         {statusModal === 'OUTSIDE' && emp.outsideWorkUntil && (
                            <div className="mt-2 flex items-center gap-2 text-[10px] font-black text-orange-600 bg-orange-50 px-3 py-1.5 rounded-lg w-fit border border-orange-100">
                               <Clock size={12} /> <CountdownDisplay target={emp.outsideWorkUntil} />
                            </div>
                         )}
                      </div>
                      
                      <div className="flex items-center gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-50">
                         {statusModal === 'ABSENT' && (
                            <>
                              <div className="text-right hidden sm:block">
                                 <p className="text-[10px] font-bold text-slate-500">{emp.phoneNumber || 'No Contact Info'}</p>
                                 {emp.nextOfKin && <p className="text-[9px] font-bold text-red-400 flex items-center justify-end gap-1"><Heart size={8}/> NOK: {emp.nextOfKin}</p>}
                              </div>
                              {emp.phoneNumber ? (
                                 <a href={`tel:${emp.phoneNumber}`} className="p-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl hover:bg-emerald-600 hover:text-white transition-all shadow-sm flex items-center gap-2">
                                    <Phone size={16} /> <span className="sm:hidden text-[10px] font-black uppercase">Call</span>
                                 </a>
                              ) : (
                                <span className="p-3 bg-gray-50 text-gray-300 rounded-xl cursor-not-allowed"><Phone size={16}/></span>
                              )}
                            </>
                         )}
                         {statusModal === 'OUTSIDE' && emp.phoneNumber && (
                            <div className="flex items-center gap-3">
                               <span className="text-[10px] font-bold text-slate-500 hidden sm:block">{emp.phoneNumber}</span>
                               <a href={`tel:${emp.phoneNumber}`} className="p-3 bg-black text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg">
                                  <Phone size={16} />
                               </a>
                            </div>
                         )}
                         {statusModal === 'ACTIVE' && (
                            <button onClick={() => { setStatusModal(null); setViewingProfile(emp); }} className="p-2 text-slate-400 hover:text-black transition-colors">
                               <ChevronRight size={20} />
                            </button>
                         )}
                      </div>
                   </div>
                ))}
                {getModalList().length === 0 && (
                   <div className="py-24 text-center text-gray-300 font-black uppercase text-[10px] tracking-[0.2em] italic">
                      Registry Empty
                   </div>
                )}
             </div>
          </div>
        </div>,
        document.body
      )}

      {showDeleteConfirm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xl animate-in fade-in">
          <div className="bg-white rounded-[3rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in border border-white/20">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-6 mx-auto shadow-sm"><ShieldAlert size={32}/></div>
            <h3 className="text-xl font-black text-center uppercase mb-6 text-black">Security Check</h3>
            <div className="space-y-4">
              <input 
                type="password" 
                placeholder="Enter Admin Password" 
                autoFocus
                value={deletePasswordInput} 
                onChange={e => setDeletePasswordInput(e.target.value)} 
                className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-red-500" 
              />
              <div className="flex gap-2">
                <button onClick={() => { setShowDeleteConfirm(null); setDeletePasswordInput(''); }} className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px]">Cancel</button>
                <button onClick={confirmDelete} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">Delete</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingEmployee && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in border border-white/20">
            {/* Edit Form */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg"><Edit3 size={20} /></div>
                <h3 className="text-lg font-bold uppercase tracking-tight text-black">Edit Personnel</h3>
              </div>
              <button onClick={() => setEditingEmployee(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); onUpdateEmployee(editingEmployee.id, editingEmployee); setEditingEmployee(null); }} className="p-6 space-y-6">
              <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
                
                {/* ID - POPPING STYLE */}
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-center shadow-inner">
                    <label className="text-[9px] font-black uppercase tracking-widest text-emerald-600 mb-2 block">System PIN (ID)</label>
                    <input 
                        required 
                        className="w-full bg-white border-2 border-emerald-400 rounded-2xl text-4xl font-black text-emerald-900 focus:ring-4 focus:ring-emerald-200 outline-none text-center tracking-[0.3em] py-4 shadow-sm transition-all" 
                        value={editingEmployee.pin} 
                        onChange={e => setEditingEmployee({...editingEmployee, pin: e.target.value})} 
                    />
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Full Name</label>
                  <input required className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-slate-900 focus:ring-2 focus:ring-black outline-none transition-all" value={editingEmployee.name} onChange={e => setEditingEmployee({...editingEmployee, name: e.target.value})} />
                </div>

                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Unit</label>
                    <select required className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-black outline-none transition-all" value={editingEmployee.department} onChange={e => setEditingEmployee({...editingEmployee, department: e.target.value})}>
                      {availableDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1"><Phone size={10}/> Phone Number</label>
                        <input className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-black outline-none transition-all" value={editingEmployee.phoneNumber || ''} onChange={e => setEditingEmployee({...editingEmployee, phoneNumber: e.target.value})} placeholder="+263..." />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1"><Heart size={10}/> Next of Kin #</label>
                        <input className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-black outline-none transition-all" value={editingEmployee.nextOfKin || ''} onChange={e => setEditingEmployee({...editingEmployee, nextOfKin: e.target.value})} placeholder="Contact..." />
                    </div>
                </div>

                <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block flex items-center gap-1"><MapPin size={10}/> Physical Address</label>
                    <textarea className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold text-slate-900 text-sm focus:ring-2 focus:ring-black outline-none min-h-[80px] resize-none transition-all" value={editingEmployee.address || ''} onChange={e => setEditingEmployee({...editingEmployee, address: e.target.value})} placeholder="House No, Street, City..." />
                </div>

              </div>
              <div className="flex gap-2 pt-2 border-t border-gray-100">
                <button type="button" onClick={() => { onResetDaysWorked(editingEmployee.id); setEditingEmployee(null); }} className="w-full py-4 bg-orange-50 text-orange-600 rounded-xl font-black uppercase text-[10px] active:scale-95 hover:bg-orange-100 transition-all tracking-widest">Reset Stats</button>
                <button type="submit" className="w-full py-4 bg-black text-white rounded-xl font-black uppercase text-[10px] shadow-xl active:scale-95 hover:bg-slate-800 transition-all tracking-widest">Save Changes</button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Main Content with Animation */}
      <div className="space-y-6 animate-in fade-in duration-500 relative pb-20 md:pb-0">
        {/* Stats Header - Interactive Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col justify-between">
            <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Users size={10}/> Total Staff</h4>
            <p className="text-2xl font-black text-gray-900">{employees.length}</p>
          </div>
          
          <div onClick={() => setStatusModal('ACTIVE')} className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100 cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between group">
            <h4 className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest mb-1 flex items-center gap-1 group-hover:underline"><UserCheck size={10}/> Active Today</h4>
            <p className="text-2xl font-black text-emerald-900">{activeList.length}</p>
          </div>
          
          <div onClick={() => setStatusModal('ABSENT')} className="p-4 bg-red-50 rounded-2xl border border-red-100 cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between group">
            <h4 className="text-[9px] font-bold text-red-600 uppercase tracking-widest mb-1 flex items-center gap-1 group-hover:underline"><UserMinus size={10}/> Absent Today</h4>
            <p className="text-2xl font-black text-red-900">{absentList.length}</p>
          </div>

          <div onClick={() => setStatusModal('OUTSIDE')} className="p-4 bg-orange-50 rounded-2xl border border-orange-100 cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all flex flex-col justify-between group">
            <h4 className="text-[9px] font-bold text-orange-600 uppercase tracking-widest mb-1 flex items-center gap-1 group-hover:underline"><Briefcase size={10}/> Outside Work</h4>
            <p className="text-2xl font-black text-orange-900">{outsideList.length}</p>
          </div>
        </div>

        {/* Main UI Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-3 md:p-2 rounded-3xl md:rounded-2xl shadow-sm border border-slate-50">
          <div className="flex flex-col md:flex-row flex-wrap gap-3 md:gap-4 items-center w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
              <input 
                placeholder="Search Name or PIN..." 
                value={searchQuery} 
                onChange={(e) => setSearchQuery(e.target.value)} 
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all" 
              />
            </div>
            <select value={selectedDeptFilter} onChange={(e) => setSelectedDeptFilter(e.target.value)} className="w-full md:w-auto px-6 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-tight appearance-none focus:ring-2 focus:ring-emerald-500 outline-none">
              <option value="ALL">ALL UNITS</option>
              {availableDepartments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
            </select>
          </div>
          <button onClick={() => setShowAddForm(!showAddForm)} className="w-full md:w-auto px-8 py-3 bg-black text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:scale-105 active:scale-95 transition-all tracking-wider">
            {showAddForm ? 'Close Registration' : 'New Enrollment'}
          </button>
        </div>

        {showAddForm && (
          <div className="p-6 md:p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 animate-in slide-in-from-top-4 shadow-sm">
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Name</label><input required className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-black outline-none" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} /></div>
               <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Unit</label><select required className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm outline-none" value={newEmp.department} onChange={e => setNewEmp({...newEmp, department: e.target.value})}>{availableDepartments.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
               <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">ID (PIN)</label><input required className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-black shadow-sm focus:ring-2 focus:ring-black outline-none" value={newEmp.pin} onChange={e => setNewEmp({...newEmp, pin: e.target.value})} /></div>
               
               {/* Extended Add Form Fields */}
               <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Phone</label><input className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-black outline-none" value={newEmp.phoneNumber} onChange={e => setNewEmp({...newEmp, phoneNumber: e.target.value})} placeholder="Optional" /></div>
               <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Next of Kin #</label><input className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-black outline-none" value={newEmp.nextOfKin} onChange={e => setNewEmp({...newEmp, nextOfKin: e.target.value})} placeholder="Optional" /></div>
               <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-400 ml-2">Address</label><input className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-black outline-none" value={newEmp.address} onChange={e => setNewEmp({...newEmp, address: e.target.value})} placeholder="Optional" /></div>

               <div className="md:col-span-2 lg:col-span-3">
                 <button 
                   onClick={handleSubmit} 
                   disabled={isSubmitting}
                   className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all tracking-widest flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                 >
                   {isSubmitting ? (
                     <>
                       <Loader2 className="animate-spin" size={16} />
                       Processing...
                     </>
                   ) : (
                     'Register User'
                   )}
                 </button>
               </div>
             </div>
          </div>
        )}

        {/* Desktop Table View */}
        <div className="hidden md:block bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Identity</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Work Stats</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center">QR Pass</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredAndSortedEmployees.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50/50 transition-all group cursor-pointer" onClick={(e) => {
                  if((e.target as HTMLElement).closest('button')) return;
                  if((e.target as HTMLElement).closest('a')) return;
                  setViewingProfile(emp);
                }}>
                  <td className="px-8 py-5">
                    <div className="text-[16px] font-black text-slate-900 uppercase tracking-tight mb-1 flex items-center gap-2">
                      {emp.name} <ChevronRight size={14} className="text-gray-300 group-hover:text-black transition-colors" />
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{emp.department} • ID: {emp.pin}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex gap-3">
                       <div className="px-3 py-1 bg-blue-50 text-blue-700 rounded-lg text-[10px] font-black uppercase tracking-widest">
                         {(emp as any).calculatedTotalDays || 0} Days
                       </div>
                       <div className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-black uppercase tracking-widest">
                         {(emp as any).calculatedTotalHours || 0} Hrs
                       </div>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <button onClick={() => downloadQrCode(emp)} className="p-3 bg-slate-100 hover:bg-black hover:text-white rounded-2xl transition-all border border-slate-200 inline-flex items-center gap-3 group/qr shadow-sm">
                      <QrCode size={18} />
                    </button>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingEmployee(emp)} className="p-2.5 text-slate-400 hover:text-black hover:bg-slate-100 rounded-xl transition-all"><Edit3 size={18} /></button>
                      <button onClick={() => setShowDeleteConfirm(emp.id)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {filteredAndSortedEmployees.map(emp => (
            <div 
              key={emp.id} 
              className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-4 active:scale-[0.99] transition-transform"
              onClick={(e) => {
                if((e.target as HTMLElement).closest('button')) return;
                setViewingProfile(emp);
              }}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-black uppercase text-slate-900 leading-tight mb-1">{emp.name}</h3>
                  <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase text-slate-400">
                    <span className="bg-slate-50 px-2 py-1 rounded-md">{emp.department}</span>
                    <span className="bg-slate-50 px-2 py-1 rounded-md flex items-center gap-1"><Hash size={10}/> {emp.pin}</span>
                  </div>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); downloadQrCode(emp); }} 
                  className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:bg-black hover:text-white transition-colors"
                >
                  <QrCode size={20} />
                </button>
              </div>

              <div className="flex gap-2">
                 <div className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-center">
                   {(emp as any).calculatedTotalDays || 0} Days
                 </div>
                 <div className="flex-1 px-3 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[10px] font-black uppercase tracking-widest text-center">
                   {(emp as any).calculatedTotalHours || 0} Hrs
                 </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                <button 
                  onClick={(e) => { e.stopPropagation(); setEditingEmployee(emp); }} 
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-50 text-slate-600 text-[10px] font-black uppercase hover:bg-black hover:text-white transition-colors"
                >
                  <Edit3 size={14} /> Edit
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(emp.id); }} 
                  className="flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 text-[10px] font-black uppercase hover:bg-red-600 hover:text-white transition-colors"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default StaffDirectory;
