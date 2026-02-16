
import { AttendanceLog, AttendanceAction, SystemSettings, OvertimeDecision, OvertimeStatus, DailyWorkRecord, AttendanceSession } from '../types';
import { dataService, formatDate } from './dataService';

/**
 * ATTENDANCE CALCULATOR SERVICE
 * Handles strictly logic-based time calculations derived from raw logs and settings.
 * Database is source of truth.
 */

const DISPLAY_OFFSET = 0;

// Helper to convert "HH:MM" to decimal hours (e.g. "08:30" -> 8.5)
const timeStringToDecimal = (timeStr: string): number => {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    return 0;
  }
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) {
    return 0;
  }
  return h + (m / 60);
};

export const attendanceCalculator = {

  /**
   * Main processor: Converts raw logs into calculated daily records.
   * Groups multiple sessions on the same date into a single DailyWorkRecord.
   */
  calculateEmployeeRecords: (
    employeeId: string,
    logs: AttendanceLog[],
    decisions: OvertimeDecision[],
    settings: SystemSettings
  ): DailyWorkRecord[] => {
    
    // 1. Group Logs into Sessions (Login -> Logout pairs)
    const employeeLogs = logs.filter(l => String(l.subjectId).trim() === String(employeeId).trim());
    const mockEmp = { id: employeeId, department: '', name: '' } as any; 
    const sessions = dataService.buildSessions(employeeLogs, [mockEmp]);

    // 2. Group Sessions by Date
    const sessionsByDate: Record<string, AttendanceSession[]> = {};
    sessions.forEach(s => {
      if (!sessionsByDate[s.date]) sessionsByDate[s.date] = [];
      sessionsByDate[s.date].push(s);
    });

    const dailyRecords: DailyWorkRecord[] = [];

    // System Constraints
    const dayStartDecimal = timeStringToDecimal(settings?.dayStart);
    const dayEndDecimal = timeStringToDecimal(settings?.dayEnd);
    const standardDayLength = settings?.standardDayHours || 8;
    const lunchDed = (settings?.lunchDurationMinutes || 0) / 60;
    const breakDed = (settings?.breakDurationMinutes || 0) / 60;

    const nowRaw = Date.now();
    const nowAdjusted = new Date(nowRaw - DISPLAY_OFFSET);
    const formatter = new Intl.DateTimeFormat('en-GB', { 
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Africa/Harare'
    });
    const [nowH, nowM, nowS] = formatter.format(nowAdjusted).split(':').map(Number);
    const nowDecimal = nowH + (nowM / 60) + (nowS / 3600);
    const todayDateKey = formatDate(nowAdjusted);

    Object.entries(sessionsByDate).forEach(([dateKey, daySessions]) => {
      let totalRawHours = 0;
      let totalRegularHoursBeforeDed = 0;
      let totalPotentialOvertime = 0;
      let earliestIn = '---';
      let latestOut = '---';
      let isLive = false;
      let hasNightShift = false;
      let hasMissingOut = false;

      daySessions.forEach(session => {
        let inDecimal = timeStringToDecimal(session.timeIn);
        let outDecimal = 0;
        let sessionIsLive = false;

        if (session.timeOut === 'ONSITE') {
          if (session.date === todayDateKey) {
            outDecimal = nowDecimal;
            sessionIsLive = true;
            isLive = true;
          } else {
            hasMissingOut = true;
            return;
          }
        } else {
          outDecimal = timeStringToDecimal(session.timeOut);
        }

        if (earliestIn === '---' || (session.timeIn !== '---' && inDecimal < timeStringToDecimal(earliestIn))) {
          earliestIn = session.timeIn;
        }
        if (latestOut === '---' || (session.timeOut !== 'ONSITE' && outDecimal > timeStringToDecimal(latestOut))) {
          latestOut = session.timeOut === 'ONSITE' ? 'Live' : session.timeOut;
        }

        const isNightShift = inDecimal >= dayEndDecimal || inDecimal < (dayStartDecimal - 2);
        if (isNightShift) hasNightShift = true;

        if (isNightShift) {
          if (outDecimal < inDecimal) outDecimal += 24;
          totalRegularHoursBeforeDed += (outDecimal - inDecimal);
        } else {
          const effectiveStart = Math.max(inDecimal, dayStartDecimal);
          const effectiveEndRegular = Math.min(outDecimal, dayEndDecimal);

          if (outDecimal >= dayStartDecimal || sessionIsLive) {
            totalRegularHoursBeforeDed += Math.max(0, effectiveEndRegular - effectiveStart);
            if (outDecimal > dayEndDecimal) {
              totalPotentialOvertime += (outDecimal - dayEndDecimal);
            }
          }
        }
        totalRawHours += (outDecimal > inDecimal ? outDecimal : outDecimal + 24) - inDecimal;
      });

      if (hasMissingOut && daySessions.length === 1 && daySessions[0].timeOut === 'ONSITE') {
        dailyRecords.push({
          date: dateKey, employeeId, startTime: daySessions[0].timeIn, endTime: 'MISSING',
          rawHours: 0, regularHours: 0, overtimeHours: 0, overtimeStatus: OvertimeStatus.PENDING,
          isNightShift: false, totalContributedHours: 0, dayValue: 0
        });
        return;
      }

      // Apply deductions to daily total (day shifts only)
      let finalRegularHours = totalRegularHoursBeforeDed;
      if (!hasNightShift) {
        finalRegularHours = Math.max(0, totalRegularHoursBeforeDed - lunchDed - breakDed);
      }

      const decision = decisions.find(dec => 
        String(dec.employeeId).trim() === String(employeeId).trim() && dec.date === dateKey
      );

      let finalOvertime = 0;
      let otStatus = OvertimeStatus.PENDING;

      if (totalPotentialOvertime > 0.05) {
        if (decision) {
          otStatus = decision.status;
          finalOvertime = decision.status === OvertimeStatus.APPROVED ? decision.hours : 0;
        } else {
          otStatus = OvertimeStatus.PENDING;
          finalOvertime = 0;
        }
      } else {
        otStatus = OvertimeStatus.APPROVED;
      }

      const totalContributed = finalRegularHours + finalOvertime;
      const dayValue = totalContributed / standardDayLength;

      dailyRecords.push({
        date: dateKey,
        employeeId,
        startTime: earliestIn,
        endTime: isLive ? 'Live' : latestOut,
        rawHours: totalRawHours,
        regularHours: finalRegularHours,
        overtimeHours: totalPotentialOvertime,
        overtimeStatus: otStatus,
        isNightShift: hasNightShift,
        totalContributedHours: totalContributed,
        dayValue: dayValue
      });
    });

    return dailyRecords.sort((a,b) => {
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA;
    });
  },

  /**
   * Aggregates stats for an employee list
   */
  getAggregatedStats: (
    employees: any[], 
    logs: AttendanceLog[], 
    decisions: OvertimeDecision[], 
    settings: SystemSettings
  ) => {
    return employees.map(emp => {
      const records = attendanceCalculator.calculateEmployeeRecords(emp.id, logs, decisions, settings);
      
      const totalHours = records.reduce((acc, r) => acc + (r.totalContributedHours || 0), 0);
      const totalDays = records.reduce((acc, r) => acc + (r.dayValue || 0), 0);
      
      return {
        ...emp,
        calculatedTotalHours: (totalHours || 0).toFixed(2),
        calculatedTotalDays: (totalDays || 0).toFixed(2)
      };
    });
  }
};
