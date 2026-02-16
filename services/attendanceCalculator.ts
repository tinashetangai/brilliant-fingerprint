
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
   * Main processor: Converts raw logs into calculated daily records
   */
  calculateEmployeeRecords: (
    employeeId: string,
    logs: AttendanceLog[],
    decisions: OvertimeDecision[],
    settings: SystemSettings
  ): DailyWorkRecord[] => {
    
    // 1. Group Logs into Sessions (Login -> Logout pairs)
    const employeeLogs = logs.filter(l => String(l.subjectId).trim() === String(employeeId).trim());
    // Mock employee object for the buildSessions signature
    const mockEmp = { id: employeeId, department: '', name: '' } as any; 
    const sessions = dataService.buildSessions(employeeLogs, [mockEmp]);

    const dailyRecords: DailyWorkRecord[] = [];

    // System Constraints
    const dayStartDecimal = timeStringToDecimal(settings?.dayStart);
    const dayEndDecimal = timeStringToDecimal(settings?.dayEnd);
    const standardDayLength = settings?.standardDayHours || 8;
    const lunchDed = (settings?.lunchDurationMinutes || 0) / 60;
    const breakDed = (settings?.breakDurationMinutes || 0) / 60;

    // Time Context for Live Calculations
    // Shift the reference "now" by the display offset so that Live durations match displayed timestamps
    const nowRaw = Date.now();
    const nowAdjusted = new Date(nowRaw - DISPLAY_OFFSET);

    // ENABLE SECONDS PRECISION FOR LIVE COUNTING
    const formatter = new Intl.DateTimeFormat('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: false, 
      timeZone: 'Africa/Harare' 
    });
    
    const [nowH, nowM, nowS] = formatter.format(nowAdjusted).split(':').map(Number);
    // Include seconds in the decimal calculation (1 hour = 3600 seconds)
    const nowDecimal = nowH + (nowM / 60) + (nowS / 3600);
    
    const todayDateKey = formatDate(nowAdjusted);

    sessions.forEach(session => {
      let inDecimal = timeStringToDecimal(session.timeIn);
      let outDecimal = 0;
      let isLive = false;

      // --- LIVE SESSION & ORPHAN HANDLING ---
      if (session.timeOut === 'ONSITE') {
        if (session.date === todayDateKey) {
          // It's today, so they are currently working
          outDecimal = nowDecimal;
          isLive = true;
        } else {
          // It's a past date (orphan session). 
          dailyRecords.push({
            date: session.date,
            employeeId,
            startTime: session.timeIn,
            endTime: 'MISSING', 
            rawHours: 0,
            regularHours: 0,
            overtimeHours: 0,
            overtimeStatus: OvertimeStatus.PENDING,
            isNightShift: false,
            totalContributedHours: 0,
            dayValue: 0
          });
          return; 
        }
      } else {
        outDecimal = timeStringToDecimal(session.timeOut);
      }

      // Night Shift Detection
      const isNightShift = inDecimal >= dayEndDecimal || inDecimal < (dayStartDecimal - 2); 

      let regularHours = 0;
      let potentialOvertime = 0;

      if (isNightShift) {
        // --- NIGHT SHIFT RULES ---
        if (outDecimal < inDecimal) outDecimal += 24; 
        regularHours = outDecimal - inDecimal;
        
      } else {
        // --- DAY SHIFT RULES ---
        const effectiveStart = Math.max(inDecimal, dayStartDecimal);
        let effectiveEndRegular = Math.min(outDecimal, dayEndDecimal);
        
        if (outDecimal < dayStartDecimal && !isLive) return; 

        let duration = Math.max(0, effectiveEndRegular - effectiveStart);

        if (duration > 5) {
          duration = Math.max(0, duration - lunchDed - breakDed);
        }

        regularHours = duration;

        if (outDecimal > dayEndDecimal) {
          potentialOvertime = outDecimal - dayEndDecimal;
        }
      }

      const decision = decisions.find(dec => 
        String(dec.employeeId).trim() === String(employeeId).trim() && 
        dec.date === session.date
      );

      let finalOvertime = 0;
      let otStatus = OvertimeStatus.PENDING;

      if (potentialOvertime > 0.05) { 
        if (decision) {
          otStatus = decision.status;
          if (decision.status === OvertimeStatus.APPROVED) {
            finalOvertime = decision.hours; 
          } else {
            finalOvertime = 0;
          }
        } else {
          finalOvertime = 0; 
          otStatus = OvertimeStatus.PENDING;
        }
      } else {
        otStatus = OvertimeStatus.APPROVED; 
      }

      const totalContributed = regularHours + finalOvertime;
      const dayValue = totalContributed / standardDayLength;

      dailyRecords.push({
        date: session.date,
        employeeId,
        startTime: session.timeIn,
        endTime: isLive ? 'Live' : session.timeOut,
        rawHours: (outDecimal > inDecimal ? outDecimal : outDecimal + 24) - inDecimal,
        regularHours: regularHours,
        overtimeHours: potentialOvertime,
        overtimeStatus: otStatus,
        isNightShift,
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
