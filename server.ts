
import express from 'express';
import * as admin from 'firebase-admin';

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
    databaseURL: 'https://brilliant-chemicals-default-rtdb.firebaseio.com'
});

const db = admin.firestore();
const rtdb = admin.database();

// ================= STATE =================
let lastDevicePing = null;
let employeeCache = new Map<string, any>();

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

// ================= EMPLOYEE CACHE =================
const loadEmployeeCache = () => {
    db.collection('employees').onSnapshot(snapshot => {
        const newCache = new Map<string, any>();
        snapshot.forEach(doc => {
            newCache.set(doc.data().pin, { id: doc.id, ...doc.data() });
        });
        employeeCache = newCache;
        console.log(`${C.GREEN}✔ Employee cache updated with ${employeeCache.size} entries.${C.RESET}`);
    }, error => {
        console.error(`${C.RED}[ERROR] Failed to listen for employee updates: ${error.message}${C.RESET}`);
    });
};

loadEmployeeCache();

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
            const emp = employeeCache.get(pin);

            if (!emp) {
                console.log(`${C.RED}[UNKNOWN PIN] ${pin}${C.RESET}`);
                continue;
            }

            // ===== REALTIME UI =====
            // PUSH A NEUTRAL SCAN EVENT
            rtdb.ref('live_scans/latest').set({
                subjectId: emp.id,
                subjectName: emp.name,
                name: emp.name,
                action: 'SCAN', // Neutral action
                timestamp: now
            });

            console.log(`${C.GREEN}✔ SCAN → ${emp.name}${C.RESET}`);

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
