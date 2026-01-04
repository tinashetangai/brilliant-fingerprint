```javascript
/**
=====================================================
KNOCKOUT BIOMETRIC ADMS BRIDGE
ZKTeco F22 – T&A PUSH
ENHANCED GATE PASS & DAILY-AWARE LOGGING
=====================================================
*/
const express = require('express');
const admin = require('firebase-admin');
const app = express();
const PORT = 80;

app.use(express.text({ type: () => true, limit: '10mb' }));

// ================= COLORS =================
const C = {
    RESET: '\x1b[0m',
    GREEN: '\x1b[32m',
    RED: '\x1b[31m',
    YELLOW: '\x1b[33m',
    CYAN: '\x1b[36m',
    MAGENTA: '\x1b[35m',
    GRAY: '\x1b[90m'
};

// ================= FIREBASE =================
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://knockout-7d62d-default-rtdb.firebaseio.com'
});

const db = admin.firestore();
const rtdb = admin.database();

// ================= STATE =================
let lastDevicePing = null;

// ================= BANNER =================
console.log(`${C.CYAN}================================================
KNOCKOUT MASTER BRIDGE - ACTIVE MODE : GATE PASS AWARE
PORT : ${PORT}
================================================${C.RESET}`);

// ================= HEARTBEAT =================
setInterval(() => {
    if (!lastDevicePing) {
        console.log(`${C.GRAY}[HEARTBEAT] Waiting for F22 device...${C.RESET}`);
    } else {
        const sec = Math.floor((Date.now() - lastDevicePing) / 1000);
        console.log(`${C.GREEN}[HEARTBEAT] Device alive (${sec}s ago)${C.RESET}`);
    }
}, 5000);

// ================= ADMS =================

// DEVICE HANDSHAKE
app.get('/iclock/cdata', (req, res) => {
    lastDevicePing = Date.now();
    const sn = req.query.SN || 'UNKNOWN';
    console.log(`${C.CYAN}--> [PING] SN=${sn}${C.RESET}`);
    res.type('text/plain').send('GET OPTION FROM: SERVER\nC:ATTLOG');
});

// ATTENDANCE PUSH
app.post('/iclock/cdata', async (req, res) => {
    if (req.query.table !== 'ATTLOG') return res.send('OK');

    console.log(`${C.YELLOW}📥 ATTLOG RECEIVED${C.RESET}`);
    const lines = (req.body || '').trim().split('\n').filter(Boolean);

    // Start of today (local time)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    for (const line of lines) {
        const parts = line.split('\t');
        const pin = parts[0];
        const now = Date.now();

        try {
            // ===== EMPLOYEE LOOKUP =====
            const snap = await db.collection('employees')
                .where('pin', '==', pin)
                .limit(1)
                .get();

            if (snap.empty) {
                console.log(`${C.RED}[UNKNOWN PIN] ${pin}${C.RESET}`);
                continue;
            }

            const empDoc = snap.docs[0];
            const emp = empDoc.data();
            const employeeId = empDoc.id;

            // Check if a gate pass was just issued
            const recentGatePass = await db.collection('gate_pass_requests')
                .where('employeeId', '==', employeeId)
                .where('status', '==', 'approved')
                .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(Date.now() - 20000)) // 20-second window
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();

            let isGateLog = !recentGatePass.empty;
            let action;
            let uiAction;

            if (isGateLog) {
                // This is a gate log, not a regular login/logout
                const lastGateLogSnap = await db.collection('gate_logs')
                    .where('employeeId', '==', employeeId)
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();

                let lastGateAction = 'GATE_IN';
                if (!lastGateLogSnap.empty) {
                    lastGateAction = lastGateLogSnap.docs[0].data().action;
                }

                action = (lastGateAction === 'GATE_IN') ? 'GATE_OUT' : 'GATE_IN';
                uiAction = action; // For realtime UI

                await db.collection('gate_logs').add({
                    employeeId,
                    employeeName: emp.name,
                    timestamp: now,
                    action,
                    date: new Date().toLocaleDateString('en-GB')
                });

                // Update the gate pass request to 'used'
                await recentGatePass.docs[0].ref.update({ status: 'used' });

                console.log(`${C.MAGENTA}✔ ${action} → ${emp.name}${C.RESET}`);

            } else {
                // This is a regular attendance log
                const lastLogSnap = await db.collection('logs')
                    .where('subjectId', '==', employeeId)
                    .orderBy('timestamp', 'desc')
                    .limit(1)
                    .get();

                let lastAction = 'LOGOUT';
                if (!lastLogSnap.empty) {
                    lastAction = lastLogSnap.docs[0].data().action;
                }

                action = (lastAction === 'LOGOUT') ? 'LOGIN' : 'LOGOUT';
                uiAction = action; // For realtime UI

                await db.collection('logs').add({
                    subjectId: employeeId,
                    subjectName: emp.name,
                    timestamp: now,
                    action,
                    status: 'SUCCESS',
                    source: 'F22_HARDWARE',
                    date: new Date().toLocaleDateString('en-GB')
                });

                const color = action === 'LOGIN' ? C.GREEN : C.YELLOW;
                console.log(`${color}✔ ${action} → ${emp.name}${C.RESET}`);
            }

            // ===== REALTIME UI =====
            rtdb.ref('live_scans/latest').set({
                subjectId: employeeId,
                subjectName: emp.name,
                name: emp.name,
                action: uiAction,
                timestamp: now
            });

        } catch (err) {
            console.error(`${C.RED}[ERROR] ${err.message}${C.RESET}`);
        }
    }

    res.send('OK');
});

// REQUIRED ADMS ENDPOINTS
app.get('/iclock/getrequest', (req, res) => res.type('text/plain').send('OK'));
app.post('/iclock/registry', (req, res) => res.send('OK'));
app.post('/iclock/devicecmd', (req, res) => res.send('OK'));
app.use((req, res) => res.send('OK'));

// ================= START =================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`${C.GREEN}✔ ADMS Bridge listening on port ${PORT}${C.RESET}`);
});
```
