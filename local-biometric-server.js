/**
=====================================================
KNOCKOUT BIOMETRIC ADMS BRIDGE
ZKTeco F22 – T&A PUSH
SIMPLIFIED TIMESTAMP LOGGER
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
KNOCKOUT MASTER BRIDGE - ACTIVE MODE : TIMESTAMP ONLY
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

            // ===== DETERMINE ACTION (LOGIN/LOGOUT) =====
            const lastLogSnap = await db.collection('logs')
                .where('subjectId', '==', employeeId)
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();

            let lastAction = 'LOGOUT';
            if (!lastLogSnap.empty) {
                lastAction = lastLogSnap.docs[0].data().action;
            }

            const action = (lastAction === 'LOGOUT') ? 'LOGIN' : 'LOGOUT';

            // ===== PREPARE LOG DATA (TIMESTAMP ONLY) =====
            const logData = {
                subjectId: employeeId,
                subjectName: emp.name,
                timestamp: now,
                action,
                status: 'SUCCESS',
                source: 'F22_HARDWARE',
                date: new Date().toLocaleDateString('en-GB')
            };

            await db.collection('logs').add(logData);

            const color = action === 'LOGIN' ? C.GREEN : C.YELLOW;
            console.log(`${color}✔ ${action} → ${emp.name}${C.RESET}`);

            // ===== REALTIME UI =====
            rtdb.ref('live_scans/latest').set({
                subjectId: employeeId,
                subjectName: emp.name,
                name: emp.name,
                action: action,
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
