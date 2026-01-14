
import React, { useState, useEffect } from 'react';
import Home from './pages/Home';
import AdminDashboard from './pages/AdminDashboard';
import LoginLogoutPrompt from './components/LoginLogoutPrompt';
import { dataService } from './services/dataService';
import { seedService } from './services/seedService';
import { Employee, AttendanceAction, LogStatus } from './types';

const App: React.FC = () => {
  const [currentPage, setCurrentPage] = useState<'HOME' | 'ADMIN'>('HOME');
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
  const [scannedEmployee, setScannedEmployee] = useState<Employee | null>(null);

  useEffect(() => {
    const unsubscribe = dataService.subscribeToLiveScans((scan) => {
      if (scan.action === 'SCAN') {
        dataService.getEmployees().then(employees => {
          const employee = employees.find(emp => emp.id === scan.subjectId);
          if (employee) {
            setScannedEmployee(employee);
          }
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleLogin = async () => {
    if (!scannedEmployee) return;
    await dataService.addLog({
      subjectId: scannedEmployee.id,
      subjectName: scannedEmployee.name,
      timestamp: Date.now(),
      action: AttendanceAction.LOGIN,
      status: LogStatus.SUCCESS,
      type: 'EMPLOYEE'
    });
    setScannedEmployee(null);
  };

  const handleLogout = async () => {
    if (!scannedEmployee) return;
    await dataService.addLog({
      subjectId: scannedEmployee.id,
      subjectName: scannedEmployee.name,
      timestamp: Date.now(),
      action: AttendanceAction.LOGOUT,
      status: LogStatus.SUCCESS,
      type: 'EMPLOYEE'
    });
    setScannedEmployee(null);
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash === '#admin') {
        setCurrentPage('ADMIN');
      } else {
        // When leaving admin hash, we should force re-authentication next time
        setIsAdminAuthenticated(false);
        setCurrentPage('HOME');
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleAdminLogout = () => {
    setIsAdminAuthenticated(false);
    window.location.hash = '';
  };

  return (
    <div className="h-screen w-screen bg-white flex flex-col overflow-hidden">
      {scannedEmployee && (
        <LoginLogoutPrompt
          employee={scannedEmployee}
          onLogin={handleLogin}
          onLogout={handleLogout}
        />
      )}
      <main className="flex-grow flex flex-col h-full overflow-hidden">
        {currentPage === 'HOME' ? (
          <Home />
        ) : (
          <AdminDashboard 
            isAuthenticated={isAdminAuthenticated} 
            onLogin={() => setIsAdminAuthenticated(true)} 
            onLogout={handleAdminLogout}
          />
        )}
      </main>
    </div>
  );
};

export default App;
