
import React, { useMemo, useState } from 'react';
import { Search, ArrowRight, Download, CheckCircle2, LogIn, LogOut, UserCheck } from 'lucide-react';
import { AttendanceLog, AttendanceSession, Employee } from '../types';
import { dataService } from '../services/dataService';

interface VisitorLogsProps {
  logs: AttendanceLog[];
  employees: Employee[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onReportOpen: () => void;
  highlightedId: string | null;
  handleSuggestionClick: (name: string) => void;
  onRefresh: () => void;
}

const VisitorLogs: React.FC<VisitorLogsProps> = ({ 
  logs, 
  employees,
  searchQuery, 
  setSearchQuery, 
  onReportOpen,
  handleSuggestionClick,
  onRefresh
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);

  const sessions = useMemo(() => {
    const allSessions = dataService.buildSessions(logs, employees);
    return allSessions.filter(sess => sess.type === 'VISITOR');
  }, [logs, employees]);

  const activeVisitors = useMemo(() => {
    return sessions.filter(s => s.timeOut === 'ONSITE');
  }, [sessions]);

  const visitorHistory = useMemo(() => {
    return sessions.filter(s => s.timeOut !== 'ONSITE');
  }, [sessions]);

  const filteredHistory = useMemo(() => {
    return visitorHistory.filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [visitorHistory, searchQuery]);

  const suggestions = useMemo(() => {
    if (!searchQuery) return [];
    return visitorHistory
      .map(s => s.name)
      .filter((v, i, a) => a.indexOf(v) === i)
      .filter(name => name.toLowerCase().includes(searchQuery.toLowerCase()))
      .slice(0, 5);
  }, [searchQuery, visitorHistory]);

  const handleCheckout = async (visitorId: string, visitorName: string) => {
    await dataService.checkoutVisitor(visitorId, visitorName);
    onRefresh();
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">

      {/* Active Visitors Section */}
      <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm">
        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-black text-black uppercase tracking-tight">Active Visitors ({activeVisitors.length})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-8 py-4 text-[10px] font-black text-black uppercase tracking-widest">Visitor Name</th>
                <th className="px-8 py-4 text-[10px] font-black text-black uppercase tracking-widest text-center w-40">Entry Time</th>
                <th className="px-8 py-4 text-[10px] font-black text-black uppercase tracking-widest text-right w-40">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeVisitors.map((sess, idx) => (
                <tr key={idx}>
                  <td className="px-8 py-4">
                    <div className="text-sm font-bold text-black uppercase tracking-tight">{sess.name}</div>
                  </td>
                  <td className="px-8 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <LogIn size={14} className="text-indigo-500" />
                      <span className="text-sm font-black text-slate-900">{sess.timeIn}</span>
                    </div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <button onClick={() => handleCheckout(sess.subjectId, sess.name)} className="px-4 py-2 bg-red-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-red-600 transition-all">
                      Checkout
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {activeVisitors.length === 0 && (
            <div className="py-16 text-center text-gray-300 font-black uppercase tracking-[0.3em] italic bg-slate-50/20">
              No Active Visitors
            </div>
          )}
        </div>
      </div>

      {/* Visitor History Section */}
      <div>
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between mb-6">
          <div className="flex flex-col md:flex-row gap-4 items-stretch">
            <div className="relative w-full md:w-80">
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><Search size={16}/></div>
              <input
                placeholder="Search History..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-black outline-none transition-all"
              />
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl z-[60] overflow-hidden">
                  {suggestions.map(s => (
                    <button key={s} onClick={() => { handleSuggestionClick(s); setShowSuggestions(false); }} className="w-full px-6 py-3 text-left text-xs font-bold uppercase tracking-tight hover:bg-emerald-50 hover:text-emerald-700 border-b border-gray-50 flex items-center justify-between">
                      {s} <ArrowRight size={12}/>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-5 py-2.5 bg-gray-50 rounded-xl text-[10px] font-black uppercase text-black flex items-center gap-2 border border-gray-100">
              <UserCheck size={14} className="text-black" /> Total Visitors: {visitorHistory.length}
            </div>
            <button onClick={onReportOpen} className="flex items-center gap-2 px-8 py-3 bg-black text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:scale-[1.02] transition-all">
              <Download size={14}/> Download History
            </button>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-x-auto">
          <table className="w-full text-left min-w-[800px]">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest w-32">Date</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Visitor Identity</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center w-40">Entry</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center w-40">Exit</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredHistory.map((sess, idx) => (
                <tr key={idx} className={`transition-all duration-300 hover:bg-slate-50/50`}>
                  <td className="px-8 py-5">
                     <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">{sess.date}</div>
                  </td>
                  <td className="px-8 py-5">
                    <div className="text-sm font-bold text-black uppercase tracking-tight">{sess.name}</div>
                  </td>
                  <td className="px-8 py-5 text-center">
                     <div className="flex flex-col items-center gap-1">
                        <LogIn size={14} className="text-indigo-500" />
                        <span className="text-sm font-black text-slate-900">{sess.timeIn}</span>
                     </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                     <div className="flex flex-col items-center gap-1">
                        <LogOut size={14} className="text-orange-600" />
                        <span className="text-sm font-black text-slate-900">{sess.timeOut}</span>
                     </div>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-1.5 text-emerald-600 font-black text-[10px] uppercase">
                      <CheckCircle2 size={14} /> Checked Out
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredHistory.length === 0 && (
            <div className="py-24 text-center text-gray-300 font-black uppercase tracking-[0.3em] italic bg-slate-50/20">
              No Matching Visitor History
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisitorLogs;
