
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

const EMPLOYEES_COL = "employees";
const DAILY_LOGS_COL = "daily_logs";
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

export const formatDate = (date: Date | number) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Harare'
  }).format(typeof date === 'number' ? new Date(date) : date).replace(/\./g, '');
};

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
    for (const [userId, userLog] of Object.entries(users) as any) {
      if (userLog.login) {
        logs.push({
          id: `${userId}_login_${dateStr}`,
          subjectId: userId,
          subjectName: userLog.name,
          timestamp: userLog.loginTs || 0,
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
          timestamp: userLog.logoutTs || 0,
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
    if (logs.length === 0) return { count: 0 };
    const chunks = [];
    for (let i = 0; i < logs.length; i += 50) chunks.push(logs.slice(i, i + 50));
    let count = 0;
    for (const chunk of chunks) {
        try {
            const response = await fetch(`${WORKER_URL}/api/admin/seed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs: chunk })
            });
            const data = await response.json();
            if (data.success) count += data.count;
        } catch (e) { console.error("Batch seed failed", e); }
    }
    return { count };
  },

  batchDeleteLogs: async (logIds: string[], onProgress?: (count: number, total: number) => void): Promise<{ count: number }> => {
    return { count: 0 }; // Deletion from daily map not yet supported via batch
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
      await setDoc(docRef, { date: dateStr, users: { [log.subjectId]: {
        name: log.subjectName,
        login: log.action === AttendanceAction.LOGIN ? timeStr : null,
        loginTs: log.action === AttendanceAction.LOGIN ? rawTs : null,
        logout: log.action === AttendanceAction.LOGOUT ? timeStr : null,
        logoutTs: log.action === AttendanceAction.LOGOUT ? rawTs : null
      } } });
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
    }
    // Employee log deletion from daily map is complex, skip for now
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
  }
};
