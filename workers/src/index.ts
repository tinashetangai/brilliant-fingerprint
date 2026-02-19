
import { getToken } from './auth';

// Add missing type definitions for Cloudflare Workers
interface ExecutionContext {
  waitUntil(promise: Promise<any>): void;
  passThroughOnException(): void;
}

interface ScheduledEvent {
  cron: string;
  type: string;
  scheduledTime: number;
}

export interface Env {
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
}

// --- CONFIG ---
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Fallback Project ID from frontend config
const DEFAULT_PROJECT_ID = "brilliant-chemicals";
const DAILY_LOGS_COL = "day_by_day_logs";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      if (request.method === 'POST' && url.pathname === '/api/auth/pin') {
        return await handlePinAuth(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/log') {
        return await handleLogEntry(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/purge') {
        return await handlePurge(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/delete-logs') {
        return await handleDeleteLogs(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/seed') {
        return await handleSeed(request, env);
      }
      
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    } catch (err: any) {
      console.error("Worker Global Error:", err);
      return new Response(JSON.stringify({ success: false, error: err.message }), { status: 500, headers: CORS_HEADERS });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleAutoLogout(env));
  },
};

// --- HANDLERS ---

async function handlePinAuth(req: Request, env: Env) {
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { headers: CORS_HEADERS }); }
  const { pin } = body;
  if (!pin) return new Response(JSON.stringify({ success: false, error: 'PIN required' }), { headers: CORS_HEADERS });

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  let token = await getToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'employees' }],
      where: { fieldFilter: { field: { fieldPath: 'pin' }, op: 'EQUAL', value: { stringValue: pin } } },
      limit: 1
    }
  };

  const response = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
  const data: any = await response.json();
  if (!data || !data[0] || !data[0].document) return new Response(JSON.stringify({ success: false, error: 'Invalid PIN' }), { headers: CORS_HEADERS });
  return new Response(JSON.stringify({ success: true, employee: parseFirestoreDoc(data[0].document) }), { headers: CORS_HEADERS });
}

async function handleLogEntry(req: Request, env: Env) {
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ success: false, error: 'Invalid body' }), { headers: CORS_HEADERS }); }
  const { pin, source = 'API' } = body;
  let token = await getToken(env);

  const empRes = await handlePinAuth(new Request('http://internal/api/auth/pin', { method: 'POST', body: JSON.stringify({ pin }) }), env);
  const empData: any = await empRes.json();
  if (!empData.success) return new Response(JSON.stringify({ success: false, error: 'User not found' }), { headers: CORS_HEADERS });
  const employee = empData.employee;

  const nowRaw = Date.now();
  const harareDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Harare' });
  const dateStr = harareDateFormatter.format(new Date(nowRaw)).replace(/\./g, '');
  const timeStr = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare', hour12: false }).format(new Date(nowRaw));

  const dailyLog = await getDailyLog(env, token, dateStr);
  const userEntry = dailyLog?.users?.[employee.id] || {};

  let action = 'LOGIN';
  if (userEntry.login && !userEntry.logout) {
    action = 'LOGOUT';
  }

  // Update Daily Log
  await patchDailyLog(env, token, dateStr, employee.id, employee.name, action, timeStr, nowRaw);

  // Overtime Check
  const settings = await getSystemSettings(env, token);
  let isOvertime = false;
  let otHours = 0;
  if (action === 'LOGOUT' && settings?.dayEnd) {
    const [h, m] = timeStr.split(':').map(Number);
    const [eh, em] = settings.dayEnd.split(':').map(Number);
    const nowDec = h + m/60;
    const endDec = eh + em/60;
    if (nowDec > endDec) {
      otHours = nowDec - endDec;
      if (otHours >= 0.5) isOvertime = true;
    }
  }

  if (isOvertime) {
    await createDocument(env, token, 'overtime_decisions', {
      employeeId: employee.id,
      date: dateStr,
      hours: parseFloat(otHours.toFixed(2)),
      status: 'PENDING',
      timestamp: nowRaw
    });
  }

  await updateRealtimeDb(env, token, {
    subjectId: employee.id,
    subjectName: employee.name,
    name: employee.name,
    action: action,
    timestamp: nowRaw
  });

  return new Response(JSON.stringify({ success: true, action, employee, overtime: isOvertime ? otHours : 0 }), { headers: CORS_HEADERS });
}

async function handleAutoLogout(env: Env) {
  try {
    const token = await getToken(env);
    const nowRaw = Date.now();

    // If running at midnight (22:00 UTC / 00:00 CAT), we want to logout people from "yesterday"
    // Subtract 2 hours to be safely in the previous day context
    const referenceTime = nowRaw - (2 * 3600000);
    const harareDateFormatter = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Harare' });
    const dateStr = harareDateFormatter.format(new Date(referenceTime)).replace(/\./g, '');

    const settings = await getSystemSettings(env, token);
    // Even if no settings, we still logout at end of day

    const dailyLog = await getDailyLog(env, token, dateStr);
    if (!dailyLog || !dailyLog.users) return;

    for (const [empId, userEntry] of Object.entries(dailyLog.users) as any) {
      if (userEntry.login && !userEntry.logout) {
        // Use 23:59 of the reference day to close the session properly
        const logoutDate = new Date(referenceTime);
        logoutDate.setUTCHours(21, 59, 0, 0); // 23:59 CAT
        const logoutTs = logoutDate.getTime();
        const timeStr = "23:59";

        await patchDailyLog(env, token, dateStr, empId, userEntry.name, 'LOGOUT', timeStr, logoutTs);
        await updateRealtimeDb(env, token, {
           subjectId: empId,
           subjectName: userEntry.name,
           name: userEntry.name,
           action: 'LOGOUT',
           timestamp: logoutTs,
           source: 'AUTO_SYSTEM_CRON'
        });
      }
    }
  } catch (e) {}
}

async function handlePurge(req: Request, env: Env) {
  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const { startTs, endTs } = body;

  const token = await getToken(env);
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;

  let docs = [];
  if (startTs && endTs) {
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
    const query = {
      structuredQuery: {
        from: [{ collectionId: DAILY_LOGS_COL }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              { fieldFilter: { field: { fieldPath: 'dateTs' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(startTs) } } },
              { fieldFilter: { field: { fieldPath: 'dateTs' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(endTs) } } }
            ]
          }
        }
      }
    };
    const res = await fetch(queryUrl, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
    const data: any = await res.json();
    docs = (data || []).filter((d: any) => d.document).map((d: any) => d.document);
  } else {
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${DAILY_LOGS_COL}`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
    const data: any = await res.json();
    docs = data.documents || [];
  }

  if (docs.length === 0) return new Response(JSON.stringify({ success: true, count: 0 }), { headers: CORS_HEADERS });

  const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const writes = docs.map((d: any) => ({ delete: d.name }));

  await fetch(commitUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });

  return new Response(JSON.stringify({ success: true, count: docs.length }), { headers: CORS_HEADERS });
}

async function handleDeleteLogs(req: Request, env: Env) {
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { headers: CORS_HEADERS }); }
  const { logIds } = body;
  if (!logIds || !Array.isArray(logIds)) return new Response(JSON.stringify({ success: false, error: 'logIds array required' }), { headers: CORS_HEADERS });

  let token = await getToken(env);
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;

  const deletionsByDate: Record<string, string[]> = {};
  logIds.forEach(id => {
    const parts = id.split('_');
    if (parts.length < 3) return;
    const userId = parts[0];
    const type = parts[1];
    const dateStr = parts.slice(2).join('_');
    if (!deletionsByDate[dateStr]) deletionsByDate[dateStr] = [];
    deletionsByDate[dateStr].push(`users.${userId}.${type}`);
    deletionsByDate[dateStr].push(`users.${userId}.${type}Ts`);
  });

  for (const [dateStr, paths] of Object.entries(deletionsByDate)) {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${DAILY_LOGS_COL}/${encodeURIComponent(dateStr)}`;
    const updateMask = paths.map(p => `updateMask.fieldPaths=${p}`).join('&');
    const url = `${docUrl}?${updateMask}`;

    await fetch(url, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: {} })
    });
  }

  return new Response(JSON.stringify({ success: true, count: logIds.length }), { headers: CORS_HEADERS });
}

async function handleSeed(req: Request, env: Env) {
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), { headers: CORS_HEADERS }); }
  const { logs } = body;
  if (!logs || !Array.isArray(logs)) return new Response(JSON.stringify({ success: false, error: 'Logs array required' }), { headers: CORS_HEADERS });

  let token = await getToken(env);

  const logsByDate: Record<string, any[]> = {};
  logs.forEach(l => {
    if (!logsByDate[l.date]) logsByDate[l.date] = [];
    logsByDate[l.date].push(l);
  });

  for (const [dateStr, dayLogs] of Object.entries(logsByDate)) {
    await patchDailyLogMulti(env, token, dateStr, dayLogs);
  }

  return new Response(JSON.stringify({ success: true, count: logs.length }), { headers: CORS_HEADERS });
}

// --- HELPERS ---

async function getDailyLog(env: Env, token: string, dateStr: string) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${DAILY_LOGS_COL}/${encodeURIComponent(dateStr)}`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return null;
  return parseFirestoreDoc(await res.json());
}

async function patchDailyLog(env: Env, token: string, dateStr: string, empId: string, empName: string, action: string, timeStr: string, ts: number) {
  await patchDailyLogMulti(env, token, dateStr, [{ subjectId: empId, subjectName: empName, action, timestamp: ts }]);
}

async function patchDailyLogMulti(env: Env, token: string, dateStr: string, logs: any[]) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const docUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${DAILY_LOGS_COL}/${encodeURIComponent(dateStr)}`;

  const ts = logs[0].timestamp;
  const startOfDay = new Date(ts);
  startOfDay.setUTCHours(0,0,0,0);
  const dateTs = startOfDay.getTime();

  const userFields: any = {};
  const paths = ['date', 'dateTs'];

  logs.forEach(log => {
    const empId = log.subjectId;
    const action = log.action;
    const timeStr = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Harare', hour12: false }).format(new Date(log.timestamp));

    if (!userFields[empId]) userFields[empId] = { mapValue: { fields: { name: { stringValue: log.subjectName } } } };

    const fields = userFields[empId].mapValue.fields;
    if (action === 'LOGIN') {
      fields['login'] = { stringValue: timeStr };
      fields['loginTs'] = { integerValue: log.timestamp };
      paths.push(`users.${empId}.login`, `users.${empId}.loginTs`);
    } else {
      fields['logout'] = { stringValue: timeStr };
      fields['logoutTs'] = { integerValue: log.timestamp };
      paths.push(`users.${empId}.logout`, `users.${empId}.logoutTs`);
    }
    paths.push(`users.${empId}.name`);
  });

  const body = {
    fields: {
      date: { stringValue: dateStr },
      dateTs: { integerValue: dateTs },
      users: {
        mapValue: {
          fields: userFields
        }
      }
    }
  };

  const updateMask = [...new Set(paths)].map(p => `updateMask.fieldPaths=${p}`).join('&');
  const url = `${docUrl}?${updateMask}`;

  await fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function getSystemSettings(env: Env, token: string) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/system`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return null;
  return parseFirestoreDoc(await res.json());
}

async function createDocument(env: Env, token: string, collection: string, data: any) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFirestoreFields(data) })
  });
}

async function updateRealtimeDb(env: Env, token: string, data: any) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const rtdbUrl = `https://${projectId}-default-rtdb.firebaseio.com/live_scans/latest.json?access_token=${token}`;
  await fetch(rtdbUrl, { method: 'PUT', body: JSON.stringify(data) });
}

function parseFirestoreDoc(doc: any) {
  if (!doc.fields) return { id: doc.name?.split('/').pop() };
  const obj: any = { id: doc.name?.split('/').pop() };

  const parseValue = (val: any): any => {
    if (val.stringValue) return val.stringValue;
    if (val.integerValue) return parseInt(val.integerValue);
    if (val.doubleValue) return parseFloat(val.doubleValue);
    if (val.booleanValue) return val.booleanValue;
    if (val.mapValue) {
      const res: any = {};
      const f = val.mapValue.fields || {};
      for (const k in f) res[k] = parseValue(f[k]);
      return res;
    }
    return null;
  };

  for (const key in doc.fields) {
    obj[key] = parseValue(doc.fields[key]);
  }
  return obj;
}

function toFirestoreFields(obj: any) {
  const fields: any = {};
  for (const key in obj) {
    const val = obj[key];
    if (val === undefined || val === null) continue;
    if (typeof val === 'string') fields[key] = { stringValue: val };
    else if (typeof val === 'number') {
      if (Number.isInteger(val)) fields[key] = { integerValue: val };
      else fields[key] = { doubleValue: val };
    }
    else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
  }
  return fields;
}
