
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Lock, RefreshCcw, ShieldAlert, X, Loader2, FileBarChart, Download, Filter } from 'lucide-react';
import { signInWithEmailAndPassword } from "firebase/auth";
import { dataService } from '../services/dataService';
import { auth } from '../backend/firebase';
import { Employee, AttendanceLog, SystemSettings, Notice, Department, InformalLog, FrequentVisitor, OvertimeDecision, LogStatus, AttendanceAction } from '../types';
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
import { workedHoursService } from '../services/workedHoursService';

interface AdminDashboardProps {
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

const normalizeTs = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts?.seconds) return ts.seconds * 1000;
  return 0;
};

const AdminDashboard: React.FC<AdminDashboardProps> = ({ isAuthenticated, onLogin, onLogout }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('OVERVIEW');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  // Data States
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  
  // LOGS: Only recent logs are loaded by default for performance
  const [logs, setLogs] = useState<AttendanceLog[]>([]);
  const [hasFullHistory, setHasFullHistory] = useState(false);

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
  const [isReportOpen, setIsReportOpen] = useState(false); 
  
  // Real-time Update Tick
  const [tick, setTick] = useState(0);

  // New Report Config State
  const [showReportConfig, setShowReportConfig] = useState(false);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportDept, setReportDept] = useState('ALL');
  
  // Purge State
  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [selectedLogsDate, setSelectedLogsDate] = useState<string>(new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Harare' }));

  const [adminNotification, setAdminNotification] = useState<{id: number, msg: string, sub: string, type: 'success' | 'error'} | null>(null);
  
  const selectedDateRef = useRef(selectedLogsDate);
  useEffect(() => { selectedDateRef.current = selectedLogsDate; }, [selectedLogsDate]);

  // Initial Load: Settings & Live Data Listener
  useEffect(() => {
    loadSettingsOnly();
    
    // Subscribe to REAL-TIME recent logs (Last 24h)
    // This makes the dashboard update instantly without manual refreshes
    const unsubscribeLogs = dataService.subscribeToRecentLogs((recentLogs) => {
      const todayStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Harare' });

      // If user is viewing a historical date and DOES NOT have full history loaded,
      // we ignore "today" updates to avoid overwriting the historical view.
      if (selectedDateRef.current !== todayStr && !hasFullHistory) return;

      setLogs(currentLogs => {
        // If full history is NOT loaded, just use recent logs
        if (!hasFullHistory) return recentLogs; 
        
        // If full history IS loaded, we need to merge recent updates carefully.
        const recentIds = new Set(recentLogs.map(l => l.id));
        const history = currentLogs.filter(l => !recentIds.has(l.id));
        
        // Merge and sort
        const merged = [...history, ...recentLogs].sort((a, b) => b.timestamp - a.timestamp);
        return merged;
      });
    });

    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => {
      clearInterval(interval);
      unsubscribeLogs();
    };
  }, [hasFullHistory]);

  // Static Data Load (Employees, Depts)
  useEffect(() => {
    if (isAuthenticated) loadStaticData();
  }, [isAuthenticated]);

  // Lazy Load Heavy Data
  useEffect(() => {
    // Load full history for Employees tab (for accurate aggregated stats)
    if (isAuthenticated && activeTab === 'EMPLOYEES' && !hasFullHistory) {
      loadFullHistory();
    }
    // For STAFF_LOGS, we load by date
    if (isAuthenticated && activeTab === 'STAFF_LOGS') {
        handleDateChange(selectedLogsDate);
    }
  }, [isAuthenticated, activeTab]);

  // AUTOMATED SALES LOG CHECK
  useEffect(() => {
    if (isAuthenticated) {
        // Run once on mount/auth to check if we need to backfill today's sales logs
        dataService.ensureSalesLogs();
        
        // Optional: Run every hour to check if 18:00 passed while app was open
        const salesTimer = setInterval(() => {
            dataService.ensureSalesLogs();
        }, 3600000); // 1 hour
        return () => clearInterval(salesTimer);
    }
  }, [isAuthenticated]);

  const loadSettingsOnly = async () => {
    try {
      const s = await dataService.getSettings();
      setSettings(s);
    } catch (err) {}
  };

  const loadStaticData = async () => {
    setIsRefreshing(true);
    try {
      const [n, e, d, fv, od] = await Promise.all([
        dataService.getNotices(),
        dataService.getEmployees(),
        dataService.getDepartments(),
        dataService.getFrequentVisitors(),
        dataService.getOvertimeDecisions()
      ]);
      
      setNotices(n);
      setEmployees(e);
      
      const uniqueDeptsMap = new Map<string, Department>();
      d.forEach(dept => {
        if (!uniqueDeptsMap.has(dept.name.trim())) {
          uniqueDeptsMap.set(dept.name.trim(), dept);
        }
      });
      setDepartments(Array.from(uniqueDeptsMap.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setFrequentVisitors(fv);
      setOvertimeDecisions(od);
      
      // Load initial visitor/gate data (lightweight)
      const [vl, il] = await Promise.all([
        dataService.getVisitorLogs(100),
        dataService.getInformalLogs()
      ]);
      setVisitorLogs(vl);
      setInformalLogs(il);

    } catch (err) { }
    setIsRefreshing(false);
  };

  const loadFullHistory = async () => {
    setIsRefreshing(true);
    try {
      // Increased to 5000 to match report generator limit and ensure stats are accurate
      const allLogs = await dataService.getLogs(5000); 
      setLogs(allLogs);
      setHasFullHistory(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDateChange = async (dateStr: string) => {
    setSelectedLogsDate(dateStr);
    setIsRefreshing(true);
    try {
        const dayLogs = await dataService.getLogsByDate(dateStr);
        setLogs(dayLogs);
        setHasFullHistory(false);
    } catch (e) {
        setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed to load logs for date", type: 'error' });
    } finally {
        setIsRefreshing(false);
    }
  };

  // Perform calculations ONLY on the logs we have.
  // By default this is just today's logs (fast).
  // If user clicks "Logs" tab, we load more and this updates.
  const allCalculatedRecords = useMemo(() => {
    if (!settings || employees.length === 0) return [];
    return employees.flatMap(emp => 
      attendanceCalculator.calculateEmployeeRecords(emp.id, logs, overtimeDecisions, settings)
    );
  }, [logs, employees, overtimeDecisions, settings, tick]); // Added tick to update "Live" status

  // ---------------------------------------------------------
  // AUTO DOWNLOAD REPORT AT 05:00 AM (For Previous Day)
  // ---------------------------------------------------------
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkAutoReport = () => {
      const now = new Date();
      if (now.getHours() === 5 && now.getMinutes() === 0) {
        
        const todayStr = now.toDateString();
        const lastRun = localStorage.getItem('last_auto_report_run');

        if (lastRun !== todayStr) {
          const yesterday = new Date(now);
          yesterday.setDate(yesterday.getDate() - 1);
          
          const yesterdayStr = yesterday.toLocaleDateString('en-GB', { 
            day: '2-digit', 
            month: '2-digit', 
            year: 'numeric' 
          });

          // We might need to fetch full logs for this report if they aren't loaded
          dataService.getLogs(1000).then(fullLogs => {
             const records = employees.flatMap(emp => 
                attendanceCalculator.calculateEmployeeRecords(emp.id, fullLogs, overtimeDecisions, settings!)
             ).filter(r => r.date === yesterdayStr);

             if (records.length > 0) {
                csvReportGenerator.generateDailyReport(employees, records, yesterdayStr);
                pdfReportGenerator.generateDailyReport(employees, records, yesterdayStr);
                setAdminNotification({ id: Date.now(), msg: "Auto-Report", sub: `Generated for ${yesterdayStr}`, type: 'success' });
             }
          });

          localStorage.setItem('last_auto_report_run', todayStr);
        }
      }
    };

    const interval = setInterval(checkAutoReport, 60000); 
    return () => clearInterval(interval);

  }, [isAuthenticated, employees, settings]);


  const employeesWithStats = useMemo(() => {
    if (!settings) return employees;
    // Calculate stats based on currently loaded logs (which might be just today's if just opened)
    return attendanceCalculator.getAggregatedStats(employees, logs, overtimeDecisions, settings);
  }, [employees, logs, overtimeDecisions, settings]);

  const handleWipeLogs = async () => {
    setIsPurging(true);
    try {
      await dataService.wipeLogs();
      setLogs([]);
      setVisitorLogs([]);
      setInformalLogs([]);
      setOvertimeDecisions([]);
      setAdminNotification({ id: Date.now(), msg: "Database Purged", sub: "All logs wiped successfully", type: 'success' });
      setShowPurgeModal(false);
    } catch (e) {
      setAdminNotification({ id: Date.now(), msg: "Purge Failed", sub: "System error during wipe", type: 'error' });
    } finally {
      setIsPurging(false);
    }
  };

  const generateMonthlyReport = async (format: 'CSV' | 'PDF') => {
    if (!settings) return;
    setAdminNotification({ id: Date.now(), msg: "Generating...", sub: "Fetching full history", type: 'success' });
    
    // Ensure we have enough data for the report
    const fullLogs = await dataService.getLogs(5000);
    const fullRecords = employees.flatMap(emp => 
        attendanceCalculator.calculateEmployeeRecords(emp.id, fullLogs, overtimeDecisions, settings)
    );

    const targetEmployees = reportDept === 'ALL' 
      ? employees 
      : employees.filter(e => e.department === reportDept);

    if (targetEmployees.length === 0) {
      setAdminNotification({ id: Date.now(), msg: "No Data", sub: "No employees found in selection", type: 'error' });
      return;
    }

    const filteredRecords = fullRecords.filter(r => {
      const [d, m, y] = r.date.split('/').map(Number);
      return (m - 1) === reportMonth && y === reportYear;
    });

    const monthName = new Date(reportYear, reportMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
    const fullTitle = `${reportDept === 'ALL' ? 'Company' : reportDept} Attendance - ${monthName}`;

    if (format === 'CSV') {
      csvReportGenerator.generateMonthlyReport(targetEmployees, filteredRecords, fullTitle);
    } else {
      await pdfReportGenerator.generateMonthlyReport(targetEmployees, filteredRecords, fullTitle, reportMonth, reportYear);
    }
    
    setAdminNotification({ id: Date.now(), msg: "Report Generated", sub: `${format} Download started`, type: 'success' });
    setShowReportConfig(false);
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    try {
      await signInWithEmailAndPassword(auth, "admin@gmail.com", password);
      onLogin();
      setPassword(''); 
    } catch (error: any) {
      setAdminNotification({ id: Date.now(), msg: 'ACCESS DENIED', sub: 'Incorrect credentials', type: 'error' });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleAddEmployee = async (newEmp: any) => { try { const added = await dataService.addEmployee(newEmp); setEmployees(prev => [...prev, added]); setAdminNotification({ id: Date.now(), msg: "Employee Added", sub: `${added.name} saved`, type: 'success' }); } catch { setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed", type: 'error' }); } };
  const handleUpdateEmployee = async (id: string, updatedData: Partial<Employee>) => { try { await dataService.updateEmployee(id, updatedData); setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, ...updatedData } : emp)); setAdminNotification({ id: Date.now(), msg: "Updated", sub: "Success", type: 'success' }); } catch { setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed", type: 'error' }); } };
  const handleDeleteEmployee = async (id: string) => { try { await dataService.deleteEmployee(id); setEmployees(prev => prev.filter(emp => emp.id !== id)); setAdminNotification({ id: Date.now(), msg: "Deleted", sub: "Success", type: 'success' }); } catch { setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed", type: 'error' }); } };
  const handleResetDaysWorked = async (id: string) => { try { await dataService.resetDaysWorked(id); setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, totalDaysWorked: 0 } : emp)); setAdminNotification({ id: Date.now(), msg: "Reset", sub: "Success", type: 'success' }); } catch { setAdminNotification({ id: Date.now(), msg: "Error", sub: "Failed", type: 'error' }); } };
  
  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'ADD_STAFF': setActiveTab('EMPLOYEES'); break;
      case 'NOTICE': setActiveTab('NOTICES'); break;
      case 'REPORT': setShowReportConfig(true); break;
      case 'SYNC': loadFullHistory(); break;
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
    const todayStart = today.getTime();
    
    // Sort today's logs chronologically
    const todaysLogs = logs
      .filter(l => normalizeTs(l.timestamp) >= todayStart)
      .sort((a,b) => normalizeTs(a.timestamp) - normalizeTs(b.timestamp));

    const activeIds = new Set<string>();
    
    todaysLogs.forEach(log => {
      if (log.status === LogStatus.SUCCESS) {
        if (log.action === AttendanceAction.LOGIN) {
          activeIds.add(log.subjectId);
        } else if (log.action === AttendanceAction.LOGOUT) {
          activeIds.delete(log.subjectId);
        }
      }
    });
    
    return activeIds;
  }, [logs]);

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-slate-50 text-slate-900 overflow-hidden relative">
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
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-50 p-6">
          <div className="bg-white p-8 rounded-none border border-slate-200 shadow-xl w-full max-w-sm animate-in fade-in zoom-in duration-300">
            <div className="w-14 h-14 bg-slate-900 text-white rounded-none flex items-center justify-center mb-6 mx-auto shadow-md"><Lock size={24} /></div>
            <h2 className="text-xl font-black text-center text-slate-900 mb-1 uppercase tracking-tight">Admin Console</h2>
            <p className="text-[10px] font-bold uppercase tracking-widest text-center text-slate-500 mb-6">Restricted Access</p>
            <form onSubmit={handleAuth} className="space-y-4">
              <input 
                type="password" 
                placeholder="Password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-none focus:ring-2 focus:ring-black outline-none text-sm font-semibold transition-all" 
                disabled={isLoggingIn}
              />
              <button 
                disabled={isLoggingIn}
                className="w-full py-3 bg-black text-white rounded-none font-black uppercase text-[10px] shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-slate-900"
              >
                {isLoggingIn && <Loader2 className="animate-spin" size={14} />}
                Authenticate
              </button>
              <button type="button" onClick={() => window.location.hash = ''} className="w-full py-2 text-slate-400 hover:text-slate-900 font-black uppercase text-[9px] tracking-widest transition-colors">Return to Terminal</button>
            </form>
          </div>
        </div>
      ) : (
        <>
          {/* === MODALS === */}
          {showReportConfig && (
            <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/20 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-none w-full max-w-md p-8 shadow-2xl animate-in zoom-in border border-white/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-none flex items-center justify-center"><FileBarChart size={24} /></div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Intelligence Report</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Official Document Retrieval</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Month</label>
                      <select 
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-none text-xs font-black uppercase outline-none focus:ring-2 focus:ring-black"
                        value={reportMonth}
                        onChange={(e) => setReportMonth(parseInt(e.target.value))}
                      >
                        {Array.from({length: 12}, (_, i) => (
                          <option key={i} value={i}>{new Date(2000, i).toLocaleString('default', {month: 'long'})}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Year</label>
                      <input 
                        type="number" 
                        value={reportYear} 
                        onChange={(e) => setReportYear(parseInt(e.target.value))}
                        className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-none text-xs font-black outline-none focus:ring-2 focus:ring-black"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Department Scope</label>
                    <div className="relative">
                      <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <select 
                        className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-none text-xs font-black uppercase outline-none focus:ring-2 focus:ring-black appearance-none"
                        value={reportDept}
                        onChange={(e) => setReportDept(e.target.value)}
                      >
                        <option value="ALL">Entire Organization</option>
                        {departments.map(d => (
                          <option key={d.id} value={d.name}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-4">
                    <button onClick={() => generateMonthlyReport('CSV')} className="py-4 bg-white border border-slate-200 text-black rounded-none font-black uppercase text-[9px] tracking-widest hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"><Download size={12} /> Excel CSV</button>
                    <button onClick={() => generateMonthlyReport('PDF')} className="py-4 bg-black text-white rounded-none font-black uppercase text-[9px] tracking-widest shadow-md flex items-center justify-center gap-2 hover:bg-slate-900 transition-colors"><Download size={12} /> Adobe PDF</button>
                  </div>
                  <button onClick={() => setShowReportConfig(false)} className="w-full py-2 text-slate-400 hover:text-rose-500 font-black uppercase text-[8px] tracking-[0.2em] transition-colors mt-2">Close Parameters</button>
                </div>
              </div>
            </div>
          )}

          {showPurgeModal && (
            <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-red-50/90 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-none w-full max-w-sm p-8 shadow-2xl animate-in zoom-in border border-red-100">
                <div className="w-12 h-12 bg-red-50 text-red-600 rounded-none flex items-center justify-center mb-4 mx-auto"><ShieldAlert size={24}/></div>
                <h3 className="text-lg font-black text-center uppercase mb-6 text-slate-900">Confirm Purge</h3>
                <div className="space-y-4">
                  <p className="text-center text-xs font-bold text-gray-500 mb-4 uppercase tracking-widest">
                    Are you sure? This will delete ALL attendance history and cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setShowPurgeModal(false)} className="flex-1 py-3 bg-slate-100 text-slate-500 rounded-none font-black uppercase text-[10px] hover:bg-slate-200 transition-colors">Cancel</button>
                    <button 
                      onClick={handleWipeLogs} 
                      disabled={isPurging} 
                      className="flex-1 py-3 bg-red-600 text-white rounded-none font-black uppercase text-[10px] shadow-md hover:bg-red-700 transition-colors"
                    >
                      {isPurging ? 'Clearing...' : 'Yes, Delete All'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* === MAIN LAYOUT === */}
          
          <MobileTopNav activeTab={activeTab} onTabChange={setActiveTab} />

          <div className="hidden md:flex h-screen sticky top-0 left-0 z-20 shadow-xl bg-slate-900 w-72 flex-shrink-0">
            <AdminSidebar activeTab={activeTab} onTabChange={(t) => setActiveTab(t)} onExit={onLogout} />
          </div>
          
          <main className="flex-grow flex flex-col h-full overflow-hidden bg-slate-50 relative">
            
            <header className="hidden md:flex px-8 py-4 justify-between items-center bg-white border-b border-slate-200 z-10 sticky top-0">
              <div className="flex flex-col">
                <h2 className="text-xl font-black uppercase tracking-tight text-slate-900">{activeTab.replace('_', ' ')}</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Administration Console</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-3 py-1.5 rounded-none">
                  {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
                {/* Only show loader if we are doing a hard refresh */}
                <button onClick={loadFullHistory} className={`p-2 border border-slate-200 bg-white rounded-none hover:bg-slate-50 transition-all ${isRefreshing ? 'text-blue-600' : 'text-slate-400'}`}>
                  <RefreshCcw size={16} className={isRefreshing ? 'animate-spin' : ''} />
                </button>
              </div>
            </header>

            <div className="flex-grow overflow-auto p-4 md:p-8">
              <div className="max-w-7xl mx-auto space-y-6">
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
                    onRefresh={() => {}} // Live updates handle this
                  />
                )}

                {activeTab === 'OUTSIDE_WORK' && <OutsideWork employees={employees} departments={departments} onRefresh={() => {}} />}
                {activeTab === 'STAFF_LOGS' && (
                  <StaffLogs
                    logs={logs}
                    employees={employees}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    activeFilter={activeFilter}
                    setActiveFilter={setActiveFilter}
                    onReportOpen={() => setShowReportConfig(true)}
                    onWipeLogs={() => setShowPurgeModal(true)}
                    highlightedId={highlightedId}
                    handleSuggestionClick={handleSuggestionClick}
                    onRefresh={() => handleDateChange(selectedLogsDate)}
                    selectedDate={selectedLogsDate}
                    onDateChange={handleDateChange}
                  />
                )}
                {activeTab === 'GATE_LOG' && <GateLog logs={informalLogs} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onReportOpen={() => setShowReportConfig(true)} />}
                {activeTab === 'VISITOR_LOGS' && <VisitorLogs logs={visitorLogs} employees={employees} searchQuery={searchQuery} setSearchQuery={setSearchQuery} onReportOpen={() => setShowReportConfig(true)} highlightedId={highlightedId} handleSuggestionClick={handleSuggestionClick} onRefresh={() => {}} />}
                {activeTab === 'FREQUENT_VISITORS' && <FrequentVisitors frequentVisitors={frequentVisitors} onAddFrequentVisitor={handleAddFrequentVisitor} onUpdateFrequentVisitor={handleUpdateFrequentVisitor} onDeleteFrequentVisitor={handleDeleteFrequentVisitor} />}
                {activeTab === 'NOTICES' && <Notices notices={notices} onAdd={handleAddNotice} onToggle={(id, active) => handleUpdateNotice(id, { isActive: active })} onDelete={handleDeleteNotice} />}
                {activeTab === 'SETTINGS' && <Settings settings={settings} setSettings={setSettings} departments={departments} employees={employees} logs={logs} onAddDepartment={handleAddDepartment} onUpdateDepartment={handleUpdateDepartment} onDeleteDepartment={handleDeleteDepartment} onSave={handleSaveSettings} onRefresh={loadFullHistory} />}
              </div>
            </div>

            <ReportModal isOpen={isReportOpen} onClose={() => setIsReportOpen(false)} title={activeTab} data={filteredReportLogs} employees={employees} logs={logs} />
          </main>
        </>
      )}
    </div>
  );
};

export default AdminDashboard;
