
import { AttendanceLog, AttendanceAction, SystemSettings, OvertimeDecision, OvertimeStatus, DailyWorkRecord, AttendanceSession } from '../types';
import { dataService } from './dataService';

/**
 * ATTENDANCE CALCULATOR SERVICE
 * Handles strictly logic-based time calculations derived from raw logs and settings.
 * Database is source of truth.
 */

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
    const now = new Date();
    // We use a formatter to ensure we get the time in the correct timezone context (Harare/App usage)
    const formatter = new Intl.DateTimeFormat('en-GB', { 
      hour: '2-digit', 
      minute: '2-digit', 
      hour12: false, 
      timeZone: 'Africa/Harare' 
    });
    const [nowH, nowM] = formatter.format(now).split(':').map(Number);
    const nowDecimal = nowH + (nowM / 60);
    const todayDateKey = now.toLocaleDateString('en-GB', { timeZone: 'Africa/Harare' });

    sessions.forEach(session => {
      // Parse Date
      const [d, m, y] = session.date.split('/').map(Number);
      
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
          // Rule: If they forgot to logout, we cap it at Day End to avoid massive 24h+ shifts.
          outDecimal = dayEndDecimal; 
        }
      } else {
        outDecimal = timeStringToDecimal(session.timeOut);
      }

      // Night Shift Detection
      // Logic: If start time is very late (>= DayEnd) OR very early (< DayStart - buffer)
      const isNightShift = inDecimal >= dayEndDecimal || inDecimal < (dayStartDecimal - 2); 

      let regularHours = 0;
      let potentialOvertime = 0;

      if (isNightShift) {
        // --- NIGHT SHIFT RULES ---
        // Simple duration, handling midnight crossover
        if (outDecimal < inDecimal) outDecimal += 24; 
        regularHours = outDecimal - inDecimal;
        
      } else {
        // --- DAY SHIFT RULES ---
        
        // 1. Start Time Logic: Ignore early login
        const effectiveStart = Math.max(inDecimal, dayStartDecimal);
        
        // 2. End Time Logic: Cap regular hours at Day End
        let effectiveEndRegular = Math.min(outDecimal, dayEndDecimal);
        
        // Safety: If logged out before start, it's 0 (unless live and just arrived)
        if (outDecimal < dayStartDecimal && !isLive) return; 

        // 3. Calculate Raw Duration
        let duration = Math.max(0, effectiveEndRegular - effectiveStart);

        // 4. Deductions (Lunch & Break)
        // Deduct only if duration is substantial (e.g. > 5 hours) to avoid negative short shifts
        if (duration > 5) {
          duration = Math.max(0, duration - lunchDed - breakDed);
        }

        regularHours = duration;

        // 5. Overtime Calculation
        // OT is anything after Day End
        if (outDecimal > dayEndDecimal) {
          potentialOvertime = outDecimal - dayEndDecimal;
        }
      }

      // --- OVERTIME DECISION CHECK ---
      const decision = decisions.find(dec => 
        String(dec.employeeId).trim() === String(employeeId).trim() && 
        dec.date === session.date
      );

      let finalOvertime = 0;
      let otStatus = OvertimeStatus.PENDING;

      if (potentialOvertime > 0.05) { // Ignore insignificant OT (< 3 mins)
        if (decision) {
          otStatus = decision.status;
          if (decision.status === OvertimeStatus.APPROVED) {
            finalOvertime = decision.hours; 
          } else {
            finalOvertime = 0;
          }
        } else {
          // No decision yet -> Pending. Not counted in total yet.
          finalOvertime = 0;
          otStatus = OvertimeStatus.PENDING;
        }
      } else {
        // No OT worked
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
        regularHours: parseFloat(regularHours.toFixed(2)),
        overtimeHours: parseFloat(potentialOvertime.toFixed(2)),
        overtimeStatus: otStatus,
        isNightShift,
        totalContributedHours: parseFloat(totalContributed.toFixed(2)),
        dayValue: parseFloat(dayValue.toFixed(2))
      });
    });

    // Sort descending by date
    return dailyRecords.sort((a,b) => {
      const [da, ma, ya] = a.date.split('/').map(Number);
      const [db, mb, yb] = b.date.split('/').map(Number);
      return new Date(yb, mb-1, db).getTime() - new Date(ya, ma-1, da).getTime();
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
        calculatedTotalHours: (totalHours || 0).toFixed(1),
        calculatedTotalDays: (totalDays || 0).toFixed(1)
      };
    });
  }
};
