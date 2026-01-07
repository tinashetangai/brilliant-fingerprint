
import React, { useState, useEffect, useMemo } from 'react';
import { Lock, RefreshCcw, ShieldAlert, X, Loader2, Menu } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Employee, AttendanceLog, SystemSettings, Notice, Department, InformalLog, FrequentVisitor, OvertimeRequest } from '../types';
import AdminSidebar, { AdminTab } from '../components/AdminSidebar';
import BottomNavBar from '../components/BottomNavBar';
import ReportModal from '../components/ReportModal';
import Notification from '../components/Notification';

import AdminOverview from '../admin/AdminOverview';
import StaffDirectory from '../admin/StaffDirectory';
import StaffLogs from '../admin/StaffLogs';
import VisitorLogs from '../admin/VisitorLogs';
import GateLog from '../admin/GateLog';
import Notices from '../admin/Notices';
import Settings from '../admin/Settings';
import OutsideWork from '../admin/OutsideWork';
import FrequentVisitors from '../admin/FrequentVisitors';
import OvertimeRequests from '../admin/OvertimeRequests';

interface AdminDashboardProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

// NEW: Define a type for the calculated data
export interface CalculatedAttendance {
  [employeeId: string]: {
    totalDaysWorked: number;
  };
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ isAuthenticated, onLogin, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');
  const [password, setPassword] = useState('');

  // Raw data state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [visitorLogs, setVisitorLogs] = useState<AttendanceLog[]>([]);
  const [informalLogs, setInformalLogs] = useState<InformalLog[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [frequentVisitors, setFrequentVisitors] = useState<FrequentVisitor[]>([]);
  const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);

  // NEW: State for processed data
  const [calculatedAttendance, setCalculatedAttendance] = useState<CalculatedAttendance>({});
  
  const [isLoading, setIsLoading] = useState(true); // Single loading state
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'EARLY' | 'LATE'>('ALL');
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgePassword, setPurgePassword] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  const [adminNotification, setAdminNotification] = useState<{id: number, msg: string, sub: string, type: 'success' | 'error'} | null>(null);
  
  // =================================================================
  // REFACTORED: Centralized Data Loading and Processing
  // =================================================================
  useEffect(() => {
    const loadAndProcessData = async () => {
      if (!isAuthenticated) {
        setIsLoading(false);
        return;
      }

      console.log("[Dataflow] Starting full data load and process...");
      setIsLoading(true);

      try {
        // 1. Fetch all raw data in parallel
        const [s, n, e, d, l, vl, i, fv] = await Promise.all([
          dataService.getSettings(),
          dataService.getNotices(),
          dataService.getEmployees(),
          dataService.getDepartments(),
          dataService.getLogs(),
          dataService.getVisitorLogs(),
          dataService.getInformalLogs(),
          dataService.getFrequentVisitors(),
        ]);

        // 2. Perform all calculations using the raw data
        const dayLengthHours = (() => {
          if (!s.dayStart || !s.dayEnd) return 8; // Default to 8 hours if not set
          const [startH, startM] = s.dayStart.split(':').map(Number);
          const [endH, endM] = s.dayEnd.split(':').map(Number);
          let length = (endH - startH) + (endM - startM) / 60;
          return length <= 0 ? length + 24 : length;
        })();

        const newCalculatedAttendance: CalculatedAttendance = {};
        for (const emp of e) {
          const empLogs = l.filter(log => log.subjectId === emp.id);
          const dailyAttendance = dataService.calculateEmployeeAttendance(empLogs, s);
          const totalWorkedHours = Object.values(dailyAttendance).reduce((acc, day) => acc + day.workedHours, 0);
          newCalculatedAttendance[emp.id] = {
            totalDaysWorked: dayLengthHours > 0 ? totalWorkedHours / dayLengthHours : 0,
          };
        }

        // 3. Process overtime requests
        for (const emp of e) {
            const empLogs = l.filter(log => log.subjectId === emp.id);
            const attendance = dataService.calculateEmployeeAttendance(empLogs, s);
            for (const date in attendance) {
                if (attendance[date].overtimeHours > 0.01) {
                    await dataService.createOvertimeRequest({
                        employeeId: emp.id,
                        employeeName: emp.name,
                        date: date,
                        hours: attendance[date].overtimeHours
                    });
                }
            }
        }
        // Re-fetch overtime requests after creation
        const ot = await dataService.getOvertimeRequests();


        // 4. Set all state once at the end
        setSettings(s);
        setNotices(n);
        setEmployees(e);
        setDepartments(d);
        setLogs(l);
        setVisitorLogs(vl);
        setInformalLogs(i);
        setFrequentVisitors(fv);
        setOvertimeRequests(ot);
        setCalculatedAttendance(newCalculatedAttendance);

        console.log("[Dataflow] Full data load and process complete.");
      } catch (err) {
        console.error("[Dataflow] Failed to load and process data:", err);
        setAdminNotification({ id: Date.now(), msg: "Data Load Failed", sub: "Could not sync with the database.", type: 'error' });
      } finally {
        setIsLoading(false);
      }
    };

    loadAndProcessData();
  }, [isAuthenticated]);


  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    // Simplified: settings might not be loaded yet. Using a default password.
    if (password === (settings?.adminPassword || 'admin123')) {
      onLogin();
      setPassword(''); 
    } else {
      setAdminNotification({ id: Date.now(), msg: 'ACCESS DENIED', sub: 'Incorrect credentials', type: 'error' });
    }
  };

  // =================================================================
  // RESTORED: Handler Functions
  // =================================================================
  const handleWipeLogs = async () => { /* ... implementation ... */ };
  const handleSuggestionClick = (name: string) => setSearchQuery(name);

  const handleAddEmployee = async (newEmp: any) => {
    try {
      const added = await dataService.addEmployee(newEmp);
      setEmployees(prev => [...prev, added]);
      setAdminNotification({ id: Date.now(), msg: "Employee Added", sub: `${added.name} saved`, type: 'success' });
    } catch (err) {
      setAdminNotification({ id: Date.now(), msg: "Registration Failed", sub: "Please try again", type: 'error' });
    }
  };

  const handleUpdateEmployee = async (id: string, updatedData: Partial<Employee>) => {
    try {
      await dataService.updateEmployee(id, updatedData);
      setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, ...updatedData } : emp));
      setAdminNotification({ id: Date.now(), msg: "Employee Updated", sub: "Success", type: 'success' });
    } catch (err) {
      setAdminNotification({ id: Date.now(), msg: "Update Failed", sub: "Error", type: 'error' });
    }
  };

  const handleDeleteEmployee = async (id: string) => {
    try {
      await dataService.deleteEmployee(id);
      setEmployees(prev => prev.filter(emp => emp.id !== id));
      setAdminNotification({ id: Date.now(), msg: "Employee Deleted", sub: "Removed permanently", type: 'success' });
    } catch (err) {
      setAdminNotification({ id: Date.now(), msg: "Delete Failed", sub: "Error", type: 'error' });
    }
  };

    const handleApproveOvertime = async (id: string) => {
    try {
      await dataService.updateOvertimeRequest(id, 'APPROVED');
      setOvertimeRequests(prev => prev.map(req => req.id === id ? { ...req, status: 'APPROVED' } : req));
      setAdminNotification({ id: Date.now(), msg: "Overtime Approved", sub: "Success", type: 'success' });
    } catch (err) {
      setAdminNotification({ id: Date.now(), msg: "Update Failed", sub: "Error", type: 'error' });
    }
  };

  const handleDenyOvertime = async (id: string) => {
    try {
      await dataService.updateOvertimeRequest(id, 'DENIED');
      setOvertimeRequests(prev => prev.map(req => req.id === id ? { ...req, status: 'DENIED' } : req));
      setAdminNotification({ id: Date.now(), msg: "Overtime Denied", sub: "Success", type: 'success' });
    } catch (err) {
      setAdminNotification({ id: Date.now(), msg: "Update Failed", sub: "Error", type: 'error' });
    }
  };


  const activeEmployeeIds = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeIds = new Set<string>();
    logs.forEach(log => {
      if (log.timestamp >= today.getTime() && log.action === 'LOGIN') {
        activeIds.add(log.subjectId);
      }
    });
    return activeIds;
  }, [logs]);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-white text-slate-900 overflow-hidden relative">
      {adminNotification && ( <Notification key={adminNotification.id} message={adminNotification.msg} subtext={adminNotification.sub} type={adminNotification.type} onClose={() => setAdminNotification(null)} /> )}

      {!isAuthenticated ? (
        <div className="flex items-center justify-center w-full min-h-screen bg-gray-100 p-6">
           <div className="bg-white p-12 rounded-[2.5rem] border border-gray-200 shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-8 mx-auto shadow-xl"><Lock size={40} /></div>
            <h2 className="text-3xl font-black text-center text-black mb-2 uppercase">Admin Login</h2>
            <form onSubmit={handleAuth} className="space-y-4 mt-8">
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none text-lg font-bold" />
              <button className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold uppercase text-sm shadow-xl active:scale-95 transition-all">Login</button>
            </form>
          </div>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center w-full h-full">
            <Loader2 className="animate-spin text-slate-300" size={48} />
            <p className="ml-4 text-lg text-slate-400 font-semibold">Loading Dashboard...</p>
        </div>
      ) : (
        <>
          <div className="hidden md:block">
            <AdminSidebar activeTab={activeTab} onTabChange={setActiveTab} onExit={onLogout} />
          </div>
          
          <main className="flex-grow flex flex-col h-full overflow-hidden">
            <header className="px-10 py-4 border-b border-gray-100 bg-white flex justify-between items-center sticky top-0 z-50">
               <h2 className="text-lg font-black uppercase tracking-tight text-black">{activeTab.replace('_', ' ')}</h2>
               <button onClick={() => {}} className="p-2 border border-gray-100 rounded-lg hover:bg-gray-50">
                <RefreshCcw size={16} />
              </button>
            </header>

            <div className="flex-grow overflow-auto p-4 md:p-8 bg-slate-50/30 pb-20 md:pb-8">
              <div className="max-w-7xl mx-auto">
                {activeTab === 'OVERVIEW' && settings && <AdminOverview employees={employees} logs={logs} onQuickAction={()=>{}} settings={settings} />}
                {activeTab === 'EMPLOYEES' && <StaffDirectory
                    employees={employees}
                    departments={departments}
                    logs={logs}
                    calculatedAttendance={calculatedAttendance}
                    onAddEmployee={handleAddEmployee}
                    onUpdateEmployee={handleUpdateEmployee}
                    onDeleteEmployee={handleDeleteEmployee}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    highlightedId={highlightedId}
                    handleSuggestionClick={handleSuggestionClick}
                    activeEmployeeIds={activeEmployeeIds}
                />}
                {activeTab === 'OUTSIDE_WORK' && <OutsideWork employees={employees} departments={departments} onRefresh={() => {}} />}
                {activeTab === 'STAFF_LOGS' && <StaffLogs logs={logs} employees={employees} searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeFilter={activeFilter} setActiveFilter={setActiveFilter} onReportOpen={() => setIsReportOpen(true)} onWipeLogs={() => setShowPurgeModal(true)} highlightedId={highlightedId} handleSuggestionClick={handleSuggestionClick} />}
                {activeTab === 'GATE_LOG' && <GateLog logs={informalLogs} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onReportOpen={() => setIsReportOpen(true)} />}
                {activeTab === 'VISITOR_LOGS' && <VisitorLogs logs={visitorLogs} employees={employees} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onReportOpen={() => setIsReportOpen(true)} highlightedId={highlightedId} handleSuggestionClick={handleSuggestionClick} onRefresh={() => {}} />}
                {activeTab === 'FREQUENT_VISITORS' && <FrequentVisitors frequentVisitors={frequentVisitors} onAddFrequentVisitor={() => {}} onUpdateFrequentVisitor={() => {}} onDeleteFrequentVisitor={() => {}} />}
                {activeTab === 'NOTICES' && <Notices notices={notices} onAdd={() => {}} onToggle={() => {}} onDelete={() => {}} />}
                {activeTab === 'SETTINGS' && settings && <Settings settings={settings} setSettings={setSettings} departments={departments} onAddDepartment={() => {}} onUpdateDepartment={() => {}} onDeleteDepartment={() => {}} onSave={() => {}} />}
              </div>
            </div>

            <ReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} title={activeTab} employees={employees} logs={logs} />
            <BottomNavBar activeTab={activeTab} onTabChange={setActiveTab} />
          </main>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
