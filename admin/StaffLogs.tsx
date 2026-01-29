
import React, { useMemo, useState, useEffect } from 'react';
import { Search, ArrowRight, Download, CheckCircle2, Trash2, LogIn, LogOut, Clock, Calendar, Cpu, AlertTriangle, Edit3, UserCheck, X, CheckSquare, Square, Loader2 } from 'lucide-react';
import { AttendanceLog, AttendanceSession, Employee, AttendanceAction, LogStatus } from '../types';
import { dataService } from '../services/dataService';

interface StaffLogsProps {
  logs: AttendanceLog[];
  employees: Employee[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  activeFilter: 'ALL' | 'EARLY' | 'LATE';
  setActiveFilter: (f: 'ALL' | 'EARLY' | 'LATE') => void;
  onReportOpen: () => void;
  onWipeLogs: () => void;
  highlightedId: string | null;
  handleSuggestionClick: (name: string) => void;
  onRefresh?: () => void;
}

type DateRange = 'TODAY' | 'YESTERDAY' | 'THIS_WEEK' | 'THIS_MONTH' | 'ALL';
type LogStatusFilter = 'ALL' | 'ON_SITE' | 'LOGGED_OUT';

const StaffLogs: React.FC<StaffLogsProps> = ({ 
  logs, 
  employees,
  searchQuery, 
  setSearchQuery, 
  onReportOpen,
  onWipeLogs,
  handleSuggestionClick,
  onRefresh
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>('ALL');
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>('ALL');
  
  // Batch Selection State
  const [selectedLogIds, setSelectedLogIds] = useState<Set<string>>(new Set());

  // Delete Modal State
  const [deleteSession, setDeleteSession] = useState<AttendanceSession | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState("");

  // Edit Modal State
  const [editingSession, setEditingSession] = useState<AttendanceSession | null>(null);
  const [editTimeIn, setEditTimeIn] = useState('');
  const [editTimeOut, setEditTimeOut] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const sessions = useMemo(() => {
    const allSessions = dataService.buildSessions(logs, employees);
    
    // Enrich session with logout source
    const sessionsWithSource = allSessions.map(sess => {
        const logoutLog = logs.find(l => 
            String(l.subjectId).trim() === sess.subjectId && 
            l.action === 'LOGOUT' && 
            new Date(l.timestamp).toLocaleDateString('en-GB') === sess.date &&
            l.source === 'AUTO_SYSTEM_CRON'
        );
        return { ...sess, isAutoLogout: !!logoutLog };
    });

    return sessionsWithSource.filter(sess => sess.type === 'EMPLOYEE');
  }, [logs, employees]);

  const filteredSessions = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfWeek = startOfToday - (now.getDay() * 86400000);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return sessions.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase());
      
      let matchDate = true;
      const [d, m, y] = s.date.split('/').map(Number);
      const sessTime = new Date(y, m - 1, d).getTime();
      
      if (dateRange === 'TODAY') matchDate = sessTime >= startOfToday;
      else if (dateRange === 'YESTERDAY') matchDate = sessTime >= startOfYesterday && sessTime < startOfToday;
      else if (dateRange === 'THIS_WEEK') matchDate = sessTime >= startOfWeek;
      else if (dateRange === 'THIS_MONTH') matchDate = sessTime >= startOfMonth;

      let matchStatus = true;
      if (statusFilter === 'ON_SITE') matchStatus = s.timeOut === 'ONSITE';
      if (statusFilter === 'LOGGED_OUT') matchStatus = s.timeOut !== 'ONSITE';

      return matchSearch && matchDate && matchStatus;
    });
  }, [sessions, searchQuery, dateRange, statusFilter]);

  // --- SELECTION LOGIC ---
  const toggleSelectAll = () => {
    if (selectedLogIds.size === getAllVisibleLogIds().length && getAllVisibleLogIds().length > 0) {
      setSelectedLogIds(new Set());
    } else {
      const allIds = getAllVisibleLogIds();
      setSelectedLogIds(new Set(allIds));
    }
  };

  const getAllVisibleLogIds = () => {
    const ids: string[] = [];
    filteredSessions.forEach(s => {
      if (s.loginLogId) ids.push(s.loginLogId);
      if (s.logoutLogId) ids.push(s.logoutLogId);
    });
    return ids;
  };

  const toggleSessionSelection = (session: AttendanceSession) => {
    const newSet = new Set(selectedLogIds);
    const idsToToggle = [];
    if (session.loginLogId) idsToToggle.push(session.loginLogId);
    if (session.logoutLogId) idsToToggle.push(session.logoutLogId);

    // If any part of the session is selected, we deselect all parts. Otherwise select all.
    const isSelected = idsToToggle.some(id => newSet.has(id));

    if (isSelected) {
      idsToToggle.forEach(id => newSet.delete(id));
    } else {
      idsToToggle.forEach(id => newSet.add(id));
    }
    setSelectedLogIds(newSet);
  };

  const isSessionSelected = (session: AttendanceSession) => {
    if (!session.loginLogId) return false;
    return selectedLogIds.has(session.loginLogId);
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Delete ${selectedLogIds.size} selected logs? This cannot be undone.`)) return;
    setIsDeleting(true);
    setDeleteProgress("Starting...");
    
    try {
        const result = await dataService.batchDeleteLogs(Array.from(selectedLogIds), (count, total) => {
            setDeleteProgress(`Deleting ${count} / ${total}...`);
        });
        
        // Only clear if successful
        if (result.count > 0) {
            setSelectedLogIds(new Set());
            if (onRefresh) onRefresh();
        }
    } catch (e: any) {
        console.error(e);
        alert(`Batch delete failed: ${e.message || "Unknown Error"}`);
    } finally {
        setIsDeleting(false);
        setDeleteProgress("");
    }
  };

  // --- EXISTING ACTIONS ---

  const handleDelete = async () => {
    if (!deleteSession) return;
    setIsDeleting(true);
    try {
        if (deleteSession.loginLogId) await dataService.deleteLog(deleteSession.loginLogId, 'EMPLOYEE');
        if (deleteSession.logoutLogId) await dataService.deleteLog(deleteSession.logoutLogId, 'EMPLOYEE');
        
        setTimeout(() => {
            if (onRefresh) onRefresh();
        }, 500);
    } catch (e) {
        alert("Failed to delete log");
    } finally {
        setIsDeleting(false);
        setDeleteSession(null);
        if (onRefresh) onRefresh();
    }
  };

  const handleEditClick = (session: AttendanceSession) => {
    setEditingSession(session);
    setEditTimeIn(session.timeIn);
    setEditTimeOut(session.timeOut === 'ONSITE' ? '' : session.timeOut);
  };

  const saveEdit = async () => {
    if (!editingSession) return;
    setIsSaving(true);
    try {
        const [d, m, y] = editingSession.date.split('/').map(Number);
        const baseDate = new Date(y, m - 1, d);

        if (editTimeIn && editingSession.loginLogId) {
            const [h, min] = editTimeIn.split(':').map(Number);
            const newTs = new Date(baseDate);
            newTs.setHours(h, min, 0, 0);
            await dataService.updateLogTimestamp(editingSession.loginLogId, newTs.getTime());
        }

        if (editTimeOut) {
            const [h, min] = editTimeOut.split(':').map(Number);
            const newTs = new Date(baseDate);
            newTs.setHours(h, min, 0, 0);

            if (editingSession.logoutLogId) {
                await dataService.updateLogTimestamp(editingSession.logoutLogId, newTs.getTime());
            } else {
                await dataService.addLog({
                    subjectId: editingSession.subjectId,
                    subjectName: editingSession.name,
                    timestamp: newTs.getTime(),
                    action: AttendanceAction.LOGOUT,
                    status: LogStatus.SUCCESS,
                    type: 'EMPLOYEE',
                    confidence: 1.0,
                    source: 'ADMIN_MANUAL_EDIT'
                });
            }
        } else if (editingSession.logoutLogId && !editTimeOut) {
            await dataService.deleteLog(editingSession.logoutLogId, 'EMPLOYEE');
        }

        setTimeout(() => { if (onRefresh) onRefresh(); }, 500);
    } catch (e) {
        alert("Update Failed");
    } finally {
        setIsSaving(false);
        setEditingSession(null);
        if (onRefresh) onRefresh();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      
      {/* EDIT MODAL */}
      {editingSession && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in border border-slate-100">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <h3 className="text-lg font-black uppercase text-slate-900">Edit Log Entry</h3>
                    <button onClick={() => setEditingSession(null)} className="p-2 bg-gray-100 rounded-full hover:bg-gray-200"><X size={16}/></button>
                </div>
                
                <div className="text-center mb-6">
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{editingSession.date}</p>
                    <h4 className="text-xl font-black uppercase text-black">{editingSession.name}</h4>
                </div>

                <div className="space-y-4">
                    <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                        <label className="text-[10px] font-black uppercase text-emerald-800 block mb-2 tracking-widest">Time In</label>
                        <input 
                            type="time" 
                            value={editTimeIn} 
                            onChange={e => setEditTimeIn(e.target.value)}
                            className="w-full p-3 bg-white border border-emerald-200 rounded-xl font-black text-emerald-600 text-lg outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>

                    <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100">
                        <label className="text-[10px] font-black uppercase text-orange-800 block mb-2 tracking-widest">Time Out</label>
                        <input 
                            type="time" 
                            value={editTimeOut} 
                            onChange={e => setEditTimeOut(e.target.value)}
                            className="w-full p-3 bg-white border border-orange-200 rounded-xl font-black text-orange-600 text-lg outline-none focus:ring-2 focus:ring-orange-500"
                        />
                        <p className="text-[9px] text-orange-400 font-bold mt-2 uppercase tracking-wide">Leave empty to keep "On Site"</p>
                    </div>
                </div>

                <div className="flex gap-3 mt-8">
                    <button 
                        onClick={saveEdit} 
                        disabled={isSaving}
                        className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase text-[10px] shadow-xl hover:bg-gray-900 transition-all flex items-center justify-center gap-2"
                    >
                        {isSaving ? 'Updating...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteSession && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in border border-red-100">
                <div className="w-14 h-14 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mb-6 mx-auto">
                    <Trash2 size={24}/>
                </div>
                <h3 className="text-lg font-black text-center uppercase mb-2 text-slate-900">Delete Record?</h3>
                <p className="text-center text-xs font-medium text-slate-500 mb-6">
                    This will permanently remove the attendance entry for <span className="text-black font-bold">{deleteSession.name}</span> on <span className="text-black font-bold">{deleteSession.date}</span>.
                </p>
                <div className="flex gap-3">
                    <button 
                        onClick={() => setDeleteSession(null)} 
                        disabled={isDeleting}
                        className="flex-1 py-4 bg-gray-100 text-slate-600 rounded-xl font-black uppercase text-[10px] hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleDelete} 
                        disabled={isDeleting}
                        className="flex-1 py-4 bg-red-600 text-white rounded-xl font-black uppercase text-[10px] shadow-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                    >
                        {isDeleting ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                </div>
            </div>
        </div>
      )}

      <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center justify-between bg-white border border-slate-200 p-2 rounded-none">
        <div className="flex flex-col md:flex-row gap-2 flex-grow">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
            <input 
              placeholder="Search identity..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
              className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-none text-xs font-bold focus:border-black outline-none transition-all"
            />
          </div>

          <div className="flex bg-slate-100 p-1 rounded-none overflow-x-auto no-scrollbar border border-slate-100">
            {['ALL', 'TODAY', 'YESTERDAY', 'WEEK', 'MONTH'].map(range => (
              <button 
                key={range}
                onClick={() => setDateRange(range === 'WEEK' ? 'THIS_WEEK' : range === 'MONTH' ? 'THIS_MONTH' : range as DateRange)}
                className={`px-4 py-2 rounded-none text-[9px] font-black uppercase tracking-tight transition-all flex-shrink-0 ${dateRange === (range === 'WEEK' ? 'THIS_WEEK' : range === 'MONTH' ? 'THIS_MONTH' : range) ? 'bg-black text-white' : 'text-slate-400 hover:text-black'}`}
              >
                {range}
              </button>
            ))}
          </div>

          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value as LogStatusFilter)}
            className="px-4 py-2 bg-slate-50 border border-slate-100 rounded-none text-[10px] font-black uppercase outline-none focus:ring-2 focus:ring-black"
          >
            <option value="ALL">All Status</option>
            <option value="ON_SITE">Active On-Site</option>
            <option value="LOGGED_OUT">Logged Out</option>
          </select>
        </div>

        <div className="flex gap-2">
          {selectedLogIds.size > 0 ? (
             <button 
               onClick={handleBatchDelete} 
               disabled={isDeleting}
               className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-red-600 text-white rounded-none text-[9px] font-black uppercase tracking-[0.1em] transition-all hover:bg-red-700 shadow-md disabled:opacity-50 min-w-[160px]"
             >
                {isDeleting ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {deleteProgress || 'Deleting...'}
                  </>
                ) : (
                  <>
                    <Trash2 size={14} /> Delete ({selectedLogIds.size})
                  </>
                )}
             </button>
          ) : (
             <button onClick={onReportOpen} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-black text-white rounded-none text-[9px] font-black uppercase tracking-[0.1em] transition-all hover:bg-slate-800">
                <Download size={14}/> Report
             </button>
          )}
          <button onClick={onWipeLogs} className="p-3 bg-white border border-slate-200 text-rose-600 rounded-none hover:bg-rose-50 transition-all">
            <AlertTriangle size={16}/>
          </button>
        </div>
      </div>

      {/* DESKTOP TABLE VIEW */}
      <div className="hidden md:block bg-white border border-slate-200 rounded-none overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-100">
            <tr>
              <th className="w-10 px-4 py-4 text-center">
                 <button onClick={toggleSelectAll} className="text-slate-400 hover:text-black transition-colors">
                    {selectedLogIds.size > 0 && selectedLogIds.size === getAllVisibleLogIds().length ? <CheckSquare size={16} /> : <Square size={16} />}
                 </button>
              </th>
              <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Date</th>
              <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest">Identity</th>
              <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">In</th>
              <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-center">Out</th>
              <th className="px-6 py-4 text-[9px] font-black text-slate-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredSessions.map((sess: any, idx) => {
              const isSelected = isSessionSelected(sess);
              return (
                <tr key={idx} className={`hover:bg-slate-50 transition-colors group ${isSelected ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-4 py-4 text-center">
                     <button onClick={() => toggleSessionSelection(sess)} className={`transition-colors ${isSelected ? 'text-blue-600' : 'text-slate-300 hover:text-slate-500'}`}>
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                     </button>
                  </td>
                  <td className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase">{sess.date}</td>
                  <td className="px-6 py-4">
                    <div className="font-black text-slate-900 text-[11px] uppercase tracking-tight">{sess.name}</div>
                    <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">{sess.department}</div>
                  </td>
                  <td className="px-6 py-4 text-center font-black text-emerald-600 text-xs">{sess.timeIn}</td>
                  <td className={`px-6 py-4 text-center font-black text-xs ${sess.timeOut === 'ONSITE' ? 'text-orange-500' : 'text-slate-900'}`}>
                      {sess.timeOut}
                      {sess.isAutoLogout && (
                          <div className="text-[8px] text-red-500 font-black uppercase tracking-tighter flex items-center justify-center gap-1 mt-1">
                              <Cpu size={8}/> System Auto
                          </div>
                      )}
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end items-center gap-3">
                    <span className={`px-2 py-0.5 rounded-none border text-[8px] font-black uppercase ${sess.timeOut === 'ONSITE' ? 'border-orange-200 text-orange-600' : 'border-emerald-200 text-emerald-600'}`}>
                      {sess.timeOut === 'ONSITE' ? 'Active' : 'Logged'}
                    </span>
                    
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                          onClick={() => handleEditClick(sess)}
                          className="p-2 text-slate-400 hover:text-black hover:bg-slate-100 rounded-lg transition-all"
                          title="Edit Times"
                      >
                          <Edit3 size={14}/>
                      </button>
                      <button 
                          onClick={() => setDeleteSession(sess)}
                          className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          title="Delete Entry"
                      >
                          <Trash2 size={14}/>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE RESPONSIVE LIST */}
      <div className="md:hidden space-y-3">
        {filteredSessions.map((sess: any, idx) => (
          <div key={idx} className="bg-white border border-slate-200 p-4 rounded-none space-y-4 shadow-none">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight leading-none">{sess.name}</h4>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">{sess.department}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase flex items-center justify-end gap-1"><Calendar size={10} /> {sess.date}</p>
                <div className="flex items-center justify-end gap-2 mt-2">
                    <span className={`inline-block px-2 py-0.5 border text-[7px] font-black uppercase ${sess.timeOut === 'ONSITE' ? 'border-orange-200 text-orange-600' : 'border-emerald-200 text-emerald-600'}`}>
                        {sess.timeOut === 'ONSITE' ? 'Active On-Site' : 'Clocked Out'}
                    </span>
                    <button onClick={() => handleEditClick(sess)} className="p-1.5 bg-gray-100 rounded-md"><Edit3 size={12}/></button>
                    <button onClick={() => setDeleteSession(sess)} className="p-1.5 bg-red-50 text-red-500 rounded-md"><Trash2 size={12}/></button>
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 border border-emerald-100 p-3 flex flex-col items-center justify-center rounded-none">
                <LogIn size={14} className="text-emerald-600 mb-1" />
                <span className="text-[8px] font-black text-emerald-800 uppercase tracking-widest text-center">In</span>
                <span className="text-sm font-black text-emerald-700">{sess.timeIn}</span>
              </div>
              <div className={`${sess.timeOut === 'ONSITE' ? 'bg-orange-50 border-orange-100' : 'bg-slate-50 border-slate-100'} border p-3 flex flex-col items-center justify-center rounded-none`}>
                <LogOut size={14} className={sess.timeOut === 'ONSITE' ? 'text-orange-500 mb-1' : 'text-slate-400 mb-1'} />
                <span className={`text-[8px] font-black uppercase tracking-widest text-center ${sess.timeOut === 'ONSITE' ? 'text-orange-800' : 'text-slate-500'}`}>Out</span>
                <span className={`text-sm font-black ${sess.timeOut === 'ONSITE' ? 'text-orange-600 animate-pulse' : 'text-slate-700'}`}>{sess.timeOut}</span>
                {sess.isAutoLogout && (
                    <span className="text-[7px] text-red-500 font-black uppercase mt-1 tracking-tighter bg-red-50 px-1">AUTO-LOGOUT</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {filteredSessions.length === 0 && (
        <div className="py-24 text-center text-slate-300 font-black uppercase tracking-[0.2em] italic border-2 border-dashed border-slate-100 rounded-none">
          Zero logs found
        </div>
      )}
    </div>
  );
};

export default StaffLogs;
