
import { AttendanceLog, SystemSettings } from '../types';

interface DailyAttendance {
  date: string;
  workedHours: number;
  overtimeHours: number;
  approvedOvertimeHours: number;
}

interface AttendanceCalculationResult {
  dailyRecords: DailyAttendance[];
  totalWorkedHours: number;
  totalOvertimeHours: number;
  totalApprovedOvertimeHours: number;
  totalDaysWorked: number;
}

const parseTimeToDate = (timeStr: string, date: Date): Date => {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const newDate = new Date(date);
  newDate.setHours(hours, minutes, 0, 0);
  return newDate;
};

export const attendanceCalculator = {
  calculateEmployeeAttendance: (
    logs: AttendanceLog[],
    settings: SystemSettings,
    approvedOvertime: any[] = []
  ): AttendanceCalculationResult => {
    const dailyLogs: { [key: string]: AttendanceLog[] } = {};
    const approvedOvertimeMap: { [key: string]: number } = {};

    approvedOvertime.forEach(ot => {
      approvedOvertimeMap[ot.date] = (approvedOvertimeMap[ot.date] || 0) + ot.hours;
    });

    logs.forEach(log => {
      const date = new Date(log.timestamp).toLocaleDateString('en-GB');
      if (!dailyLogs[date]) {
        dailyLogs[date] = [];
      }
      dailyLogs[date].push(log);
    });

    const dailyRecords: DailyAttendance[] = [];
    let totalWorkedHours = 0;
    let totalOvertimeHours = 0;
    let totalApprovedOvertimeHours = 0;

    for (const date in dailyLogs) {
      const logsForDay = dailyLogs[date].sort((a, b) => a.timestamp - b.timestamp);
      let dayWorkedHours = 0;
      let dayOvertimeHours = 0;

      const dayStart = parseTimeToDate(settings.dayStart, new Date(logsForDay[0].timestamp));
      let dayEnd = parseTimeToDate(settings.dayEnd, new Date(logsForDay[0].timestamp));

      const isNightShift = dayEnd < dayStart;
      if (isNightShift) {
        dayEnd.setDate(dayEnd.getDate() + 1);
      }

      let loginTime: number | null = null;

      for (const log of logsForDay) {
        if (log.action === 'LOGIN' && !loginTime) {
          loginTime = Math.max(log.timestamp, dayStart.getTime());
        } else if (log.action === 'LOGOUT' && loginTime) {
          const logoutTime = log.timestamp;
          const effectiveLogoutTime = Math.min(logoutTime, dayEnd.getTime());

          if (effectiveLogoutTime > loginTime) {
            dayWorkedHours += (effectiveLogoutTime - loginTime) / (1000 * 60 * 60);
          }

          if (logoutTime > dayEnd.getTime()) {
            dayOvertimeHours += (logoutTime - dayEnd.getTime()) / (1000 * 60 * 60);
          }
          loginTime = null;
        }
      }

      if (dayWorkedHours > 0 && !isNightShift) {
        const deduction = ((settings.lunchTime || 0) + (settings.breakTime || 0)) / 60;
        dayWorkedHours = Math.max(0, dayWorkedHours - deduction);
      }

      const approvedHours = approvedOvertimeMap[date] || 0;

      dailyRecords.push({
        date,
        workedHours: dayWorkedHours,
        overtimeHours: dayOvertimeHours,
        approvedOvertimeHours: approvedHours,
      });

      totalWorkedHours += dayWorkedHours + approvedHours;
      totalOvertimeHours += dayOvertimeHours;
      totalApprovedOvertimeHours += approvedHours;
    }

    const standardDayLength = settings.standardDayLength || 8;
    const totalDaysWorked = totalWorkedHours / standardDayLength;

    return {
      dailyRecords,
      totalWorkedHours,
      totalOvertimeHours,
      totalApprovedOvertimeHours,
      totalDaysWorked,
    };
  },
};
