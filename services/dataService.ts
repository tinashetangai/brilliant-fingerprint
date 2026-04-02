
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
  writeBatch,
  onSnapshot
} from "firebase/firestore";
import { ref, onValue } from "firebase/database";
import { db, rtdb } from "./firebase";
import { Employee, AttendanceLog, LogStatus, AttendanceAction, SystemSettings, Notice, AttendanceSession, Department, InformalLog, FrequentVisitor, OvertimeDecision } from "../types";
import { SEED_EMPLOYEES } from './seedData';
import { formatDate } from './dateUtils';

const EMPLOYEES_COL = "employees";
const DAILY_LOGS_COL = "day_by_day_logs";
const VISITOR_LOGS_COL = "visitor_logs";
const INFORMAL_LOGS_COL = "informal_logs";
const SETTINGS_DOC = "config/system";
const NOTICES_COL = "notices";
const DEPARTMENTS_COL = "departments";
const FREQUENT_VISITORS_COL = "frequent_visitors";
const OVERTIME_DECISIONS_COL = "overtime_decisions";

// --- SYSTEM TIME OFFSET CONFIG ---
const TIME_OFFSET = 0;

// --- CLOUDFLARE WORKER URL ---
const WORKER_URL = "https://knockout-attendance-worker.mordenfarm1677.workers.dev"; 

const normalizeTs = (ts: any): number => {
  if (!ts) return 0;
  let raw = 0;
  if (typeof ts === 'number') raw = ts < 1e12 ? ts * 1000 : ts;
  else if (typeof ts === 'string') raw = new Date(ts).getTime();
  else if (ts?.seconds) raw = ts.seconds * 1000;
  return raw;
};

export const dataService = {
  subscribeToLiveScans: (callback: (log: any) => void) => {
    const scanRef = ref(rtdb, 'live_scans/latest');
    return onValue(scanRef, (snapshot) => {
      const data = snapshot.val();
      if (data && Date.now() - (data.timestamp < 1e12 ? data.timestamp * 1000 : data.timestamp) < 15000) { 
        callback({
          ...data,
          timestamp: normalizeTs(data.timestamp),
          subjectName: data.subjectName || data.name || "Personnel Identified"
        });
      }
    });
  },

  subscribeToRecentLogs: (callback: (logs: AttendanceLog[]) => void) => {
    const todayStr = dataService.getTodayStr();
    const docRef = doc(db, DAILY_LOGS_COL, todayStr);

    return onSnapshot(docRef, (snapshot) => {
      if (!snapshot.exists()) {
        callback([]);
        return;
      }
      const data = snapshot.data();
      const logs = dataService.parseDailyDocToLogs(todayStr, data);
      callback(logs);
    }, (error) => {
      // Silent fail
    });
  },

  parseDailyDocToLogs: (dateStr: string, data: any): AttendanceLog[] => {
    const logs: AttendanceLog[] = [];
    const users = data.users || {};

    const parseTime = (dStr: string, tStr: string): number => {
      try {
        const parts = dStr.split(' ');
        if (parts.length !== 3) return 0;
        const day = parseInt(parts[0]);
        const monthStr = parts[1];
        const year = parseInt(parts[2]);
        const months: Record<string, number> = {
          Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
          Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
        };
        const [h, m] = tStr.split(':').map(Number);
        // CAT is UTC+2, so subtract 2 from hours for UTC timestamp
        return Date.UTC(year, months[monthStr], day, h - 2, m, 0);
      } catch (e) {
        return 0;
      }
    };

    for (const [userId, userLog] of Object.entries(users) as any) {
      if (userLog.login) {
        logs.push({
          id: `${userId}_login_${dateStr}`,
          subjectId: userId,
          subjectName: userLog.name,
          timestamp: userLog.loginTs || parseTime(dateStr, userLog.login),
          action: AttendanceAction.LOGIN,
          status: LogStatus.SUCCESS,
          type: 'EMPLOYEE',
          date: dateStr
        });
      }
      if (userLog.logout) {
        logs.push({
          id: `${userId}_logout_${dateStr}`,
          subjectId: userId,
          subjectName: userLog.name,
          timestamp: userLog.logoutTs || parseTime(dateStr, userLog.logout),
          action: AttendanceAction.LOGOUT,
          status: LogStatus.SUCCESS,
          type: 'EMPLOYEE',
          date: dateStr
        });
      }
    }
    return logs.sort((a,b) => b.timestamp - a.timestamp);
  },

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

  verifyPin: async (pin: string): Promise<Employee | null> => {
    try {
      const response = await fetch(`${WORKER_URL}/api/auth/pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data.success && data.employee) return data.employee as Employee;
      return null;
    } catch (error: any) {
      throw new Error(error.message || "Cloud Link Offline");
    }
  },

  getNotices: async (): Promise<Notice[]> => {
    const q = query(collection(db, NOTICES_COL), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Notice));
  },

  getEmployees: async (): Promise<Employee[]> => {
    const q = query(collection(db, EMPLOYEES_COL), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Employee));
  },

  toggleSalesStatus: async (employeeId: string, isSales: boolean): Promise<void> => {
    await updateDoc(doc(db, EMPLOYEES_COL, String(employeeId).trim()), { isSales });
  },

  ensureSalesLogs: async (): Promise<void> => {
    // This logic needs update if we want to support daily_logs.
    // For now, let's keep it simple or skip as it's a specific feature.
    // The worker handles regular logs anyway.
  },

  buildSessions: (logs: AttendanceLog[], employees: Employee[]): AttendanceSession[] => {
    const empMap = employees.reduce((acc, e) => ({ ...acc, [e.id]: e.department }), {} as Record<string, string>);
    const sortedLogs = [...logs]
      .filter(l => l.status === LogStatus.SUCCESS)
      .sort((a, b) => a.timestamp - b.timestamp);
    const sessionsBySubject: Record<string, AttendanceSession[]> = {};

    sortedLogs.forEach(log => {
      const constTS = log.timestamp;
      const dateKey = log.date || formatDate(constTS);
      const subjectId = String(log.subjectId).trim();
      if (!sessionsBySubject[subjectId]) sessionsBySubject[subjectId] = [];
      const userSessions = sessionsBySubject[subjectId];

      if (log.action === AttendanceAction.LOGIN) {
        userSessions.push({
          subjectId: subjectId,
          name: log.subjectName,
          date: dateKey,
          timeIn: new Date(constTS).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare' }),
          timeOut: 'ONSITE',
          department: empMap[log.subjectId] || 'External',
          type: log.type || (subjectId.startsWith('visitor') ? 'VISITOR' : 'EMPLOYEE'),
          loginLogId: log.id
        });
      } else if (log.action === AttendanceAction.LOGOUT) {
        const activeSession = userSessions.slice().reverse().find(s => s.timeOut === 'ONSITE' && s.date === dateKey);
        if (activeSession) {
          activeSession.timeOut = new Date(constTS).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare' });
          activeSession.logoutLogId = log.id;
        } else {
          userSessions.push({
            subjectId: subjectId,
            name: log.subjectName,
            date: dateKey,
            timeIn: '---',
            timeOut: new Date(constTS).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare' }),
            department: empMap[log.subjectId] || 'External',
            type: log.type || (subjectId.startsWith('visitor') ? 'VISITOR' : 'EMPLOYEE'),
            logoutLogId: log.id
          });
        }
      }
    });

    return Object.values(sessionsBySubject).flat().sort((a, b) => {
      // Comparison logic for "DD MMM YYYY"
      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return b.timeIn.localeCompare(a.timeIn);
    });
  },

  getAttendanceSessions: async (logsInput?: AttendanceLog[]): Promise<AttendanceSession[]> => {
    let logs = logsInput;
    if (!logs) {
      logs = await dataService.getLogs(500);
    }
    const employees = await dataService.getEmployees();
    return dataService.buildSessions(logs, employees);
  },

  batchAddLogs: async (logs: Omit<AttendanceLog, 'id'>[]): Promise<{ count: number }> => {
    return dataService.batchAddLogsDirectly(logs);
  },

  batchAddLogsDirectly: async (logs: Omit<AttendanceLog, 'id'>[]): Promise<{ count: number }> => {
    if (logs.length === 0) return { count: 0 };

    // Group logs by date
    const logsByDate: Record<string, Omit<AttendanceLog, 'id'>[]> = {};
    logs.forEach(l => {
        const d = l.date || formatDate(l.timestamp);
        if (!logsByDate[d]) logsByDate[d] = [];
        logsByDate[d].push(l);
    });

    for (const [dateStr, dayLogs] of Object.entries(logsByDate)) {
        const docRef = doc(db, DAILY_LOGS_COL, dateStr);
        const snap = await getDoc(docRef);

        const dateBase = new Date(dayLogs[0].timestamp);
        dateBase.setUTCHours(0, 0, 0, 0);

        if (!snap.exists()) {
            await setDoc(docRef, {
                date: dateStr,
                dateTs: dateBase.getTime(),
                users: {}
            });
        }

        const updateData: any = {};
        dayLogs.forEach(log => {
            const timeStr = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare', hour12: false }).format(new Date(log.timestamp));
            const fieldPrefix = `users.${log.subjectId}`;

            updateData[`${fieldPrefix}.name`] = log.subjectName;
            if (log.action === AttendanceAction.LOGIN) {
                updateData[`${fieldPrefix}.login`] = timeStr;
                updateData[`${fieldPrefix}.loginTs`] = log.timestamp;
            } else {
                updateData[`${fieldPrefix}.logout`] = timeStr;
                updateData[`${fieldPrefix}.logoutTs`] = log.timestamp;
            }
        });

        await updateDoc(docRef, updateData);
    }

    return { count: logs.length };
  },

  batchDeleteLogs: async (logIds: string[], onProgress?: (count: number, total: number) => void): Promise<{ count: number }> => {
    if (logIds.length === 0) return { count: 0 };
    let deletedCount = 0;
    const chunkSize = 50;
    for (let i = 0; i < logIds.length; i += chunkSize) {
        const chunk = logIds.slice(i, i + chunkSize);
        try {
            const response = await fetch(`${WORKER_URL}/api/admin/delete-logs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logIds: chunk })
            });
            if (!response.ok) throw new Error(`Worker Error (${response.status})`);
            const data = await response.json();
            if (data.success) {
                deletedCount += chunk.length;
                if (onProgress) onProgress(deletedCount, logIds.length);
            } else throw new Error(data.error || "Unknown worker error");
        } catch (e: any) { throw new Error(`Batch delete failed: ${e.message}`); }
    }
    return { count: deletedCount };
  },

  addLog: async (log: Omit<AttendanceLog, 'id'>): Promise<void> => {
    const rawTs = log.timestamp;
    const dateStr = formatDate(rawTs);
    const timeStr = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare', hour12: false }).format(new Date(rawTs));

    if (log.type === 'VISITOR') {
      await addDoc(collection(db, VISITOR_LOGS_COL), { ...log, date: dateStr });
      return;
    }

    // For employees, update daily_logs
    const docRef = doc(db, DAILY_LOGS_COL, dateStr);
    const fieldPrefix = `users.${log.subjectId}`;
    const updateData: any = {
      [`${fieldPrefix}.name`]: log.subjectName
    };
    if (log.action === AttendanceAction.LOGIN) {
      updateData[`${fieldPrefix}.login`] = timeStr;
      updateData[`${fieldPrefix}.loginTs`] = rawTs;
    } else {
      updateData[`${fieldPrefix}.logout`] = timeStr;
      updateData[`${fieldPrefix}.logoutTs`] = rawTs;
    }

    // Check if doc exists to use set or update
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      await updateDoc(docRef, updateData);
    } else {
      // Create a base timestamp for sorting (00:00:00 local)
      const dateBase = new Date(rawTs);
      dateBase.setHours(0, 0, 0, 0);

      await setDoc(docRef, {
        date: dateStr,
        dateTs: dateBase.getTime(),
        users: { [log.subjectId]: {
          name: log.subjectName,
          login: log.action === AttendanceAction.LOGIN ? timeStr : null,
          loginTs: log.action === AttendanceAction.LOGIN ? rawTs : null,
          logout: log.action === AttendanceAction.LOGOUT ? timeStr : null,
          logoutTs: log.action === AttendanceAction.LOGOUT ? rawTs : null
        } }
      });
    }
  },

  getLogs: async (max: number = 500): Promise<AttendanceLog[]> => {
    // Fetch multiple daily logs and flatten, sorted chronologically
    const q = query(collection(db, DAILY_LOGS_COL), orderBy("dateTs", "desc"), limit(31));
    const snapshot = await getDocs(q);
    let allLogs: AttendanceLog[] = [];
    snapshot.docs.forEach(d => {
      const logs = dataService.parseDailyDocToLogs(d.id, d.data());
      allLogs = allLogs.concat(logs);
    });

    const vq = query(collection(db, VISITOR_LOGS_COL), orderBy("timestamp", "desc"), limit(200));
    const vsnap = await getDocs(vq);
    const visitorLogs = vsnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));

    return [...allLogs, ...visitorLogs].sort((a,b) => b.timestamp - a.timestamp).slice(0, max);
  },

  getLogsByDate: async (dateStr: string): Promise<AttendanceLog[]> => {
    const docRef = doc(db, DAILY_LOGS_COL, dateStr);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return [];
    return dataService.parseDailyDocToLogs(dateStr, snap.data());
  },

  getLogsForDate: async (dateStr: string): Promise<AttendanceLog[]> => {
    return dataService.getLogsByDate(dateStr);
  },

  getLogsForEmployee: async (employeeId: string, limitCount: number = 50): Promise<AttendanceLog[]> => {
    // Sorted chronological scan
    const q = query(collection(db, DAILY_LOGS_COL), orderBy("dateTs", "desc"), limit(62));
    const snapshot = await getDocs(q);
    let logs: AttendanceLog[] = [];
    snapshot.docs.forEach(d => {
      const dayLogs = dataService.parseDailyDocToLogs(d.id, d.data());
      logs = logs.concat(dayLogs.filter(l => l.subjectId === employeeId));
    });
    return logs.sort((a,b) => b.timestamp - a.timestamp).slice(0, limitCount);
  },

  getTodayStr: () => formatDate(new Date()),

  getVisitorLogs: async (max: number = 200): Promise<AttendanceLog[]> => {
    const q = query(collection(db, VISITOR_LOGS_COL), orderBy("timestamp", "desc"), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
  },

  getInformalLogs: async (): Promise<InformalLog[]> => {
    const q = query(collection(db, INFORMAL_LOGS_COL), orderBy("timeOut", "desc"), limit(100));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InformalLog));
  },

  getUserLastAction: async (subjectId: string): Promise<AttendanceAction | null> => {
    const todayStr = dataService.getTodayStr();
    const docRef = doc(db, DAILY_LOGS_COL, todayStr);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data();
    const userEntry = data.users?.[subjectId];
    if (!userEntry) return null;
    if (userEntry.logout) return AttendanceAction.LOGOUT;
    if (userEntry.login) return AttendanceAction.LOGIN;
    return null;
  },

  getActiveVisitors: async (): Promise<{id: string, name: string}[]> => {
    const q = query(collection(db, VISITOR_LOGS_COL), orderBy("timestamp", "asc"));
    const snap = await getDocs(q);
    const activeMap = new Map<string, string>();
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.action === AttendanceAction.LOGIN) activeMap.set(String(data.subjectId).trim(), data.subjectName);
      else if (data.action === AttendanceAction.LOGOUT) activeMap.delete(String(data.subjectId).trim());
    });
    return Array.from(activeMap.entries()).map(([id, name]) => ({ id, name }));
  },

  getSettings: async (): Promise<SystemSettings> => {
    const docRef = doc(db, SETTINGS_DOC);
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data() as SystemSettings;
    return {
      lateThreshold: "09:00", earlyThreshold: "08:00", dayStart: "06:00", dayEnd: "18:00",
      outsideLogin: "07:00", outsideLogout: "17:00", companyMotto: "Excellence", companyContact: "Support",
      adminPassword: "admin", standardDayHours: 8, lunchDurationMinutes: 60, breakDurationMinutes: 30
    };
  },

  updateSettings: async (settings: SystemSettings) => {
    const docRef = doc(db, SETTINGS_DOC);
    await setDoc(docRef, settings, { merge: true });
  },

  addNotice: async (notice: Omit<Notice, 'id'>): Promise<Notice> => {
    const docRef = await addDoc(collection(db, NOTICES_COL), { ...notice, updatedAt: Date.now() });
    return { id: docRef.id, ...notice } as Notice;
  },

  updateNotice: async (id: string, updated: Partial<Notice>): Promise<void> => {
    await updateDoc(doc(db, NOTICES_COL, id), { ...updated, updatedAt: Date.now() });
  },

  deleteNotice: async (notice: Notice): Promise<void> => { if (notice.id) await deleteDoc(doc(db, NOTICES_COL, notice.id)); },

  updateEmployee: async (id: string, employee: Partial<Employee>): Promise<void> => {
    await setDoc(doc(db, EMPLOYEES_COL, String(id).trim()), employee, { merge: true });
  },

  addEmployee: async (employee: Omit<Employee, 'id' | 'createdAt' | 'qrCodeData'>): Promise<Employee> => {
    const qrCodeData = `EMP-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    const newEmp = { ...employee, qrCodeData, createdAt: Date.now(), totalDaysWorked: 0 };
    const docRef = await addDoc(collection(db, EMPLOYEES_COL), newEmp);
    return { id: docRef.id, ...newEmp } as Employee;
  },

  deleteEmployee: async (id: string): Promise<void> => { await deleteDoc(doc(db, EMPLOYEES_COL, String(id).trim())); },

  fillMissingHistory: async (onProgress?: (msg: string) => void): Promise<{ count: number }> => {
    const employees = await dataService.getEmployees();
    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7); // Last 7 days

    let addedTotal = 0;
    const logsToAdd: Omit<AttendanceLog, 'id'>[] = [];

    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = formatDate(d);
        if (onProgress) onProgress(`Scanning ${dateStr}...`);

        const dayLogs = await dataService.getLogsByDate(dateStr);
        const [day, monthStr, year] = dateStr.split(' ');
        const month = new Date(`${monthStr} 1, 2000`).getMonth();

        for (const emp of employees) {
            const empDayLogs = dayLogs.filter(l => String(l.subjectId).trim() === String(emp.id).trim());
            const hasLogin = empDayLogs.some(l => l.action === AttendanceAction.LOGIN);
            const hasLogout = empDayLogs.some(l => l.action === AttendanceAction.LOGOUT);

            if (!hasLogin) {
                const loginTs = new Date(Date.UTC(Number(year), month, Number(day), 5, 0, 0)).getTime() + Math.floor(Math.random() * 3600000);
                logsToAdd.push({
                    subjectId: emp.id,
                    subjectName: emp.name,
                    timestamp: loginTs,
                    action: AttendanceAction.LOGIN,
                    status: LogStatus.SUCCESS,
                    type: 'EMPLOYEE',
                    confidence: 1.0,
                    source: 'AUTO_FILL_HISTORY',
                    date: dateStr
                });
            }

            if (!hasLogout) {
                const logoutTs = new Date(Date.UTC(Number(year), month, Number(day), 14, 0, 0)).getTime() + Math.floor(Math.random() * 7200000);
                logsToAdd.push({
                    subjectId: emp.id,
                    subjectName: emp.name,
                    timestamp: logoutTs,
                    action: AttendanceAction.LOGOUT,
                    status: LogStatus.SUCCESS,
                    type: 'EMPLOYEE',
                    confidence: 1.0,
                    source: 'AUTO_FILL_HISTORY',
                    date: dateStr
                });
            }

            if (logsToAdd.length >= 20) {
              const res = await dataService.batchAddLogs(logsToAdd);
              addedTotal += res.count;
              logsToAdd.length = 0;
            }
        }
    }

    if (logsToAdd.length > 0) {
        const res = await dataService.batchAddLogs(logsToAdd);
        addedTotal += res.count;
    }

    return { count: addedTotal };
  },

  deleteLog: async (id: string, type: 'EMPLOYEE' | 'VISITOR' = 'EMPLOYEE'): Promise<void> => {
    if (type === 'VISITOR') {
      await deleteDoc(doc(db, VISITOR_LOGS_COL, id));
      return;
    }
    await dataService.batchDeleteLogs([id]);
  },

  updateLogTimestamp: async (id: string, newTs: number): Promise<void> => {
    const parts = id.split('_');
    if (parts.length < 3) return;
    const userId = parts[0];
    const type = parts[1]; // 'login' or 'logout'
    const dateStr = parts[2]; // date string "DD MMM YYYY"

    const docRef = doc(db, DAILY_LOGS_COL, dateStr);
    const timeStr = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare', hour12: false
    }).format(new Date(newTs));

    const fieldPrefix = `users.${userId}`;
    await updateDoc(docRef, {
      [`${fieldPrefix}.${type}`]: timeStr,
      [`${fieldPrefix}.${type}Ts`]: newTs
    });
  },

  resetDaysWorked: async (id: string): Promise<void> => { await updateDoc(doc(db, EMPLOYEES_COL, String(id).trim()), { totalDaysWorked: 0 }); },

  getDepartments: async (): Promise<Department[]> => {
    const q = query(collection(db, DEPARTMENTS_COL), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Department));
  },

  addDepartment: async (name: string): Promise<Department> => {
    const docRef = await addDoc(collection(db, DEPARTMENTS_COL), { name });
    return { id: docRef.id, name };
  },

  updateDepartment: async (id: string, name: string): Promise<void> => { await updateDoc(doc(db, DEPARTMENTS_COL, id), { name }); },
  deleteDepartment: async (id: string): Promise<void> => { await deleteDoc(doc(db, DEPARTMENTS_COL, id)); },
  addFrequentVisitor: async (visitor: Omit<FrequentVisitor, 'id'>): Promise<FrequentVisitor> => {
    const docRef = await addDoc(collection(db, FREQUENT_VISITORS_COL), visitor);
    return { id: docRef.id, ...visitor } as FrequentVisitor;
  },
  getFrequentVisitors: async (): Promise<FrequentVisitor[]> => {
    const q = query(collection(db, FREQUENT_VISITORS_COL), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as FrequentVisitor));
  },
  updateFrequentVisitor: async (id: string, visitor: Partial<FrequentVisitor>): Promise<void> => { await setDoc(doc(db, FREQUENT_VISITORS_COL, id), visitor, { merge: true }); },
  deleteFrequentVisitor: async (id: string): Promise<void> => { await deleteDoc(doc(db, FREQUENT_VISITORS_COL, id)); },
  wipeLogs: async (): Promise<void> => {
    const deleteCollection = async (collectionName: string) => {
        const q = query(collection(db, collectionName), limit(500));
        const snap = await getDocs(q);
        if (snap.empty) return;
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        if (snap.size === 500) await deleteCollection(collectionName);
    };
    await Promise.all([deleteCollection(DAILY_LOGS_COL), deleteCollection(VISITOR_LOGS_COL), deleteCollection(INFORMAL_LOGS_COL), deleteCollection(OVERTIME_DECISIONS_COL)]);
  },

  getOvertimeDecisions: async (): Promise<OvertimeDecision[]> => {
    const q = query(collection(db, OVERTIME_DECISIONS_COL), limit(200));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as OvertimeDecision));
  },
  saveOvertimeDecision: async (decision: Omit<OvertimeDecision, 'id'>) => {
    const q = query(collection(db, OVERTIME_DECISIONS_COL), where("employeeId", "==", decision.employeeId), where("date", "==", decision.date));
    const snap = await getDocs(q);
    if (!snap.empty) {
      await updateDoc(doc(db, OVERTIME_DECISIONS_COL, snap.docs[0].id), { status: decision.status, timestamp: Date.now() });
    } else {
      await addDoc(collection(db, OVERTIME_DECISIONS_COL), { ...decision, timestamp: Date.now() });
    }
  },

  ensureSeedEmployeesExist: async (onProgress?: (msg: string) => void): Promise<void> => {
    const existingEmployees = await dataService.getEmployees();
    const existingPins = new Set(existingEmployees.map(e => String(e.pin).trim()));

    let addedCount = 0;
    for (const emp of SEED_EMPLOYEES) {
      if (!existingPins.has(String(emp.pin).trim())) {
        if (onProgress) onProgress(`Adding employee: ${emp.name}...`);
        await dataService.addEmployee({
          name: emp.name,
          pin: emp.pin,
          department: emp.department,
          isSales: false
        });
        addedCount++;
      }
    }
    if (onProgress && addedCount > 0) onProgress(`Added ${addedCount} new employees.`);
  },

  seedHistoricalLogsDirectly: async (onProgress?: (msg: string) => void): Promise<{ count: number }> => {
    await dataService.ensureSeedEmployeesExist(onProgress);

    const start = new Date(2026, 0, 7); // Jan 7, 2026
    const end = new Date(2026, 2, 17);   // Mar 17, 2026

    let totalLogs = 0;

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // Skip Weekends
      if (d.getDay() === 0 || d.getDay() === 6) continue;

      // Skip already existing Feb 1 - Feb 24
      if (d.getMonth() === 1 && d.getDate() >= 1 && d.getDate() <= 24) continue;

      // Skip gap between Mar 12 and Mar 16
      if (d.getMonth() === 2 && d.getDate() >= 13 && d.getDate() <= 15) continue;

      const dateStr = formatDate(d);
      if (onProgress) onProgress(`Generating logs for ${dateStr}...`);

      const yearNum = d.getFullYear();
      const monthNum = d.getMonth();
      const dayNum = d.getDate();

      const users: Record<string, any> = {};

      for (const emp of SEED_EMPLOYEES) {
        // Random Login: 07:00 - 08:00 CAT (05:00 - 06:00 UTC)
        const loginMin = Math.floor(Math.random() * 60);
        const loginTs = Date.UTC(yearNum, monthNum, dayNum, 5, loginMin, Math.floor(Math.random() * 60));
        const loginTimeStr = `07:${String(loginMin).padStart(2, '0')}`;

        // Random Logout: 16:00 - 18:00 CAT (14:00 - 16:00 UTC)
        const logoutHourCAT = 16 + Math.floor(Math.random() * 2);
        const logoutMin = Math.floor(Math.random() * 60);
        const logoutTs = Date.UTC(yearNum, monthNum, dayNum, logoutHourCAT - 2, logoutMin, Math.floor(Math.random() * 60));
        const logoutTimeStr = `${String(logoutHourCAT).padStart(2, '0')}:${String(logoutMin).padStart(2, '0')}`;

        users[emp.pin] = {
          name: emp.name,
          login: loginTimeStr,
          loginTs: loginTs,
          logout: logoutTimeStr,
          logoutTs: logoutTs
        };
        totalLogs += 2;
      }

      const docRef = doc(db, DAILY_LOGS_COL, dateStr);
      const dateBase = new Date(Date.UTC(yearNum, monthNum, dayNum, 0, 0, 0));

      await setDoc(docRef, {
        date: dateStr,
        dateTs: dateBase.getTime(),
        users: users
      });
    }

    return { count: totalLogs };
  }
};
