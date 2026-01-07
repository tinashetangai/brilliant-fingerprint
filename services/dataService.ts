
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

/**
 * Normalizes timestamps from various sources (seconds, milliseconds, Firestore, strings)
 * into a standard JS millisecond number.
 */
const normalizeTs = (ts: any): number => {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts < 1e12 ? ts * 1000 : ts;
  if (typeof ts === 'string') return new Date(ts).getTime();
  if (ts?.seconds) return ts.seconds * 1000;
  return 0;
};

export const dataService = {
  subscribeToLiveScans: (callback: (log: any) => void) => {
    const scanRef = ref(rtdb, 'live_scans/latest');
    return onValue(scanRef, (snapshot) => {
      const data = snapshot.val();
      if (data && Date.now() - normalizeTs(data.timestamp) < 15000) { 
        callback({
          ...data,
          subjectName: data.subjectName || data.name || "Personnel Identified"
        });
      }
    });
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

  getNotices: async (): Promise<Notice[]> => {
    const q = query(collection(db, NOTICES_COL), orderBy("updatedAt", "desc"));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice));
  },

  getEmployees: async (): Promise<Employee[]> => {
    const q = query(collection(db, EMPLOYEES_COL), orderBy("name"));
    const snapshot = await getDocs(q);
    const emps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
    console.log(`[DATA_SERVICE] Fetched ${emps.length} employees.`);
    return emps;
  },

  // ... (keeping existing logic for buildSessions and getAttendanceSessions) ...
  buildSessions: (logs: AttendanceLog[], employees: Employee[]): AttendanceSession[] => {
    // Basic session builder used by calculator
    const empMap = employees.reduce((acc, e) => ({ ...acc, [e.id]: e.department }), {} as Record<string, string>);
    
    const sortedLogs = [...logs]
      .filter(l => l.status === LogStatus.SUCCESS)
      .sort((a, b) => normalizeTs(a.timestamp) - normalizeTs(b.timestamp));
      
    const sessionsBySubject: Record<string, AttendanceSession[]> = {};

    sortedLogs.forEach(log => {
      const constTS = normalizeTs(log.timestamp);
      const dateKey = new Date(constTS).toLocaleDateString('en-GB');
      const subjectId = String(log.subjectId).trim();
      
      if (!sessionsBySubject[subjectId]) {
        sessionsBySubject[subjectId] = [];
      }

      const userSessions = sessionsBySubject[subjectId];

      if (log.action === AttendanceAction.LOGIN) {
        userSessions.push({
          subjectId: subjectId,
          name: log.subjectName,
          date: dateKey,
          timeIn: new Date(constTS).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare' }),
          timeOut: 'ONSITE',
          department: empMap[log.subjectId] || 'External',
          type: log.type || (subjectId.startsWith('visitor') ? 'VISITOR' : 'EMPLOYEE')
        });
      } else if (log.action === AttendanceAction.LOGOUT) {
        const activeSession = userSessions.slice().reverse().find(s => s.timeOut === 'ONSITE' && s.date === dateKey);
        if (activeSession) {
          activeSession.timeOut = new Date(constTS).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare' });
        } else {
          userSessions.push({
            subjectId: subjectId,
            name: log.subjectName,
            date: dateKey,
            timeIn: '---',
            timeOut: new Date(constTS).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare' }),
            department: empMap[log.subjectId] || 'External',
            type: log.type || (subjectId.startsWith('visitor') ? 'VISITOR' : 'EMPLOYEE')
          });
        }
      }
    });

    const flat = Object.values(sessionsBySubject).flat();
    return flat.sort((a, b) => {
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
        getDocs(query(collection(db, LOGS_COL), orderBy("timestamp", "desc"), limit(2000))),
        getDocs(query(collection(db, VISITOR_LOGS_COL), orderBy("timestamp", "desc"), limit(1000)))
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
    const coll = log.type === 'VISITOR' ? VISITOR_LOGS_COL : LOGS_COL;
    await addDoc(collection(db, coll), log);
  },

  getLogs: async (max: number = 2000): Promise<AttendanceLog[]> => {
    const q = query(collection(db, LOGS_COL), orderBy("timestamp", "desc"), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));
  },

  getVisitorLogs: async (max: number = 1000): Promise<AttendanceLog[]> => {
    const q = query(collection(db, VISITOR_LOGS_COL), orderBy("timestamp", "desc"), limit(max));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceLog));
  },

  getInformalLogs: async (): Promise<InformalLog[]> => {
    const q = query(collection(db, INFORMAL_LOGS_COL), orderBy("timeOut", "desc"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as InformalLog));
  },

  getUserLastAction: async (subjectId: string): Promise<AttendanceAction | null> => {
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
      if (data.action === AttendanceAction.LOGIN) {
        activeMap.set(String(data.subjectId).trim(), data.subjectName);
      } else if (data.action === AttendanceAction.LOGOUT) {
        activeMap.delete(String(data.subjectId).trim());
      }
    });
    return Array.from(activeMap.entries()).map(([id, name]) => ({ id, name }));
  },

  processInformalLog: async (employee: Employee): Promise<{ success: boolean; duration?: string; action?: AttendanceAction; error?: string }> => {
    const lastMainAction = await dataService.getUserLastAction(employee.id);
    if (lastMainAction !== AttendanceAction.LOGIN) {
      return { success: false, error: "ACCESS DENIED: Staff must Clock-In first." };
    }

    const todayStr = new Date().toLocaleDateString('en-GB');
    const q = query(
      collection(db, INFORMAL_LOGS_COL),
      where("employeeId", "==", String(employee.id).trim()),
      where("date", "==", todayStr),
      where("timeIn", "==", null),
      limit(1)
    );
    const snap = await getDocs(q);
    const now = Date.now();

    if (snap.empty) {
      await addDoc(collection(db, INFORMAL_LOGS_COL), {
        employeeId: String(employee.id).trim(),
        employeeName: employee.name,
        timeOut: now,
        timeIn: null,
        date: todayStr
      });
      return { success: true, action: AttendanceAction.GATE_OUT };
    } else {
      const logDoc = snap.docs[0];
      const data = logDoc.data();
      const diffMs = now - normalizeTs(data.timeOut);
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const durationStr = `${hours}h ${minutes}m`;
      await updateDoc(doc(db, INFORMAL_LOGS_COL, logDoc.id), {
        timeIn: now,
        duration: durationStr
      });
      return { success: true, duration: durationStr, action: AttendanceAction.GATE_IN };
    }
  },

  processVerification: async (employee: Employee, action: AttendanceAction, confidence: number): Promise<{ success: boolean; error?: string; duration?: string }> => {
    try {
      const now = new Date();
      await dataService.addLog({
        subjectId: String(employee.id).trim(),
        subjectName: employee.name,
        timestamp: now.getTime(),
        status: LogStatus.SUCCESS,
        action: action,
        confidence: confidence,
        type: 'EMPLOYEE'
      });
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
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
      const currentUntil = normalizeTs(snap.data().outsideWorkUntil) || Date.now();
      const newUntil = currentUntil + (days * 24 * 60 * 60 * 1000);
      await updateDoc(empRef, { outsideWorkUntil: newUntil });
    }
  },

  getSettings: async (): Promise<SystemSettings> => {
    const docRef = doc(db, SETTINGS_DOC);
    const snap = await getDoc(docRef);
    if (snap.exists()) return snap.data() as SystemSettings;
    return {
      lateThreshold: "09:00",
      earlyThreshold: "08:00",
      dayStart: "06:00",
      dayEnd: "18:00",
      outsideLogin: "07:00",
      outsideLogout: "17:00",
      companyMotto: "Excellence",
      companyContact: "Support",
      adminPassword: "admin",
      standardDayHours: 8,
      lunchDurationMinutes: 60,
      breakDurationMinutes: 30
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

  deleteNotice: async (notice: Notice): Promise<void> => {
    if (notice.id) await deleteDoc(doc(db, NOTICES_COL, notice.id));
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

  checkoutVisitor: async (visitorId: string, visitorName: string): Promise<void> => {
    const now = Date.now();
    await dataService.addLog({
      subjectId: visitorId,
      subjectName: visitorName,
      timestamp: now,
      status: LogStatus.SUCCESS,
      action: AttendanceAction.LOGOUT,
      confidence: 1.0,
      type: 'VISITOR'
    });
  },

  resetDaysWorked: async (id: string): Promise<void> => {
    await updateDoc(doc(db, EMPLOYEES_COL, String(id).trim()), { totalDaysWorked: 0 });
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

  addFrequentVisitor: async (visitor: Omit<FrequentVisitor, 'id'>): Promise<FrequentVisitor> => {
    const docRef = await addDoc(collection(db, FREQUENT_VISITORS_COL), visitor);
    return { id: docRef.id, ...visitor } as FrequentVisitor;
  },

  getFrequentVisitors: async (): Promise<FrequentVisitor[]> => {
    const q = query(collection(db, FREQUENT_VISITORS_COL), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as FrequentVisitor));
  },

  updateFrequentVisitor: async (id: string, visitor: Partial<FrequentVisitor>): Promise<void> => {
    await setDoc(doc(db, FREQUENT_VISITORS_COL, id), visitor, { merge: true });
  },

  deleteFrequentVisitor: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, FREQUENT_VISITORS_COL, id));
  },

  wipeLogs: async (): Promise<void> => {
    const batch = writeBatch(db);
    const logsSnap = await getDocs(query(collection(db, LOGS_COL)));
    const gateSnap = await getDocs(query(collection(db, INFORMAL_LOGS_COL)));
    const visSnap = await getDocs(query(collection(db, VISITOR_LOGS_COL)));
    const otSnap = await getDocs(query(collection(db, OVERTIME_DECISIONS_COL)));
    
    logsSnap.docs.forEach(d => batch.delete(d.ref));
    gateSnap.docs.forEach(d => batch.delete(d.ref));
    visSnap.docs.forEach(d => batch.delete(d.ref));
    otSnap.docs.forEach(d => batch.delete(d.ref));
    
    await batch.commit();
  },

  // Overtime Management
  getOvertimeDecisions: async (): Promise<OvertimeDecision[]> => {
    const q = query(collection(db, OVERTIME_DECISIONS_COL));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as OvertimeDecision));
  },

  saveOvertimeDecision: async (decision: Omit<OvertimeDecision, 'id'>) => {
    // Check if exists
    const q = query(collection(db, OVERTIME_DECISIONS_COL), 
      where("employeeId", "==", decision.employeeId),
      where("date", "==", decision.date)
    );
    const snap = await getDocs(q);
    
    if (!snap.empty) {
      const docId = snap.docs[0].id;
      await updateDoc(doc(db, OVERTIME_DECISIONS_COL, docId), {
        status: decision.status,
        timestamp: Date.now()
      });
    } else {
      await addDoc(collection(db, OVERTIME_DECISIONS_COL), {
        ...decision,
        timestamp: Date.now()
      });
    }
  }
};
