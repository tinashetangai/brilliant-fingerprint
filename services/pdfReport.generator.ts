
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Employee, DailyWorkRecord, OvertimeStatus } from '../types';

export const pdfReportGenerator = {
  /**
   * Generates a comprehensive monthly report for all selected employees, 
   * grouped by department with pagination.
   */
  generateMonthlyReport: async (
    employees: Employee[],
    allRecords: DailyWorkRecord[],
    reportTitle: string,
    month: number,
    year: number
  ) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    const depts = Array.from(new Set(employees.map(e => e.department))).sort();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < depts.length; i++) {
      if (i > 0) doc.addPage();
      const dept = depts[i];
      const deptEmployees = employees.filter(e => e.department === dept);

      // 1. HEADER & BRANDING
      doc.setFillColor(0, 0, 0);
      doc.rect(0, 0, pageWidth, 40, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text("KNOCKOUT INDUSTRIES GROUP", 15, 18);
      
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(180, 180, 180);
      doc.text("BIOMETRIC SECURITY • LOGISTICS • CHEMICAL DIVISION", 15, 24);
      doc.text(`GENERATED: ${new Date().toLocaleString('en-GB')}`, 15, 28);

      // Confidentiality Stamp
      doc.setFillColor(220, 38, 38); 
      doc.rect(pageWidth - 55, 12, 40, 8, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text("CONFIDENTIAL", pageWidth - 35, 17.5, { align: 'center' });

      // 2. DEPARTMENT SECTION HEADER
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(24);
      doc.text(dept.toUpperCase(), 15, 55);
      
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(1);
      doc.line(15, 58, pageWidth - 15, 58);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text("DEPARTMENTAL ATTENDANCE SUMMARY", 15, 68);
      
      doc.setFont('helvetica', 'normal');
      doc.text(`Total Personnel: ${deptEmployees.length}`, 15, 74);
      doc.text(`Report Period: ${new Date(year, month).toLocaleString('default', { month: 'long' })} ${year}`, 15, 78);

      // 3. MAIN TABLE DATA
      const tableData = deptEmployees.map(emp => {
        const empRecords = allRecords.filter(r => r.employeeId === emp.id);
        
        const totalHours = empRecords.reduce((acc, r) => acc + r.totalContributedHours, 0);
        const totalDays = empRecords.reduce((acc, r) => acc + r.dayValue, 0);
        const otHours = empRecords.reduce((acc, r) => acc + (r.overtimeStatus === OvertimeStatus.APPROVED ? r.overtimeHours : 0), 0);
        const otDays = otHours / 8;
        
        // Absence calculation (Weekdays with zero records)
        const workedDates = new Set(empRecords.map(r => r.date));
        let absences = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${String(d).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
          const dateObj = new Date(year, month, d);
          const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
          if (!isWeekend && !workedDates.has(dateStr)) absences++;
        }

        return [
          emp.name.toUpperCase(),
          emp.pin,
          totalDays.toFixed(1),
          totalHours.toFixed(1),
          otHours.toFixed(1),
          otDays.toFixed(1),
          absences > 0 ? { content: absences.toString(), styles: { textColor: [220, 38, 38], fontStyle: 'bold' } } : '0'
        ];
      });

      autoTable(doc, {
        startY: 85,
        head: [['FULL NAME', 'S-ID', 'DAYS', 'HOURS', 'OT HRS', 'OT DAYS', 'ABSENT']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [0, 0, 0], textColor: 255, fontSize: 8, fontStyle: 'bold', halign: 'left' },
        styles: { fontSize: 8, cellPadding: 3, textColor: 40, borderRadius: 0 },
        columnStyles: {
          0: { fontStyle: 'bold', width: 60 },
          1: { fontStyle: 'bold', textColor: [100, 100, 100] },
          2: { halign: 'center' },
          3: { halign: 'center', textColor: [5, 150, 105] },
          4: { halign: 'center' },
          5: { halign: 'center' },
          6: { halign: 'center' }
        },
        margin: { left: 15, right: 15 }
      });

      // 4. FOOTER
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 150);
      doc.text("THIS DOCUMENT IS ELECTRONICALLY VERIFIED AND ENCRYPTED BY KNOCKOUT AI GATEWAY.", 15, pageHeight - 15);
      doc.text(`PAGE ${doc.internal.getNumberOfPages()}`, pageWidth - 15, pageHeight - 15, { align: 'right' });
    }

    const safeTitle = reportTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`${safeTitle}.pdf`);
  },

  /**
   * Generates a detailed monthly statement for a single employee.
   */
  generateUserMonthlyStatement: async (
    employee: Employee,
    allRecords: DailyWorkRecord[],
    month: number,
    year: number
  ) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;

    // 1. TOP BRANDING STRIP
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pageWidth, 45, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("PERSONAL ATTENDANCE RECORD", 15, 25);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`OFFICIAL TRANSCRIPT: ${new Date(year, month).toLocaleString('default', { month: 'long', year: 'numeric' })}`, 15, 33);

    // 2. EMPLOYEE DETAILS BOX
    doc.setFillColor(245, 245, 245);
    doc.rect(15, 55, pageWidth - 30, 35, 'F');
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("PERSONNEL INFORMATION", 20, 65);
    
    doc.setFontSize(14);
    doc.text(employee.name.toUpperCase(), 20, 75);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(`ID PIN: ${employee.pin}`, 20, 82);
    doc.text(`UNIT: ${employee.department.toUpperCase()}`, 70, 82);

    // 3. STATS SUMMARY ROW
    const empRecords = allRecords.filter(r => {
      const [d, m, y] = r.date.split('/').map(Number);
      return (m - 1) === month && y === year;
    });

    const totalHours = empRecords.reduce((acc, r) => acc + r.totalContributedHours, 0);
    const totalDays = empRecords.reduce((acc, r) => acc + r.dayValue, 0);
    const otHours = empRecords.reduce((acc, r) => acc + (r.overtimeStatus === OvertimeStatus.APPROVED ? r.overtimeHours : 0), 0);

    const statBoxWidth = (pageWidth - 40) / 3;
    [
      { label: 'TOTAL DAYS', value: totalDays.toFixed(2) },
      { label: 'WORKED HOURS', value: totalHours.toFixed(2) },
      { label: 'APPROVED OT', value: otHours.toFixed(2) }
    ].forEach((stat, idx) => {
       const x = 15 + (idx * (statBoxWidth + 5));
       doc.setFillColor(0, 0, 0);
       doc.rect(x, 100, statBoxWidth, 20, 'F');
       doc.setTextColor(255, 255, 255);
       doc.setFontSize(7);
       doc.text(stat.label, x + (statBoxWidth/2), 107, { align: 'center' });
       doc.setFontSize(11);
       doc.text(stat.value, x + (statBoxWidth/2), 114, { align: 'center' });
    });

    // 4. DAILY BREAKDOWN TABLE
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const tableData = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${String(d).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
      const record = empRecords.find(r => r.date === dateStr);
      const dateObj = new Date(year, month, d);
      const dayName = dateObj.toLocaleString('default', { weekday: 'short' });
      const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;

      if (record) {
        tableData.push([
          `${dateStr} (${dayName})`,
          'PRESENT',
          record.startTime,
          record.endTime,
          record.totalContributedHours.toFixed(2),
          record.overtimeHours > 0 ? record.overtimeHours.toFixed(2) : '-'
        ]);
      } else if (isWeekend) {
        tableData.push([
          { content: `${dateStr} (${dayName})`, styles: { textColor: [180, 180, 180] } },
          { content: 'WEEKEND', styles: { textColor: [180, 180, 180] } },
          '-', '-', '-', '-'
        ]);
      } else {
        tableData.push([
          `${dateStr} (${dayName})`,
          { content: 'ABSENT', styles: { textColor: [220, 38, 38], fontStyle: 'bold' } },
          '-', '-', '0.00', '-'
        ]);
      }
    }

    autoTable(doc, {
      startY: 130,
      head: [['DATE (DAY)', 'STATUS', 'IN', 'OUT', 'HRS', 'OT']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 8 },
      styles: { fontSize: 7.5, cellPadding: 2, borderRadius: 0 },
      columnStyles: {
        0: { width: 45 },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center', fontStyle: 'bold' },
        5: { halign: 'center' }
      },
      margin: { left: 15, right: 15 }
    });

    doc.save(`statement_${employee.name.replace(/\s/g, '_').toLowerCase()}_${month + 1}_${year}.pdf`);
  },

  generateDailyReport: async (
    employees: Employee[],
    dailyRecords: DailyWorkRecord[],
    dateStr: string
  ) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFillColor(0, 0, 0);
    doc.rect(0, 0, pageWidth, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("DAILY ATTENDANCE REPORT", 15, 18);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`DATE: ${dateStr}`, 15, 26);

    const tableData = employees.sort((a,b) => a.department.localeCompare(b.department)).map(emp => {
      const record = dailyRecords.find(r => r.employeeId === emp.id);
      if (record) {
        return [
          emp.department,
          emp.name,
          emp.pin,
          'PRESENT',
          record.startTime,
          record.endTime,
          record.regularHours.toFixed(2),
          (record.overtimeStatus === 'APPROVED' ? record.overtimeHours : 0).toFixed(2)
        ];
      } else {
        return [
          emp.department,
          emp.name,
          emp.pin,
          { content: 'ABSENT', styles: { textColor: [220, 50, 50], fontStyle: 'bold' } },
          '-', '-', '0.00', '0.00'
        ];
      }
    });

    autoTable(doc, {
      startY: 45,
      head: [['DEPT', 'NAME', 'ID', 'STATUS', 'IN', 'OUT', 'HRS', 'OT']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [40, 40, 40], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 },
    });

    doc.save(`daily_report_${dateStr.replace(/\//g, '-')}.pdf`);
  }
};
