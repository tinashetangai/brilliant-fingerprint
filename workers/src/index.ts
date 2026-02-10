
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

// This offset is used only for logical comparison in the worker (e.g. checking against shift end)
const DISPLAY_OFFSET = 0;

// Fallback Project ID from frontend config
const DEFAULT_PROJECT_ID = "brilliant-chemicals";

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
      if (request.method === 'POST' && url.pathname === '/api/admin/seed') {
        return await handleSeed(request, env);
      }
      if (request.method === 'POST' && url.pathname === '/api/admin/delete-logs') {
        return await handleDeleteLogs(request, env);
      }
      
      return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
    } catch (err: any) {
      console.error("Worker Global Error:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      return new Response(JSON.stringify({ success: false, error: `Critical Worker Failure: ${errorMsg}`, stack }), { status: 500, headers: CORS_HEADERS });
    }
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(handleAutoLogout(env));
  },
};

// --- HANDLERS ---

async function handleDeleteLogs(req: Request, env: Env) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { headers: CORS_HEADERS });
  }

  const { logIds } = body;
  if (!logIds || !Array.isArray(logIds)) {
    return new Response(JSON.stringify({ success: false, error: 'logIds array required' }), { headers: CORS_HEADERS });
  }

  if (!env.FIREBASE_PRIVATE_KEY) return new Response(JSON.stringify({ success: false, error: 'Config Error: FIREBASE_PRIVATE_KEY missing' }), { status: 500, headers: CORS_HEADERS });

  let token: string;
  try {
    token = await getToken(env);
  } catch (e: any) {
     return new Response(JSON.stringify({ success: false, error: `Auth Token Error: ${e.message}` }), { status: 500, headers: CORS_HEADERS });
  }

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;

  const writes = logIds.map((id: string) => ({
    delete: `projects/${projectId}/databases/(default)/documents/logs/${id}`
  }));

  const commitRes = await fetch(commitUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });

  if (!commitRes.ok) {
    return new Response(JSON.stringify({ success: false, error: await commitRes.text() }), { headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ success: true, count: logIds.length }), { headers: CORS_HEADERS });
}

async function handlePurge(req: Request, env: Env) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { headers: CORS_HEADERS });
  }

  const { startTs, endTs } = body;
  if (!env.FIREBASE_PRIVATE_KEY) return new Response(JSON.stringify({ success: false, error: 'Config Error: FIREBASE_PRIVATE_KEY missing' }), { status: 500, headers: CORS_HEADERS });

  let token: string;
  try {
    token = await getToken(env);
  } catch (e: any) {
     return new Response(JSON.stringify({ success: false, error: `Auth Token Error: ${e.message}` }), { status: 500, headers: CORS_HEADERS });
  }

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const queryUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;

  const query = {
    structuredQuery: {
      from: [{ collectionId: 'logs' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'timestamp' }, op: 'GREATER_THAN_OR_EQUAL', value: { integerValue: String(startTs) } } },
            { fieldFilter: { field: { fieldPath: 'timestamp' }, op: 'LESS_THAN_OR_EQUAL', value: { integerValue: String(endTs) } } }
          ]
        }
      },
      orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'ASCENDING' }],
      limit: 400
    }
  };

  const queryRes = await fetch(queryUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });

  if (!queryRes.ok) {
    return new Response(JSON.stringify({ success: false, error: await queryRes.text() }), { headers: CORS_HEADERS });
  }

  const queryData: any = await queryRes.json();
  const docs = (queryData || []).filter((d: any) => d.document);

  if (docs.length === 0) {
    return new Response(JSON.stringify({ success: true, count: 0 }), { headers: CORS_HEADERS });
  }

  const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const writes = docs.map((d: any) => ({
    delete: d.document.name
  }));

  const commitRes = await fetch(commitUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });

  if (!commitRes.ok) {
    return new Response(JSON.stringify({ success: false, error: await commitRes.text() }), { headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ success: true, count: docs.length }), { headers: CORS_HEADERS });
}

async function handleSeed(req: Request, env: Env) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { headers: CORS_HEADERS });
  }

  const { logs } = body;
  if (!logs || !Array.isArray(logs)) {
    return new Response(JSON.stringify({ success: false, error: 'Logs array required' }), { headers: CORS_HEADERS });
  }

  let token: string;
  try {
    token = await getToken(env);
  } catch (e: any) {
     return new Response(JSON.stringify({ success: false, error: `Auth Token Error: ${e.message}` }), { status: 500, headers: CORS_HEADERS });
  }

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const commitUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;

  const writes = logs.map((log: any) => {
    const docId = `seed_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const docPath = `projects/${projectId}/databases/(default)/documents/logs/${docId}`;
    const fields = toFirestoreFields(log);
    
    return {
      update: {
        name: docPath,
        fields: fields
      }
    };
  });

  const commitRes = await fetch(commitUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ writes })
  });

  if (!commitRes.ok) {
    return new Response(JSON.stringify({ success: false, error: await commitRes.text() }), { headers: CORS_HEADERS });
  }

  return new Response(JSON.stringify({ success: true, count: logs.length }), { headers: CORS_HEADERS });
}

async function handlePinAuth(req: Request, env: Env) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON body' }), { headers: CORS_HEADERS });
  }

  const { pin } = body;
  if (!pin) return new Response(JSON.stringify({ success: false, error: 'PIN is required' }), { headers: CORS_HEADERS });

  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return new Response(JSON.stringify({ success: false, error: 'Config Error' }), { status: 500, headers: CORS_HEADERS });

  let token = await getToken(env);
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'employees' }],
      where: {
        fieldFilter: { field: { fieldPath: 'pin' }, op: 'EQUAL', value: { stringValue: pin } }
      },
      limit: 1
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });

  if (!response.ok) throw new Error(`Firestore Query Failed`);
  const data: any = await response.json();
  if (!data || !data[0] || !data[0].document) return new Response(JSON.stringify({ success: false, error: 'Invalid PIN' }), { headers: CORS_HEADERS });
  return new Response(JSON.stringify({ success: true, employee: parseFirestoreDoc(data[0].document) }), { headers: CORS_HEADERS });
}

async function handleLogEntry(req: Request, env: Env) {
  let body: any;
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ success: false, error: 'Invalid body' }), { headers: CORS_HEADERS }); }
  const { pin, source = 'API' } = body;
  let token = await getToken(env);

  const nowRaw = Date.now();
  const adjustedTime = new Date(nowRaw);

  const empRes = await handlePinAuth(new Request('http://internal/api/auth/pin', { method: 'POST', body: JSON.stringify({ pin }) }), env);
  const empData: any = await empRes.json();
  if (!empData.success) return new Response(JSON.stringify({ success: false, error: 'User not found' }), { headers: CORS_HEADERS });
  const employee = empData.employee;

  let lastLog = await getLastLog(env, token, employee.id);
  let action = 'LOGIN'; 
  if (lastLog) {
    if (lastLog.action === 'LOGIN') action = 'LOGOUT';
    else if (lastLog.action === 'LOGOUT') action = 'LOGIN';
    else if (lastLog.action === 'GATE_OUT') action = 'GATE_IN';
    else if (lastLog.action === 'GATE_IN') action = 'LOGOUT';
  }

  const settings = await getSystemSettings(env, token);
  let otHours = 0;
  let isOvertime = false;
  if (action === 'LOGOUT' && settings && settings.dayEnd) {
    const dayEndParts = settings.dayEnd.split(':').map(Number);

    // Use Harare time for comparison to ensure correct overtime calculation
    const formatter = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Africa/Harare',
      hour12: false
    });

    const harareTimeStr = formatter.format(adjustedTime);
    const [h, m] = harareTimeStr.split(':').map(Number);
    const adjustedDecimal = h + (m / 60);
    const dayEndDecimal = dayEndParts[0] + (dayEndParts[1] / 60);

    if (adjustedDecimal > dayEndDecimal) {
      otHours = adjustedDecimal - dayEndDecimal;
      if (otHours >= 0.5) isOvertime = true;
    }
  }

  const logEntry = {
    subjectId: employee.id,
    subjectName: employee.name,
    timestamp: nowRaw, // Store RAW
    action: action,
    status: 'SUCCESS',
    type: 'EMPLOYEE',
    confidence: 1.0,
    source: source,
    date: new Date(nowRaw).toLocaleDateString('en-GB')
  };

  await createDocument(env, token, 'logs', logEntry);
  if (isOvertime) {
    await createDocument(env, token, 'overtime_decisions', {
      employeeId: employee.id,
      date: adjustedTime.toLocaleDateString('en-GB'),
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
    const settings = await getSystemSettings(env, token);
    if (!settings || !settings.dayEnd) return;

    const employees = await getAllEmployees(env, token);
    for (const emp of employees) {
      const lastLog = await getLastLog(env, token, emp.id);
      if (lastLog && lastLog.action === 'LOGIN') {
        // Find the dayEnd timestamp in the same day as the login, in Harare time
        const loginDate = new Date(lastLog.timestamp);
        const [endH, endM] = settings.dayEnd.split(':').map(Number);

        // This is tricky in UTC worker. Let's use a simpler approach:
        // Assume dayEnd is on the same calendar day (in Harare) as the login.
        const formatter = new Intl.DateTimeFormat('en-GB', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          timeZone: 'Africa/Harare'
        });
        const [d, m, y] = formatter.format(loginDate).split('/');

        // Harare is UTC+2
        let dayEndUTC = new Date(Date.UTC(Number(y), Number(m)-1, Number(d), endH - 2, endM)).getTime();

        // Handle night shift: if login was after dayEnd on that calendar day,
        // then the relevant dayEnd is actually the next day.
        if (lastLog.timestamp > dayEndUTC) {
          dayEndUTC += 24 * 3600 * 1000;
        }

        if (nowRaw > dayEndUTC + 3600000 * 2) { // Give a 2 hour buffer after dayEnd
           const targetRaw = dayEndUTC;
           const harareDate = formatter.format(new Date(targetRaw));
           await createDocument(env, token, 'logs', {
              subjectId: emp.id,
              subjectName: emp.name,
              timestamp: targetRaw, 
              action: 'LOGOUT',
              status: 'SUCCESS',
              type: 'EMPLOYEE',
              confidence: 1.0,
              source: 'AUTO_SYSTEM_LOGOUT',
              date: harareDate
           });
           await updateRealtimeDb(env, token, {
              subjectId: emp.id,
              subjectName: emp.name,
              name: emp.name,
              action: 'LOGOUT',
              timestamp: targetRaw
           });
        }
      }
    }
  } catch (error: any) {}
}

async function getLastLog(env: Env, token: string, employeeId: string) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const query = {
    structuredQuery: {
      from: [{ collectionId: 'logs' }],
      where: {
        compositeFilter: {
          op: 'AND',
          filters: [
            { fieldFilter: { field: { fieldPath: 'subjectId' }, op: 'EQUAL', value: { stringValue: employeeId } } },
            { fieldFilter: { field: { fieldPath: 'status' }, op: 'EQUAL', value: { stringValue: 'SUCCESS' } } }
          ]
        }
      },
      orderBy: [{ field: { fieldPath: 'timestamp' }, direction: 'DESCENDING' }],
      limit: 1
    }
  };
  const res = await fetch(url, { method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
  if (!res.ok) throw new Error(`Query failed`);
  const data: any = await res.json();
  if (data[0] && data[0].document) return parseFirestoreDoc(data[0].document);
  return null;
}

async function getAllEmployees(env: Env, token: string) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/employees?pageSize=300`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return [];
  const data: any = await res.json();
  return (data.documents || []).map((doc: any) => parseFirestoreDoc(doc));
}

async function getSystemSettings(env: Env, token: string) {
  const projectId = env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID;
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/system`;
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
  if (!res.ok) return null;
  const data: any = await res.json();
  return parseFirestoreDoc(data);
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
  const fields = doc.fields;
  const obj: any = { id: doc.name.split('/').pop() };
  if (fields) {
    for (const key in fields) {
        const val = fields[key];
        if (val.stringValue) obj[key] = val.stringValue;
        else if (val.integerValue) obj[key] = parseInt(val.integerValue);
        else if (val.doubleValue) obj[key] = parseFloat(val.doubleValue);
        else if (val.booleanValue) obj[key] = val.booleanValue;
    }
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
