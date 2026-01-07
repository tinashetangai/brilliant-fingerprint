
import React from 'react';
import { 
  BarChart3, 
  Users, 
  Clock, 
  Truck, 
  Briefcase, 
  DoorOpen, 
  UserCheck, 
  Megaphone, 
  Settings 
} from 'lucide-react';
import { AdminTab } from './AdminSidebar';

interface MobileTopNavProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

const MobileTopNav: React.FC<MobileTopNavProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'OVERVIEW', icon: BarChart3, label: 'Dash' },
    { id: 'EMPLOYEES', icon: Users, label: 'Staff' },
    { id: 'STAFF_LOGS', icon: Briefcase, label: 'Logs' },
    { id: 'OVERTIME', icon: Clock, label: 'OT' },
    { id: 'OUTSIDE_WORK', icon: Truck, label: 'Out' },
    { id: 'GATE_LOG', icon: DoorOpen, label: 'Gate' },
    { id: 'VISITOR_LOGS', icon: UserCheck, label: 'Visit' },
    { id: 'NOTICES', icon: Megaphone, label: 'News' },
    { id: 'SETTINGS', icon: Settings, label: 'Set' },
  ];

  return (
    <div className="bg-slate-900 border-b border-slate-800 shadow-xl z-30 sticky top-0 md:hidden">
      {/* Brand Header Inside Nav */}
      <div className="px-4 py-3 border-b border-slate-800/50 flex justify-between items-center">
         <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-emerald-500 rounded-md flex items-center justify-center">
               <span className="text-white font-black text-[10px]">KO</span>
            </div>
            <span className="text-white font-black uppercase text-xs tracking-widest">Admin Console</span>
         </div>
      </div>

      {/* Scrollable Tabs */}
      <div className="flex overflow-x-auto no-scrollbar scroll-smooth px-2 py-2 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id as AdminTab)}
            className={`
              flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full border transition-all duration-200
              ${activeTab === tab.id 
                ? 'bg-white text-black border-white shadow-lg scale-105' 
                : 'bg-transparent text-gray-400 border-transparent hover:bg-slate-800 hover:text-gray-200'
              }
            `}
          >
            <tab.icon size={14} className={activeTab === tab.id ? 'stroke-[2.5]' : 'stroke-2'} />
            <span className="text-[10px] font-black uppercase tracking-wider leading-none pt-0.5">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileTopNav;
