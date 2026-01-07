
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  where,
  deleteDoc,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  writeBatch
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "../backend/firebase";
import { Employee, AttendanceLog, LogStatus, AttendanceAction, SystemSettings, Notice, AttendanceSession, Department, InformalLog, OvertimeRequest } from "../types";

const EMPLOYEES_COL = "employees";
const LOGS_COL = "logs";
const VISITOR_LOGS_COL = "visitor_logs";
const INFORMAL_LOGS_COL = "informal_logs";
const SETTINGS_DOC = "config/system";
const NOTICES_COL = "notices";
const DEPARTMENTS_COL = "departments";
const FREQUENT_VISITORS_COL = "frequent_visitors";
const OVERTIME_REQUESTS_COL = "overtime_requests";

const normalizeTs = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts?.seconds) return ts.seconds * 1000;
  return 0;
};

/**
 * Parses a "HH:mm" time string and applies it to a given date object.
 */
const applyTimeToDate = (date: Date, timeStr: string): Date => {
  const newDate = new Date(date);
  const [hours, minutes] = timeStr.split(':').map(Number);
  newDate.setHours(hours, minutes, 0, 0);
  return newDate;
};


export const dataService = {
  // =================================================================
  // NEW CORE CALCULATION LOGIC
  // =================================================================
  calculateEmployeeAttendance: (logs: AttendanceLog[], settings: SystemSettings) => {
    const dailyData: { [date: string]: { workedHours: number; overtimeHours: number; logs: AttendanceLog[] } } = {};

    // 1. Pair up LOGIN and LOGOUT events
    const sortedLogs = logs.sort((a, b) => normalizeTs(a.timestamp) - normalizeTs(b.timestamp));
    const sessions: { login: AttendanceLog; logout: AttendanceLog | null }[] = [];
    let currentSession: { login: AttendanceLog; logout: AttendanceLog | null } | null = null;

    for (const log of sortedLogs) {
      if (log.action === AttendanceAction.LOGIN) {
        if (currentSession) { sessions.push(currentSession); } // Push previous session if it's open
        currentSession = { login: log, logout: null };
      } else if (log.action === AttendanceAction.LOGOUT && currentSession) {
        currentSession.logout = log;
        sessions.push(currentSession);
        currentSession = null;
      }
    }
    if (currentSession) { sessions.push(currentSession); } // Add the last open session

    // 2. Calculate hours for each session
    for (const session of sessions) {
      if (!session.logout) continue; // Skip sessions that are not closed

      const loginTime = normalizeTs(session.login.timestamp);
      const logoutTime = normalizeTs(session.logout.timestamp);
      
      const loginDate = new Date(loginTime);
      loginDate.setHours(0, 0, 0, 0); // Start of the login day

      let dayStart = applyTimeToDate(loginDate, settings.dayStart);
      let dayEnd = applyTimeToDate(loginDate, settings.dayEnd);
      
      const isNightShift = dayEnd.getTime() < dayStart.getTime();

      if (isNightShift) {
        // For a night shift, the end of the workday is always on the next calendar day.
        dayEnd.setDate(dayEnd.getDate() + 1);
      }

      // Calculate effective work period (intersection of actual work and official workday)
      const effectiveLogin = Math.max(loginTime, dayStart.getTime());
      const effectiveLogout = Math.min(logoutTime, dayEnd.getTime());

      let sessionWorkedHours = 0;
      if (effectiveLogout > effectiveLogin) {
        sessionWorkedHours = (effectiveLogout - effectiveLogin) / (1000 * 60 * 60);
      }

      // Subtract breaks for day shifts
      if (!isNightShift) {
        const totalBreakMinutes = (settings.lunchTime || 0) + (settings.breakTime || 0);
        const breakHours = totalBreakMinutes / 60;
        sessionWorkedHours = Math.max(0, sessionWorkedHours - breakHours);
      }

      // Calculate overtime
      let sessionOvertimeHours = 0;
      if (logoutTime > dayEnd.getTime()) {
        sessionOvertimeHours = (logoutTime - dayEnd.getTime()) / (1000 * 60 * 60);
      }

      const dateKey = new Date(loginTime).toLocaleDateString('en-GB');
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = { workedHours: 0, overtimeHours: 0, logs: [] };
      }

      dailyData[dateKey].workedHours += sessionWorkedHours;
      dailyData[dateKey].overtimeHours += sessionOvertimeHours;
      dailyData[dateKey].logs.push(session.login, session.logout);
    }

    return dailyData;
  },

  // =================================================================
  // EXISTING SERVICES (Some may need refactoring)
  // =================================================================

  subscribeToLiveScans: (callback: (log: any) => void) => {
    const scanRef = ref(rtdb, 'live_scans/latest');
    return onValue(scanRef, (snapshot) => {
      const data = snapshot.val();
      if (data && Date.now() - normalizeTs(data.timestamp) < 15000) {
        callback({ ...data, subjectName: data.subjectName || data.name || "Personnel Identified" });
      }
    });
  },

  getEmployees: async (): Promise<Employee[]> => {
    const q = query(collection(db, EMPLOYEES_COL), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
  },

  getLogsForEmployee: async (employeeId: string): Promise<AttendanceLog[]> => {
    const q = query(
      collection(db, LOGS_COL),
      where("subjectId", "==", employeeId),
      orderBy("timestamp", "asc")
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));
  },

  getLogs: async (max: number = 2000): Promise<AttendanceLog[]> => {
    const q = query(collection(db, LOGS_COL), orderBy("timestamp", "desc"), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));
  },

  getUserLastAction: async (subjectId: string): Promise<AttendanceAction | null> => {
    const q = query(
      collection(db, LOGS_COL), 
      where("subjectId", "==", String(subjectId).trim()), 
      orderBy("timestamp", "desc"), 
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    return (snap.docs[0].data() as AttendanceLog).action;
  },

  processVerification: async (employee: Employee, action: AttendanceAction, confidence: number): Promise<{ success: boolean; error?: string }> => {
    try {
      await dataService.addLog({
        subjectId: String(employee.id).trim(),
        subjectName: employee.name,
        timestamp: Date.now(),
        status: LogStatus.SUCCESS,
        action: action,
        confidence: confidence,
        type: 'EMPLOYEE'
      });
      console.log(`[ATTENDANCE] ${action} successful for ${employee.name}`);
      return { success: true };
    } catch (e: any) {
      console.error(`[ATTENDANCE] Error processing ${action} for ${employee.name}:`, e);
      return { success: false, error: e.message };
    }
  },

  addLog: async (log: Omit<AttendanceLog, 'id'>): Promise<void> => {
    await addDoc(collection(db, LOGS_COL), log);
  },

  getSettings: async (): Promise<SystemSettings> => {
    const docRef = doc(db, SETTINGS_DOC);
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data() as SystemSettings;
    return {
      lateThreshold: "09:00", earlyThreshold: "08:00", dayStart: "06:00",
      dayEnd: "18:00", lunchTime: 60, breakTime: 15, outsideLogin: "07:00",
      outsideLogout: "17:00", companyMotto: "Excellence", companyContact: "Support",
    };
  },

  updateSettings: async (settings: SystemSettings) => {
    const docRef = doc(db, SETTINGS_DOC);
    await setDoc(docRef, settings, { merge: true });
  },

  updateEmployee: async (id: string, employee: Partial<Employee>): Promise<void> => {
    await setDoc(doc(db, EMPLOYEES_COL, String(id).trim()), employee, { merge: true });
  },

  addEmployee: async (employee: Omit<Employee, 'id' | 'createdAt' | 'qrCodeData'>): Promise<Employee> => {
    const qrCodeData = `EMP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const newEmp = { ...employee, qrCodeData, createdAt: Date.now(), totalDaysWorked: 0 };
    const docRef = await addDoc(collection(db, EMPLOYEES_COL), newEmp);
    return { id: docRef.id, ...newEmp } as Employee;
  },

  deleteEmployee: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, EMPLOYEES_COL, String(id).trim()));
  },

  getDepartments: async (): Promise<Department[]> => {
    const q = query(collection(db, DEPARTMENTS_COL), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Department));
  },

  addDepartment: async (name: string): Promise<Department> => {
    const docRef = await addDoc(collection(db, DEPARTMENTS_COL), { name });
    return { id: docRef.id, name };
  },

  updateDepartment: async (id: string, name: string): Promise<void> => {
    await updateDoc(doc(db, DEPARTMENTS_COL, id), { name });
  },

  deleteDepartment: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, DEPARTMENTS_COL, id));
  },

  getOvertimeRequests: async (): Promise<OvertimeRequest[]> => {
    const q = query(collection(db, OVERTIME_REQUESTS_COL), orderBy("date", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as OvertimeRequest));
  },

  // Note: Overtime approval now just updates the status. The UI will recalculate totals.
  updateOvertimeRequest: async (id: string, status: 'APPROVED' | 'DENIED'): Promise<void> => {
    const requestRef = doc(db, OVERTIME_REQUESTS_COL, id);
    await updateDoc(requestRef, { status });
  },

  createOvertimeRequest: async (req: Omit<OvertimeRequest, 'id' | 'status'>): Promise<void> => {
    // Check if a request already exists for this employee and date
    const q = query(
      collection(db, OVERTIME_REQUESTS_COL),
      where("employeeId", "==", req.employeeId),
      where("date", "==", req.date)
    );
    const existing = await getDocs(q);
    if (existing.empty) {
      await addDoc(collection(db, OVERTIME_REQUESTS_COL), { ...req, status: 'PENDING' });
    }
  },

  generateReport: async (): Promise<string> => {
    const [employees, allLogs, settings, departments, overtimeRequests] = await Promise.all([
        dataService.getEmployees(),
        dataService.getLogs(5000), // Fetch a larger log set for reporting
        dataService.getSettings(),
        dataService.getDepartments(),
        dataService.getOvertimeRequests()
    ]);

    const approvedOvertime: { [key: string]: number } = {}; // key: "employeeId-date"
    overtimeRequests.filter(r => r.status === 'APPROVED').forEach(r => {
        approvedOvertime[`${r.employeeId}-${r.date}`] = r.hours;
    });

    const headers = ["Department", "Employee", "Days Worked", "Hours Worked", "Overtime (Hours)", "Overtime (Days)"];

    const empMap = new Map(employees.map(e => [e.id, e]));
    const deptMap = new Map(departments.map(d => [d.id, d.name]));

    const employeeReportData: { [empId: string]: { totalWorkedHours: number; totalOvertimeHours: number } } = {};

    for (const employee of employees) {
        const employeeLogs = allLogs.filter(log => log.subjectId === employee.id);
        const attendance = dataService.calculateEmployeeAttendance(employeeLogs, settings);

        let totalWorkedHours = 0;
        let totalOvertimeHours = 0;

        Object.entries(attendance).forEach(([date, data]) => {
            const approved = approvedOvertime[`${employee.id}-${date}`] || 0;
            // Add regular worked hours and any approved overtime to the total
            totalWorkedHours += data.workedHours + approved;
            totalOvertimeHours += approved;
        });

        employeeReportData[employee.id] = { totalWorkedHours, totalOvertimeHours };
    }

    const [startH, startM] = settings.dayStart.split(':').map(Number);
    const [endH, endM] = settings.dayEnd.split(':').map(Number);
    let dayLengthHours = (endH - startH) + (endM - startM) / 60;
    if (dayLengthHours <= 0) dayLengthHours += 24; // Adjust for night shifts

    const rows = employees.map(emp => {
        const reportData = employeeReportData[emp.id] || { totalWorkedHours: 0, totalOvertimeHours: 0 };
        const totalDaysWorked = dayLengthHours > 0 ? (reportData.totalWorkedHours / dayLengthHours).toFixed(2) : '0.00';
        const overtimeInDays = dayLengthHours > 0 ? (reportData.totalOvertimeHours / dayLengthHours).toFixed(2) : '0.00';

        return [
            deptMap.get(emp.department) || 'N/A',
            emp.name,
            totalDaysWorked,
            reportData.totalWorkedHours.toFixed(2),
            reportData.totalOvertimeHours.toFixed(2),
            overtimeInDays
        ].join(",");
    });

    // Group by department
    rows.sort((a, b) => a.split(',')[0].localeCompare(b.split(',')[0]));

    return [headers.join(","), ...rows].join("\n");
  },

  // Other functions remain, but are omitted for brevity...
  getHarareTime: async (): Promise<Date> => {
    try {
      const response = await fetch('https://worldtimeapi.org/api/timezone/Africa/Harare');
      if (!response.ok) throw new Error("API Unreachable");
      const data = await response.json();
      return new Date(data.datetime);
    } catch (e) {
      return new Date();
    }
  },

  getNotices: async (): Promise<Notice[]> => {
    const q = query(collection(db, NOTICES_COL), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice));
  },
};
