import React, { useState, useEffect, useMemo } from 'react';
import { Save, Settings as SettingsIcon, Building2, Plus, Trash2, Edit2, Check, X, Clock, ShieldCheck, Briefcase, Lock, Loader, ChevronRight, Download, Users, AlertTriangle, Database, Calendar, Wand2 } from 'lucide-react';
import { SystemSettings, Department, Employee, AttendanceAction, LogStatus, AttendanceLog } from '../types';
import * as XLSX from 'xlsx';
import { dataService, formatDate } from '../services/dataService';

interface SettingsProps {
  settings: SystemSettings | null;
  setSettings: (settings: SystemSettings) => void;
  departments: Department[];
  employees: Employee[];
  logs: any[];
  onAddDepartment: (name: string) => Promise<void>;
  onUpdateDepartment: (id: string, name: string) => Promise<void>;
  onDeleteDepartment: (id: string) => Promise<void>;
  onSave: (settings: SystemSettings) => Promise<void>;
  onRefresh: () => void;
}

type SettingsTab = 'TIME' | 'DEPARTMENTS' | 'COMPANY' | 'SECURITY' | 'BACKUP' | 'TOOLS' | 'BATCH_EDIT';

const Settings: React.FC<SettingsProps> = ({ 
  settings, 
  setSettings, 
  departments,
  employees,
  onAddDepartment, 
  onUpdateDepartment, 
  onDeleteDepartment, 
  onSave,
  onRefresh
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('TIME');
  const [isBatchEditUnlocked, setIsBatchEditUnlocked] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState('');
  
  // Security form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);

  // Batch Operation State
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchConfirm, setBatchConfirm] = useState<'LOGIN' | 'LOGOUT' | 'PURGE' | 'SEED' | 'RANDOM_IN' | 'RANDOM_OUT' | 'FORCE_OUT_RANDOM' | 'DELETE_DATE' | 'FILL_BLANKS' | null>(null);
  
  // Purge Log State
  const [purgeLogs, setPurgeLogs] = useState<string[]>([]);

  // Seeding State
  const [showSeedingModal, setShowSeedingModal] = useState(false);
  const [seedDate, setSeedDate] = useState(new Date().toISOString().split('T')[0]);
  const [seedSearch, setSeedSearch] = useState('');
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(new Set());
  const [isSeeding, setIsSeeding] = useState(false);

  // Batch Editor State
  const [batchEditDate, setBatchEditDate] = useState(new Date().toISOString().split('T')[0]);
  const [rangeSeedStart, setRangeSeedStart] = useState(new Date().toISOString().split('T')[0]);
  const [rangeSeedEnd, setRangeSeedEnd] = useState(new Date().toISOString().split('T')[0]);

  const handleBackup = () => {
    const data = employees.map(emp => ({
      Name: emp.name,
      PIN: emp.pin,
      Department: emp.department
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
    XLSX.writeFile(workbook, "employee_backup.xlsx");
  };

  const handleBatchOperation = async () => {
    setBatchLoading(true);
    try {
        let result;
        if (batchConfirm === 'LOGIN') {
            result = await dataService.batchClockInAbsentEmployees();
            alert(`Success: ${result.count} absent employees have been clocked in.`);
        } else if (batchConfirm === 'LOGOUT') {
            result = await dataService.batchClockOutActiveEmployees();
            alert(`Success: ${result.count} active employees have been clocked out.`);
        } else if (batchConfirm === 'FORCE_OUT_RANDOM') {
            result = await dataService.batchClockOutActiveEmployees(true);
            alert(`Success: ${result.count} active employees have been clocked out with randomized times (17:30-19:00).`);
        } else if (batchConfirm === 'RANDOM_IN' || batchConfirm === 'RANDOM_OUT') {
            await handleBatchRandomization(batchConfirm === 'RANDOM_IN' ? 'IN' : 'OUT');
        } else if (batchConfirm === 'DELETE_DATE') {
            await handleDeleteDateLogs();
        } else if (batchConfirm === 'FILL_BLANKS') {
            await handleFillBlanks();
        }
        onRefresh();
    } catch (e) {
        console.error(e);
        alert("Batch operation failed. Check console.");
    } finally {
        setBatchLoading(false);
        setBatchConfirm(null);
    }
  };

  const handleFillBlanks = async () => {
    setPurgeLogs(["Starting gap-fill analysis..."]);
    try {
        const result = await dataService.fillMissingHistory((msg) => {
            setPurgeLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] ${msg}`]);
        });
        alert(`Success! Generated ${result.count} missing records to fill system gaps.`);
    } catch (e: any) {
        console.error(e);
        alert("Gap-fill failed.");
    }
  };

  const handleDeleteDateLogs = async () => {
    const [y, m, d] = batchEditDate.split('-').map(Number);
    const dateKey = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
    
    const logs = await dataService.getLogsByDate(dateKey);
    if (logs.length === 0) {
        alert("No logs found for this date.");
        return;
    }
    
    const ids = logs.map(l => l.id);
    const res = await dataService.batchDeleteLogs(ids);
    alert(`Successfully deleted ${res.count} logs for ${dateKey}.`);
  };

  const handleBatchRandomization = async (type: 'IN' | 'OUT') => {
      const [y, m, d] = batchEditDate.split('-').map(Number);
      const dateKey = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
      
      const logsToFix = await dataService.getLogsByDate(dateKey);
      const targetLogs = logsToFix.filter(l => l.action === (type === 'IN' ? AttendanceAction.LOGIN : AttendanceAction.LOGOUT));
      
      if (targetLogs.length === 0) {
          alert(`No ${type} logs found for ${dateKey}`);
          return;
      }

      const updates = targetLogs.map((log, index) => {
          const baseDate = new Date(y, m - 1, d);
          let randomMinutes = 0;
          
          if (type === 'IN') {
              // 6:30 (390) to 8:30 (510)
              randomMinutes = 390 + Math.floor(Math.random() * 121);
          } else {
              // 17:30 (1050) to 19:00 (1140) - UPDATED RANGE
              randomMinutes = 1050 + Math.floor(Math.random() * 91);
          }

          const seconds = Math.floor(Math.random() * 60);
          baseDate.setHours(0, randomMinutes, seconds, 0);
          return { id: log.id, timestamp: baseDate.getTime() };
      });

      const res = await dataService.batchUpdateTimestamps(updates);
      alert(`Updated ${res.count} ${type} logs for ${dateKey}`);
  };

  const handlePurgeLogs = async () => {
    if (!confirm("Are you sure? This will delete ALL logs from Jan 17 to Today.")) return;
    setBatchLoading(true);
    setPurgeLogs(["Starting purge process..."]);
    
    try {
        const currentYear = new Date().getFullYear();
        const start = new Date(currentYear, 0, 17, 0, 0, 0).getTime(); 
        const end = Date.now();
        
        const result = await dataService.deleteLogsTimeRange(start, end, (count, msg) => {
            setPurgeLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
        });
        
        setPurgeLogs(prev => [...prev, `DONE. Total deleted: ${result.count}`]);
        alert(`Purge Complete. Deleted ${result.count} records.`);
        onRefresh();
    } catch (e: any) {
        console.error(e);
        setPurgeLogs(prev => [...prev, `ERROR: ${e.message}`]);
        alert("Purge failed. See logs below button.");
    } finally {
        setBatchLoading(false);
    }
  };

  const filteredSeedEmployees = useMemo(() => {
    return employees.filter(e => e.name.toLowerCase().includes(seedSearch.toLowerCase()) || e.department.toLowerCase().includes(seedSearch.toLowerCase()));
  }, [employees, seedSearch]);

  const toggleEmpSelection = (id: string) => {
    const next = new Set(selectedEmpIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedEmpIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedEmpIds.size === filteredSeedEmployees.length) {
      setSelectedEmpIds(new Set());
    } else {
      setSelectedEmpIds(new Set(filteredSeedEmployees.map(e => e.id)));
    }
  };

  const handleSeed = async (type: 'IN' | 'OUT') => {
    if (selectedEmpIds.size === 0) return;
    setIsSeeding(true);
    try {
        const logsToCreate: Omit<AttendanceLog, 'id'>[] = [];
        const [y, m, d] = seedDate.split('-').map(Number);
        const baseDate = new Date(y, m - 1, d);
        
        Array.from(selectedEmpIds).forEach(empId => {
            const emp = employees.find(e => e.id === empId);
            if (!emp) return;

            const logDate = new Date(baseDate);
            let randomMinutes = 0;

            if (type === 'IN') {
                const startMin = 6 * 60 + 30; // 6:30
                randomMinutes = startMin + Math.floor(Math.random() * 62);
            } else {
                // 17:30 to 19:00 (1050 to 1140 mins)
                const startMin = 1050;
                randomMinutes = startMin + Math.floor(Math.random() * 91);
            }

            logDate.setHours(0, randomMinutes, 0, 0);

            logsToCreate.push({
                subjectId: emp.id,
                subjectName: emp.name,
                timestamp: logDate.getTime(),
                action: type === 'IN' ? AttendanceAction.LOGIN : AttendanceAction.LOGOUT,
                status: LogStatus.SUCCESS,
                confidence: 1.0,
                type: 'EMPLOYEE',
                source: 'ADMIN_SEEDING',
                date: formatDate(logDate)
            });
        });

        const res = await dataService.batchAddLogs(logsToCreate);
        alert(`Success! Added ${res.count} records for ${seedDate}.`);
        onRefresh();
        setShowSeedingModal(false);
        setSelectedEmpIds(new Set());
    } catch (e) {
        console.error(e);
        alert("Seeding failed.");
    } finally {
        setIsSeeding(false);
    }
  };

  const handleRangeSeed = async () => {
    if (!confirm(`This will generate LOGIN/LOGOUT logs for ALL employees from ${rangeSeedStart} to ${rangeSeedEnd}. Continue?`)) return;
    setBatchLoading(true);
    setPurgeLogs(["Initializing range seed..."]);

    try {
        const start = new Date(rangeSeedStart);
        const end = new Date(rangeSeedEnd);
        const allLogsToAdd: Omit<AttendanceLog, 'id'>[] = [];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = formatDate(d);
            const [year, month, day] = [d.getFullYear(), d.getMonth(), d.getDate()];

            employees.forEach(emp => {
                // Login: 06:30 - 08:30
                const loginTs = new Date(Date.UTC(year, month, day, 4, 30, 0)).getTime() + Math.floor(Math.random() * 120 * 60000);
                // Logout: 17:05 - 18:46
                const logoutTs = new Date(Date.UTC(year, month, day, 15, 5, 0)).getTime() + Math.floor(Math.random() * 101 * 60000);

                allLogsToAdd.push({
                    subjectId: emp.id,
                    subjectName: emp.name,
                    timestamp: loginTs,
                    action: AttendanceAction.LOGIN,
                    status: LogStatus.SUCCESS,
                    type: 'EMPLOYEE',
                    confidence: 1.0,
                    source: 'RANGE_SEED',
                    date: dateStr
                });

                allLogsToAdd.push({
                    subjectId: emp.id,
                    subjectName: emp.name,
                    timestamp: logoutTs,
                    action: AttendanceAction.LOGOUT,
                    status: LogStatus.SUCCESS,
                    type: 'EMPLOYEE',
                    confidence: 1.0,
                    source: 'RANGE_SEED',
                    date: dateStr
                });
            });
        }

        setPurgeLogs(prev => [...prev.slice(-15), `[${new Date().toLocaleTimeString()}] Sending ${allLogsToAdd.length} records to server...`]);
        const res = await dataService.batchAddLogs(allLogsToAdd);

        alert(`Success! Generated ${res.count} records across the selected range.`);
        onRefresh();
    } catch (e: any) {
        console.error(e);
        alert("Range seed failed.");
    } finally {
        setBatchLoading(false);
    }
  };

  useEffect(() => {
    const handleInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
  }, []);


  if (!settings) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader className="animate-spin" size={48} />
        <p className="ml-4 text-lg">Loading settings...</p>
      </div>
    );
  }

  const handleAddDept = async () => {
    if (!newDeptName.trim()) return;
    await onAddDepartment(newDeptName);
    setNewDeptName('');
  };

  const startEditing = (dept: Department) => {
    setEditingDeptId(dept.id);
    setEditingDeptName(dept.name);
  };

  const cancelEditing = () => {
    setEditingDeptId(null);
    setEditingDeptName('');
  };

  const saveDeptEdit = async (id: string) => {
    if (!editingDeptName.trim()) return;
    await onUpdateDepartment(id, editingDeptName);
    cancelEditing();
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword) return;
    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }
    await onSave({ ...settings, adminPassword: newPassword });
    setNewPassword('');
    setConfirmPassword('');
  };

  const TabButton = ({ id, icon: Icon, label }: { id: SettingsTab; icon: any; label: string }) => (
    <button
      onClick={() => {
        if (id === 'BATCH_EDIT' && !isBatchEditUnlocked) {
          const pin = prompt("Enter Batch Edit PIN:");
          if (pin === '1677') {
            setIsBatchEditUnlocked(true);
            setActiveTab(id);
          } else if (pin !== null) {
            alert("Incorrect PIN");
          }
        } else {
          setActiveTab(id);
        }
      }}
      className={`w-full flex items-center gap-4 px-6 py-5 rounded-2xl text-left transition-all duration-300 group ${
        activeTab === id 
          ? 'bg-black text-white shadow-xl' 
          : 'hover:bg-gray-100 text-gray-500 hover:text-black'
      }`}
    >
      <Icon size={18} className={`${activeTab === id ? 'text-white' : 'text-gray-400 group-hover:text-black'}`} />
      <span className="text-xs font-black uppercase tracking-widest flex-grow">{label}</span>
      {activeTab === id && <ChevronRight size={14} className="animate-in slide-in-from-left-2" />}
    </button>
  );

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row gap-6 animate-in fade-in duration-500 relative">
      
      {/* Seeding Modal / Batch Entry Modal */}
      {showSeedingModal && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-4xl h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in border border-slate-200">
                <div className="p-6 border-b border-gray-100 bg-slate-50 flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-black uppercase text-slate-900 tracking-tight">Batch Entry Console</h3>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Manual Attendance logging for specific users</p>
                    </div>
                    <button onClick={() => setShowSeedingModal(false)} className="p-2 hover:bg-gray-200 rounded-full"><X size={20}/></button>
                </div>

                <div className="p-6 border-b border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-6 bg-white">
                    <div>
                        <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Target Date</label>
                        <input 
                            type="date" 
                            value={seedDate} 
                            onChange={(e) => setSeedDate(e.target.value)} 
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-black"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Search Employee</label>
                        <input 
                            type="text" 
                            placeholder="Filter by name or dept..."
                            value={seedSearch}
                            onChange={(e) => setSeedSearch(e.target.value)}
                            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl font-bold outline-none focus:border-black"
                        />
                    </div>
                </div>

                <div className="flex-grow overflow-y-auto p-2 bg-slate-50">
                    <div className="flex items-center gap-3 p-4 bg-white border-b border-gray-100 sticky top-0 z-10">
                        <input 
                            type="checkbox" 
                            checked={selectedEmpIds.size > 0 && selectedEmpIds.size === filteredSeedEmployees.length}
                            onChange={toggleSelectAll}
                            className="w-5 h-5 accent-black"
                        />
                        <span className="text-xs font-black uppercase">Select All ({filteredSeedEmployees.length})</span>
                        <span className="ml-auto text-xs font-bold text-emerald-600">{selectedEmpIds.size} Selected</span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 p-2">
                        {filteredSeedEmployees.map(emp => (
                            <div key={emp.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${selectedEmpIds.has(emp.id) ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}`}>
                                <input 
                                    type="checkbox" 
                                    checked={selectedEmpIds.has(emp.id)}
                                    onChange={() => toggleEmpSelection(emp.id)}
                                    className="w-5 h-5 accent-black"
                                />
                                <div>
                                    <p className="text-xs font-black uppercase text-slate-900">{emp.name}</p>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase">{emp.department}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-200 bg-white grid grid-cols-2 gap-4">
                    <button 
                        onClick={() => handleSeed('IN')}
                        disabled={selectedEmpIds.size === 0 || isSeeding}
                        className="py-4 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-2xl font-black uppercase text-xs hover:bg-emerald-100 disabled:opacity-50"
                    >
                        {isSeeding ? 'Processing...' : `Batch Clock In (Morning)`}
                    </button>
                    <button 
                        onClick={() => handleSeed('OUT')}
                        disabled={selectedEmpIds.size === 0 || isSeeding}
                        className="py-4 bg-orange-50 text-orange-700 border border-orange-100 rounded-2xl font-black uppercase text-xs hover:bg-orange-100 disabled:opacity-50"
                    >
                        {isSeeding ? 'Processing...' : `Batch Clock Out (17:30 - 19:00)`}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Batch Confirm Modal */}
      {batchConfirm && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
            <div className="bg-white p-8 rounded-[2rem] max-w-sm w-full animate-in zoom-in border-4 border-red-50">
                <div className="flex flex-col items-center text-center gap-4">
                    <div className="w-16 h-16 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center">
                        <AlertTriangle size={32}/>
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase text-black mb-1">Confirm Batch Action</h3>
                        <p className="text-sm font-medium text-gray-500">
                            {batchConfirm === 'LOGIN' 
                                ? "This will forcefully CLOCK IN every employee who is currently absent." 
                                : batchConfirm === 'LOGOUT' 
                                ? "This will forcefully CLOCK OUT every employee who is currently present."
                                : batchConfirm === 'RANDOM_IN'
                                ? "This will randomize ALL Login times for the selected date to 06:30-08:30."
                                : batchConfirm === 'RANDOM_OUT'
                                ? "This will randomize ALL Logout times for the selected date to 17:05-18:46."
                                : batchConfirm === 'DELETE_DATE'
                                ? "WARNING: This will PERMANENTLY DELETE all logs for the selected date. This action cannot be undone."
                                : batchConfirm === 'FILL_BLANKS'
                                ? "This will scan all previous days and automatically create missing Login (07:00-08:00) and Logout (16:00-18:00) records for all employees."
                                : "This will forcefully log out ALL active workers with random times between 17:30 and 19:00."}
                        </p>
                    </div>
                    <div className="flex gap-3 w-full mt-4">
                        <button onClick={() => setBatchConfirm(null)} className="flex-1 py-4 bg-gray-100 rounded-2xl font-black uppercase text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                        <button 
                            onClick={handleBatchOperation} 
                            disabled={batchLoading}
                            className="flex-1 py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] hover:bg-gray-900 transition-all shadow-xl"
                        >
                            {batchLoading ? 'Processing...' : 'Confirm Execution'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <div className="w-full md:w-72 flex-shrink-0 bg-white border border-gray-100 rounded-[2.5rem] p-4 flex flex-col gap-2 shadow-sm h-fit">
        <div className="p-6 pb-2">
          <h3 className="text-lg font-black text-black uppercase tracking-tight">Configuration</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">System Controls</p>
        </div>
        <div className="space-y-1">
          <TabButton id="TIME" icon={Clock} label="Work Schedule" />
          <TabButton id="DEPARTMENTS" icon={Building2} label="Units Registry" />
          <TabButton id="BATCH_EDIT" icon={Wand2} label="Batch Editor" />
          <TabButton id="TOOLS" icon={Users} label="Tools" />
          <TabButton id="COMPANY" icon={Briefcase} label="Branding" />
          <TabButton id="SECURITY" icon={Lock} label="Security" />
          <TabButton id="BACKUP" icon={Download} label="Backup" />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-grow bg-white border border-gray-100 rounded-[2.5rem] shadow-sm p-8 md:p-10 overflow-y-auto">
        
        {activeTab === 'TIME' && (
          <div className="space-y-10 max-w-3xl animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-2">Schedule & Time Logic</h2>
              <p className="text-sm font-medium text-gray-400">Define operational hours and calculation rules.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center"><ShieldCheck size={16}/></div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-emerald-900">Shift Boundaries</h4>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Day Start (Earliest In)</label>
                    <input type="time" value={settings.dayStart} onChange={e => setSettings({...settings, dayStart: e.target.value})} className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Day End (Shift Over)</label>
                    <input type="time" value={settings.dayEnd} onChange={e => setSettings({...settings, dayEnd: e.target.value})} className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black transition-all" />
                  </div>
                </div>
              </div>

              <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center"><Clock size={16}/></div>
                  <h4 className="text-[11px] font-black uppercase tracking-widest text-blue-900">Auto-Deductions</h4>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Std Hours</label>
                    <input type="number" value={settings.standardDayHours || 8} onChange={e => setSettings({...settings, standardDayHours: parseFloat(e.target.value)})} className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black transition-all" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Lunch (Min)</label>
                    <input type="number" value={settings.lunchDurationMinutes || 60} onChange={e => setSettings({...settings, lunchDurationMinutes: parseFloat(e.target.value)})} className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black transition-all" />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Short Break (Min)</label>
                    <input type="number" value={settings.breakDurationMinutes || 30} onChange={e => setSettings({...settings, breakDurationMinutes: parseFloat(e.target.value)})} className="w-full px-5 py-4 bg-white border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black transition-all" />
                  </div>
                </div>
              </div>
            </div>

            <button onClick={() => onSave(settings)} className="px-8 py-4 bg-black text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 tracking-widest hover:scale-105">
               <Save size={16}/> Save Configuration
            </button>
          </div>
        )}

        {activeTab === 'DEPARTMENTS' && (
          <div className="space-y-8 max-w-4xl animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-2">Organizational Units</h2>
                <p className="text-sm font-medium text-gray-400">Manage company departments and teams.</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                <input 
                  placeholder="New Department Name..." 
                  value={newDeptName}
                  onChange={e => setNewDeptName(e.target.value)}
                  className="flex-grow md:w-64 px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-black transition-all"
                />
                <button 
                  onClick={handleAddDept}
                  className="px-5 bg-black text-white rounded-xl shadow-lg flex items-center gap-2 active:scale-95 transition-all hover:bg-gray-800"
                >
                  <Plus size={20}/>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {departments.map(dept => (
                <div key={dept.id} className="p-5 bg-white border border-gray-100 rounded-2xl flex items-center justify-between group hover:border-gray-300 hover:shadow-md transition-all">
                  {editingDeptId === dept.id ? (
                    <div className="flex items-center gap-2 w-full">
                      <input 
                        autoFocus
                        className="flex-grow px-3 py-2 bg-gray-50 border border-black rounded-lg text-sm font-bold outline-none"
                        value={editingDeptName}
                        onChange={e => setEditingDeptName(e.target.value)}
                      />
                      <button onClick={() => saveDeptEdit(dept.id)} className="p-2 bg-emerald-500 text-white rounded-lg"><Check size={14}/></button>
                      <button onClick={cancelEditing} className="p-2 bg-gray-200 text-gray-600 rounded-lg"><X size={14}/></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-gray-400 font-bold text-xs border border-gray-100">
                          {dept.name.charAt(0)}
                        </div>
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-tight">{dept.name}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => startEditing(dept)} className="p-2 text-gray-400 hover:text-black hover:bg-gray-100 rounded-lg transition-all"><Edit2 size={14}/></button>
                        <button onClick={() => onDeleteDepartment(dept.id)} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"><Trash2 size={14}/></button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {departments.length === 0 && (
              <div className="text-center py-20 text-gray-300 font-black uppercase text-[10px] tracking-[0.4em] italic">
                No departments found
              </div>
            )}
          </div>
        )}

        {activeTab === 'BATCH_EDIT' && (
           <div className="space-y-10 max-w-4xl animate-in fade-in slide-in-from-right-4 duration-300">
               <div>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-2">Mass Time Correction</h2>
                  <p className="text-sm font-medium text-gray-400">Quickly randomize entry/exit times for all logs on a specific day.</p>
               </div>

               <div className="p-8 bg-slate-50 border border-slate-200 rounded-[2.5rem]">
                   <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block tracking-widest">Select Target Date</label>
                   <input 
                        type="date" 
                        value={batchEditDate} 
                        onChange={(e) => setBatchEditDate(e.target.value)} 
                        className="w-full md:w-64 px-5 py-4 bg-white border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black transition-all mb-8"
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="p-6 bg-emerald-50 border border-emerald-100 rounded-2xl flex flex-col items-start gap-4">
                            <div>
                                <h4 className="text-sm font-black uppercase text-emerald-900">Randomize Login Times</h4>
                                <p className="text-[10px] font-bold text-emerald-600 mt-2">
                                    Updates all <b>LOGIN</b> logs on this date to a random time between <b>06:30</b> and <b>08:30</b>.
                                </p>
                            </div>
                            <button 
                                onClick={() => setBatchConfirm('RANDOM_IN')}
                                className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md active:scale-95 transition-all"
                            >
                                Batch Fix Logins
                            </button>
                        </div>

                        <div className="p-6 bg-orange-50 border border-orange-100 rounded-2xl flex flex-col items-start gap-4">
                            <div>
                                <h4 className="text-sm font-black uppercase text-orange-900">Randomize Logout Times</h4>
                                <p className="text-[10px] font-bold text-orange-600 mt-2">
                                    Updates all <b>LOGOUT</b> logs on this date to a random time between <b>17:05</b> and <b>18:46</b>.
                                </p>
                            </div>
                            <button 
                                onClick={() => setBatchConfirm('RANDOM_OUT')}
                                className="px-6 py-3 bg-orange-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md active:scale-95 transition-all"
                            >
                                Batch Fix Logouts
                            </button>
                        </div>

                        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl flex flex-col items-start gap-4">
                            <div>
                                <h4 className="text-sm font-black uppercase text-red-900">Clear Daily Logs</h4>
                                <p className="text-[10px] font-bold text-red-600 mt-2">
                                    Permanently delete <b>ALL</b> attendance records for this specific date.
                                </p>
                            </div>
                            <button 
                                onClick={() => setBatchConfirm('DELETE_DATE')}
                                className="px-6 py-3 bg-red-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md active:scale-95 transition-all"
                            >
                                Delete Logs for {batchEditDate}
                            </button>
                        </div>

                        <div className="p-6 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-col items-start gap-4">
                            <div>
                                <h4 className="text-sm font-black uppercase text-indigo-900">Selective Batch Entry</h4>
                                <p className="text-[10px] font-bold text-indigo-600 mt-2">
                                    Manually select employees to clock in or out for this date.
                                </p>
                            </div>
                            <button 
                                onClick={() => { setSeedDate(batchEditDate); setShowSeedingModal(true); }}
                                className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black uppercase text-[10px] tracking-widest shadow-md active:scale-95 transition-all"
                            >
                                Select Workers for Batch Entry
                            </button>
                        </div>

                        <div className="p-6 bg-blue-50 border border-blue-100 rounded-2xl flex flex-col items-start gap-4 md:col-span-2">
                            <div className="flex items-center gap-3">
                                <Database size={20} className="text-blue-600" />
                                <h4 className="text-sm font-black uppercase text-blue-900">Fill History Gaps (One-Click)</h4>
                            </div>
                            <p className="text-[10px] font-bold text-blue-600 mt-2">
                                Automatically scans all previous dates. For any employee missing a record, it generates random <b>Logins (07:00-08:00)</b> and <b>Logouts (16:00-18:00)</b>.
                            </p>
                            <button
                                onClick={() => setBatchConfirm('FILL_BLANKS')}
                                disabled={batchLoading}
                                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black uppercase text-xs tracking-[0.2em] shadow-lg hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                            >
                                <Check size={16} /> Fill All Missing Blanks
                            </button>
                            {batchLoading && batchConfirm === 'FILL_BLANKS' && (
                                <div className="w-full mt-4 p-4 bg-black text-blue-400 font-mono text-[9px] rounded-xl h-24 overflow-y-auto border border-blue-900 shadow-inner">
                                    {purgeLogs.map((l, i) => (
                                        <div key={i}>{l}</div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-6 bg-purple-50 border border-purple-100 rounded-2xl flex flex-col items-start gap-4 md:col-span-2">
                            <div className="flex items-center gap-3">
                                <Calendar size={20} className="text-purple-600" />
                                <h4 className="text-sm font-black uppercase text-purple-900">Historical Range Seeding</h4>
                            </div>
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <div>
                                    <label className="text-[9px] font-black uppercase text-purple-400 ml-1">Start Date</label>
                                    <input type="date" value={rangeSeedStart} onChange={e => setRangeSeedStart(e.target.value)} className="w-full p-3 bg-white border border-purple-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-purple-500" />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black uppercase text-purple-400 ml-1">End Date</label>
                                    <input type="date" value={rangeSeedEnd} onChange={e => setRangeSeedEnd(e.target.value)} className="w-full p-3 bg-white border border-purple-200 rounded-xl font-bold text-sm outline-none focus:ring-2 focus:ring-purple-500" />
                                </div>
                            </div>
                            <p className="text-[10px] font-bold text-purple-600">
                                Generates random <b>Logins (06:30-08:30)</b> and <b>Logouts (17:05-18:46)</b> for <b>ALL</b> employees for every day in the range.
                            </p>
                            <button
                                onClick={handleRangeSeed}
                                disabled={batchLoading}
                                className="w-full py-4 bg-purple-600 text-white rounded-xl font-black uppercase text-xs tracking-[0.2em] shadow-lg hover:bg-purple-700 transition-all flex items-center justify-center gap-2"
                            >
                                <Wand2 size={16} /> Seed Selected Range
                            </button>
                            {batchLoading && purgeLogs.length > 0 && !batchConfirm && (
                                <div className="w-full mt-4 p-4 bg-black text-purple-400 font-mono text-[9px] rounded-xl h-24 overflow-y-auto border border-purple-900 shadow-inner">
                                    {purgeLogs.map((l, i) => (
                                        <div key={i}>{l}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
               </div>
           </div>
        )}

        {activeTab === 'TOOLS' && (
            <div className="space-y-10 max-w-4xl animate-in fade-in slide-in-from-right-4 duration-300">
               <div>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-2">System Tools</h2>
                  <p className="text-sm font-medium text-gray-400">Emergency controls for mass attendance updates.</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-8 bg-emerald-50 border border-emerald-100 rounded-[2.5rem] flex flex-col items-start gap-4">
                      <div>
                          <h4 className="text-lg font-black uppercase text-emerald-900 tracking-tight">Auto-Clock In All Absent</h4>
                          <p className="text-xs font-bold text-emerald-600 mt-2">
                              Forces a LOGIN record for every employee currently marked absent for today. <br/>
                              Useful if the biometric scanner was offline during morning entry.
                          </p>
                      </div>
                      <button onClick={() => setBatchConfirm('LOGIN')} className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:scale-105 active:scale-95 transition-all tracking-widest whitespace-nowrap">
                          Run Auto-Login
                      </button>
                  </div>

                  <div className="p-8 bg-red-50 border border-red-100 rounded-[2.5rem] flex flex-col items-start gap-4">
                      <div>
                          <h4 className="text-lg font-black uppercase text-red-900 tracking-tight">Auto-Clock Out All Active</h4>
                          <p className="text-xs font-bold text-red-600 mt-2">
                              Forces a LOGOUT record for every employee currently on-site. <br/>
                              Useful at end of day if everyone forgot to clock out.
                          </p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setBatchConfirm('LOGOUT')} className="px-6 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:scale-105 active:scale-95 transition-all tracking-widest whitespace-nowrap">
                            Run Auto-Logout
                        </button>
                        <button onClick={() => setBatchConfirm('FORCE_OUT_RANDOM')} className="px-6 py-4 bg-orange-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:scale-105 active:scale-95 transition-all tracking-widest whitespace-nowrap">
                            Logout (Random Time)
                        </button>
                      </div>
                  </div>
               </div>

               <div>
                  <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-2 mt-8">Advanced Data Management</h2>
                  <p className="text-sm font-medium text-gray-400">Clean up old records or generate test data.</p>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="p-8 bg-slate-50 border border-slate-200 rounded-[2.5rem] flex flex-col items-start gap-4">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-200 rounded-xl flex items-center justify-center text-slate-500"><Database size={20}/></div>
                          <h4 className="text-lg font-black uppercase text-slate-900 tracking-tight">Data Purge</h4>
                      </div>
                      <p className="text-xs font-bold text-slate-500">
                          Permanently delete all attendance records from <span className="text-black">Jan 17th</span> to <span className="text-black">Today</span>.
                      </p>
                      <button 
                        onClick={handlePurgeLogs}
                        disabled={batchLoading}
                        className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:bg-red-600 transition-all tracking-widest whitespace-nowrap flex items-center gap-2"
                      >
                          <Trash2 size={14} /> Purge Jan 17 - Now
                      </button>
                      
                      {purgeLogs.length > 0 && (
                        <div className="w-full mt-4 p-4 bg-black text-emerald-400 font-mono text-[10px] rounded-xl h-32 overflow-y-auto border border-slate-700 shadow-inner">
                            {purgeLogs.map((l, i) => (
                                <div key={i} className="whitespace-nowrap">{l}</div>
                            ))}
                        </div>
                      )}
                  </div>

                  <div className="p-8 bg-indigo-50 border border-indigo-100 rounded-[2.5rem] flex flex-col items-start gap-4">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-200 text-indigo-700 rounded-xl flex items-center justify-center"><Calendar size={20}/></div>
                          <h4 className="text-lg font-black uppercase text-indigo-900 tracking-tight">Batch Entry Console</h4>
                      </div>
                      <p className="text-xs font-bold text-indigo-600">
                          Manually select employees to create Clock-In or Clock-Out records for specific dates.
                      </p>
                      <button 
                        onClick={() => setShowSeedingModal(true)}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:scale-105 active:scale-95 transition-all tracking-widest whitespace-nowrap"
                      >
                          Open Batch Console
                      </button>
                  </div>
               </div>
            </div>
        )}

        {activeTab === 'COMPANY' && (
          <div className="space-y-8 max-w-2xl animate-in fade-in slide-in-from-right-4 duration-300">
            <div>
              <h2 className="text-2xl font-black text-black uppercase tracking-tight mb-2">Corporate Identity</h2>
              <p className="text-sm font-medium text-gray-400">Information displayed on reports and terminals.</p>
            </div>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Vision Statement / Motto</label>
                <input value={settings.companyMotto} onChange={e => setSettings({...settings, companyMotto: e.target.value})} className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-black transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Global Contact Information</label>
                <input value={settings.companyContact} onChange={e => setSettings({...settings, companyContact: e.target.value})} className="w-full px-6 py-5 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-black transition-all" />
              </div>
            </div>
            <button onClick={() => onSave(settings)} className="px-8 py-4 bg-black text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 tracking-widest hover:scale-105">
               <Save size={16}/> Update Profile
            </button>
          </div>
        )}

        {activeTab === 'SECURITY' && (
          <div className="space-y-10 max-w-xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300 pt-8">
             <div className="text-center">
                <div className="w-20 h-20 bg-red-50 text-red-600 rounded-[2rem] flex items-center justify-center mb-6 mx-auto shadow-inner border border-red-100">
                  <Lock size={36} />
                </div>
                <h4 className="text-2xl font-black text-black uppercase tracking-tight">Access Control</h4>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Update administrative login credentials</p>
             </div>
             
             <form onSubmit={handlePasswordChange} className="space-y-6 p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 shadow-sm">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">New Admin Password</label>
                  <input 
                    type="password"
                    placeholder="Min 6 characters"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-black transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Confirm Password</label>
                  <input 
                    type="password"
                    placeholder="Repeat new password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full px-6 py-4 bg-white border border-gray-200 rounded-2xl text-sm font-black outline-none focus:ring-2 focus:ring-black transition-all" 
                  />
                </div>
                <button 
                  disabled={!newPassword || newPassword !== confirmPassword}
                  className="w-full py-5 bg-red-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 tracking-widest disabled:opacity-30 hover:bg-red-700"
                >
                   <ShieldCheck size={18}/> Update System Key
                </button>
             </form>

            {installPrompt && (
              <div className="pt-8 border-t border-gray-100 text-center">
                <p className="text-[10px] font-bold text-gray-400 mb-4 uppercase tracking-widest">Device Installation</p>
                <button
                  onClick={() => installPrompt.prompt()}
                  className="px-8 py-3 bg-blue-50 text-blue-600 rounded-xl font-black uppercase text-[10px] hover:bg-blue-100 transition-all"
                >
                  Install App to Home Screen
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'BACKUP' && (
          <div className="space-y-10 max-w-xl mx-auto animate-in fade-in slide-in-from-right-4 duration-300 pt-8">
            <div className="text-center">
              <div className="w-20 h-20 bg-green-50 text-green-600 rounded-[2rem] flex items-center justify-center mb-6 mx-auto shadow-inner border border-green-100">
                <Download size={36} />
              </div>
              <h4 className="text-2xl font-black text-black uppercase tracking-tight">Backup Data</h4>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-2">Export employee data to an Excel file</p>
            </div>

            <div className="p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 shadow-sm text-center">
              <p className="text-sm text-gray-600 mb-6">Click the button below to download a backup of all employees, including their name, PIN, and department.</p>
              <button
                onClick={handleBackup}
                className="w-full py-5 bg-green-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 tracking-widest hover:bg-green-700"
              >
                <Download size={18} /> Export Employee Data
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
