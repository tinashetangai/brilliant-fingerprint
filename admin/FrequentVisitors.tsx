
import React, { useState, useMemo } from 'react';
import { Search, Trash2, Edit3, X, Loader2, Fingerprint, Key, SortAsc, SortDesc, Cpu } from 'lucide-react';
import { FrequentVisitor } from '../types';
import { db } from '../backend/firebase';
import { collection, addDoc } from 'firebase/firestore';

interface FrequentVisitorsProps {
  frequentVisitors: FrequentVisitor[];
  onAddFrequentVisitor: (visitor: Omit<FrequentVisitor, 'id'>) => Promise<void>;
  onUpdateFrequentVisitor: (id: string, visitor: Partial<FrequentVisitor>) => Promise<void>;
  onDeleteFrequentVisitor: (id: string) => Promise<void>;
}

const FrequentVisitors: React.FC<FrequentVisitorsProps> = ({
  frequentVisitors,
  onAddFrequentVisitor,
  onUpdateFrequentVisitor,
  onDeleteFrequentVisitor,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVisitor, setNewVisitor] = useState({ name: '', surname: '', idNumber: '', phone: '', fingerprintHash: '' });
  const [editingVisitor, setEditingVisitor] = useState<FrequentVisitor | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'A-Z' | 'Z-A'>('A-Z');
  const [biometricStatus, setBiometricStatus] = useState<{msg: string, loading: boolean} | null>(null);

  const filteredAndSortedVisitors = useMemo(() => {
    let result = frequentVisitors.filter(visitor =>
      visitor.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visitor.surname.toLowerCase().includes(searchQuery.toLowerCase()) ||
      visitor.idNumber.toLowerCase().includes(searchQuery.toLowerCase())
    );

    result.sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (sortOrder === 'A-Z') return nameA.localeCompare(nameB);
      return nameB.localeCompare(nameA);
    });

    return result;
  }, [frequentVisitors, searchQuery, sortOrder]);

  const handleDeviceEnroll = async (id: string) => {
    setBiometricStatus({ msg: 'Queuing Enrollment Command...', loading: true });
    try {
      await addDoc(collection(db, 'device_commands'), {
        pin: id,
        status: 'PENDING',
        createdAt: Date.now()
      });
      setBiometricStatus({ msg: 'Success! Look at the F22 Device Screen now.', loading: false });
      setTimeout(() => setBiometricStatus(null), 5000);
    } catch (e) {
      setBiometricStatus({ msg: 'Cloud Connection Failed', loading: false });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddFrequentVisitor(newVisitor);
    setNewVisitor({ name: '', surname: '', idNumber: '', phone: '', fingerprintHash: '' });
    setShowAddForm(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 relative">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h4 className="text-xs font-bold text-gray-500 uppercase">Total Frequent Visitors</h4>
          <p className="text-2xl font-bold">{frequentVisitors.length}</p>
        </div>
      </div>

      {editingVisitor && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
          <div className="bg-white rounded-[2rem] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in border border-white/20">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-lg"><Edit3 size={20} /></div>
                <h3 className="text-lg font-bold uppercase tracking-tight text-black">Edit Frequent Visitor</h3>
              </div>
              <button onClick={() => setEditingVisitor(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={20}/></button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); onUpdateFrequentVisitor(editingVisitor.id, editingVisitor); setEditingVisitor(null); }} className="p-6 space-y-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Name</label>
                    <input required className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={editingVisitor.name} onChange={e => setEditingVisitor({...editingVisitor, name: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Surname</label>
                    <input required className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={editingVisitor.surname} onChange={e => setEditingVisitor({...editingVisitor, surname: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">ID Number</label>
                  <input required className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={editingVisitor.idNumber} onChange={e => setEditingVisitor({...editingVisitor, idNumber: e.target.value})} />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Phone</label>
                  <input required className="w-full px-5 py-3 bg-gray-50 border border-gray-200 rounded-xl font-semibold text-slate-900 focus:ring-2 focus:ring-emerald-500 outline-none" value={editingVisitor.phone} onChange={e => setEditingVisitor({...editingVisitor, phone: e.target.value})} />
                </div>
                <div className="p-6 bg-slate-900 rounded-[2rem] flex flex-col gap-4 shadow-xl border border-white/5">
                   <div className="flex justify-between items-center text-white">
                     <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Hardware Actions</span>
                     <Fingerprint size={16} className="text-emerald-500 animate-pulse" />
                   </div>
                   <button type="button" onClick={() => handleDeviceEnroll(editingVisitor.id)} className="w-full py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase flex items-center justify-center gap-3 hover:bg-emerald-500 transition-all shadow-lg active:scale-95">
                      <Cpu size={18}/> Initiate Remote Enrollment
                   </button>
                   {biometricStatus && (
                     <div className={`p-3 rounded-xl border text-center text-[10px] font-bold uppercase ${biometricStatus.msg.includes('Error') ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                        {biometricStatus.loading && <Loader2 size={12} className="inline animate-spin mr-2"/>}
                        {biometricStatus.msg}
                     </div>
                   )}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="w-full py-5 bg-black text-white rounded-2xl font-black uppercase text-[10px] shadow-xl active:scale-95 hover:bg-slate-800 transition-all mt-2 tracking-widest">Commit Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between bg-white p-2 rounded-2xl shadow-sm border border-slate-50">
        <div className="flex flex-wrap gap-4 items-center w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16}/>
            <input placeholder="Search Visitors..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none transition-all" />
          </div>
          <button onClick={() => setSortOrder(prev => prev === 'A-Z' ? 'Z-A' : 'A-Z')} className="px-6 py-3 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase flex items-center gap-2">
            {sortOrder === 'A-Z' ? <SortAsc size={16} /> : <SortDesc size={16} />} {sortOrder}
          </button>
        </div>

        <button onClick={() => setShowAddForm(!showAddForm)} className="px-8 py-3 bg-black text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:scale-105 active:scale-95 transition-all tracking-wider">
          {showAddForm ? 'Close Registration' : 'New Visitor'}
        </button>
      </div>

      {showAddForm && (
        <div className="p-8 bg-slate-50 rounded-[2.5rem] border border-slate-200 animate-in slide-in-from-top-4 shadow-sm">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Name</label>
              <input required placeholder="Name" className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-black outline-none" value={newVisitor.name} onChange={e => setNewVisitor({...newVisitor, name: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Surname</label>
              <input required placeholder="Surname" className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-black outline-none" value={newVisitor.surname} onChange={e => setNewVisitor({...newVisitor, surname: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-2">ID Number</label>
              <input required placeholder="ID Number" className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-black outline-none" value={newVisitor.idNumber} onChange={e => setNewVisitor({...newVisitor, idNumber: e.target.value})} />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Phone</label>
              <input required placeholder="Phone" className="w-full p-4 bg-white border-slate-200 border rounded-2xl text-sm font-bold shadow-sm focus:ring-2 focus:ring-black outline-none" value={newVisitor.phone} onChange={e => setNewVisitor({...newVisitor, phone: e.target.value})} />
            </div>
            <div className="lg:col-span-4">
              <button onClick={handleSubmit} className="w-full py-4 bg-black text-white rounded-2xl font-black uppercase text-xs shadow-lg active:scale-95 transition-all tracking-widest">Register Visitor</button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-100 rounded-[2.5rem] shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 border-b border-slate-100">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Identity</th>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Contact</th>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Auth Data</th>
              <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filteredAndSortedVisitors.map(visitor => (
              <tr key={visitor.id} className="hover:bg-slate-50/50 transition-all group">
                <td className="px-8 py-5">
                  <div className="text-[16px] font-black text-slate-900 uppercase tracking-tight mb-1">{visitor.name} {visitor.surname}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{visitor.idNumber}</div>
                </td>
                <td className="px-8 py-5">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{visitor.phone}</div>
                </td>
                <td className="px-8 py-5">
                  <span className="flex items-center gap-2 text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                    <Fingerprint size={14}/> {visitor.fingerprintHash ? 'ZK-ACTIVE' : 'READY-FOR-SYNC'}
                  </span>
                </td>
                <td className="px-8 py-5 text-right">
                  <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditingVisitor(visitor)} className="p-2.5 text-slate-400 hover:text-black hover:bg-slate-100 rounded-xl transition-all"><Edit3 size={18} /></button>
                    <button onClick={() => onDeleteFrequentVisitor(visitor.id)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FrequentVisitors;
