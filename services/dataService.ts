
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
import { db, rtdb } from "../backend/firebase";
import { Employee, AttendanceLog, LogStatus, AttendanceAction, SystemSettings, Notice, AttendanceSession, Department, InformalLog, FrequentVisitor, OvertimeDecision } from "../types";

const EMPLOYEES_COL = "employees";
const LOGS_COL = "logs";
const VISITOR_LOGS_COL = "visitor_logs";
const INFORMAL_LOGS_COL = "informal_logs";
const SETTINGS_DOC = "config/system";
const NOTICES_COL = "notices";
const DEPARTMENTS_COL = "departments";
const FREQUENT_VISITORS_COL = "frequent_visitors";
const OVERTIME_DECISIONS_COL = "overtime_decisions";

// --- SYSTEM TIME OFFSET CONFIG ---
// This offset is applied during display and calculations to show time 2 hours earlier than captured.
const TIME_OFFSET = 0;

// --- CLOUDFLARE WORKER URL ---
const WORKER_URL = "https://knockout-attendance-worker.mordenfarm1677.workers.dev"; 

const normalizeTs = (ts: any): number => {
  if (!ts) return 0;
  let raw = 0;
  if (typeof ts === 'number') raw = ts < 1e12 ? ts * 1000 : ts;
  else if (typeof ts === 'string') raw = new Date(ts).getTime();
  else if (ts?.seconds) raw = ts.seconds * 1000;
  
  if (raw === 0) return 0;
  // Apply -2h offset to all retrieved timestamps for display and logic
  return raw - TIME_OFFSET;
};

export const dataService = {
  subscribeToLiveScans: (callback: (log: any) => void) => {
    const scanRef = ref(rtdb, 'live_scans/latest');
    return onValue(scanRef, (snapshot) => {
      const data = snapshot.val();
      // Use raw comparison for fresh data, but apply normalization for callback
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
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    
    const q = query(
      collection(db, LOGS_COL), 
      where("timestamp", ">=", startOfToday.getTime() - (TIME_OFFSET * 2)), // Buffer to catch midnight crossovers
      orderBy("timestamp", "desc")
    );

    return onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
      callback(logs);
    }, (error) => {
      // Silent fail
    });
  },

  getHarareTime: async (): Promise<Date> => {
    try {
      const response = await fetch('https://worldtimeapi.org/api/timezone/Africa/Harare');
      if (!response.ok) throw new Error("API Unreachable");
      const data = await response.json();
      // Apply offset to terminal clock to keep it consistent with logs
      return new Date(new Date(data.datetime).getTime() - TIME_OFFSET);
    } catch (e) {
      return new Date(Date.now() - TIME_OFFSET);
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
      if (data.success && data.employee) {
        return data.employee as Employee;
      }
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
    const employees = await dataService.getEmployees();
    const salesTeam = employees.filter(e => e.isSales);
    if (salesTeam.length === 0) return;

    const nowRaw = Date.now();
    const nowAdjusted = nowRaw - TIME_OFFSET;
    
    const startOfToday = new Date();
    startOfToday.setHours(0,0,0,0);
    const todayRaw = startOfToday.getTime();

    // Target times
    const targetLoginRaw = todayRaw + (6.5 * 3600000); // 06:30
    const targetLogoutRaw = todayRaw + (18 * 3600000);  // 18:00

    const q = query(
      collection(db, LOGS_COL),
      where("timestamp", ">=", todayRaw),
      where("source", "==", "AUTO_SALES_LOG") 
    );
    const snap = await getDocs(q);
    const existingLogs = snap.docs.map(d => d.data() as AttendanceLog);

    const batch = writeBatch(db);
    let updateCount = 0;

    salesTeam.forEach(emp => {
      const empLogs = existingLogs.filter(l => l.subjectId === emp.id);
      const hasLogin = empLogs.some(l => l.action === AttendanceAction.LOGIN);
      const hasLogout = empLogs.some(l => l.action === AttendanceAction.LOGOUT);

      if (nowRaw > targetLoginRaw && !hasLogin) {
        const docRef = doc(collection(db, LOGS_COL));
        batch.set(docRef, {
          subjectId: emp.id,
          subjectName: emp.name,
          timestamp: targetLoginRaw,
          action: AttendanceAction.LOGIN,
          status: LogStatus.SUCCESS,
          confidence: 1.0,
          type: 'EMPLOYEE',
          source: 'AUTO_SALES_LOG',
          date: new Date(targetLoginRaw).toLocaleDateString('en-GB')
        });
        updateCount++;
      }

      if (nowRaw > targetLogoutRaw && !hasLogout) {
        const docRef = doc(collection(db, LOGS_COL));
        batch.set(docRef, {
          subjectId: emp.id,
          subjectName: emp.name,
          timestamp: targetLogoutRaw,
          action: AttendanceAction.LOGOUT,
          status: LogStatus.SUCCESS,
          confidence: 1.0,
          type: 'EMPLOYEE',
          source: 'AUTO_SALES_LOG',
          date: new Date(targetLogoutRaw).toLocaleDateString('en-GB')
        });
        updateCount++;
      }
    });

    if (updateCount > 0) {
      await batch.commit();
    }
  },

  buildSessions: (logs: AttendanceLog[], employees: Employee[]): AttendanceSession[] => {
    const empMap = employees.reduce((acc, e) => ({ ...acc, [e.id]: e.department }), {} as Record<string, string>);
    const sortedLogs = [...logs]
      .filter(l => l.status === LogStatus.SUCCESS)
      .sort((a, b) => normalizeTs(a.timestamp) - normalizeTs(b.timestamp));
    const sessionsBySubject: Record<string, AttendanceSession[]> = {};

    sortedLogs.forEach(log => {
      const constTS = normalizeTs(log.timestamp);
      const dateKey = new Date(constTS).toLocaleDateString('en-GB', { timeZone: 'Africa/Harare' });
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
      const [dA, mA, yA] = a.date.split('/').map(Number);
      const [dB, mB, yB] = b.date.split('/').map(Number);
      const dateA = new Date(yA, mA - 1, dA).getTime();
      const dateB = new Date(yB, mB - 1, dB).getTime();
      if (dateA !== dateB) return dateB - dateA;
      return b.timeIn.localeCompare(a.timeIn);
    });
  },

  getAttendanceSessions: async (logsInput?: AttendanceLog[]): Promise<AttendanceSession[]> => {
    let logs = logsInput;
    if (!logs) {
      const [empLogsSnap, visLogsSnap] = await Promise.all([
        getDocs(query(collection(db, LOGS_COL), orderBy("timestamp", "desc"), limit(500))),
        getDocs(query(collection(db, VISITOR_LOGS_COL), orderBy("timestamp", "desc"), limit(200)))
      ]);
      logs = [
        ...empLogsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog)),
        ...visLogsSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog))
      ];
    }
    const employees = await dataService.getEmployees();
    return dataService.buildSessions(logs, employees);
  },

  addLog: async (log: Omit<AttendanceLog, 'id'>): Promise<void> => {
    const rawTs = log.timestamp;
    const adjustedLog = {
      ...log,
      timestamp: rawTs,
      date: new Date(rawTs).toLocaleDateString('en-GB')
    };
    const coll = log.type === 'VISITOR' ? VISITOR_LOGS_COL : LOGS_COL;
    await addDoc(collection(db, coll), adjustedLog);
  },

  batchAddLogs: async (logs: Omit<AttendanceLog, 'id'>[]): Promise<{ count: number }> => {
    if (logs.length === 0) return { count: 0 };
    const chunks = [];
    for (let i = 0; i < logs.length; i += 400) chunks.push(logs.slice(i, i + 400));
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

  deleteLog: async (id: string, type: 'EMPLOYEE' | 'VISITOR' = 'EMPLOYEE'): Promise<void> => {
    const coll = type === 'VISITOR' ? VISITOR_LOGS_COL : LOGS_COL;
    await deleteDoc(doc(db, coll, id));
  },

  batchDeleteLogs: async (logIds: string[], onProgress?: (count: number, total: number) => void): Promise<{ count: number }> => {
    if (logIds.length === 0) return { count: 0 };
    let deletedCount = 0;
    const chunkSize = 400; 
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

  deleteLogsTimeRange: async (startTs: number, endTs: number, onProgress?: (count: number, msg: string) => void): Promise<{ count: number }> => {
    let totalDeleted = 0;
    let batchCount = 0;
    while (true) {
        try {
            const response = await fetch(`${WORKER_URL}/api/admin/purge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startTs, endTs })
            });
            if (!response.ok) throw new Error("Backend purge failed");
            const data = await response.json();
            if (!data.success) throw new Error(data.error || "Unknown backend error");
            const deletedCount = data.count || 0;
            totalDeleted += deletedCount;
            batchCount++;
            if (onProgress) onProgress(totalDeleted, `Deleted ${totalDeleted} records...`);
            if (deletedCount === 0) break; 
            await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e: any) { throw e; }
    }
    return { count: totalDeleted };
  },

  getLogs: async (max: number = 500): Promise<AttendanceLog[]> => {
    const q = query(collection(db, LOGS_COL), orderBy("timestamp", "desc"), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
  },

  getLogsByDate: async (dateStr: string): Promise<AttendanceLog[]> => {
    const q = query(collection(db, LOGS_COL), where("date", "==", dateStr));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
  },

  getLogsForEmployee: async (employeeId: string, limitCount: number = 50): Promise<AttendanceLog[]> => {
    const q = query(
      collection(db, LOGS_COL), 
      where("subjectId", "==", String(employeeId).trim()),
      orderBy("timestamp", "desc"), 
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceLog));
  },

  updateLogTimestamp: async (logId: string, newTimestamp: number): Promise<void> => {
    const docRef = doc(db, LOGS_COL, logId);
    const dateStr = new Date(newTimestamp).toLocaleDateString('en-GB');
    await updateDoc(docRef, { 
      timestamp: newTimestamp,
      date: dateStr 
    });
  },

  batchUpdateTimestamps: async (updates: { id: string, timestamp: number }[]): Promise<{ count: number }> => {
    if (updates.length === 0) return { count: 0 };
    const batchSize = 400;
    let count = 0;
    for (let i = 0; i < updates.length; i += batchSize) {
        const chunk = updates.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(update => {
            const docRef = doc(db, LOGS_COL, update.id);
            const dateStr = new Date(update.timestamp).toLocaleDateString('en-GB');
            batch.update(docRef, { 
                timestamp: update.timestamp,
                date: dateStr 
            });
        });
        await batch.commit();
        count += chunk.length;
    }
    return { count };
  },

  batchClockInAbsentEmployees: async (): Promise<{ count: number }> => {
    const logs = await dataService.getLogs(1000);
    const employees = await dataService.getEmployees();
    const sessions = dataService.buildSessions(logs, employees);
    const todayStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Africa/Harare' });
    const activeEmpIds = new Set(sessions.filter(s => s.timeOut === 'ONSITE' && s.date === todayStr).map(s => s.subjectId));
    const absentEmployees = employees.filter(e => !activeEmpIds.has(e.id));
    if (absentEmployees.length === 0) return { count: 0 };
    const batch = writeBatch(db);
    const nowRaw = Date.now();
    absentEmployees.forEach(emp => {
        const docRef = doc(collection(db, LOGS_COL));
        batch.set(docRef, {
            subjectId: emp.id,
            subjectName: emp.name,
            timestamp: nowRaw,
            action: AttendanceAction.LOGIN,
            status: LogStatus.SUCCESS,
            confidence: 1.0,
            type: 'EMPLOYEE',
            source: 'ADMIN_BATCH_LOGIN',
            date: new Date(nowRaw).toLocaleDateString('en-GB')
        });
    });
    await batch.commit();
    return { count: absentEmployees.length };
  },

  batchClockOutActiveEmployees: async (randomize: boolean = false): Promise<{ count: number }> => {
    const logs = await dataService.getLogs(1000); 
    const employees = await dataService.getEmployees();
    const sessions = dataService.buildSessions(logs, employees);
    const activeSessions = sessions.filter(s => s.timeOut === 'ONSITE' && s.type === 'EMPLOYEE');
    if (activeSessions.length === 0) return { count: 0 };
    const batch = writeBatch(db);
    activeSessions.forEach(session => {
        const docRef = doc(collection(db, LOGS_COL));
        let ts = Date.now();
        if (randomize) {
          const baseDate = new Date();
          // Random range (17:30 - 19:00)
          const randomMinutes = 1050 + Math.floor(Math.random() * 91); // 1050 mins = 17:30
          baseDate.setHours(0, randomMinutes, Math.floor(Math.random() * 60), 0);
          ts = baseDate.getTime();
        }
        batch.set(docRef, {
            subjectId: session.subjectId,
            subjectName: session.name,
            timestamp: ts,
            action: AttendanceAction.LOGOUT,
            status: LogStatus.SUCCESS,
            confidence: 1.0,
            type: 'EMPLOYEE',
            source: 'ADMIN_BATCH_LOGOUT',
            date: new Date(ts).toLocaleDateString('en-GB')
        });
    });
    await batch.commit();
    return { count: activeSessions.length };
  },

  forceLogoutAllUsers: async (): Promise<void> => { await dataService.batchClockOutActiveEmployees(); },

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
    try {
      const q = query(
        collection(db, LOGS_COL), 
        where("subjectId", "==", String(subjectId).trim()), 
        where("status", "==", LogStatus.SUCCESS),
        orderBy("timestamp", "desc"), 
        limit(1)
      );
      const snap = await getDocs(q);
      if (snap.empty) return null;
      return (snap.docs[0].data() as AttendanceLog).action;
    } catch (e: any) { throw e; }
  },

  getActiveVisitors: async (): Promise<{id: string, name: string}[]> => {
    const today = new Date();
    today.setHours(0,0,0,0);
    const q = query(
      collection(db, VISITOR_LOGS_COL),
      where("timestamp", ">=", today.getTime()),
      orderBy("timestamp", "asc")
    );
    const snap = await getDocs(q);
    const activeMap = new Map<string, string>();
    snap.docs.forEach(d => {
      const data = d.data();
      if (data.action === AttendanceAction.LOGIN) activeMap.set(String(data.subjectId).trim(), data.subjectName);
      else if (data.action === AttendanceAction.LOGOUT) activeMap.delete(String(data.subjectId).trim());
    });
    return Array.from(activeMap.entries()).map(([id, name]) => ({ id, name }));
  },

  processInformalLog: async (employee: Employee): Promise<{ success: boolean; duration?: string; action?: AttendanceAction; error?: string }> => {
    try {
      const lastMainAction = await dataService.getUserLastAction(employee.id);
      if (lastMainAction !== AttendanceAction.LOGIN) return { success: false, error: "ACCESS DENIED: Staff must Clock-In first." };
      const todayStr = new Date().toLocaleDateString('en-GB');
      const q = query(
        collection(db, INFORMAL_LOGS_COL),
        where("employeeId", "==", String(employee.id).trim()),
        where("date", "==", todayStr),
        where("timeIn", "==", null),
        limit(1)
      );
      const snap = await getDocs(q);
      const nowRaw = Date.now();
      if (snap.empty) {
        await addDoc(collection(db, INFORMAL_LOGS_COL), {
          employeeId: String(employee.id).trim(),
          employeeName: employee.name,
          timeOut: nowRaw,
          timeIn: null,
          date: todayStr
        });
        return { success: true, action: AttendanceAction.GATE_OUT };
      } else {
        const logDoc = snap.docs[0];
        const data = logDoc.data();
        const diffMs = nowRaw - (data.timeOut < 1e12 ? data.timeOut * 1000 : data.timeOut);
        const hours = Math.floor(diffMs / 3600000);
        const minutes = Math.floor((diffMs % 3600000) / 60000);
        const durationStr = `${hours}h ${minutes}m`;
        await updateDoc(doc(db, INFORMAL_LOGS_COL, logDoc.id), {
          timeIn: nowRaw,
          duration: durationStr
        });
        return { success: true, duration: durationStr, action: AttendanceAction.GATE_IN };
      }
    } catch (e: any) { return { success: false, error: "Network Error" }; }
  },

  processVerification: async (employee: Employee, action: AttendanceAction, confidence: number): Promise<{ success: boolean; error?: string; duration?: string }> => {
    try {
      const res = await fetch(`${WORKER_URL}/api/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          pin: employee.pin,
          source: 'FRONTEND_PIN'
        })
      });
      if (!res.ok) throw new Error(`Worker Error: ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Server Verification Failed');
      return { success: true, duration: data.duration }; 
    } catch (e: any) { return { success: false, error: e.message }; }
  },

  setOutsideWork: async (assignments: { employeeId: string; days: number }[]): Promise<void> => {
    const batch = writeBatch(db);
    const now = Date.now();
    for (const { employeeId, days } of assignments) {
      const until = now + (days * 24 * 60 * 60 * 1000);
      batch.update(doc(db, EMPLOYEES_COL, String(employeeId).trim()), { outsideWorkUntil: until });
    }
    await batch.commit();
  },

  recallEmployeeFromOutsideWork: async (employeeId: string): Promise<void> => {
    await updateDoc(doc(db, EMPLOYEES_COL, String(employeeId).trim()), { outsideWorkUntil: null });
  },

  extendOutsideWork: async (employeeId: string, days: number): Promise<void> => {
    const empRef = doc(db, EMPLOYEES_COL, String(employeeId).trim());
    const snap = await getDoc(empRef);
    if (snap.exists()) {
      const currentUntil = (snap.data().outsideWorkUntil < 1e12 ? snap.data().outsideWorkUntil * 1000 : snap.data().outsideWorkUntil) || Date.now();
      const newUntil = currentUntil + (days * 24 * 60 * 60 * 1000);
      await updateDoc(empRef, { outsideWorkUntil: newUntil });
    }
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

  checkoutVisitor: async (visitorId: string, visitorName: string): Promise<void> => {
    const rawTs = Date.now();
    await dataService.addLog({
      subjectId: visitorId,
      subjectName: visitorName,
      timestamp: rawTs,
      status: LogStatus.SUCCESS,
      action: AttendanceAction.LOGOUT,
      confidence: 1.0,
      type: 'VISITOR'
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
    await Promise.all([deleteCollection(LOGS_COL), deleteCollection(VISITOR_LOGS_COL), deleteCollection(INFORMAL_LOGS_COL), deleteCollection(OVERTIME_DECISIONS_COL)]);
  },

  fillMissingHistory: async (onProgress?: (msg: string) => void): Promise<{ count: number }> => {
    const employees = await dataService.getEmployees();
    const firstLogQuery = query(collection(db, LOGS_COL), orderBy("timestamp", "asc"), limit(1));
    const firstLogSnap = await getDocs(firstLogQuery);
    if (firstLogSnap.empty) return { count: 0 };

    const firstLogTs = firstLogSnap.docs[0].data().timestamp;
    const startDate = new Date(firstLogTs);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date();
    endDate.setHours(0, 0, 0, 0);

    let addedTotal = 0;
    const logsToAdd: Omit<AttendanceLog, 'id'>[] = [];

    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toLocaleDateString('en-GB', { timeZone: 'Africa/Harare' });
        if (onProgress) onProgress(`Scanning ${dateStr}...`);

        const dayLogs = await dataService.getLogsByDate(dateStr);
        const [day, month, year] = dateStr.split('/').map(Number);

        for (const emp of employees) {
            const empDayLogs = dayLogs.filter(l => String(l.subjectId).trim() === String(emp.id).trim());
            const hasLogin = empDayLogs.some(l => l.action === AttendanceAction.LOGIN);
            const hasLogout = empDayLogs.some(l => l.action === AttendanceAction.LOGOUT);

            if (!hasLogin) {
                const loginTs = new Date(Date.UTC(year, month - 1, day, 5, 0, 0)).getTime() + Math.floor(Math.random() * 3600000);
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
                const logoutTs = new Date(Date.UTC(year, month - 1, day, 14, 0, 0)).getTime() + Math.floor(Math.random() * 7200000);
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

            if (logsToAdd.length >= 400) {
              if (onProgress) onProgress(`Syncing ${logsToAdd.length} records...`);
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
