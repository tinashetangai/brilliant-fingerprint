
import { Employee, DailyWorkRecord } from '../types';

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
  }
};
