
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Employee, DailyWorkRecord } from '../types';

export const pdfReportGenerator = {
  generateMonthlyReport: (
    employees: Employee[],
    allRecords: DailyWorkRecord[], // Records already filtered by month by the caller
    reportTitle: string
  ) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    // --- BRANDING & HEADER ---
    doc.setFillColor(0, 0, 0); // Black Header bar
    doc.rect(0, 0, pageWidth, 25, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text("KNOCKOUT INDUSTRIES", 14, 12);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 200, 200);
    doc.text("Biometric Attendance & Payroll Support", 14, 18);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text(reportTitle.toUpperCase(), pageWidth - 14, 16, { align: 'right' });

    // --- SUMMARY STATISTICS ---
    let totalHours = 0;
    let totalOT = 0;
    
    // Calculate global stats for this report
    employees.forEach(emp => {
      const empRecords = allRecords.filter(r => r.employeeId === emp.id);
      totalHours += empRecords.reduce((acc, r) => acc + r.totalContributedHours, 0);
      totalOT += empRecords.reduce((acc, r) => acc + (r.overtimeStatus === 'APPROVED' ? r.overtimeHours : 0), 0);
    });

    const startY = 35;
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("EXECUTIVE SUMMARY", 14, startY);
    
    // Summary Box
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 250, 250);
    doc.rect(14, startY + 3, pageWidth - 28, 18, 'FD');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    doc.text(`Total Personnel: ${employees.length}`, 20, startY + 14);
    doc.text(`Total Hours: ${totalHours.toFixed(1)}`, 80, startY + 14);
    doc.text(`Total Approved OT: ${totalOT.toFixed(1)}`, 140, startY + 14);

    // --- DEPARTMENTAL TABLES ---
    const depts = Array.from(new Set(employees.map(e => e.department))).sort();
    let currentY = startY + 30;

    depts.forEach((dept) => {
      const deptEmployees = employees.filter(e => e.department === dept);
      if (deptEmployees.length === 0) return;

      // Group Title
      doc.setFontSize(11);
      doc.setTextColor(0, 100, 0); // Dark Green
      doc.setFont('helvetica', 'bold');
      doc.text(dept.toUpperCase(), 14, currentY);
      currentY += 4;

      const tableData = deptEmployees.map(emp => {
        const empRecords = allRecords.filter(r => r.employeeId === emp.id);
        
        const empTotalHours = empRecords.reduce((acc, r) => acc + r.totalContributedHours, 0);
        const empTotalDays = empRecords.reduce((acc, r) => acc + r.dayValue, 0);
        const empOvertime = empRecords.reduce((acc, r) => acc + (r.overtimeStatus === 'APPROVED' ? r.overtimeHours : 0), 0);
        const otDays = empOvertime / 8; // Standard 8h divisor for display

        return [
          emp.name,
          emp.pin, // ID
          empTotalDays.toFixed(2),
          empTotalHours.toFixed(2),
          empOvertime.toFixed(2),
          otDays.toFixed(2)
        ];
      });

      (doc as any).autoTable({
        startY: currentY,
        head: [['Employee Name', 'ID', 'Days Worked', 'Total Hours', 'OT Hours', 'OT Days']],
        body: tableData,
        theme: 'grid',
        headStyles: { fillColor: [40, 40, 40], textColor: 255, fontSize: 8, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2, textColor: 50 },
        columnStyles: {
          0: { fontStyle: 'bold' }, // Name
          3: { halign: 'right' }, // Hours
          4: { halign: 'right', textColor: [0, 128, 0] } // OT
        },
        margin: { left: 14, right: 14 }
      });

      currentY = (doc as any).lastAutoTable.finalY + 12;
    });

    // --- FOOTER ---
    const footerY = doc.internal.pageSize.height - 20;
    doc.setDrawColor(200, 200, 200);
    doc.line(14, footerY, pageWidth - 14, footerY);
    
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(`Generated on ${new Date().toLocaleString()}`, 14, footerY + 5);
    doc.text("Certified True Copy - Knockout Industries", pageWidth - 14, footerY + 5, { align: 'right' });

    // Filename sanitization
    const safeTitle = reportTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`${safeTitle}.pdf`);
  }
};
