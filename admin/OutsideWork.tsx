import React, { useState, useEffect, useMemo } from 'react';
import { Search, Truck, Clock, UserMinus, Plus, CheckCircle, X, Users, Calendar, Briefcase, ChevronRight, Minus } from 'lucide-react';
import { Employee, Department } from '../types';
import { dataService } from '../services/dataService';

interface OutsideWorkProps {
  employees: Employee[];
  departments: Department[];
  onRefresh: () => void;
}

const OutsideWork: React.FC<OutsideWorkProps> = ({ employees, departments, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'ACTIVE' | 'DEPLOY'>('ACTIVE');
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [searchQuery, setSearchQuery] = useState('');
  
  // Deployment State
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deployDays, setDeployDays] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal State
  const [actionModal, setActionModal] = useState<{ type: 'EXTEND' | 'RECALL', employee: Employee } | null>(null);
  const [extensionDays, setExtensionDays] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // --- DERIVED LISTS ---
  const outsideWorkers = useMemo(() => {
    return employees.filter(e => e.outsideWorkUntil && e.outsideWorkUntil > currentTime);
  }, [employees, currentTime]);

  const availableWorkers = useMemo(() => {
    return employees.filter(e => !e.outsideWorkUntil || e.outsideWorkUntil <= currentTime);
  }, [employees, currentTime]);

  const filteredList = useMemo(() => {
    const source = activeTab === 'ACTIVE' ? outsideWorkers : availableWorkers;
    return source.filter(e => 
      e.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      e.department.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeTab, outsideWorkers, availableWorkers, searchQuery]);

  // --- ACTIONS ---
  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleDeploy = async () => {
    if (selectedIds.size === 0) return;
    setIsSubmitting(true);
    try {
      const payload = Array.from(selectedIds).map((id: string) => ({ employeeId: id, days: deployDays }));
      await dataService.setOutsideWork(payload);
      setSelectedIds(new Set());
      setDeployDays(1);
      setActiveTab('ACTIVE');
      onRefresh();
    } catch (err) {
      alert("Deployment Failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalAction = async () => {
    if (!actionModal) return;
    setIsLoading(true);
    try {
      if (actionModal.type === 'RECALL') {
        await dataService.recallEmployeeFromOutsideWork(actionModal.employee.id);
      } else {
        await dataService.extendOutsideWork(actionModal.employee.id, extensionDays);
      }
      setActionModal(null);
      setExtensionDays(1);
      onRefresh();
    } catch (e) {
      alert("Action Failed");
    } finally {
      setIsLoading(false);
    }
  };

  const getCountdown = (until: number) => {
    const diff = until - currentTime;
    if (diff <= 0) return "Expired";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hours}h`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20 md:pb-0">
      
      {/* --- HEADER & TABS --- */}
      <div className="bg-white border border-gray-200 rounded-3xl p-2 shadow-sm flex flex-col md:flex-row gap-2 items-center justify-between">
        <div className="flex bg-gray-100 p-1 rounded-2xl w-full md:w-auto">
          <button 
            onClick={() => setActiveTab('ACTIVE')}
            className={`flex-1 md:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'ACTIVE' ? 'bg-white text-black shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Truck size={16} /> Active Missions
            <span className={`px-2 py-0.5 rounded-md text-[10px] ${activeTab === 'ACTIVE' ? 'bg-black text-white' : 'bg-gray-200 text-gray-500'}`}>
              {outsideWorkers.length}
            </span>
          </button>
          <button 
            onClick={() => setActiveTab('DEPLOY')}
            className={`flex-1 md:flex-none px-6 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${activeTab === 'DEPLOY' ? 'bg-black text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Plus size={16} /> New Deployment
          </button>
        </div>

        <div className="relative w-full md:w-72 px-2 md:px-0">
          <Search className="absolute left-6 md:left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
          <input 
            placeholder="Search Personnel..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:border-gray-200 focus:bg-white rounded-2xl text-sm font-bold outline-none transition-all" 
          />
        </div>
      </div>

      {/* --- CONTENT AREA --- */}
      <div className="bg-white border border-gray-100 rounded-[2.5rem] shadow-sm overflow-hidden min-h-[60vh] flex flex-col">
        
        {activeTab === 'ACTIVE' && (
          <div className="p-6 md:p-8">
            {filteredList.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-300">
                <Truck size={48} className="mb-4 opacity-20" />
                <p className="font-black uppercase tracking-widest text-xs">No Active Assignments</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredList.map(emp => (
                  <div key={emp.id} className="p-5 border border-gray-100 rounded-3xl bg-gray-50/50 hover:bg-white hover:shadow-lg transition-all group flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center font-bold">
                            {emp.name.charAt(0)}
                          </div>
                          <div>
                            <h4 className="font-black text-sm text-gray-900 uppercase leading-none">{emp.name}</h4>
                            <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">{emp.department}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-black uppercase tracking-wide border border-emerald-100">
                          Active
                        </span>
                      </div>
                      
                      <div className="my-4 px-4 py-3 bg-white rounded-2xl border border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-400">
                          <Clock size={14} />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Time Left</span>
                        </div>
                        <span className="text-sm font-black text-emerald-600 tabular-nums">
                          {getCountdown(emp.outsideWorkUntil!)}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button 
                        onClick={() => setActionModal({ type: 'EXTEND', employee: emp })}
                        className="py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase hover:bg-gray-50 transition-colors"
                      >
                        Extend
                      </button>
                      <button 
                        onClick={() => setActionModal({ type: 'RECALL', employee: emp })}
                        className="py-3 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase hover:bg-red-100 transition-colors"
                      >
                        Recall
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'DEPLOY' && (
          <div className="flex flex-col h-full">
            <div className="flex-grow overflow-y-auto p-2 md:p-4">
              <table className="w-full text-left border-separate border-spacing-y-2">
                <thead className="hidden md:table-header-group">
                  <tr>
                    <th className="px-6 py-2 text-[10px] font-black uppercase text-gray-400 tracking-widest">Select</th>
                    <th className="px-6 py-2 text-[10px] font-black uppercase text-gray-400 tracking-widest">Employee</th>
                    <th className="px-6 py-2 text-[10px] font-black uppercase text-gray-400 tracking-widest">Department</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredList.map(emp => {
                    const isSelected = selectedIds.has(emp.id);
                    return (
                      <tr 
                        key={emp.id} 
                        onClick={() => toggleSelection(emp.id)}
                        className={`cursor-pointer transition-all ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-4 md:px-6 py-3 rounded-l-2xl border-y border-l border-transparent md:border-gray-50">
                          <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                            {isSelected && <CheckCircle size={12} className="text-white" />}
                          </div>
                        </td>
                        <td className="px-4 md:px-6 py-3 border-y border-transparent md:border-gray-50">
                          <span className={`text-sm font-bold uppercase ${isSelected ? 'text-blue-900' : 'text-gray-900'}`}>{emp.name}</span>
                        </td>
                        <td className="px-4 md:px-6 py-3 rounded-r-2xl border-y border-r border-transparent md:border-gray-50">
                          <span className="text-xs font-semibold text-gray-500 uppercase">{emp.department}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredList.length === 0 && (
                <div className="text-center py-12 text-gray-300 font-bold uppercase text-xs">No personnel available</div>
              )}
            </div>

            {/* Sticky Action Footer */}
            <div className="p-6 bg-white border-t border-gray-100 sticky bottom-0 z-10 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
              <div className="flex flex-col md:flex-row items-center gap-6 justify-between max-w-4xl mx-auto">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-1">Duration (Days)</span>
                    <div className="flex items-center gap-3">
                      <button onClick={() => setDeployDays(d => Math.max(1, d - 1))} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><Minus size={16}/></button>
                      <span className="text-2xl font-black text-gray-900 w-8 text-center">{deployDays}</span>
                      <button onClick={() => setDeployDays(d => d + 1)} className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200"><Plus size={16}/></button>
                    </div>
                  </div>
                  <div className="h-10 w-px bg-gray-200 mx-4 hidden md:block"></div>
                  <div className="hidden md:block">
                    <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest block mb-1">Selected</span>
                    <span className="text-lg font-black text-blue-600">{selectedIds.size} Staff</span>
                  </div>
                </div>

                <button 
                  onClick={handleDeploy}
                  disabled={selectedIds.size === 0 || isSubmitting}
                  className="w-full md:w-auto px-12 py-4 bg-black text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl hover:bg-gray-900 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                >
                  {isSubmitting ? 'Processing...' : `Deploy ${selectedIds.size > 0 ? `(${selectedIds.size})` : ''}`} <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- MODAL FOR EXTEND/RECALL --- */}
      {actionModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in">
          <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl animate-in zoom-in border border-white/20">
            <h3 className="text-lg font-black text-center uppercase mb-6">
              {actionModal.type === 'EXTEND' ? 'Extend Mission' : 'Recall Staff'}
            </h3>
            
            <div className="text-center mb-8">
              <p className="text-xs font-bold text-gray-500 uppercase">{actionModal.employee.name}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">{actionModal.employee.department}</p>
            </div>

            {actionModal.type === 'EXTEND' && (
              <div className="flex items-center justify-center gap-4 mb-8">
                <button onClick={() => setExtensionDays(d => Math.max(1, d - 1))} className="p-3 bg-gray-100 rounded-xl hover:bg-gray-200"><Minus size={18}/></button>
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-black text-black">{extensionDays}</span>
                  <span className="text-[9px] font-black uppercase text-gray-400 tracking-widest">Days</span>
                </div>
                <button onClick={() => setExtensionDays(d => d + 1)} className="p-3 bg-gray-100 rounded-xl hover:bg-gray-200"><Plus size={18}/></button>
              </div>
            )}

            <div className="flex gap-3">
              <button 
                onClick={() => setActionModal(null)} 
                className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-2xl font-black uppercase text-[10px] hover:bg-gray-200"
              >
                Cancel
              </button>
              <button 
                onClick={handleModalAction}
                disabled={isLoading}
                className={`flex-1 py-4 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg ${actionModal.type === 'RECALL' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
              >
                {isLoading ? 'Processing...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OutsideWork;