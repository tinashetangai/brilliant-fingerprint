
import { Employee, DailyWorkRecord } from '../types';
import { formatDate } from './dataService';

export const csvReportGenerator = {
  generateMonthlyReport: (
    employees: Employee[],
    allRecords: DailyWorkRecord[], // Pre-filtered by caller
    reportTitle: string // Used for filename
  ) => {
    // CSV Header
    let csvContent = "data:text/csv;charset=utf-8,";
    // BOM for Excel
    csvContent += "\uFEFF"; 
    
    // Meta Header in CSV
    csvContent += `Report: ${reportTitle}\n`;
    csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;

    // Columns
    csvContent += "Department,Employee Name,Employee ID,Total Days Worked,Total Hours Worked,Approved OT Hours,Calculated OT Days\n";

    // Data Rows
    // Sort by Department then Name
    employees
      .sort((a,b) => {
        if (a.department === b.department) return a.name.localeCompare(b.name);
        return a.department.localeCompare(b.department);
      })
      .forEach(emp => {
        const empRecords = allRecords.filter(r => r.employeeId === emp.id);
        
        const totalHours = empRecords.reduce((acc, r) => acc + r.totalContributedHours, 0);
        const totalDays = empRecords.reduce((acc, r) => acc + r.dayValue, 0);
        const overtimeHours = empRecords.reduce((acc, r) => acc + (r.overtimeStatus === 'APPROVED' ? r.overtimeHours : 0), 0);
        const otDays = overtimeHours / 8; // Standard 8h divisor

        const row = [
          `"${emp.department}"`,
          `"${emp.name}"`,
          `"${emp.pin}"`,
          totalDays.toFixed(2),
          totalHours.toFixed(2),
          overtimeHours.toFixed(2),
          otDays.toFixed(2)
        ];
        csvContent += row.join(",") + "\n";
      });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const safeFilename = reportTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute("download", `${safeFilename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  generateDailyReport: (
    employees: Employee[],
    dailyRecords: DailyWorkRecord[],
    dateStr: string
  ) => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "\uFEFF"; // BOM
    
    csvContent += `DAILY ATTENDANCE REPORT: ${dateStr}\n`;
    csvContent += `Generated: ${new Date().toLocaleString()}\n\n`;

    csvContent += "Department,Employee Name,ID,Status,Time In,Time Out,Hours,Overtime\n";

    employees.sort((a,b) => a.department.localeCompare(b.department) || a.name.localeCompare(b.name))
      .forEach(emp => {
        const record = dailyRecords.find(r => r.employeeId === emp.id);
        
        let status = 'ABSENT';
        let timeIn = '--:--';
        let timeOut = '--:--';
        let hours = '0.00';
        let ot = '0.00';

        if (record) {
          status = 'PRESENT';
          timeIn = record.startTime;
          timeOut = record.endTime;
          hours = record.regularHours.toFixed(2);
          ot = (record.overtimeStatus === 'APPROVED' ? record.overtimeHours : 0).toFixed(2);
        }

        const row = [
          `"${emp.department}"`,
          `"${emp.name}"`,
          `"${emp.pin}"`,
          status,
          timeIn,
          timeOut,
          hours,
          ot
        ];
        csvContent += row.join(",") + "\n";
      });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `daily_attendance_${dateStr.replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};
