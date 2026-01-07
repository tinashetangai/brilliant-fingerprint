
import React, { useState, useEffect, useMemo } from 'react';
import { Lock, RefreshCcw, ShieldAlert, X, Loader2, FileBarChart, Download, Filter } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Employee, AttendanceLog, SystemSettings, Notice, Department, InformalLog, FrequentVisitor, OvertimeDecision } from '../types';
import AdminSidebar, { AdminTab } from '../components/AdminSidebar';
import MobileTopNav from '../components/MobileTopNav';
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
import OvertimeManager from '../admin/OvertimeManager';

import { attendanceCalculator } from '../services/attendanceCalculator';
import { pdfReportGenerator } from '../services/pdfReport.generator';
import { csvReportGenerator } from '../services/csvReport.generator';

interface AdminDashboardProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ isAuthenticated, onLogin, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');
  const [password, setPassword] = useState('');
  
  // Data States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [visitorLogs, setVisitorLogs] = useState<AttendanceLog[]>([]);
  const [informalLogs, setInformalLogs] = useState<InformalLog[]>([]);
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [frequentVisitors, setFrequentVisitors] = useState<FrequentVisitor[]>([]);
  const [overtimeDecisions, setOvertimeDecisions] = useState<OvertimeDecision[]>([]);
  
  // UI States
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'EARLY' | 'LATE'>('ALL');
  const [isReportOpen, setIsReportOpen] = useState(false); // Legacy report modal
  
  // Real-time Update Tick
  const [tick, setTick] = useState(0);

  // New Report Config State
  const [showReportConfig, setShowReportConfig] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportDept, setReportDept] = useState('ALL');
  
  // Purge State
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgePassword, setPurgePassword] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  const [adminNotification, setAdminNotification] = useState<{id: number, msg: string, sub: string, type: 'success' | 'error'} | null>(null);
  
  useEffect(() => {
    loadSettingsOnly();
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (isAuthenticated) loadData();
  }, [isAuthenticated, activeTab]);

  const loadSettingsOnly = async () => {
    try {
      const s = await dataService.getSettings();
      setSettings(s);
    } catch (err) { console.error(err); }
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const [s, n, e, d, l, vl, i, fv, od] = await Promise.all([
        dataService.getSettings(),
        dataService.getNotices(),
        dataService.getEmployees(),
        dataService.getDepartments(),
        dataService.getLogs(),
        dataService.getVisitorLogs(),
        dataService.getInformalLogs(),
        dataService.getFrequentVisitors(),
        dataService.getOvertimeDecisions()
      ]);
      setSettings(s);
      setNotices(n);
      setEmployees(e);
      
      const uniqueDeptsMap = new Map<string, Department>();
      d.forEach(dept => {
        if (!uniqueDeptsMap.has(dept.name.trim())) {
          uniqueDeptsMap.set(dept.name.trim(), dept);
        }
      });
      const uniqueDepts = Array.from(uniqueDeptsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      setDepartments(uniqueDepts);

      setLogs(l);
      setVisitorLogs(vl);
      setInformalLogs(i);
      setFrequentVisitors(fv);
      setOvertimeDecisions(od);
    } catch (err) { 
      console.error(err);
    }
    setIsRefreshing(false);
  };

  // --- CALCULATED DATA MEMO ---
  const allCalculatedRecords = useMemo(() => {
    if (!settings) return [];
    return employees.flatMap(emp => 
      attendanceCalculator.calculateEmployeeRecords(emp.id, logs, overtimeDecisions, settings)
    );
  }, [logs, employees, overtimeDecisions, settings, tick]);

  const employeesWithStats = useMemo(() => {
    if (!settings) return employees;
    return attendanceCalculator.getAggregatedStats(employees, logs, overtimeDecisions, settings);
  }, [employees, logs, overtimeDecisions, settings, tick]);

  const handleWipeLogs = async () => {
    if (purgePassword === settings?.adminPassword) {
      setIsPurging(true);
      try {
        await dataService.wipeLogs();
        setLogs([]);
        setVisitorLogs([]);
        setInformalLogs([]);
        setOvertimeDecisions([]);
        setAdminNotification({ id: Date.now(), msg: "Database Purged", sub: "All logs wiped successfully", type: 'success' });
        setShowPurgeModal(false);
        setPurgePassword('');
      } catch (e) {
        setAdminNotification({ id: Date.now(), msg: "Purge Failed", sub: "System error during wipe", type: 'error' });
      } finally {
        setIsPurging(false);
      }
    } else {
      setAdminNotification({ id: Date.now(), msg: "ACCESS DENIED", sub: "Incorrect purge credentials", type: 'error' });
    }
  };

  // --- REPORT GENERATION ---
  const generateMonthlyReport = (format: 'CSV' | 'PDF') => {
    if (!settings) return;
    const targetEmployees = reportDept === 'ALL' 
      ? employees 
      : employees.filter(e => e.department === reportDept);

    if (targetEmployees.length === 0) {
      setAdminNotification({ id: Date.now(), msg: "No Data", sub: "No employees found in selection", type: 'error' });
      return;
    }

    const filteredRecords = allCalculatedRecords.filter(r => {
      const [d, m, y] = r.date.split('/').map(Number);
      return (m - 1) === reportMonth && y === reportYear;
    });

    const monthName = new Date(reportYear, reportMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
    const fullTitle = `${reportDept === 'ALL' ? 'Company' : reportDept} Attendance - ${monthName}`;

    if (format === 'CSV') {
      csvReportGenerator.generateMonthlyReport(targetEmployees, filteredRecords, fullTitle);
    } else {
      pdfReportGenerator.generateMonthlyReport(targetEmployees, filteredRecords, fullTitle);
    }
    
    setAdminNotification({ id: Date.now(), msg: "Report Generated", sub: `${format} Download started`, type: 'success' });
    setShowReportConfig(false);
  };

  const handleAuth = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === (settings?.adminPassword || 'admin123')) {
      onLogin();
      setPassword(''); 
    } else {
      setAdminNotification({ id: Date.now(), msg: 'ACCESS DENIED', sub: 'Incorrect credentials', type: 'error' });
    }
  };

  // Wrappers for CRUD operations
  const handleAddEmployee = async (newEmp: any) => { try { const added = await dataService.addEmployee(newEmp); setEmployees(prev => [...prev, added]); setAdminNotification({ id: Date.now(), msg: "Employee Added", sub: `${added.name} saved`, type: 'success' }); } catch { setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed", type: 'error' }); } };
  const handleUpdateEmployee = async (id: string, updatedData: Partial<Employee>) => { try { await dataService.updateEmployee(id, updatedData); setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, ...updatedData } : emp)); setAdminNotification({ id: Date.now(), msg: "Updated", sub: "Success", type: 'success' }); } catch { setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed", type: 'error' }); } };
  const handleDeleteEmployee = async (id: string) => { try { await dataService.deleteEmployee(id); setEmployees(prev => prev.filter(emp => emp.id !== id)); setAdminNotification({ id: Date.now(), msg: "Deleted", sub: "Success", type: 'success' }); } catch { setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed", type: 'error' }); } };
  const handleResetDaysWorked = async (id: string) => { try { await dataService.resetDaysWorked(id); setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, totalDaysWorked: 0 } : emp)); setAdminNotification({ id: Date.now(), msg: "Reset", sub: "Success", type: 'success' }); } catch { setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed", type: 'error' }); } };
  
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'ADD_STAFF': setActiveTab('EMPLOYEES'); break;
      case 'NOTICE': setActiveTab('NOTICES'); break;
      case 'REPORT': setShowReportConfig(true); break;
      case 'SYNC': loadData(); break;
    }
  };

  const handleSuggestionClick = (name: string) => { setSearchQuery(name); };

  const handleAddDepartment = async (name: string) => { 
    if (departments.some(d => d.name.toLowerCase().trim() === name.toLowerCase().trim())) {
      setAdminNotification({ id: Date.now(), msg: "Duplicate", sub: "Unit already exists", type: 'error' });
      return;
    }
    try { 
      const added = await dataService.addDepartment(name); 
      setDepartments(prev => [...prev, added].sort((a,b) => a.name.localeCompare(b.name))); 
    } catch {} 
  };
  
  const handleUpdateDepartment = async (id: string, name: string) => { try { await dataService.updateDepartment(id, name); setDepartments(prev => prev.map(d => d.id === id ? { ...d, name } : d).sort((a,b) => a.name.localeCompare(b.name))); } catch {} };
  const handleDeleteDepartment = async (id: string) => { try { await dataService.deleteDepartment(id); setDepartments(prev => prev.filter(d => d.id !== id)); } catch {} };
  const handleSaveSettings = async (s: SystemSettings) => { await dataService.updateSettings(s); setSettings(s); setAdminNotification({ id: Date.now(), msg: "Settings Saved", sub: "Updated", type: 'success' }); };
  const handleAddNotice = async (n: any) => { try { const added = await dataService.addNotice(n); setNotices(prev => [added, ...prev]); } catch {} };
  const handleUpdateNotice = async (id: string, u: any) => { try { await dataService.updateNotice(id, u); setNotices(prev => prev.map(n => n.id === id ? { ...n, ...u } : n)); } catch {} };
  const handleDeleteNotice = async (n: any) => { try { await dataService.deleteNotice(n); setNotices(prev => prev.filter(x => x.id !== n.id)); } catch {} };
  const handleAddFrequentVisitor = async (v: any) => { try { const added = await dataService.addFrequentVisitor(v); setFrequentVisitors(prev => [...prev, added]); } catch {} };
  const handleUpdateFrequentVisitor = async (id: string, u: any) => { try { await dataService.updateFrequentVisitor(id, u); setFrequentVisitors(prev => prev.map(v => v.id === id ? { ...v, ...u } : v)); } catch {} };
  const handleDeleteFrequentVisitor = async (id: string) => { try { await dataService.deleteFrequentVisitor(id); setFrequentVisitors(prev => prev.filter(v => v.id !== id)); } catch {} };

  const filteredReportLogs = useMemo(() => {
    if (activeTab === 'VISITOR_LOGS') return visitorLogs;
    if (activeTab === 'STAFF_LOGS') return logs;
    return [...logs, ...visitorLogs];
  }, [activeTab, logs, visitorLogs]);

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
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-900 text-slate-900 overflow-hidden relative">
      {adminNotification && (
        <Notification 
          key={adminNotification.id}
          message={adminNotification.msg} 
          subtext={adminNotification.sub} 
          type={adminNotification.type} 
          onClose={() => setAdminNotification(null)}
          duration={3000}
        />
      )}

      {!isAuthenticated ? (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-100 p-6">
          <div className="bg-white p-12 rounded-[2.5rem] border border-gray-200 shadow-2xl w-full max-w-md animate-in fade-in zoom-in duration-300">
            <div className="w-20 h-20 bg-slate-900 text-white rounded-2xl flex items-center justify-center mb-8 mx-auto shadow-xl"><Lock size={40} /></div>
            <h2 className="text-3xl font-black text-center text-black mb-2 uppercase">Admin Login</h2>
            <form onSubmit={handleAuth} className="space-y-4 mt-8">
              <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-black outline-none text-lg font-bold" />
              <button className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold uppercase text-sm shadow-xl active:scale-95 transition-all">Login</button>
              <button type="button" onClick={() => window.location.hash = ''} className="w-full py-4 text-gray-400 hover:text-black font-bold uppercase text-xs">Terminal</button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {/* === MODALS === */}
          {showReportConfig && (
            <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
              <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in border border-white/20">
                <div className="flex items-center gap-4 mb-8">
                  <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center shadow-lg"><FileBarChart size={32} /></div>
                  <div>
                    <h3 className="text-2xl font-black text-black uppercase tracking-tight">Generate Report</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Select period and filter</p>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Month</label>
                      <select 
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black"
                        value={reportMonth}
                        onChange={(e) => setReportMonth(parseInt(e.target.value))}
                      >
                        {Array.from({length: 12}, (_, i) => (
                          <option key={i} value={i}>{new Date(2000, i).toLocaleString('default', {month: 'long'})}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Year</label>
                      <input 
                        type="number" 
                        value={reportYear} 
                        onChange={(e) => setReportYear(parseInt(e.target.value))}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase text-gray-400 ml-2 tracking-widest">Department Filter</label>
                    <div className="relative">
                      <Filter className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                      <select 
                        className="w-full pl-12 pr-6 py-4 bg-gray-50 border border-gray-200 rounded-2xl font-black text-sm outline-none focus:ring-2 focus:ring-black appearance-none"
                        value={reportDept}
                        onChange={(e) => setReportDept(e.target.value)}
                      >
                        <option value="ALL">ALL DEPARTMENTS</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.name}>{d.name.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button onClick={() => setShowReportConfig(false)} className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px] hover:bg-gray-200 transition-all">Cancel</button>
                    <button onClick={() => generateMonthlyReport('CSV')} className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all"><Download size={14} /> Download CSV</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {showPurgeModal && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-red-950/40 backdrop-blur-xl animate-in fade-in">
              <div className="bg-white rounded-[3rem] w-full max-w-md p-10 shadow-2xl animate-in zoom-in">
                <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mb-8 mx-auto shadow-sm"><ShieldAlert size={40}/></div>
                <h3 className="text-2xl font-black text-center uppercase mb-8">Confirm Purge</h3>
                <div className="space-y-4">
                  <input type="password" placeholder="Admin Password" value={purgePassword} onChange={e => setPurgePassword(e.target.value)} className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-black outline-none" />
                  <div className="flex gap-3">
                    <button onClick={() => setShowPurgeModal(false)} className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black uppercase text-[10px]">Cancel</button>
                    <button onClick={handleWipeLogs} disabled={isPurging} className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-xl">{isPurging ? 'Purging...' : 'Confirm'}</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === MAIN LAYOUT === */}
          
          {/* Mobile Navigation (Sticky Top) */}
          <MobileTopNav activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Desktop Sidebar */}
          <div className="hidden md:flex h-screen sticky top-0 left-0 z-20">
            <AdminSidebar activeTab={activeTab} onTabChange={(t) => setActiveTab(t)} onExit={onLogout} />
          </div>
          
          {/* Main Content Area */}
          <main className="flex-grow flex flex-col h-full overflow-hidden bg-slate-100 relative">
            
            {/* Desktop Header */}
            <header className="hidden md:flex px-8 py-5 justify-between items-center bg-white/80 backdrop-blur-sm sticky top-0 z-20 shadow-sm border-b border-white/50">
              <div className="flex flex-col">
                <h2 className="text-xl font-black uppercase tracking-tighter text-slate-900">{activeTab.replace('_', ' ')}</h2>
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Administration Console</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-bold text-slate-400 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 uppercase tracking-widest">
                  {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                <button onClick={loadData} className={`p-3 border border-slate-200 bg-white rounded-xl hover:bg-slate-50 transition-all ${isRefreshing ? 'text-blue-500' : 'text-slate-400'}`}>
                  <RefreshCcw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>
            </header>

            {/* Content Container */}
            <div className="flex-grow overflow-auto p-0 md:p-6 pb-0 md:pb-6">
              {/* On mobile: remove rounded corners and padding for full-screen effect */}
              <div className="w-full min-h-full bg-white md:bg-white/80 md:backdrop-blur-xl md:border md:border-white/60 md:rounded-[2.5rem] md:shadow-xl p-4 md:p-6 transition-all duration-500 ease-in-out">
                {activeTab === 'OVERVIEW' && settings && <AdminOverview employees={employeesWithStats} logs={logs} onQuickAction={handleQuickAction} settings={settings} />}
                
                {activeTab === 'EMPLOYEES' && (
                  <StaffDirectory 
                    employees={employeesWithStats} 
                    departments={departments} 
                    onAddEmployee={handleAddEmployee} 
                    onUpdateEmployee={handleUpdateEmployee} 
                    onDeleteEmployee={handleDeleteEmployee} 
                    onResetDaysWorked={handleResetDaysWorked} 
                    searchQuery={searchQuery} 
                    setSearchQuery={setSearchQuery} 
                    highlightedId={highlightedId} 
                    handleSuggestionClick={handleSuggestionClick} 
                    activeEmployeeIds={activeEmployeeIds}
                    getEmployeeRecords={(id) => allCalculatedRecords.filter(r => r.employeeId === id)}
                    adminPassword={settings?.adminPassword || ''}
                  />
                )}

                {activeTab === 'OVERTIME' && settings && (
                  <OvertimeManager 
                    employees={employees} 
                    allRecords={allCalculatedRecords} 
                    onRefresh={loadData} 
                  />
                )}

                {activeTab === 'OUTSIDE_WORK' && <OutsideWork employees={employees} departments={departments} onRefresh={loadData} />}
                {activeTab === 'STAFF_LOGS' && <StaffLogs logs={logs} employees={employees} searchQuery={searchQuery} setSearchQuery={setSearchQuery} activeFilter={activeFilter} setActiveFilter={setActiveFilter} onReportOpen={() => setShowReportConfig(true)} onWipeLogs={() => setShowPurgeModal(true)} highlightedId={highlightedId} handleSuggestionClick={handleSuggestionClick} />}
                {activeTab === 'GATE_LOG' && <GateLog logs={informalLogs} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onReportOpen={() => setShowReportConfig(true)} />}
                {activeTab === 'VISITOR_LOGS' && <VisitorLogs logs={visitorLogs} employees={employees} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onReportOpen={() => setShowReportConfig(true)} highlightedId={highlightedId} handleSuggestionClick={handleSuggestionClick} onRefresh={loadData} />}
                {activeTab === 'FREQUENT_VISITORS' && <FrequentVisitors frequentVisitors={frequentVisitors} onAddFrequentVisitor={handleAddFrequentVisitor} onUpdateFrequentVisitor={handleUpdateFrequentVisitor} onDeleteFrequentVisitor={handleDeleteFrequentVisitor} />}
                {activeTab === 'NOTICES' && <Notices notices={notices} onAdd={handleAddNotice} onToggle={(id, active) => handleUpdateNotice(id, { isActive: active })} onDelete={handleDeleteNotice} />}
                {activeTab === 'SETTINGS' && <Settings settings={settings} setSettings={setSettings} departments={departments} onAddDepartment={handleAddDepartment} onUpdateDepartment={handleUpdateDepartment} onDeleteDepartment={handleDeleteDepartment} onSave={handleSaveSettings} />}
              </div>
            </div>

            {/* Legacy Report Modal */}
            <ReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} title={activeTab} data={filteredReportLogs} employees={employees} logs={logs} />
          </main>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
