
import React from 'react';
import {
  Users,
  Settings,
  BarChart3,
  Briefcase,
  Megaphone,
  Clock,
  Truck,
  DoorOpen,
  UserCheck
} from 'lucide-react';
import { AdminTab } from './AdminSidebar';

interface BottomNavBarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange }) => {
  const navigation = [
    { id: 'OVERVIEW' as const, icon: BarChart3, label: 'Dash' },
    { id: 'EMPLOYEES' as const, icon: Users, label: 'Staff' },
    { id: 'OVERTIME' as const, icon: Clock, label: 'OT' },
    { id: 'OUTSIDE_WORK' as const, icon: Truck, label: 'Out' },
    { id: 'STAFF_LOGS' as const, icon: Briefcase, label: 'Logs' },
    { id: 'GATE_LOG' as const, icon: DoorOpen, label: 'Gate' },
    { id: 'VISITOR_LOGS' as const, icon: UserCheck, label: 'Visitors' },
    { id: 'FREQUENT_VISITORS' as const, icon: Users, label: 'Freq.' },
    { id: 'NOTICES' as const, icon: Megaphone, label: 'Notice' },
    { id: 'SETTINGS' as const, icon: Settings, label: 'Settings' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-20 pb-safe">
      <div className="flex overflow-x-auto no-scrollbar py-1">
        {navigation.map(item => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center justify-center min-w-[70px] pt-3 pb-2 text-[10px] font-black uppercase tracking-tight transition-colors flex-shrink-0 ${
              activeTab === item.id
                ? 'text-emerald-600'
                : 'text-gray-400 hover:text-emerald-600'
            }`}
          >
            <item.icon size={20} className={activeTab === item.id ? 'stroke-2' : 'stroke-[1.5]'} />
            <span className="mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNavBar;
