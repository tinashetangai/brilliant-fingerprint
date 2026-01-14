
import React from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { Employee } from '../types';

interface LoginLogoutPromptProps {
  employee: Employee;
  onLogin: () => void;
  onLogout: () => void;
}

const LoginLogoutPrompt: React.FC<LoginLogoutPromptProps> = ({ employee, onLogin, onLogout }) => {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-gray-900 bg-opacity-80 p-6">
      <div className="bg-white p-12 rounded-[2.5rem] border border-gray-200 shadow-2xl w-full max-w-md text-center">
        <h2 className="text-3xl font-black text-black mb-2 uppercase">{employee.name}</h2>
        <p className="text-lg text-gray-500 mb-8">{employee.department}</p>
        <div className="flex justify-around">
          <button
            onClick={onLogin}
            className="flex items-center justify-center w-32 h-32 bg-green-500 text-white rounded-full font-bold uppercase text-lg shadow-xl active:scale-95 transition-all"
          >
            <ArrowRight size={40} className="mr-2" />
            Login
          </button>
          <button
            onClick={onLogout}
            className="flex items-center justify-center w-32 h-32 bg-red-500 text-white rounded-full font-bold uppercase text-lg shadow-xl active:scale-95 transition-all"
          >
            <ArrowLeft size={40} className="mr-2" />
            Logout
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginLogoutPrompt;
