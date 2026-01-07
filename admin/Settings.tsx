
import React, { useState, useEffect } from 'react';
import { Save, Settings as SettingsIcon, Building2, Plus, Trash2, Edit2, Check, X, Clock, ShieldCheck, Briefcase, Lock, Loader, ChevronRight } from 'lucide-react';
import { SystemSettings, Department } from '../types';

interface SettingsProps {
  settings: SystemSettings | null;
  setSettings: (settings: SystemSettings) => void;
  departments: Department[];
  onAddDepartment: (name: string) => Promise<void>;
  onUpdateDepartment: (id: string, name: string) => Promise<void>;
  onDeleteDepartment: (id: string) => Promise<void>;
  onSave: (settings: SystemSettings) => Promise<void>;
}

type SettingsTab = 'TIME' | 'DEPARTMENTS' | 'COMPANY' | 'SECURITY';

const Settings: React.FC<SettingsProps> = ({ 
  settings, 
  setSettings, 
  departments, 
  onAddDepartment, 
  onUpdateDepartment, 
  onDeleteDepartment, 
  onSave 
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('TIME');
  const [newDeptName, setNewDeptName] = useState('');
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState('');
  
  // Security form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);

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
      onClick={() => setActiveTab(id)}
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
    <div className="h-[calc(100vh-140px)] flex flex-col md:flex-row gap-6 animate-in fade-in duration-500">
      
      {/* Sidebar Navigation */}
      <div className="w-full md:w-72 flex-shrink-0 bg-white border border-gray-100 rounded-[2.5rem] p-4 flex flex-col gap-2 shadow-sm h-fit">
        <div className="p-6 pb-2">
          <h3 className="text-lg font-black text-black uppercase tracking-tight">Configuration</h3>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">System Controls</p>
        </div>
        <div className="space-y-1">
          <TabButton id="TIME" icon={Clock} label="Work Schedule" />
          <TabButton id="DEPARTMENTS" icon={Building2} label="Units Registry" />
          <TabButton id="COMPANY" icon={Briefcase} label="Branding" />
          <TabButton id="SECURITY" icon={Lock} label="Security" />
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
      </div>
    </div>
  );
};

export default Settings;
