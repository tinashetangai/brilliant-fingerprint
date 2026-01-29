
import React, { useMemo, useState } from 'react';
import { Search, ArrowRight, Download, CheckCircle2, LogIn, LogOut, UserCheck, Calendar, User } from 'lucide-react';
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
      <div className="bg-white border border-gray-100 rounded-none shadow-none">
        <div className="px-8 py-5 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-black text-black uppercase tracking-tight">Active Visitors ({activeVisitors.length})</h3>
        </div>
        
        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50">
              <tr>
                <th className="px-8 py-4 text-[10px] font-black text-black uppercase tracking-widest">Visitor Name</th>
                <th className="px-8 py-4 text-[10px] font-black text-black uppercase tracking-widest text-center">Entry Time</th>
                <th className="px-8 py-4 text-[10px] font-black text-black uppercase tracking-widest text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {activeVisitors.map((sess, idx) => (
                <tr key={idx}>
                  <td className="px-8 py-4">
                    <div className="text-sm font-bold text-black uppercase tracking-tight">{sess.name}</div>
                  </td>
                  <td className="px-8 py-4 text-center">
                    <div className="flex items-center justify-center gap-2 text-indigo-600 font-black text-sm">
                      <LogIn size={14} /> {sess.timeIn}
                    </div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <button onClick={() => handleCheckout(sess.subjectId, sess.name)} className="px-4 py-2 bg-red-600 text-white rounded-none text-[10px] font-black uppercase tracking-widest shadow-none hover:bg-red-700 transition-all">
                      Checkout
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View Active */}
        <div className="md:hidden p-4 space-y-3">
           {activeVisitors.map((sess, idx) => (
             <div key={idx} className="p-4 border border-slate-100 bg-slate-50 rounded-none flex justify-between items-center">
                <div>
                  <h4 className="font-black text-slate-900 text-sm uppercase">{sess.name}</h4>
                  <p className="text-[10px] text-indigo-600 font-bold uppercase mt-1 flex items-center gap-1"><LogIn size={10}/> Entered: {sess.timeIn}</p>
                </div>
                <button onClick={() => handleCheckout(sess.subjectId, sess.name)} className="px-4 py-2 bg-red-600 text-white rounded-none text-[10px] font-black uppercase">Out</button>
             </div>
           ))}
        </div>

        {activeVisitors.length === 0 && (
          <div className="py-16 text-center text-gray-300 font-black uppercase tracking-[0.3em] italic bg-slate-50/20">
            No Active Visitors
          </div>
        )}
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
                className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-none text-sm font-semibold focus:border-black outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={onReportOpen} className="flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-black text-white rounded-none text-[10px] font-black uppercase tracking-widest shadow-none hover:bg-slate-800 transition-all">
              <Download size={14}/> Download History
            </button>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block bg-white border border-gray-100 rounded-none shadow-none overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50/50 border-b border-gray-100">
              <tr>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest w-32">Date</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Visitor Identity</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center">Entry</th>
                <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-center">Exit</th>
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
                  <td className="px-8 py-5 text-center font-black text-indigo-600 text-sm">{sess.timeIn}</td>
                  <td className="px-8 py-5 text-center font-black text-slate-900 text-sm">{sess.timeOut}</td>
                  <td className="px-8 py-5 text-right">
                    <span className="px-2 py-0.5 border border-emerald-200 text-emerald-600 font-black text-[8px] uppercase">Logged</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile View History */}
        <div className="md:hidden space-y-3">
          {filteredHistory.map((sess, idx) => (
            <div key={idx} className="bg-white border border-slate-200 p-4 rounded-none space-y-4 shadow-none">
              <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                <div>
                  <h4 className="font-black text-slate-900 text-sm uppercase tracking-tight leading-none">{sess.name}</h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Visitor Registry</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase flex items-center justify-end gap-1"><Calendar size={10} /> {sess.date}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-indigo-50 border border-indigo-100 p-3 flex flex-col items-center justify-center rounded-none">
                  <LogIn size={14} className="text-indigo-600 mb-1" />
                  <span className="text-[8px] font-black text-indigo-800 uppercase tracking-widest text-center">Entry</span>
                  <span className="text-sm font-black text-indigo-700">{sess.timeIn}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 p-3 flex flex-col items-center justify-center rounded-none">
                  <LogOut size={14} className="text-slate-400 mb-1" />
                  <span className="text-[8px] font-black uppercase tracking-widest text-center text-slate-500">Exit</span>
                  <span className="text-sm font-black text-slate-700">{sess.timeOut}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredHistory.length === 0 && (
          <div className="py-24 text-center text-gray-300 font-black uppercase tracking-[0.3em] italic bg-slate-50/20">
            No Matching Visitor History
          </div>
        )}
      </div>
    </div>
  );
};

export default VisitorLogs;
