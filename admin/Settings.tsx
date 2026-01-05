import React, { useState, useEffect } from 'react';
import {
  Save,
  Settings as SettingsIcon,
  Building2,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Clock,
  ShieldCheck,
  Briefcase,
  Lock,
} from 'lucide-react';

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
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('TIME');

  const [newDeptName, setNewDeptName] = useState('');
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null);
  const [editingDeptName, setEditingDeptName] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [installPrompt, setInstallPrompt] = useState<any>(null);

  /* ================= INSTALL PROMPT ================= */
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  /* ================= LOADING GUARD ================= */
  if (!settings) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-gray-400 font-black uppercase tracking-widest">
        Loading system settings…
      </div>
    );
  }

  /* ================= DEPARTMENTS ================= */
  const handleAddDept = async () => {
    if (!newDeptName.trim()) return;
    await onAddDepartment(newDeptName.trim());
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
    await onUpdateDepartment(id, editingDeptName.trim());
    cancelEditing();
  };

  /* ================= SECURITY ================= */
  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) return;

    await onSave({
      ...settings,
      adminPassword: newPassword,
    });

    setNewPassword('');
    setConfirmPassword('');
  };

  /* ================= UI ================= */
  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-8 pb-12 animate-in fade-in duration-300">
      {/* ================= HEADER ================= */}
      <div className="bg-white border rounded-[2.5rem] shadow-sm p-8 pb-0">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-black text-white rounded-2xl flex items-center justify-center">
            <SettingsIcon size={24} />
          </div>
          <div>
            <h3 className="text-xl font-black uppercase">System Controls</h3>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
              Global configuration
            </p>
          </div>
        </div>

        {/* ================= TABS ================= */}
        <div className="flex gap-1 border-b overflow-x-auto">
          {[
            { id: 'TIME', icon: Clock, label: 'Work Schedule' },
            { id: 'DEPARTMENTS', icon: Building2, label: 'Units' },
            { id: 'COMPANY', icon: Briefcase, label: 'Company' },
            { id: 'SECURITY', icon: Lock, label: 'Security' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as SettingsTab)}
              className={`px-6 py-4 text-xs font-black uppercase flex items-center gap-2 relative ${
                activeTab === tab.id ? 'text-black' : 'text-gray-400'
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-black rounded-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ================= CONTENT ================= */}
      <div className="bg-white border rounded-[2.5rem] shadow-sm p-8 min-h-[400px]">
        {/* ===== TIME ===== */}
        {activeTab === 'TIME' && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[
                ['Day Start', 'dayStart'],
                ['Day End', 'dayEnd'],
                ['Early Bound', 'earlyThreshold'],
                ['Late Bound', 'lateThreshold'],
              ].map(([label, key]) => (
                <div key={key} className="space-y-2">
                  <label className="text-[9px] uppercase font-black text-gray-400">
                    {label}
                  </label>
                  <input
                    type="time"
                    value={(settings as any)[key]}
                    onChange={(e) =>
                      setSettings({ ...settings, [key]: e.target.value })
                    }
                    className="w-full px-5 py-4 bg-gray-50 border rounded-2xl font-black"
                  />
                </div>
              ))}
            </div>

            <button
              onClick={() => onSave(settings)}
              className="w-full py-5 bg-black text-white rounded-[2rem] font-black uppercase text-xs flex justify-center gap-2"
            >
              <Check size={16} /> Save Schedule
            </button>
          </div>
        )}

        {/* ===== DEPARTMENTS ===== */}
        {activeTab === 'DEPARTMENTS' && (
          <div className="space-y-6">
            <div className="flex gap-3">
              <input
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                placeholder="Department name"
                className="flex-grow px-5 py-4 bg-gray-50 border rounded-2xl font-black"
              />
              <button
                onClick={handleAddDept}
                className="px-6 bg-black text-white rounded-2xl text-xs font-black uppercase"
              >
                <Plus size={16} />
              </button>
            </div>

            {departments.length === 0 && (
              <div className="text-center text-gray-300 uppercase text-xs py-12">
                No departments
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="p-5 bg-gray-50 border rounded-2xl flex justify-between items-center"
                >
                  {editingDeptId === dept.id ? (
                    <>
                      <input
                        value={editingDeptName}
                        onChange={(e) => setEditingDeptName(e.target.value)}
                        className="flex-grow px-4 py-2 border rounded-xl font-black"
                      />
                      <button onClick={() => saveDeptEdit(dept.id)}>
                        <Check size={16} />
                      </button>
                      <button onClick={cancelEditing}>
                        <X size={16} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="font-black uppercase text-xs">
                        {dept.name}
                      </span>
                      <div className="flex gap-2">
                        <button onClick={() => startEditing(dept)}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => onDeleteDepartment(dept.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===== COMPANY ===== */}
        {activeTab === 'COMPANY' && (
          <div className="space-y-6">
            <input
              value={settings.companyMotto}
              onChange={(e) =>
                setSettings({ ...settings, companyMotto: e.target.value })
              }
              placeholder="Company Motto"
              className="w-full px-6 py-5 bg-gray-50 border rounded-2xl font-black"
            />
            <input
              value={settings.companyContact}
              onChange={(e) =>
                setSettings({ ...settings, companyContact: e.target.value })
              }
              placeholder="Contact Information"
              className="w-full px-6 py-5 bg-gray-50 border rounded-2xl font-black"
            />
            <button
              onClick={() => onSave(settings)}
              className="w-full py-5 bg-black text-white rounded-[2rem] font-black uppercase"
            >
              <Save size={16} /> Save Company Info
            </button>
          </div>
        )}

        {/* ===== SECURITY ===== */}
        {activeTab === 'SECURITY' && (
          <form onSubmit={handlePasswordChange} className="max-w-md mx-auto space-y-6">
            <input
              type="password"
              placeholder="New admin password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-6 py-5 bg-gray-50 border rounded-2xl font-black"
            />
            <input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-6 py-5 bg-gray-50 border rounded-2xl font-black"
            />
            <button
              disabled={!newPassword || newPassword !== confirmPassword}
              className="w-full py-5 bg-red-600 text-white rounded-[2rem] font-black uppercase disabled:opacity-30"
            >
              <ShieldCheck size={16} /> Update Password
            </button>

            {installPrompt && (
              <button
                type="button"
                onClick={() => installPrompt.prompt()}
                className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black uppercase"
              >
                Install App
              </button>
            )}
          </form>
        )}
      </div>
    </div>
  );
};

export default Settings;
