
import React from 'react';
import {
  Users,
  Settings,
  BarChart3,
  Briefcase,
  Megaphone
} from 'lucide-react';
import { AdminTab } from './AdminSidebar';

interface BottomNavBarProps {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
}

const BottomNavBar: React.FC<BottomNavBarProps> = ({ activeTab, onTabChange }) => {
  const navigation = [
    { id: 'OVERVIEW' as const, icon: BarChart3, label: 'Dashboard' },
    { id: 'EMPLOYEES' as const, icon: Users, label: 'Employees' },
    { id: 'STAFF_LOGS' as const, icon: Briefcase, label: 'Logs' },
    { id: 'NOTICES' as const, icon: Megaphone, label: 'Notices' },
    { id: 'SETTINGS' as const, icon: Settings, label: 'Settings' }
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 md:hidden z-10">
      <div className="flex justify-around">
        {navigation.map(item => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center justify-center w-full pt-3 pb-2 text-xs font-medium transition-colors ${
              activeTab === item.id
                ? 'text-emerald-600'
                : 'text-gray-500 hover:text-emerald-600'
            }`}
          >
            <item.icon size={20} />
            <span className="mt-1">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default BottomNavBar;
